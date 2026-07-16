package com.trafficflow.model;

import java.util.List;

/**
 * Immutable snapshot of the entire world at one tick. This is the single object handed off
 * between the simulation's commit phase and every reader (worker pool, controllers, broadcaster):
 * publishing a fresh immutable instance provides the happens-before guarantee that makes the
 * architecture race-free.
 */
public record WorldSnapshot(long tickId,
                            double simTimeMs,
                            List<VehicleView> vehicles,
                            List<PedestrianView> pedestrians,
                            SignalState signals,
                            SimulationStats stats) {

    public WorldSnapshot {
        vehicles = List.copyOf(vehicles);
        pedestrians = List.copyOf(pedestrians);
    }
}
