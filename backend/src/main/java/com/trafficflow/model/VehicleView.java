package com.trafficflow.model;

/**
 * Compact, immutable render record for a single vehicle, sent to the browser each tick.
 * Field names are short to keep the 30 Hz payload small: type ordinal, front-bumper world x/y
 * (meters), heading (radians), speed (m/s), emergency flag, and rear-bumper world rx/ry.
 *
 * <p>Sending both bumpers lets the client draw the body along the front-to-rear chord, so long
 * vehicles bend with the lane path through turns instead of sticking out as a straight bar.
 */
public record VehicleView(int id, int t, double x, double y, double h, double v, boolean emer,
                          double rx, double ry) {
}
