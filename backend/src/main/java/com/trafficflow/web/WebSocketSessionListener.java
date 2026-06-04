package com.trafficflow.web;

import com.trafficflow.engine.SimulationEngine;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Tracks how many browsers are connected over STOMP and tells the engine to run only while at
 * least one is. With nobody watching, the simulation stays idle and the road is empty; it springs
 * to life the moment a client connects.
 */
@Component
public class WebSocketSessionListener {

    private final SimulationEngine engine;
    private final AtomicInteger sessions = new AtomicInteger(0);

    public WebSocketSessionListener(SimulationEngine engine) {
        this.engine = engine;
    }

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        engine.setClientsConnected(sessions.incrementAndGet() > 0);
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        int count = sessions.updateAndGet(n -> Math.max(0, n - 1));
        engine.setClientsConnected(count > 0);
    }
}
