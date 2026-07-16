// k6 load test for the UrbanFlow real-time stream.
//
// Each virtual user opens a raw WebSocket to the SockJS endpoint (/ws/websocket),
// performs a STOMP handshake, and subscribes to /topic/world (30 Hz world snapshots)
// and /topic/stats (4 Hz engine stats) - exactly what the browser control panel does.
//
// Before the swarm connects, setup() acts as the operator and pushes vehicle density
// to the 120-vehicle maximum through the mirrored REST control endpoint, so the whole
// test runs against peak simulation load. teardown() restores the default density.
//
// Run (backend must be up on :8080):
//   k6 run loadtest/k6-stomp-load.js
//   k6 run -e VUS=100 -e SESSION_SECONDS=90 -e BASE=localhost:8080 loadtest/k6-stomp-load.js
//
// Pass/fail gates (thresholds):
//   - every VU completes the STOMP handshake
//   - world snapshots keep flowing at ~30 Hz (p95 inter-frame gap < 150 ms)
//   - the engine reports ZERO collisions for the entire test
//   - density actually climbs to 100+ live vehicles (the operator command took effect)

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'localhost:8080';
const VUS = Number(__ENV.VUS || 50);
const SESSION_SECONDS = Number(__ENV.SESSION_SECONDS || 55);

const stompConnected = new Rate('stomp_handshake_ok');
const stompConnectTime = new Trend('stomp_connect_time_ms', true);
const worldFrames = new Counter('world_frames');
const worldFrameGap = new Trend('world_frame_gap_ms', true);
const statsFrames = new Counter('stats_frames');
const vehiclesLive = new Trend('vehicles_live');
const engineUpdatesPerSec = new Trend('engine_updates_per_sec');
const collisionsObserved = new Counter('collisions_observed');

export const options = {
    scenarios: {
        spectators: {
            executor: 'constant-vus',
            vus: VUS,
            duration: `${SESSION_SECONDS + 5}s`,
            gracefulStop: '15s',
        },
    },
    thresholds: {
        checks: ['rate>0.99'],
        stomp_handshake_ok: ['rate==1'],
        world_frame_gap_ms: ['p(95)<150'],
        collisions_observed: ['count<1'],
        vehicles_live: ['max>=100'],
    },
};

// STOMP frames are text with \n-separated headers and a NUL terminator.
const NUL = String.fromCharCode(0);

function frame(command, headers, body = '') {
    const head = Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n');
    return `${command}\n${head}\n\n${body}${NUL}`;
}

function parseFrame(raw) {
    if (raw === '\n' || raw === '') return { command: 'HEARTBEAT', headers: {}, body: '' };
    const headerEnd = raw.indexOf('\n\n');
    const lines = raw.slice(0, headerEnd).split('\n');
    const command = lines[0];
    const headers = {};
    for (const line of lines.slice(1)) {
        const i = line.indexOf(':');
        if (i > 0) headers[line.slice(0, i)] = line.slice(i + 1);
    }
    const body = raw.slice(headerEnd + 2).replace(NUL, '');
    return { command, headers, body };
}

export function setup() {
    // Operator action: raise density to the 120-vehicle ceiling so we load-test peak state.
    const res = http.post(`http://${BASE}/api/control`,
        JSON.stringify({ type: 'setDensity', count: 120 }),
        { headers: { 'Content-Type': 'application/json' } });
    check(res, { 'operator setDensity(120) accepted': (r) => r.status === 202 });
}

export function teardown() {
    http.post(`http://${BASE}/api/control`,
        JSON.stringify({ type: 'setDensity', count: 50 }),
        { headers: { 'Content-Type': 'application/json' } });
}

export default function () {
    // Stagger connections a little so 50 handshakes don't land in the same millisecond.
    sleep(Math.random() * 2);

    const openedAt = Date.now();
    let handshakeDone = false;
    let lastWorldAt = 0;
    let sawWorld = false;
    let sawStats = false;

    const res = ws.connect(`ws://${BASE}/ws/websocket`, {}, (socket) => {
        socket.on('open', () => {
            socket.send(frame('CONNECT', { 'accept-version': '1.1,1.2', 'heart-beat': '0,0' }));
        });

        socket.on('message', (raw) => {
            const f = parseFrame(raw);

            if (f.command === 'CONNECTED') {
                handshakeDone = true;
                stompConnectTime.add(Date.now() - openedAt);
                socket.send(frame('SUBSCRIBE', { id: 'sub-world', destination: '/topic/world' }));
                socket.send(frame('SUBSCRIBE', { id: 'sub-stats', destination: '/topic/stats' }));
                return;
            }

            if (f.command !== 'MESSAGE') return;

            if (f.headers.destination === '/topic/world') {
                sawWorld = true;
                worldFrames.add(1);
                const now = Date.now();
                if (lastWorldAt > 0) worldFrameGap.add(now - lastWorldAt);
                lastWorldAt = now;
            } else if (f.headers.destination === '/topic/stats') {
                sawStats = true;
                statsFrames.add(1);
                try {
                    const stats = JSON.parse(f.body);
                    vehiclesLive.add(stats.totalVehicles);
                    engineUpdatesPerSec.add(stats.updatesPerSecond);
                    if (stats.collisions > 0) collisionsObserved.add(stats.collisions);
                } catch (_) { /* count the frame, skip malformed body */ }
            }
        });

        socket.on('error', () => socket.close());
        socket.setTimeout(() => socket.close(), SESSION_SECONDS * 1000);
    });

    stompConnected.add(handshakeDone);
    check(res, { 'websocket upgraded (101)': (r) => r && r.status === 101 });
    check(null, {
        'stomp CONNECTED received': () => handshakeDone,
        'world snapshots received': () => sawWorld,
        'stats frames received': () => sawStats,
    });
}
