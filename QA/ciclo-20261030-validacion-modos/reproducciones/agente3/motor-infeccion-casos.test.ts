// AGENTE 3 · QA de Infección · casos de borde contra el MOTOR PURO (sin servidor, sin red).
// NO EJECUTADO por el agente. Uso (desde la raíz del repo, mismo Node que `npm test`):
//   node --test "C:/Users/aange/AppData/Local/Temp/claude/C--Users-aange/e108e3b2-532d-48d6-89f2-6b46f764d244/scratchpad/agente3/motor-infeccion-casos.test.ts"
// Cada `it` documenta el RESULTADO ESPERADO según el código actual (leído, no ejecutado). Los marcados
// «[HALLAZGO]» pasan si el comportamiento cuestionable sigue presente.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, SECOND, TIMING } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/constants.ts';
import { MODES } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/modes.ts';
import { snapshotFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';
import { Harness, config } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { contagionChains, isStaleEvent, missionReport } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/mobile/www/js/game-view.js';

const INF = { mode: 'infection' as const };

function game(runners = ['r1', 'r2', 'r3'], cfg = {}): Harness {
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

function catchBy(g: Harness, hunter: string, runner: string, north = 0): void {
  g.at(hunter, north);
  g.at(runner, north + 4);
  const r = g.cmd(hunter, { type: 'claim_tag', runnerId: runner });
  assert.equal(r.ok, true, JSON.stringify(r));
  g.ok(runner, { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: true });
}

const hunters = (g: Harness) => Object.values(g.state.players).filter((p) => p.team === 'hunter').length;

describe('A3 · reparto inicial por tamaño (start real, no solo MODES.hunters)', () => {
  const EXPECTED: Array<[number, number]> = [[4, 1], [5, 1], [7, 1], [8, 2], [9, 2], [11, 2], [12, 3], [16, 4], [20, 5]];
  for (const [n, h] of EXPECTED) {
    it(`n=${n}: ${h} cazador(es) exactos con sorteo, en 10 semillas`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const g = new Harness('Ana', undefined, seed);
        for (let i = 1; i < n; i++) g.join(`p${i}`);
        g.ok('h', { type: 'configure', config: config(INF) });
        g.readyAll();
        g.ok('h', { type: 'start' });
        assert.equal(hunters(g), h, `n=${n} seed=${seed}`);
        assert.equal(MODES.infection.hunters(n), h);
      }
    });
    it(`n=${n}: asignación manual con ${h + 1} cazadores → teams_unbalanced; con ${h} exactos → empieza`, () => {
      const g = new Harness();
      for (let i = 1; i < n; i++) g.join(`p${i}`);
      g.ok('h', { type: 'configure', config: config(INF) });
      const ids = g.state.playerOrder;
      for (let i = 0; i < h + 1; i++) g.ok('h', { type: 'assign_team', targetId: ids[i]!, pref: 'hunter' });
      g.readyAll();
      assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'teams_unbalanced', detail: 'infection' });
      g.ok('h', { type: 'assign_team', targetId: ids[h]!, pref: 'random' });
      g.ok('h', { type: 'start' });
      assert.equal(hunters(g), h);
    });
  }
  it('todos «fugitivo» a mano → teams_unbalanced (0 cazadores); n=3 → not_enough_players', () => {
    const g = new Harness();
    for (const id of ['a', 'b', 'c']) g.join(id);
    g.ok('h', { type: 'configure', config: config(INF) });
    for (const id of g.state.playerOrder) g.ok('h', { type: 'assign_team', targetId: id, pref: 'runner' });
    g.readyAll();
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'teams_unbalanced', detail: 'infection' });
    const g3 = new Harness();
    for (const id of ['a', 'b']) g3.join(id);
    g3.ok('h', { type: 'configure', config: config(INF) });
    g3.readyAll();
    assert.deepEqual(g3.cmd('h', { type: 'start' }), { ok: false, error: 'not_enough_players', detail: 'infection' });
  });
  it('[HALLAZGO A3-7] salida en la cuenta atrás: n=8→7 sigue con 2 cazadores (el objetivo para 7 es 1)', () => {
    const g = new Harness();
    for (let i = 1; i < 8; i++) g.join(`p${i}`);
    g.ok('h', { type: 'configure', config: config(INF) });
    g.readyAll();
    g.ok('h', { type: 'start' });
    const runner = g.state.playerOrder.find((id) => g.state.players[id]?.team === 'runner' && id !== 'h')!;
    g.ok(runner, { type: 'leave' });
    assert.equal(g.state.phase, 'COUNTDOWN');
    assert.equal(hunters(g), 2);
  });
});

