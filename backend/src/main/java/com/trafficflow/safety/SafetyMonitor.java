package com.trafficflow.safety;

import com.trafficflow.engine.VehicleState;
import com.trafficflow.geometry.IntersectionLayout;
import com.trafficflow.geometry.Pose;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.PedestrianView;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Runtime safety invariant. Because each of the 24 lanes carries a single ordered stream of
 * vehicles (routes are baked into lane paths and the signals keep conflicting movements out of
 * the box at the same time), the only vehicle-vehicle collision possible is a rear-end overlap
 * within a lane; this monitor verifies, every tick, that no follower's front bumper has passed
 * its leader's rear bumper. It also verifies the pedestrian invariant: no vehicle body may ever
 * overlap a walker on the carriageway. A persistent count of zero is the live proof behind the
 * "100% safety" figure shown in the UI.
 */
@Component
public class SafetyMonitor {

    /** Tolerance (meters) to ignore floating-point noise at exact contact. */
    private static final double EPS = 1e-3;

    /** Vehicle half-width (widest body is ~2.5 m) plus a walker's body radius (meters). */
    private static final double PED_CONTACT_DIST = 1.25 + 0.35;

    public record Violation(LaneId lane, int leaderId, int followerId, double overlap) {}

    public record PedViolation(int vehicleId, int pedestrianId, double distance) {}

    /** Find all rear-end overlaps in the given states (empty when safe). */
    public List<Violation> check(List<VehicleState> states) {
        Map<LaneId, List<VehicleState>> byLane = new TreeMap<>(
                (a, b) -> a.toString().compareTo(b.toString()));
        for (VehicleState s : states) {
            byLane.computeIfAbsent(s.laneId(), k -> new ArrayList<>()).add(s);
        }

        List<Violation> violations = new ArrayList<>();
        for (Map.Entry<LaneId, List<VehicleState>> e : byLane.entrySet()) {
            List<VehicleState> lane = e.getValue();
            lane.sort((a, b) -> Double.compare(a.s(), b.s())); // ascending: leader has larger s
            for (int i = 0; i < lane.size() - 1; i++) {
                VehicleState follower = lane.get(i);
                VehicleState leader = lane.get(i + 1);
                double gap = (leader.s() - leader.length()) - follower.s();
                if (gap < -EPS) {
                    violations.add(new Violation(e.getKey(), leader.id(), follower.id(), -gap));
                }
            }
        }
        return violations;
    }

    /**
     * Pedestrian invariant: no vehicle body (the front-to-rear bumper chord, with the widest
     * body's half-width) may come within contact distance of a walker who is on a carriageway.
     * Walkers on the footpaths cannot conflict - vehicles never leave the road - so only
     * {@code crossing} walkers are tested.
     */
    public List<PedViolation> checkPedestrians(List<VehicleState> states,
                                               IntersectionLayout layout,
                                               List<PedestrianView> pedestrians) {
        List<PedViolation> violations = new ArrayList<>();
        if (pedestrians.isEmpty() || states.isEmpty()) {
            return violations;
        }
        for (PedestrianView p : pedestrians) {
            if (!p.crossing()) {
                continue;
            }
            for (VehicleState st : states) {
                Pose front = layout.path(st.laneId()).poseAt(st.s());
                Pose rear = layout.path(st.laneId()).poseAt(Math.max(0.0, st.s() - st.length()));
                double d = pointToSegment(p.x(), p.y(), front.x(), front.y(), rear.x(), rear.y());
                if (d < PED_CONTACT_DIST - EPS) {
                    violations.add(new PedViolation(st.id(), p.id(), d));
                }
            }
        }
        return violations;
    }

    private static double pointToSegment(double px, double py,
                                         double ax, double ay, double bx, double by) {
        double dx = bx - ax;
        double dy = by - ay;
        double len2 = dx * dx + dy * dy;
        double t = len2 < 1e-12 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        double cx = ax + t * dx;
        double cy = ay + t * dy;
        return Math.hypot(px - cx, py - cy);
    }
}
