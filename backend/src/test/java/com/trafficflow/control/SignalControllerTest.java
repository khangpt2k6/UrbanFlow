package com.trafficflow.control;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.model.Approach;
import com.trafficflow.model.Axis;
import com.trafficflow.model.Movement;
import com.trafficflow.model.SignalColor;
import com.trafficflow.model.SignalState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SignalControllerTest {

    private SignalController signals;

    @BeforeEach
    void setUp() {
        signals = new SignalController(new SimulationControls(new SimulationProperties()));
        signals.stepTo(0); // seed
    }

    /**
     * Independent safety invariant (does not rely on the controller's internal grouping):
     * the set of non-red movements must come from a single approach, or from approaches sharing
     * one axis AND one movement class (all left, or all through/right). This is exactly what
     * prevents the real geometric conflicts (e.g. N-left crossing S-through).
     */
    private void assertConflictFree(SignalState s) {
        Set<Approach> active = EnumSet.noneOf(Approach.class);
        boolean anyLeft = false;
        boolean anyThroughRight = false;
        for (Approach a : Approach.values()) {
            for (Movement m : Movement.values()) {
                if (s.colorFor(a, m) != SignalColor.RED) {
                    active.add(a);
                    if (m == Movement.LEFT) {
                        anyLeft = true;
                    } else {
                        anyThroughRight = true;
                    }
                }
            }
        }
        if (active.size() <= 1) {
            return; // single approach (or none) is always conflict-free
        }
        Set<Axis> axes = EnumSet.noneOf(Axis.class);
        active.forEach(a -> axes.add(a.axis()));
        assertTrue(axes.size() == 1, "active approaches must share one axis in phase " + s.phase());
        assertFalse(anyLeft && anyThroughRight,
                "left and through/right cannot both be active across approaches in phase " + s.phase());
    }

    @Test
    void normalCycleIsAlwaysConflictFree() {
        for (long t = 0; t <= 200_000; t += 100) {
            signals.stepTo(t);
            assertConflictFree(signals.currentState());
        }
    }

    @Test
    void cycleVisitsAllFourGreenGroups() {
        // With standing left-turn demand on both axes, the actuated ring still serves every group.
        signals.reportLeftDemand(3, 3);
        boolean nsThrough = false, nsLeft = false, ewThrough = false, ewLeft = false;
        for (long t = 0; t <= 300_000; t += 50) {
            signals.stepTo(t);
            String phase = signals.currentState().phase();
            if (phase.equals("NS_THROUGH")) nsThrough = true;
            if (phase.equals("NS_LEFT")) nsLeft = true;
            if (phase.equals("EW_THROUGH")) ewThrough = true;
            if (phase.equals("EW_LEFT")) ewLeft = true;
        }
        assertTrue(nsThrough && nsLeft && ewThrough && ewLeft,
                "the ring should visit all four protected green groups when every movement has demand");
    }

    @Test
    void emptyProtectedLeftPhasesAreSkipped() {
        // No left-turn demand reported (the default): the ring must never enter a protected-left
        // phase, because doing so would stop every approach for a movement nobody is making.
        boolean nsThrough = false, ewThrough = false, anyLeft = false;
        for (long t = 0; t <= 300_000; t += 50) {
            signals.stepTo(t);
            String phase = signals.currentState().phase();
            if (phase.equals("NS_THROUGH")) nsThrough = true;
            if (phase.equals("EW_THROUGH")) ewThrough = true;
            if (phase.equals("NS_LEFT") || phase.equals("EW_LEFT")) anyLeft = true;
            assertConflictFree(signals.currentState());
        }
        assertTrue(nsThrough && ewThrough, "the two through phases must still alternate");
        assertFalse(anyLeft, "an empty protected-left phase must be skipped entirely");
    }

    @Test
    void leftPhaseGapsOutOnceItsQueueClears() {
        // Demand on the NS left lane only: the phase must be served, but once its queue clears the
        // line (demand drops to zero) it must gap out instead of holding the full fixed green.
        signals.reportLeftDemand(2, 0);
        long t = 0;
        long nsLeftStart = -1, nsLeftEnd = -1;
        boolean cleared = false;
        for (; t <= 120_000; t += 50) {
            signals.stepTo(t);
            String phase = signals.currentState().phase();
            if (phase.equals("NS_LEFT")) {
                if (nsLeftStart < 0) {
                    nsLeftStart = t;
                }
                // Once the green has opened, the queue clears the stop line: demand goes to zero.
                if (t - nsLeftStart >= 1000 && !cleared) {
                    signals.reportLeftDemand(0, 0);
                    cleared = true;
                }
            } else if (nsLeftStart >= 0 && nsLeftEnd < 0 && cleared) {
                nsLeftEnd = t;
                break;
            }
        }
        assertTrue(nsLeftStart >= 0, "the NS left phase should be served while it has demand");
        assertTrue(nsLeftEnd >= 0, "the NS left phase should end after its queue clears");
        double served = (nsLeftEnd - nsLeftStart) / 1000.0;
        double fixedGreen = new SimulationControls(new SimulationProperties()).getLeftGreenSeconds();
        assertTrue(served < fixedGreen,
                "a gapped-out left phase (" + served + "s) must be shorter than the fixed green (" + fixedGreen + "s)");
    }

    @Test
    void preemptionServesRequestedApproachAndStaysConflictFree() {
        signals.requestPreempt(Approach.EAST);
        boolean eastFullyGreen = false;
        for (long t = 0; t <= 60_000; t += 50) {
            signals.stepTo(t);
            SignalState s = signals.currentState();
            assertConflictFree(s);
            if (s.colorFor(Approach.EAST, Movement.THROUGH) == SignalColor.GREEN
                    && s.colorFor(Approach.EAST, Movement.LEFT) == SignalColor.GREEN
                    && s.colorFor(Approach.NORTH, Movement.THROUGH) == SignalColor.RED
                    && s.colorFor(Approach.WEST, Movement.THROUGH) == SignalColor.RED) {
                eastFullyGreen = true;
            }
        }
        assertTrue(eastFullyGreen, "preemption should serve the EAST approach green with others red");
    }

    @Test
    void requestResetRestartsCleanlyAfterTheClockIsZeroed() {
        // Run the machine well into a cycle so its internal sim-clock is large.
        for (long t = 0; t <= 50_000; t += 50) {
            signals.stepTo(t);
        }
        // Simulate a world reset: the engine zeroes the sim clock, then asks the signals to restart.
        signals.requestReset();
        signals.stepTo(0); // first post-reset tick, with the freshly zeroed clock

        // Regression for the Reset freeze: before the fix, lastSimMs stayed at ~50_000, so every
        // stepTo(small) saw a negative delta and the lights froze forever. After reset the machine
        // must be back at its first green and able to advance again from t=0.
        assertEquals("NS_THROUGH", signals.currentState().phase());
        boolean advanced = false;
        for (long t = 0; t <= 60_000; t += 50) {
            signals.stepTo(t);
            assertConflictFree(signals.currentState());
            if (!signals.currentState().phase().equals("NS_THROUGH")) {
                advanced = true;
            }
        }
        assertTrue(advanced, "signals must cycle again after a reset with a zeroed clock");
    }

    @Test
    void preemptionRetargetsWhenADifferentApproachBecomesThePriority() {
        // Settle into the infinite-hold NORTH preemption green.
        signals.requestPreempt(Approach.NORTH);
        long t = 0;
        boolean northServed = false;
        for (; t <= 30_000; t += 50) {
            signals.stepTo(t);
            if (signals.currentState().colorFor(Approach.NORTH, Movement.THROUGH) == SignalColor.GREEN
                    && signals.currentState().phase().startsWith("PREEMPT_NORTH")) {
                northServed = true;
            }
        }
        assertTrue(northServed, "should be holding the NORTH preemption green");

        // A nearer emergency now appears on EAST: the dispatcher re-points the request mid-hold.
        signals.requestPreempt(Approach.EAST);
        boolean eastServed = false;
        for (; t <= 120_000 && !eastServed; t += 50) {
            signals.stepTo(t);
            SignalState s = signals.currentState();
            assertConflictFree(s); // the re-target must still pass through yellow + all-red
            if (s.colorFor(Approach.EAST, Movement.THROUGH) == SignalColor.GREEN
                    && s.colorFor(Approach.NORTH, Movement.THROUGH) == SignalColor.RED) {
                eastServed = true;
            }
        }
        // Before the fix the machine held PREEMPT_NORTH forever (infinite green, re-target ignored),
        // stranding the EAST emergency at a red light. It must now switch to serve EAST.
        assertTrue(eastServed, "preemption must re-target to EAST when it becomes the priority approach");
    }

    @Test
    void clearingPreemptionResumesNormalCycle() {
        signals.requestPreempt(Approach.NORTH);
        long t = 0;
        for (; t <= 30_000; t += 50) {
            signals.stepTo(t);
        }
        signals.requestPreempt(null);
        boolean resumed = false;
        for (; t <= 120_000; t += 50) {
            signals.stepTo(t);
            assertConflictFree(signals.currentState());
            String phase = signals.currentState().phase();
            if (phase.startsWith("EW") || phase.equals("NS_LEFT")) {
                resumed = true; // a normal (non-preempt) green group reappeared
            }
        }
        assertTrue(resumed, "normal cycling should resume after preemption is cleared");
    }
}
