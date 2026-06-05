import type { UiAlert } from '../stomp/useTrafficStream';

interface Props {
  alerts: UiAlert[];
}

export default function AlertsFeed({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts-float">
      {alerts.slice(0, 4).map((a) => (
        <div key={a.id} className="toast">
          <span className="toast-dot" />
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}
