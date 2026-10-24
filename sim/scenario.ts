// Escenario de partida completa con bots deterministas (SIMULADO, no son dispositivos reales).
// Movimiento y ruido GPS generados con PRNG con semilla: misma semilla, misma partida.

import { MINUTE } from '../engine/src/constants.ts';
import { distanceM, offsetM } from '../engine/src/geo.ts';
import { mulberry32 } from '../engine/src/rng.ts';
import type { GameConfig, LatLng } from '../engine/src/types.ts';
import { SimClient } from './client.ts';
import { SimHost } from './host.ts';

export const CENTER: LatLng = { lat: 40.4153, lng: -3.6845 };
export const T0 = Date.UTC(2026, 9, 24, 17, 0, 0);
export const STEP_MS = 5_000;

export function deterministicHost(seed: number, extra: { logRetention?: number } = {}): SimHost {
  let ids = 0;
  let codes = 0;
  return new SimHost({
    startTime: T0,
    seed,
    ...extra,
    idGenerator: (prefix) => `${prefix}${++ids}`,
    codeGenerator: () => `C${String(++codes).padStart(5, '0')}`,
  });
}

export function scenarioConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    durationMs: 20 * MINUTE,
    headStartMs: 2 * MINUTE,
    pingIntervalMs: 3 * MINUTE,
    zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 400 }],
    meetingPoint: CENTER,
    safetyChecklistConfirmed: true,
    ...overrides,
  };
}

export interface Lobby {
  host: SimHost;
  hostClient: SimClient;
  clients: SimClient[]; // incluye al anfitrión en la posición 0
  hunters: SimClient[];
  runners: SimClient[];
}

