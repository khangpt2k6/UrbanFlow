# TrafficFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, this session) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a real-time concurrent traffic simulation (Spring Boot backend + React/Canvas 2D frontend) with ~30 managed threads, 70+ vehicles, 9 types, 24 lanes, zero collisions, and a live control panel.

**Architecture:** Backend ticks an immutable world at 30 Hz via a 3-phase loop (parallel plan against the previous snapshot -> single-threaded commit -> async STOMP broadcast). Frontend subscribes over STOMP and renders an interpolated Canvas 2D view with a control/stats panel.

**Tech Stack:** Java 17, Spring Boot 3.2.x, Maven; React 18 + TypeScript + Vite; `@stomp/stompjs` + `sockjs-client`; JUnit 5; Vitest.

Reference spec: `docs/superpowers/specs/2026-06-04-traffic-control-design.md`.

---

## File map (decomposition)

### Backend `backend/src/main/java/com/trafficflow/`
- `TrafficFlowApplication.java` - Spring entry point.
- `config/SimulationProperties.java` - `@ConfigurationProperties("simulation")`: workerThreads(24), tickHz(30), targetVehicles(70), approachLengthM(120), etc.
- `config/ThreadPoolConfig.java` - named `ExecutorService` beans (workers, clock, controllers, broadcaster).
- `model/` - `VehicleType` (enum, 9), `Movement` (LEFT/THROUGH/RIGHT), `Approach` (N/S/E/W), `Direction` (INBOUND/OUTBOUND), `SignalColor` (GREEN/YELLOW/RED), `Vehicle` (mutable engine-internal), `LaneId`, `SignalState` (immutable), `WorldSnapshot` (immutable record), `VehicleView` (compact render record), `SimulationStats` (record).
- `geometry/Vec2.java`, `geometry/LanePath.java` (polyline + arc-length lookup), `geometry/IntersectionLayout.java` (builds the 24 lanes + stop lines + box).
- `behavior/Kinematics.java`, `behavior/CarFollowingModel.java` (IDM), `behavior/GapAcceptance.java`, `behavior/RoutePlanner.java`.
- `engine/SimulationEngine.java` (the 3-phase loop), `engine/VehicleUpdate.java`, `engine/SimulationClock.java` (optional thin wrapper).
- `control/SignalController.java`, `control/EmergencyDispatcher.java`, `control/VehicleSpawner.java`, `control/ControlCommand.java` (sealed/records), `control/SimulationControls.java` (atomic live config).
- `safety/SafetyMonitor.java`.
- `stats/StatsAggregator.java`.
- `web/StompConfig.java`, `web/WebConfig.java` (CORS), `web/WorldBroadcaster.java`, `web/ControlController.java`, `web/dto/*` (ControlMessage, AlertMessage).

### Frontend `frontend/src/`
- `types/snapshot.ts` - mirror of `WorldSnapshot`/`VehicleView`/`SignalState`/`SimulationStats`.
- `stomp/useTrafficStream.ts` - connect, subscribe, expose `{latestRef, prevRef, stats, alerts, send, connected}`.
- `render/layout.ts` - meter->pixel transform, must match backend layout constants.
- `render/interpolate.ts` - lerp vehicle views between two snapshots.
- `render/draw.ts` - pure canvas drawing helpers (road, lanes, signals, vehicle).
- `render/CanvasView.tsx` - rAF loop tying stream + interpolate + draw.
- `panels/ControlPanel.tsx`, `panels/StatsPanel.tsx`, `panels/AlertsFeed.tsx`.
- `App.tsx`, `main.tsx`, `App.css`.

---

## Task 0: Scaffold projects

- [ ] Backend: generate via Spring Initializr (deps: web, websocket, validation, lombok optional, configuration-processor) into `backend/`. Java 17, Maven, group `com.trafficflow`, artifact `trafficflow`, Spring Boot 3.2.x.
  - Command: `curl -s "https://start.spring.io/starter.zip?type=maven-project&language=java&javaVersion=17&bootVersion=3.2.5&groupId=com.trafficflow&artifactId=trafficflow&name=trafficflow&packageName=com.trafficflow&dependencies=web,websocket,validation,configuration-processor" -o backend.zip` then unzip into `backend/`.
