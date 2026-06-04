package com.trafficflow.behavior;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KinematicsTest {

    @Test
    void acceleratesAndAdvances() {
        Kinematics.Step s = Kinematics.advance(10.0, 2.0, 0.1, 30.0);
        assertEquals(10.2, s.newSpeed(), 1e-9);
        assertTrue(s.distance() > 0);
    }

    @Test
    void clampsToMaxSpeed() {
        Kinematics.Step s = Kinematics.advance(29.5, 10.0, 0.1, 30.0);
        assertEquals(30.0, s.newSpeed(), 1e-9);
    }

    @Test
    void neverReversesWhenBraking() {
        Kinematics.Step s = Kinematics.advance(0.5, -9.0, 0.1, 30.0);
        assertEquals(0.0, s.newSpeed(), 1e-9, "speed clamps at zero, never negative");
        assertTrue(s.distance() >= 0, "distance is never negative");
    }
}
