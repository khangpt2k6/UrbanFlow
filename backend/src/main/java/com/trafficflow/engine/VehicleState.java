package com.trafficflow.engine;

import com.trafficflow.model.LaneId;
import com.trafficflow.model.VehicleType;

/**
 * Immutable snapshot of one vehicle for a single tick. This is what the worker pool, the
 * emergency dispatcher, and the stats thread read: publishing a fresh immutable list each
 * commit gives every reader a consistent, race-free view of the previous tick.
 */
public record VehicleState(int id, VehicleType type, LaneId laneId, double s, double v) {

    public double length() {
        return type.lengthM();
    }
}
