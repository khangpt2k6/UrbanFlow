import { useState } from 'react';
import type { ControlPayload } from '../stomp/useTrafficStream';
import { IconChevron, IconPause, IconPlay, IconReset } from '../Icons';

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

function Slider({ label, min, max, step, value, unit, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="slider-row">
        <span>{label}</span>
        <span className="num">{value}{unit ?? ''}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const MODES = [
  { key: 'off', label: 'Sparse', density: 25 },
  { key: 'avg', label: 'Normal', density: 50 },
  { key: 'rush', label: 'Rush hour', density: 100 },
];
const SPEEDS = [0.5, 1, 2, 4];

export default function ControlPanel({ send, connected }: Props) {
  const [speed, setSpeed] = useState(1);
  const [density, setDensity] = useState(50);
  const [mode, setMode] = useState('avg');
  const [nsGreen, setNsGreen] = useState(20);
  const [ewGreen, setEwGreen] = useState(20);
  const [leftGreen, setLeftGreen] = useState(5);
  const [yellow, setYellow] = useState(3);
  const [allRed, setAllRed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

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
    setDensity(50);
    setMode('avg');
    setNsGreen(20);
    setEwGreen(20);
    setLeftGreen(5);
    setYellow(3);
    setAllRed(2);
    setPaused(false);
    send({ type: 'reset' });
  };

  return (
    <div className="pane">
      <div className="pane-head">
        <span className="pane-title">Controls</span>
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'connected' : 'offline'}</span>
      </div>

      <div className="row-actions">
        <button className={`btn-main ${paused ? 'paused' : ''}`} onClick={togglePause} disabled={!connected}>
          {paused ? <IconPlay size={16} /> : <IconPause size={16} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn-icon" onClick={resetAll} title="Reset the simulation" disabled={!connected}>
          <IconReset size={16} />
        </button>
      </div>

      <div className="section">
        <div className="label">Traffic</div>
        <div className="segmented">
          {MODES.map((m) => (
            <button key={m.key} className={mode === m.key ? 'on' : ''} onClick={() => applyMode(m)}>{m.label}</button>
          ))}
        </div>
        <Slider label="Vehicles" min={0} max={120} step={1} value={density}
          onChange={(v) => { setDensity(v); setMode(''); send({ type: 'setDensity', count: v }); }} />
      </div>

      <div className="section">
        <div className="label">Speed</div>
        <div className="segmented">
          {SPEEDS.map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => { setSpeed(s); send({ type: 'setSpeed', value: s }); }}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <button className={`disclosure ${showSignals ? 'open' : ''}`} onClick={() => setShowSignals((s) => !s)}>
          <IconChevron size={14} />
          <span className="label flush">Signal timing</span>
        </button>
        {showSignals && (
          <div className="disclosure-body">
            <Slider label="North-south green" min={3} max={60} step={1} value={nsGreen} unit=" s"
              onChange={(v) => { setNsGreen(v); dur('nsGreen', v); }} />
            <Slider label="East-west green" min={3} max={60} step={1} value={ewGreen} unit=" s"
              onChange={(v) => { setEwGreen(v); dur('ewGreen', v); }} />
            <Slider label="Protected left" min={3} max={30} step={1} value={leftGreen} unit=" s"
              onChange={(v) => { setLeftGreen(v); dur('leftGreen', v); }} />
            <Slider label="Yellow" min={1} max={6} step={0.5} value={yellow} unit=" s"
              onChange={(v) => { setYellow(v); dur('yellow', v); }} />
            <Slider label="All-red" min={0.5} max={4} step={0.5} value={allRed} unit=" s"
              onChange={(v) => { setAllRed(v); dur('allRed', v); }} />
          </div>
        )}
      </div>

      <p className="pane-note">Ambulances and fire engines are dispatched at random. Signals pre-empt to clear their path.</p>
    </div>
  );
}
