import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { offsetM } from '../../engine/src/geo.ts';
import { RATE } from '../hub.ts';
import { CENTER, gameConfig, room, testServer, waitFor } from './helpers.mjs';

// POST /api/loc: envío de la ubicación desde el servicio nativo de la app (pensado para cuando la
// pantalla está bloqueada y la interfaz web puede estar dormida). Servidor real por HTTP.
// SIMULADO: el paso del tiempo y las lecturas. No prueba un móvil real.

let t;
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  await t?.close();
});

/** Envía una lectura por HTTP como lo haría el servicio nativo. Devuelve el código HTTP. */
async function upload(body, { headers = {}, method = 'POST', raw } = {}) {
  const res = await fetch(`${t.server.url}/api/loc`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
  });
  await res.arrayBuffer();
  return res.status;
}

const sessionOf = (p) => ({ playerId: p.conn.session.playerId, secret: p.conn.session.secret });
const reading = (p, north, { acc = 8, age = 0, east = 0 } = {}) => {
  const pos = offsetM(CENTER, north, east);
  return { ...sessionOf(p), lat: pos.lat, lng: pos.lng, acc, age };
};
const health = async () => (await fetch(`${t.server.url}/health`)).json();

/** Sala de tres con la partida en la cuenta atrás. */
async function countdown() {
  t = await testServer();
  const { code, players } = await room(t, ['Ana', 'Beto', 'Caro']);
  t.players = players;
  const [ana] = players;
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await waitFor(() => players.every((p) => p.snap?.phase === 'COUNTDOWN'), 'cuenta atrás');
  return { code, players, state: () => t.server.hub.roomStateByCode(code) };
}

