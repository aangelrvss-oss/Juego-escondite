import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, TIMING } from '../src/constants.ts';
import { targetHunters } from '../src/teams.ts';
import { snapshotFor } from '../src/view.ts';
import { Harness, activeGame, config } from './helpers.ts';

// Decisiones aprobadas el 29/10/2026 para el primer playtest: revancha con sorteo nuevo, equipos de
// todos visibles solo al terminar, nombre de quien sale en el resultado, pistas sin capturados e
// intervalo de pistas menor que la duración.

/** Partida terminada (fin por el anfitrión) con 6 jugadores y roles por sorteo. */
function finishedGame(seed: number): Harness {
  const g = new Harness('Ana', undefined, seed);
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) g.join(id);
  g.ok('h', { type: 'configure', config: config() });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs);
  g.advance(2 * MINUTE);
  g.ok('h', { type: 'end_game' });
  assert.equal(g.state.phase, 'FINISHED');
  return g;
}

function acceptRematch(g: Harness): void {
  for (const id of g.state.playerOrder) if (g.state.players[id]?.status === 'invited') g.ok(id, { type: 'join_rematch' });
}

const teamsOf = (g: Harness) => g.state.playerOrder.map((id) => `${id}:${g.state.players[id]?.team}`).join(',');

describe('revancha: sorteo nuevo de roles', () => {
  it('nadie arrastra su equipo: todas las preferencias vuelven a «Sorteo»', () => {
    const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] }); // equipos fijados a mano
    g.ok('h', { type: 'end_game' });
    g.ok('h', { type: 'rematch', swapRoles: false });
    for (const id of g.state.playerOrder) {
      assert.equal(g.state.players[id]?.teamPref, 'random', `${id} vuelve al sorteo`);
      assert.equal(g.state.players[id]?.team, null);
    }
  });

  it('el reparto se completa al empezar, antes de la cuenta atrás, con el número de cazadores de siempre', () => {
    const g = finishedGame(7);
    g.ok('h', { type: 'rematch', swapRoles: false });
    acceptRematch(g);
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.state.phase, 'COUNTDOWN');
    const teams = g.state.playerOrder.map((id) => g.state.players[id]?.team);
    assert.ok(teams.every((t) => t === 'hunter' || t === 'runner'), 'todos tienen equipo antes de la cuenta atrás');
    assert.equal(teams.filter((t) => t === 'hunter').length, targetHunters(6));
    // Y nadie lo conoce todavía (D-042): las instantáneas de la cuenta atrás no llevan equipos.
    for (const id of g.state.playerOrder) assert.ok(snapshotFor(g.state, id, g.now).players.every((v) => v.team === null));
  });

  it('es un sorteo de verdad: con distintas semillas, el reparto de la revancha cambia', () => {
    let changed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = finishedGame(seed);
      const before = teamsOf(g);
      g.ok('h', { type: 'rematch', swapRoles: false });
      acceptRematch(g);
      g.readyAll();
      g.ok('h', { type: 'start' });
      if (teamsOf(g) !== before) changed++;
    }
    assert.ok(changed >= 10, `el reparto cambió en ${changed} de 20 revanchas`);
  });

  it('el anfitrión puede seguir asignando a mano en la sala de la revancha', () => {
    const g = finishedGame(3);
    g.ok('h', { type: 'rematch', swapRoles: false });
    acceptRematch(g);
    g.ok('h', { type: 'assign_team', targetId: 'p1', pref: 'hunter' });
    g.ok('h', { type: 'assign_team', targetId: 'p2', pref: 'hunter' });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.state.players.p1?.team, 'hunter');
    assert.equal(g.state.players.p2?.team, 'hunter');
  });
});

describe('equipos de todos al terminar, y solo entonces', () => {
  it('durante la partida, un fugitivo no ve el equipo de los cazadores; al terminar, todos ven todos', () => {
    const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] });
    const during = snapshotFor(g.state, 'r1', g.now).players;
    assert.equal(during.find((v) => v.id === 'h')?.team, null);
    assert.equal(during.find((v) => v.id === 'r2')?.team, 'runner', 'el compañero sí');
    g.ok('h', { type: 'end_game' });
    const views = ['h', 'h2', 'r1', 'r2'].map((id) => snapshotFor(g.state, id, g.now).players.map((v) => [v.id, v.team]));
    assert.deepEqual(views[0], [['h', 'hunter'], ['h2', 'hunter'], ['r1', 'runner'], ['r2', 'runner']]);
    for (const v of views) assert.deepEqual(v, views[0], 'la misma lista para todos');
    // Una instantánea nueva (como al recargar) da lo mismo.
    assert.deepEqual(snapshotFor(g.state, 'r1', g.now + 60_000).players.map((v) => [v.id, v.team]), views[0]);
  });

  it('en la sala de la revancha vuelven a estar ocultos', () => {
    const g = activeGame({ runners: ['r1'] });
    g.ok('h', { type: 'end_game' });
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.ok(snapshotFor(g.state, 'h', g.now).players.every((v) => v.team === null));
  });
});

