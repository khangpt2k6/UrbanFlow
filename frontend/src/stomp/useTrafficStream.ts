import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { AlertMessage, SimulationStats, WorldSnapshot } from '../types/snapshot';

const WS_URL = 'http://localhost:8080/ws';

/** How long an alert toast stays on screen before it auto-dismisses (ms). */
const ALERT_TTL_MS = 5000;

/** An alert enriched with a stable id and the client-side time it arrived (for TTL expiry). */
export interface UiAlert extends AlertMessage {
  id: number;
  rxAt: number;
}

export interface ControlPayload {
  type: string;
  value?: number;
  count?: number;
  phase?: string;
  seconds?: number;
  vehicleType?: string;
  approach?: string;
  paused?: boolean;
}

export interface TrafficStream {
  latestRef: MutableRefObject<WorldSnapshot | null>;
  prevRef: MutableRefObject<WorldSnapshot | null>;
  lastArrivalRef: MutableRefObject<number>;
  intervalRef: MutableRefObject<number>;
  stats: SimulationStats | null;
  alerts: UiAlert[];
  connected: boolean;
  send: (payload: ControlPayload) => void;
}

/**
 * Connects to the backend over STOMP. High-frequency world snapshots are stored in refs (read
 * by the canvas render loop) so they never trigger React re-renders; stats and alerts arrive on
 * their own lower-frequency channels and drive the panels.
 */
export function useTrafficStream(): TrafficStream {
  const latestRef = useRef<WorldSnapshot | null>(null);
  const prevRef = useRef<WorldSnapshot | null>(null);
  const lastArrivalRef = useRef<number>(0);
  const intervalRef = useRef<number>(33);
  const clientRef = useRef<Client | null>(null);
  const alertSeq = useRef(0);

  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [alerts, setAlerts] = useState<UiAlert[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = new Client({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webSocketFactory: () => new SockJS(WS_URL) as any,
      reconnectDelay: 2000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
    });

    client.onConnect = () => {
      setConnected(true);
      client.subscribe('/topic/world', (msg) => {
        const snap = JSON.parse(msg.body) as WorldSnapshot;
        const now = performance.now();
        if (latestRef.current) {
          const dt = now - lastArrivalRef.current;
          if (dt > 4 && dt < 250) intervalRef.current = dt;
        }
        prevRef.current = latestRef.current;
        latestRef.current = snap;
        lastArrivalRef.current = now;
      });
      client.subscribe('/topic/stats', (msg) => {
        setStats(JSON.parse(msg.body) as SimulationStats);
      });
      client.subscribe('/topic/alerts', (msg) => {
        const a = JSON.parse(msg.body) as AlertMessage;
        const item: UiAlert = { ...a, id: alertSeq.current++, rxAt: performance.now() };
        setAlerts((prev) => [item, ...prev].slice(0, 12));
      });
    };
    client.onWebSocketClose = () => {
      // Until the WebSocket is connected, show empty roads + scenery only (no vehicles/signals).
      setConnected(false);
      latestRef.current = null;
      prevRef.current = null;
      setStats(null);
    };
    client.activate();
    clientRef.current = client;

    return () => {
      void client.deactivate();
    };
  }, []);

  // Auto-dismiss old alert toasts so they fade out instead of piling up forever.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = performance.now() - ALERT_TTL_MS;
      setAlerts((prev) => {
        const next = prev.filter((a) => a.rxAt > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const send = useCallback((payload: ControlPayload) => {
    const c = clientRef.current;
    if (c && c.connected) {
      c.publish({ destination: '/app/control', body: JSON.stringify(payload) });
    }
  }, []);

  return { latestRef, prevRef, lastArrivalRef, intervalRef, stats, alerts, connected, send };
}