describe('A3 · espera de 60 s: bordes exactos', () => {
  it('reclamación a canTagFrom−1 ms → tag_cooldown; a canTagFrom exacto → aceptada', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    const from = g.state.players.r1!.canTagFrom!;
    assert.equal(from, g.now + 60 * SECOND);
    g.advance(from - 1 - g.now);
    g.at('r1', 100);
    g.at('r2', 104);
    assert.deepEqual(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }), { ok: false, error: 'tag_cooldown' });
    g.now = from; // sin tick: el comando procesa los plazos
    const r = g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' });
    assert.equal(r.ok, true, JSON.stringify(r));
  });
  it('autodeclaración atribuida a un convertido: canTagFrom−1 → hunterId null; canTagFrom → atribuida', () => {
    const a = game();
    catchBy(a, 'h', 'r1');
    const fromA = a.state.players.r1!.canTagFrom!;
    a.advance(fromA - 1 - a.now);
    a.ok('r2', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(a.state.captures.at(-1)?.hunterId, null);
    const b = game();
    catchBy(b, 'h', 'r1');
    b.advance(b.state.players.r1!.canTagFrom! - b.now);
    b.ok('r2', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(b.state.captures.at(-1)?.hunterId, 'r1');
  });
});

describe('A3 · capturas casi simultáneas', () => {
  it('dos cazadores sobre el mismo fugitivo: la 2.ª reclamación → already_pending; tras la conversión → target_not_active (no already_captured)', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.advance(61 * SECOND);
    g.at('h', 200);
    g.at('r1', 202);
    g.at('r2', 204);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r2' }) as { ok: true; data: { claimId: string } };
    assert.equal(r.ok, true);
    assert.deepEqual(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }), { ok: false, error: 'already_pending' });
    g.ok('r2', { type: 'respond_tag', claimId: r.data.claimId, accept: true });
    assert.deepEqual(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }), { ok: false, error: 'target_not_active' });
    assert.equal(g.state.captures.length, 2);
  });
  it('«Me han pillado» con reclamación pendiente de h, eligiendo a otro: se atribuye a h (el de la reclamación)', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.advance(61 * SECOND);
    g.at('h', 200);
    g.at('r2', 204);
    assert.equal(g.cmd('h', { type: 'claim_tag', runnerId: 'r2' }).ok, true);
    g.ok('r2', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(g.state.captures.at(-1)?.hunterId, 'h');
    assert.equal(Object.keys(g.state.claims).length, 0);
  });
  it('dos fugitivos distintos, los dos últimos, en serie: el 2.º acaba la partida (all_captured)', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.ok('r2', { type: 'self_tag', hunterId: 'h' });
    assert.equal(g.state.phase, 'ACTIVE');
    g.ok('r3', { type: 'self_tag', hunterId: 'h' });
    assert.deepEqual(g.state.outcome, { winner: 'hunter', cause: 'all_captured' });
  });
  it('confirmación que llega tras el final por tiempo: claim_not_found y ganan los supervivientes', () => {
    const g = game(['r1', 'r2', 'r3'], { durationMs: 10 * MINUTE });
    const end = g.state.gameEnd!;
    g.advance(end - 10 * SECOND - g.now);
    g.at('h', 0);
    g.at('r1', 4);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' }) as { ok: true; data: { claimId: string } };
    g.now = end + 1;
    assert.deepEqual(g.cmd('r1', { type: 'respond_tag', claimId: r.data.claimId, accept: true }), { ok: false, error: 'claim_not_found' });
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
  });
});

describe('A3 · presencia del convertido', () => {
  it('convertido sin señal: «sin conexión» a 30 s, sigue contando como cazador; a 5 min fuera; sin cazadores → sin ganador', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.ok('r1', { type: 'connection', connected: false });
    g.ok('h', { type: 'leave' }); // la cazadora inicial abandona: queda el convertido
    assert.equal(g.state.phase, 'ACTIVE');
    g.advance(35 * SECOND);
    assert.equal(g.state.players.r1?.away, true);
    assert.equal(g.state.players.r1?.team, 'hunter');
    g.advance(5 * MINUTE);
    assert.equal(g.state.players.r1?.status, 'left');
    assert.equal(g.state.players.r1?.leftReason, 'timeout');
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'hunters_abandoned' });
  });
  it('convertido que vuelve a los 4:50: sigue cazador activo, ya sin espera; recibe pistas posteriores', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(4 * MINUTE + 50 * SECOND);
    g.ok('r1', { type: 'connection', connected: true });
    const p = g.state.players.r1!;
    assert.equal(p.status, 'active');
    assert.equal(p.team, 'hunter');
    assert.equal(p.away, false);
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, null);
  });
  it('convertido que vuelve tras 5 min: fuera (left/timeout), solo eventos «all», y puede unirse a la revancha', () => {
    const g = game(['r1', 'r2', 'r3', 'r4']);
    catchBy(g, 'h', 'r1');
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(5 * MINUTE + 5 * SECOND);
    assert.equal(g.state.players.r1?.status, 'left');
    assert.equal(g.state.phase, 'ACTIVE');
    g.ok('r1', { type: 'connection', connected: true });
    assert.equal(g.state.players.r1?.status, 'left');
    g.advance(25 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    g.ok('h', { type: 'rematch', swapRoles: false });
    g.ok('r1', { type: 'join_rematch' });
    assert.equal(g.state.players.r1?.status, 'lobby');
  });
  it('último fugitivo sin señal 5 min: sin ganador (runners_abandoned), no «Todos infectados»', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.ok('r2', { type: 'self_tag', hunterId: 'h' });
    g.ok('r3', { type: 'connection', connected: false });
    g.advance(5 * MINUTE + 5 * SECOND);
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
  });
});

