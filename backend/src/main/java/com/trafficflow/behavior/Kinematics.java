package com.trafficflow.behavior;

/**
 * Point-mass longitudinal integration along a lane. Velocity is clamped to [0, vMax] so a
 * vehicle never reverses or exceeds its top speed, and distance travelled is the trapezoidal
 * average velocity times dt (never negative), which keeps the discrete step consistent with
 * the car-following model.
 */
public final class Kinematics {

    private Kinematics() {
    }

    /** Result of advancing one fixed timestep: the new speed and the distance covered. */
    public record Step(double newSpeed, double distance) {
    }

    public static Step advance(double v, double accel, double dt, double vMax) {
        double newV = v + accel * dt;
        if (newV < 0) {
            newV = 0;
        } else if (newV > vMax) {
            newV = vMax;
        }
        double distance = (v + newV) * 0.5 * dt;
        if (distance < 0) {
            distance = 0;
        }
        return new Step(newV, distance);
    }
}
