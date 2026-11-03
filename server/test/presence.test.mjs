import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GameConnection } from '../../mobile/www/js/net.js';
import { gameConfig, memoryStorage, player, settle, testServer, waitFor } from './helpers.mjs';

// D-057 (30/10/2026) con servidor real y clientes reales (net.js):
// - la misma partida abierta en dos pestañas (mismo almacenamiento): la anterior se para, sin colgarse,
//   y puede recuperar la partida;
// - sin dobles conexiones al volver a primer plano;
// - presencia («sin conexión» a los 30 s) y periodo de gracia (fuera a los 5 min).
// SIMULADO: el cambio de pestaña y la página congelada (el cliente deja de enviar), no un móvil real.

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn?.close();
  await t?.close();
});

/** Ana (anfitriona, cazadora), Beto y Caro (fugitivos), en la persecución. */
async function activeRoom(names = ['Ana', 'Beto', 'Caro']) {
  const players = names.map((n) => player(t, n));
  clients.push(...players);
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create(names[0]);
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === names.length), 'todos en la sala');
  await players[0].conn.command({ type: 'set_team_pref', pref: 'hunter' });
  for (const p of players.slice(1)) await p.conn.command({ type: 'set_team_pref', pref: 'runner' });
  assert.equal((await players[0].conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await players[0].conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  await t.advance(2 * 60_000);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  return { code, players };
}

/** Segunda «pestaña» del mismo navegador: comparte el almacenamiento (y por tanto la sesión). */
function secondTab(storage) {
  const events = [];
  const conn = new GameConnection({ url: t.wsUrl, storage });
  conn.on('event', (e) => events.push(e));
  conn.start();
  const tab = { conn, events };
  clients.push(tab);
  return tab;
}

describe('la misma partida en dos pestañas', () => {
  it('la anterior se para sin colgarse, los demás no reciben avisos repetidos y puede volver a jugar aquí', async () => {
    t = await testServer();
    const storage = memoryStorage();
    const players = ['Ana', 'Beto'].map((n, i) => {
      const conn = new GameConnection({ url: t.wsUrl, storage: i === 1 ? storage : memoryStorage() });
      const events = [];
      conn.on('event', (e) => events.push(e));
      conn.start();
      return { name: n, conn, events, get snap() { return conn.snapshot; } };
    });
    clients.push(...players);
    const [ana, beto] = players;
    await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
    const { code } = await ana.conn.create('Ana');
    await beto.conn.join(code, 'Beto');
    await waitFor(() => ana.snap?.players.length === 2, 'Beto en la sala');
    const connEventsBefore = ana.events.filter((e) => e.type === 'player_connection').length;

    // Beto abre el enlace otra vez en otra pestaña: reanuda su misma sesión.
    const tab2 = secondTab(storage);
    await waitFor(() => tab2.conn.snapshot?.players.length === 2, 'la segunda pestaña entra en la partida');
    await waitFor(() => beto.conn.replaced, 'la primera pestaña se para');
    assert.equal(beto.conn.status, 'closed');
    assert.equal(tab2.conn.playerId, beto.conn.playerId);
    // Su sesión sigue guardada: la otra pestaña la está usando.
    assert.ok(storage.getItem('outrun.session'));
    // Un comando en la pestaña parada no se queda esperando para siempre.
    assert.deepEqual(await beto.conn.command({ type: 'set_ready', ready: true }), { ok: false, error: 'replaced' });
    await settle(100);
    // Para Ana, Beto nunca se ha desconectado: ningún aviso de conexión nuevo.
    assert.equal(ana.events.filter((e) => e.type === 'player_connection').length, connEventsBefore);

    // «Jugar en esta pestaña»: la primera recupera la partida y la segunda se para.
    beto.conn.start();
    await waitFor(() => beto.conn.status === 'open' && !beto.conn.replaced, 'la primera vuelve');
    await waitFor(() => tab2.conn.replaced, 'la segunda se para');
    assert.equal((await beto.conn.command({ type: 'set_ready', ready: true })).ok, true);
    assert.equal(ana.events.filter((e) => e.type === 'player_connection').length, connEventsBefore);
  });
});

describe('sin dobles conexiones', () => {
  it('pedir conexión varias veces mientras reconecta abre un solo WebSocket', async () => {
    t = await testServer();
    let opened = 0;
    class CountingWebSocket extends WebSocket {
      constructor(url) {
        super(url);
        opened++;
      }
    }
    const conn = new GameConnection({ url: t.wsUrl, storage: memoryStorage(), WebSocketImpl: CountingWebSocket });
    clients.push({ conn });
    conn.start();
    await waitFor(() => conn.status === 'open', 'conexión');
    await conn.create('Ana');
    conn.socket.close();
    await waitFor(() => conn.status === 'reconnecting', 'reconectando');
    // Lo que hace la interfaz al volver a primer plano (visibilitychange, pageshow, online).
    conn.wake();
    conn.wake();
    conn.start();
    await waitFor(() => conn.status === 'open', 'reconectada');
    await settle(1_500); // más que el primer reintento programado
    assert.equal(opened, 2);
    assert.equal(t.server.hub.stats().clients, 1);
  });
});

describe('presencia y periodo de gracia por WebSocket (D-057)', () => {
  it('se corta 4 min: los demás lo ven «sin conexión» y después «ha vuelto»; sigue jugando', async () => {
    t = await testServer();
    const { players } = await activeRoom();
    const [ana, beto] = players;
    beto.conn.close(); // sin cobertura
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.connected === false, 'Ana lo ve desconectado');
    await t.advance(4 * 60_000);
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.away === true, 'Ana lo ve «sin conexión»');
    assert.ok(ana.eventsOf('player_presence').some((e) => e.data.playerId === beto.id && e.data.away === true));
    beto.conn.start();
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.away === false, 'ha vuelto');
    assert.equal(beto.snap.players.find((p) => p.id === beto.id)?.status, 'active');
    assert.equal(beto.snap.phase, 'ACTIVE');
    assert.equal(ana.eventsOf('player_left').length, 0);
  });

  it('se corta más de 5 min: queda fuera, todos lo saben; al volver ve por qué, el final y la revancha', async () => {
    t = await testServer();
    const { players } = await activeRoom();
    const [ana, beto, caro] = players;
    beto.conn.close();
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.connected === false, 'Ana lo ve desconectado');
    await t.advance(5 * 60_000 + 20_000);
    for (const p of [ana, caro]) {
      await waitFor(() => p.eventsOf('player_left').some((e) => e.data.playerId === beto.id && e.data.reason === 'timeout'), `${p.name} recibe que Beto queda fuera`);
    }
    assert.equal(ana.snap.phase, 'ACTIVE'); // queda Caro
    beto.conn.start();
    await waitFor(() => beto.snap?.players.find((p) => p.id === beto.id)?.leftReason === 'timeout', 'Beto ve que está fuera');
    assert.equal(beto.snap.phase, 'ACTIVE');
    assert.equal(beto.snap.lastPing, null);
    // El final le llega igual que a todos.
    await t.advance(20 * 60_000);
    await waitFor(() => beto.snap.phase === 'FINISHED', 'Beto recibe el final');
    assert.deepEqual(beto.snap.outcome, ana.snap.outcome);
    assert.equal(ana.snap.players.find((p) => p.id === beto.id)?.leftReason, 'timeout');
    // Y la revancha.
    assert.equal((await ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    await waitFor(() => beto.snap.phase === 'LOBBY', 'Beto ve la sala de la revancha');
    assert.equal(beto.snap.players.find((p) => p.id === beto.id)?.status, 'invited');
    assert.equal((await beto.conn.command({ type: 'join_rematch' })).ok, true);
  });

  it('una página congelada (socket abierto pero sin mensajes) queda «sin conexión»; al despertar, vuelve', async () => {
    t = await testServer();
    const { players } = await activeRoom();
    const [ana, beto] = players;
    // `jump`: el reloj avanza sin que nadie dé señales (ninguna página envía nada).
    await t.jump(35_000);
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.away === true, 'Beto «sin conexión»');
    assert.equal(ana.snap.players.find((p) => p.id === beto.id)?.connected, true); // el socket sigue abierto
    beto.conn.wake(); // la página despierta: ping inmediato
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.away === false, 'Beto vuelve');
  });

  it('un cliente no puede enviar señales de vida falsas al motor', async () => {
    t = await testServer();
    const { players } = await activeRoom(['Ana', 'Beto']);
    assert.deepEqual(await players[1].conn.command({ type: 'seen' }), { ok: false, error: 'forbidden' });
  });

  it('el cazador que recarga con una reclamación pendiente la sigue viendo', async () => {
    t = await testServer();
    const { players } = await activeRoom(['Ana', 'Beto']);
    const [ana, beto] = players;
    ana.at(0);
    beto.at(4);
    await settle();
    const r = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(r.ok, true);
    // Recarga: una conexión nueva con la misma sesión.
    ana.conn.socket.close();
    await waitFor(() => ana.conn.status === 'open' && ana.snap.pendingClaimByMe, 'Ana vuelve con su reclamación');
    assert.equal(ana.snap.pendingClaimByMe.runnerId, beto.id);
    assert.equal(ana.snap.pendingClaimByMe.claimId, r.data.claimId);
  });
});
