// Mirror of the backend VehicleType enum (ordinal order matters: it is the wire `t` value).
export interface VehicleTypeInfo {
  label: string;
  color: string;
  length: number; // meters
  width: number; // meters (render only)
  emergency: boolean;
}

export const VEHICLE_TYPES: VehicleTypeInfo[] = [
  { label: 'Bicycle', color: '#059669', length: 1.8, width: 0.9, emergency: false },
  { label: 'Motorcycle', color: '#db2777', length: 2.2, width: 1.1, emergency: false },
  { label: 'Car', color: '#2563eb', length: 4.5, width: 2.0, emergency: false },
  { label: 'SUV', color: '#7c3aed', length: 4.9, width: 2.1, emergency: false },
  { label: 'Van', color: '#d97706', length: 5.5, width: 2.2, emergency: false },
  { label: 'Bus', color: '#ea580c', length: 8.0, width: 2.4, emergency: false },
  { label: 'Truck', color: '#475569', length: 10.5, width: 2.5, emergency: false },
  { label: 'Ambulance', color: '#e0584f', length: 6.0, width: 2.3, emergency: true },
  { label: 'Fire Truck', color: '#d8453d', length: 10.0, width: 2.5, emergency: true },
];

export function typeInfo(t: number): VehicleTypeInfo {
  return VEHICLE_TYPES[t] ?? VEHICLE_TYPES[2];
}
