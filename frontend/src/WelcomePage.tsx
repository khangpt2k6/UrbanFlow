import { LogoMark } from './Logo';

interface Props {
  onLaunch: () => void;
}

export default function WelcomePage({ onLaunch }: Props) {
  return (
    <div className="welcome">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
      <div className="grid-overlay" />

      <div className="welcome-inner">
        <div className="welcome-badge">real-time smart-city simulation</div>
        <div className="welcome-logo">
          <LogoMark size={72} />
        </div>
        <h1 className="welcome-title">
          Urban<span>Flow</span>
        </h1>
        <p className="welcome-tag">
          A concurrent traffic-control engine in Java, streamed live to your browser. Watch up to
          120 vehicles negotiate a signalized intersection with zero collisions, in real time.
        </p>

        <button className="launch-btn" onClick={onLaunch}>
          <span>Launch simulation</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <div className="welcome-foot">Spring Boot · 30 threads · STOMP/WebSocket · React + Canvas</div>
      </div>

      <div className="welcome-road">
        <span className="w-veh" style={{ animationDelay: '0s' }}>🚗</span>
        <span className="w-veh" style={{ animationDelay: '1.4s' }}>🚙</span>
        <span className="w-veh" style={{ animationDelay: '2.8s' }}>🚌</span>
        <span className="w-veh" style={{ animationDelay: '4.2s' }}>🚑</span>
        <span className="w-veh" style={{ animationDelay: '5.4s' }}>🚓</span>
      </div>
    </div>
  );
}
