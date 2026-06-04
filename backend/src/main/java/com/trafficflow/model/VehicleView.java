package com.trafficflow.model;

/**
 * Compact, immutable render record for a single vehicle, sent to the browser each tick.
 * Field names are short to keep the 30 Hz payload small: type ordinal, world x/y (meters),
 * heading (radians), speed (m/s), emergency flag.
 */
public record VehicleView(int id, int t, double x, double y, double h, double v, boolean emer) {
}
