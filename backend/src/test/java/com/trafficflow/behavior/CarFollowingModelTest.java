package com.trafficflow.behavior;

import com.trafficflow.model.VehicleType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

class CarFollowingModelTest {

    private static final double V0 = VehicleType.CAR.maxSpeedMps();

    @Test
    void freeRoadAcceleratesFromStop() {
        double a = CarFollowingModel.accel(0, V0, 0, Double.POSITIVE_INFINITY, VehicleType.CAR);
        assertTrue(a > 0, "a vehicle at rest on an open road should accelerate, was " + a);
    }

    @Test
    void atDesiredSpeedOnOpenRoadAccelerationIsZero() {
        double a = CarFollowingModel.accel(V0, V0, 0, Double.POSITIVE_INFINITY, VehicleType.CAR);
        assertEquals(0.0, a, 1e-9, "at desired speed with no leader, acceleration should be ~0");
    }

    @Test
    void belowDesiredSpeedWithLargeGapAccelerates() {
        double a = CarFollowingModel.accel(5.0, V0, 5.0, 100.0, VehicleType.CAR);
        assertTrue(a > 0, "with a large gap and below desired speed, should accelerate, was " + a);
    }

    @Test
    void tinyGapBrakesHard() {
        double a = CarFollowingModel.accel(10.0, V0, 10.0, 1.0, VehicleType.CAR);
        assertTrue(a < -VehicleType.CAR.comfortDecel(),
                "closing on a 1m gap should brake harder than comfortable decel, was " + a);
    }

    @Test
    void fasterClosingBrakesHarder() {
        double slow = CarFollowingModel.accel(10.0, V0, 2.0, 15.0, VehicleType.CAR);
        double fast = CarFollowingModel.accel(10.0, V0, 9.0, 15.0, VehicleType.CAR);
        assertTrue(fast < slow, "closing faster should produce stronger braking");
    }

    @Test
    void accelerationNeverExceedsBrakeFloor() {
        double a = CarFollowingModel.accel(20.0, V0, 20.0, 0.1, VehicleType.TRUCK);
        assertTrue(a >= -CarFollowingModel.MAX_BRAKE - 1e-9, "braking is bounded by MAX_BRAKE");
    }

    @Test
    void shorterHeadwayAllowsCloserFollowing() {
        // A make-way / emergency vehicle uses a shorter time headway, so at the same gap and speed
        // it accelerates at least as much as the default (it tolerates following closer).
        double dflt = CarFollowingModel.accel(10.0, V0, 0.0, 12.0, VehicleType.CAR, CarFollowingModel.HEADWAY);
        double tight = CarFollowingModel.accel(10.0, V0, 0.0, 12.0, VehicleType.CAR, 1.0);
        assertTrue(tight >= dflt, "a shorter headway should not brake more than the default at the same gap");
    }

    @Test
    void shorterHeadwayStillBrakesInsideTheStandstillGap() {
        // Safety floor: even with a tiny headway, closing onto a 1 m gap still brakes hard, because
        // the standstill MIN_GAP term dominates. A shorter headway never makes contact acceptable.
        double a = CarFollowingModel.accel(10.0, V0, 10.0, 1.0, VehicleType.CAR, 0.5);
        assertTrue(a < -VehicleType.CAR.comfortDecel(), "a 1m gap must still brake hard regardless of headway");
    }
}
