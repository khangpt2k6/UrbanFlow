package com.trafficflow.control;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.engine.VehicleState;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;
import com.trafficflow.model.VehicleType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class EmergencyDispatcherTest {

    private SimulationProperties props;
    private IntersectionLayout layout;
    private SignalController signals;
    private EmergencyDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        props = new SimulationProperties();
        layout = new IntersectionLayout(props);
        signals = new SignalController(new SimulationControls(props));
        dispatcher = new EmergencyDispatcher(signals, layout, props);
    }

    @Test
    void preemptsApproachOfNearbyEmergency() {
        // Ambulance on the EAST approach, 40m before the stop line (inside the 80m trigger).
        double s = layout.stopLineS() - 40.0;
        VehicleState ambulance = new VehicleState(1, VehicleType.AMBULANCE,
                new LaneId(Approach.EAST, Movement.THROUGH), s, 12.0);
        dispatcher.update(List.of(ambulance));
        assertEquals(Approach.EAST, signals.preemptApproach());
    }

    @Test
    void doesNotPreemptWhenEmergencyIsTooFar() {
        double s = layout.stopLineS() - 110.0; // beyond the 80m trigger
        VehicleState ambulance = new VehicleState(1, VehicleType.AMBULANCE,
                new LaneId(Approach.WEST, Movement.THROUGH), s, 12.0);
        dispatcher.update(List.of(ambulance));
        assertNull(signals.preemptApproach());
    }

    @Test
    void clearsPreemptionOnceEmergencyHasClearedTheBox() {
        LaneId lane = new LaneId(Approach.NORTH, Movement.THROUGH);
        VehicleState approaching = new VehicleState(1, VehicleType.FIRETRUCK, lane,
                layout.stopLineS() - 20.0, 10.0);
        dispatcher.update(List.of(approaching));
        assertEquals(Approach.NORTH, signals.preemptApproach());

        // Fire truck has passed the box exit -> no longer relevant.
        VehicleState cleared = new VehicleState(1, VehicleType.FIRETRUCK, lane,
                layout.boxExitS(lane) + 5.0, 10.0);
        dispatcher.update(List.of(cleared));
        assertNull(signals.preemptApproach());
    }

    @Test
    void resetClearsActivePreemption() {
        VehicleState ambulance = new VehicleState(1, VehicleType.AMBULANCE,
                new LaneId(Approach.EAST, Movement.THROUGH), layout.stopLineS() - 30.0, 12.0);
        dispatcher.update(List.of(ambulance));
        assertEquals(Approach.EAST, signals.preemptApproach());

        dispatcher.reset();
        assertNull(signals.preemptApproach());
        assertNull(dispatcher.activeApproach());
    }

    @Test
    void picksTheNearestEmergencyWhenSeveralArePresent() {
        VehicleState far = new VehicleState(1, VehicleType.AMBULANCE,
                new LaneId(Approach.NORTH, Movement.THROUGH), layout.stopLineS() - 70.0, 12.0);
        VehicleState near = new VehicleState(2, VehicleType.AMBULANCE,
                new LaneId(Approach.SOUTH, Movement.THROUGH), layout.stopLineS() - 10.0, 12.0);
        dispatcher.update(List.of(far, near));
        assertEquals(Approach.SOUTH, signals.preemptApproach());
    }
}
