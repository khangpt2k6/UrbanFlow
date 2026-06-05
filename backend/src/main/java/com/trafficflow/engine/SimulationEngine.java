package com.trafficflow.engine;

import com.trafficflow.behavior.CarFollowingModel;
import com.trafficflow.behavior.GapAcceptance;
import com.trafficflow.behavior.Kinematics;
import com.trafficflow.behavior.RoutePlanner;
import com.trafficflow.config.SimulationProperties;
import com.trafficflow.config.ThreadPoolConfig;
import com.trafficflow.control.ControlCommand;
import com.trafficflow.control.EmergencyDispatcher;
import com.trafficflow.control.SignalController;
import com.trafficflow.control.SimulationControls;
import com.trafficflow.control.VehicleSpawner;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.geometry.LanePath;
import com.trafficflow.geometry.Pose;
import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;
import com.trafficflow.model.SignalColor;
import com.trafficflow.model.SignalState;
import com.trafficflow.model.SimulationStats;
import com.trafficflow.model.VehicleType;
import com.trafficflow.model.VehicleView;
import com.trafficflow.model.WorldSnapshot;
import com.trafficflow.safety.SafetyMonitor;
import com.trafficflow.stats.StatsAggregator;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The simulation core. A fixed-rate clock drives a three-phase tick:
 * <ol>
 *   <li><b>Plan (parallel):</b> the vehicle list is split per lane into chunks and submitted to
 *       the worker pool; each chunk computes its vehicles' next state by reading only the
 *       immutable lane slices and the current signal state. No shared mutable state is written
 *       and no locks are held, so the phase is race-free and deadlock-free by construction.</li>
 *   <li><b>Commit (single-threaded):</b> the clock thread applies the computed updates, removes
 *       cleared vehicles, and publishes a fresh immutable state list.</li>
 *   <li><b>Broadcast (async):</b> an immutable snapshot is handed to the broadcaster thread.</li>
 * </ol>
 *
 * <p>Safety is layered: the IDM produces smooth, realistic following, while a hard stop-line
 * clamp (no entry into the box on a non-green signal) and a per-leader backstop (the front
 * bumper can never pass the leader's current rear minus a margin) make red-light entry and
 * rear-end overlap impossible even under discrete-step rounding.
 *
 * <p>The clock advances physics by real elapsed time, so the simulation holds a steady
 * {@code tickHz} (times the speed multiplier) regardless of OS scheduler timer granularity.
 */
@Component
public class SimulationEngine {

    private static final Logger log = LoggerFactory.getLogger(SimulationEngine.class);

    /** Vehicles per parallel work item. */
    private static final int CHUNK = 8;
    /** Cap on physics sub-steps per scheduled tick (speed-multiplier / catch-up guard). */
    private static final int MAX_STEPS_PER_TICK = 8;
    /** Minimum front-to-leader-rear separation enforced as a hard safety backstop (meters). */
    private static final double SAFE_BACKSTOP = 0.5;
    /** Spawn entry speed cap (m/s). */
    private static final double ENTRY_SPEED = 8.0;
    /** Conservative speed used to estimate box-clearing time for the entry time-gate (m/s). */
    private static final double CLEAR_SPEED_EST = 4.5;
    /** Two cross-axis vehicles closer than this inside the box count as a conflict (meters). */
    private static final double BOX_CONFLICT_DIST = 4.0;

    private final SimulationProperties props;
    private final IntersectionLayout layout;
    private final SimulationControls controls;
    private final SignalController signalController;
    private final EmergencyDispatcher emergencyDispatcher;
    private final VehicleSpawner spawner;
    private final SafetyMonitor safetyMonitor;
    private final StatsAggregator statsAggregator;
    private final ThreadPoolConfig threadPoolConfig;
    private final WorldPublisher publisher;

    private final ExecutorService workerPool;
    private final ScheduledExecutorService simClock;
    private final ScheduledExecutorService signalExecutor;
    private final ScheduledExecutorService emergencyExecutor;
    private final ScheduledExecutorService spawnerExecutor;
    private final ScheduledExecutorService statsExecutor;
    private final ExecutorService broadcastExecutor;

    // World state: mutated ONLY on the clock thread.
    private final List<Vehicle> worldVehicles = new ArrayList<>();
    private final Random rng;
    private final double baseDt;
    private double stepAccumulator = 0;
    private long lastTickNanos = 0L;
    /** The world only advances while at least one browser is connected (set from STOMP session
     *  events). With nobody watching the simulation stays idle and the road is empty. */
    private volatile boolean clientsConnected = false;

    // Cross-thread handoffs.
    private final ConcurrentLinkedQueue<ControlCommand> commandQueue = new ConcurrentLinkedQueue<>();
    private final AtomicReference<List<VehicleState>> publishedStates =
            new AtomicReference<>(List.of());
    private final AtomicReference<WorldSnapshot> currentSnapshot = new AtomicReference<>();
    private final AtomicInteger idCounter = new AtomicInteger(0);
    private final AtomicLong tickId = new AtomicLong(0);
    private final AtomicLong simClockMs = new AtomicLong(0);
    private final AtomicLong clearedTotal = new AtomicLong(0);
    private final AtomicLong updatesProcessed = new AtomicLong(0);
    private final AtomicLong collisions = new AtomicLong(0);

    public SimulationEngine(SimulationProperties props,
                            IntersectionLayout layout,
                            SimulationControls controls,
                            SignalController signalController,
                            EmergencyDispatcher emergencyDispatcher,
                            VehicleSpawner spawner,
                            SafetyMonitor safetyMonitor,
                            StatsAggregator statsAggregator,
                            ThreadPoolConfig threadPoolConfig,
                            WorldPublisher publisher,
                            @Qualifier("workerPool") ExecutorService workerPool,
                            @Qualifier("simClock") ScheduledExecutorService simClock,
                            @Qualifier("signalExecutor") ScheduledExecutorService signalExecutor,
                            @Qualifier("emergencyExecutor") ScheduledExecutorService emergencyExecutor,
                            @Qualifier("spawnerExecutor") ScheduledExecutorService spawnerExecutor,
                            @Qualifier("statsExecutor") ScheduledExecutorService statsExecutor,
                            @Qualifier("broadcastExecutor") ExecutorService broadcastExecutor) {
        this.props = props;
        this.layout = layout;
        this.controls = controls;
        this.signalController = signalController;
        this.emergencyDispatcher = emergencyDispatcher;
        this.spawner = spawner;
        this.safetyMonitor = safetyMonitor;
        this.statsAggregator = statsAggregator;
        this.threadPoolConfig = threadPoolConfig;
        this.publisher = publisher;
        this.workerPool = workerPool;
        this.simClock = simClock;
        this.signalExecutor = signalExecutor;
        this.emergencyExecutor = emergencyExecutor;
        this.spawnerExecutor = spawnerExecutor;
        this.statsExecutor = statsExecutor;
        this.broadcastExecutor = broadcastExecutor;
        this.rng = new Random(props.getRandomSeed());
        this.baseDt = props.tickDtSeconds();
    }

    // ---------------------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------------------

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        long periodMs = Math.max(1, Math.round(1000.0 / props.getTickHz()));
        simClock.scheduleAtFixedRate(this::clockTick, 0, periodMs, TimeUnit.MILLISECONDS);
        signalExecutor.scheduleAtFixedRate(
                guard(() -> signalController.stepTo(simClockMs.get())), 0, 20, TimeUnit.MILLISECONDS);
        emergencyExecutor.scheduleAtFixedRate(guard(this::emergencyTick), 0, 50, TimeUnit.MILLISECONDS);
        spawnerExecutor.scheduleAtFixedRate(guard(this::spawnerTick), 0, 150, TimeUnit.MILLISECONDS);
        statsExecutor.scheduleAtFixedRate(guard(this::statsTick), 0, 250, TimeUnit.MILLISECONDS);
        log.info("UrbanFlow engine started: {} worker threads, {} total managed threads, {} Hz",
                props.getWorkerThreads(), threadPoolConfig.managedThreadCount(), props.getTickHz());
    }

    @PreDestroy
    public void stop() {
        simClock.shutdownNow();
        signalExecutor.shutdownNow();
        emergencyExecutor.shutdownNow();
        spawnerExecutor.shutdownNow();
        statsExecutor.shutdownNow();
        workerPool.shutdownNow();
        broadcastExecutor.shutdownNow();
    }

    private static Runnable guard(Runnable r) {
        return () -> {
            try {
                r.run();
            } catch (Throwable t) {
                log.error("scheduled task failed", t);
            }
        };
    }

    public void enqueue(ControlCommand command) {
        commandQueue.add(command);
    }

    /** Gates the whole simulation on having an audience; driven by STOMP session connect/disconnect. */
    public void setClientsConnected(boolean connected) {
        this.clientsConnected = connected;
    }

    public boolean clientsConnected() {
        return clientsConnected;
    }

    // ---------------------------------------------------------------------------------------
    // Scheduled service ticks (each on its own thread)
    // ---------------------------------------------------------------------------------------

    private void clockTick() {
        try {
            long now = System.nanoTime();
            if (lastTickNanos == 0L) {
                lastTickNanos = now;
            }
            double realElapsed = (now - lastTickNanos) / 1_000_000_000.0;
            lastTickNanos = now;

            if (!clientsConnected) {
                stepAccumulator = 0; // nobody connected: stay idle (empty road), no broadcast
                return;
            }
            // Apply queued control commands every tick - even while paused - so Stop is reversible
            // (the un-pause command must be processed while the engine is paused) and Reset / speed
            // / density changes take effect immediately. physicsStep also drains, harmlessly, when
            // running; this extra drain is what lets a paused engine ever see "setPaused(false)".
            drainCommands();
            if (controls.isPaused()) {
                broadcast(buildSnapshot());
                return;
            }
            // Decouple physics from scheduler jitter: advance by real elapsed time so the
            // simulation holds a steady tickHz (x speed) regardless of OS timer granularity.
            stepAccumulator += (realElapsed / baseDt) * controls.getSpeedMultiplier();
            int steps = 0;
            while (stepAccumulator >= 1.0 && steps < MAX_STEPS_PER_TICK) {
                physicsStep(baseDt);
                stepAccumulator -= 1.0;
                steps++;
            }
            if (stepAccumulator > MAX_STEPS_PER_TICK) {
                stepAccumulator = 0; // fell far behind; drop the backlog to avoid a spiral
            }
            broadcast(buildSnapshot());
        } catch (Throwable t) {
            log.error("clock tick failed", t);
        }
    }

    private void broadcast(WorldSnapshot snapshot) {
        broadcastExecutor.execute(() -> publisher.publishWorld(snapshot));
    }

    private void emergencyTick() {
        if (!clientsConnected || controls.isPaused()) {
            return;
        }
        String alert = emergencyDispatcher.update(publishedStates.get());
        if (alert != null) {
            publisher.publishAlert(alert);
        }
    }

    private void spawnerTick() {
        if (!clientsConnected || controls.isPaused()) {
            return; // don't accumulate vehicles while nobody is connected or while paused
        }
        int n = spawner.spawnCount(publishedStates.get().size());
        for (int i = 0; i < n; i++) {
            enqueue(new ControlCommand.SpawnCivilian());
        }
    }

    private void statsTick() {
        SimulationStats st = statsAggregator.sample(new StatsAggregator.Input(
                publishedStates.get(),
                clearedTotal.get(),
                updatesProcessed.get(),
                collisions.get(),
                simClockMs.get(),
                tickId.get(),
                controls.isPaused(),
                threadPoolConfig.managedThreadCount()));
        publisher.publishStats(st);
    }

    // ---------------------------------------------------------------------------------------
    // The physics step (plan -> commit -> publish + safety)
    // ---------------------------------------------------------------------------------------

    private void physicsStep(double dt) {
        drainCommands();
        int planned = worldVehicles.size();
        SignalState signals = signalController.currentState();
        List<LaneSlice> slices = buildLaneSlices();
        List<VehicleUpdate> updates = plan(slices, signals, dt);
        commit(updates);
        updatesProcessed.addAndGet(planned);
        simClockMs.addAndGet(Math.round(dt * 1000.0));
        tickId.incrementAndGet();

        List<VehicleState> states = snapshotStates();
        publishedStates.set(states);

        List<SafetyMonitor.Violation> violations = safetyMonitor.check(states);
        if (!violations.isEmpty()) {
            collisions.addAndGet(violations.size());
            log.warn("SAFETY VIOLATION x{} (first: {})", violations.size(), violations.get(0));
        }

        int boxConflicts = checkBoxConflicts(states);
        if (boxConflicts > 0) {
            collisions.addAndGet(boxConflicts);
            log.warn("BOX CONFLICT x{} (cross traffic met inside the intersection)", boxConflicts);
        }
    }

    /**
     * Verifies the time-gate kept the intersection clear: no two vehicles from conflicting axes
     * are simultaneously close inside the box. A non-zero count means cross traffic overlapped,
     * which must never happen.
     */
    private int checkBoxConflicts(List<VehicleState> states) {
        double boxEntry = layout.boxEntryS();
        List<double[]> inBox = new ArrayList<>(); // {x, y, axisOrdinal}
        for (VehicleState st : states) {
            double s = st.s();
            if (s >= boxEntry && s <= layout.boxExitS(st.laneId())) {
                Pose p = layout.path(st.laneId()).poseAt(s);
                inBox.add(new double[]{p.x(), p.y(), st.laneId().approach().axis().ordinal()});
            }
        }
        int conflicts = 0;
        for (int i = 0; i < inBox.size(); i++) {
            for (int j = i + 1; j < inBox.size(); j++) {
                if (inBox.get(i)[2] == inBox.get(j)[2]) {
                    continue; // same axis: paths within a green group never cross
                }
                double dx = inBox.get(i)[0] - inBox.get(j)[0];
                double dy = inBox.get(i)[1] - inBox.get(j)[1];
                if (Math.hypot(dx, dy) < BOX_CONFLICT_DIST) {
                    conflicts++;
                }
            }
        }
        return conflicts;
    }

    private void drainCommands() {
        ControlCommand c;
        while ((c = commandQueue.poll()) != null) {
            applyCommand(c);
        }
    }

    private void applyCommand(ControlCommand c) {
        if (c instanceof ControlCommand.SetSpeed s) {
            controls.setSpeedMultiplier(s.multiplier());
        } else if (c instanceof ControlCommand.SetDensity d) {
            controls.setTargetVehicles(d.targetVehicles());
        } else if (c instanceof ControlCommand.SetSignalDuration sd) {
            applySignalDuration(sd.phase(), sd.seconds());
        } else if (c instanceof ControlCommand.SpawnEmergency se) {
            spawnEmergency(se.type(), se.approach());
        } else if (c instanceof ControlCommand.SpawnCivilian) {
            spawnCivilian();
        } else if (c instanceof ControlCommand.SetPaused p) {
            controls.setPaused(p.paused());
        } else if (c instanceof ControlCommand.ResetWorld) {
            reset();
        }
    }

    private void applySignalDuration(String phase, double seconds) {
        switch (phase) {
            case "nsGreen" -> controls.setNsGreenSeconds(seconds);
            case "ewGreen" -> controls.setEwGreenSeconds(seconds);
            case "leftGreen" -> controls.setLeftGreenSeconds(seconds);
            case "yellow" -> controls.setYellowSeconds(seconds);
            case "allRed" -> controls.setAllRedSeconds(seconds);
            default -> log.warn("unknown signal phase '{}'", phase);
        }
    }

    /** Group vehicles by lane, sorted by arc position ascending (leader has the larger s). */
    private List<LaneSlice> buildLaneSlices() {
        Map<LaneId, List<Vehicle>> byLane = new LinkedHashMap<>();
        for (Vehicle v : worldVehicles) {
            byLane.computeIfAbsent(v.laneId, k -> new ArrayList<>()).add(v);
        }
        List<LaneSlice> slices = new ArrayList<>(byLane.size());
        for (Map.Entry<LaneId, List<Vehicle>> e : byLane.entrySet()) {
            List<Vehicle> lane = e.getValue();
            lane.sort((a, b) -> Double.compare(a.s, b.s));
            int n = lane.size();
            int[] ids = new int[n];
            double[] s = new double[n];
            double[] v = new double[n];
            VehicleType[] types = new VehicleType[n];
            for (int i = 0; i < n; i++) {
                Vehicle veh = lane.get(i);
                ids[i] = veh.id;
                s[i] = veh.s;
                v[i] = veh.v;
                types[i] = veh.type;
            }
            slices.add(new LaneSlice(e.getKey(), ids, s, v, types));
        }
        return slices;
    }

    private List<VehicleUpdate> plan(List<LaneSlice> slices, SignalState signals, double dt) {
        if (slices.isEmpty()) {
            return List.of();
        }
        double stopLineS = layout.stopLineS();
        SignalController.PhaseTiming timing = signalController.phaseTiming();
        double greenRemainingSec = timing.greenRemainingSec();
        double clearanceSec = timing.clearanceSec();
        List<Callable<List<VehicleUpdate>>> tasks = new ArrayList<>();
        for (LaneSlice slice : slices) {
            int n = slice.size();
            double boxExitS = layout.boxExitS(slice.laneId);
            for (int start = 0; start < n; start += CHUNK) {
                int end = Math.min(n, start + CHUNK);
                int s0 = start;
                int s1 = end;
                tasks.add(() -> planChunk(slice, s0, s1, signals, stopLineS, boxExitS,
                        greenRemainingSec, clearanceSec, dt));
            }
        }
        List<VehicleUpdate> updates = new ArrayList<>(worldVehicles.size());
        try {
            List<Future<List<VehicleUpdate>>> futures = workerPool.invokeAll(tasks);
            for (Future<List<VehicleUpdate>> f : futures) {
                updates.addAll(f.get());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("plan phase failed", e);
        }
        return updates;
    }

    /**
     * Pure, read-only computation for one chunk of a lane. Reads only the immutable slice, the
     * signal state, and constants; writes nothing shared. Safe to run on any worker thread.
     */
    private List<VehicleUpdate> planChunk(LaneSlice slice, int from, int to,
                                          SignalState signals, double stopLineS, double boxExitS,
                                          double greenRemainingSec, double clearanceSec, double dt) {
        List<VehicleUpdate> out = new ArrayList<>(to - from);
        SignalColor color = signals.colorFor(slice.laneId.approach(), slice.laneId.movement());
        for (int i = from; i < to; i++) {
            double s = slice.s[i];
            double v = slice.v[i];
            VehicleType type = slice.types[i];
            double v0 = type.maxSpeedMps();

            // Real leader (next vehicle ahead in this lane).
            boolean hasLeader = i + 1 < slice.size();
            double leaderRearNow = Double.POSITIVE_INFINITY;
            double realGap = Double.POSITIVE_INFINITY;
            double leadV = 0;
            if (hasLeader) {
                leaderRearNow = slice.s[i + 1] - slice.types[i + 1].lengthM();
                realGap = leaderRearNow - s;
                leadV = slice.v[i + 1];
            }

            // Signal: must the vehicle stop at the line this step?
            double distToStop = stopLineS - s;
            boolean mustStop = false;
            if (s < stopLineS) {
                if (color == SignalColor.RED) {
                    mustStop = true;
                } else if (color == SignalColor.YELLOW) {
                    double stopDist = (v * v) / (2.0 * type.comfortDecel());
                    mustStop = distToStop >= stopDist; // enough room -> stop, else proceed
                }
                // Time-gate ("don't block the box"): on green, enter the intersection only if the
                // vehicle can fully clear it before cross traffic gets green - that is, before the
                // current green ends plus the yellow + all-red clearance. This lets a whole queue
                // stream through during green (high throughput) while guaranteeing the box is empty
                // when the conflicting phase starts, so gridlock and cross-collisions are impossible.
                if (!mustStop && color == SignalColor.GREEN) {
                    double clearTime = (boxExitS - stopLineS) / CLEAR_SPEED_EST;
                    if (clearTime > greenRemainingSec + clearanceSec) {
                        mustStop = true; // not enough time to clear; hold at the line
                    }
                }
            }

            // Binding obstacle for the IDM (closest of leader / stop line).
            double obstacleGap = realGap;
            double obstacleV = leadV;
            if (mustStop && distToStop > 0 && distToStop < obstacleGap) {
                obstacleGap = distToStop;
                obstacleV = 0;
            }
            double dv = v - obstacleV;
            double accel = CarFollowingModel.accel(v, v0, dv, obstacleGap, type);
            Kinematics.Step step = Kinematics.advance(v, accel, dt, v0);

            // Hard safety caps: never enter the box on a stop, never pass the leader's rear.
            double cap = Double.POSITIVE_INFINITY;
            double capV = step.newSpeed();
            if (mustStop && s <= stopLineS) {
                cap = Math.min(cap, stopLineS);
                capV = 0;
            }
            if (hasLeader) {
                double leaderCap = leaderRearNow - SAFE_BACKSTOP;
                if (leaderCap < cap) {
                    cap = leaderCap;
                    capV = Math.min(step.newSpeed(), Math.max(0, leadV));
                }
            }

            double targetS = s + step.distance();
            double newS;
            double newV;
            if (targetS <= cap) {
                newS = targetS;
                newV = step.newSpeed();
            } else {
                newS = Math.max(s, cap); // never reverse
                newV = (newS <= s + 1e-9) ? 0.0 : capV;
            }
            out.add(new VehicleUpdate(slice.ids[i], newS, newV));
        }
        return out;
    }

    private void commit(List<VehicleUpdate> updates) {
        Map<Integer, VehicleUpdate> byId = new HashMap<>(updates.size() * 2);
        for (VehicleUpdate u : updates) {
            byId.put(u.id(), u);
        }
        long cleared = 0;
        for (int i = worldVehicles.size() - 1; i >= 0; i--) {
            Vehicle veh = worldVehicles.get(i);
            VehicleUpdate u = byId.get(veh.id);
            if (u != null) {
                veh.s = u.newS();
                veh.v = u.newV();
            }
            if (veh.s >= veh.path.length() - 1e-6) {
                worldVehicles.remove(i);
                cleared++;
            }
        }
        if (cleared > 0) {
            clearedTotal.addAndGet(cleared);
        }
    }

    private List<VehicleState> snapshotStates() {
        List<VehicleState> states = new ArrayList<>(worldVehicles.size());
        for (Vehicle v : worldVehicles) {
            states.add(v.toState());
        }
        return Collections.unmodifiableList(states);
    }

    private WorldSnapshot buildSnapshot() {
        List<VehicleView> views = new ArrayList<>(worldVehicles.size());
        for (Vehicle v : worldVehicles) {
            Pose p = v.path.poseAt(v.s);
            Pose rear = v.path.poseAt(Math.max(0.0, v.s - v.type.lengthM()));
            views.add(new VehicleView(v.id, v.type.ordinal(), round(p.x()), round(p.y()),
                    round(p.headingRad()), round(v.v), v.emergency(), round(rear.x()), round(rear.y())));
        }
        SignalState signals = signalController.currentState();
        SimulationStats stats = statsAggregator.latest();
        WorldSnapshot snap = new WorldSnapshot(tickId.get(), simClockMs.get(), views, signals, stats);
        currentSnapshot.set(snap);
        return snap;
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0; // millimeter / milliradian precision keeps payload small
    }

    // ---------------------------------------------------------------------------------------
    // Spawning (clock thread only)
    // ---------------------------------------------------------------------------------------

    private void spawnCivilian() {
        VehicleType type = RoutePlanner.chooseCivilianType(rng);
        // Try lanes in a random order so a spawn request rarely fails when capacity remains.
        List<LaneId> lanes = new ArrayList<>(layout.laneIds());
        Collections.shuffle(lanes, rng);
        for (LaneId lane : lanes) {
            if (trySpawn(lane, type)) {
                return;
            }
        }
    }

    private void spawnEmergency(VehicleType type, Approach approach) {
        for (Movement m : new Movement[]{Movement.THROUGH, Movement.LEFT, Movement.RIGHT}) {
            if (trySpawn(new LaneId(approach, m), type)) {
                publisher.publishAlert(type.label() + " dispatched on " + approach + " approach");
                return;
            }
        }
    }

    /** Insert a vehicle at the start of a lane if the entry point is clear. */
    private boolean trySpawn(LaneId lane, VehicleType type) {
        LanePath path = layout.path(lane);
        double minRear = Double.POSITIVE_INFINITY;
        for (Vehicle v : worldVehicles) {
            if (v.laneId.equals(lane)) {
                minRear = Math.min(minRear, v.s - v.type.lengthM());
            }
        }
        double required = CarFollowingModel.MIN_GAP + GapAcceptance.INSERT_MARGIN;
        if (minRear < required) {
            return false;
        }
        int id = idCounter.incrementAndGet();
        double v0 = Math.min(type.maxSpeedMps(), ENTRY_SPEED);
        worldVehicles.add(new Vehicle(id, type, lane, path, 0.0, v0));
        return true;
    }

    private void reset() {
        worldVehicles.clear();
        idCounter.set(0);
        tickId.set(0);
        simClockMs.set(0);
        clearedTotal.set(0);
        updatesProcessed.set(0);
        collisions.set(0);
        stepAccumulator = 0;
        publishedStates.set(List.of());
        statsAggregator.reset();
        // Restore the signal machine, emergency preemption, and live controls to their initial
        // state. Without this the signal controller keeps a stale sim-clock and freezes (its
        // delta goes negative the moment simClockMs is zeroed), so the lights die and traffic
        // piles up at dead reds; resetToDefaults() also clears any lingering pause.
        controls.resetToDefaults();
        signalController.requestReset();
        emergencyDispatcher.reset();
    }

    // ---------------------------------------------------------------------------------------
    // Test support (deterministic, single-threaded driving)
    // ---------------------------------------------------------------------------------------

    /**
     * Runs the full loop deterministically without the scheduler: spawner, physics, signals, and
     * emergency dispatch are stepped in order. Used by safety/throughput tests.
     */
    public void runDeterministic(int steps) {
        for (int i = 0; i < steps; i++) {
            int n = spawner.spawnCount(worldVehicles.size());
            for (int j = 0; j < n; j++) {
                enqueue(new ControlCommand.SpawnCivilian());
            }
            physicsStep(baseDt);
            signalController.stepTo(simClockMs.get());
            emergencyDispatcher.update(publishedStates.get());
        }
    }

    public WorldSnapshot currentSnapshot() {
        return currentSnapshot.get();
    }

    public List<VehicleState> currentStates() {
        return publishedStates.get();
    }

    public int vehicleCount() {
        return worldVehicles.size();
    }

    public long collisions() {
        return collisions.get();
    }

    public long updatesProcessed() {
        return updatesProcessed.get();
    }

    public long clearedTotal() {
        return clearedTotal.get();
    }

    public long simTimeMs() {
        return simClockMs.get();
    }

    public long tickId() {
        return tickId.get();
    }

    // ---------------------------------------------------------------------------------------

    /** Immutable per-lane slice of vehicle state for the parallel plan phase. */
    private static final class LaneSlice {
        final LaneId laneId;
        final int[] ids;
        final double[] s;
        final double[] v;
        final VehicleType[] types;

        LaneSlice(LaneId laneId, int[] ids, double[] s, double[] v, VehicleType[] types) {
            this.laneId = laneId;
            this.ids = ids;
            this.s = s;
            this.v = v;
            this.types = types;
        }

        int size() {
            return ids.length;
        }
    }
}
