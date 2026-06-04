# TrafficFlow - Real-Time Concurrent Traffic Control Simulation

Design spec. Date: 2026-06-04.

## 1. Goal

A real-time traffic simulation that demonstrably:

- Handles 70+ concurrent vehicles across 9 vehicle types on a 24-lane intersection.
- Maintains 100% safety (zero collisions) via car-following safe-distance, lane discipline, signalized right-of-way, and emergency-vehicle priority.
- Runs a concurrent processing architecture in Java using ~30 managed threads with no race conditions and no deadlocks, processing 2,100+ vehicle-updates per second.
- Exposes an interactive control panel for live monitoring (stats + emergency alerts) and full control over speed, density, and signal duration.

This is Phase 1: a full 2D vertical slice. A three.js 3D view is Phase 2 and reuses the same backend feed.

## 2. Toolchain (verified on dev machine)

- Java 17 (Temurin 17.0.18). No Java 21 features (no virtual threads); fixed platform-thread pools only.
- Spring Boot 3.2.x, Maven 3.9.11.
- Node 24 / npm 11, Vite + React + TypeScript.
- In-memory only. No database.

## 3. Repository layout

```
TrafficControl/
  backend/                         Spring Boot 3 (Java 17, Maven)
    pom.xml
    src/main/java/com/trafficflow/
      TrafficFlowApplication.java
      config/        SimulationProperties, ThreadPoolConfig
      model/         VehicleType, Movement, Approach, Direction, Vehicle, Lane,
                     SignalPhase, SignalState, WorldSnapshot, VehicleView
      geometry/      IntersectionLayout, LanePath, Vec2
      behavior/      CarFollowingModel (IDM), GapAcceptance, RoutePlanner, VehicleKinematics
      engine/        SimulationEngine, TickResult, SimulationClock
      control/       SignalController, EmergencyDispatcher, VehicleSpawner, SimulationControls
      safety/        SafetyMonitor
      stats/         StatsAggregator, SimulationStats
      web/           StompConfig, WebConfig, WorldBroadcaster, ControlController, dto/*
    src/main/resources/application.yml
    src/test/java/com/trafficflow/...
  frontend/                        Vite + React + TS
    src/
      main.tsx, App.tsx
      stomp/useTrafficStream.ts
      render/CanvasView.tsx, draw.ts, interpolate.ts, layout.ts
      panels/ControlPanel.tsx, StatsPanel.tsx, AlertsFeed.tsx
      types/snapshot.ts
      api/control.ts
  docs/superpowers/specs/2026-06-04-traffic-control-design.md
  README.md
```

## 4. Concurrency architecture (the core)

### 4.1 Tick loop (3 phases at 30 Hz)

`SimulationEngine` runs a fixed-rate tick every ~33 ms driven by a single-thread
`ScheduledExecutorService` (the clock). Each tick:

1. **Plan (parallel).** The current immutable `WorldSnapshot` is the only input.
   The vehicle list is split into N batches; each batch is submitted to a fixed
   `ExecutorService` (default 24 worker threads). A worker computes each vehicle's
   next kinematic state (accel/speed/position, lane-change intent, stop-for-signal)
   by reading the previous snapshot only. Workers never mutate shared state and never
   take locks. Join via `invokeAll` + `Future.get` (effectively a barrier).
2. **Commit (single-threaded).** The clock thread applies the computed `VehicleUpdate`s,
   resolves spawns/despawns, advances vehicles into/out of the intersection, and builds
   a brand-new immutable `WorldSnapshot`. Single-writer = no write-write races.
3. **Broadcast (async).** The new snapshot is published to `WorldBroadcaster`, which
   pushes it onto the STOMP `/topic/world` channel from the broadcaster thread.

**Why this is race-free and deadlock-free by construction:** during the parallel phase
no shared mutable state is written and no locks are held, so there are no data races and
no lock cycles. All mutation happens single-threaded in commit. Cross-thread visibility
is guaranteed by publishing each tick's state as a new immutable object through a
`volatile`/`AtomicReference` handoff (happens-before via safe publication).

### 4.2 Thread budget (~30)

