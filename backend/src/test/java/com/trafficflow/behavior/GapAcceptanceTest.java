package com.trafficflow.behavior;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GapAcceptanceTest {

    @Test
    void insertsWhenGapIsLarge() {
        assertTrue(GapAcceptance.safeToInsert(50.0, 4.5));
    }

    @Test
    void rejectsInsertWhenGapTooSmall() {
        assertFalse(GapAcceptance.safeToInsert(3.0, 4.5));
    }

    @Test
    void twoSidedAcceptanceRejectsFastApproachingFollower() {
        assertFalse(GapAcceptance.acceptable(50.0, 5.0, 20.0),
                "a fast follower needs a larger lag gap");
    }

    @Test
    void twoSidedAcceptanceAcceptsAmpleGaps() {
        assertTrue(GapAcceptance.acceptable(50.0, 50.0, 10.0));
    }
}
