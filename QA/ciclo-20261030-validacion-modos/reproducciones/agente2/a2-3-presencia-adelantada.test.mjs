// A2-3 · Por el límite de SEEN_EVERY_MS (5 s), la última señal de vida que se pasa al motor puede ser
// hasta 5 s anterior a la última real: «sin conexión» y «fuera» llegan hasta 5 s antes de lo que dice la
// regla (30 s / 5 min desde la ÚLTIMA señal).
// NO EJECUTADO por el agente 2. Resultado esperado SI EL FALLO EXISTE: la prueba pasa.
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { gameConfig, player, settle, testServer, waitFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/test/helpers.mjs';

let t;
const clients = [];
after(async () => {
  for (const c of clients) c.conn.close();
  await t?.close();
});

it('A2-3: lastSeenAt se queda en la primera señal de una ráfaga de 5 s', async () => {
  t = await testServer();
  const [ana, beto] = ['Ana', 'Beto'].map((n) => player(t, n));
  clients.push(ana, beto);
  await waitFor(() => ana.conn.status === 'open' && beto.conn.status === 'open', 'conexiones');
  const { code } = await ana.conn.create('Ana');
  await beto.conn.join(code, 'Beto');
  await waitFor(() => ana.snap?.players.length === 2, 'sala');
  await ana.conn.command({ type: 'configure', config: gameConfig() });
  for (const p of [ana, beto]) await p.conn.command({ type: 'set_ready', ready: true });
  await ana.conn.command({ type: 'start' });
  await t.advance(6_000); // HEAD_START: ya cuenta la presencia
  await waitFor(() => beto.snap.phase === 'HEAD_START', 'huida');

  t.clock.t += 6_000; // más de SEEN_EVERY_MS desde la última señal pasada al motor
  const first = t.clock.t;
  beto.conn.socket.send(JSON.stringify({ t: 'ping', c: 1 })); // se pasa al motor
  await settle();
  t.clock.t += 4_900;
  const last = t.clock.t;
  beto.conn.socket.send(JSON.stringify({ t: 'ping', c: 2 })); // última señal real: se descarta
  await settle();
  const state = t.server.hub.roomStateByCode(code);
  assert.equal(state.players[beto.id].lastSeenAt, first, 'FALLO: el motor no conoce la última señal');
  assert.notEqual(state.players[beto.id].lastSeenAt, last);

  // 25,1 s después de la última señal real (30 s después de la primera): ya «sin conexión».
  t.clock.t = first + 30_000;
  t.server.pump();
  await settle();
  await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.away === true, 'FALLO: «sin conexión» a los 25,1 s de la última señal');
});