- [ ] Frontend: `npm create vite@latest frontend -- --template react-ts`; then `npm i @stomp/stompjs sockjs-client` and `npm i -D @types/sockjs-client vitest jsdom @testing-library/react`.
- [ ] Verify backend builds: `cd backend && mvn -q -DskipTests package`. Verify frontend installs: `cd frontend && npm run build`.
- [ ] Commit: "Scaffold Spring Boot backend and Vite React frontend".

## Task 1: Backend domain model + geometry

Enums and records are straightforward (see spec 6.1). Key non-trivial pieces:

- `VehicleType` enum carries `lengthM, maxSpeedMps, maxAccel, comfortDecel, colorHex, emergency`.
- `LanePath`: store `List<Vec2> points`, precompute cumulative segment lengths; methods `double length()`, `Pose poseAt(double s)` returning position + heading via linear interpolation along the polyline.
- `IntersectionLayout`: builds 24 `LanePath`s. Inbound approach lanes are straight lines from approach edge to stop line; through movement continues straight across; left/right movements append a quarter-circle arc into the matching outbound lane, then a straight outbound segment. Provide `LanePath pathFor(Approach from, Movement m, int laneIndex)` and stop-line distances.
- Tests: `LanePathTest` (length, poseAt endpoints + midpoint, heading direction), `IntersectionLayoutTest` (24 lanes exist, paths continuous, lengths > 0).
- Commit after green.

## Task 2: Behavior (IDM, gap acceptance, kinematics) - TDD

**CarFollowingModel (IDM).** Core formula:

```
s* = s0 + max(0, v*T + v*dv / (2*sqrt(a*b)))
accel = a * (1 - (v/v0)^delta - (s*/s)^2)
```
where `s0`=min gap (2.0 m), `T`=headway (1.5 s), `a`=maxAccel, `b`=comfortDecel, `v0`=desired speed, `v`=speed, `dv`=v-vLead, `s`=bumper gap to leader. With no leader, drop the `(s*/s)^2` term.

- [ ] `CarFollowingModelTest`:
  - free road (no leader) -> accel > 0 toward v0; at v==v0 accel ~ 0.
  - tiny gap below s0 -> accel strongly negative (< -b approx, i.e. emergency brake).
  - steady following at equal speed and gap==s* -> accel ~ 0.
- [ ] Implement `double accel(double v, double v0, double dv, double gap, VehicleType t)`.
- [ ] `GapAcceptance`: `boolean canChange(double leadGap, double lagGap, double lagApproachSpeed)` - require leadGap >= minLead and lagGap >= minLag(+ time-to-collision check). Test accept/reject.
- [ ] `Kinematics.advance(v, a, dt, vMax)` -> clamps v to [0, vMax], returns new v and ds = v*dt + 0.5*a*dt^2 (clamped ds>=0). Test.
- [ ] `RoutePlanner.plan(Approach entry)` -> picks movement + inbound laneIndex + outbound lane; deterministic-seeded RNG passed in (no `Math.random()` in core for testability). Test distribution sane.
- Commit after each green.

## Task 3: Engine - the 3-phase concurrent tick loop

- `Vehicle` (engine-internal, mutable): id, type, LanePath path, double s (arc pos), double v, Movement, entry/exit, boolean emergency, boolean inBox, boolean cleared.
- `VehicleUpdate` (record): vehicleId, newV, newS, laneChangeTarget (nullable).
- `SimulationEngine`:
  - holds `AtomicReference<WorldSnapshot> current`, `List<Vehicle>` worldVehicles (only mutated in commit), the worker `ExecutorService`, `ScheduledExecutorService` clock.
  - `start()` schedules `tick()` at fixed rate `1000/tickHz` ms.
  - `tick()`:
    1. drain command queue (apply control changes via SimulationControls).
    2. snapshot read: build per-lane ordered leader lookup from `current`.
    3. PLAN: partition `worldVehicles` into `workerThreads` batches; `invokeAll(callables)` where each callable computes `VehicleUpdate` for its batch by reading the immutable `current` + precomputed leader map (no writes). Collect.
    4. COMMIT (clock thread): apply updates (set v,s), handle vehicles crossing stop line vs red (clamp s to stop line if must stop), mark cleared when s>=path.length, remove cleared, ask `VehicleSpawner` for new spawns up to target, run `SignalController.snapshot()` for signal state, build `WorldSnapshot` (map Vehicles->VehicleView via path.poseAt(s)).
    5. run `SafetyMonitor.check(newVehicles)` -> collisions counter.
    6. set `current`, push to broadcaster, feed `StatsAggregator`.
  - measure updates/sec: count vehicles processed per tick over a 1s sliding window.
