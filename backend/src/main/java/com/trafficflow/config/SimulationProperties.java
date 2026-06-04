package com.trafficflow.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Startup configuration for the simulation, bound from the {@code simulation.*} keys in
 * application.yml. Values that the user can change live at runtime (signal durations,
 * global speed, target vehicle count) are mirrored into {@code SimulationControls}; these
 * properties only provide the initial defaults.
 */
@ConfigurationProperties(prefix = "simulation")
public class SimulationProperties {

    /** Size of the parallel plan-phase worker pool. */
    private int workerThreads = 24;
    /** Simulation ticks per second. */
    private int tickHz = 30;
    /** Default target number of concurrent vehicles (Average mode; off-peak/rush adjust it live). */
    private int targetVehicles = 45;
    /** Approach length in meters (approach edge to stop line). */
    private double approachLengthM = 120.0;
    /** Lane width in meters. */
    private double laneWidthM = 3.5;
    /** Half-width of the central intersection box in meters. */
    private double intersectionHalfM = 14.0;
    /** Deterministic RNG seed for spawning/routing. */
    private long randomSeed = 20260604L;
    /** Default North-South green duration (seconds). */
    private double nsGreenSeconds = 15.0;
    /** Default East-West green duration (seconds). */
    private double ewGreenSeconds = 15.0;
    /** Yellow duration (seconds). */
    private double yellowSeconds = 3.0;
    /** All-red clearance duration (seconds). */
    private double allRedSeconds = 2.0;
    /** Distance before the stop line at which an emergency vehicle triggers preemption. */
    private double emergencyTriggerM = 80.0;

    public int getWorkerThreads() { return workerThreads; }
    public void setWorkerThreads(int v) { this.workerThreads = v; }

    public int getTickHz() { return tickHz; }
    public void setTickHz(int v) { this.tickHz = v; }

    public int getTargetVehicles() { return targetVehicles; }
    public void setTargetVehicles(int v) { this.targetVehicles = v; }

    public double getApproachLengthM() { return approachLengthM; }
    public void setApproachLengthM(double v) { this.approachLengthM = v; }

    public double getLaneWidthM() { return laneWidthM; }
    public void setLaneWidthM(double v) { this.laneWidthM = v; }

    public double getIntersectionHalfM() { return intersectionHalfM; }
    public void setIntersectionHalfM(double v) { this.intersectionHalfM = v; }

    public long getRandomSeed() { return randomSeed; }
    public void setRandomSeed(long v) { this.randomSeed = v; }

    public double getNsGreenSeconds() { return nsGreenSeconds; }
    public void setNsGreenSeconds(double v) { this.nsGreenSeconds = v; }

    public double getEwGreenSeconds() { return ewGreenSeconds; }
    public void setEwGreenSeconds(double v) { this.ewGreenSeconds = v; }

    public double getYellowSeconds() { return yellowSeconds; }
    public void setYellowSeconds(double v) { this.yellowSeconds = v; }

    public double getAllRedSeconds() { return allRedSeconds; }
    public void setAllRedSeconds(double v) { this.allRedSeconds = v; }

    public double getEmergencyTriggerM() { return emergencyTriggerM; }
    public void setEmergencyTriggerM(double v) { this.emergencyTriggerM = v; }

    public double tickDtSeconds() {
        return 1.0 / tickHz;
    }
}
