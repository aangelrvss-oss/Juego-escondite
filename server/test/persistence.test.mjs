import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { GameConnection } from '../../mobile/www/js/net.js';
import { startServer } from '../main.ts';
import { T0, gameConfig, memoryStorage, player, room, settle, waitFor } from './helpers.mjs';

// Persistencia opcional (STATE_FILE): las salas sobreviven a un reinicio del servidor (Plan Maestro
// §8.1 «Persistencia»; README: «si el servidor se reinicia, las partidas en curso se pierden»).
// Servidor real reiniciado en el mismo puerto con el mismo archivo; clientes reales (net.js) que se
// reconectan solos. SIMULADO: el paso del tiempo y las lecturas. No es un móvil.

let t;
const files = [];
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  for (const c of t?.extra ?? []) c.close();
  await t?.server.close();
  for (const f of files.splice(0)) for (const x of [f, `${f}.tmp`]) rmSync(x, { force: true });
});

function stateFile() {
  const f = join(tmpdir(), `outrun-state-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  files.push(f);
  return f;
}

/** Arnés como el de helpers.mjs, pero con archivo de estado y la posibilidad de reiniciar el servidor. */
async function persistentServer(file, { port = 0, clock = { t: T0 } } = {}) {
  const server = await startServer({ port, staticRoot: null, stateFile: file, saveIntervalMs: 50, hub: { now: () => clock.t } });
  const actualPort = Number(new URL(server.url).port);
  return {
    server,
    clock,
    port: actualPort,
    wsUrl: `ws://127.0.0.1:${actualPort}/ws`,
    async advance(ms) {
      clock.t += ms;
      server.pump();
      await settle();
    },
    players: [],
    extra: [],
  };
}

async function restart(file) {
  const { port, clock, players, extra } = t;
  await t.server.close();
  const next = await persistentServer(file, { port, clock });
  next.players = players;
  next.extra = extra;
  t = next;
}

