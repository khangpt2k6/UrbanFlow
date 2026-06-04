package com.trafficflow.model;

/**
 * Identifies one of the 12 drivable inbound lanes. A vehicle stays on a single LaneId for
 * its whole journey (the route through the box and out is baked into the lane's path), so
 * two vehicles share physical space if and only if they share a LaneId. That makes LaneId
 * the natural grouping key for car-following and the per-lane safety gap check.
 */
public record LaneId(Approach approach, Movement movement) {

    @Override
    public String toString() {
        return approach + "-" + movement;
    }
}
