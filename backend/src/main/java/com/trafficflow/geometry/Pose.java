package com.trafficflow.geometry;

/** A position plus a heading (radians, 0 = +x / East, increasing counter-clockwise). */
public record Pose(double x, double y, double headingRad) {
}
