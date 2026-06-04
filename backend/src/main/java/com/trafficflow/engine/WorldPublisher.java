package com.trafficflow.engine;

import com.trafficflow.model.SimulationStats;
import com.trafficflow.model.WorldSnapshot;

/**
 * Sink for outbound updates. Implemented by the STOMP broadcaster in production and by a no-op
 * in tests, so the engine has no direct dependency on the web layer.
 */
public interface WorldPublisher {

    void publishWorld(WorldSnapshot snapshot);

    void publishStats(SimulationStats stats);

    void publishAlert(String message);
}
