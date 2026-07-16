package com.trafficflow.engine;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.model.Approach;
import com.trafficflow.model.PedestrianView;
import com.trafficflow.model.SignalColor;
import com.trafficflow.model.SignalState;
import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The walkers' road rules, proven deterministically: a walker can never be on a carriageway
 * against its WALK phase, crossings complete, and the occupancy bitmap the vehicles yield to
 * tracks reality.
 */
class PedestrianSimulatorTest {

    private static final double DT = 1.0 / 30.0;
    private static final double[][] NO_VEHICLES = new double[0][];

    private static SignalState allRed() {
        return SignalState.allRed("ALL_RED");
    }

    /** A state where the EW through movements are green (walk phase for the N/S street). */
    private static SignalState ewGreen() {
        Map<Approach, SignalColor> t = new EnumMap<>(Approach.class);
        Map<Approach, SignalColor> l = new EnumMap<>(Approach.class);
        for (Approach a : Approach.values()) {
            t.put(a, a == Approach.EAST || a == Approach.WEST ? SignalColor.GREEN : SignalColor.RED);
            l.put(a, SignalColor.RED);
        }
        return new SignalState("EW_THROUGH", t, l);
    }

    private static SignalState nsGreen() {
        Map<Approach, SignalColor> t = new EnumMap<>(Approach.class);
        Map<Approach, SignalColor> l = new EnumMap<>(Approach.class);
        for (Approach a : Approach.values()) {
            t.put(a, a == Approach.NORTH || a == Approach.SOUTH ? SignalColor.GREEN : SignalColor.RED);
            l.put(a, SignalColor.RED);
        }
        return new SignalState("NS_THROUGH", t, l);
    }

    private static PedestrianSimulator sim(int pop, long seed) {
        return new PedestrianSimulator(new SimulationProperties(), pop, seed);
    }

    @Test
    void neverStepsOffAgainstAnAllRed() {
        // With every signal red there is no WALK phase anywhere, so however long the world runs,
        // no walker may ever be on a carriageway.
        PedestrianSimulator peds = sim(12, 42);
        for (int i = 0; i < 90 * 30; i++) {
            peds.step(DT, allRed(), 0, NO_VEHICLES);
            assertFalse(peds.anyOnCarriageway(true), "walker on the N/S street against DON'T WALK");
            assertFalse(peds.anyOnCarriageway(false), "walker on the E/W street against DON'T WALK");
        }
    }

    @Test
    void crossesOnlyTheStoppedStreetDuringItsWalkPhase() {
        // EW green = the N/S street is stopped = its crosswalks are walkable. The E/W street is
        // flowing, so nobody may ever be on it.
        PedestrianSimulator peds = sim(12, 7);
        boolean sawCrossing = false;
        for (int i = 0; i < 120 * 30; i++) {
            peds.step(DT, ewGreen(), 999, NO_VEHICLES);
            sawCrossing |= peds.anyOnCarriageway(true);
            assertFalse(peds.anyOnCarriageway(false), "walker on the flowing E/W street");
        }
        assertTrue(sawCrossing, "walkers should cross the stopped street during its walk phase");
    }

    @Test
    void occupancyBitmapTracksWalkersOnTheRoad() {
        PedestrianSimulator peds = sim(12, 7);
        boolean sawOccupied = false;
        for (int i = 0; i < 120 * 30; i++) {
            peds.step(DT, ewGreen(), 999, NO_VEHICLES);
            boolean[] occ = peds.occupiedArms();
            if (peds.anyOnCarriageway(true)) {
                assertTrue(occ[Approach.NORTH.ordinal()] || occ[Approach.SOUTH.ordinal()],
                        "a walker is on the N/S street but neither of its crosswalks reads occupied");
                sawOccupied = true;
            }
            // The E/W street is flowing: its crosswalks must never be occupied.
            assertFalse(occ[Approach.EAST.ordinal()] && peds.anyOnCarriageway(false));
        }
        assertTrue(sawOccupied);
    }

    @Test
    void refusesToStepOffWithoutEnoughGreenLeft() {
        // 1 second of green left can never cover a whole crossing, so nobody steps off.
        PedestrianSimulator peds = sim(12, 11);
        for (int i = 0; i < 60 * 30; i++) {
            peds.step(DT, ewGreen(), 1.0, NO_VEHICLES);
            assertFalse(peds.anyOnCarriageway(true),
                    "stepped off without enough walk time left to finish");
        }
    }

    @Test
    void refusesToStepOffInFrontOfAMovingVehicle() {
        // A vehicle moving on the N/S street near every crosswalk blocks all step-offs there.
        double[][] moving = {
                {2.0, 16.25, 8.0},   // northern crosswalk band, moving
                {2.0, -16.25, 8.0},  // southern crosswalk band, moving
        };
        PedestrianSimulator peds = sim(12, 13);
        for (int i = 0; i < 60 * 30; i++) {
            peds.step(DT, ewGreen(), 999, moving);
            assertFalse(peds.anyOnCarriageway(true), "stepped off in front of a moving vehicle");
        }
    }

    @Test
    void maintainsItsPopulationAndKeepsWalkersMoving() {
        PedestrianSimulator peds = sim(8, 21);
        // Alternate walk phases so routes with crossings can complete and despawn.
        for (int i = 0; i < 240 * 30; i++) {
            peds.step(DT, (i / (20 * 30)) % 2 == 0 ? ewGreen() : nsGreen(), 15, NO_VEHICLES);
        }
        assertTrue(peds.population() >= 6 && peds.population() <= 8,
                "population should hold near target, was " + peds.population());
        for (PedestrianView p : peds.views()) {
            assertTrue(Math.abs(p.x()) <= 80 && Math.abs(p.y()) <= 80, "walker escaped the map");
        }
    }

    @Test
    void viewsAreCompleteAndStable() {
        PedestrianSimulator peds = sim(8, 3);
        peds.step(DT, allRed(), 0, NO_VEHICLES);
        assertEquals(peds.population(), peds.views().size());
        for (PedestrianView p : peds.views()) {
            assertTrue(p.c() >= 0 && p.c() < 8, "palette index out of range");
            double len = Math.hypot(p.fx(), p.fy());
            assertTrue(len > 0.9 && len < 1.1, "facing direction should be a unit vector");
        }
    }
}
