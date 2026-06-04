import { useTrafficStream } from './stomp/useTrafficStream';
import CanvasView from './render/CanvasView';
import ControlPanel from './panels/ControlPanel';
import StatsPanel from './panels/StatsPanel';
import AlertsFeed from './panels/AlertsFeed';

interface Props {
  onExit: () => void;
}

export default function SimView({ onExit }: Props) {
  const stream = useTrafficStream();

  return (
    <div className="sim">
      <div className="stage">
        <div className="statusbar">
          <span className="brand" onClick={onExit} title="Back to start">
            Traffic<span>Flow</span>
          </span>
          <span className={`status-pill ${stream.connected ? 'on' : 'off'}`}>
            {stream.connected ? 'Server connected · WebSocket active' : 'Connecting…'}
          </span>
        </div>
        <div className="sim-canvas">
          <CanvasView
            latestRef={stream.latestRef}
            prevRef={stream.prevRef}
            lastArrivalRef={stream.lastArrivalRef}
            intervalRef={stream.intervalRef}
          />
        </div>
        <AlertsFeed alerts={stream.alerts} />
      </div>

      <aside className="panel-col">
        <ControlPanel send={stream.send} connected={stream.connected} />
        <StatsPanel stats={stream.stats} connected={stream.connected} />
      </aside>
    </div>
  );
}
