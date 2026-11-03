import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, SECOND, TIMING } from '../src/constants.ts';
import { snapshotFor } from '../src/view.ts';
import { Harness, T0, config } from './helpers.ts';
import type { GameConfig } from '../src/types.ts';

// Infección a nivel de modo (ciclo de validación del 30/10/2026, C20): fija en el repositorio las
// comprobaciones de la auditoría que solo existían en scripts (QA/ciclo-20261030-validacion-modos):
// reparto con `start` real para n = 4..20, borde exacto de la espera de 60 s (reclamación y atribución
// de la autodeclaración), «sin conexión»/reconexión sin efecto en `canTagFrom`, cadena de contagio con
// ramas (contagionGroups de la interfaz), último superviviente y revancha sin restos.
// Reglas: GAME_MODES_AND_RULES.md §3 y D-057 (no se cambian aquí).

// La interfaz (JavaScript sin tipos) se carga con import dinámico para no exigir declaraciones a tsc.
interface Capture { runnerId: string; hunterId: string | null; atOffsetMs: number; converted?: boolean }
interface GameView {
  contagionGroups(captures: Capture[]): { hunterId: string | null; victims: string[] }[];
  missionReport(snap: unknown, nameOf?: (id: string) => string): { winner: string; cause: string; highlights: string[] } | null;
}
const GAME_VIEW = '../../mobile/www/js/game-view.js';
const { contagionGroups, missionReport } = (await import(GAME_VIEW)) as GameView;

const INF: Partial<GameConfig> = { mode: 'infection' };

