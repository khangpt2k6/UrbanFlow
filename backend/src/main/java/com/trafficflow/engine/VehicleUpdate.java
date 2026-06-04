package com.trafficflow.engine;

/**
 * The result the worker pool computes for one vehicle during the parallel plan phase: the
 * vehicle's next position and speed. Applied to the mutable {@link Vehicle} during commit.
 */
public record VehicleUpdate(int id, double newS, double newV) {
}
