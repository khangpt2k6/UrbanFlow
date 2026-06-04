package com.trafficflow.stats;

import com.trafficflow.engine.VehicleState;
import com.trafficflow.model.SimulationStats;
import com.trafficflow.model.VehicleType;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Rolls up the live vehicle states and engine counters into an immutable {@link SimulationStats}
 * a few times a second. Throughput and the headline updates/sec are measured over the real time
 * between samples (wall clock), so the reported figures reflect what actually happened. Runs on
 * the dedicated stats thread; the result is published through an {@link AtomicReference}.
 */
@Component
public class StatsAggregator {

    /** Immutable inputs handed to the aggregator each sample. */
    public record Input(List<VehicleState> states,
                        long clearedTotal,
                        long updatesProcessed,
                        long collisions,
                        double simTimeMs,
                        long tickId,
                        boolean paused,
                        int activeThreads) {}

    private final AtomicReference<SimulationStats> latest =
            new AtomicReference<>(SimulationStats.empty(0));

    private long lastSampleNanos = 0;
    private long lastUpdates = 0;
    private long lastCleared = 0;
    private boolean primed = false;
    private volatile boolean resetPending = false;

    public SimulationStats latest() {
        return latest.get();
    }

    public SimulationStats sample(Input in) {
        if (resetPending) {
            // Rate tracking is reset on the stats thread (here), not by the caller, so the
            // primed/lastX fields are only ever mutated by one thread.
            resetPending = false;
            primed = false;
            lastUpdates = 0;
            lastCleared = 0;
        }
        long now = System.nanoTime();
        double updatesPerSecond = 0;
        double throughputPerMin = 0;
        if (primed) {
            double elapsedSec = (now - lastSampleNanos) / 1_000_000_000.0;
            if (elapsedSec > 1e-6) {
                updatesPerSecond = (in.updatesProcessed() - lastUpdates) / elapsedSec;
                throughputPerMin = (in.clearedTotal() - lastCleared) / elapsedSec * 60.0;
            }
        }
        primed = true;
        lastSampleNanos = now;
        lastUpdates = in.updatesProcessed();
        lastCleared = in.clearedTotal();

        Map<String, Integer> perType = new LinkedHashMap<>();
        for (VehicleType t : VehicleType.values()) {
            perType.put(t.label(), 0);
        }
        double speedSum = 0;
        for (VehicleState s : in.states()) {
            perType.merge(s.type().label(), 1, Integer::sum);
            speedSum += s.v();
        }
        int count = in.states().size();
        double avgSpeed = count == 0 ? 0 : speedSum / count;

        SimulationStats stats = new SimulationStats(
                count,
                perType,
                in.clearedTotal(),
                throughputPerMin,
                avgSpeed,
                updatesPerSecond,
                in.activeThreads(),
                in.collisions(),
                in.simTimeMs(),
                in.tickId(),
                in.paused());
        latest.set(stats);
        return stats;
    }

    /** Requests a rate-tracking reset; applied on the next {@link #sample(Input)} call. */
    public void reset() {
        resetPending = true;
        latest.set(SimulationStats.empty(latest.get().activeThreads()));
    }
}
