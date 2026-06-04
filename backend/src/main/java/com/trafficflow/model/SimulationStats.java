package com.trafficflow.model;

import java.util.Map;

/**
 * Immutable rolled-up statistics broadcast to the control panel.
 *
 * @param totalVehicles      live vehicle count
 * @param perType            count by vehicle type label
 * @param clearedTotal       vehicles that have completed their route since start/reset
 * @param throughputPerMin   vehicles cleared per minute (sliding window)
 * @param avgSpeedMps        mean speed of live vehicles
 * @param updatesPerSecond   measured vehicle-updates/sec (sliding window)
 * @param activeThreads      managed threads in the architecture
 * @param collisions         safety-invariant violations (target: 0)
 * @param simTimeMs          simulation time elapsed
 * @param tickId             current tick number
 * @param paused             whether the loop is paused
 */
public record SimulationStats(int totalVehicles,
                              Map<String, Integer> perType,
                              long clearedTotal,
                              double throughputPerMin,
                              double avgSpeedMps,
                              double updatesPerSecond,
                              int activeThreads,
                              long collisions,
                              double simTimeMs,
                              long tickId,
                              boolean paused) {

    public static SimulationStats empty(int activeThreads) {
        return new SimulationStats(0, Map.of(), 0, 0, 0, 0, activeThreads, 0, 0, 0, false);
    }
}
