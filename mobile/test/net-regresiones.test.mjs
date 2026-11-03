import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { GameConnection } from '../www/js/net.js';
import { player, settle, testServer, waitFor } from '../../server/test/helpers.mjs';

// C5 · V-16 (QA/ciclo-20261030-validacion-modos): al perder la sesión (bad_session, removed, cierre
// 4000 de la sala), los comandos pendientes se responden con error y nunca se reenvían en la sala
// siguiente. Afecta igual a los tres modos: es el cliente de red, anterior a cualquier regla de juego.

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

/** WebSocket falso: la prueba decide qué llega y cuándo se abre o se cierra. */
function fakeSockets() {
  const all = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      all.push(this);
    }
    send(text) {
      this.sent.push(JSON.parse(text));
    }
    close() {
      this.readyState = 3;
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    deliver(msg) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
    drop(code) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
  }
  return { all, FakeWebSocket };
}

function fakeConnection() {
  const { all, FakeWebSocket } = fakeSockets();
  const conn = new GameConnection({ url: 'ws://prueba.invalid/ws', storage: memoryStorage(), WebSocketImpl: FakeWebSocket });
  conn.start();
  all[0].open();
  return { conn, sockets: all };
}

const sentCmdIds = (socket) => socket.sent.filter((m) => m.t === 'cmd').map((m) => m.id);

describe('C5 · V-16: comandos pendientes al perder la sesión', () => {
  it('«removed»: el comando pendiente se responde con error y no se reenvía en la sala nueva', async () => {
    const { conn, sockets } = fakeConnection();
    const ws = sockets[0];
    ws.deliver({ t: 'welcome', playerId: 'p_a', code: 'AAAAAA', secret: 's1' });
    const pending = conn.command({ type: 'set_ready', ready: true });
    const [oldId] = sentCmdIds(ws);
    ws.deliver({ t: 'error', error: 'removed' });
    const r = await Promise.race([pending, settle(200).then(() => 'colgada')]);
    assert.deepEqual(r, { ok: false, error: 'removed' }, 'la promesa se resuelve con el error');
    assert.equal(conn.pending.size, 0);
    // Crea otra sala por el mismo socket: el welcome nuevo no reenvía el comando antiguo.
    const created = conn.create('Ana');
    ws.deliver({ t: 'welcome', playerId: 'p_b', code: 'BBBBBB', secret: 's2' });
    await created;
    assert.equal(sentCmdIds(ws).filter((id) => id === oldId).length, 1, 'el comando antiguo no se reenvía');
    conn.close();
  });

  it('cierre 4000 (sala borrada): el comando pendiente se responde con error y no se reenvía después', async () => {
    const { conn, sockets } = fakeConnection();
    sockets[0].deliver({ t: 'welcome', playerId: 'p_a', code: 'AAAAAA', secret: 's1' });
    sockets[0].readyState = 3; // sin conexión: el comando queda pendiente sin enviarse
    const pending = conn.command({ type: 'leave' });
    sockets[0].drop(4000);
    const r = await Promise.race([pending, settle(200).then(() => 'colgada')]);
    assert.deepEqual(r, { ok: false, error: 'room_closed' });
    assert.equal(conn.pending.size, 0);
    conn.start();
    sockets[1].open();
    const created = conn.create('Ana');
    sockets[1].deliver({ t: 'welcome', playerId: 'p_b', code: 'BBBBBB', secret: 's2' });
    await created;
    assert.deepEqual(sentCmdIds(sockets[1]), [], 'nada de la sala anterior se envía en la nueva');
    conn.close();
  });

  it('reanudación normal (sin perder la sesión): el pendiente SÍ se reenvía con el mismo id', async () => {
    const { conn, sockets } = fakeConnection();
    sockets[0].deliver({ t: 'welcome', playerId: 'p_a', code: 'AAAAAA', secret: 's1' });
    sockets[0].readyState = 3;
    const pending = conn.command({ type: 'set_ready', ready: true });
    sockets[0].drop(1006);
    await waitFor(() => sockets.length === 2, 'reintento de conexión');
    sockets[1].open();
    assert.equal(sockets[1].sent.find((m) => m.t === 'resume')?.playerId, 'p_a');
    sockets[1].deliver({ t: 'welcome', playerId: 'p_a', code: 'AAAAAA' });
    const [id] = sentCmdIds(sockets[1]);
    assert.ok(id, 'reenviado al reanudar');
    sockets[1].deliver({ t: 'result', id, result: { ok: true } });
    assert.deepEqual(await pending, { ok: true });
    conn.close();
  });
});

