import type { LatLng, ZoneVersion } from './types.ts';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Desplazamiento aproximado en metros (válido para las distancias de una partida).
export function offsetM(origin: LatLng, northM: number, eastM: number): LatLng {
  const dLat = northM / EARTH_RADIUS_M;
  const dLng = eastM / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)));
  return { lat: origin.lat + (dLat * 180) / Math.PI, lng: origin.lng + (dLng * 180) / Math.PI };
}

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  );
}

// Versión de zona vigente para un desfase dado desde el inicio de ACTIVE.
// Antes de ACTIVE (desfase negativo) se usa la primera versión.
export function zoneAt(schedule: readonly ZoneVersion[], offsetMs: number): ZoneVersion {
  const sorted = [...schedule].sort((a, b) => a.fromOffsetMs - b.fromOffsetMs);
  const first = sorted[0];
  if (!first) throw new Error('zone schedule is empty');
  let current = first;
  for (const version of sorted) {
    if (version.fromOffsetMs <= Math.max(0, offsetMs)) current = version;
  }
  return current;
}

// Fuera de la zona solo si lo está incluso descontando la precisión (beneficio de la duda).
export function isOutsideZone(position: LatLng, accuracyM: number, zone: ZoneVersion): boolean {
  return distanceM(position, zone.center) - accuracyM > zone.radiusM;
}
