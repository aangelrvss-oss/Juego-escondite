import { DYNAMIC_ZONE } from './constants.ts';
import { distanceM, offsetM, zoneAt } from './geo.ts';
import { mulberry32 } from './rng.ts';
import type { GameConfig, LatLng, RoomState, ZoneVersion } from './types.ts';

// Zona dinámica (config.dynamicZone). El plan es una lista de puntos clave {fromOffsetMs, center,
// radiusM}, contados desde el inicio de la persecución: en cada punto la zona es exactamente esa, y
// entre dos puntos encoge y se desplaza en línea recta (sin saltos). Lo calcula el motor una vez al
// empezar y no depende de ningún temporizador: la zona de un instante es una función del plan y de la
// hora del servidor, igual en el servidor y en todos los móviles.

// 7 decimales ≈ 1 cm: el plan se guarda y se envía sin arrastrar ruido de coma flotante.
const round7 = (x: number): number => Math.round(x * 1e7) / 1e7;

/**
 * Plan de la partida: la zona inicial durante la primera fase y, desde cada cambio de fase
 * (5, 10, 15… min), el camino hasta la zona siguiente. Cada zona queda dentro de la anterior (y por
 * tanto de la inicial) y nunca baja del radio mínimo; al llegar a él, el plan termina y la zona se
 * queda fija. Determinista: misma configuración y semilla, mismo plan.
 */
export function buildZonePlan(config: GameConfig, seed: number): ZoneVersion[] {
  const first = zoneAt(config.zone, 0);
  const start = { fromOffsetMs: 0, center: first.center, radiusM: first.radiusM };
  const plan: ZoneVersion[] = [start];
  const { phaseMs, shrink, minRadiusM, shift, walkMps } = DYNAMIC_ZONE;
  const random = mulberry32(seed);
  let prev = start;
  // La fase k empieza en k × phaseMs (k ≥ 1) si todavía queda persecución.
  for (let k = 1; k * phaseMs < config.durationMs; k++) {
    const radiusM = Math.max(minRadiusM, Math.round(prev.radiusM * (1 - shrink)));
    if (radiusM >= prev.radiusM) break; // radio mínimo: la zona ya no cambia
    // La zona de la fase anterior se mantiene hasta que empieza esta (primera fase: la inicial).
    if (k === 1) plan.push({ fromOffsetMs: phaseMs, center: prev.center, radiusM: prev.radiusM });
    const lost = prev.radiusM - radiusM;
    const maxShift = Math.max(0, Math.min(lost * shift.max, walkMps * (phaseMs / 1_000) - lost));
    const distance = Math.min(maxShift, lost * (shift.min + random() * (shift.max - shift.min)));
    const angle = random() * 2 * Math.PI;
    const moved = offsetM(prev.center, distance * Math.cos(angle), distance * Math.sin(angle));
    const center = { lat: round7(moved.lat), lng: round7(moved.lng) };
    const next = { fromOffsetMs: (k + 1) * phaseMs, center, radiusM };
    plan.push(next);
    prev = next;
  }
  return plan;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Zona en un desfase desde el inicio de la persecución: interpola entre los dos puntos clave que lo
 * rodean. Antes del primero (huida, desfase negativo) vale el primero; después del último, el último.
 */
export function zoneInPlan(plan: readonly ZoneVersion[], offsetMs: number): ZoneVersion {
  const first = plan[0];
  if (!first) throw new Error('zone plan is empty');
  if (offsetMs <= first.fromOffsetMs) return { fromOffsetMs: offsetMs, center: first.center, radiusM: first.radiusM };
  for (let i = 1; i < plan.length; i++) {
    const a = plan[i - 1] as ZoneVersion;
    const b = plan[i] as ZoneVersion;
    if (offsetMs >= b.fromOffsetMs) continue;
    const t = (offsetMs - a.fromOffsetMs) / (b.fromOffsetMs - a.fromOffsetMs);
    const center: LatLng = { lat: lerp(a.center.lat, b.center.lat, t), lng: lerp(a.center.lng, b.center.lng, t) };
    return { fromOffsetMs: offsetMs, center, radiusM: lerp(a.radiusM, b.radiusM, t) };
  }
  const last = plan[plan.length - 1] as ZoneVersion;
  return { fromOffsetMs: offsetMs, center: last.center, radiusM: last.radiusM };
}

/** Zona vigente de la sala a la hora `now` (del servidor): la del plan si hay zona dinámica; si no, la fija. */
export function currentZone(s: RoomState, now: number): ZoneVersion | null {
  if (!s.config) return null;
  const offset = now - (s.activeStart ?? now);
  return s.zonePlan ? zoneInPlan(s.zonePlan, offset) : zoneAt(s.config.zone, offset);
}

/** Desfase en que empieza cada fase con cambio de zona (5, 10, 15… min), según el plan. */
export function zonePhaseStarts(plan: readonly ZoneVersion[]): number[] {
  // El punto clave i (i ≥ 2) es el destino de la fase que empieza en el punto anterior.
  return plan.slice(2).map((_, i) => (plan[i + 1] as ZoneVersion).fromOffsetMs);
}

/**
 * Parte del plan que puede verse: hasta el destino de la fase en curso (`phasesStarted` fases ya
 * empezadas). Las zonas de fases futuras no se revelan por adelantado (GAME_MODES_AND_RULES §6.2).
 */
export function visibleZonePlan(plan: readonly ZoneVersion[], phasesStarted: number): ZoneVersion[] {
  return plan.slice(0, Math.min(plan.length, 2 + phasesStarted));
}

/** Comprobación usada por las pruebas: cada punto clave dentro del anterior (con 1 cm de margen). */
export function isNested(inner: ZoneVersion, outer: ZoneVersion): boolean {
  return distanceM(inner.center, outer.center) + inner.radiusM <= outer.radiusM + 0.01;
}
