import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RATE } from '../hub.ts';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Clientes maliciosos o defectuosos contra el servidor real, con WebSocket crudo (sin net.js).

let t;
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  await t?.close();
});

/** Socket crudo que guarda mensajes y el código de cierre. */
async function rawSocket(url, headers) {
  const ws = new WebSocket(url, headers ? { headers } : undefined);
  const got = [];
  let closeCode = null;
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)));
  ws.addEventListener('close', (e) => (closeCode = e.code));
  await new Promise((ok, ko) => {
    ws.addEventListener('open', ok);
    ws.addEventListener('error', ko);
  });
  return {
    ws,
    got,
    get closeCode() {
      return closeCode;
    },
    send: (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
  };
}

describe('protocolo hostil', () => {
  it('mensajes mal formados: se rechazan sin romper la conexión ni el servidor', async () => {
    t = await testServer();
    const s = await rawSocket(t.wsUrl);
    for (const bad of ['no json', '[]', 'null', '{"t":"hack"}', '{"t":"create"}', '{"t":"create","name":5,"installId":"x"}', '{"t":"loc","lat":"1"}', '{"t":"ping","c":1,"x":2}']) {
      s.send(bad);
    }
    s.send({ t: 'cmd', id: 'a', cmd: { type: 'start' } }); // sin sesión
    await waitFor(() => s.got.length >= 9, 'respuestas');
    assert.deepEqual(s.got.slice(0, 8).map((m) => m.error), Array(8).fill('bad_message'));
    assert.equal(s.got[8].error, 'no_session');
    s.send({ t: 'ping', c: 1 });
    await waitFor(() => s.got.some((m) => m.t === 'pong'), 'la conexión sigue viva');
  });

  it('un mensaje demasiado grande o binario cierra la conexión', async () => {
    t = await testServer();
    const big = await rawSocket(t.wsUrl);
    big.send(JSON.stringify({ t: 'ping', c: 1, pad: 'x'.repeat(5_000) }));
    await waitFor(() => big.closeCode !== null, 'cierre');
    assert.equal(big.closeCode, 1009);
    const bin = await rawSocket(t.wsUrl);
    bin.ws.send(new Uint8Array([1, 2, 3]));
    await waitFor(() => bin.closeCode !== null, 'cierre');
    assert.equal(bin.closeCode, 1003);
  });

  it('comandos que solo puede generar el servidor, comandos mal formados e intentos de cambiar el rol', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const [ana, beto] = players;
    assert.equal((await beto.conn.command({ type: 'connection', connected: false })).error, 'forbidden');
    assert.equal((await beto.conn.command({ type: 'join', name: 'X', deviceId: 'y' })).error, 'forbidden');
    assert.equal((await beto.conn.command({ type: 'location', sample: { lat: 0, lng: 0, accuracyM: 1, measuredAt: 0 } })).error, 'forbidden');
    assert.equal((await beto.conn.command({ type: 'configure', config: { zone: [null] } })).error, 'invalid_command');
    assert.equal((await beto.conn.command({ type: 'teleport' })).error, 'invalid_command');
    // Un jugador normal no puede asignarse ni asignar roles, ni empezar.
    assert.equal((await beto.conn.command({ type: 'assign_team', targetId: beto.id, pref: 'hunter' })).error, 'forbidden');
    assert.equal((await beto.conn.command({ type: 'start' })).error, 'forbidden');
    // Ya en partida, nadie puede cambiar su preferencia (equipo fijado al empezar).
    await ana.conn.command({ type: 'configure', config: gameConfig() });
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    await ana.conn.command({ type: 'start' });
    await waitFor(() => beto.snap.phase === 'COUNTDOWN', 'cuenta atrás');
    assert.equal((await beto.conn.command({ type: 'set_team_pref', pref: 'hunter' })).error, 'wrong_phase');
  });

  it('un comando repetido con el mismo id no se aplica dos veces', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const s = await rawSocket(t.wsUrl);
    const beto = players[1];
    // Beto continúa desde otro socket con su propia sesión (como al reconectar desde otra red).
    const session = JSON.parse(beto.conn.storage.getItem('outrun.session'));
    beto.conn.close(); // sin reconexión automática que compita con el socket de la prueba
    s.send({ t: 'resume', playerId: session.playerId, secret: session.secret, lastSeq: 0 });
    await waitFor(() => s.got.some((m) => m.t === 'welcome'), 'reanudación');
    const before = s.got.filter((m) => m.t === 'event' && m.type === 'player_updated').length;
    s.send({ t: 'cmd', id: 'dup-1', cmd: { type: 'set_ready', ready: true } });
    s.send({ t: 'cmd', id: 'dup-1', cmd: { type: 'set_ready', ready: true } });
    await waitFor(() => s.got.filter((m) => m.t === 'result').length === 2, 'dos respuestas');
    const results = s.got.filter((m) => m.t === 'result');
    assert.deepEqual(results[0].result, results[1].result);
    await settle();
    assert.equal(s.got.filter((m) => m.t === 'event' && m.type === 'player_updated').length - before, 1, 'un solo efecto');
    s.ws.close();
  });

  it('sesiones falsas, códigos adivinados y avalanchas de mensajes', async () => {
    t = await testServer();
    const s = await rawSocket(t.wsUrl);
    s.send({ t: 'resume', playerId: 'p_x', secret: 'nope', lastSeq: 0 });
    await waitFor(() => s.got.length === 1, 'respuesta');
    assert.equal(s.got[0].error, 'bad_session');
    // Adivinar códigos: tras el límite de fallos por dirección, todo se rechaza, también desde otra conexión.
    const guesses = [];
    for (let i = 0; i < 3; i++) guesses.push(await rawSocket(t.wsUrl));
    let n = 0;
    for (const g of guesses) for (let i = 0; i < RATE.attemptsPerMinute; i++) g.send({ t: 'join', code: `ZZZZ${n++}`.slice(0, 6), name: 'X', installId: `i${n}` });
    await waitFor(() => guesses.reduce((a, g) => a + g.got.length, 0) === 3 * RATE.attemptsPerMinute, 'respuestas');
    const errors = guesses.flatMap((g) => g.got.map((m) => m.error));
    assert.equal(errors.filter((e) => e === 'not_found').length, RATE.failuresPerMinutePerIp - 1, 'el fallo de la sesión falsa también cuenta');
    assert.ok(errors.filter((e) => e === 'rate_limited').length >= 3 * RATE.attemptsPerMinute - RATE.failuresPerMinutePerIp);
    // Avalancha: el servidor descarta y, si sigue, corta la conexión.
    const flood = await rawSocket(t.wsUrl);
    for (let i = 0; i < RATE.burst + RATE.closeAfterDropped + 10; i++) flood.send({ t: 'ping', c: i });
    await waitFor(() => flood.closeCode !== null, 'corte por avalancha');
    assert.equal(flood.closeCode, 4008);
    assert.ok(flood.got.filter((m) => m.t === 'pong').length <= RATE.burst + 1);
  });

  it('orígenes web ajenos no pueden abrir el WebSocket', async () => {
    t = await testServer();
    await assert.rejects(rawSocket(t.wsUrl, { origin: 'https://evil.example' }));
    const app = await rawSocket(t.wsUrl, { origin: 'https://localhost' }); // app Capacitor
    app.ws.close();
  });

  it('las salas cerradas se borran: sin sesiones ni memoria pendiente', async () => {
    t = await testServer({ closedRoomGraceMs: 1_000 });
    const { code, players } = await room(t, ['Ana', 'Beto', 'Caro']);
    t.players = players;
    assert.equal(t.server.hub.stats().sessions, 3);
    assert.equal((await players[0].conn.command({ type: 'cancel' })).ok, true);
    await waitFor(() => players.every((p) => p.snap.phase === 'CANCELLED'), 'sala cerrada');
    await t.advance(1_000);
    assert.deepEqual({ rooms: t.server.hub.stats().rooms, sessions: t.server.hub.stats().sessions }, { rooms: 0, sessions: 0 });
    assert.equal(t.server.hub.roomStateByCode(code), undefined);
    // Una sala de espera abandonada caduca sola (30 min sin actividad, regla del motor) y se borra.
    const { players: idle } = await room(t, ['Dani', 'Eva']);
    t.players.push(...idle);
    await t.advance(30 * 60_000);
    await t.advance(1_000);
    assert.equal(t.server.hub.stats().rooms, 0);
  });
});

