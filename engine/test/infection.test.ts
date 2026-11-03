import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, RULES_VERSION, SECOND, TIMING } from '../src/constants.ts';
import { MODES } from '../src/modes.ts';
import { resolveTeams } from '../src/teams.ts';
import { canReceive, snapshotFor, visiblePositions } from '../src/view.ts';
import { Harness, config } from './helpers.ts';
import type { GameConfig } from '../src/types.ts';

// Infección (GAME_MODES_AND_RULES §3, D-057): cada captura confirmada convierte al fugitivo en cazador.
// Mínimo 4 jugadores; cazadores iniciales max(1, floor(n/4)); el convertido espera 60 s para capturar y
// no recibe la última pista anterior a su conversión; si caen todos, ganan los cazadores (convertidos
// incluidos); si se acaba el tiempo con alguien libre, ganan los supervivientes.

const INF: Partial<GameConfig> = { mode: 'infection' };

/** h cazador inicial; r1..r3 fugitivos (asignados a mano), en la persecución. */
function infectionGame(runners = ['r1', 'r2', 'r3'], cfg: Partial<GameConfig> = {}): Harness {
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  for (const id of runners) g.join(id, 'runner');
  g.ok('h', { type: 'configure', config: config({ ...INF, ...cfg }) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs);
  g.advance(g.state.config?.headStartMs ?? 0);
  assert.equal(g.state.phase, 'ACTIVE');
  return g;
}

/** Ana (h) reclama a `runner` a 4 m y él lo confirma. */
function catchBy(g: Harness, hunter: string, runner: string, north = 0): void {
  g.at(hunter, north);
  g.at(runner, north + 4);
  const r = g.cmd(hunter, { type: 'claim_tag', runnerId: runner });
  assert.equal(r.ok, true, JSON.stringify(r));
  g.ok(runner, { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: true });
}

describe('Infección: configuración y reparto', () => {
  it('la sala acepta el modo; sin modo sigue siendo Clásico con su versión de reglas', () => {
    const g = new Harness();
    g.join('r1');
    g.ok('h', { type: 'configure', config: config() });
    assert.equal(g.state.config?.mode, undefined);
    g.ok('h', { type: 'configure', config: config(INF) });
    assert.equal(g.state.config?.mode, 'infection');
    assert.deepEqual(g.cmd('h', { type: 'configure', config: config({ mode: 'race' as never }) }), { ok: false, error: 'invalid_config', detail: 'mode' });
  });

  it('necesita al menos 4 jugadores', () => {
    const g = new Harness();
    g.join('r1');
    g.join('r2');
    g.ok('h', { type: 'configure', config: config(INF) });
    g.readyAll();
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'not_enough_players', detail: 'infection' });
    g.join('r3');
    g.readyAll();
    g.ok('h', { type: 'start' });
  });

  it('cazadores iniciales: max(1, floor(n/4)); en Clásico, sin cambios (ceil(n/4))', () => {
    for (const [n, inf, classic] of [[4, 1, 1], [5, 1, 2], [7, 1, 2], [8, 2, 2], [9, 2, 3], [12, 3, 3], [20, 5, 5]] as const) {
      assert.equal(MODES.infection.hunters(n), inf, `Infección con ${n}`);
      assert.equal(MODES.classic.hunters(n), classic, `Clásico con ${n}`);
    }
  });

  it('el sorteo da exactamente esos cazadores; una asignación manual que no cuadra no deja empezar', () => {
    const g = new Harness();
    for (const id of ['a', 'b', 'c', 'd']) g.join(id);
    const players = Object.values(g.state.players);
    for (let seed = 0; seed < 20; seed++) {
      const teams = resolveTeams(players, seed, MODES.infection);
      assert.equal([...(teams?.values() ?? [])].filter((t) => t === 'hunter').length, 1);
    }
    g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
    g.ok('h', { type: 'assign_team', targetId: 'a', pref: 'hunter' });
    g.ok('h', { type: 'configure', config: config(INF) });
    g.readyAll();
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'teams_unbalanced', detail: 'infection' });
  });

  it('la partida guarda la versión de reglas de Infección; Clásico conserva la suya', () => {
    const g = infectionGame();
    assert.equal(g.state.rulesVersion, MODES.infection.rulesVersion);
    assert.notEqual(MODES.infection.rulesVersion, RULES_VERSION);
    assert.equal(MODES.classic.rulesVersion, RULES_VERSION);
  });
});