/** h cazador inicial (por preferencia); el resto fugitivos (por preferencia), en la persecución. */
function infectionGame(runners: string[], cfg: Partial<GameConfig> = {}): Harness {
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

/** `hunter` reclama a `runner` a 4 m (en `north`) y este lo confirma. */
function catchBy(g: Harness, hunter: string, runner: string, north = 0): void {
  g.at(hunter, north);
  g.at(runner, north + 4);
  const r = g.cmd(hunter, { type: 'claim_tag', runnerId: runner });
  assert.equal(r.ok, true, JSON.stringify(r));
  g.ok(runner, { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: true });
  assert.equal(g.state.players[runner]?.team, 'hunter');
}

const p = (g: Harness, id: string) => {
  const x = g.state.players[id];
  assert.ok(x, id);
  return x;
};

describe('Infección: reparto con start real', () => {
  // Tabla escrita a mano (no la fórmula): max(1, floor(n/4)).
  const EXPECTED: Record<number, number> = { 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 2, 10: 2, 11: 2, 12: 3, 13: 3, 14: 3, 15: 3, 16: 4, 17: 4, 18: 4, 19: 4, 20: 5 };

  it('n = 4..20 con preferencia «al azar»: el motor reparte exactamente esos cazadores al empezar (3 semillas)', () => {
    for (let n = 4; n <= 20; n++) {
      for (const seed of [1, 42, 977]) {
        const g = new Harness('Ana', T0, seed);
        for (let i = 1; i < n; i++) g.join(`p${i}`);
        g.ok('h', { type: 'configure', config: config(INF) });
        g.readyAll();
        g.ok('h', { type: 'start' });
        const players = Object.values(g.state.players);
        assert.equal(players.filter((x) => x.status === 'active').length, n, `n=${n}`);
        assert.equal(players.filter((x) => x.team === 'hunter').length, EXPECTED[n], `n=${n}, semilla ${seed}`);
        assert.equal(players.filter((x) => x.team === 'runner').length, n - (EXPECTED[n] ?? 0));
        // El reparto se mantiene al revelar los roles (fin de la cuenta atrás).
        g.advance(TIMING.countdownMs);
        assert.equal(g.state.phase, 'HEAD_START');
        assert.equal(Object.values(g.state.players).filter((x) => x.team === 'hunter').length, EXPECTED[n]);
      }
    }
  });

  it('asignación manual: con la cifra exacta empieza; con uno de más o de menos, teams_unbalanced (n = 9, 2 cazadores)', () => {
    for (const [manualHunters, ok] of [[2, true], [3, false], [1, true]] as const) {
      const g = new Harness();
      const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
      for (const id of ids) g.join(id);
      // Cazadores fijados a mano; el resto, fugitivos fijados a mano (sin nadie «al azar» si manualHunters=2/3).
      const hunters = ['h', ...ids].slice(0, manualHunters);
      for (const id of ['h', ...ids]) {
        if (id === 'h') g.ok('h', { type: 'set_team_pref', pref: hunters.includes('h') ? 'hunter' : 'runner' });
        else g.ok('h', { type: 'assign_team', targetId: id, pref: hunters.includes(id) ? 'hunter' : manualHunters === 1 && id === 'p8' ? 'random' : 'runner' });
      }
      g.ok('h', { type: 'configure', config: config(INF) });
      g.readyAll();
      const r = g.cmd('h', { type: 'start' });
      if (ok) {
        assert.equal(r.ok, true, `${manualHunters} a mano: ${JSON.stringify(r)}`);
        assert.equal(Object.values(g.state.players).filter((x) => x.team === 'hunter').length, 2);
      } else {
        assert.deepEqual(r, { ok: false, error: 'teams_unbalanced', detail: 'infection' });
      }
    }
  });
});

describe('Infección: borde exacto de la espera de 60 s', () => {
  it('reclamar: a 59 999 ms tag_cooldown; a 60 000 ms exactos se acepta', () => {
    const g = infectionGame(['r1', 'r2', 'r3']);
    catchBy(g, 'h', 'r1');
    const at = p(g, 'r1').convertedAt ?? NaN;
    assert.equal(at, g.now);
    assert.equal(p(g, 'r1').canTagFrom, at + 60 * SECOND);
    g.tickTo(at + 60 * SECOND - 1);
    g.at('r1', 100);
    g.at('r2', 104);
    assert.deepEqual(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }), { ok: false, error: 'tag_cooldown' });
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, at + 60 * SECOND);
    g.tickTo(at + 60 * SECOND);
    g.at('r1', 100);
    g.at('r2', 104);
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, null);
    const r = g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' });
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it('autodeclaración: a 59 999 ms no se atribuye al convertido (sin autor); a 60 000 ms sí', () => {
    const g = infectionGame(['r1', 'r2', 'r3', 'r4']);
    catchBy(g, 'h', 'r1');
    const at = p(g, 'r1').convertedAt ?? NaN;
    g.tickTo(at + 60 * SECOND - 1);
    g.ok('r2', { type: 'self_tag', hunterId: 'r1' });
    assert.deepEqual(
      { runnerId: g.state.captures.at(-1)?.runnerId, hunterId: g.state.captures.at(-1)?.hunterId, via: g.state.captures.at(-1)?.via, converted: g.state.captures.at(-1)?.converted },
      { runnerId: 'r2', hunterId: null, via: 'self', converted: true },
    );
    g.tickTo(at + 60 * SECOND);
    g.ok('r3', { type: 'self_tag', hunterId: 'r1' });
    assert.equal(g.state.captures.at(-1)?.runnerId, 'r3');
    assert.equal(g.state.captures.at(-1)?.hunterId, 'r1');
    assert.equal(g.state.phase, 'ACTIVE', 'r4 sigue libre');
  });
});

