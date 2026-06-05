package com.trafficflow.control;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.engine.VehicleState;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.model.Approach;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Watches the published vehicle states for emergency vehicles and preempts the signals for the
 * nearest one that is within trigger range of (or already inside) the intersection. When no
 * emergency is active, preemption is cleared and the normal ring resumes. Runs on the
 * dedicated emergency-dispatcher thread, reading only the immutable {@link VehicleState} list.
 */
@Component
public class EmergencyDispatcher {

    private final SignalController signals;
    private final IntersectionLayout layout;
    private final double triggerM;

    private volatile Approach activeApproach;

    public EmergencyDispatcher(SignalController signals,
                               IntersectionLayout layout,
                               SimulationProperties props) {
        this.signals = signals;
        this.layout = layout;
        this.triggerM = props.getEmergencyTriggerM();
    }

    /**
     * Recompute the preemption target from the current states. An emergency vehicle is relevant
     * while it has not cleared the box and is within trigger distance of the stop line (or past
     * it). The one nearest the intersection wins.
     *
     * @return an alert string when the preempted approach changes, otherwise null
     */
    public String update(List<VehicleState> states) {
        Approach best = null;
        double bestDist = Double.POSITIVE_INFINITY;
        for (VehicleState st : states) {
            if (!st.type().emergency()) {
                continue;
            }
            double boxExit = layout.boxExitS(st.laneId());
            if (st.s() >= boxExit) {
                continue; // already cleared the intersection
            }
            double distToStop = layout.stopLineS() - st.s(); // negative once inside the box
            if (distToStop > triggerM) {
                continue; // still too far away to warrant preemption
            }
            if (distToStop < bestDist) {
                bestDist = distToStop;
                best = st.laneId().approach();
            }
        }

        signals.requestPreempt(best);

        if (best != activeApproach) {
            Approach prev = activeApproach;
            activeApproach = best;
            if (best != null) {
                return "Emergency preemption: serving " + best + " approach green";
            } else if (prev != null) {
                return "Preemption cleared: resuming normal signal cycle";
            }
        }
        return null;
    }

    public Approach activeApproach() {
        return activeApproach;
    }

    /** Clear any active preemption so a world reset starts from the normal signal cycle. */
    public void reset() {
        activeApproach = null;
        signals.requestPreempt(null);
    }
}
