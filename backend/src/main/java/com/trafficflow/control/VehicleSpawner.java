package com.trafficflow.control;

import org.springframework.stereotype.Component;

/**
 * Density manager. Each cycle it compares the live vehicle count against the target and reports
 * how many civilian spawn requests to enqueue (rate-limited so density ramps smoothly rather
 * than appearing all at once). The actual insertion, including the safe-gap check at the spawn
 * point, is performed by the engine on the clock thread.
 */
@Component
public class VehicleSpawner {

    /** Max civilian spawn requests issued per cycle, so traffic builds gradually. */
    public static final int MAX_PER_CYCLE = 4;

    private final SimulationControls controls;

    public VehicleSpawner(SimulationControls controls) {
        this.controls = controls;
    }

    public int spawnCount(int currentCount) {
        int deficit = controls.getTargetVehicles() - currentCount;
        if (deficit <= 0) {
            return 0;
        }
        return Math.min(deficit, MAX_PER_CYCLE);
    }
}