describe('Infección: conversión', () => {
  it('la captura confirmada lo convierte en cazador activo, en el mismo paso, y se avisa a todos y a él', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    const r1 = g.state.players.r1;
    assert.equal(r1?.team, 'hunter');
    assert.equal(r1?.status, 'active');
    assert.equal(r1?.samples.length, 0);
    assert.deepEqual(g.state.captures.map((c) => [c.runnerId, c.hunterId, c.converted]), [['r1', 'h', true]]);
    assert.deepEqual(g.eventsOf('runner_captured').at(-1)?.audience, { kind: 'all' });
    const changed = g.eventsOf('role_changed');
    assert.equal(changed.length, 1);
    assert.deepEqual(changed[0]?.audience, { kind: 'players', ids: ['r1'] });
    assert.equal(changed[0]?.data.team, 'hunter');
    assert.equal(changed[0]?.data.canTagFrom, g.now + 60 * SECOND);
    assert.equal(g.state.phase, 'ACTIVE');
  });

  it('también con «Me han pillado» (con o sin reclamación pendiente)', () => {
    const g = infectionGame();
    g.ok('r2', { type: 'self_tag', hunterId: 'h' });
    assert.equal(g.state.players.r2?.team, 'hunter');
    assert.equal(g.state.captures.at(-1)?.via, 'self');
    assert.equal(g.state.captures.at(-1)?.converted, true);
  });

  it('un rechazo nunca convierte', () => {
    const g = infectionGame();
    g.at('h', 0);
    g.at('r1', 4);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' }) as { ok: true; data: { claimId: string } };
    g.ok('r1', { type: 'respond_tag', claimId: r.data.claimId, accept: false });
    assert.equal(g.state.players.r1?.team, 'runner');
    assert.equal(g.state.captures.length, 0);
  });

  it('el convertido espera 60 s para reclamar; después captura con normalidad (y también convierte)', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    g.advance(10 * SECOND);
    g.at('r1', 100);
    g.at('r2', 104);
    assert.deepEqual(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }), { ok: false, error: 'tag_cooldown' });
    assert.ok((snapshotFor(g.state, 'r1', g.now).canTagFrom ?? 0) > g.now);
    g.advance(51 * SECOND);
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, null);
    catchBy(g, 'r1', 'r2', 100);
    assert.equal(g.state.players.r2?.team, 'hunter');
    assert.equal(g.state.captures.at(-1)?.hunterId, 'r1');
  });

  it('al convertirse deja de ver a los fugitivos y de ser visto por ellos; ve a los cazadores', () => {
    const g = infectionGame();
    for (const id of ['h', 'r1', 'r2', 'r3']) g.at(id, 200);
    const ids = (viewer: string) => visiblePositions(g.state, viewer, g.now).map((p) => p.playerId).sort();
    assert.deepEqual(ids('r1'), ['r2', 'r3']);
    catchBy(g, 'h', 'r1');
    g.at('r1', 0);
    assert.deepEqual(ids('r1'), ['h']);
    assert.deepEqual(ids('r2'), ['r3']);
    assert.deepEqual(ids('h'), ['r1']);
    // Su equipo nuevo lo ven sus compañeros nuevos; los fugitivos no ven el de nadie del otro equipo.
    assert.equal(snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'r1')?.team, 'hunter');
    assert.equal(snapshotFor(g.state, 'r2', g.now).players.find((p) => p.id === 'r1')?.team, null);
    assert.equal(canReceive(g.state, { kind: 'team', team: 'runner' }, 'r1'), false);
    assert.equal(canReceive(g.state, { kind: 'team', team: 'hunter' }, 'r1'), true);
  });

  it('no recibe la última pista anterior a su conversión, pero sí las siguientes', () => {
    const g = infectionGame(['r1', 'r2', 'r3'], { pingIntervalMs: 3 * MINUTE });
    for (const id of ['r1', 'r2', 'r3']) g.at(id, 300);
    g.advance(3 * MINUTE + SECOND);
    assert.equal(g.state.lastPing?.pingNo, 1);
    catchBy(g, 'h', 'r1');
    assert.equal(snapshotFor(g.state, 'r1', g.now).lastPing, null);
    assert.ok(snapshotFor(g.state, 'h', g.now).lastPing);
    g.at('r2', 300);
    g.advance(3 * MINUTE);
    assert.equal(snapshotFor(g.state, 'r1', g.now).lastPing?.pingNo, 2);
    // La pista ya no lleva al convertido (no es fugitivo).
    assert.equal(g.state.lastPing?.entries.some((e) => e.runnerId === 'r1'), false);
  });

  it('si caen todos, ganan los cazadores; el último convertido gana con ellos', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    g.ok('r2', { type: 'self_tag', hunterId: 'h' });
    g.ok('r3', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(g.state.phase, 'FINISHED');
    assert.deepEqual(g.state.outcome, { winner: 'hunter', cause: 'all_captured' });
    assert.ok(['h', 'r1', 'r2', 'r3'].every((id) => g.state.players[id]?.team === 'hunter'));
    assert.deepEqual(g.state.captures.map((c) => c.runnerId), ['r1', 'r2', 'r3']);
  });

  it('si se acaba el tiempo con alguien libre, ganan los supervivientes', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    g.advance(25 * MINUTE);
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
  });

  it('dos confirmaciones del mismo fugitivo: una conversión y un rechazo', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    assert.deepEqual(g.cmd('r1', { type: 'self_tag' }), { ok: false, error: 'not_a_runner' });
    assert.equal(g.state.captures.length, 1);
  });

  it('una reclamación pendiente sobre otro fugitivo sigue viva tras una conversión', () => {
    const g = infectionGame();
    g.at('h', 0);
    g.at('r1', 4);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' }) as { ok: true; data: { claimId: string } };
    g.ok('r2', { type: 'self_tag', hunterId: 'h' }); // otra conversión mientras tanto
    g.ok('r1', { type: 'respond_tag', claimId: r.data.claimId, accept: true });
    assert.equal(g.state.players.r1?.team, 'hunter');
    assert.equal(g.state.captures.length, 2);
  });

  it('el convertido que se desconecta sigue siendo cazador; el periodo de gracia es el de siempre', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(2 * MINUTE);
    g.ok('r1', { type: 'connection', connected: true });
    assert.equal(g.state.players.r1?.team, 'hunter');
    assert.equal(g.state.players.r1?.status, 'active');
  });

  it('la revancha vuelve a empezar con un sorteo nuevo (D-056) y nadie arrastra la conversión', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    g.advance(25 * MINUTE);
    g.ok('h', { type: 'rematch', swapRoles: false });
    for (const id of ['r1', 'r2', 'r3']) g.ok(id, { type: 'join_rematch' });
    assert.equal(g.state.config?.mode, 'infection');
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(Object.values(g.state.players).filter((p) => p.team === 'hunter').length, 1);
    assert.equal(g.state.players.r1?.canTagFrom, null);
    assert.equal(g.state.players.r1?.convertedAt, null);
  });

  it('si la pista vence en el mismo paso que la conversión, el convertido no la recibe (revisión del 30/10)', () => {
    const g = infectionGame(['r1', 'r2', 'r3'], { pingIntervalMs: 3 * MINUTE });
    for (const id of ['r2', 'r3']) g.at(id, 300);
    const pingAt = g.state.nextPingAt ?? 0;
    g.tickTo(pingAt - SECOND);
    g.at('h', 0);
    g.at('r1', 4);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
    // La confirmación llega justo después del vencimiento de la pista, antes del tick: el mismo paso.
    g.now = pingAt + 10;
    g.ok('r1', { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: true });
    const ping = g.eventsOf('ping').at(-1);
    assert.equal(ping?.data.ping && (ping.data.ping as { pingNo: number }).pingNo, 1);
    assert.equal(canReceive(g.state, ping!.audience, 'r1'), false);
    assert.equal(canReceive(g.state, ping!.audience, 'h'), true);
  });

  it('«Me han pillado» no atribuye la infección a un convertido en su minuto de espera', () => {
    const g = infectionGame();
    catchBy(g, 'h', 'r1');
    g.ok('r2', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(g.state.captures.at(-1)?.hunterId, null);
    g.advance(61 * SECOND);
    g.ok('r3', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(g.state.captures.at(-1)?.hunterId, 'r1');
  });
});
