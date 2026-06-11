package com.trafficflow.behavior;

import com.trafficflow.model.VehicleType;

/**
 * Intelligent Driver Model (IDM) longitudinal acceleration.
 *
 * <p>The IDM guarantees a collision-free following distance: as the bumper-to-bumper gap to
 * the leader approaches the desired minimum gap {@code s*}, the interaction term grows without
 * bound and acceleration becomes strongly negative, so a well-behaved vehicle never closes
 * inside its safe distance. With no leader, the vehicle simply accelerates toward its desired
 * speed.
 *
 * <pre>
 *   sStar = s0 + max(0, v*T + v*dv / (2*sqrt(a*b)))
 *   accel = a * (1 - (v/v0)^delta - (sStar / gap)^2)
 * </pre>
 */
public final class CarFollowingModel {

    /** Minimum standstill bumper-to-bumper gap (meters). Generous so queued cars read clearly
     *  apart on screen instead of bunching nose-to-tail. */
    public static final double MIN_GAP = 3.5;
    /** Desired time headway (seconds). */
    public static final double HEADWAY = 1.6;
    /** Free-acceleration exponent. */
    public static final double DELTA = 4.0;
    /** Hard floor on acceleration to bound emergency braking (m/s^2). */
    public static final double MAX_BRAKE = 9.0;

    private CarFollowingModel() {
    }

    /**
     * @param v     current speed (m/s)
     * @param v0    desired speed (m/s), typically the vehicle's max speed
     * @param dv    closing speed to the leader (v - vLeader); positive when approaching
     * @param gap   bumper-to-bumper distance to the leader (meters);
     *              {@link Double#POSITIVE_INFINITY} when there is no leader
     * @param type  the vehicle type (supplies max accel / comfortable decel)
     * @return longitudinal acceleration (m/s^2), clamped to [-MAX_BRAKE, maxAccel]
     */
    public static double accel(double v, double v0, double dv, double gap, VehicleType type) {
        double a = type.maxAccel();
        double b = type.comfortDecel();
        double desiredSpeed = Math.max(0.1, v0);

        double free = 1.0 - Math.pow(v / desiredSpeed, DELTA);

        double interaction = 0.0;
        if (Double.isFinite(gap)) {
            double safeGap = Math.max(0.05, gap);
            double sStar = MIN_GAP + Math.max(0.0, v * HEADWAY + (v * dv) / (2.0 * Math.sqrt(a * b)));
            double ratio = sStar / safeGap;
            interaction = ratio * ratio;
        }

        double accel = a * (free - interaction);
        if (accel < -MAX_BRAKE) {
            accel = -MAX_BRAKE;
        }
        if (accel > a) {
            accel = a;
        }
        return accel;
    }
}
