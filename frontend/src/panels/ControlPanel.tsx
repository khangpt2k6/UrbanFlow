import { useState } from 'react';
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
  const [density, setDensity] = useState(30);
  const [nsGreen, setNsGreen] = useState(15);
  const [ewGreen, setEwGreen] = useState(15);
  const [leftGreen, setLeftGreen] = useState(5);
  const [yellow, setYellow] = useState(3);
  const [allRed, setAllRed] = useState(2);
  const [approach, setApproach] = useState('NORTH');
  const [paused, setPaused] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  const dur = (phase: string, seconds: number) => send({ type: 'setSignalDuration', phase, seconds });
  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    send({ type: 'setPaused', paused: next });
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
        onChange={(v) => { setDensity(v); send({ type: 'setDensity', count: v }); }} />

      <div className="emergency-row">
        <select value={approach} onChange={(e) => setApproach(e.target.value)}>
          <option>NORTH</option><option>SOUTH</option><option>EAST</option><option>WEST</option>
        </select>
        <button className="icon-btn" title="Dispatch ambulance"
          onClick={() => send({ type: 'spawnEmergency', vehicleType: 'AMBULANCE', approach })}>🚑</button>
        <button className="icon-btn" title="Dispatch fire truck"
          onClick={() => send({ type: 'spawnEmergency', vehicleType: 'FIRETRUCK', approach })}>🚒</button>
      </div>

      <button className={`btn-primary ${paused ? 'start' : 'stop'}`} onClick={togglePause}>
        {paused ? '▶  Start' : '⏸  Stop'}
      </button>

      <div className="btn-row">
        <button className="btn" onClick={() => send({ type: 'reset' })}>↺ Reset</button>
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
