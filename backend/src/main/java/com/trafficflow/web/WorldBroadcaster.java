package com.trafficflow.web;

import com.trafficflow.engine.WorldPublisher;
import com.trafficflow.model.SimulationStats;
import com.trafficflow.model.WorldSnapshot;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Publishes simulation output to the STOMP topics. {@link SimpMessagingTemplate} is thread-safe,
 * so the engine's broadcaster thread, stats thread, and emergency thread can all send without
 * additional locking.
 */
@Component
public class WorldBroadcaster implements WorldPublisher {

    private final SimpMessagingTemplate messaging;

    public WorldBroadcaster(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    @Override
    public void publishWorld(WorldSnapshot snapshot) {
        messaging.convertAndSend("/topic/world", snapshot);
    }

    @Override
    public void publishStats(SimulationStats stats) {
        messaging.convertAndSend("/topic/stats", stats);
    }

    @Override
    public void publishAlert(String message) {
        messaging.convertAndSend("/topic/alerts", Map.of("message", message, "ts", System.currentTimeMillis()));
    }
}