describe('persistencia opcional del servidor (STATE_FILE)', () => {
  it('una partida en curso sobrevive al reinicio y se puede terminar; los móviles se reconectan solos', async () => {
    const file = stateFile();
    t = await persistentServer(file);
    const { code, players } = await room(t, ['Ana', 'Beto', 'Caro']);
    t.players = players;
    const [ana, beto, caro] = players;
    for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner']]) await p.conn.command({ type: 'set_team_pref', pref });
    assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
    ana.at(0);
    beto.at(40);
    await settle();
    assert.equal((await caro.conn.command({ type: 'self_tag' })).ok, true);
    const before = structuredClone(t.server.hub.roomStateByCode(code));
    assert.equal(before.captures.length, 1);
    assert.ok(before.players[beto.id].samples.length > 0, 'en memoria sí hay lecturas');

    await restart(file);
    // El archivo no lleva coordenadas de jugadores ni secretos.
    const text = readFileSync(file, 'utf8');
    const saved = JSON.parse(text);
    for (const r of saved.rooms) {
      assert.equal(r.state.lastPing, null);
      for (const p of Object.values(r.state.players)) assert.deepEqual(p.samples, [], 'sin lecturas guardadas');
    }
    for (const p of players) assert.ok(!text.includes(p.conn.session.secret), 'sin secretos, solo hashes');

    await waitFor(() => players.every((p) => p.conn.status === 'open') && t.server.hub.roomStateByCode(code)?.playerOrder.every((id) => t.server.hub.roomStateByCode(code).players[id].connected || t.server.hub.roomStateByCode(code).players[id].status === 'captured'), 'reconexión automática', 15_000);
    const after = t.server.hub.roomStateByCode(code);
    assert.equal(after.phase, 'ACTIVE');
    assert.equal(after.gameEnd, before.gameEnd, 'mismo final oficial');
    assert.deepEqual(after.captures, before.captures, 'las capturas se conservan');
    assert.equal(after.players[beto.id].samples.length, 0, 'las lecturas se vuelven a llenar desde cero');
    await waitFor(() => ana.snap?.phase === 'ACTIVE' && beto.snap?.captures.length === 1, 'los clientes aceptan la instantánea restaurada');

    // Se sigue jugando: nuevas lecturas, reclamación y confirmación hasta el final.
    await t.advance(3_000);
    ana.at(0);
    beto.at(6);
    await settle();
    const claim = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(claim.ok, true, JSON.stringify(claim));
    await waitFor(() => beto.snap?.pendingClaimForMe, 'aviso de reclamación tras el reinicio');
    assert.equal((await beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final tras el reinicio');
    assert.deepEqual(t.server.hub.roomStateByCode(code).outcome, { winner: 'hunter', cause: 'all_captured' });
  });

  it('un comando aplicado justo antes del reinicio y reenviado después con el mismo id no se aplica dos veces', async () => {
    // Plan Maestro, Fase 1 (puerta de salida): «una reconexión no duplica eventos ni cambia el
    // resultado». El móvil reenvía un comando sin respuesta con el mismo id; si el servidor se ha
    // reiniciado entre medias, la respuesta guardada también tiene que sobrevivir.
    const file = stateFile();
    t = await persistentServer(file);
    const { code, players } = await room(t, ['Ana', 'Beto', 'Caro']);
    t.players = players;
    const [ana, beto, caro] = players;
    for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner']]) await p.conn.command({ type: 'set_team_pref', pref });
    assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
    const resultsFor = (id) => beto.raw.filter((m) => m.t === 'result' && m.id === id).map((m) => m.result);
    beto.conn.socket.send(JSON.stringify({ t: 'cmd', id: 'autodeclaracion-1', cmd: { type: 'self_tag' } }));
    await waitFor(() => resultsFor('autodeclaracion-1').length === 1, 'respuesta antes del reinicio');
    assert.equal(t.server.hub.roomStateByCode(code).captures.length, 1);

    const welcomes = beto.raw.filter((m) => m.t === 'welcome').length;
    await restart(file);
    await waitFor(() => beto.raw.filter((m) => m.t === 'welcome').length > welcomes && beto.conn.status === 'open', 'Beto reconectado al servidor nuevo', 15_000);
    beto.conn.socket.send(JSON.stringify({ t: 'cmd', id: 'autodeclaracion-1', cmd: { type: 'self_tag' } }));
    await waitFor(() => resultsFor('autodeclaracion-1').length === 2, 'respuesta al reenvío');
    const [first, again] = resultsFor('autodeclaracion-1');
    assert.deepEqual(again, first, 'la misma respuesta que la primera vez');
    assert.equal(first.ok, true);
    const state = t.server.hub.roomStateByCode(code);
    assert.equal(state.captures.length, 1, 'una sola captura');
    assert.equal(state.phase, 'ACTIVE', 'el resultado no cambia: Caro sigue libre');
    // Con otro id, el mismo comando sí se evalúa de nuevo (y se rechaza: ya está capturado).
    beto.conn.socket.send(JSON.stringify({ t: 'cmd', id: 'autodeclaracion-2', cmd: { type: 'self_tag' } }));
    await waitFor(() => resultsFor('autodeclaracion-2').length === 1, 'respuesta a un comando nuevo');
    assert.equal(resultsFor('autodeclaracion-2')[0].ok, false);
  });

  it('en la sala de espera: el código sigue sirviendo, la sesión del anfitrión vale y una sesión falsa no', async () => {
    const file = stateFile();
    t = await persistentServer(file);
    const { code, players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    await restart(file);
    await waitFor(() => players.every((p) => p.conn.status === 'open' && p.snap?.players.every((v) => v.connected)), 'reconexión', 15_000);
    assert.equal((await players[0].conn.command({ type: 'configure', config: gameConfig() })).ok, true, 'el anfitrión sigue siéndolo');
    const late = player(t, 'Cris');
    t.players.push(late);
    await waitFor(() => late.conn.status === 'open', 'conexión de Cris');
    assert.equal((await late.conn.join(code, 'Cris')).code, code, 'el código restaurado sirve');

    const storage = memoryStorage();
    storage.setItem('outrun.session', JSON.stringify({ playerId: players[1].id, secret: 'no-es-el-secreto', code }));
    const fake = new GameConnection({ url: t.wsUrl, storage });
    t.extra.push(fake);
    const lost = new Promise((ok) => fake.on('session_lost', ok));
    fake.start();
    assert.equal(await lost, 'bad_session');
  });

  it('tras una caída (archivo algo anterior a lo último que vieron los móviles) los clientes aceptan el estado restaurado', async () => {
    const file = stateFile();
    t = await persistentServer(file);
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    await settle(200); // guardado periódico
    const older = readFileSync(file, 'utf8'); // lo que había en disco antes de la «caída»
    for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.players.every((v) => v.ready)), 'todos listos (eventos posteriores al guardado)');
    const seqBefore = players.map((p) => p.conn.lastSeq);
    await t.server.close();
    writeFileSync(file, older); // la caída se llevó lo que no estaba guardado
    const { port, clock } = t;
    t = Object.assign(await persistentServer(file, { port, clock }), { players });
    await waitFor(() => players.every((p) => p.conn.status === 'open' && p.snap?.players.every((v) => !v.ready && v.connected)), 'los clientes aceptan la instantánea restaurada (nadie listo)', 15_000);
    players.forEach((p, i) => assert.ok(p.conn.lastSeq > seqBefore[i], 'la numeración sigue hacia delante'));
    assert.equal((await players[1].conn.command({ type: 'set_ready', ready: true })).ok, true, 'y siguen pudiendo jugar');
    await waitFor(() => players[0].snap?.players.find((v) => v.id === players[1].id)?.ready === true, 'el cambio llega a los demás');
  });

  it('un archivo de estado ilegible no impide arrancar y no se sobrescribe sin cambios nuevos', async () => {
    const file = stateFile();
    writeFileSync(file, '{esto no es json');
    t = await persistentServer(file);
    assert.equal(t.server.hub.stats().rooms, 0);
    await settle(200);
    assert.equal(readFileSync(file, 'utf8'), '{esto no es json', 'se conserva para revisarlo');
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    await settle(200);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).rooms.length, 1, 'con cambios nuevos sí se guarda');
  });

  it('sin STATE_FILE no se escribe nada (comportamiento de siempre)', async () => {
    const file = stateFile();
    const server = await startServer({ port: 0, staticRoot: null });
    t = { server, players: [], extra: [] };
    await settle(100);
    assert.equal(existsSync(file), false);
  });
});
