// Valores tomados de docs/product/MVP_SCOPE.md y docs/technical/GAME_STATE_MACHINE.md.
// Todos son propuestas [P]: se recalibran tras S1.

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

export const LIMITS = {
  minPlayers: 2,
  maxPlayers: 20,
  durationMs: { min: 10 * MINUTE, max: 120 * MINUTE },
  // Mínimo de 2 min aprobado (D-042). El máximo de 10 min sigue siendo una propuesta.
  headStartMs: { min: 2 * MINUTE, max: 10 * MINUTE },
  pingIntervalMs: { min: 2 * MINUTE, max: 15 * MINUTE },
  zoneRadiusM: { min: 150, max: 2_000 },
  nameLength: { min: 2, max: 20 },
  // Hoy solo se admite una versión de zona (zona fija). La estructura versionada existe para la
  // zona dinámica, que forma parte del diseño previsto (D-032) pero cuya inclusión en la primera
  // versión jugable no está decidida y cuyos parámetros siguen siendo hipótesis (D-038).
  maxZoneVersions: 1,
} as const;

// Versión de las reglas con las que se juega cada partida (Plan Maestro §8.3: «cada Match guarda versión
// de reglas para poder entender el resultado aunque el modo cambie más adelante»). Cambiarla cuando
// cambie cualquier regla que afecte al resultado (p. ej., D-049 cambió el criterio de captura).
export const RULES_VERSION = 'clasico/2026-10-26';

// Valores por defecto aprobados (D-042).
export const DEFAULTS = {
  headStartMs: 2 * MINUTE,
} as const;

export const TIMING = {
  countdownMs: 5 * SECOND, // aprobado (D-042)
  hostHandoverMs: 120 * SECOND,
  outOfZoneGraceMs: 30 * SECOND,
  tagConfirmMs: 30 * SECOND,
  spectatorDelayMs: 60 * SECOND,
  rematchWindowMs: 30 * MINUTE,
  lobbyIdleMs: 30 * MINUTE,
  roomMaxLifetimeMs: 6 * HOUR,
  sampleHistoryMs: 120 * SECOND,
} as const;

export const LOCATION = {
  currentMaxAgeMs: 15 * SECOND,
  staleMaxAgeMs: 120 * SECOND,
  currentMaxAccuracyM: 50,
  // Margen para relojes ligeramente adelantados tras la sincronización.
  futureToleranceMs: 2 * SECOND,
  maxPlausibleSpeedMps: 12,
  implausibleSpeedStreak: 3,
} as const;

// Zona de salida de los cazadores durante la ventaja (D-042): solo se avisa, nunca se sanciona.
// El radio es un parámetro EXPERIMENTAL (D-038), no aprobado.
export const START_ZONE = {
  radiusM: 50,
} as const;

export const TAG = {
  maxAgeMs: 15 * SECOND,
  maxAccuracyM: 30,
  baseRadiusM: 5,
  maxRadiusM: 40,
} as const;
