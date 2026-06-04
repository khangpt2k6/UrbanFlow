package com.trafficflow.model;

/** Traffic-signal indication. */
public enum SignalColor {
    GREEN,
    YELLOW,
    RED;

    /** True when a vehicle is permitted to enter the intersection box. */
    public boolean isGo() {
        return this == GREEN;
    }
}