| Thread(s) | Count | Role |
|---|---|---|
| `traffic-worker-*` | 24 | parallel plan-phase compute pool |
| `sim-clock` | 1 | fixed-rate tick scheduler + commit |
| `signal-controller` | 1 | traffic-light phase state machine |
| `emergency-dispatcher` | 1 | emergency spawn + signal preemption |
| `vehicle-spawner` | 1 | density management (spawn/despawn) |
| `stats-aggregator` | 1 | rolls up stats ~4 Hz |
| `world-broadcaster` | 1 | STOMP push |
| **Total** | **30** | |

Pool size is configurable via `application.yml` (`simulation.worker-threads`, default 24)
so the 30 headline holds while staying tunable. Controllers communicate with the engine
through thread-safe command queues (`ConcurrentLinkedQueue`) and `AtomicReference` config,
drained at the start of each commit phase, so controller threads never touch world state
directly.

### 4.3 Throughput

70 vehicles x 30 ticks/s = 2,100 vehicle-updates/s. The engine measures and reports the
real figure (`updatesPerSecond`) over a sliding window; the stat is demonstrated live.

## 5. Safety model (-> 100% safety)

1. **Car-following safe distance (IDM).** Intelligent Driver Model: a vehicle's
   acceleration is reduced as it nears the safe gap to its leader, guaranteeing it never
   closes inside a minimum bumper-to-bumper distance. No rear-end collisions.
2. **Lane discipline + gap acceptance.** Lane changes / filtering commit only when both the
   lead and lag gaps in the target lane exceed safe thresholds.
3. **Signalized intersection.** A movement may enter the intersection box only on green.
   Conflicting phases are separated by a yellow + all-red clearance interval, so no two
   conflicting movements are ever simultaneously permitted. No cross-traffic collisions.
4. **Emergency preemption.** When an emergency vehicle is within a trigger distance of the
   stop line, the dispatcher requests the controller to preempt: serve that approach green,
   force conflicting approaches to red (after clearance). Civilian vehicles ahead in the
   emergency lane yield (decelerate / hold).
5. **SafetyMonitor invariant.** Every tick, after commit, the monitor verifies the
   minimum-gap invariant per lane and that no two vehicles overlap. Any violation increments
   a collision counter (target: always 0) and is logged. The live `collisions = 0` figure is
   what the UI surfaces as "100% safe." This is a runtime proof, not a claim.

## 6. Domain model

### 6.1 Vehicle types (9)

| Type | Length (m) | Max speed | Accel profile | Emergency | Notes |
|---|---|---|---|---|---|
| Bicycle | 1.8 | low | low | no | hugs lane edge, slow |
| Motorcycle | 2.2 | high | high | no | agile, small gaps |
| Car | 4.5 | high | med | no | baseline |
| SUV | 4.9 | med-high | med | no | |
| Van | 5.5 | med | med-low | no | delivery |
| Bus | 12.0 | low-med | low | no | long, slow accel |
| Truck | 16.5 | low | low | no | semi, longest |
| Ambulance | 6.0 | high | med-high | YES | priority + preemption |
| FireTruck | 10.0 | med | low-med | YES | priority + preemption |

Each type carries: length, maxSpeed, maxAccel, comfortableDecel, color, and `emergency` flag.

### 6.2 Geometry: single 4-way intersection, 24 lanes

- 4 approaches: North, South, East, West.
- Each approach has 6 lanes: 3 inbound (left-turn, through, right-turn) + 3 outbound. 4 x 6 = 24.
- Coordinate system in meters, origin at intersection center. Approaches are 120 m long.
- Each lane is a `LanePath`: an ordered polyline. Straight approach segments plus curved
  turn paths through the intersection box (left/right turn arcs) so vehicles follow smooth
  routes. The frontend maps meters -> canvas pixels.

### 6.3 Routing

`RoutePlanner` assigns each spawned vehicle an inbound lane consistent with a chosen
movement (left/through/right) and the matching outbound lane on the destination approach.
Turn movements traverse the appropriate curved path through the box.

### 6.4 Signals

`SignalState` holds, per approach + movement, one of GREEN / YELLOW / RED. The controller
runs a ring: NS-through+right green -> NS yellow -> all-red -> EW green -> ... (left turns
can share a protected sub-phase, kept simple in Phase 1: left turns yield-on-green is out;
left turns get their movement permitted only during their approach's green with gap
acceptance against opposing through traffic OR a dedicated protected left - Phase 1 uses
protected lefts within the approach green for simplicity and guaranteed safety). Phase
durations (NS green, EW green, yellow, all-red) are live-configurable.

