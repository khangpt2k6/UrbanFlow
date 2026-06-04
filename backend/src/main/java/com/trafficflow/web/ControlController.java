package com.trafficflow.web;

import com.trafficflow.control.ControlCommand;
import com.trafficflow.engine.SimulationEngine;
import com.trafficflow.model.Approach;
import com.trafficflow.model.VehicleType;
import com.trafficflow.model.WorldSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Receives control-panel commands over STOMP ({@code /app/control}) and a mirrored REST endpoint
 * ({@code POST /api/control}) used for testing and non-STOMP clients. Each message is translated
 * into a {@link ControlCommand} and enqueued onto the engine; the clock thread applies it.
 */
@RestController
public class ControlController {

    private static final Logger log = LoggerFactory.getLogger(ControlController.class);

    private final SimulationEngine engine;

    public ControlController(SimulationEngine engine) {
        this.engine = engine;
    }

    @MessageMapping("/control")
    public void onStompControl(ControlMessage message) {
        dispatch(message);
    }

    @PostMapping("/api/control")
    public ResponseEntity<Void> onRestControl(@RequestBody ControlMessage message) {
        dispatch(message);
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/api/snapshot")
    public WorldSnapshot snapshot() {
        return engine.currentSnapshot();
    }

    @GetMapping("/api/health")
    public String health() {
        return "ok";
    }

    private void dispatch(ControlMessage m) {
        try {
            ControlCommand command = toCommand(m);
            if (command != null) {
                engine.enqueue(command);
            }
        } catch (Exception e) {
            log.warn("ignoring malformed control message {}: {}", m, e.toString());
        }
    }

    private ControlCommand toCommand(ControlMessage m) {
        if (m == null || m.type() == null) {
            return null;
        }
        return switch (m.type()) {
            case "setSpeed" -> new ControlCommand.SetSpeed(m.value());
            case "setDensity" -> new ControlCommand.SetDensity(m.count());
            case "setSignalDuration" -> new ControlCommand.SetSignalDuration(m.phase(), m.seconds());
            case "spawnEmergency" -> new ControlCommand.SpawnEmergency(
                    VehicleType.valueOf(m.vehicleType()), Approach.valueOf(m.approach()));
            case "spawnCivilian" -> new ControlCommand.SpawnCivilian();
            case "setPaused" -> new ControlCommand.SetPaused(Boolean.TRUE.equals(m.paused()));
            case "reset" -> new ControlCommand.ResetWorld();
            default -> {
                log.warn("unknown control type '{}'", m.type());
                yield null;
            }
        };
    }
}
