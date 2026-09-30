import { useEffect, useMemo, useState } from 'react';
import { useTrafficStream } from './stomp/useTrafficStream';
import CanvasView from './render/CanvasView';
import { CameraController } from './render/camera';
import ControlPanel from './panels/ControlPanel';
import StatsPanel from './panels/StatsPanel';
import AlertsFeed from './panels/AlertsFeed';
import ZoomBar from './panels/ZoomBar';
import { LogoMark } from './Logo';
import { IconPanel, IconPanelLeft } from './Icons';
import type { SignalState } from './types/snapshot';

interface Props {
  onExit: () => void;
}

export default function SimView({ onExit }: Props) {
  const stream = useTrafficStream();
  const camera = useMemo(() => new CameraController(), []);
  // dev-only handle so Playwright checks can drive and read the camera
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __ufCamera?: CameraController }).__ufCamera = camera;
  }, [camera]);
  const [fps, setFps] = useState(0);
  const [signals, setSignals] = useState<SignalState | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1100;
  const [showLeft, setShowLeft] = useState(!narrow);
  const [showRight, setShowRight] = useState(true);

  // The signal state rides in the 30 Hz world feed (read by the canvas from a ref); the panel only
  // needs it a few times a second, so sample it instead of re-rendering React per snapshot.
  const { playoutRef } = stream;
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = playoutRef.current.latest()?.signals ?? null;
      setSignals((prev) => (JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
    }, 250);
    return () => window.clearInterval(t);
  }, [playoutRef]);

  return (
    <div className="sim">
      <div className="sim-canvas">
        <CanvasView playoutRef={stream.playoutRef} camera={camera} onFps={setFps} />
      </div>

      <header className="hud-top">
        <button className="glass pill brand" onClick={onExit} title="Back to start">
          <LogoMark size={22} />
          <span className="brand-name">Urban<b>Flow</b></span>
        </button>
        <div className={`glass pill status ${stream.connected ? 'on' : 'off'}`}>
          <span className="live-dot" />
          {stream.connected ? 'Live' : 'Connecting'}
          <span className="sep" />
          <span className="muted">{stream.connected ? 'STOMP · 30 Hz' : 'waiting for server'}</span>
        </div>
        <div className="spacer" />
        <button className={`glass icon-btn ${showLeft ? 'active' : ''}`} onClick={() => setShowLeft((v) => !v)} title="Toggle stats panel">
          <IconPanelLeft size={17} />
        </button>
        <button className={`glass icon-btn ${showRight ? 'active' : ''}`} onClick={() => setShowRight((v) => !v)} title="Toggle controls panel">
          <IconPanel size={17} />
        </button>
      </header>

      {showLeft && (
        <aside className="hud-left glass panel">
          <StatsPanel stats={stream.stats} connected={stream.connected} signals={signals} fps={fps} />
        </aside>
      )}
      {showRight && (
        <aside className="hud-right glass panel">
          <ControlPanel send={stream.send} connected={stream.connected} />
        </aside>
      )}

      <ZoomBar camera={camera} />
      <AlertsFeed alerts={stream.alerts} />
    </div>
  );
}
