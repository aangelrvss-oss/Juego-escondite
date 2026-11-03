// A2-2 · net.js no descarta los comandos pendientes cuando la sesión se pierde (bad_session/removed,
// cierre 4000): al crear o entrar en OTRA sala, el welcome los reenvía con la sesión nueva.
// Caso: Beto pulsa «Salir» sin cobertura; mientras, su sala se borra; al volver ve la pantalla de
// inicio, crea una sala nueva… y el «leave» antiguo se aplica en ella: la sala nueva se cierra al momento.
// NO EJECUTADO por el agente 2. Resultado esperado SI EL FALLO EXISTE: la prueba pasa.
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { player, settle, testServer, waitFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/test/helpers.mjs';

let t;
const clients = [];
after(async () => {
  for (const c of clients) c.conn.close();
  await t?.close();
});

it('A2-2: un comando de la sala anterior se aplica en la sala nueva', async () => {
  t = await testServer({ closedRoomGraceMs: 1_000 });
  const ana = player(t, 'Ana');
  const beto = player(t, 'Beto');
  clients.push(ana, beto);
  await waitFor(() => ana.conn.status === 'open' && beto.conn.status === 'open', 'conexiones');
  const { code } = await ana.conn.create('Ana');
  await beto.conn.join(code, 'Beto');
  await waitFor(() => beto.snap?.players.length === 2, 'Beto dentro');

  // Ana cancela la sala (queda CANCELLED; se borra pasado closedRoomGraceMs).
  assert.equal((await ana.conn.command({ type: 'cancel' })).ok, true);
  await waitFor(() => beto.snap.phase === 'CANCELLED', 'Beto ve la sala cerrada');

  // Beto pierde la conexión y, mientras reconecta, envía un comando (queda pendiente en net.js).
  beto.conn.socket.close();
  await waitFor(() => beto.conn.status === 'reconnecting', 'Beto reconectando');
  const pendingLeave = beto.conn.command({ type: 'leave' });
  // La sala se borra antes de que Beto vuelva (sesión inválida).
  await t.jump(2_000);
  await waitFor(() => beto.conn.status === 'open' && beto.conn.playerId === null, 'resume → bad_session → sesión olvidada');
  assert.equal(beto.conn.pending.size, 1, 'FALLO: el comando de la sala borrada sigue pendiente');

  // Beto crea una sala nueva desde la pantalla de inicio.
  await beto.conn.create('Beto');
  // El welcome reenvía el «leave» pendiente con la sesión nueva.
  const r = await pendingLeave;
  assert.equal(r.ok, true, 'FALLO: el «leave» antiguo se ha aplicado en la sala nueva');
  await settle(100);
  // Al salir de su propia sala de espera (era el único), la sala se cierra «empty» y a Beto se le quita
  // la sesión: el servidor le manda «removed» y net.js vuelve a la pantalla de inicio.
  assert.ok(beto.raw.some((m) => m.t === 'error' && m.error === 'removed'), 'FALLO: la sala recién creada le expulsa');
  assert.equal(beto.conn.playerId, null, 'FALLO: Beto ya no tiene sala');
});
