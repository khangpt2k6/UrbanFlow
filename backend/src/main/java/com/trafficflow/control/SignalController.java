package com.trafficflow.control;

import com.trafficflow.model.Approach;
import com.trafficflow.model.Movement;
import com.trafficflow.model.SignalColor;
import com.trafficflow.model.SignalState;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Traffic-signal phase machine. Drives a ring of four protected green groups
 * (NS-through+right, NS-left, EW-through+right, EW-left), each separated by a yellow and an
 * all-red clearance interval. Within any green group the permitted movements never cross, and
 * every green-to-green transition passes through yellow then all-red, so two conflicting
 * movements are never simultaneously non-red. Emergency preemption serves a single approach
 * (all of its movements), which is also conflict-free.
 *
 * <p>The machine advances in <em>simulation</em> time (via {@link #stepTo(long)}), so signal
 * timing tracks the speed multiplier and freezes when paused. The current {@link SignalState}
 * is published through an {@link AtomicReference} read by the engine each tick.
 */
@Component
public class SignalController {

    private enum Sub { GREEN, YELLOW, ALL_RED }

    private record Mv(Approach approach, Movement movement) {}

    private record GreenGroup(String name, Set<Mv> green, boolean preempt) {}

    /** Minimum a protected-left green runs once entered, so a car already rolling into its turn is
     *  never stranded by an immediate gap-out. Below the fixed left-green so actuation still helps. */
    private static final double LEFT_MIN_GREEN_MS = 2500.0;

    private final SimulationControls controls;
    private final List<GreenGroup> ring;
    private final AtomicReference<Approach> preemptRequest = new AtomicReference<>(null);
    private final AtomicBoolean resetRequested = new AtomicBoolean(false);
    private final AtomicReference<SignalState> state;
    // Left-turn demand per axis, written by the engine each tick (see reportLeftDemand). Drives
    // actuation so the ring never freezes every approach at red for a left phase nobody is using.
    private final AtomicInteger nsLeftWaiting = new AtomicInteger(0);
    private final AtomicInteger ewLeftWaiting = new AtomicInteger(0);

    /** Timing the engine needs to gate box entry: time left on the current green, and the
     *  yellow+all-red clearance that follows it. */
    public record PhaseTiming(double greenRemainingSec, double clearanceSec) {}
    private final AtomicReference<PhaseTiming> timing = new AtomicReference<>(new PhaseTiming(0, 5));

    // Machine state, mutated only on the signal thread.
    private int ringIndex = 0;
    private GreenGroup current;
    private Sub sub = Sub.GREEN;
    private double subElapsedMs = 0;
    private long lastSimMs = 0;
    private boolean initialized = false;

    public SignalController(SimulationControls controls) {
        this.controls = controls;
        this.ring = List.of(
                group("NS_THROUGH", false, mv(Approach.NORTH, Movement.THROUGH), mv(Approach.NORTH, Movement.RIGHT),
                        mv(Approach.SOUTH, Movement.THROUGH), mv(Approach.SOUTH, Movement.RIGHT)),
                group("NS_LEFT", false, mv(Approach.NORTH, Movement.LEFT), mv(Approach.SOUTH, Movement.LEFT)),
                group("EW_THROUGH", false, mv(Approach.EAST, Movement.THROUGH), mv(Approach.EAST, Movement.RIGHT),
                        mv(Approach.WEST, Movement.THROUGH), mv(Approach.WEST, Movement.RIGHT)),
                group("EW_LEFT", false, mv(Approach.EAST, Movement.LEFT), mv(Approach.WEST, Movement.LEFT)));
        this.current = ring.get(0);
        this.state = new AtomicReference<>(buildState());
        this.timing.set(computeTiming());
    }

    private static Mv mv(Approach a, Movement m) {
        return new Mv(a, m);
    }

    private static GreenGroup group(String name, boolean preempt, Mv... members) {
        return new GreenGroup(name, Set.of(members), preempt);
    }

    private GreenGroup preemptGroup(Approach a) {
        return group("PREEMPT_" + a, true,
                mv(a, Movement.LEFT), mv(a, Movement.THROUGH), mv(a, Movement.RIGHT));
    }

    /** True when {@code g} is the preemption group currently serving approach {@code a}. */
    private boolean servesApproach(GreenGroup g, Approach a) {
        return a != null && g.preempt() && g.name().equals("PREEMPT_" + a);
    }

    /** Request/clear emergency preemption for an approach (null clears it). Thread-safe. */
    public void requestPreempt(Approach approach) {
        preemptRequest.set(approach);
    }

    /**
     * Ask the machine to restart from its initial phase (NS-through green, fresh clock). The flag
     * is consumed on the signal thread inside {@link #stepTo(long)} so the machine's plain fields
     * keep their single-writer ownership and never race with a world reset on the clock thread.
     */
    public void requestReset() {
        resetRequested.set(true);
    }

    public Approach preemptApproach() {
        return preemptRequest.get();
    }

    /**
     * Report how many left-turning vehicles are currently approaching each axis (within the
     * detection zone, still short of the stop line). Called by the engine each tick. This drives
     * <em>actuation</em> of the two protected-left phases:
     * <ul>
     *   <li>a left phase with zero waiting demand is skipped entirely, rather than stopping every
     *       approach for a movement nobody is making;</li>
     *   <li>a running left green gaps out (ends early) once its queue has cleared the stop line.</li>
     * </ul>
     * Safety is unaffected: skips happen only at the start of a fresh green (after an all-red), and
     * a gap-out is an ordinary green-to-yellow transition, so every green is still followed by the
     * yellow + all-red clearance and two conflicting movements are never simultaneously non-red.
     */
    public void reportLeftDemand(int nsWaiting, int ewWaiting) {
        nsLeftWaiting.set(Math.max(0, nsWaiting));
        ewLeftWaiting.set(Math.max(0, ewWaiting));
    }

    private static boolean isLeftGroup(GreenGroup g) {
        return g.name().equals("NS_LEFT") || g.name().equals("EW_LEFT");
    }

    private int leftDemand(GreenGroup g) {
        return g.name().equals("NS_LEFT") ? nsLeftWaiting.get() : ewLeftWaiting.get();
    }

    public SignalState currentState() {
        return state.get();
    }

    public PhaseTiming phaseTiming() {
        return timing.get();
    }

    private PhaseTiming computeTiming() {
        double greenRemaining = 0;
        if (sub == Sub.GREEN) {
            double dur = greenDurationMs();
            greenRemaining = dur == Double.POSITIVE_INFINITY ? 999.0 : Math.max(0.0, (dur - subElapsedMs) / 1000.0);
        }
        return new PhaseTiming(greenRemaining, controls.getYellowSeconds() + controls.getAllRedSeconds());
    }

    /**
     * Advance the machine to absolute simulation time {@code simNowMs}. Called repeatedly on
     * the signal thread; the first call only seeds the clock.
     */
    public void stepTo(long simNowMs) {
        if (resetRequested.compareAndSet(true, false)) {
            preemptRequest.set(null);
            ringIndex = 0;
            current = ring.get(0);
            sub = Sub.GREEN;
            subElapsedMs = 0;
            lastSimMs = simNowMs;
            initialized = true;
            state.set(buildState());
            timing.set(computeTiming());
            return;
        }
        if (!initialized) {
            lastSimMs = simNowMs;
            initialized = true;
            state.set(buildState());
            timing.set(computeTiming());
            return;
        }
        long delta = simNowMs - lastSimMs;
        lastSimMs = simNowMs;
        if (delta <= 0) {
            return; // paused or no sim-time elapsed
        }
        step(delta);
        state.set(buildState());
        timing.set(computeTiming());
    }

    private void step(double dtMs) {
        subElapsedMs += dtMs;

        // Responsiveness: end the current green early whenever the preemption target no longer
        // matches what is being served. The transition still passes through yellow + all-red for
        // safety, so two conflicting movements are never non-red together.
        //   - In a normal green: any waiting emergency cuts the green short to serve it.
        //   - In a preemption green: a CHANGED target (the served emergency cleared and another
        //     approach now needs priority, or preemption was cleared entirely) must also cut it
        //     short. Without this the infinite preempt-hold strands the new emergency at red while
        //     an approach with no emergency keeps the green - the classic "the ambulance is stuck
        //     at the light" bug.
        Approach req = preemptRequest.get();
        boolean mustEndGreen = current.preempt() ? !servesApproach(current, req) : req != null;
        if (sub == Sub.GREEN && mustEndGreen) {
            sub = Sub.YELLOW;
            subElapsedMs = 0;
            return;
        }

        // Actuated gap-out: a protected-left green ends as soon as its queue has cleared the stop
        // line (no left-turner still waiting on this axis), instead of holding every other approach
        // at red for the full fixed duration. A short minimum green protects a car already turning.
        if (sub == Sub.GREEN && !current.preempt() && isLeftGroup(current)
                && subElapsedMs >= LEFT_MIN_GREEN_MS && leftDemand(current) == 0) {
            sub = Sub.YELLOW;
            subElapsedMs = 0;
            return;
        }

        double dur = currentSubDurationMs();
        while (subElapsedMs >= dur) {
            subElapsedMs -= dur;
            advanceSub();
            dur = currentSubDurationMs();
            if (dur == Double.POSITIVE_INFINITY) {
                subElapsedMs = 0;
                break;
            }
        }
    }

    private void advanceSub() {
        switch (sub) {
            case GREEN -> sub = Sub.YELLOW;
            case YELLOW -> sub = Sub.ALL_RED;
            case ALL_RED -> {
                current = chooseNextGroup();
                sub = Sub.GREEN;
            }
        }
    }

    private GreenGroup chooseNextGroup() {
        Approach pre = preemptRequest.get();
        if (pre != null) {
            return preemptGroup(pre);
        }
        // Advance around the ring, skipping any protected-left phase that has no waiting left-turners:
        // running it would stop every approach for a movement nobody is making. The ring always holds
        // the two through phases, so at most a couple of hops land on a phase worth serving. A skipped
        // phase is simply never entered, so no extra yellow/all-red is spent on it.
        for (int hop = 0; hop < ring.size(); hop++) {
            ringIndex = (ringIndex + 1) % ring.size();
            GreenGroup g = ring.get(ringIndex);
            if (!isLeftGroup(g) || leftDemand(g) > 0) {
                return g;
            }
        }
        return ring.get(ringIndex);
    }

    private double currentSubDurationMs() {
        return switch (sub) {
            case YELLOW -> controls.getYellowSeconds() * 1000.0;
            case ALL_RED -> controls.getAllRedSeconds() * 1000.0;
            case GREEN -> greenDurationMs();
        };
    }

    private double greenDurationMs() {
        if (current.preempt()) {
            // Hold the emergency approach green until the dispatcher clears preemption.
            return preemptRequest.get() != null ? Double.POSITIVE_INFINITY : 0.0;
        }
        return switch (current.name()) {
            case "NS_THROUGH" -> controls.getNsGreenSeconds() * 1000.0;
            case "EW_THROUGH" -> controls.getEwGreenSeconds() * 1000.0;
            default -> controls.getLeftGreenSeconds() * 1000.0; // NS_LEFT / EW_LEFT
        };
    }

    private SignalState buildState() {
        Map<Approach, SignalColor> through = new EnumMap<>(Approach.class);
        Map<Approach, SignalColor> left = new EnumMap<>(Approach.class);
        for (Approach a : Approach.values()) {
            through.put(a, colorFor(a, Movement.THROUGH));
            left.put(a, colorFor(a, Movement.LEFT));
        }
        return new SignalState(label(), through, left);
    }

    private SignalColor colorFor(Approach a, Movement m) {
        boolean member = current.green().contains(new Mv(a, m));
        if (!member || sub == Sub.ALL_RED) {
            return SignalColor.RED;
        }
        return sub == Sub.GREEN ? SignalColor.GREEN : SignalColor.YELLOW;
    }

    private String label() {
        if (sub == Sub.ALL_RED) {
            return "ALL_RED";
        }
        return current.name() + (sub == Sub.YELLOW ? "_YELLOW" : "");
    }

    /** Exposed for tests: the permitted-movement sets of the four normal ring groups. */
    public List<String> normalGroupNames() {
        return ring.stream().map(GreenGroup::name).toList();
    }
}
