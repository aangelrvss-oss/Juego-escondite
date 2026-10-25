import assert from 'node:assert/strict';
import { MINUTE, TIMING } from '../src/constants.ts';
import { applyCommand, createRoom, tick } from '../src/engine.ts';
import { offsetM } from '../src/geo.ts';
import type { Command, CommandResult, EngineEvent, GameConfig, LatLng, RoomState, TeamPref } from '../src/types.ts';

// Coordenadas de prueba (Retiro, Madrid). Solo existen en los tests.
export const CENTER: LatLng = { lat: 40.4153, lng: -3.6845 };
export const T0 = Date.UTC(2026, 9, 24, 17, 0, 0);

export function config(overrides: Partial<GameConfig> = {}): GameConfig {
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

// Pequeño arnés sobre el motor puro: guarda estado, hora y eventos acumulados.
export class Harness {
  state: RoomState;
  now: number;
  events: EngineEvent[] = [];

  constructor(hostName = 'Ana', now = T0, seed = 42) {
    this.now = now;
    const step = createRoom({ roomId: 'room1', hostId: 'h', hostName, hostDeviceId: 'dev-h', now, seed });
    assert.equal(step.result.ok, true);
    this.state = step.state;
  }

  cmd(actor: string, command: Command): CommandResult {
    const step = applyCommand(this.state, actor, command, this.now);
    this.state = step.state;
    this.events.push(...step.events);
    return step.result;
  }

  ok(actor: string, command: Command): void {
    const r = this.cmd(actor, command);
    assert.equal(r.ok, true, `expected ok for ${command.type}, got ${JSON.stringify(r)}`);
  }

  advance(ms: number): void {
    this.now += ms;
    const step = tick(this.state, this.now);
    this.state = step.state;
    this.events.push(...step.events);
  }

  join(id: string, pref: TeamPref = 'random', name = `Jug ${id}`): void {
    this.ok(id, { type: 'join', name, deviceId: `dev-${id}` });
    if (pref !== 'random') this.ok(id, { type: 'set_team_pref', pref });
  }

  readyAll(): void {
    for (const id of this.state.playerOrder) {
      if (this.state.players[id]?.status === 'lobby') this.ok(id, { type: 'set_ready', ready: true });
    }
  }

  eventsOf(type: string): EngineEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  // Envía una posición a `metersNorth` m al norte del centro (precisión por defecto 8 m).
  at(id: string, metersNorth: number, accuracyM = 8, measuredAt = this.now, metersEast = 0): CommandResult {
    const p = offsetM(CENTER, metersNorth, metersEast);
    return this.cmd(id, { type: 'location', sample: { lat: p.lat, lng: p.lng, accuracyM, measuredAt } });
  }
}

// Partida lista en ACTIVE: anfitrión "h" cazador, más cazadores y fugitivos indicados.
export function activeGame(options: { hunters?: string[]; runners?: string[]; cfg?: Partial<GameConfig> } = {}): Harness {
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  for (const id of options.hunters ?? []) g.join(id, 'hunter');
  for (const id of options.runners ?? ['r1']) g.join(id, 'runner');
  g.ok('h', { type: 'configure', config: config(options.cfg) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs); // cuenta atrás
  g.advance(g.state.config?.headStartMs ?? 0);
  assert.equal(g.state.phase, 'ACTIVE');
  return g;
}
