import { useState } from 'react';
import type { ControlPayload } from '../stomp/useTrafficStream';

interface Props {
  send: (p: ControlPayload) => void;
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

export default function ControlPanel({ send }: Props) {
  const [speed, setSpeed] = useState(1);
  const [density, setDensity] = useState(70);
  const [nsGreen, setNsGreen] = useState(12);
  const [ewGreen, setEwGreen] = useState(12);
  const [leftGreen, setLeftGreen] = useState(6);
  const [yellow, setYellow] = useState(3);
  const [allRed, setAllRed] = useState(2);
  const [approach, setApproach] = useState('NORTH');
  const [paused, setPaused] = useState(false);

  const dur = (phase: string, seconds: number) => send({ type: 'setSignalDuration', phase, seconds });

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    send({ type: 'setPaused', paused: next });
  };

  return (
    <div className="panel control-panel">
      <h2>Controls</h2>

      <Slider label="Sim speed" min={0.25} max={4} step={0.25} value={speed} unit="x"
        onChange={(v) => { setSpeed(v); send({ type: 'setSpeed', value: v }); }} />
      <Slider label="Density (target)" min={0} max={120} step={1} value={density}
        onChange={(v) => { setDensity(v); send({ type: 'setDensity', count: v }); }} />

      <div className="divider" />
      <h3>Signal timing</h3>
      <Slider label="NS green" min={3} max={60} step={1} value={nsGreen} unit="s"
        onChange={(v) => { setNsGreen(v); dur('nsGreen', v); }} />
      <Slider label="EW green" min={3} max={60} step={1} value={ewGreen} unit="s"
        onChange={(v) => { setEwGreen(v); dur('ewGreen', v); }} />
      <Slider label="Left-turn green" min={3} max={30} step={1} value={leftGreen} unit="s"
        onChange={(v) => { setLeftGreen(v); dur('leftGreen', v); }} />
      <Slider label="Yellow" min={1} max={6} step={0.5} value={yellow} unit="s"
        onChange={(v) => { setYellow(v); dur('yellow', v); }} />
      <Slider label="All-red clearance" min={0.5} max={4} step={0.5} value={allRed} unit="s"
        onChange={(v) => { setAllRed(v); dur('allRed', v); }} />

      <div className="divider" />
      <h3>Emergency</h3>
      <label className="select-row">
        <span>Approach</span>
        <select value={approach} onChange={(e) => setApproach(e.target.value)}>
          <option>NORTH</option>
          <option>SOUTH</option>
          <option>EAST</option>
          <option>WEST</option>
        </select>
      </label>
      <div className="btn-row">
        <button className="btn emergency" onClick={() => send({ type: 'spawnEmergency', vehicleType: 'AMBULANCE', approach })}>
          🚑 Ambulance
        </button>
        <button className="btn emergency" onClick={() => send({ type: 'spawnEmergency', vehicleType: 'FIRETRUCK', approach })}>
          🚒 Fire Truck
        </button>
      </div>

      <div className="divider" />
      <div className="btn-row">
        <button className="btn" onClick={togglePause}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button className="btn danger" onClick={() => send({ type: 'reset' })}>↺ Reset</button>
      </div>
    </div>
  );
}
