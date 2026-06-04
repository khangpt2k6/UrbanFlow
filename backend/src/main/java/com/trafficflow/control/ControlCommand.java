package com.trafficflow.control;

import com.trafficflow.model.Approach;
import com.trafficflow.model.VehicleType;

/**
 * A command applied to the simulation. Commands are enqueued from any thread (the web layer,
 * the spawner thread, tests) onto the engine's thread-safe queue and drained once per physics
 * step on the clock thread, so all world mutation happens single-threaded and in order.
 */
public sealed interface ControlCommand
        permits ControlCommand.SetSpeed,
        ControlCommand.SetDensity,
        ControlCommand.SetSignalDuration,
        ControlCommand.SpawnEmergency,
        ControlCommand.SpawnCivilian,
        ControlCommand.SetPaused,
        ControlCommand.ResetWorld {

    record SetSpeed(double multiplier) implements ControlCommand {}

    record SetDensity(int targetVehicles) implements ControlCommand {}

    /** phase is one of: nsGreen, ewGreen, leftGreen, yellow, allRed. */
    record SetSignalDuration(String phase, double seconds) implements ControlCommand {}

    record SpawnEmergency(VehicleType type, Approach approach) implements ControlCommand {}

    /** Request to spawn one civilian vehicle; the engine chooses a clear lane and type. */
    record SpawnCivilian() implements ControlCommand {}

    record SetPaused(boolean paused) implements ControlCommand {}

    record ResetWorld() implements ControlCommand {}
}
