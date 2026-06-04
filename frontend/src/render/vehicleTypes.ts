// Mirror of the backend VehicleType enum (ordinal order matters: it is the wire `t` value).
export interface VehicleTypeInfo {
  label: string;
  color: string;
  length: number; // meters
  width: number; // meters (render only)
  emergency: boolean;
}

export const VEHICLE_TYPES: VehicleTypeInfo[] = [
  { label: 'Bicycle', color: '#34d399', length: 1.8, width: 0.8, emergency: false },
  { label: 'Motorcycle', color: '#f472b6', length: 2.2, width: 1.0, emergency: false },
  { label: 'Car', color: '#60a5fa', length: 4.5, width: 2.0, emergency: false },
  { label: 'SUV', color: '#a78bfa', length: 4.9, width: 2.1, emergency: false },
  { label: 'Van', color: '#fbbf24', length: 5.5, width: 2.2, emergency: false },
  { label: 'Bus', color: '#fb923c', length: 12.0, width: 2.5, emergency: false },
  { label: 'Truck', color: '#94a3b8', length: 16.5, width: 2.6, emergency: false },
  { label: 'Ambulance', color: '#ef4444', length: 6.0, width: 2.3, emergency: true },
  { label: 'Fire Truck', color: '#dc2626', length: 10.0, width: 2.5, emergency: true },
];

export function typeInfo(t: number): VehicleTypeInfo {
  return VEHICLE_TYPES[t] ?? VEHICLE_TYPES[2];
}
