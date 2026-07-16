// Mirrors the backend records sent over STOMP. Field names are intentionally short on the
// wire (see VehicleView in the backend) to keep the 30 Hz payload small.

export type SignalColor = 'GREEN' | 'YELLOW' | 'RED';
export type ApproachName = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface VehicleView {
  id: number;
  t: number; // vehicle type ordinal
  x: number; // front-bumper world x (meters, +x East)
  y: number; // front-bumper world y (meters, +y North)
  h: number; // heading radians
  v: number; // speed m/s
  emer: boolean;
  rx: number; // rear-bumper world x
  ry: number; // rear-bumper world y
}

export interface PedestrianView {
  id: number;
  x: number; // world x (meters, +x East)
  y: number; // world y (meters, +y North)
  fx: number; // unit facing direction x
  fy: number; // unit facing direction y
  c: number; // palette index
  crossing: boolean; // currently on a carriageway
}

export interface SignalState {
  phase: string;
  through: Record<ApproachName, SignalColor>;
  left: Record<ApproachName, SignalColor>;
}

export interface SimulationStats {
  totalVehicles: number;
  perType: Record<string, number>;
  clearedTotal: number;
  throughputPerMin: number;
  avgSpeedMps: number;
  updatesPerSecond: number;
  activeThreads: number;
  collisions: number;
  simTimeMs: number;
  tickId: number;
  paused: boolean;
}

export interface WorldSnapshot {
  tickId: number;
  simTimeMs: number;
  vehicles: VehicleView[];
  pedestrians: PedestrianView[];
  signals: SignalState;
  stats: SimulationStats;
}

export interface AlertMessage {
  message: string;
  ts: number;
}
