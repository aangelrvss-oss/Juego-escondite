// Clasificación de una lectura de ubicación: frescura, precisión y disponibilidad.
// Sin DOM ni dependencias: se prueba en Node.
//
// Umbrales EXPERIMENTALES (D-038), los mismos del motor S0 (engine/src/constants.ts, LOCATION) y
// de S1 (android/core ExperimentalParams). La disponibilidad sigue a availabilityOf() del motor;
// una prueba compara ambas para que no diverjan.

export const THRESHOLDS = Object.freeze({
  currentMaxAgeMs: 15_000,
  staleMaxAgeMs: 120_000,
  currentMaxAccuracyM: 50,
});

/**
 * Antigüedad de la lectura ahora. El módulo nativo mide la antigüedad al entregarla con el reloj
 * monótono del sistema (ageMs) y la hora local de recepción (receivedAt); aquí solo se suma el
 * tiempo transcurrido desde entonces. Así no depende de la hora del satélite ni de saltos de reloj.
 */
export function ageNow(reading, nowMs) {
  if (!reading) return null;
  return Math.max(0, reading.ageMs + Math.max(0, nowMs - reading.receivedAt));
}

/** Frescura independiente de la precisión (como LiveReading en S1). */
export function freshnessOf(ageMs) {
  if (ageMs === null || ageMs === undefined) return 'NONE';
  return ageMs <= THRESHOLDS.currentMaxAgeMs ? 'UPDATED' : 'OLD';
}

/** Precisión: una precisión desconocida nunca se trata como suficiente. */
export function accuracyOf(accuracyM) {
  if (accuracyM === null || accuracyM === undefined || !Number.isFinite(accuracyM) || accuracyM < 0) return 'UNKNOWN';
  return accuracyM <= THRESHOLDS.currentMaxAccuracyM ? 'SUFFICIENT' : 'INSUFFICIENT';
}

/**
 * Disponibilidad, igual que el motor: sin lectura o con más de 120 s → UNAVAILABLE; con más de
 * 15 s, con precisión peor de 50 m o desconocida → STALE; en otro caso CURRENT. Una lectura
 * antigua o imprecisa nunca sale como actual.
 */
export function availabilityOf(ageMs, accuracyM) {
  if (ageMs === null || ageMs === undefined) return 'UNAVAILABLE';
  if (ageMs > THRESHOLDS.staleMaxAgeMs) return 'UNAVAILABLE';
  if (ageMs > THRESHOLDS.currentMaxAgeMs) return 'STALE';
  if (accuracyOf(accuracyM) !== 'SUFFICIENT') return 'STALE';
  return 'CURRENT';
}

export function classify(reading, nowMs) {
  const age = ageNow(reading, nowMs);
  return {
    ageMs: age,
    freshness: freshnessOf(age),
    accuracy: accuracyOf(reading ? reading.accuracyM : null),
    availability: availabilityOf(age, reading ? reading.accuracyM : null),
    isMock: reading ? reading.isMock === true : false,
  };
}

/** "—" sin lectura; "N s" por debajo de un minuto; "M min SS s" después. Redondea hacia arriba (S1). */
export function formatAge(ageMs) {
  if (ageMs === null || ageMs === undefined || ageMs < 0) return '—';
  const s = Math.ceil(ageMs / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

export const LABELS = Object.freeze({
  accuracy: { SUFFICIENT: 'Suficiente', INSUFFICIENT: 'Insuficiente', UNKNOWN: 'Desconocida' },
});

/**
 * Estado para la pantalla. STALE se explica por su causa: «Antigua» si ha pasado demasiado tiempo
 * e «Imprecisa» si es reciente pero su precisión no es suficiente (nunca se muestra como actual).
 */
export function statusLabel(c) {
  if (c.availability === 'CURRENT') return 'Actual';
  if (c.availability === 'UNAVAILABLE') return 'No disponible';
  return c.freshness === 'OLD' ? 'Antigua' : 'Imprecisa';
}
