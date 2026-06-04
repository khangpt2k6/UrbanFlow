package com.trafficflow.geometry;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the geometry of a single 4-way intersection with 24 lanes
 * (4 approaches x [3 inbound + 3 outbound]).
 *
 * <p>Coordinate frame: meters, origin at the intersection center, +x East, +y North.
 * Right-hand traffic. For each approach, inbound lanes are ordered LEFT, THROUGH, RIGHT
 * from the centerline outward; a vehicle's full route (inbound straight -> curve through the
 * box -> outbound straight) is baked into one {@link LanePath} per (approach, movement).
 *
 * <p>The stop line for every lane is at arc length {@code approachLength}; the box exit is at
 * {@code path.length() - approachLength}. Each outbound lane is the destination of exactly one
 * inbound movement, so vehicles never merge at the exit.
 */
public final class IntersectionLayout {

    private static final int BEZIER_SAMPLES = 12;

    private final double approachLength;
    private final double laneWidth;
    private final double half; // half-width of the intersection box
    private final Map<LaneId, LanePath> inboundPaths = new LinkedHashMap<>();

    public IntersectionLayout(SimulationProperties props) {
        this.approachLength = props.getApproachLengthM();
        this.laneWidth = props.getLaneWidthM();
        this.half = props.getIntersectionHalfM();
        build();
    }

    private void build() {
        for (Approach approach : Approach.values()) {
            for (Movement movement : Movement.values()) {
                inboundPaths.put(new LaneId(approach, movement), buildPath(approach, movement));
            }
        }
    }

    private LanePath buildPath(Approach approach, Movement movement) {
        Vec2 forward = inboundForward(approach);
        Vec2 right = rightOf(forward);
        int inIdx = laneIndexFor(movement);          // LEFT=0, THROUGH=1, RIGHT=2 from centerline
        double inOff = (inIdx + 0.5) * laneWidth;

        // Inbound straight: far edge -> stop line, offset to the right of the centerline.
        Vec2 farStart = forward.scale(-(half + approachLength)).add(right.scale(inOff));
        Vec2 stop = forward.scale(-half).add(right.scale(inOff));

        // Destination outbound lane.
        Approach dest = approach.destinationFor(movement);
        Vec2 destFwd = inboundForward(dest);
        Vec2 destOutTravel = destFwd.scale(-1.0);     // outbound travels away from center
        Vec2 destOutRight = rightOf(destOutTravel);
        int outIdx = laneIndexFor(movement);          // LEFT->0, THROUGH->1, RIGHT->2
        double outOff = (outIdx + 0.5) * laneWidth;
        Vec2 destEntry = destFwd.scale(-half).add(destOutRight.scale(outOff));
        Vec2 destFar = destFwd.scale(-(half + approachLength)).add(destOutRight.scale(outOff));

        // Box curve from stop -> destEntry via a quadratic Bezier whose control point is the
        // intersection of the inbound and outbound tangent lines (a natural turn arc).
        Vec2 control = tangentIntersection(stop, forward, destEntry, destOutTravel);

        List<Vec2> points = new ArrayList<>();
        points.add(farStart);
        points.add(stop);
        for (int i = 1; i <= BEZIER_SAMPLES; i++) {
            double t = (double) i / BEZIER_SAMPLES;
            points.add(quadBezier(stop, control, destEntry, t));
        }
        // The last bezier sample (t=1) equals destEntry; finish with the outbound straight.
        points.add(destFar);
        return new LanePath(points);
    }

    /** Inbound travel direction (toward the center) for an approach. */
    private static Vec2 inboundForward(Approach a) {
        return switch (a) {
            case NORTH -> new Vec2(0, -1);
            case SOUTH -> new Vec2(0, 1);
            case EAST -> new Vec2(-1, 0);
            case WEST -> new Vec2(1, 0);
        };
    }

    /** Right-hand unit vector relative to a travel direction (clockwise 90 degrees). */
    private static Vec2 rightOf(Vec2 fwd) {
        return new Vec2(fwd.y(), -fwd.x());
    }

    private static int laneIndexFor(Movement m) {
        return switch (m) {
            case LEFT -> 0;
            case THROUGH -> 1;
            case RIGHT -> 2;
        };
    }

    private static Vec2 quadBezier(Vec2 p0, Vec2 c, Vec2 p1, double t) {
        double u = 1 - t;
        double x = u * u * p0.x() + 2 * u * t * c.x() + t * t * p1.x();
        double y = u * u * p0.y() + 2 * u * t * c.y() + t * t * p1.y();
        return new Vec2(x, y);
    }

    /**
     * Intersection of line (p0, dir d0) and line (p1, dir d1). When the directions are
     * near-parallel (a through movement), falls back to the midpoint so the Bezier degrades
     * to a straight line.
     */
    private static Vec2 tangentIntersection(Vec2 p0, Vec2 d0, Vec2 p1, Vec2 d1) {
        double cross = d0.x() * d1.y() - d0.y() * d1.x();
        if (Math.abs(cross) < 1e-6) {
            return p0.lerp(p1, 0.5);
        }
        Vec2 diff = p1.sub(p0);
        double t = (diff.x() * d1.y() - diff.y() * d1.x()) / cross;
        return new Vec2(p0.x() + d0.x() * t, p0.y() + d0.y() * t);
    }

    public LanePath path(LaneId laneId) {
        LanePath p = inboundPaths.get(laneId);
        if (p == null) {
            throw new IllegalArgumentException("Unknown lane: " + laneId);
        }
        return p;
    }

    public Map<LaneId, LanePath> inboundPaths() {
        return inboundPaths;
    }

    public List<LaneId> laneIds() {
        return List.copyOf(inboundPaths.keySet());
    }

    /** Vehicles halt this far back from the box edge, leaving the crosswalk clear (meters). */
    public static final double STOP_SETBACK = 6.5;

    /** Arc length of the stop line: set back from the box edge so the crosswalk stays clear. */
    public double stopLineS() {
        return approachLength - STOP_SETBACK;
    }

    /** Arc length of the intersection box edge (where conflicting paths begin). */
    public double boxEntryS() {
        return approachLength;
    }

    /** Arc length at which a vehicle on this lane has fully cleared the intersection box. */
    public double boxExitS(LaneId laneId) {
        return path(laneId).length() - approachLength;
    }

    /** Total physical lanes: 4 approaches x (3 inbound + 3 outbound). */
    public int totalLanes() {
        return Approach.values().length * 6;
    }

    public double approachLength() { return approachLength; }
    public double laneWidth() { return laneWidth; }
    public double half() { return half; }
}
