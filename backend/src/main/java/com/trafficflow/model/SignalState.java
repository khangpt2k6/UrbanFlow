package com.trafficflow.model;

import java.util.EnumMap;
import java.util.Map;

/**
 * Immutable snapshot of the traffic signals. {@code through} holds the indication that
 * governs THROUGH and RIGHT movements for each approach; {@code left} holds the protected
 * left-turn indication. {@code phase} is a human-readable label for the current ring phase.
 */
public record SignalState(String phase,
                          Map<Approach, SignalColor> through,
                          Map<Approach, SignalColor> left) {

    public SignalState {
        through = new EnumMap<>(through);
        left = new EnumMap<>(left);
    }

    public SignalColor colorFor(Approach approach, Movement movement) {
        return movement == Movement.LEFT ? left.get(approach) : through.get(approach);
    }

    /** Convenience builder: every indication RED. */
    public static SignalState allRed(String phase) {
        Map<Approach, SignalColor> t = new EnumMap<>(Approach.class);
        Map<Approach, SignalColor> l = new EnumMap<>(Approach.class);
        for (Approach a : Approach.values()) {
            t.put(a, SignalColor.RED);
            l.put(a, SignalColor.RED);
        }
        return new SignalState(phase, t, l);
    }
}
