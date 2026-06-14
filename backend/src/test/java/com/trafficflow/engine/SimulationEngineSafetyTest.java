package com.trafficflow.engine;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.config.ThreadPoolConfig;
import com.trafficflow.control.EmergencyDispatcher;
import com.trafficflow.control.SignalController;
import com.trafficflow.control.SimulationControls;
import com.trafficflow.control.VehicleSpawner;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.model.SimulationStats;
import com.trafficflow.model.WorldSnapshot;
import com.trafficflow.safety.SafetyMonitor;
import com.trafficflow.stats.StatsAggregator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Deterministic, single-threaded safety stress test. Drives the full loop (spawn, plan via the
 * real worker pool, commit, signals, emergency dispatch) for thousands of steps and asserts the
 * collision invariant never trips. Repeated to shake out ordering-dependent issues.
 */
class SimulationEngineSafetyTest {

    private final List<ExecutorService> toClose = new ArrayList<>();
    private SimulationEngine engine;

    private static final class NoopPublisher implements WorldPublisher {
        public void publishWorld(WorldSnapshot s) {}
        public void publishStats(SimulationStats s) {}
        public void publishAlert(String m) {}
    }

    @BeforeEach
    void setUp() {
        SimulationProperties props = new SimulationProperties();
        IntersectionLayout layout = new IntersectionLayout(props);
        SimulationControls controls = new SimulationControls(props);
        SignalController signals = new SignalController(controls);
        EmergencyDispatcher dispatcher = new EmergencyDispatcher(signals, layout, props);
        VehicleSpawner spawner = new VehicleSpawner(controls);
        SafetyMonitor safety = new SafetyMonitor();
        StatsAggregator stats = new StatsAggregator();
        ThreadPoolConfig tpc = new ThreadPoolConfig(props);

        ExecutorService workerPool = Executors.newFixedThreadPool(8);
        ScheduledExecutorService a = Executors.newSingleThreadScheduledExecutor();
        ScheduledExecutorService b = Executors.newSingleThreadScheduledExecutor();
        ScheduledExecutorService c = Executors.newSingleThreadScheduledExecutor();
        ScheduledExecutorService d = Executors.newSingleThreadScheduledExecutor();
        ScheduledExecutorService e = Executors.newSingleThreadScheduledExecutor();
        ExecutorService bcast = Executors.newSingleThreadExecutor();
        toClose.add(workerPool);
        toClose.add(a); toClose.add(b); toClose.add(c); toClose.add(d); toClose.add(e); toClose.add(bcast);

        engine = new SimulationEngine(props, layout, controls, signals, dispatcher, spawner,
                safety, stats, tpc, new NoopPublisher(),
                workerPool, a, b, c, d, e, bcast);
    }

    @AfterEach
    void tearDown() {
        toClose.forEach(ExecutorService::shutdownNow);
    }

    @RepeatedTest(3)
    void noCollisionsOverManySteps() {
        engine.runDeterministic(4000);
        assertEquals(0, engine.collisions(), "the safety invariant must never be violated");
        assertTrue(engine.vehicleCount() > 20, "traffic should ramp up, was " + engine.vehicleCount());
        assertTrue(engine.clearedTotal() > 0, "vehicles should clear the intersection over time");
        assertTrue(engine.updatesProcessed() > 100_000,
                "many vehicle-updates should have been processed, was " + engine.updatesProcessed());
    }

    @Test
    void reachesAndHoldsNearTargetDensity() {
        engine.runDeterministic(6000);
        int count = engine.vehicleCount();
        assertTrue(count >= 18 && count <= 60,
                "density should stabilize near the default target, was " + count);
        assertEquals(0, engine.collisions());
    }

    @Test
    void autoDispatchesEmergenciesWithoutUserInput() {
        // No manual dispatch: an ambulance or fire truck must still appear on its own over time,
        // and (like every other vehicle) must never collide.
        boolean sawEmergency = false;
        for (int i = 0; i < 2000 && !sawEmergency; i++) {
            engine.runDeterministic(1);
            for (var st : engine.currentStates()) {
                if (st.type().emergency()) {
                    sawEmergency = true;
                    break;
                }
            }
        }
        assertTrue(sawEmergency, "an emergency vehicle should be auto-dispatched within ~60s of sim time");
        assertEquals(0, engine.collisions(), "auto-dispatched emergencies must also be collision-free");
    }
}
