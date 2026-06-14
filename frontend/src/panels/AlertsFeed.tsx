import type { UiAlert } from '../stomp/useTrafficStream';

interface Props {
  alerts: UiAlert[];
}

// Pick an icon from the alert text so an emergency dispatch reads at a glance as a popup
// notification (the backend sends e.g. "Ambulance dispatched on NORTH approach").
function iconFor(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('ambulance')) return '🚑';
  if (m.includes('fire truck')) return '🚒';
  if (m.includes('preemption') || m.includes('signal')) return '🚦';
  return '🔔';
}

export default function AlertsFeed({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts-float">
      {alerts.slice(0, 4).map((a) => (
        <div key={a.id} className="toast">
          <span className="toast-icon" aria-hidden="true">{iconFor(a.message)}</span>
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}