describe('Infección: presencia y espera', () => {
  it('«sin conexión», desconexión y reconexión no cambian canTagFrom: la espera sigue siendo una hora fija', () => {
    const g = infectionGame(['r1', 'r2', 'r3']);
    catchBy(g, 'h', 'r1');
    const until = p(g, 'r1').canTagFrom;
    assert.ok(until);
    g.ok('r1', { type: 'connection', connected: false });
    g.tickTo(g.now + 31 * SECOND); // sin señales: «sin conexión»
    assert.equal(p(g, 'r1').away, true);
    assert.equal(p(g, 'r1').canTagFrom, until);
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, until);
    g.ok('r1', { type: 'connection', connected: true });
    g.ok('r1', { type: 'seen' });
    assert.equal(p(g, 'r1').away, false);
    assert.equal(p(g, 'r1').canTagFrom, until, 'volver no reinicia ni acorta la espera');
    assert.equal(p(g, 'r1').team, 'hunter');
    g.tickTo(until - 1);
    g.at('r1', 100);
    g.at('r2', 104);
    assert.deepEqual(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }), { ok: false, error: 'tag_cooldown' });
    g.tickTo(until);
    g.at('r1', 100);
    g.at('r2', 104);
    assert.equal(g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' }).ok, true);
    assert.equal(p(g, 'r1').canTagFrom, until);
  });
});

