import { useEffect, useRef } from 'react';
import type { SimulationStats } from '../types/snapshot';
import { VEHICLE_TYPES } from '../render/vehicleTypes';
import { drawVehicleArt } from '../render/vehicleArt';

interface Props {
  stats: SimulationStats | null;
  connected: boolean;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="metric">
      <div className="metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

const ICON_W = 38;
const ICON_H = 17;

// A tiny top-down portrait of the vehicle, drawn with the exact same canvas art the simulation
// uses (drawVehicleArt) instead of a flat colour swatch, so the legend reads as real vehicles.
// Each type is scaled to fill the icon box, so the bicycle is as legible as the truck.
function VehicleIcon({ typeIndex }: { typeIndex: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = ICON_W * dpr;
    c.height = ICON_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ICON_W, ICON_H);
    const t = VEHICLE_TYPES[typeIndex];
    const margin = 2.5;
    const scale = Math.min((ICON_W - margin * 2) / t.length, (ICON_H - margin * 2) / t.width);
    ctx.save();
    ctx.translate(ICON_W / 2, ICON_H / 2);
    ctx.scale(scale, scale);
    // nowMs = 0: emergency flashbars render a single static lit frame (no animation in the legend).
    drawVehicleArt(ctx, typeIndex, t.length, t.width, t.color, 0);
    ctx.restore();
  }, [typeIndex]);
  return <canvas ref={ref} className="leg-icon" style={{ width: ICON_W, height: ICON_H }} />;
}

export default function StatsPanel({ stats, connected }: Props) {
  const s = stats;
  const safe = (s?.collisions ?? 0) === 0;
  return (
    <div className="card stats">
      <div className="card-head">
        <span className="card-title">Live stats</span>
        <span className={`dot ${connected ? 'on' : 'off'}`} />
      </div>

      <div className={`safety ${safe ? 'safe' : 'bad'}`}>
        <span className="safety-num">{s?.collisions ?? 0}</span>
        <span className="safety-txt">collisions{safe ? ' · 100% safe' : ''}</span>
      </div>

      <div className="metrics">
        <Metric label="vehicles" value={`${s?.totalVehicles ?? 0}`} accent="#4cc2ff" />
        <Metric label="updates/s" value={`${Math.round(s?.updatesPerSecond ?? 0)}`} accent="#34d399" />
        <Metric label="threads" value={`${s?.activeThreads ?? 0}`} accent="#a78bfa" />
        <Metric label="avg speed" value={`${(s?.avgSpeedMps ?? 0).toFixed(1)}`} />
      </div>

      <div className="legend">
        {VEHICLE_TYPES.map((t, i) => (
          <div className="leg" key={t.label}>
            <VehicleIcon typeIndex={i} />
            <span className="leg-label">{t.label}</span>
            <span className="leg-count">{s?.perType?.[t.label] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
