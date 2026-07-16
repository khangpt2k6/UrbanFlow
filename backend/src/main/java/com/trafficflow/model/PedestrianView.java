package com.trafficflow.model;

/**
 * Compact, immutable render record for a single pedestrian, sent to the browser each tick.
 * Field names are short to keep the 30 Hz payload small: world x/y (meters), unit facing
 * direction fx/fy, a stable palette index c, and whether the walker is on a carriageway
 * (crossing) right now.
 */
public record PedestrianView(int id, double x, double y, double fx, double fy, int c,
                             boolean crossing) {
}
