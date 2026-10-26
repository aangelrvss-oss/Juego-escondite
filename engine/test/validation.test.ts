import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCommand, createRoom, tick } from '../src/engine.ts';
import { mulberry32 } from '../src/rng.ts';
import type { Command, RoomState } from '../src/types.ts';
import { MAX_STRING_LENGTH } from '../src/validate.ts';
import { CENTER, Harness, activeGame, config } from './helpers.ts';

// Validación de la entrada del motor: lo que llegue por la red puede tener cualquier forma.
const bad = (cmd: unknown) => cmd as Command;

// Aplica `cmd` y comprueba que se rechaza como invalid_command sin tocar estado ni emitir eventos.
function expectInvalid(g: Harness, actor: string, cmd: unknown, detail: string): void {
  const before = structuredClone(g.state);
  const step = applyCommand(g.state, actor, bad(cmd), g.now);
  assert.deepEqual(step.result, { ok: false, error: 'invalid_command', detail });
  assert.deepEqual(step.events, []);
  assert.deepEqual(step.state, before);
  assert.deepEqual(g.state, before, 'el estado de entrada no se modifica');
}

describe('validación de comandos', () => {
  it('casos que antes lanzaban excepciones', () => {
    const g = new Harness();
    expectInvalid(g, 'h', { type: 'configure', config: { ...config(), zone: [null] } }, 'config.zone[0]');
    expectInvalid(g, 'p2', { type: 'join', name: 42, deviceId: 'x' }, 'name');
    expectInvalid(g, 'h', { type: 'hack' }, 'type');
  });

  it('el comando en sí no es un objeto con un tipo conocido', () => {
    const g = new Harness();
    for (const cmd of [null, undefined, 7, 'start', [], [{ type: 'start' }], {}, { type: 5 }, { type: null }, { type: 'START' }, { type: 'toString' }, { type: '__proto__' }]) {
      expectInvalid(g, 'h', cmd, 'type');
    }
  });

  it('campos obligatorios ausentes', () => {
    const g = activeGame();
    expectInvalid(g, 'h', { type: 'claim_tag' }, 'runnerId');
    expectInvalid(g, 'r1', { type: 'location' }, 'sample');
    expectInvalid(g, 'r1', { type: 'location', sample: { lat: 1, lng: 2, accuracyM: 5 } }, 'sample.measuredAt');
    expectInvalid(g, 'r1', { type: 'respond_tag', claimId: '1-1' }, 'accept');
    const lobby = new Harness();
    const { meetingPoint: _m, ...withoutMeeting } = config();
    expectInvalid(lobby, 'h', { type: 'configure', config: withoutMeeting }, 'config.meetingPoint');
    expectInvalid(lobby, 'h', { type: 'set_ready' }, 'ready');
  });

  it('valores numéricos inválidos', () => {
    const g = activeGame();
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '5', null]) {
      expectInvalid(g, 'r1', { type: 'location', sample: { lat: v, lng: CENTER.lng, accuracyM: 5, measuredAt: g.now } }, 'sample.lat');
    }
    const lobby = new Harness();
    expectInvalid(lobby, 'h', { type: 'configure', config: { ...config(), durationMs: Number.NaN } }, 'config.durationMs');
    expectInvalid(lobby, 'h', { type: 'configure', config: { ...config(), headStartMs: Number.POSITIVE_INFINITY } }, 'config.headStartMs');
  });

  it('tipos incorrectos, estructuras anidadas inválidas y campos extra', () => {
    const lobby = new Harness();
    lobby.join('r1');
    expectInvalid(lobby, 'r1', { type: 'set_ready', ready: 'yes' }, 'ready');
    expectInvalid(lobby, 'h', { type: 'kick', targetId: ['r1'] }, 'targetId');
    expectInvalid(lobby, 'h', { type: 'rematch', swapRoles: 1 }, 'swapRoles');
    expectInvalid(lobby, 'h', { type: 'start', force: true }, 'force');
    expectInvalid(lobby, 'h', { type: 'configure', config: { ...config(), zone: { 0: config().zone[0] } } }, 'config.zone');
    expectInvalid(lobby, 'h', { type: 'configure', config: { ...config(), zone: [{ ...config().zone[0], center: null }] } }, 'config.zone[0].center');
    expectInvalid(lobby, 'h', { type: 'configure', config: { ...config(), meetingPoint: { lat: 1, lng: 2, alt: 3 } } }, 'config.meetingPoint.alt');
    expectInvalid(lobby, 'h', { type: 'configure', config: { ...config(), extra: 'x' } }, 'config.extra');
    expectInvalid(lobby, 'p9', { type: 'join', name: 'Ana', deviceId: 'd'.repeat(MAX_STRING_LENGTH + 1) }, 'deviceId');
    const g = activeGame();
    expectInvalid(g, 'r1', { type: 'location', sample: { lat: 1, lng: 2, accuracyM: 5, measuredAt: g.now, isMock: 'no' } }, 'sample.isMock');
    expectInvalid(g, 'r1', { type: 'self_tag', hunterId: 3 }, 'hunterId');
  });

  it('los comandos válidos se siguen aceptando, incluidos los campos opcionales', () => {
    const g = new Harness();
    const { headStartMs: _h, ...withoutHeadStart } = config();
    g.ok('h', { type: 'configure', config: withoutHeadStart });
    const a = activeGame();
    assert.equal(a.cmd('r1', { type: 'location', sample: { lat: CENTER.lat, lng: CENTER.lng, accuracyM: 5, measuredAt: a.now, isMock: false } }).ok, true);
    a.ok('r1', { type: 'self_tag' });
  });

  it('createRoom con un nombre de anfitrión que no es texto se rechaza sin excepción', () => {
    const step = createRoom({ roomId: 'r', hostId: 'h', hostName: 42 as unknown as string, hostDeviceId: 'd', now: 0, seed: 1 });
    assert.deepEqual(step.result, { ok: false, error: 'invalid_name' });
  });
});