describe('C5 · V-16 con el servidor real: «bad_session» y sala nueva (escenario A2-2)', () => {
  let t;
  const clients = [];
  after(async () => {
    for (const c of clients) c.conn.close();
    await t?.close();
  });

  it('el «leave» pendiente de una sala borrada se rechaza y no cierra la sala recién creada', async () => {
    t = await testServer({ closedRoomGraceMs: 1_000 });
    const ana = player(t, 'Ana');
    const beto = player(t, 'Beto');
    clients.push(ana, beto);
    await waitFor(() => ana.conn.status === 'open' && beto.conn.status === 'open', 'conexiones');
    const { code } = await ana.conn.create('Ana');
    await beto.conn.join(code, 'Beto');
    await waitFor(() => beto.snap?.players.length === 2, 'Beto dentro');
    assert.equal((await ana.conn.command({ type: 'cancel' })).ok, true);
    await waitFor(() => beto.snap.phase === 'CANCELLED', 'Beto ve la sala cerrada');

    beto.conn.socket.close();
    await waitFor(() => beto.conn.status === 'reconnecting', 'Beto reconectando');
    const pendingLeave = beto.conn.command({ type: 'leave' });
    await t.jump(2_000); // la sala se borra antes de que Beto vuelva
    await waitFor(() => beto.conn.status === 'open' && beto.conn.playerId === null, 'resume → bad_session');
    const r = await Promise.race([pendingLeave, settle(500).then(() => 'colgada')]);
    assert.deepEqual(r, { ok: false, error: 'bad_session' }, 'el comando de la sala borrada se rechaza');
    assert.equal(beto.conn.pending.size, 0);

    const { code: nuevo } = await beto.conn.create('Beto');
    await settle(150);
    assert.ok(!beto.raw.some((m) => m.t === 'error' && m.error === 'removed'), 'la sala nueva no le expulsa');
    assert.ok(beto.conn.playerId, 'Beto sigue en su sala nueva');
    assert.equal(t.server.hub.roomStateByCode(nuevo)?.phase, 'LOBBY');
  });

  it('el propio «leave» en la sala de espera sigue respondiendo ok: su resultado llega antes que «removed»', async () => {
    const caro = player(t, 'Caro');
    const dani = player(t, 'Dani');
    clients.push(caro, dani);
    await waitFor(() => caro.conn.status === 'open' && dani.conn.status === 'open', 'conexiones');
    const { code } = await caro.conn.create('Caro');
    await dani.conn.join(code, 'Dani');
    await waitFor(() => dani.snap?.players.length === 2, 'Dani dentro');
    assert.deepEqual(await dani.conn.command({ type: 'leave' }), { ok: true });
    await waitFor(() => dani.conn.playerId === null, 'sesión olvidada');
    const idx = (pred) => dani.raw.findIndex(pred);
    assert.ok(idx((m) => m.t === 'result') < idx((m) => m.t === 'error' && m.error === 'removed'), 'resultado antes que «removed»');
  });
});

// Ciclo de reconexión (31/10/2026, R-09 de la revisión de capturas): una acción de captura pulsada sin
// cobertura no debe ejecutarse minutos después al reconectar. Solo claim_tag, respond_tag y self_tag; el
// resto de comandos se sigue reenviando con el mismo id (el servidor devuelve la respuesta guardada).
describe('acciones de captura que esperaban durante un corte', () => {
  async function cutAndResume(cmd, waitMs) {
    const { all, FakeWebSocket } = fakeSockets();
    const clock = { t: 1_000_000 };
    const conn = new GameConnection({ url: 'ws://prueba.invalid/ws', storage: memoryStorage(), WebSocketImpl: FakeWebSocket, now: () => clock.t });
    conn.start();
    all[0].open();
    all[0].deliver({ t: 'welcome', playerId: 'p_a', code: 'AAAAAA', secret: 's1' });
    all[0].drop(1006); // sin cobertura
    const pending = conn.command(cmd); // pulsado durante el corte
    clock.t += waitMs;
    await waitFor(() => all.length === 2, 'reintento de conexión', 3_000);
    all[1].open();
    all[1].deliver({ t: 'welcome', playerId: 'p_a', code: 'AAAAAA' });
    const resent = all[1].sent.filter((m) => m.t === 'cmd');
    conn.close();
    return { resent, result: await Promise.race([pending, settle(50).then(() => 'pendiente')]) };
  }

  it('una reclamación pulsada sin cobertura hace 25 s no se envía al reconectar: se responde «stale_action»', async () => {
    const { resent, result } = await cutAndResume({ type: 'claim_tag', runnerId: 'p_b' }, 25_000);
    assert.equal(resent.length, 0);
    assert.deepEqual(result, { ok: false, error: 'stale_action' });
  });

  it('«Sí, me ha pillado» y «Me han pillado» tampoco se envían pasados 20 s', async () => {
    for (const cmd of [{ type: 'respond_tag', claimId: 'c1', accept: true }, { type: 'self_tag' }]) {
      const { resent, result } = await cutAndResume(cmd, 21_000);
      assert.equal(resent.length, 0, cmd.type);
      assert.deepEqual(result, { ok: false, error: 'stale_action' }, cmd.type);
    }
  });

  it('una reclamación de hace 5 s sí se reenvía (mismo comando) al reconectar', async () => {
    const { resent } = await cutAndResume({ type: 'claim_tag', runnerId: 'p_b' }, 5_000);
    assert.equal(resent.length, 1);
    assert.equal(resent[0].cmd.type, 'claim_tag');
  });

  it('los demás comandos se reenvían aunque hayan esperado mucho (p. ej. «Estoy listo»)', async () => {
    const { resent } = await cutAndResume({ type: 'set_ready', ready: true }, 5 * 60_000);
    assert.equal(resent.length, 1);
    assert.equal(resent[0].cmd.type, 'set_ready');
  });
});