describe('Infección: cadena de contagio y final', () => {
  it('cadena con dos ramas y una autodeclaración sin autor: contagionGroups lista TODAS las infecciones', () => {
    const g = infectionGame(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    catchBy(g, 'h', 'r1', 0); // h → r1
    catchBy(g, 'h', 'r2', 0); // h → r2
    g.advance(61 * SECOND);
    catchBy(g, 'r1', 'r3', 50); // rama 1: r1 → r3
    catchBy(g, 'r2', 'r4', -50); // rama 2: r2 → r4
    g.advance(5 * SECOND);
    g.ok('r5', { type: 'self_tag' }); // sin autor
    assert.equal(g.state.phase, 'ACTIVE', 'r6 sigue libre');
    const converted = g.state.captures.filter((c) => c.converted).map((c) => c.runnerId);
    assert.deepEqual(converted, ['r1', 'r2', 'r3', 'r4', 'r5']);
    const groups = contagionGroups(g.state.captures);
    assert.deepEqual(groups, [
      { hunterId: 'h', victims: ['r1', 'r2'] },
      { hunterId: 'r1', victims: ['r3'] },
      { hunterId: 'r2', victims: ['r4'] },
      { hunterId: null, victims: ['r5'] },
    ]);
    assert.deepEqual(groups.flatMap((x) => x.victims).sort(), converted.sort(), 'ninguna infección fuera de la cadena');
    // El informe final las muestra todas.
    g.ok('h', { type: 'end_game' });
    const report = missionReport(snapshotFor(g.state, 'r6', g.now));
    assert.ok(report);
    assert.ok(report.highlights.includes('Contagio: h → r1, r2 · r1 → r3 · r2 → r4 · Sin autor conocido → r5'), JSON.stringify(report.highlights));
  });

  it('último superviviente: cae el último ⇒ ganan los cazadores (todos lo son) y el informe lo nombra', () => {
    const g = infectionGame(['r1', 'r2', 'r3']);
    catchBy(g, 'h', 'r1', 0);
    catchBy(g, 'h', 'r2', 0);
    g.advance(2 * MINUTE);
    assert.equal(g.state.phase, 'ACTIVE');
    catchBy(g, 'r1', 'r3', 30); // el último superviviente cae ante un convertido
    assert.equal(g.state.phase, 'FINISHED');
    assert.deepEqual(g.state.outcome, { winner: 'hunter', cause: 'all_captured' });
    for (const id of ['h', 'r1', 'r2', 'r3']) {
      assert.equal(p(g, id).team, 'hunter', id);
      assert.equal(p(g, id).status, 'active', id);
    }
    const report = missionReport(snapshotFor(g.state, 'r3', g.now));
    assert.ok(report);
    assert.equal(report.winner, 'Ganan los cazadores');
    assert.equal(report.cause, 'Todos infectados');
    assert.ok(report.highlights.some((h) => h.startsWith('Último superviviente: r3, hasta los ')), JSON.stringify(report.highlights));
  });

  it('se acaba el tiempo con un único superviviente ⇒ ganan los supervivientes', () => {
    const g = infectionGame(['r1', 'r2', 'r3']);
    catchBy(g, 'h', 'r1', 0);
    catchBy(g, 'h', 'r2', 0);
    g.advance(25 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
    assert.deepEqual(Object.values(g.state.players).filter((x) => x.team === 'runner').map((x) => x.id), ['r3']);
    assert.equal(p(g, 'r3').status, 'active');
    const report = missionReport(snapshotFor(g.state, 'h', g.now));
    assert.equal(report?.winner, 'Ganan los supervivientes');
  });
});

describe('Infección: revancha sin restos', () => {
  it('tras el start de la revancha no queda nada de la anterior (canTagFrom, convertedAt, pingsBeforeConversion, claims, captures)', () => {
    const g = infectionGame(['r1', 'r2', 'r3']);
    g.advance(3 * MINUTE + SECOND); // pasa la primera pista: la conversión guarda pingsBeforeConversion = 1
    assert.equal(g.state.pingCount, 1);
    catchBy(g, 'h', 'r1', 0);
    assert.equal(p(g, 'r1').pingsBeforeConversion, 1);
    // Una reclamación pendiente del cazador inicial y la espera del convertido sin terminar al acabar.
    g.at('h', 0);
    g.at('r2', 4);
    assert.equal(g.cmd('h', { type: 'claim_tag', runnerId: 'r2' }).ok, true);
    assert.equal(Object.keys(g.state.claims).length, 1);
    g.ok('h', { type: 'end_game' });
    assert.equal(g.state.phase, 'FINISHED');
    assert.ok((p(g, 'r1').canTagFrom ?? 0) > g.now, 'la espera seguía en curso al terminar');
    // C19 / V-27: ni el informe ni la sala de la revancha muestran la espera.
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, null);
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.equal(snapshotFor(g.state, 'r1', g.now).canTagFrom, null);
    for (const id of ['r1', 'r2', 'r3']) g.ok(id, { type: 'join_rematch' });
    g.readyAll();
    g.ok('h', { type: 'start' });
    const s = g.state;
    assert.equal(s.gameNo, 2);
    assert.equal(s.phase, 'COUNTDOWN');
    assert.equal(s.config?.mode, 'infection');
    assert.deepEqual(s.claims, {});
    assert.deepEqual(s.captures, []);
    assert.equal(s.outcome, null);
    assert.equal(s.lastPing, null);
    assert.equal(s.pingCount, 0);
    for (const id of ['h', 'r1', 'r2', 'r3']) {
      const x = p(g, id);
      assert.equal(x.status, 'active', id);
      assert.equal(x.canTagFrom, null, `${id}: canTagFrom`);
      assert.equal(x.convertedAt, null, `${id}: convertedAt`);
      assert.equal(x.pingsBeforeConversion, null, `${id}: pingsBeforeConversion`);
    }
    assert.equal(Object.values(s.players).filter((x) => x.team === 'hunter').length, 1, 'sorteo nuevo: floor(4/4)');
    // Y se juega con normalidad: el cazador del sorteo puede reclamar desde el primer momento.
    g.advance(TIMING.countdownMs);
    g.advance(s.config?.headStartMs ?? 0);
    assert.equal(g.state.phase, 'ACTIVE');
    const hunter = Object.values(g.state.players).find((x) => x.team === 'hunter');
    const runner = Object.values(g.state.players).find((x) => x.team === 'runner');
    assert.ok(hunter && runner);
    assert.equal(snapshotFor(g.state, hunter.id, g.now).canTagFrom, null);
    g.at(hunter.id, 200);
    g.at(runner.id, 204);
    const r = g.cmd(hunter.id, { type: 'claim_tag', runnerId: runner.id });
    assert.equal(r.ok, true, JSON.stringify(r));
  });
});
