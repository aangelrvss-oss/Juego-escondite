import { LOCATION, TIMING } from './constants.ts';
import { distanceM, isValidLatLng } from './geo.ts';
import type { Availability, LocationSample, Player, StoredSample } from './types.ts';

export function isValidSample(sample: LocationSample): boolean {
  return (
    isValidLatLng(sample) &&
    Number.isFinite(sample.accuracyM) &&
    sample.accuracyM > 0 &&
    sample.accuracyM < 10_000 &&
    Number.isFinite(sample.measuredAt)
  );
}

// Un measuredAt en el futuro indica un reloj mal sincronizado: se usa la hora de
// recepción y se marca como sospechosa. Un measuredAt antiguo se respeta tal cual
// (puede ser una muestra guardada sin cobertura) para no presentarla como actual.
export function toStoredSample(sample: LocationSample, receivedAt: number): StoredSample {
  const clockSuspect = sample.measuredAt > receivedAt + LOCATION.futureToleranceMs;
  return {
    lat: sample.lat,
    lng: sample.lng,
    accuracyM: sample.accuracyM,
    measuredAt: sample.measuredAt,
    ...(sample.isMock === undefined ? {} : { isMock: sample.isMock }),
    receivedAt,
    clockSuspect,
    effectiveAt: clockSuspect ? receivedAt : Math.min(sample.measuredAt, receivedAt),
  };
}

export function latestSample(player: Player): StoredSample | null {
  return player.samples[player.samples.length - 1] ?? null;
}

export function sampleAsOf(player: Player, at: number): StoredSample | null {
  let found: StoredSample | null = null;
  for (const s of player.samples) if (s.effectiveAt <= at) found = s;
  return found;
}

export function availabilityOf(sample: StoredSample | null, now: number): Availability {
  if (!sample) return 'UNAVAILABLE';
  const age = now - sample.effectiveAt;
  if (age > LOCATION.staleMaxAgeMs) return 'UNAVAILABLE';
  if (age > LOCATION.currentMaxAgeMs) return 'STALE';
  if (sample.accuracyM > LOCATION.currentMaxAccuracyM) return 'STALE';
  if (sample.clockSuspect) return 'STALE';
  return 'CURRENT';
}

/**
 * ¿Es `next` físicamente alcanzable desde `ref`? Se descuenta la precisión de las dos lecturas (el
 * ruido del GPS no cuenta como movimiento) y el intervalo mínimo es 1 s (dos lecturas casi
 * simultáneas muy separadas son un salto, no una velocidad infinita que se ignora).
 */
function reachable(ref: StoredSample, next: StoredSample): boolean {
  const dt = Math.max(1, (next.effectiveAt - ref.effectiveAt) / 1_000);
  const excess = Math.max(0, distanceM(ref, next) - ref.accuracyM - next.accuracyM);
  return excess / dt <= LOCATION.maxPlausibleSpeedMps;
}

/**
 * Salto sin confirmar (Plan Maestro §4.1: «filtrar saltos imposibles»; §10: «un salto GPS aislado»
 * no puede validar una captura). Una lectura NO es un salto si es alcanzable desde la anterior (un
 * movimiento real queda confirmado con la siguiente lectura coherente) o, si la anterior era un salto,
 * desde la última lectura sana (un valor atípico aislado se descarta y se vuelve a la posición real).
 */
function isJump(samples: StoredSample[], next: StoredSample): boolean {
  const last = samples[samples.length - 1];
  if (!last) return false;
  if (reachable(last, next)) return false;
  if (last.jump) {
    const sound = [...samples].reverse().find((s) => !s.jump);
    if (sound && reachable(sound, next)) return false;
  }
  return true;
}

// Añade la muestra si es más reciente que la última. Devuelve false si se descarta.
export function recordSample(player: Player, sample: StoredSample, now: number): boolean {
  const last = latestSample(player);
  if (last && sample.effectiveAt <= last.effectiveAt) return false;

  if (sample.isMock && !player.flags.includes('mock_location')) player.flags.push('mock_location');
  if (isJump(player.samples, sample)) sample.jump = true;
  if (last) {
    const dt = (sample.effectiveAt - last.effectiveAt) / 1_000;
    const speed = dt >= 1 ? distanceM(last, sample) / dt : 0;
    player.speedStreak = speed > LOCATION.maxPlausibleSpeedMps ? player.speedStreak + 1 : 0;
    if (player.speedStreak >= LOCATION.implausibleSpeedStreak && !player.flags.includes('implausible_speed')) {
      player.flags.push('implausible_speed');
    }
  }

  player.samples.push(sample);
  const cutoff = now - TIMING.sampleHistoryMs;
  player.samples = player.samples.filter((s, i, all) => i === all.length - 1 || s.effectiveAt >= cutoff);
  return true;
}
