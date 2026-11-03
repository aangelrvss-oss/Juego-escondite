import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { startServer } from '../main.ts';
import { gameConfig, player, settle, testServer, waitFor } from './helpers.mjs';

// Opciones del servidor que usa el simulador local (sim/panel). Sin ellas, todo funciona como siempre.
let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
});

describe('opciones para el simulador', () => {
  it('rateNow: con el reloj del juego parado, el límite de mensajes se recarga con el reloj real', async () => {
    let real = 0;
    t = await testServer({ rateNow: () => real });
    const p = player(t, 'Ana');
    clients = [p];
    await waitFor(() => p.conn.status === 'open', 'abierta');
    await p.conn.create('Ana');
    const burst = async () => {
      const raw = p.raw.length;
      for (let i = 0; i < 40; i++) p.conn.socket.send(JSON.stringify({ t: 'ping', c: i }));
      await settle(80);
      return p.raw.slice(raw).filter((m) => m.t === 'pong').length;
    };
    assert.ok((await burst()) <= 30, 'la ráfaga agota el límite (create y el primer ping ya gastaron alguno)');
    assert.equal(await burst(), 0, 'sin recarga: el reloj real tampoco ha avanzado');
    real += 10_000; // el reloj del juego (t.clock) sigue igual
    assert.equal(await burst(), 30, 'recargado por el reloj real');
  });

  it('keepAliveConnected(except): quien está en la lista no da señal y queda «sin conexión»', async () => {
    t = await testServer();
    const names = ['Ana', 'Beto', 'Caro'];
    const ps = names.map((n) => player(t, n));
    clients = ps;
    await waitFor(() => ps.every((p) => p.conn.status === 'open'), 'abiertas');
    const { code } = await ps[0].conn.create('Ana');
    for (const p of ps.slice(1)) await p.conn.join(code, p.name);
    await waitFor(() => ps.every((p) => p.snap?.players.length === 3), 'en la sala');
    await ps[0].conn.command({ type: 'configure', config: gameConfig() });
    for (const p of ps) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await ps[0].conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    const silent = new Set([ps[2].id]);
    for (let i = 0; i < 4; i++) {
      t.clock.t += 10_000;
      t.server.pump();
      t.server.hub.keepAliveConnected(silent);
    }
    await settle();
    const st = t.server.hub.roomStateByCode(code);
    assert.equal(st.players[ps[2].id].away, true);
    assert.equal(st.players[ps[0].id].away, false);
    assert.equal(st.players[ps[1].id].away, false);
  });

  it('routes: se consultan antes que los archivos de la interfaz; sin ellas, nada cambia', async () => {
    const server = await startServer({
      routes: (req, res, path) => {
        if (path !== '/extra') return false;
        res.writeHead(200).end('ok');
        return true;
      },
    });
    try {
      assert.equal(await (await fetch(`${server.url}/extra`)).text(), 'ok');
      assert.equal((await fetch(`${server.url}/index.html`)).status, 200);
      assert.equal((await fetch(`${server.url}/health`)).status, 200);
    } finally {
      await server.close();
    }
  });
});
