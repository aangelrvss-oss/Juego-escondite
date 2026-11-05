import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE } from '../src/constants.ts';
import { distanceM, offsetM } from '../src/geo.ts';
import type { GameConfig } from '../src/types.ts';
import { CENTER, Harness, config } from './helpers.ts';

// Política de preparación de la sala (ciclo UX 11/2026). Antes, cualquier «configure» quitaba el «listo» a
// todos, aunque solo se marcara la lista de seguridad o se recentrara la zona unos metros: los jugadores
// tenían que volver a pulsar «Estoy listo» una y otra vez. Ahora solo un cambio material de la partida lo
// quita, y solo a los demás: el anfitrión que hace el cambio ya lo conoce.

const readyOf = (g: Harness) => Object.fromEntries(g.state.playerOrder.map((id) => [id, g.state.players[id]!.ready]));

// Sala con anfitrión «h» y dos jugadores, configurada y con todos listos.
function readyRoom(cfg: Partial<GameConfig> = {}): Harness {
  const g = new Harness();
  g.join('a');
  g.join('b');
  g.ok('h', { type: 'configure', config: config(cfg) });
  g.readyAll();
  assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
  return g;
}

// Configuración con la zona y el punto de encuentro desplazados `m` metros al norte.
const moved = (m: number): GameConfig => {
  const c = offsetM(CENTER, m, 0);
  return config({ zone: [{ fromOffsetMs: 0, center: c, radiusM: 400 }], meetingPoint: c });
};

describe('preparación: lo que NO quita el «listo»', () => {
  it('marcar o desmarcar la lista de seguridad', () => {
    const g = readyRoom({ safetyChecklistConfirmed: false });
    g.ok('h', { type: 'configure', config: config({ safetyChecklistConfirmed: true }) });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
    g.ok('h', { type: 'configure', config: config({ safetyChecklistConfirmed: false }) });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
    assert.equal(g.eventsOf('config_updated').length, 3, 'el aviso de configuración sigue llegando a todos');
  });

  it('reenviar la misma configuración', () => {
    const g = readyRoom();
    g.ok('h', { type: 'configure', config: config() });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
  });

  it('sin ventaja explícita, el valor por defecto equivale al mismo valor enviado', () => {
    const g = readyRoom();
    const { headStartMs: _omit, ...withoutHeadStart } = config();
    g.ok('h', { type: 'configure', config: withoutHeadStart });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
  });

  it('recentrar la zona menos de 50 m', () => {
    const g = readyRoom();
    assert.ok(distanceM(CENTER, offsetM(CENTER, 45, 0)) < 50);
    g.ok('h', { type: 'configure', config: moved(45) });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
  });

  it('nombres, asignación de rol, preferencia propia y entrada de otro jugador', () => {
    const g = readyRoom();
    g.ok('h', { type: 'assign_team', targetId: 'a', pref: 'hunter' });
    g.ok('b', { type: 'set_team_pref', pref: 'runner' });
    g.join('c', 'random', 'Carla');
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true, c: false });
  });

  it('la desconexión de un jugador solo le afecta a él (start ya exige conectados)', () => {
    const g = readyRoom();
    g.ok('a', { type: 'connection', connected: false });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'players_not_ready' });
    g.ok('a', { type: 'connection', connected: true });
    g.ok('h', { type: 'start' });
    assert.equal(g.state.phase, 'COUNTDOWN');
  });
});

describe('preparación: lo que SÍ quita el «listo» (a los demás, no al anfitrión)', () => {
  const changes: [string, GameConfig][] = [
    ['recentrar 50 m o más', moved(60)],
    ['mover solo el punto de encuentro 50 m o más', config({ meetingPoint: offsetM(CENTER, 0, 80) })],
    ['cambiar el modo', config({ mode: 'fox_hunt' })],
    ['cambiar el radio', config({ zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 250 }] })],
    ['cambiar la duración', config({ durationMs: 30 * MINUTE })],
    ['cambiar la huida', config({ headStartMs: 5 * MINUTE })],
    ['cambiar el intervalo de pistas', config({ pingIntervalMs: 5 * MINUTE })],
    ['activar la zona que se cierra', config({ dynamicZone: true })],
  ];
  for (const [name, next] of changes) {
    it(name, () => {
      const g = readyRoom();
      g.ok('h', { type: 'configure', config: next });
      assert.deepEqual(readyOf(g), { h: true, a: false, b: false });
      assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'players_not_ready' }, 'nadie empieza con reglas que no ha visto');
    });
  }

  it('el modo sin campo equivale a Clásico: enviarlo explícito no es un cambio', () => {
    const g = readyRoom();
    g.ok('h', { type: 'configure', config: config({ mode: 'classic' }) });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
  });

  it('la primera configuración cuenta como cambio material', () => {
    const g = new Harness();
    g.join('a');
    g.readyAll(); // se pueden marcar listos antes de que exista la configuración (clientes antiguos)
    g.ok('h', { type: 'configure', config: config() });
    assert.deepEqual(readyOf(g), { h: true, a: false });
  });
});

describe('preparación: «Empezar» sigue exigiendo lo mismo', () => {
  it('lista de seguridad confirmada', () => {
    const g = readyRoom({ safetyChecklistConfirmed: false });
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'safety_not_confirmed' });
    g.ok('h', { type: 'configure', config: config({ safetyChecklistConfirmed: true }) });
    g.ok('h', { type: 'start' });
    assert.equal(g.state.phase, 'COUNTDOWN');
  });

  it('todos listos, también el anfitrión', () => {
    const g = readyRoom();
    g.ok('h', { type: 'set_ready', ready: false });
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'players_not_ready' });
    g.ok('h', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'start' });
  });

  it('tras un cambio material, al volver a marcar «Estoy listo» se puede empezar', () => {
    const g = readyRoom();
    g.ok('h', { type: 'configure', config: config({ durationMs: 10 * MINUTE }) });
    g.ok('a', { type: 'set_ready', ready: true });
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'players_not_ready' });
    g.ok('b', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'start' });
    assert.equal(g.state.phase, 'COUNTDOWN');
  });

  it('un configure rechazado no toca el «listo» de nadie', () => {
    const g = readyRoom();
    assert.equal(g.cmd('h', { type: 'configure', config: config({ durationMs: 1 }) }).ok, false);
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
    assert.deepEqual(g.cmd('a', { type: 'configure', config: config({ durationMs: 30 * MINUTE }) }), { ok: false, error: 'forbidden' });
    assert.deepEqual(readyOf(g), { h: true, a: true, b: true });
  });
});
