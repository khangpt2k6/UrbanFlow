package com.trafficflow.engine;

import com.trafficflow.control.SimulationControls;
import com.trafficflow.stats.StatsAggregator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Boots the full application so the engine runs on its real scheduled thread architecture, then
 * measures throughput under genuine concurrency. Proves there is no deadlock (the loop keeps
 * ticking), that the collision invariant holds, that ~30 threads are managed, and that the
 * engine sustains 2,100+ vehicle-updates per second.
 */
@SpringBootTest
class ConcurrencyThroughputTest {

    @Autowired
    private SimulationEngine engine;

    @Autowired
    private SimulationControls controls;

    @Autowired
    private StatsAggregator stats;

    @Test
    void sustainsTargetThroughputWithZeroCollisions() throws InterruptedException {
        controls.setTargetVehicles(80); // headroom so steady-state comfortably exceeds 2100/s

        // Warm up: density fills at a lane-entry-limited rate, so poll until it is near target
        // (with a generous deadline) rather than guessing a fixed sleep.
        long deadline = System.nanoTime() + 20_000_000_000L;
        while (engine.vehicleCount() < 78 && System.nanoTime() < deadline) {
            Thread.sleep(200);
        }

        long u0 = engine.updatesProcessed();
        long t0 = System.nanoTime();
        Thread.sleep(3000);
        long u1 = engine.updatesProcessed();
        long t1 = System.nanoTime();

        double seconds = (t1 - t0) / 1_000_000_000.0;
        double updatesPerSecond = (u1 - u0) / seconds;

        System.out.printf("Measured %.0f vehicle-updates/sec with %d vehicles, %d threads, %d collisions%n",
                updatesPerSecond, engine.vehicleCount(), stats.latest().activeThreads(), engine.collisions());

        assertEquals(0, engine.collisions(), "100% safety: no collisions");
        assertTrue(engine.vehicleCount() >= 70, "density should reach near target, was " + engine.vehicleCount());
        assertEquals(30, stats.latest().activeThreads(), "architecture should manage 30 threads");
        assertTrue(updatesPerSecond >= 2100,
                "should sustain 2100+ vehicle-updates/sec, measured " + updatesPerSecond);
    }
}
