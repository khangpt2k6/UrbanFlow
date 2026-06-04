import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { AlertMessage, SimulationStats, WorldSnapshot } from '../types/snapshot';

const WS_URL = 'http://localhost:8080/ws';

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
  alerts: AlertMessage[];
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

  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
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
        setAlerts((prev) => [a, ...prev].slice(0, 40));
      });
    };
    client.onWebSocketClose = () => setConnected(false);
    client.activate();
    clientRef.current = client;

    return () => {
      void client.deactivate();
    };
  }, []);

  const send = useCallback((payload: ControlPayload) => {
    const c = clientRef.current;
    if (c && c.connected) {
      c.publish({ destination: '/app/control', body: JSON.stringify(payload) });
    }
  }, []);

  return { latestRef, prevRef, lastArrivalRef, intervalRef, stats, alerts, connected, send };
}
