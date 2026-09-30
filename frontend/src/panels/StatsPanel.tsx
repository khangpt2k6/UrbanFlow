import { useEffect, useRef, useState } from 'react';
import type { ApproachName, SignalColor, SignalState, SimulationStats } from '../types/snapshot';
import { VEHICLE_TYPES } from '../render/vehicleTypes';
import { drawVehicleArt } from '../render/vehicleArt';
import { onSpritesReady, loadSprites } from '../render/sprites';
import { IconChevron, IconShield } from '../Icons';

interface Props {
  stats: SimulationStats | null;
  connected: boolean;
  signals: SignalState | null;
  fps: number;
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}{unit && <span className="unit">{unit}</span>}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

const ICON_W = 40;
const ICON_H = 18;
// Stable ids for the icon portraits (bus livery, trailer colour, rider colours).
const ICON_ID = [3, 3, 4, 1, 0, 2, 0, 0, 0];

// A tiny top-down portrait drawn with the exact art the map uses, scaled to fill the box.
function VehicleIcon({ typeIndex }: { typeIndex: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { loadSprites(); return onSpritesReady(() => setReady(true)); }, []);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = ICON_W * dpr;
    c.height = ICON_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ICON_W, ICON_H);
    const t = VEHICLE_TYPES[typeIndex];
    const len = Math.max(t.length, 2.4), wid = Math.max(t.width * (t.length < 3 ? 1.4 : 1.12), 0.95);
    const scale = Math.min((ICON_W - 4) / len, (ICON_H - 3) / wid);
    ctx.translate(ICON_W / 2, ICON_H / 2);
    // nowMs = 0: emergency light bars show one static lit frame
    drawVehicleArt(ctx, typeIndex, len * scale, wid * scale, 0, ICON_ID[typeIndex], true);
  }, [typeIndex, ready]);
  return <canvas ref={ref} className="leg-icon" style={{ width: ICON_W, height: ICON_H }} />;
}

const DOT: Record<SignalColor, string> = { GREEN: 'g', YELLOW: 'y', RED: 'r' };
const APPROACHES: [ApproachName, string][] = [['NORTH', 'N'], ['SOUTH', 'S'], ['EAST', 'E'], ['WEST', 'W']];

function phaseLabel(s: SignalState | null): string {
  if (!s) return 'offline';
  const p = s.phase ?? '';
  if (p.startsWith('PREEMPT')) {
    const dir = p.replace('PREEMPT_', '').split('_')[0].toLowerCase();
    return `Emergency, clearing ${dir} approach`;
  }
  if (p.includes('ALL_RED')) return 'All-red clearance';
  const map: Record<string, string> = { NS_THROUGH: 'North-south through', NS_LEFT: 'North-south protected left', EW_THROUGH: 'East-west through', EW_LEFT: 'East-west protected left' };
  for (const k of Object.keys(map)) if (p.startsWith(k)) return map[k];
  return p.replace(/_/g, ' ').toLowerCase();
}

export default function StatsPanel({ stats, connected, signals, fps }: Props) {
  const s = stats;
  const safe = (s?.collisions ?? 0) === 0;
  const total = Math.max(1, s?.totalVehicles ?? 0);
  const [showMix, setShowMix] = useState(false);
  return (
    <div className="pane">
      <div className="pane-head">
        <span className="pane-title">Live</span>
        <span className={`safety ${safe ? 'safe' : 'bad'}`}>
          <IconShield size={13} />
          {s?.collisions ?? 0} collisions
        </span>
      </div>

      <div className="metrics">
        <Metric label="Vehicles" value={`${s?.totalVehicles ?? 0}`} />
        <Metric label="Speed" value={(s?.avgSpeedMps ?? 0).toFixed(1)} unit="m/s" />
        <Metric label="Cleared" value={`${s?.clearedTotal ?? 0}`} />
        <Metric label="Updates" value={`${Math.round(s?.updatesPerSecond ?? 0)}`} unit="/s" />
        <Metric label="Threads" value={`${s?.activeThreads ?? 0}`} />
        <Metric label="Render" value={`${Math.round(fps)}`} unit="fps" />
      </div>

      <div className="section">
        <div className="label">Signal phase</div>
        <div className="phase-name">{phaseLabel(connected ? signals : null)}</div>
        <div className="phase-grid">
          {APPROACHES.map(([a, short]) => (
            <div className="phase-cell" key={a}>
              <span className="phase-dir">{short}</span>
              <span className={`lamp ${signals ? DOT[signals.through[a]] : ''}`} title="through" />
              <span className={`lamp arrow ${signals && signals.left[a] !== 'RED' ? DOT[signals.left[a]] : ''}`} title="protected left">←</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <button className={`disclosure ${showMix ? 'open' : ''}`} onClick={() => setShowMix((v) => !v)}>
          <IconChevron size={14} />
          <span className="label flush">Vehicle mix</span>
          <span className="count">{s?.totalVehicles ?? 0} on road</span>
        </button>
        {showMix && <div className="legend disclosure-body">
          {VEHICLE_TYPES.map((t, i) => {
            const n = s?.perType?.[t.label] ?? 0;
            return (
              <div className="leg" key={t.label}>
                <VehicleIcon typeIndex={i} />
                <span className="leg-label">{t.label}</span>
                <span className="leg-bar"><span style={{ width: `${(n / total) * 100}%` }} /></span>
                <span className="leg-count">{n}</span>
              </div>
            );
          })}
        </div>}
      </div>
    </div>
  );
}
