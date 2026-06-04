// Mirror of the backend VehicleType enum (ordinal order matters: it is the wire `t` value).
//
// VEHICLE SIZE RULES (kept in sync with backend/.../model/VehicleType.java and enforced by
// vehicleTypes.rules.test.ts):
//   R1 - `length` here MUST equal the backend `lengthM`, because the renderer draws each body
//        along the front-to-rear chord the backend sends. If they drift, bodies overlap or gap.
//   R2 - Realistic length order: bicycle < motorcycle < car <= SUV <= van < bus, and van < truck.
//   R3 - A truck is never smaller than a car (truck.length > car.length). A truck may be about
//        the same length as a bus (they are the two largest civilians; neither must exceed the
//        other by much).
//   R4 - Every vehicle must fit within ONE lane: width <= 0.92 * laneWidth (laneWidth = 3.5 m),
//        so no body spills across the lane lines. Widths below are the real vehicle widths and
//        the renderer clamps the drawn cross-axis to 0.92 of a lane (see LANE_FIT in draw.ts).
export interface VehicleTypeInfo {
  label: string;
  color: string;
  length: number; // meters (MUST mirror backend lengthM - see R1)
  width: number; // meters (render only; real vehicle width, see R4)
  emergency: boolean;
}

export const VEHICLE_TYPES: VehicleTypeInfo[] = [
  { label: 'Bicycle', color: '#059669', length: 1.8, width: 0.65, emergency: false },
  { label: 'Motorcycle', color: '#db2777', length: 2.2, width: 0.9, emergency: false },
  { label: 'Car', color: '#2563eb', length: 4.5, width: 1.9, emergency: false },
  { label: 'SUV', color: '#7c3aed', length: 4.9, width: 2.0, emergency: false },
  { label: 'Van', color: '#d97706', length: 5.5, width: 2.1, emergency: false },
  { label: 'Bus', color: '#ea580c', length: 9.5, width: 2.5, emergency: false },
  { label: 'Truck', color: '#475569', length: 10.5, width: 2.5, emergency: false },
  { label: 'Ambulance', color: '#e0584f', length: 6.0, width: 2.2, emergency: true },
  { label: 'Fire Truck', color: '#d8453d', length: 10.0, width: 2.5, emergency: true },
];

export function typeInfo(t: number): VehicleTypeInfo {
  return VEHICLE_TYPES[t] ?? VEHICLE_TYPES[2];
}