describe('robustez del servidor HTTP y de las sesiones duplicadas', () => {
  it('URL mal formada o intento de salir de la carpeta pública: 400/404 y el servidor sigue vivo', async () => {
    const { startServer } = await import('../main.ts');
    const s = await startServer({ staticRoot: fileURLToPath(new URL('../../mobile/www/', import.meta.url)) });
    const { request } = await import('node:http');
    const get = (path) =>
      new Promise((ok) => request(`${s.url}${path}`, { method: 'GET' }, (res) => ok(res.statusCode)).end());
    try {
      assert.equal(await get('/%E0%A4%A'), 400);
      assert.equal(await get('/../../server/main.ts'), 404);
      assert.equal(await get('/%2e%2e/%2e%2e/package.json'), 404);
      assert.equal(await get('/index.html'), 200);
      assert.equal(await get('/health'), 200);
    } finally {
      await s.close();
    }
  });

  it('la misma sesión abierta en dos sitios: la antigua se desconecta sin pelear en bucle', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const beto = players[1];
    const { GameConnection } = await import('../../mobile/www/js/net.js');
    const twin = new GameConnection({ url: t.wsUrl, storage: beto.conn.storage });
    const errors = [];
    beto.conn.on('error', (e) => errors.push(e));
    twin.start();
    await waitFor(() => beto.conn.status === 'closed', 'la antigua se cierra');
    assert.deepEqual(errors, ['replaced']);
    await waitFor(() => twin.snapshot?.players.length === 2, 'la nueva recupera la sala');
    await settle(1_500); // margen mayor que la primera espera de reconexión
    assert.equal(beto.conn.status, 'closed', 'no reconecta para quitarle la sesión a la otra');
    assert.equal(twin.status, 'open');
    twin.close();
  });
});