- Concurrency correctness notes embedded as comments: no locks in PLAN; only clock thread mutates `worldVehicles` and `current`; controllers enqueue commands only.
- Test: `SimulationEngineSmokeTest` - start, run ~30 ticks via manual tick calls, assert snapshot non-null, vehicle count grows to target, no exception.
- Commit.

## Task 4: Controllers

- `SignalController` (own thread or stepped from clock): phase ring NS-GREEN -> NS-YELLOW -> ALL-RED -> EW-GREEN -> EW-YELLOW -> ALL-RED -> repeat. Durations from `SimulationControls` (atomic). Exposes `SignalState snapshot()` (immutable). Protected lefts: a left movement is GREEN only during its approach's green (Phase 1 simplification -> guaranteed conflict-free). Invariant method `assertNoConflict()` used by tests.
- `EmergencyDispatcher`: scan vehicles for emergency within trigger distance of stop line on an approach; request `SignalController.preempt(approach)`; clear preemption when emergency passes box.
- `VehicleSpawner`: given current count + target, return list of new Vehicles on random free inbound lanes (only if entry gap safe). Despawn handled by engine (cleared vehicles).
- `ControlCommand`: records `SetSpeed`, `SetDensity`, `SetSignalDuration`, `SpawnEmergency`, `SetPaused`, `Reset` (sealed interface).
- Tests: `SignalControllerTest` (ring order; never NS & EW green together; all-red present; preempt serves approach), `EmergencyPreemptionTest`.
- Commit.

## Task 5: Safety monitor + stats

- `SafetyMonitor.check(List<Vehicle>)`: group by LanePath identity; sort by s; assert consecutive gap >= -epsilon (bumper to bumper considering lengths). Increment collisions on violation; never throw in prod path (log). Return count.
- `SafetyMonitorTest`: inject two overlapping vehicles -> detects; valid -> 0.
- `StatsAggregator`/`SimulationStats`: totalVehicles, perType map, clearedPerMin (sliding), avgSpeed, updatesPerSecond, activeThreads (`ThreadPoolConfig` exposes counts -> 30), collisions, simTimeMs, paused.
- Commit.

## Task 6: Web layer (STOMP)

- `StompConfig` (`@EnableWebSocketMessageBroker`): `registerStompEndpoints` -> `/ws` withSockJS; `configureMessageBroker` -> enableSimpleBroker `/topic`, setApplicationDestinationPrefixes `/app`.
- `WebConfig`: CORS allow `http://localhost:5173`.
- `WorldBroadcaster`: `SimpMessagingTemplate`; engine calls `broadcast(snapshot)` -> convertAndSend `/topic/world`; `broadcastStats`, `broadcastAlert`.
- `ControlController`: `@MessageMapping("/control")` receives `ControlMessage`, converts to `ControlCommand`, enqueues to engine. Also a REST `@PostMapping("/api/control")` mirror for non-STOMP testing.
- DTOs validated with jakarta.validation.
- Wire engine.start() on `ApplicationReadyEvent`.
- Test: `StompConfigTest` context loads; `ControlControllerTest` (MockMvc REST path enqueues).
- Commit. Run `mvn spring-boot:run`, curl REST control to sanity check.

## Task 7: Concurrency stress test (the headline proof)

- [ ] `SimulationEngineStressTest`:
  - configure 70 target vehicles, 24 workers.
  - run 3000 ticks by calling `engine.tickForTest()` in a tight loop (deterministic, no scheduler) OR run the real scheduler for ~5 s.
  - assert: `monitor.collisions() == 0` throughout; no exception; every tick completed; final `updatesPerSecond`-equivalent (vehiclesProcessed/elapsed) >= 2100 in scheduled mode, and in tight-loop mode assert vehiclesProcessed >= 2100*seconds.
  - `@RepeatedTest(5)` to shake out races. Run with assertions enabled.
