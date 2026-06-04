package com.trafficflow.model;

/**
 * One of the four legs of the intersection. Vehicles enter the intersection travelling
 * <em>inbound</em> from an approach toward the center.
 *
 * <p>Geometry convention (meters, origin at intersection center, +x East, +y North):
 * a vehicle inbound on the NORTH approach starts at large +y and travels southward (-y).
 */
public enum Approach {
    NORTH(Axis.NS),
    SOUTH(Axis.NS),
    EAST(Axis.EW),
    WEST(Axis.EW);

    private final Axis axis;

    Approach(Axis axis) {
        this.axis = axis;
    }

    public Axis axis() {
        return axis;
    }

    /** The approach directly across the intersection (opposing through traffic). */
    public Approach opposite() {
        return switch (this) {
            case NORTH -> SOUTH;
            case SOUTH -> NORTH;
            case EAST -> WEST;
            case WEST -> EAST;
        };
    }

    /**
     * The destination approach for a given movement. A vehicle inbound on {@code this}
     * approach exits via the returned approach's OUTBOUND lanes.
     */
    public Approach destinationFor(Movement movement) {
        return switch (movement) {
            case THROUGH -> opposite();
            case LEFT -> leftOf();
            case RIGHT -> rightOf();
        };
    }

    /** Approach to the left of an inbound driver (where a LEFT turn exits). */
    public Approach leftOf() {
        return switch (this) {
            case NORTH -> EAST;   // facing south, left is east
            case SOUTH -> WEST;
            case EAST -> SOUTH;   // facing west, left is south
            case WEST -> NORTH;
        };
    }

    /** Approach to the right of an inbound driver (where a RIGHT turn exits). */
    public Approach rightOf() {
        return switch (this) {
            case NORTH -> WEST;   // facing south, right is west
            case SOUTH -> EAST;
            case EAST -> NORTH;   // facing west, right is north
            case WEST -> SOUTH;
        };
    }
}
