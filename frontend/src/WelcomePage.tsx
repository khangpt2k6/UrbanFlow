import { useEffect, useRef } from 'react';
import { LogoMark } from './Logo';
import { IconArrowRight } from './Icons';
import { drawStatic } from './render/draw';
import { makeView } from './render/layout';
import { loadSprites, onSpritesReady } from './render/sprites';

interface Props {
  onLaunch: () => void;
}

/** The real map, drawn once (no traffic) and pushed far back as a dim, slowly drifting backdrop. */
function CityBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    loadSprites();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const paint = () => {
      c.width = Math.floor(window.innerWidth * dpr);
      c.height = Math.floor(window.innerHeight * dpr);
      drawStatic(ctx, makeView(c.width, c.height, 0, { zoom: 0.8, x: 0, y: 0 }), c.width, c.height, dpr);
    };
    paint();
    const off = onSpritesReady(paint);
    window.addEventListener('resize', paint);
    return () => { off(); window.removeEventListener('resize', paint); };
  }, []);
  return <canvas ref={ref} className="welcome-city" aria-hidden="true" />;
}

export default function WelcomePage({ onLaunch }: Props) {
  return (
    <div className="welcome">
      <CityBackdrop />
      <div className="welcome-veil" />

      <main className="welcome-card glass">
        <div className="welcome-badge"><span className="live-dot" />Real-time traffic simulation</div>
        <div className="welcome-mark"><LogoMark size={56} /></div>
        <h1 className="welcome-title">Urban<span>Flow</span></h1>
        <p className="welcome-tag">
          A concurrent traffic-control engine in Java, streamed live to your browser. Up to 120 vehicles,
          walkers and random emergency runs share one signalized intersection, with zero collisions.
        </p>
        <button className="launch-btn" onClick={onLaunch}>
          Launch simulation
          <IconArrowRight size={18} />
        </button>
        <div className="welcome-facts">
          <div><b>30</b><span>worker threads</span></div>
          <div><b>0</b><span>collisions</span></div>
          <div><b>30 Hz</b><span>live stream</span></div>
        </div>
      </main>

      <footer className="welcome-foot">Spring Boot · Java 17 · WebSocket · React · Canvas 2D</footer>
    </div>
  );
}