- [ ] Run: `cd backend && mvn -q test -Dtest=SimulationEngineStressTest`. Expected: PASS, logs show >=2100 updates/s, 0 collisions.
- [ ] Commit.

## Task 8: Frontend stream + types

- `types/snapshot.ts`: TS interfaces matching JSON (`WorldSnapshot{tickId,simTimeMs,vehicles:VehicleView[],signals,stats}`, `VehicleView{id,t,x,y,h,v}`, etc).
- `stomp/useTrafficStream.ts`: create `Client` with `webSocketFactory: () => new SockJS('http://localhost:8080/ws')`; on connect subscribe `/topic/world` (write to latestRef, shift prev), `/topic/stats`, `/topic/alerts`; expose `send(cmd)` -> `client.publish({destination:'/app/control', body: JSON.stringify(cmd)})`.
- Commit.

## Task 9: Frontend rendering

- `layout.ts`: constants mirroring backend (approachLengthM, laneWidthM, etc) + `worldToScreen(x,y, canvasW, canvasH, scale)`.
- `interpolate.ts`: `lerpVehicles(prev, latest, alpha)` matching by id; lerp x,y, shortest-arc lerp heading; carry type. Pure -> unit tested.
- `draw.ts`: `drawRoads(ctx, layout)`, `drawSignals(ctx, signals)`, `drawVehicle(ctx, v, type)` (oriented rounded rect, emergency halo), `drawLegend`.
- `CanvasView.tsx`: rAF loop; alpha = clamp((now - latestTs)/tickMs); clear, draw roads, signals, interpolated vehicles, legend.
- Tests: `interpolate.test.ts`, `layout.test.ts`.
- Commit.

## Task 10: Frontend panels + App

- `ControlPanel.tsx`: sliders (speed .25-4 step .25, density 0-120, NS green 3-60s, EW green 3-60s, yellow 1-6s, allRed 0-4s) each calling `send({type:'setSpeed', value})` etc; buttons spawn ambulance/firetruck/pause/reset.
- `StatsPanel.tsx`: render stats incl per-type chips, big "Collisions 0 - 100% safe" badge, updates/sec, active threads (30).
- `AlertsFeed.tsx`: list of alerts, newest first, auto-trim.
- `App.tsx`: layout (canvas center, control panel left, stats right, alerts bottom); connection indicator.
- `App.css`: dark control-room aesthetic.
- Commit.

## Task 11: Frontend tests + build

- Run `npm run test` (vitest) green; `npm run build` green.
- Commit.

## Task 12: End-to-end verification

- [ ] Start backend (`mvn spring-boot:run`) and frontend (`npm run dev`).
- [ ] Use Playwright MCP: navigate to `http://localhost:5173`, wait for canvas, screenshot. Verify vehicles moving, stats updating, collisions=0, threads=30.
- [ ] Click spawn-ambulance, screenshot preemption (an approach goes green, halo visible).
- [ ] Capture console for errors.

## Task 13: README + run docs

- [ ] Replace stub README with overview, architecture diagram (ASCII), the headline metrics, and run instructions (backend + frontend). Commit.

---

## Self-review notes

- Spec coverage: model (T1), safety/IDM (T2,T5), concurrency engine + thread budget (T3, ThreadPoolConfig in T0/T6), signals + emergency (T4), STOMP transport + control commands (T6,T8), frontend canvas + interpolation + panels (T9,T10), tests incl stress (T2,T4,T5,T7,T11), verification (T12). All spec sections mapped.
- Determinism for tests: seeded RNG injected into RoutePlanner/VehicleSpawner (no `Math.random()` in core), and an `engine.tickForTest()` path so the stress test does not depend on wall-clock scheduling.
- Thread count audit: 24 workers + clock + signal + emergency + spawner + stats + broadcaster = 30 (assert in a test that reports the configured total).
- No placeholders: hard parts (IDM formula, tick-loop phases, STOMP config) specified concretely; remaining files are mechanical given the signatures above.
