import { useState, useRef, useEffect } from 'react';
import type { ControlPayload } from '../stomp/useTrafficStream';

interface Props {
  send: (p: ControlPayload) => void;
  connected: boolean;
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
}

// A cartoon dropdown to replace the native <select>, whose open list the OS draws and CSS can't
// touch. This one is fully styleable: a rounded button with a spinning chevron and a popup of
// rounded options. Closes on outside click.
function Dropdown({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="uf-select" ref={ref}>
      <button type="button" className={`uf-select-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span>{value}</span>
        <svg className="uf-select-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="uf-select-menu">
          {options.map((opt) => (
            <button type="button" key={opt} className={`uf-select-opt ${opt === value ? 'sel' : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}>
              <span>{opt}</span>
              {opt === value && <span className="uf-select-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Slider({ label, min, max, step, value, unit, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-label">
        {label}
        <span className="slider-value">
          {value}
          {unit ?? ''}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function ControlPanel({ send, connected }: Props) {
  const [speed, setSpeed] = useState(1);
  const [density, setDensity] = useState(26);
  const [mode, setMode] = useState('avg');
  const [nsGreen, setNsGreen] = useState(15);
  const [ewGreen, setEwGreen] = useState(15);
  const [leftGreen, setLeftGreen] = useState(5);
  const [yellow, setYellow] = useState(3);
  const [allRed, setAllRed] = useState(2);
  const [approach, setApproach] = useState('NORTH');
  const [paused, setPaused] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  const MODES = [
    { key: 'off', label: 'Sparse', icon: '🌙', density: 14 },
    { key: 'avg', label: 'Normal', icon: '🏙️', density: 26 },
    { key: 'rush', label: 'Rush Hour', icon: '🚦', density: 48 },
  ];
  const applyMode = (m: { key: string; density: number }) => {
    setMode(m.key);
    setDensity(m.density);
    send({ type: 'setDensity', count: m.density });
  };

  const dur = (phase: string, seconds: number) => send({ type: 'setSignalDuration', phase, seconds });
  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    send({ type: 'setPaused', paused: next });
  };

  // Reset clears the world on the backend AND returns these controls to their defaults, so the
  // panel never drifts out of sync with the freshly reset engine (e.g. a stuck "Start" label).
  const resetAll = () => {
    setSpeed(1);
    setDensity(26);
    setMode('avg');
    setNsGreen(15);
    setEwGreen(15);
    setLeftGreen(5);
    setYellow(3);
    setAllRed(2);
    setPaused(false);
    send({ type: 'reset' });
  };

  return (
    <div className="card control">
      <div className="card-head">
        <span className="card-title">Controls</span>
        <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'connected' : 'offline'} />
      </div>

      <Slider label="Speed" min={0.25} max={4} step={0.25} value={speed} unit="x"
        onChange={(v) => { setSpeed(v); send({ type: 'setSpeed', value: v }); }} />
      <Slider label="Density" min={0} max={120} step={1} value={density}
        onChange={(v) => { setDensity(v); setMode(''); send({ type: 'setDensity', count: v }); }} />

      <div className="modes">
        {MODES.map((m) => (
          <button key={m.key} className={`mode-btn ${mode === m.key ? 'active' : ''}`} onClick={() => applyMode(m)}>
            <span className="mode-icon">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div className="emergency-row">
        <Dropdown value={approach} options={['NORTH', 'SOUTH', 'EAST', 'WEST']} onChange={setApproach} />
        <button className="icon-btn" title="Dispatch ambulance"
          onClick={() => send({ type: 'spawnEmergency', vehicleType: 'AMBULANCE', approach })}>🚑</button>
        <button className="icon-btn" title="Dispatch fire truck"
          onClick={() => send({ type: 'spawnEmergency', vehicleType: 'FIRETRUCK', approach })}>🚒</button>
      </div>

      <button className={`btn-primary ${paused ? 'start' : 'stop'}`} onClick={togglePause}>
        {paused ? '▶  Start' : '⏸  Stop'}
      </button>

      <div className="btn-row">
        <button className="btn" onClick={resetAll}>↺ Reset</button>
        <button className="btn ghost" onClick={() => setShowSignals((s) => !s)}>
          Signals {showSignals ? '▾' : '▸'}
        </button>
      </div>

      {showSignals && (
        <div className="signals-adv">
          <Slider label="NS green" min={3} max={60} step={1} value={nsGreen} unit="s"
            onChange={(v) => { setNsGreen(v); dur('nsGreen', v); }} />
          <Slider label="EW green" min={3} max={60} step={1} value={ewGreen} unit="s"
            onChange={(v) => { setEwGreen(v); dur('ewGreen', v); }} />
          <Slider label="Left green" min={3} max={30} step={1} value={leftGreen} unit="s"
            onChange={(v) => { setLeftGreen(v); dur('leftGreen', v); }} />
          <Slider label="Yellow" min={1} max={6} step={0.5} value={yellow} unit="s"
            onChange={(v) => { setYellow(v); dur('yellow', v); }} />
          <Slider label="All-red" min={0.5} max={4} step={0.5} value={allRed} unit="s"
            onChange={(v) => { setAllRed(v); dur('allRed', v); }} />
        </div>
      )}
    </div>
  );
}
