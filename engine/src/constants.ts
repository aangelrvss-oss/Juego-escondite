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
  // 50 m desde el 1/11/2026 (opciones de 50 y 100 m pedidas por el propietario; antes, 150 m).
  zoneRadiusM: { min: 50, max: 2_000 },
  nameLength: { min: 2, max: 20 },
  // El anfitrión solo envía la zona inicial. La zona dinámica no la manda el cliente: la calcula el
  // motor al empezar (DYNAMIC_ZONE, engine/src/zone.ts).
  maxZoneVersions: 1,
} as const;

// Versión de las reglas con las que se juega cada partida (Plan Maestro §8.3: «cada Match guarda versión
// de reglas para poder entender el resultado aunque el modo cambie más adelante»). Cambiarla cuando
// cambie cualquier regla que afecte al resultado (p. ej., D-049 cambió el criterio de captura).
// 2026-10-30: periodo de gracia (D-057): a los 5 min sin señal, el jugador queda fuera como si abandonara.
export const RULES_VERSION = 'clasico/2026-10-30';

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

// Presencia y periodo de gracia (D-057, aprobado el 30/10/2026): a los 30 s sin ninguna señal de la
// aplicación los demás ven al jugador «sin conexión»; a los 5 min queda fuera de la partida, como si la
// hubiera abandonado. Solo en la huida y la persecución.
export const PRESENCE = {
  awayAfterMs: 30 * SECOND,
  absenceTimeoutMs: 5 * MINUTE,
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

// Zona dinámica (config.dynamicZone, 1/11/2026). Cada 5 min desde el inicio de la persecución empieza
// una fase: el círculo encoge y se desplaza de forma continua hasta su destino, que alcanza al final de la
// fase. HIPÓTESIS de prueba, no reglas aprobadas (D-032, D-038): ver QA/ciclo-20261101-zona-dinamica.
export const DYNAMIC_ZONE = {
  phaseMs: 5 * MINUTE,
  shrink: 0.15, // fracción del radio que se pierde en cada fase
  minRadiusM: 50, // por debajo, el error del GPS (10–30 m) manda; al llegar, la zona queda fija
  // Desplazamiento del centro como fracción de lo que encoge el radio (< 1: cada zona queda dentro de la
  // anterior, GAME_MODES_AND_RULES §6.3.1).
  shift: { min: 0.25, max: 0.75 },
  // «Nadie necesita correr» (§6.3.2): desplazamiento + reducción ≤ paso normal × duración de la fase.
  walkMps: 1.2,
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
