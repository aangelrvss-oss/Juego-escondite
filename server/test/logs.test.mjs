import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// AC-D7: el registro del servidor (LOG=1) no contiene coordenadas. Revisión automática de todo lo
// que el servidor registra durante una partida completa con lecturas, pistas, reclamaciones, una
// reconexión y el final. También se comprueba que no aparecen nombres, códigos de sala ni secretos
// (README: «registro sin nombres, coordenadas ni secretos»).

let t;
let players = [];
afterEach(async () => {
  for (const p of players.splice(0)) p.conn.close();
  await t?.close();
});

// Un número con 4 o más decimales (una latitud o longitud de GPS). Las horas y contadores del
// registro son enteros.
const COORDINATE = /-?\d{1,3}\.\d{4,}/;

describe('registro del servidor', () => {
  it('una partida completa no deja coordenadas, nombres, códigos ni secretos en el registro', async () => {
    const lines = [];
    t = await testServer({ log: (line) => lines.push(line) });
    const names = ['Ana', 'Beto', 'Caro', 'Dani'];
    const created = await room(t, names);
    players = created.players;
    const [ana, beto, caro, dani] = players;
    for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner'], [dani, 'runner']]) await p.conn.command({ type: 'set_team_pref', pref });
    assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    ana.at(2, { east: 3 });
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
    ana.at(0, { east: 1 });
    beto.at(6, { east: 2 });
    caro.at(120, { east: -75 });
    dani.at(-90, { east: 44 });
    await settle();
    // Reclamación rechazada, otra confirmada, pista, salida de la zona, reconexión y final.
    const first = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(first.ok, true, JSON.stringify(first));
    await beto.conn.command({ type: 'respond_tag', claimId: first.data.claimId, accept: false });
    await t.advance(3_500);
    beto.at(5, { east: 1 });
    ana.at(1, { east: 1 });
    await settle();
    const second = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(second.ok, true, JSON.stringify(second));
    await beto.conn.command({ type: 'respond_tag', claimId: second.data.claimId, accept: true });
    await t.advance(3 * 60_000); // pista
    dani.at(900, { east: 30 }); // fuera de la zona
    caro.conn.socket.close();
    await waitFor(() => caro.conn.status === 'open' && ana.snap.players.find((v) => v.id === caro.id)?.connected, 'reconexión');
    await caro.conn.command({ type: 'self_tag' });
    assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');

    assert.ok(lines.length > 10, `el registro tiene contenido (${lines.length} líneas)`);
    const text = lines.join('\n');
    const coordinate = lines.find((l) => COORDINATE.test(l));
    assert.equal(coordinate, undefined, `coordenada en el registro: ${coordinate}`);
    for (const n of names) assert.ok(!text.includes(n), `nombre en el registro: ${n}`);
    assert.ok(!text.includes(created.code), 'código de sala en el registro');
    for (const p of players) {
      assert.ok(!text.includes(p.conn.session.secret), 'secreto en el registro');
      assert.ok(!text.includes(p.id), 'identificador de jugador en el registro');
    }
  });

  it('el patrón detecta una coordenada (control de la propia prueba)', () => {
    assert.ok(COORDINATE.test('loc lat=40.4153 lng=-3.6845'));
    assert.ok(!COORDINATE.test('cmd type=claim_tag ok · salas=3 · 1730000000000'));
  });
});
