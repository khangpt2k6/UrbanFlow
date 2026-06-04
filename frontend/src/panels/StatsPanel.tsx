import type { SimulationStats } from '../types/snapshot';
import { VEHICLE_TYPES } from '../render/vehicleTypes';

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
        {VEHICLE_TYPES.map((t) => (
          <div className="leg" key={t.label}>
            <span className="leg-dot" style={{ background: t.color }} />
            <span className="leg-label">{t.label}</span>
            <span className="leg-count">{s?.perType?.[t.label] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
