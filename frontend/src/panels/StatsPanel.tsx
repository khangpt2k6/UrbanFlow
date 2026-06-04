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
    <div className="panel stats-panel">
      <h2>
        Live stats
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'connected' : 'offline'}</span>
      </h2>

      <div className={`safety-badge ${safe ? 'safe' : 'unsafe'}`}>
        <span className="safety-big">{s?.collisions ?? 0}</span>
        <span className="safety-text">collisions{safe ? ' - 100% safe' : ''}</span>
      </div>

      <div className="metric-grid">
        <Metric label="Vehicles" value={`${s?.totalVehicles ?? 0}`} accent="#60a5fa" />
        <Metric label="Updates/sec" value={`${Math.round(s?.updatesPerSecond ?? 0)}`} accent="#34d399" />
        <Metric label="Threads" value={`${s?.activeThreads ?? 0}`} accent="#a78bfa" />
        <Metric label="Avg speed" value={`${(s?.avgSpeedMps ?? 0).toFixed(1)} m/s`} />
        <Metric label="Throughput" value={`${Math.round(s?.throughputPerMin ?? 0)}/min`} />
        <Metric label="Cleared" value={`${s?.clearedTotal ?? 0}`} />
        <Metric label="Sim time" value={`${((s?.simTimeMs ?? 0) / 1000).toFixed(0)}s`} />
        <Metric label="Tick" value={`${s?.tickId ?? 0}`} />
      </div>

      <div className="divider" />
      <h3>By type</h3>
      <div className="type-chips">
        {VEHICLE_TYPES.map((t) => (
          <div className="chip" key={t.label}>
            <span className="chip-dot" style={{ background: t.color }} />
            <span className="chip-label">{t.label}</span>
            <span className="chip-count">{s?.perType?.[t.label] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
