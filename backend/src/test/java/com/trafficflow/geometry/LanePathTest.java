package com.trafficflow.geometry;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LanePathTest {

    @Test
    void lengthOfStraightPathIsEndToEndDistance() {
        LanePath p = new LanePath(List.of(new Vec2(0, 0), new Vec2(0, 10)));
        assertEquals(10.0, p.length(), 1e-9);
    }

    @Test
    void poseAtEndpointsMatchStartAndEnd() {
        LanePath p = new LanePath(List.of(new Vec2(0, 0), new Vec2(0, 10)));
        Pose start = p.poseAt(0);
        Pose end = p.poseAt(10);
        assertEquals(0.0, start.x(), 1e-9);
        assertEquals(0.0, start.y(), 1e-9);
        assertEquals(10.0, end.y(), 1e-9);
        // heading points along +y => PI/2
        assertEquals(Math.PI / 2, start.headingRad(), 1e-9);
    }

    @Test
    void poseAtMidpointInterpolates() {
        LanePath p = new LanePath(List.of(new Vec2(0, 0), new Vec2(10, 0)));
        Pose mid = p.poseAt(5);
        assertEquals(5.0, mid.x(), 1e-9);
        assertEquals(0.0, mid.headingRad(), 1e-9);
    }

    @Test
    void clampsBeyondEnds() {
        LanePath p = new LanePath(List.of(new Vec2(0, 0), new Vec2(10, 0)));
        assertEquals(10.0, p.poseAt(999).x(), 1e-9);
        assertEquals(0.0, p.poseAt(-5).x(), 1e-9);
    }

    @Test
    void rejectsDegeneratePath() {
        assertThrows(IllegalArgumentException.class, () -> new LanePath(List.of(new Vec2(0, 0))));
    }
}
