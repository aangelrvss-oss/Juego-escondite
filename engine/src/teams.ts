import { mulberry32, shuffle } from './rng.ts';
import type { Player, Team } from './types.ts';

// Reparto de equipos al empezar. Respeta las preferencias fijas y reparte los
// "aleatorio" para acercarse al objetivo de cazadores. Objetivo [P, sin definir en la
// documentación]: ceil(n/4) cazadores, entre 1 y floor(n/2).
export function targetHunters(n: number): number {
  return Math.max(1, Math.min(Math.floor(n / 2), Math.ceil(n / 4)));
}

export function resolveTeams(players: readonly Player[], seed: number): Map<string, Team> | null {
  const result = new Map<string, Team>();
  const randoms: Player[] = [];
  let hunters = 0;
  let runners = 0;
  for (const p of players) {
    if (p.teamPref === 'hunter') {
      result.set(p.id, 'hunter');
      hunters++;
    } else if (p.teamPref === 'runner') {
      result.set(p.id, 'runner');
      runners++;
    } else {
      randoms.push(p);
    }
  }

  const ordered = shuffle(randoms, mulberry32(seed));
  let needHunters = Math.max(0, targetHunters(players.length) - hunters);
  for (const p of ordered) {
    if (needHunters > 0) {
      result.set(p.id, 'hunter');
      hunters++;
      needHunters--;
    } else {
      result.set(p.id, 'runner');
      runners++;
    }
  }

  // Si todos los aleatorios acabaron de cazadores y no hay fugitivos, mueve uno.
  if (runners === 0) {
    const movable = ordered.find((p) => result.get(p.id) === 'hunter');
    if (movable) {
      result.set(movable.id, 'runner');
      hunters--;
      runners++;
    }
  }

  if (hunters < 1 || runners < 1) return null;
  return result;
}