describe('entradas inválidas generadas (determinista)', () => {
  const TYPES = ['join', 'connection', 'set_team_pref', 'assign_team', 'set_ready', 'configure', 'kick', 'start', 'location', 'claim_tag', 'respond_tag', 'self_tag', 'rematch', 'leave', 'bogus', '', 42, null];
  const KEYS = ['name', 'deviceId', 'connected', 'pref', 'targetId', 'ready', 'config', 'sample', 'runnerId', 'claimId', 'accept', 'hunterId', 'swapRoles', 'extra'];
  const ITERATIONS = 2_000; // por estado de partida (lobby y ACTIVE): 4.000 entradas en total

  function generator(seed: number) {
    const rnd = mulberry32(seed);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const leaf = (): unknown =>
      pick([undefined, null, true, false, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '', 'h', 'r1', 'hunter', 'x'.repeat(300), [], {}]);
    const value = (depth: number): unknown => {
      const r = rnd();
      if (depth > 2 || r < 0.5) return leaf();
      if (r < 0.65) return [value(depth + 1), value(depth + 1)];
      if (r < 0.8) return { lat: value(depth + 1), lng: value(depth + 1) };
      if (r < 0.9) return { ...config(), [pick(Object.keys(config()))]: value(depth + 1) };
      return { lat: 1, lng: 2, accuracyM: value(depth + 1), measuredAt: value(depth + 1) };
    };
    return (): { actor: string; cmd: unknown } => {
      const cmd: Record<string, unknown> = { type: pick(TYPES) };
      const n = Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) cmd[pick(KEYS)] = value(0);
      return { actor: pick(['h', 'r1', 'nadie']), cmd: rnd() < 0.03 ? value(0) : cmd };
    };
  }

  function fuzz(base: RoomState, now: number, seed: number): { rejected: number } {
    const frozen = structuredClone(base);
    const expected = tick(base, now); // lo que deja el paso del tiempo sin ningún comando
    const next = generator(seed);
    let rejected = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const { actor, cmd } = next();
      const step = applyCommand(base, actor, bad(cmd), now); // no debe lanzar
      if (step.result.ok) continue; // alguna combinación aleatoria es válida: no se comprueba aquí
      rejected++;
      assert.deepEqual(step.state, expected.state, `estado alterado por ${JSON.stringify(cmd)}`);
      assert.deepEqual(step.events, expected.events);
      if (step.result.error === 'invalid_command') assert.match(step.result.detail ?? '', /^[\w.[\]]*$/);
    }
    assert.deepEqual(base, frozen, 'el estado de entrada nunca se modifica');
    return { rejected };
  }

  it(`sala de espera: ${ITERATIONS} comandos generados, sin excepciones ni estado alterado`, () => {
    const g = new Harness();
    g.join('r1');
    g.ok('h', { type: 'configure', config: config() });
    const { rejected } = fuzz(g.state, g.now, 1);
    assert.ok(rejected > ITERATIONS * 0.9, `rechazados: ${rejected}`);
  });

  it(`partida en ACTIVE: ${ITERATIONS} comandos generados, sin excepciones ni estado alterado`, () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 6);
    const { rejected } = fuzz(g.state, g.now, 2);
    assert.ok(rejected > ITERATIONS * 0.9, `rechazados: ${rejected}`);
  });
});
