package com.trafficflow.safety;

import com.trafficflow.engine.VehicleState;
import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;
import com.trafficflow.model.VehicleType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SafetyMonitorTest {

    private final SafetyMonitor monitor = new SafetyMonitor();
    private final LaneId lane = new LaneId(Approach.NORTH, Movement.THROUGH);

    @Test
    void wellSpacedVehiclesAreSafe() {
        // s = front bumper; leader at 30 (len 4.5 -> rear 25.5), follower front at 20 -> gap 5.5.
        List<VehicleState> states = List.of(
                new VehicleState(1, VehicleType.CAR, lane, 30.0, 5.0),
                new VehicleState(2, VehicleType.CAR, lane, 20.0, 5.0));
        assertTrue(monitor.check(states).isEmpty());
    }

    @Test
    void overlappingVehiclesAreFlagged() {
        // follower front at 27 is past leader's rear at 25.5 -> overlap.
        List<VehicleState> states = List.of(
                new VehicleState(1, VehicleType.CAR, lane, 30.0, 5.0),
                new VehicleState(2, VehicleType.CAR, lane, 27.0, 5.0));
        List<SafetyMonitor.Violation> v = monitor.check(states);
        assertEquals(1, v.size());
        assertEquals(1, v.get(0).leaderId());
        assertEquals(2, v.get(0).followerId());
    }

    @Test
    void vehiclesOnDifferentLanesNeverCollide() {
        List<VehicleState> states = List.of(
                new VehicleState(1, VehicleType.CAR, new LaneId(Approach.NORTH, Movement.THROUGH), 30.0, 5.0),
                new VehicleState(2, VehicleType.CAR, new LaneId(Approach.SOUTH, Movement.THROUGH), 30.0, 5.0));
        assertTrue(monitor.check(states).isEmpty());
    }
}
