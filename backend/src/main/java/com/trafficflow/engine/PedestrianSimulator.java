package com.trafficflow.engine;

import com.trafficflow.config.SimulationProperties;
import com.trafficflow.model.Approach;
import com.trafficflow.model.PedestrianView;
import com.trafficflow.model.SignalColor;
import com.trafficflow.model.SignalState;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Backend-authoritative pedestrian simulation. Walkers are real simulated agents: they spawn
 * on a footpath, walk to a corner, cross carriageways ONLY at crosswalks - and only on the
 * concurrent WALK phase, into a clean gap, with enough green time left to finish - then leave
 * the map and despawn. Their positions are streamed to the browser in every world snapshot,
 * exactly like vehicles.
 *
 * <p><b>Threading:</b> this object is owned by the engine and mutated ONLY on the sim-clock
 * thread, inside the single-threaded commit phase (the same single-writer rule as the vehicle
 * list). Readers get immutable {@link PedestrianView} lists and a per-arm occupancy bitmap,
 * both rebuilt fresh each step, so no extra threads and no shared mutable state are added.
 *
 * <p><b>Safety contract with the vehicles:</b> a walker steps off the kerb only when the street
 * it crosses is fully stopped (its parallel through movement is solid green), no moving vehicle
 * is near the crosswalk, and the remaining green covers the whole crossing. Vehicles, in turn,
 * hold at their stop line while any crosswalk their route sweeps is occupied (see the engine's
 * plan phase). The {@code SafetyMonitor} verifies the result every tick: no vehicle body may
 * ever overlap a walker on the carriageway.
 *
 * <p>Geometry mirrors the frontend city layout so the walkers stay on the drawn footpaths:
 * corners at {@code PED_LAT}, crosswalk bands centred {@code CROSS_LAT} from the origin.
 */
public final class PedestrianSimulator {

    // --- footpath / crosswalk geometry (meters, mirrors frontend render/layout + draw) ---
    private static final double KERB_MARGIN = 0.8;     // outer kerb beyond the carriageway edge
    private static final double SIDEWALK_W = 6.2;      // footpath width along each road
    private static final double BIKE_W = 1.9;          // protected cycle track (road side of path)
    private static final double CROSSWALK_DEPTH = 4.5; // crosswalk band depth just outside the box
    private static final double FAR_WALK = 78;         // strip exits just past the visible window

    // --- behaviour (mirrors the previous frontend walker tuning) ---
    private static final double SPAWN_EVERY_MS = 1300;
    private static final double MAX_AGE_MS = 120_000;
    private static final double GIVE_UP_MS = 35_000;
    private static final double CROSS_CLEAR = 30;      // clear road (of moving cars) needed to step off
    private static final double CROSS_SPEEDUP = 1.7;   // stroll the paths, hurry across the road
    private static final double CLEAR_MARGIN_SEC = 1.5; // spare green needed beyond the crossing time
    private static final int PALETTE_SIZE = 8;

    public enum WalkerState { WALK, WAIT, CROSS, DONE }

    private enum Kind { NS, EW }

    /** Crossing metadata: which street is crossed and which arm's crosswalk carries it. */
    private record Cross(Kind kind, int sign, Approach arm) {}

    private static final class Pt {
        final double x;
        final double y;
        Cross cross; // set when the leg STARTING at this point is a carriageway crossing

        Pt(double x, double y) {
            this.x = x;
            this.y = y;
        }
    }

    private static final class Loc {
        final double x;
        final double y;
        final int corner;

        Loc(double x, double y, int corner) {
            this.x = x;
            this.y = y;
            this.corner = corner;
        }
    }

    private static final class Walker {
        final int id;
        final int color;
        final double speed;
        List<Pt> pts;
        int i = 0;
        double u = 0;
        WalkerState state = WalkerState.WALK;
        double waitMs = 0;
        double ageMs = 0;
        double x, y, fx = 1, fy = 0;

