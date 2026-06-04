package com.trafficflow.behavior;

/**
 * Gap-acceptance checks. Used to decide whether it is safe to insert a newly spawned vehicle
 * into a lane (and available for any future lane-change logic). A gap is acceptable only when
 * both the lead and lag clearances exceed a speed-dependent safe distance, so an inserted
 * vehicle never materializes inside another vehicle's safe-following envelope.
 */
public final class GapAcceptance {

    /** Extra spacing beyond the IDM standstill gap required to insert (meters). */
    public static final double INSERT_MARGIN = 3.0;

    private GapAcceptance() {
    }

    /**
     * Safe to insert a vehicle of the given length when the gap to the vehicle ahead leaves
     * room for the new vehicle plus the standstill gap plus a margin.
     */
    public static boolean safeToInsert(double leadGap, double vehicleLength) {
        double required = CarFollowingModel.MIN_GAP + vehicleLength + INSERT_MARGIN;
        return leadGap >= required;
    }

    /**
     * General two-sided gap acceptance: the lead gap must clear the standstill distance and
     * the lag gap must clear a time-headway-scaled distance for an approaching follower.
     */
    public static boolean acceptable(double leadGap, double lagGap, double lagApproachSpeed) {
        double minLead = CarFollowingModel.MIN_GAP + INSERT_MARGIN;
        double minLag = CarFollowingModel.MIN_GAP
                + Math.max(0.0, lagApproachSpeed) * CarFollowingModel.HEADWAY;
        return leadGap >= minLead && lagGap >= minLag;
    }
}
