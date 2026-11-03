// Modos de juego (D-057). Una tabla de reglas, no un sistema de complementos: todo lo común (fases,
// plazos, zona, pistas, validación GPS de la captura, reconexión) está en engine.ts y es igual para
// todos los modos. Cada modo dice solo en qué se diferencia de Clásico.
// Referencia: docs/product/GAME_MODES_AND_RULES.md.

import { RULES_VERSION, SECOND } from './constants.ts';
import type { GameConfig } from './types.ts';

export type ModeId = 'classic' | 'infection' | 'fox_hunt';

export interface ModeRules {
  id: ModeId;
  // Versión de las reglas con las que se juega (se guarda con cada partida).
  rulesVersion: string;
  minPlayers: number;
  // Cazadores al empezar con n jugadores. Con `exactHunters`, las asignaciones manuales tienen que
  // cuadrar con esa cifra (si no, la partida no empieza: `teams_unbalanced`).
  hunters(n: number): number;
  exactHunters: boolean;
  // Qué pasa con un fugitivo cuya captura se confirma: pasa a espectador o se convierte en cazador.
  onCapture: 'spectator' | 'convert';
  // Tiempo que un convertido espera antes de poder reclamar capturas (solo con `convert`).
  convertTagDelayMs: number;
  // Los fugitivos ven en directo a los cazadores (Fox Hunt «Mr. X»).
  runnersSeeHunters: boolean;
}

const CLASSIC: ModeRules = {
  id: 'classic',
  rulesVersion: RULES_VERSION,
  minPlayers: 2,
  // [P, sin definir en la documentación]: ceil(n/4) cazadores, entre 1 y floor(n/2). Las asignaciones
  // manuales no tienen tope (como hasta ahora).
  hunters: (n) => Math.max(1, Math.min(Math.floor(n / 2), Math.ceil(n / 4))),
  exactHunters: false,
  onCapture: 'spectator',
  convertTagDelayMs: 0,
  runnersSeeHunters: false,
};

// GAME_MODES_AND_RULES §3 y D-057: cada captura confirmada convierte al fugitivo en cazador.
const INFECTION: ModeRules = {
  id: 'infection',
  rulesVersion: 'infeccion/2026-10-30',
  minPlayers: 4,
  hunters: (n) => Math.max(1, Math.floor(n / 4)),
  exactHunters: true,
  onCapture: 'convert',
  convertTagDelayMs: 60 * SECOND,
  runnersSeeHunters: false,
};

// D-057, variante «Mr. X»: un zorro (fugitivo) contra todos (cazadores). El zorro ve a los cazadores en
// directo; ellos reciben su posición exacta en cada pista (las de siempre). Si lo capturan, ganan; si
// aguanta hasta el final, gana el zorro. Zona, exposición y captura, como en Clásico.
const FOX_HUNT: ModeRules = {
  id: 'fox_hunt',
  rulesVersion: 'zorro/2026-10-30',
  minPlayers: 3,
  hunters: (n) => n - 1,
  exactHunters: true,
  onCapture: 'spectator',
  convertTagDelayMs: 0,
  runnersSeeHunters: true,
};

export const MODES: Readonly<Record<ModeId, ModeRules>> = { classic: CLASSIC, infection: INFECTION, fox_hunt: FOX_HUNT };

export const isModeId = (v: unknown): v is ModeId => typeof v === 'string' && Object.hasOwn(MODES, v);

/** Reglas del modo de una configuración (sin modo, o sin configuración: Clásico). */
export function modeOf(config: Pick<GameConfig, 'mode'> | null | undefined): ModeRules {
  const id = config?.mode;
  return isModeId(id) ? MODES[id] : CLASSIC;
}
