import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { RULES_VERSION } from '../../engine/src/constants.ts';
import { GameConnection } from '../../mobile/www/js/net.js';
import { missionReport } from '../../mobile/www/js/game-view.js';
import { gameConfig, room, testServer, waitFor } from './helpers.mjs';

// Mission Report (Plan Maestro §4.4 y §10: «coincide con los eventos oficiales y puede abrirse tras
// reconexión»). Servidor real y clientes reales (net.js) por WebSocket; tiempo SIMULADO.

let t;
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  for (const c of t?.extra ?? []) c.close();
  await t?.close();
});

describe('Mission Report', () => {
  it('es igual para todos, coincide con el estado del servidor y se recupera tras reconectar', async () => {
    t = await testServer();
    const { code, players } = await room(t, ['Ana', 'Beto', 'Caro']);
    t.players = players;
    const [ana, beto, caro] = players;
    const state = () => t.server.hub.roomStateByCode(code);
    await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
    await beto.conn.command({ type: 'set_team_pref', pref: 'runner' });
    await caro.conn.command({ type: 'set_team_pref', pref: 'runner' });
    assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');

    await t.advance(90_000);
    assert.equal((await beto.conn.command({ type: 'self_tag', hunterId: ana.id })).ok, true);
    await t.advance(4 * 60_000);
    assert.equal((await caro.conn.command({ type: 'self_tag' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final en todos');

    const s = state();
    const names = Object.fromEntries(Object.values(s.players).map((p) => [p.id, p.name]));
    const nameOf = (id) => names[id];
    const reports = players.map((p) => missionReport(p.snap, nameOf));
    for (const r of reports) assert.deepEqual(r, reports[0], 'el mismo informe para todos');
    const r = reports[0];
    assert.equal(r.winner, 'Ganan los cazadores');
    assert.equal(r.captureCount, s.captures.length);
    assert.equal(r.durationMs, s.finishedAt - s.activeStart, 'duración oficial del motor');
    assert.equal(r.timeToVictoryMs, 90_000 + 4 * 60_000);
    assert.deepEqual(r.captures.map((c) => [c.runner, c.hunter, c.via]), [['Beto', 'Ana', 'self'], ['Caro', null, 'self']]);
    assert.ok(r.highlights.includes('Captura decisiva: Caro a los 5:30'));
    assert.equal(r.rulesVersion, RULES_VERSION, 'versión de reglas con la que se jugó');
    assert.equal(s.rulesVersion, RULES_VERSION);

    // Reconexión de Caro con su sesión guardada: el informe se reconstruye solo con la instantánea.
    const storage = caro.conn.storage;
    caro.conn.close();
    const again = new GameConnection({ url: t.wsUrl, storage });
    t.extra = [again];
    again.start();
    await waitFor(() => again.snapshot?.phase === 'FINISHED', 'instantánea tras reconectar');
    assert.deepEqual(missionReport(again.snapshot, nameOf), r, 'mismo informe tras reconectar');
  });
});