### 6.5 Snapshots

`WorldSnapshot` (immutable record): tickId, simTimeMs, `List<VehicleView>`, `SignalState`,
`SimulationStats`. `VehicleView` is a compact render record: id, typeOrdinal, x, y, headingRad,
speed. Serialized to JSON for STOMP. Keys kept short / arrays where it matters for 30 Hz.

## 7. Transport (STOMP over WebSocket)

- Endpoint: `/ws` (SockJS fallback enabled). Broker: Spring SimpleBroker.
- `/topic/world` - full `WorldSnapshot` ~30 Hz.
- `/topic/stats` - `SimulationStats` ~4 Hz (also embedded in world for convenience).
- `/topic/alerts` - emergency events (dispatched, preemption-active, cleared).
- `/app/control` - client -> server commands (see below), handled by `ControlController`
  which enqueues onto the engine's command queue.

### 7.1 Control commands

| Command | Payload | Effect |
|---|---|---|
| `setSpeed` | multiplier 0.25-4.0 | global sim speed scale |
| `setDensity` | targetCount 0-120 | spawner target vehicle count |
| `setSignalDuration` | phase, seconds | live signal timing |
| `spawnEmergency` | type (AMBULANCE/FIRETRUCK), approach | inject emergency vehicle |
| `setPaused` | bool | pause/resume tick loop |
| `reset` | - | clear world, reset stats |

## 8. Frontend (2D)

- `useTrafficStream` - STOMP client (`@stomp/stompjs` + `sockjs-client`), subscribes to
  topics, stores latest + previous snapshot in refs for interpolation, exposes a `send`
  for control commands.
- `CanvasView` - `requestAnimationFrame` loop. Interpolates vehicle positions between the
  last two snapshots (render decoupled from the 30 Hz feed) for smooth motion. Draws:
  asphalt + lane markings + stop lines, the intersection box, signal heads (colored), and
  vehicles as oriented rounded rectangles colored by type, with a flashing halo for active
  emergency vehicles.
- `ControlPanel` - sliders (speed 0.25-4x, density 0-120, NS green, EW green, yellow,
  all-red) + buttons (spawn ambulance, spawn fire truck, pause/resume, reset).
- `StatsPanel` - live: total vehicles, per-type breakdown, throughput (vehicles cleared/min),
  avg speed, updates/sec, active threads, collisions (0, with a green check), sim time.
- `AlertsFeed` - scrolling list of emergency events.
- A legend mapping color -> vehicle type.

## 9. Testing

### Backend (JUnit 5)
- `CarFollowingModelTest` - acceleration negative when gap below safe; converges to leader speed.
- `GapAcceptanceTest` - rejects unsafe lane changes, accepts safe ones.
- `SignalControllerTest` - phase ring ordering; conflicting phases never both green;
  all-red clearance present; duration changes apply.
- `EmergencyPreemptionTest` - approaching emergency flips its approach green and conflicting to red.
- `SafetyMonitorTest` - detects an injected overlap; passes on valid states.
- `SimulationEngineStressTest` - run 70+ vehicles for several thousand ticks:
  assert zero collisions, no exceptions/deadlock (completes within a time bound),
  and measured updates/sec >= 2100. Repeated to shake out races.

### Frontend (Vitest)
- `interpolate` unit tests (position/heading lerp, wrap-around heading).
- `layout` meter->pixel mapping tests.
- Render smoke test (CanvasView mounts with a mock snapshot).

## 10. Success criteria

- `mvn test` green, including the concurrency stress test hitting >= 2100 updates/s and 0 collisions.
- `npm run build` green; app runs locally (`mvn spring-boot:run` + `npm run dev`), browser
  shows live traffic, controls work, stats update, emergency preemption visibly works.
- Headline metrics (70+ vehicles, 24 lanes, 9 types, ~30 threads, 2100+ updates/s, 0 collisions)
  all visible in the StatsPanel during a run.

## 11. Phase 2 (out of scope now)

three.js 3D renderer subscribing to the same `/topic/world` feed; a view toggle in the UI.
No backend changes required.
