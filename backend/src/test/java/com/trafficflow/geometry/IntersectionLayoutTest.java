package com.trafficflow.geometry;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IntersectionLayoutTest {

    private SimulationProperties props;
    private IntersectionLayout layout;

    @BeforeEach
    void setUp() {
        props = new SimulationProperties();
        layout = new IntersectionLayout(props);
    }

    @Test
    void hasTwelveDrivableLanesAndTwentyFourTotal() {
        assertEquals(12, layout.inboundPaths().size());
        assertEquals(24, layout.totalLanes());
    }

    @Test
    void everyPathIncludesInboundBoxAndOutbound() {
        double minExpected = 2 * props.getApproachLengthM(); // inbound + outbound, plus the box
        for (LaneId id : layout.laneIds()) {
            LanePath p = layout.path(id);
            assertTrue(p.length() > minExpected,
                    id + " length " + p.length() + " should exceed " + minExpected);
        }
    }

    @Test
    void stopLineSitsAtBoxEdge() {
        // For NORTH-THROUGH the stop line is at y = +half on the west side of the centerline.
        LanePath p = layout.path(new LaneId(Approach.NORTH, Movement.THROUGH));
        Pose stop = p.poseAt(layout.stopLineS());
        assertEquals(props.getIntersectionHalfM(), stop.y(), 1e-6);
        assertTrue(stop.x() < 0, "north inbound lanes sit west of the centerline");
    }

    @Test
    void northThroughIsAStraightSouthboundLine() {
        LanePath p = layout.path(new LaneId(Approach.NORTH, Movement.THROUGH));
        Pose start = p.poseAt(0);
        Pose end = p.poseAt(p.length());
        assertEquals(start.x(), end.x(), 1e-6, "through movement keeps the same x");
        assertTrue(start.y() > end.y(), "north through travels southward");
        // heading at the stop line points south (-y) => -PI/2
        assertEquals(-Math.PI / 2, p.poseAt(layout.stopLineS() - 1).headingRad(), 1e-6);
    }

    @Test
    void boxExitIsAfterStopLine() {
        for (LaneId id : layout.laneIds()) {
            assertTrue(layout.boxExitS(id) > layout.stopLineS(),
                    id + " box exit must be past the stop line");
        }
    }
}
