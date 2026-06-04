package com.trafficflow.web;

/**
 * Loosely-typed control payload sent by the browser over STOMP ({@code /app/control}) or REST
 * ({@code POST /api/control}). The {@code type} field selects the command; the remaining fields
 * are populated as needed. Unused fields are null.
 */
public record ControlMessage(String type,
                             Double value,
                             Integer count,
                             String phase,
                             Double seconds,
                             String vehicleType,
                             String approach,
                             Boolean paused) {
}
