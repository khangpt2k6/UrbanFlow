import { useTrafficStream } from './stomp/useTrafficStream';
import CanvasView from './render/CanvasView';
import ControlPanel from './panels/ControlPanel';
import StatsPanel from './panels/StatsPanel';
import AlertsFeed from './panels/AlertsFeed';
import './App.css';

export default function App() {
  const stream = useTrafficStream();

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Traffic<span className="accent">Flow</span>
        </h1>
        <span className="subtitle">Real-time concurrent traffic control simulation</span>
        <span className="headline">70+ vehicles · 9 types · 24 lanes · 30 threads · 2100+ updates/s</span>
      </header>

      <div className="layout">
        <aside className="col left">
          <ControlPanel send={stream.send} />
        </aside>

        <main className="col center">
          <div className="canvas-wrap">
            <CanvasView
              latestRef={stream.latestRef}
              prevRef={stream.prevRef}
              lastArrivalRef={stream.lastArrivalRef}
              intervalRef={stream.intervalRef}
            />
          </div>
          <AlertsFeed alerts={stream.alerts} />
        </main>

        <aside className="col right">
          <StatsPanel stats={stream.stats} connected={stream.connected} />
        </aside>
      </div>
    </div>
  );
}