describe('A3 · revancha tras Infección', () => {
  it('[HALLAZGO A3-5] convertedAt/canTagFrom/pingsBeforeConversion sobreviven a finish() y rematch() hasta start()', () => {
    const g = game();
    catchBy(g, 'h', 'r1');
    g.ok('r2', { type: 'self_tag', hunterId: 'h' });
    g.ok('r3', { type: 'self_tag', hunterId: 'h' });
    assert.equal(g.state.phase, 'FINISHED');
    const from = g.state.players.r3!.canTagFrom!;
    assert.ok(snapshotFor(g.state, 'r3', g.now).canTagFrom === from, 'FINISHED: canTagFrom en la vista');
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.equal(g.state.phase, 'LOBBY');
    assert.equal(g.state.players.r3?.convertedAt != null, true, 'LOBBY: convertedAt sigue');
    assert.equal(snapshotFor(g.state, 'r3', g.now).canTagFrom, from, 'LOBBY: canTagFrom en la vista');
    for (const id of ['r1', 'r2', 'r3']) g.ok(id, { type: 'join_rematch' });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.state.players.r3?.canTagFrom, null);
    assert.equal(g.state.captures.length, 0);
  });
  it('revancha con swapRoles en Infección: se ignora (sorteo nuevo), 1 cazador con 4', () => {
    const g = game();
    g.advance(25 * MINUTE);
    g.ok('h', { type: 'rematch', swapRoles: true });
    for (const id of ['r1', 'r2', 'r3']) g.ok(id, { type: 'join_rematch' });
    assert.ok(Object.values(g.state.players).every((p) => p.teamPref === 'random'));
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(hunters(g), 1);
  });
});

describe('A3 · informe (funciones puras del cliente)', () => {
  const caps = [
    { runnerId: 'a', hunterId: 'h', atOffsetMs: 60_000, via: 'claim', converted: true },
    { runnerId: 'b', hunterId: 'h', atOffsetMs: 120_000, via: 'claim', converted: true },
    { runnerId: 'c', hunterId: 'a', atOffsetMs: 200_000, via: 'claim', converted: true },
    { runnerId: 'd', hunterId: 'b', atOffsetMs: 260_000, via: 'claim', converted: true },
  ];
  it('[HALLAZGO A3-3] la cadena sigue solo la 1.ª rama: b y d no aparecen en ninguna cadena', () => {
    assert.deepEqual(contagionChains(caps), [['h', 'a', 'c']]);
  });
  it('autodeclaración sin cazador (o con convertido en espera): la cadena empieza en el propio infectado', () => {
    assert.deepEqual(contagionChains([{ runnerId: 'x', hunterId: null, converted: true, atOffsetMs: 1, via: 'self' }, { runnerId: 'y', hunterId: 'x', converted: true, atOffsetMs: 2, via: 'claim' }]), [['x', 'y']]);
  });
  it('[HALLAZGO A3-2] role_changed repetido con más de 15 s de antigüedad es «stale» → sin tarjeta', () => {
    assert.equal(isStaleEvent({ type: 'role_changed', ageMs: 16_000, data: {} }, { phase: 'ACTIVE' }), true);
  });
  it('tiempo agotado con un único superviviente: no hay línea «Último superviviente»', () => {
    const snap = { phase: 'FINISHED', config: { mode: 'infection' }, activeStart: 0, finishedAt: 600_000, outcome: { winner: 'runner', cause: 'time_up' }, captures: caps.slice(0, 2), players: [] };
    const r = missionReport(snap, (id: string) => id)!;
    assert.equal(r.highlights.some((h: string) => h.startsWith('Último superviviente')), false);
  });
});
