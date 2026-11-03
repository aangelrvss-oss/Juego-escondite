import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, PRESENCE, SECOND, TIMING } from '../src/constants.ts';
import { MODES } from '../src/modes.ts';
import { resolveTeams } from '../src/teams.ts';
import { canReceive, snapshotFor, visiblePositions } from '../src/view.ts';
import { Harness, config } from './helpers.ts';
import type { GameConfig } from '../src/types.ts';

// Caza del zorro, variante «Mr. X» (D-057): un zorro (fugitivo) contra todos (cazadores). El zorro ve a
// los cazadores en directo; ellos reciben su posición exacta en cada pista. Si lo capturan, ganan; si
// aguanta hasta el final, gana el zorro. Mínimo 3 jugadores.

const FOX: Partial<GameConfig> = { mode: 'fox_hunt' };

/** f zorro (asignado a mano por el anfitrión h, cazador); h, h2 y h3 cazadores. En la persecución. */
function foxGame(cfg: Partial<GameConfig> = {}): Harness {
  const g = new Harness();
  for (const id of ['f', 'h2', 'h3']) g.join(id);
  g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
  g.ok('h', { type: 'configure', config: config({ ...FOX, ...cfg }) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs);
  g.advance(g.state.config?.headStartMs ?? 0);
  assert.equal(g.state.phase, 'ACTIVE');
  return g;
}

describe('Caza del zorro: reparto', () => {
  it('necesita al menos 3 jugadores', () => {
    const g = new Harness();
    g.join('f');
    g.ok('h', { type: 'configure', config: config(FOX) });
    g.readyAll();
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'not_enough_players', detail: 'fox_hunt' });
  });

  it('el sorteo da exactamente un zorro; dos zorros asignados a mano no dejan empezar', () => {
    const g = new Harness();
    for (const id of ['a', 'b', 'c', 'd']) g.join(id);
    const players = Object.values(g.state.players);
    for (let seed = 0; seed < 20; seed++) {
      const teams = [...(resolveTeams(players, seed, MODES.fox_hunt)?.values() ?? [])];
      assert.equal(teams.filter((t) => t === 'runner').length, 1);
    }
    g.ok('h', { type: 'assign_team', targetId: 'a', pref: 'runner' });
    g.ok('h', { type: 'assign_team', targetId: 'b', pref: 'runner' });
    g.ok('h', { type: 'configure', config: config(FOX) });
    g.readyAll();
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'teams_unbalanced', detail: 'fox_hunt' });
  });

  it('guarda su propia versión de reglas', () => {
    assert.equal(foxGame().state.rulesVersion, MODES.fox_hunt.rulesVersion);
  });
});

describe('Caza del zorro: información', () => {
  it('el zorro ve a los cazadores en directo; los cazadores se ven entre sí y no ven al zorro (salvo pistas)', () => {
    const g = foxGame();
    for (const id of ['h', 'h2', 'h3', 'f']) g.at(id, id === 'f' ? 200 : 0);
    const seen = (viewer: string) => visiblePositions(g.state, viewer, g.now).map((p) => `${p.playerId}:${p.reason}`).sort();
    assert.deepEqual(seen('f'), ['h2:hunter_seen', 'h3:hunter_seen', 'h:hunter_seen']);
    assert.deepEqual(seen('h'), ['h2:teammate', 'h3:teammate']);
    // También durante la huida.
    const g2 = new Harness();
    for (const id of ['f', 'h2']) g2.join(id);
    g2.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
    g2.ok('h', { type: 'configure', config: config(FOX) });
    g2.readyAll();
    g2.ok('h', { type: 'start' });
    g2.advance(TIMING.countdownMs);
    g2.at('h', 0);
    // h con lectura; h2 sin lectura todavía (sin coordenadas, como cualquier posición no disponible).
    assert.deepEqual(visiblePositions(g2.state, 'f', g2.now).map((p) => `${p.playerId}:${p.reason}:${p.lat !== null}`), ['h:hunter_seen:true', 'h2:hunter_seen:false']);
  });

  it('tras la cuenta atrás los roles son públicos; durante la cuenta atrás, no', () => {
    const g = new Harness();
    for (const id of ['f', 'h2']) g.join(id);
    g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
    g.ok('h', { type: 'configure', config: config(FOX) });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(snapshotFor(g.state, 'h2', g.now).players.find((p) => p.id === 'f')?.team, null);
    g.advance(TIMING.countdownMs);
    assert.equal(snapshotFor(g.state, 'h2', g.now).players.find((p) => p.id === 'f')?.team, 'runner');
    assert.equal(snapshotFor(g.state, 'f', g.now).players.find((p) => p.id === 'h2')?.team, 'hunter');
  });

  it('cada pista da a los cazadores la posición exacta del zorro; el zorro recibe el aviso sin coordenadas', () => {
    const g = foxGame({ pingIntervalMs: 2 * MINUTE });
    g.at('f', 150);
    g.advance(2 * MINUTE + SECOND);
    const ping = g.eventsOf('ping').at(-1);
    const entries = (ping?.data.ping as { entries: { runnerId: string; position: unknown; availability: string }[] }).entries;
    assert.deepEqual(entries.map((e) => e.runnerId), ['f']);
    assert.ok(entries[0]?.position);
    for (const h of ['h', 'h2', 'h3']) assert.equal(canReceive(g.state, ping!.audience, h), true);
    assert.equal(canReceive(g.state, ping!.audience, 'f'), false);
    assert.deepEqual(g.eventsOf('ping_sent').at(-1)?.data, { pingNo: 1 });
  });
});