        Walker(int id, int color, double speed, List<Pt> pts) {
            this.id = id;
            this.color = color;
            this.speed = speed;
            this.pts = pts;
        }
    }

    private final double roadHalf;   // carriageway half-width (3 lanes)
    private final double roadEdge;   // outer kerb of the carriageway
    private final double pedLat;     // footpath midline the walkers stroll on
    private final double pedKerb;    // where a waiting walker holds, just off the road
    private final double crossLat;   // centre of a crosswalk band
    private final int targetPop;
    private final Random rng;

    // 4 corner pivots where a block's two footpaths meet (0=NE 1=NW 2=SW 3=SE).
    private final double[][] corners;
    // The crosswalk joining each adjacent corner pair (indexed [min][max] of the pair).
    private final Cross[][] crossings = new Cross[4][4];

    private final List<Walker> walkers = new ArrayList<>();
    private double spawnAccMs = 0;
    private int idCounter = 0;

    public PedestrianSimulator(SimulationProperties props, int targetPop, long seed) {
        this.roadHalf = 3 * props.getLaneWidthM();
        this.roadEdge = roadHalf + KERB_MARGIN;
        this.pedLat = (roadEdge + (roadEdge + SIDEWALK_W)) / 2.0;
        this.pedKerb = roadEdge + BIKE_W + 0.4;
        this.crossLat = props.getIntersectionHalfM() + CROSSWALK_DEPTH / 2.0;
        this.targetPop = targetPop;
        this.rng = new Random(seed);
        this.corners = new double[][]{
                {pedLat, pedLat}, {-pedLat, pedLat}, {-pedLat, -pedLat}, {pedLat, -pedLat}};
        crossings[0][1] = new Cross(Kind.NS, 1, Approach.NORTH);
        crossings[1][2] = new Cross(Kind.EW, -1, Approach.WEST);
        crossings[2][3] = new Cross(Kind.NS, -1, Approach.SOUTH);
        crossings[0][3] = new Cross(Kind.EW, 1, Approach.EAST);
        repopulate();
    }

    /** Depth of the crosswalk band outside the intersection box (shared with the plan phase). */
    public static double crosswalkDepth() {
        return CROSSWALK_DEPTH;
    }

    // ---------------------------------------------------------------------------------------
    // Stepping (sim-clock thread only)
    // ---------------------------------------------------------------------------------------

    /**
     * Advance every walker by {@code dtSec} of simulation time.
     *
     * @param signals           current signal state (walk = the parallel through green)
     * @param greenRemainingSec seconds left on the current green phase (the walk clearance)
     * @param vehicles          world-frame vehicle rows {x, y, speed} for gap acceptance
     */
    public void step(double dtSec, SignalState signals, double greenRemainingSec, double[][] vehicles) {
        double dtMs = dtSec * 1000.0;
        spawnAccMs += dtMs;
        while (walkers.size() < targetPop && spawnAccMs >= SPAWN_EVERY_MS) {
            spawnAccMs -= SPAWN_EVERY_MS;
            walkers.add(spawn(false));
        }
        for (Walker w : walkers) {
            update(w, dtSec, dtMs, signals, greenRemainingSec, vehicles);
        }
        walkers.removeIf(w -> w.state == WalkerState.DONE);
    }

