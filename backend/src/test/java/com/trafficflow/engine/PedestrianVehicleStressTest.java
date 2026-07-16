package com.trafficflow.engine;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.config.ThreadPoolConfig;
import com.trafficflow.control.EmergencyDispatcher;
import com.trafficflow.control.SignalController;
import com.trafficflow.control.SimulationControls;
import com.trafficflow.control.VehicleSpawner;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.model.PedestrianView;
import com.trafficflow.model.SimulationStats;
import com.trafficflow.model.WorldSnapshot;
import com.trafficflow.safety.SafetyMonitor;
import com.trafficflow.stats.StatsAggregator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The worst case for the walkers: maximum vehicle density (120) with pedestrians live. Runs the
 * full deterministic loop for thousands of steps and asserts the collision invariant - which
 * covers vehicle-vehicle, box conflicts AND vehicle-pedestrian contact - never trips, while the
 * pedestrians actually keep crossing (the safety must not come from nobody ever stepping off).
 */
class PedestrianVehicleStressTest {

    private final List<ExecutorService> toClose = new ArrayList<>();
    private SimulationEngine engine;
    private SimulationControls controls;

    private static final class NoopPublisher implements WorldPublisher {
        public void publishWorld(WorldSnapshot s) {}
        public void publishStats(SimulationStats s) {}
        public void publishAlert(String m) {}
    }

    @BeforeEach
    void setUp() {
        SimulationProperties props = new SimulationProperties();
        IntersectionLayout layout = new IntersectionLayout(props);
        controls = new SimulationControls(props);
        SignalController signals = new SignalController(controls);
        EmergencyDispatcher dispatcher = new EmergencyDispatcher(signals, layout, props);
        VehicleSpawner spawner = new VehicleSpawner(controls);
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
                new SafetyMonitor(), new StatsAggregator(), tpc, new NoopPublisher(),
                workerPool, a, b, c, d, e, bcast);
    }

    @AfterEach
    void tearDown() {
        toClose.forEach(ExecutorService::shutdownNow);
    }

    @Test
    void zeroContactAtFullDensityWhilePedestriansKeepCrossing() {
        controls.setTargetVehicles(120);
        int crossingObservations = 0;
        int crossingSteps = 0;
        for (int i = 0; i < 6000; i++) {
            engine.runDeterministic(1);
            boolean any = false;
            for (PedestrianView p : engine.currentPedestrians()) {
                if (p.crossing()) {
                    crossingObservations++;
                    any = true;
                }
            }
            if (any) {
                crossingSteps++;
            }
        }
        assertEquals(0, engine.collisions(),
                "no vehicle may ever touch another vehicle OR a pedestrian");
        assertTrue(engine.vehicleCount() > 80,
                "the road should be saturated, was " + engine.vehicleCount());
        assertTrue(crossingSteps > 100,
                "pedestrians must actually keep crossing under full traffic, crossed on "
                        + crossingSteps + " steps (" + crossingObservations + " observations)");
    }
}
