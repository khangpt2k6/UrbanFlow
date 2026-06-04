import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANE_FIT, LAYOUT } from './layout';
import { VEHICLE_TYPES, type VehicleTypeInfo } from './vehicleTypes';

// Enforces the documented VEHICLE SIZE RULES (see vehicleTypes.ts). These are guardrails: if a
// future edit makes a truck shorter than a car, a body wider than its lane, or lets the frontend
// drift from the backend, one of these tests fails.

const byLabel = (label: string): VehicleTypeInfo => {
  const t = VEHICLE_TYPES.find((v) => v.label === label);
  if (!t) throw new Error(`missing vehicle type: ${label}`);
  return t;
};

describe('vehicle size rules', () => {
  // R1 - frontend lengths must mirror backend VehicleType.lengthM exactly.
  it('R1: every length mirrors the backend VehicleType enum', () => {
    const javaPath = fileURLToPath(
      new URL('../../../backend/src/main/java/com/trafficflow/model/VehicleType.java', import.meta.url),
    );
    const java = readFileSync(javaPath, 'utf8');
    // Matches lines like:  CAR ("Car", 4.5, 13.9, ...)
    const re = /^\s*[A-Z_]+\s*\(\s*"([^"]+)"\s*,\s*([\d.]+)/gm;
    const backend = new Map<string, number>();
    for (const m of java.matchAll(re)) backend.set(m[1], Number(m[2]));

    expect(backend.size).toBe(VEHICLE_TYPES.length);
    for (const t of VEHICLE_TYPES) {
      expect(backend.has(t.label), `backend missing ${t.label}`).toBe(true);
      expect(backend.get(t.label), `length drift for ${t.label}`).toBeCloseTo(t.length, 5);
    }
  });

  // R2 - realistic, monotonic-ish length ordering for the common civilian classes.
  it('R2: bicycle < motorcycle < car <= SUV <= van < bus, and van < truck', () => {
    const bike = byLabel('Bicycle').length;
    const moto = byLabel('Motorcycle').length;
    const car = byLabel('Car').length;
    const suv = byLabel('SUV').length;
    const van = byLabel('Van').length;
    const bus = byLabel('Bus').length;
    const truck = byLabel('Truck').length;

    expect(bike).toBeLessThan(moto);
    expect(moto).toBeLessThan(car);
    expect(car).toBeLessThanOrEqual(suv);
    expect(suv).toBeLessThanOrEqual(van);
    expect(van).toBeLessThan(bus);
    expect(van).toBeLessThan(truck);
  });

  // R3 - a truck is never smaller than a car, and a truck is about the same size as a bus.
  it('R3: truck > car, and truck is within ~30% of bus length', () => {
    const car = byLabel('Car').length;
    const bus = byLabel('Bus').length;
    const truck = byLabel('Truck').length;

    expect(truck).toBeGreaterThan(car);
    const ratio = Math.max(truck, bus) / Math.min(truck, bus);
    expect(ratio).toBeLessThanOrEqual(1.3); // "truck can equal bus" - they stay comparable
  });

  // R4 - every vehicle must fit inside one lane.
  it('R4: every vehicle width fits within one lane (<= LANE_FIT * laneWidth)', () => {
    const maxWidth = LANE_FIT * LAYOUT.laneWidth;
    for (const t of VEHICLE_TYPES) {
      expect(t.width, `${t.label} too wide for a lane`).toBeLessThanOrEqual(maxWidth);
      expect(t.length, `${t.label} length must be positive`).toBeGreaterThan(0);
      expect(t.width, `${t.label} width must be positive`).toBeGreaterThan(0);
    }
  });
});
