package com.trafficflow.control;

import com.trafficflow.config.SimulationProperties;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Live, thread-safe simulation settings the user changes from the control panel. Every field
 * is independently atomic (volatile doubles are atomic for read/write in Java; counts use
 * {@link AtomicInteger}), so any thread may read the current value without locking. Writes
 * arrive from the command queue drained on the clock thread, keeping changes ordered.
 */
@Component
public class SimulationControls {

    private volatile double speedMultiplier = 1.0;
    private final AtomicInteger targetVehicles = new AtomicInteger();
    private volatile double nsGreenSeconds;
    private volatile double ewGreenSeconds;
    private volatile double leftGreenSeconds;
    private volatile double yellowSeconds;
    private volatile double allRedSeconds;
    private volatile boolean paused = false;

    private final SimulationProperties props;

    public SimulationControls(SimulationProperties props) {
        this.props = props;
        resetToDefaults();
    }

    /**
     * Restore every live setting to its startup default. Used by the engine's world reset so that
     * pressing Reset truly returns the simulation to its original state (speed 1x, default density
     * and signal timings, and not paused).
     */
    public void resetToDefaults() {
        this.speedMultiplier = 1.0;
        this.targetVehicles.set(props.getTargetVehicles());
        this.nsGreenSeconds = props.getNsGreenSeconds();
        this.ewGreenSeconds = props.getEwGreenSeconds();
        this.leftGreenSeconds = 5.0;
        this.yellowSeconds = props.getYellowSeconds();
        this.allRedSeconds = props.getAllRedSeconds();
        this.paused = false;
    }

    public double getSpeedMultiplier() { return speedMultiplier; }
    public void setSpeedMultiplier(double v) { this.speedMultiplier = clamp(v, 0.1, 8.0); }

    public int getTargetVehicles() { return targetVehicles.get(); }
    public void setTargetVehicles(int v) { this.targetVehicles.set((int) clamp(v, 0, 120)); }

    public double getNsGreenSeconds() { return nsGreenSeconds; }
    public void setNsGreenSeconds(double v) { this.nsGreenSeconds = clamp(v, 3.0, 60.0); }

    public double getEwGreenSeconds() { return ewGreenSeconds; }
    public void setEwGreenSeconds(double v) { this.ewGreenSeconds = clamp(v, 3.0, 60.0); }

    public double getLeftGreenSeconds() { return leftGreenSeconds; }
    public void setLeftGreenSeconds(double v) { this.leftGreenSeconds = clamp(v, 3.0, 30.0); }

    public double getYellowSeconds() { return yellowSeconds; }
    public void setYellowSeconds(double v) { this.yellowSeconds = clamp(v, 1.0, 6.0); }

    public double getAllRedSeconds() { return allRedSeconds; }
    public void setAllRedSeconds(double v) { this.allRedSeconds = clamp(v, 0.5, 4.0); }

    public boolean isPaused() { return paused; }
    public void setPaused(boolean v) { this.paused = v; }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
