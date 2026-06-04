import type { AlertMessage } from '../types/snapshot';

interface Props {
  alerts: AlertMessage[];
}

export default function AlertsFeed({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts-float">
      {alerts.slice(0, 4).map((a, i) => (
        <div key={`${a.ts}-${i}`} className="toast">
          <span className="toast-dot" />
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}
