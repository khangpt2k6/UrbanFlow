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
      <div className="sim-canvas">
        <CanvasView
          latestRef={stream.latestRef}
          prevRef={stream.prevRef}
          lastArrivalRef={stream.lastArrivalRef}
          intervalRef={stream.intervalRef}
        />
      </div>

      <div className="brand-float" onClick={onExit} title="Back to start">
        Traffic<span>Flow</span>
      </div>

      <div className="float control-float">
        <ControlPanel send={stream.send} connected={stream.connected} />
      </div>

      <div className="float stats-float">
        <StatsPanel stats={stream.stats} connected={stream.connected} />
      </div>

      <AlertsFeed alerts={stream.alerts} />
    </div>
  );
}
