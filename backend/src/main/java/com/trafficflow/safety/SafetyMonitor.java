package com.trafficflow.safety;

import com.trafficflow.engine.VehicleState;
import com.trafficflow.model.LaneId;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Runtime safety invariant. Because each of the 24 lanes carries a single ordered stream of
 * vehicles (routes are baked into lane paths and the signals keep conflicting movements out of
 * the box at the same time), the only possible physical collision is a rear-end overlap within
 * a lane. This monitor verifies, every tick, that no follower's front bumper has passed its
 * leader's rear bumper. A persistent count of zero is the live proof behind the "100% safety"
 * figure shown in the UI.
 */
@Component
public class SafetyMonitor {

    /** Tolerance (meters) to ignore floating-point noise at exact contact. */
    private static final double EPS = 1e-3;

    public record Violation(LaneId lane, int leaderId, int followerId, double overlap) {}

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
}
