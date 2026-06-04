package com.trafficflow.behavior;

import com.trafficflow.model.Approach;
import com.trafficflow.model.Movement;
import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.Map;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RoutePlannerTest {

    @Test
    void throughIsTheMostCommonMovement() {
        Random rng = new Random(42);
        Map<Movement, Integer> counts = new EnumMap<>(Movement.class);
        for (Movement m : Movement.values()) {
            counts.put(m, 0);
        }
        for (int i = 0; i < 10_000; i++) {
            Movement m = RoutePlanner.chooseMovement(rng);
            counts.merge(m, 1, Integer::sum);
        }
        assertTrue(counts.get(Movement.THROUGH) > counts.get(Movement.LEFT));
        assertTrue(counts.get(Movement.THROUGH) > counts.get(Movement.RIGHT));
    }

    @Test
    void chooseApproachReturnsValidApproach() {
        Random rng = new Random(7);
        for (int i = 0; i < 100; i++) {
            Approach a = RoutePlanner.chooseApproach(rng);
            assertNotNull(a);
        }
    }

    @Test
    void chooseCivilianTypeIsNeverEmergency() {
        Random rng = new Random(99);
        for (int i = 0; i < 1000; i++) {
            assertTrue(!RoutePlanner.chooseCivilianType(rng).emergency());
        }
    }
}
