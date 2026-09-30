import type { UiAlert } from '../stomp/useTrafficStream';
import { IconBell, IconFlame, IconSignal, IconSiren } from '../Icons';

interface Props {
  alerts: UiAlert[];
}

// The backend sends plain text (e.g. "Ambulance dispatched on NORTH approach"); pick an icon and a
// tone from it so an emergency reads at a glance.
function kindOf(message: string): 'ambulance' | 'fire' | 'signal' | 'info' {
  const m = message.toLowerCase();
  if (m.includes('ambulance')) return 'ambulance';
  if (m.includes('fire')) return 'fire';
  if (m.includes('preemption') || m.includes('signal')) return 'signal';
  return 'info';
}

export default function AlertsFeed({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="toasts">
      {alerts.slice(0, 3).map((a) => {
        const k = kindOf(a.message);
        return (
          <div key={a.id} className={`toast glass ${k}`}>
            <span className="toast-icon">
              {k === 'ambulance' ? <IconSiren size={15} /> : k === 'fire' ? <IconFlame size={15} /> : k === 'signal' ? <IconSignal size={15} /> : <IconBell size={15} />}
            </span>
            <span className="toast-text">{a.message}</span>
          </div>
        );
      })}
    </div>
  );
}