    private void update(Walker w, double dt, double dtMs, SignalState signals,
                        double greenRemainingSec, double[][] vehicles) {
        w.ageMs += dtMs;
        if (w.ageMs > MAX_AGE_MS || w.i >= w.pts.size() - 1) {
            w.state = WalkerState.DONE;
            return;
        }
        Pt a = w.pts.get(w.i);
        Pt b = w.pts.get(w.i + 1);
        Cross cross = a.cross;
        double legLen = Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));
        double step = (w.speed * (cross != null ? CROSS_SPEEDUP : 1) * dt) / legLen;

        if (cross == null) {
            w.state = WalkerState.WALK;
            w.u += step;
            w.waitMs = 0;
        } else {
            double cu = Math.max(0, Math.min(1, w.u));
            double t = cross.kind == Kind.NS ? a.x + (b.x - a.x) * cu : a.y + (b.y - a.y) * cu;
            double tB = cross.kind == Kind.NS ? b.x : b.y;
            double dirT = Math.signum(tB - t) == 0 ? 1 : Math.signum(tB - t);

            if (Math.abs(t) >= pedKerb) {
                // Behind the kerb: step off only on the WALK phase, into a clean gap, AND with
                // enough green left to walk the entire road. The lookahead uses the same hurried
                // step the walker takes below, so fast walkers can't leap past the gate un-checked.
                if (Math.abs(t + dirT * w.speed * CROSS_SPEEDUP * dt) < pedKerb) {
                    double crossingSec = legLen / (w.speed * CROSS_SPEEDUP);
                    boolean clearance = greenRemainingSec >= crossingSec + CLEAR_MARGIN_SEC;
                    if (walkOn(signals, cross.kind) && clearance && gapClear(cross, vehicles)) {
                        w.u += step;
                        w.state = WalkerState.CROSS;
                        w.waitMs = 0;
                    } else {
                        w.state = WalkerState.WAIT;
                        w.waitMs += dtMs;
                        if (w.waitMs > GIVE_UP_MS) {
                            rerouteToEdge(w);
                            return;
                        }
                    }
                } else {
                    w.state = WalkerState.WALK;
                    w.u += step;
                }
            } else {
                // Committed: keep walking. The kerb gate sized the crossing to fit inside the
                // stopped phase, and vehicles hold at their stop line while this crosswalk is
                // occupied (the engine's plan phase), so the road ahead stays theirs.
                w.u += step;
                w.state = WalkerState.CROSS;
            }
        }

        if (w.u < 0) {
            w.u = 0;
        }
        if (w.u >= 1) {
            w.u -= 1;
            w.i++;
            if (w.i >= w.pts.size() - 1) {
                w.state = WalkerState.DONE;
            } else if (w.pts.get(w.i).cross != null) {
                // Start every crossing leg exactly AT the kerb foot: carrying a short footpath
                // leg's leftover fraction into the crossing would teleport the walker onto the
                // carriageway without the kerb gate above ever running.
                w.u = 0;
            }
        }
        position(w);
    }

    /**
     * A walker may cross a street only when the through movement PARALLEL to the walk is solid
     * green - exactly when the street being crossed (and its turns) is fully stopped. Crossing
     * the N/S street needs E/W through green and vice versa. This is the same rule the frontend
     * uses to light its WALK heads, so the walkers and their signals always agree.
     */
    static boolean walkOn(SignalState signals, Kind kind) {
        if (signals == null) {
            return false;
        }
        Approach parallel = kind == Kind.NS ? Approach.EAST : Approach.NORTH;
        return signals.through().get(parallel) == SignalColor.GREEN;
    }

    /**
     * Gap acceptance: no MOVING vehicle within {@code CROSS_CLEAR} of this crosswalk on the
     * street being crossed. Queued cars sitting at the red are harmless - they hold behind the
     * stop line, past the crosswalk - so only motion counts.
     */
    private boolean gapClear(Cross cross, double[][] vehicles) {
        double lat = cross.sign * crossLat;
        for (double[] v : vehicles) {
            if (v[2] < 2) {
                continue;
            }
            double along = cross.kind == Kind.NS ? Math.abs(v[1] - lat) : Math.abs(v[0] - lat);
            double across = cross.kind == Kind.NS ? Math.abs(v[0]) : Math.abs(v[1]);
            if (across > roadHalf + 1) {
                continue;
            }
            if (along < CROSS_CLEAR) {
                return false;
            }
        }
        return true;
    }

    private void rerouteToEdge(Walker w) {
        int c = nearestCorner(w.x, w.y);
        List<Pt> pts = new ArrayList<>();
        pts.add(new Pt(w.x, w.y));
        pts.add(new Pt(corners[c][0], corners[c][1]));
        Loc exit = exitAtCorner(c);
        pts.add(new Pt(exit.x, exit.y));
        w.pts = pts;
        w.i = 0;
        w.u = 0;
        w.state = WalkerState.WALK;
        w.waitMs = 0;
        position(w);
    }

    private void position(Walker w) {
        if (w.i >= w.pts.size() - 1) {
            Pt e = w.pts.get(w.pts.size() - 1);
            w.x = e.x;
            w.y = e.y;
            return;
        }
        Pt a = w.pts.get(w.i);
        Pt b = w.pts.get(w.i + 1);
        double u = Math.max(0, Math.min(1, w.u));
        double dx = b.x - a.x;
        double dy = b.y - a.y;
        double len = Math.hypot(dx, dy);
        if (len < 1e-9) {
            len = 1;
        }
        w.x = a.x + (b.x - a.x) * u;
        w.y = a.y + (b.y - a.y) * u;
        w.fx = dx / len;
        w.fy = dy / len;
    }

    // ---------------------------------------------------------------------------------------
    // Routes
    // ---------------------------------------------------------------------------------------

    private static int quadCorner(double sx, double sy) {
        return sx > 0 ? (sy > 0 ? 0 : 3) : (sy > 0 ? 1 : 2);
    }

    private int nearestCorner(double x, double y) {
        return quadCorner(x >= 0 ? 1 : -1, y >= 0 ? 1 : -1);
    }

    private Loc exitAtCorner(int c) {
        double sx = corners[c][0] > 0 ? 1 : -1;
        double sy = corners[c][1] > 0 ? 1 : -1;
        return rng.nextBoolean()
                ? new Loc(sx * pedLat, sy * FAR_WALK, c)
                : new Loc(sx * FAR_WALK, sy * pedLat, c);
    }

    /** A random origin/destination: a point on a footpath strip, or a map-edge exit. */
    private Loc pickLoc() {
        int c = rng.nextInt(4);
        double sx = corners[c][0] > 0 ? 1 : -1;
        double sy = corners[c][1] > 0 ? 1 : -1;
        if (rng.nextDouble() < 0.3) {
            return exitAtCorner(c);
        }
        double along = pedLat + 3 + rng.nextDouble() * (FAR_WALK - pedLat - 8);
        return rng.nextBoolean()
                ? new Loc(sx * pedLat, sy * along, c)
                : new Loc(sx * along, sy * pedLat, c);
    }

    /** Shortest walk around the corner ring 0-1-2-3-0. */
    private static List<Integer> ringPath(int ci, int cd) {
        int fwd = (cd - ci + 4) % 4;
        List<Integer> seq = new ArrayList<>();
        seq.add(ci);
        int c = ci;
        if (fwd <= 2) {
            for (int s = 0; s < fwd; s++) {
                c = (c + 1) % 4;
                seq.add(c);
            }
        } else {
            for (int s = 0; s < 4 - fwd; s++) {
                c = (c + 3) % 4;
                seq.add(c);
            }
        }
        return seq;
    }

    private Cross crossingBetween(int ci, int cj) {
        return crossings[Math.min(ci, cj)][Math.max(ci, cj)];
    }

    /** The kerb "foot" of a crosswalk at a given corner: on that corner's footpath midline. */
    private double[] crossFoot(Cross cw, int corner) {
        return cw.kind == Kind.NS
                ? new double[]{corners[corner][0], cw.sign * crossLat}
                : new double[]{cw.sign * crossLat, corners[corner][1]};
    }

    private void pushPt(List<Pt> pts, double x, double y) {
        if (!pts.isEmpty()) {
            Pt last = pts.get(pts.size() - 1);
            if (last.cross == null && Math.abs(last.x - x) < 0.02 && Math.abs(last.y - y) < 0.02) {
                return;
            }
        }
        pts.add(new Pt(x, y));
    }

    /** Finite waypoint route: origin -> its corner -> (cross at sanctioned crosswalks) -> dest. */
    private List<Pt> buildRoute(Loc o, Loc d) {
        List<Pt> pts = new ArrayList<>();
        pushPt(pts, o.x, o.y);
        pushPt(pts, corners[o.corner][0], corners[o.corner][1]);
        if (o.corner != d.corner) {
            List<Integer> seq = ringPath(o.corner, d.corner);
            for (int k = 0; k < seq.size() - 1; k++) {
                int ci = seq.get(k);
                int cj = seq.get(k + 1);
                Cross cw = crossingBetween(ci, cj);
                double[] fi = crossFoot(cw, ci);
                double[] fj = crossFoot(cw, cj);
                pushPt(pts, fi[0], fi[1]);
                pts.get(pts.size() - 1).cross = cw; // this leg IS the carriageway crossing
                pushPt(pts, fj[0], fj[1]);
                pushPt(pts, corners[cj][0], corners[cj][1]);
            }
        }
        pushPt(pts, d.x, d.y);
        return pts;
    }

    private Walker spawn(boolean warm) {
        Loc o = pickLoc();
        Loc d = pickLoc();
        for (int t = 0; t < 4 && Math.hypot(d.x - o.x, d.y - o.y) < 22; t++) {
            d = pickLoc();
        }
        Walker w = new Walker(++idCounter, rng.nextInt(PALETTE_SIZE),
                3.7 + rng.nextDouble() * 1.7, buildRoute(o, d));
        if (warm) {
            // Start on a random footpath leg (never mid-carriageway) so the no-overlap
            // invariant holds from the very first tick.
            List<Integer> foot = new ArrayList<>();
            for (int k = 0; k < w.pts.size() - 1; k++) {
                if (w.pts.get(k).cross == null) {
                    foot.add(k);
                }
            }
            if (!foot.isEmpty()) {
                w.i = foot.get(rng.nextInt(foot.size()));
                w.u = rng.nextDouble() * 0.9;
            }
        }
        position(w);
        return w;
    }

    private void repopulate() {
        for (int k = 0; k < targetPop; k++) {
            walkers.add(spawn(true));
        }
    }

    // ---------------------------------------------------------------------------------------
    // Published state (built fresh each step on the clock thread)
    // ---------------------------------------------------------------------------------------

    /**
     * Which arms' crosswalks currently carry a walker (indexed by {@link Approach} ordinal).
     * The plan phase holds any vehicle whose route sweeps an occupied crosswalk at its stop
     * line, so this is the vehicles' view of the pedestrians.
     */
    public boolean[] occupiedArms() {
        boolean[] occ = new boolean[Approach.values().length];
        for (Walker w : walkers) {
            Cross c = currentCrossing(w);
            if (c != null && w.state == WalkerState.CROSS) {
                occ[c.arm.ordinal()] = true;
            }
        }
        return occ;
    }

    private Cross currentCrossing(Walker w) {
        if (w.i >= w.pts.size() - 1) {
            return null;
        }
        return w.pts.get(w.i).cross;
    }

    public List<PedestrianView> views() {
        List<PedestrianView> out = new ArrayList<>(walkers.size());
        for (Walker w : walkers) {
            out.add(new PedestrianView(w.id, round(w.x), round(w.y), round(w.fx), round(w.fy),
                    w.color, w.state == WalkerState.CROSS));
        }
        return out;
    }

    public int population() {
        return walkers.size();
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0; // millimeter precision keeps the payload small
    }

    /** True when any walker is physically on the given street's carriageway (for tests). */
    public boolean anyOnCarriageway(boolean nsStreet) {
        for (Walker w : walkers) {
            Cross c = currentCrossing(w);
            if (c == null || (c.kind == Kind.NS) != nsStreet) {
                continue;
            }
            double t = c.kind == Kind.NS ? w.x : w.y;
            if (Math.abs(t) < roadEdge) {
                return true;
            }
        }
        return false;
    }

    public void reset() {
        walkers.clear();
        spawnAccMs = 0;
        repopulate();
    }
}