describe('envío nativo de la ubicación por HTTP (POST /api/loc)', () => {
  it('en partida se registra con la hora del servidor; en la cuenta atrás se ignora sin cortar el envío', async () => {
    const { players, state } = await countdown();
    const [ana] = players;
    assert.equal(await upload(reading(ana, 0)), 202, 'cuenta atrás: ignorada, el móvil sigue enviando');
    await t.advance(5_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'HEAD_START'), 'huida');
    const before = await health();
    await t.advance(1_000);
    assert.equal(await upload(reading(ana, 3, { age: 2_500 })), 204);
    const stored = state().players[ana.id].samples.at(-1);
    assert.equal(stored.measuredAt, t.clock.t - 2_500, 'antigüedad convertida con el reloj del servidor');
    const after = await health();
    assert.equal(after.locHttp, before.locHttp + 1);
    assert.equal(after.locWs, before.locWs);
    assert.doesNotMatch(JSON.stringify(after), /secret|lat|lng|Ana/, '/health no tiene datos personales');
  });

  it('el límite de una lectura por segundo es por jugador y lo comparten WebSocket y HTTP', async () => {
    const { players } = await countdown();
    const [ana] = players;
    await t.advance(5_000);
    await waitFor(() => ana.snap.phase === 'HEAD_START', 'huida');
    ana.at(1);
    await waitFor(() => t.server.hub.stats().locWs === 1, 'lectura por WebSocket');
    assert.equal(await upload(reading(ana, 2)), 202, 'misma ventana de 900 ms: ignorada');
    await t.advance(RATE.locMinIntervalMs);
    assert.equal(await upload(reading(ana, 2)), 204);
    assert.equal(await upload(reading(ana, 3)), 202);
    const s = t.server.hub.stats();
    assert.deepEqual([s.locWs, s.locHttp], [1, 1]);
  });

  it('sesión falsa o secreto ajeno: 401 y, tras agotar el presupuesto de sesiones por minuto desde la misma dirección, 429', async () => {
    const { players } = await countdown();
    const [ana, beto] = players;
    assert.equal(await upload({ ...reading(ana, 0), secret: sessionOf(beto).secret }), 401, 'secreto de otro jugador');
    assert.equal(await upload({ ...reading(ana, 0), playerId: 'p_inventado' }), 401);
    // AF-07: las sesiones falsas tienen su propio presupuesto por dirección (antes compartían los 20 de códigos).
    for (let i = 2; i < RATE.sessionFailuresPerMinutePerIp; i++) assert.equal(await upload({ ...reading(ana, 0), secret: `x${i}` }), 401);
    assert.equal(await upload({ ...reading(ana, 0), secret: 'x-otra' }), 429, 'la dirección queda bloqueada un minuto para sesiones falsas');
    // V-07 (ciclo 30/10/2026): los fallos ajenos desde la misma dirección (Wi-Fi o CGNAT compartidas) no
    // bloquean a quien tiene sesión válida. Antes esperaba 429 aquí, que era justo el fallo.
    assert.equal(await upload(reading(ana, 0)), 202, 'la sesión buena sigue funcionando (en la cuenta atrás se acepta y se ignora)');
    await t.advance(60_001);
    assert.equal(await upload(reading(ana, 0)), 204, 'pasado el minuto vuelve a funcionar (ya en la huida)');
  });

  it('peticiones mal formadas, enormes, de otro tipo o de otra web se rechazan sin afectar a la partida', async () => {
    const { players } = await countdown();
    const [ana] = players;
    const good = reading(ana, 0);
    assert.equal(await upload({ ...good, extra: 1 }), 400, 'campo desconocido');
    assert.equal(await upload({ ...good, lat: '40.4' }), 400);
    assert.equal(await upload({ ...good, t: 'loc' }), 400);
    assert.equal(await upload(null, { raw: 'no json' }), 400);
    assert.equal(await upload(null, { raw: JSON.stringify({ ...good, pad: 'x'.repeat(2_000) }) }), 413);
    assert.equal(await upload(good, { headers: { 'content-type': 'text/plain' } }), 415, 'sin preflight CORS: no se acepta');
    assert.equal(await upload(good, { headers: { origin: 'https://evil.example' } }), 403);
    assert.equal(await upload(null, { method: 'GET' }), 405);
    // El servidor sigue sirviendo la partida.
    assert.equal((await health()).ok, true);
    assert.equal(ana.conn.status, 'open');
  });

  it('capturado o partida terminada: 410 (el móvil deja de enviar); fuera de la sala: 401', async () => {
    const { players, state } = await countdown();
    await t.advance(5_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'HEAD_START'), 'huida');
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'ACTIVE'), 'persecución');
    const team = (p) => state().players[p.id].team;
    const runner = players.find((p) => team(p) === 'runner');
    const host = players[0];
    assert.equal((await runner.conn.command({ type: 'self_tag' })).ok, true);
    await t.advance(1_000);
    assert.equal(await upload(reading(runner, 0)), 410, 'capturado: ya no comparte ubicación');
    assert.equal((await host.conn.command({ type: 'end_game' })).ok, true);
    await t.advance(1_000);
    const other = players.find((p) => p !== runner);
    assert.equal(await upload(reading(other, 0)), 410, 'partida terminada');
    const session = reading(other, 0);
    assert.equal((await other.conn.command({ type: 'leave' })).ok, true);
    await waitFor(() => other.conn.session === null, 'sesión olvidada');
    assert.equal(await upload(session), 401, 'quien sale de la sala pierde la sesión también por HTTP');
  });

  it('una captura se valida solo con lecturas llegadas por HTTP (pantallas bloqueadas)', async () => {
    const { players, state } = await countdown();
    await t.advance(5_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'HEAD_START'), 'huida');
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'ACTIVE'), 'persecución');
    const team = (p) => state().players[p.id].team;
    const hunter = players.find((p) => team(p) === 'hunter');
    const runner = players.find((p) => team(p) === 'runner');
    assert.equal(await upload(reading(hunter, 0)), 204);
    assert.equal(await upload(reading(runner, 6)), 204);
    const claim = await hunter.conn.command({ type: 'claim_tag', runnerId: runner.id });
    assert.equal(claim.ok, true, JSON.stringify(claim));
    assert.equal(t.server.hub.stats().locWs, 0, 'ninguna lectura por WebSocket');
  });
});
