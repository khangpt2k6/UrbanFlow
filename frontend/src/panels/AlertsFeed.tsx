import type { AlertMessage } from '../types/snapshot';

interface Props {
  alerts: AlertMessage[];
}

export default function AlertsFeed({ alerts }: Props) {
  return (
    <div className="panel alerts-panel">
      <h2>Emergency alerts</h2>
      {alerts.length === 0 ? (
        <p className="alerts-empty">No alerts. Dispatch an emergency vehicle to preempt the signals.</p>
      ) : (
        <ul className="alerts-list">
          {alerts.map((a, i) => (
            <li key={`${a.ts}-${i}`} className="alert-item">
              <span className="alert-dot" />
              <span className="alert-msg">{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