describe('Caza del zorro: final', () => {
  it('si atrapan al zorro, ganan los cazadores en ese momento', () => {
    const g = foxGame();
    g.at('h2', 100);
    g.at('f', 104);
    const r = g.cmd('h2', { type: 'claim_tag', runnerId: 'f' });
    assert.equal(r.ok, true);
    g.ok('f', { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: true });
    assert.equal(g.state.phase, 'FINISHED');
    assert.deepEqual(g.state.outcome, { winner: 'hunter', cause: 'all_captured' });
  });

  it('si aguanta hasta el final, gana el zorro', () => {
    const g = foxGame();
    g.advance(25 * MINUTE);
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
  });

  it('si el zorro queda fuera (5 min sin señal) o abandona, termina sin ganador', () => {
    const g = foxGame();
    g.ok('f', { type: 'leave' });
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
  });

  it('el zorro fuera de la zona más de 30 s queda expuesto como en Clásico', () => {
    const g = foxGame();
    g.at('f', 1_000); // fuera del círculo de 400 m
    g.advance(TIMING.outOfZoneGraceMs + SECOND);
    g.at('f', 1_000);
    assert.ok(visiblePositions(g.state, 'h', g.now).some((p) => p.playerId === 'f' && p.reason === 'exposed'));
  });

  it('Clásico e Infección no cambian: sus fugitivos no ven a los cazadores', () => {
    for (const mode of ['classic', 'infection'] as const) {
      const g = new Harness();
      for (const id of ['a', 'b', 'c']) g.join(id, 'runner');
      g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
      g.ok('h', { type: 'configure', config: config({ mode }) });
      g.readyAll();
      g.ok('h', { type: 'start' });
      g.advance(TIMING.countdownMs + 2 * MINUTE);
      g.at('h', 0);
      assert.equal(visiblePositions(g.state, 'a', g.now).some((p) => p.playerId === 'h'), false, mode);
      assert.equal(snapshotFor(g.state, 'a', g.now).players.find((p) => p.id === 'h')?.team, null, mode);
    }
  });

  it('el zorro que pasa 5 min sin señal queda fuera: sin ganador, con su motivo (revisión del 30/10)', () => {
    const g = foxGame();
    g.ok('f', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
    assert.equal(g.state.players.f?.leftReason, 'timeout');
  });

  it('el zorro puede ser el anfitrión; si abandona, el anfitrión pasa a un cazador', () => {
    const g = new Harness();
    for (const id of ['h2', 'h3']) g.join(id);
    g.ok('h', { type: 'set_team_pref', pref: 'runner' });
    g.ok('h', { type: 'configure', config: config(FOX) });
    g.readyAll();
    g.ok('h', { type: 'start' });
    g.advance(TIMING.countdownMs + 2 * MINUTE);
    assert.equal(g.state.players.h?.team, 'runner');
    g.ok('h', { type: 'leave' });
    assert.notEqual(g.state.hostId, 'h');
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
  });

  it('si en la cuenta atrás quedan menos de 3, vuelve a la sala (no se juega 1 contra 1)', () => {
    const g = new Harness();
    for (const id of ['f', 'h2']) g.join(id);
    g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
    g.ok('h', { type: 'configure', config: config(FOX) });
    g.readyAll();
    g.ok('h', { type: 'start' });
    g.ok('h2', { type: 'leave' });
    assert.equal(g.state.phase, 'LOBBY');
  });

  it('revancha: sorteo nuevo con un zorro, también si se pide intercambiar equipos', () => {
    for (const swapRoles of [false, true]) {
      const g = foxGame();
      g.advance(25 * MINUTE);
      g.ok('h', { type: 'rematch', swapRoles });
      for (const id of ['f', 'h2', 'h3']) g.ok(id, { type: 'join_rematch' });
      g.readyAll();
      g.ok('h', { type: 'start' });
      assert.equal(Object.values(g.state.players).filter((p) => p.team === 'runner').length, 1, `swapRoles=${swapRoles}`);
    }
  });
});
