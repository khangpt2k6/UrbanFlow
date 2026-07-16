package com.trafficflow.safety;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.engine.VehicleState;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.geometry.Pose;
import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;
import com.trafficflow.model.PedestrianView;
import com.trafficflow.model.VehicleType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SafetyMonitorTest {

    private final SafetyMonitor monitor = new SafetyMonitor();
    private final LaneId lane = new LaneId(Approach.NORTH, Movement.THROUGH);
    private final IntersectionLayout layout = new IntersectionLayout(new SimulationProperties());

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

    @Test
    void aVehicleTouchingACrossingWalkerIsFlagged() {
        // Put a crossing walker exactly on a vehicle's front bumper.
        VehicleState st = new VehicleState(1, VehicleType.CAR, lane, 50.0, 5.0);
        Pose front = layout.path(lane).poseAt(st.s());
        PedestrianView ped = new PedestrianView(9, front.x(), front.y(), 1, 0, 0, true);
        List<SafetyMonitor.PedViolation> v =
                monitor.checkPedestrians(List.of(st), layout, List.of(ped));
        assertEquals(1, v.size());
        assertEquals(1, v.get(0).vehicleId());
        assertEquals(9, v.get(0).pedestrianId());
    }

    @Test
    void aWalkerClearOfTheBodyIsSafe() {
        VehicleState st = new VehicleState(1, VehicleType.CAR, lane, 50.0, 5.0);
        Pose front = layout.path(lane).poseAt(st.s());
        // 3 m to the side of the body: outside the contact envelope.
        PedestrianView ped = new PedestrianView(9, front.x() + 3.0, front.y(), 1, 0, 0, true);
        assertTrue(monitor.checkPedestrians(List.of(st), layout, List.of(ped)).isEmpty());
    }

    @Test
    void walkersOnTheFootpathAreNeverTested() {
        // Even at zero distance, a non-crossing walker (on the footpath, off the road) is not a
        // conflict - vehicles never leave the carriageway.
        VehicleState st = new VehicleState(1, VehicleType.CAR, lane, 50.0, 5.0);
        Pose front = layout.path(lane).poseAt(st.s());
        PedestrianView ped = new PedestrianView(9, front.x(), front.y(), 1, 0, 0, false);
        assertTrue(monitor.checkPedestrians(List.of(st), layout, List.of(ped)).isEmpty());
    }
}
