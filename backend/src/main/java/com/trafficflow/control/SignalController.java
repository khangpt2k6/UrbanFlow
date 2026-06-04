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

    private final SimulationControls controls;
    private final List<GreenGroup> ring;
    private final AtomicReference<Approach> preemptRequest = new AtomicReference<>(null);
    private final AtomicReference<SignalState> state;

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

    /** Request/clear emergency preemption for an approach (null clears it). Thread-safe. */
    public void requestPreempt(Approach approach) {
        preemptRequest.set(approach);
    }

    public Approach preemptApproach() {
        return preemptRequest.get();
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

        // Responsiveness: if an emergency is waiting and we are in a normal green, end the
        // green now. The transition still passes through yellow + all-red for safety.
        boolean emergencyWaiting = preemptRequest.get() != null && !current.preempt();
        if (sub == Sub.GREEN && emergencyWaiting) {
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
        ringIndex = (ringIndex + 1) % ring.size();
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
