package com.trafficflow.engine;

import com.trafficflow.geometry.LanePath;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.VehicleType;

/**
 * Mutable, engine-owned vehicle. Its fields ({@code s}, {@code v}) are mutated only on the
 * clock thread during the single-threaded commit phase, never concurrently. Readers consume
 * the immutable {@link VehicleState} published each tick instead.
 *
 * <p>{@code s} is the front-bumper arc position along the lane path (meters from spawn).
 */
public final class Vehicle {

    public final int id;
    public final VehicleType type;
    public final LaneId laneId;
    public final LanePath path;
    public double s;
    public double v;

    public Vehicle(int id, VehicleType type, LaneId laneId, LanePath path, double s, double v) {
        this.id = id;
        this.type = type;
        this.laneId = laneId;
        this.path = path;
        this.s = s;
        this.v = v;
    }

    public boolean emergency() {
        return type.emergency();
    }

    public VehicleState toState() {
        return new VehicleState(id, type, laneId, s, v);
    }
}
