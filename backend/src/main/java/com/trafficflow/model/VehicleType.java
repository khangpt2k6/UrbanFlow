package com.trafficflow.model;

import java.util.Arrays;
import java.util.List;

/**
 * The nine vehicle types, each with distinct physical and behavioral parameters.
 * Speeds are in meters/second, accelerations in m/s^2, lengths in meters.
 *
 * <p>The frontend mirrors {@link #colorHex} and {@link #label} for rendering; the ordinal
 * is the wire identifier sent in each {@code VehicleView}.
 */
public enum VehicleType {
    //         label          len   vMax  accel  decel  color      emergency
    BICYCLE   ("Bicycle",     1.8,   6.0,  1.0,   2.0,  "#34d399", false),
    MOTORCYCLE("Motorcycle",  2.2,  16.0,  3.5,   4.0,  "#f472b6", false),
    CAR       ("Car",         4.5,  13.9,  2.5,   3.0,  "#60a5fa", false),
    SUV       ("SUV",         4.9,  13.0,  2.2,   2.8,  "#a78bfa", false),
    VAN       ("Van",         5.5,  12.0,  1.8,   2.5,  "#fbbf24", false),
    BUS       ("Bus",        12.0,  11.0,  1.2,   2.0,  "#fb923c", false),
    TRUCK     ("Truck",      16.5,  10.0,  1.0,   1.8,  "#94a3b8", false),
    AMBULANCE ("Ambulance",   6.0,  18.0,  3.0,   3.5,  "#ef4444", true),
    FIRETRUCK ("Fire Truck", 10.0,  15.0,  1.6,   2.5,  "#dc2626", true);

    private final String label;
    private final double lengthM;
    private final double maxSpeedMps;
    private final double maxAccel;
    private final double comfortDecel;
    private final String colorHex;
    private final boolean emergency;

    VehicleType(String label, double lengthM, double maxSpeedMps,
                double maxAccel, double comfortDecel, String colorHex, boolean emergency) {
        this.label = label;
        this.lengthM = lengthM;
        this.maxSpeedMps = maxSpeedMps;
        this.maxAccel = maxAccel;
        this.comfortDecel = comfortDecel;
        this.colorHex = colorHex;
        this.emergency = emergency;
    }

    public String label() { return label; }
    public double lengthM() { return lengthM; }
    public double maxSpeedMps() { return maxSpeedMps; }
    public double maxAccel() { return maxAccel; }
    public double comfortDecel() { return comfortDecel; }
    public String colorHex() { return colorHex; }
    public boolean emergency() { return emergency; }

    /** Non-emergency types eligible for random spawning. */
    public static List<VehicleType> civilianTypes() {
        return Arrays.stream(values()).filter(t -> !t.emergency).toList();
    }
}
