interface Props {
  onLaunch: () => void;
}

const STATS = [
  { value: '70+', label: 'vehicles' },
  { value: '9', label: 'types' },
  { value: '24', label: 'lanes' },
  { value: '30', label: 'threads' },
  { value: '2,100+', label: 'updates/sec' },
  { value: '0', label: 'collisions' },
];

export default function WelcomePage({ onLaunch }: Props) {
  return (
    <div className="welcome">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
      <div className="grid-overlay" />

      <div className="welcome-inner">
        <div className="welcome-badge">real-time simulation</div>
        <h1 className="welcome-title">
          Traffic<span>Flow</span>
        </h1>
        <p className="welcome-tag">
          A concurrent traffic-control engine in Java, streamed live to your browser. Watch 70+
          vehicles negotiate a signalized intersection with zero collisions, in real time.
        </p>

        <div className="welcome-stats">
          {STATS.map((s) => (
            <div className="welcome-stat" key={s.label}>
              <div className="welcome-stat-value">{s.value}</div>
              <div className="welcome-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <button className="launch-btn" onClick={onLaunch}>
          <span>Launch simulation</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <div className="welcome-foot">Spring Boot · 30 threads · STOMP/WebSocket · React + Canvas</div>
      </div>
    </div>
  );
}