// Monta una sala con equipos fijados (anfitrión = primer cazador) y la arranca.
export function startedGame(host: SimHost, nHunters: number, nRunners: number, cfg: Partial<GameConfig> = {}): Lobby {
  const hostClient = new SimClient(host, 'Anfitrion', 'dev-0');
  const created = hostClient.createRoom();
  if (!created.ok) throw new Error('createRoom failed');
  const code = String(created.data?.code);
  const clients = [hostClient];
  for (let i = 1; i < nHunters + nRunners; i++) {
    const c = new SimClient(host, `Bot ${i}`, `dev-${i}`);
    const r = c.join(code);
    if (!r.ok) throw new Error(`join failed: ${JSON.stringify(r)}`);
    clients.push(c);
  }
  const hunters = clients.slice(0, nHunters);
  const runners = clients.slice(nHunters);
  for (const c of hunters) c.send({ type: 'set_team_pref', pref: 'hunter' });
  for (const c of runners) c.send({ type: 'set_team_pref', pref: 'runner' });
  hostClient.send({ type: 'configure', config: scenarioConfig(cfg) });
  for (const c of clients) {
    c.syncClock();
    c.send({ type: 'set_ready', ready: true });
  }
  const started = hostClient.send({ type: 'start' });
  if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started)}`);
  return { host, hostClient, clients, hunters, runners };
}

export interface BotGameOptions {
  seed: number;
  hunters: number;
  runners: number;
  cfg?: Partial<GameConfig>;
  // Un fugitivo sale de la zona un rato para provocar la visibilidad en directo.
  wanderer?: boolean;
}

export interface BotGameResult extends Lobby {
  steps: number;
}

export function runBotGame(options: BotGameOptions): BotGameResult {
  const random = mulberry32(options.seed);
  const host = deterministicHost(options.seed);
  const lobby = startedGame(host, options.hunters, options.runners, options.cfg);
  const radius = lobby.host.stateOf(lobby.hostClient.playerId).config?.zone[0]?.radiusM ?? 400;
  const truth = new Map<string, LatLng>();
  for (const c of lobby.clients) truth.set(c.playerId, CENTER);
  const wanderer = options.wanderer ? lobby.runners[0] : undefined;

  const noisy = (p: LatLng): LatLng => offsetM(p, (random() - 0.5) * 8, (random() - 0.5) * 8);
  const moveToward = (from: LatLng, to: LatLng, meters: number): LatLng => {
    const d = distanceM(from, to);
    if (d <= meters || d === 0) return to;
    const f = meters / d;
    return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f };
  };

  let steps = 0;
  for (; steps < 10_000; steps++) {
    const state = host.stateOf(lobby.hostClient.playerId);
    if (state.phase === 'FINISHED' || state.phase === 'CANCELLED') break;
    const live = state.phase === 'HEAD_START' || state.phase === 'ACTIVE';
    const activeOffset = state.activeStart !== null ? host.now - state.activeStart : -1;

    for (const c of lobby.clients) {
      const player = state.players[c.playerId];
      if (!player || player.status !== 'active' || !live) continue;
      const pos = truth.get(c.playerId) ?? CENTER;
      let next = pos;
      if (player.team === 'runner') {
        if (c === wanderer && activeOffset > 3 * MINUTE && activeOffset < 8 * MINUTE) {
          // Sale claramente de la zona (a 3 m/s hacia un punto 200 m más allá del borde).
          next = moveToward(pos, offsetM(CENTER, radius + 200, 0), 3 * (STEP_MS / 1000));
        } else {
          const angle = random() * 2 * Math.PI;
          const step = 1.2 * (STEP_MS / 1000);
          next = offsetM(pos, Math.cos(angle) * step, Math.sin(angle) * step);
          if (distanceM(next, CENTER) > radius * 0.85) next = moveToward(pos, CENTER, step);
        }
      } else if (state.phase === 'ACTIVE') {
        // Cazador: va hacia la posición más cercana de la última pista recibida.
        const pings = c.eventsOfType('ping');
        const lastPing = pings[pings.length - 1]?.data.ping as
          | { entries: { runnerId: string; position: LatLng | null }[] }
          | undefined;
        const targets = (lastPing?.entries ?? [])
          .filter((e) => e.position && state.players[e.runnerId]?.status === 'active')
          .map((e) => e.position as LatLng);
        const exposed = c.positions[c.positions.length - 1]?.positions
          .filter((v) => v.reason === 'exposed' && v.lat !== null && v.lng !== null)
          .map((v) => ({ lat: v.lat as number, lng: v.lng as number }));
        const candidates = [...(exposed ?? []), ...targets];
        candidates.sort((a, b) => distanceM(pos, a) - distanceM(pos, b));
        const target = candidates[0];
        next = target ? moveToward(pos, target, 2.2 * (STEP_MS / 1000)) : pos;
      }
      truth.set(c.playerId, next);
      const reported = noisy(next);
      c.sendLocation(reported.lat, reported.lng, 8);
    }

    // Capturas: un cazador reclama solo si está realmente a menos de 4 m (bots honestos).
    if (state.phase === 'ACTIVE') {
      for (const h of lobby.hunters) {
        if (host.stateOf(h.playerId).players[h.playerId]?.status !== 'active') continue;
        for (const r of lobby.runners) {
          const current = host.stateOf(r.playerId).players[r.playerId];
          if (current?.status !== 'active') continue;
          const a = truth.get(h.playerId);
          const b = truth.get(r.playerId);
          if (a && b && distanceM(a, b) <= 4) {
            h.send({ type: 'claim_tag', runnerId: r.playerId });
            break;
          }
        }
      }
      // Los fugitivos confirman con honestidad las reclamaciones pendientes.
      for (const r of lobby.runners) {
        for (const ev of r.eventsOfType('tag_claimed')) {
          const claimId = String(ev.data.claimId);
          if (host.stateOf(r.playerId).claims[claimId]) r.send({ type: 'respond_tag', claimId, accept: true });
        }
      }
    }
    for (const c of lobby.clients) c.resyncIfNeeded();
    host.advance(STEP_MS);
  }
  return { ...lobby, steps };
}
