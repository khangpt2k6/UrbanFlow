package com.trafficflow.geometry;

import java.util.List;

/**
 * A directed path a vehicle follows, expressed as a polyline of world points. Provides
 * arc-length parameterization: a vehicle's position along the lane is a single scalar
 * {@code s} in meters from the start, and {@link #poseAt(double)} maps it to a world pose.
 *
 * <p>Curved turn movements are approximated by densely sampling the arc into short segments,
 * so a single polyline represents straight approaches and turns uniformly.
 */
public final class LanePath {

    private final List<Vec2> points;
    private final double[] cumulative; // cumulative[i] = arc length from start to points[i]
    private final double totalLength;

    public LanePath(List<Vec2> points) {
        if (points.size() < 2) {
            throw new IllegalArgumentException("LanePath needs at least 2 points");
        }
        this.points = List.copyOf(points);
        this.cumulative = new double[points.size()];
        cumulative[0] = 0.0;
        for (int i = 1; i < points.size(); i++) {
            cumulative[i] = cumulative[i - 1] + points.get(i - 1).distance(points.get(i));
        }
        this.totalLength = cumulative[cumulative.length - 1];
    }

    public double length() {
        return totalLength;
    }

    /**
     * World pose at arc length {@code s} (clamped to [0, length]). Heading points along the
     * segment direction at that position.
     */
    public Pose poseAt(double s) {
        double clamped = Math.max(0.0, Math.min(totalLength, s));
        // Find the segment [i-1, i] containing `clamped`.
        int i = 1;
        while (i < cumulative.length && cumulative[i] < clamped) {
            i++;
        }
        if (i >= cumulative.length) {
            i = cumulative.length - 1;
        }
        Vec2 a = points.get(i - 1);
        Vec2 b = points.get(i);
        double segLen = cumulative[i] - cumulative[i - 1];
        double t = segLen <= 1e-9 ? 0.0 : (clamped - cumulative[i - 1]) / segLen;
        Vec2 p = a.lerp(b, t);
        double heading = Math.atan2(b.y() - a.y(), b.x() - a.x());
        return new Pose(p.x(), p.y(), heading);
    }

    public Vec2 start() {
        return points.get(0);
    }

    public Vec2 end() {
        return points.get(points.size() - 1);
    }

    public List<Vec2> points() {
        return points;
    }
}
