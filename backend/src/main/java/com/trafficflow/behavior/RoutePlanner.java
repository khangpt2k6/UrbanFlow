package com.trafficflow.behavior;

import com.trafficflow.model.Approach;
import com.trafficflow.model.LaneId;
import com.trafficflow.model.Movement;
import com.trafficflow.model.VehicleType;

import java.util.List;
import java.util.Random;

/**
 * Assigns a route to a spawning vehicle: which approach it enters from, which movement it
 * performs (and therefore which of the 24 lanes it filters into), and what type it is.
 * All randomness flows through an injected {@link Random} so simulations are reproducible
 * and tests are deterministic (no {@code Math.random()} in the core).
 */
public final class RoutePlanner {

    private RoutePlanner() {
    }

    public static Approach chooseApproach(Random rng) {
        Approach[] all = Approach.values();
        return all[rng.nextInt(all.length)];
    }

    /** Through movements are weighted more heavily than turns (50% / 25% / 25%). */
    public static Movement chooseMovement(Random rng) {
        double r = rng.nextDouble();
        if (r < 0.50) {
            return Movement.THROUGH;
        } else if (r < 0.75) {
            return Movement.LEFT;
        } else {
            return Movement.RIGHT;
        }
    }

    public static LaneId chooseLane(Random rng) {
        return new LaneId(chooseApproach(rng), chooseMovement(rng));
    }

    /** Picks a civilian (non-emergency) vehicle type with cars/SUVs most common. */
    public static VehicleType chooseCivilianType(Random rng) {
        // Weighted bag: common cars dominate, heavy/slow vehicles are rarer.
        double r = rng.nextDouble();
        if (r < 0.34) return VehicleType.CAR;
        if (r < 0.52) return VehicleType.SUV;
        if (r < 0.64) return VehicleType.VAN;
        if (r < 0.76) return VehicleType.MOTORCYCLE;
        if (r < 0.85) return VehicleType.BICYCLE;
        if (r < 0.93) return VehicleType.BUS;
        return VehicleType.TRUCK;
    }

    public static List<VehicleType> civilianTypes() {
        return VehicleType.civilianTypes();
    }
}