describe('quien sale conserva su nombre en el resultado', () => {
  it('un fugitivo capturado que abandona sigue en la vista final con nombre, estado y equipo', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'self_tag', hunterId: 'h' });
    g.ok('r1', { type: 'leave' });
    g.advance(20 * MINUTE); // se acaba el tiempo: r2 sigue libre
    assert.equal(g.state.phase, 'FINISHED');
    const r1 = snapshotFor(g.state, 'h', g.now).players.find((v) => v.id === 'r1');
    assert.deepEqual({ name: r1?.name, status: r1?.status, team: r1?.team }, { name: 'Jug r1', status: 'left', team: 'runner' });
  });

  it('quien sale en el resultado sigue apareciendo para los demás (y tras recargar)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('h', { type: 'end_game' });
    g.ok('r2', { type: 'leave' });
    for (const viewer of ['h', 'r1']) assert.ok(snapshotFor(g.state, viewer, g.now + 1_000).players.some((v) => v.id === 'r2' && v.name === 'Jug r2'));
  });

  it('fuera del resultado no aparece como jugador: ni durante la partida ni en la sala de la revancha', () => {
    const g = activeGame({ runners: ['r1', 'r2', 'r3'] });
    g.ok('r2', { type: 'leave' });
    assert.ok(!snapshotFor(g.state, 'h', g.now).players.some((v) => v.id === 'r2'), 'durante la partida');
    g.ok('h', { type: 'end_game' });
    g.ok('r3', { type: 'leave' }); // sale de la sala desde el resultado
    g.ok('h', { type: 'rematch', swapRoles: false });
    const lobby = snapshotFor(g.state, 'h', g.now).players;
    assert.ok(!lobby.some((v) => v.id === 'r3'), 'quien salió de la sala no vuelve');
    // Regla anterior que no cambia: quien abandonó a mitad de partida queda invitado a la revancha.
    assert.equal(lobby.find((v) => v.id === 'r2')?.status, 'invited');
  });
});

describe('pistas sin fugitivos capturados', () => {
  it('al capturar, sale de la última pista guardada y no vuelve en las siguientes', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('r1', 50);
    g.at('r2', 80);
    g.advance(3 * MINUTE); // primera pista
    assert.deepEqual(g.state.lastPing?.entries.map((e) => e.runnerId), ['r1', 'r2']);
    g.ok('r1', { type: 'self_tag', hunterId: 'h' });
    assert.deepEqual(g.state.lastPing?.entries.map((e) => e.runnerId), ['r2'], 'la pista guardada ya no lo lleva');
    assert.deepEqual(snapshotFor(g.state, 'h', g.now).lastPing?.entries.map((e) => e.runnerId), ['r2'], 'ni la instantánea del cazador');
    g.at('r2', 90);
    g.advance(3 * MINUTE); // segunda pista
    const pings = g.eventsOf('ping');
    assert.equal(pings.length, 2);
    assert.doesNotMatch(JSON.stringify(pings[1]?.data), /"r1"/, 'la pista nueva no lo incluye');
  });

  it('quien abandona también sale de la última pista', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('r1', 50);
    g.at('r2', 80);
    g.advance(3 * MINUTE);
    g.ok('r2', { type: 'leave' });
    assert.deepEqual(g.state.lastPing?.entries.map((e) => e.runnerId), ['r1']);
  });
});

describe('intervalo de pistas menor que la duración', () => {
  it('rechaza un intervalo igual o mayor que la persecución, con el campo que falla', () => {
    const g = new Harness();
    g.join('r1');
    for (const ping of [10, 15]) {
      const r = g.cmd('h', { type: 'configure', config: config({ durationMs: 10 * MINUTE, pingIntervalMs: ping * MINUTE }) });
      assert.deepEqual(r, { ok: false, error: 'invalid_config', detail: 'pingIntervalMs' }, `${ping} min en 10`);
    }
    assert.equal(g.state.config, null, 'no se guarda nada');
    g.ok('h', { type: 'configure', config: config({ durationMs: 10 * MINUTE, pingIntervalMs: 5 * MINUTE }) });
  });
});
