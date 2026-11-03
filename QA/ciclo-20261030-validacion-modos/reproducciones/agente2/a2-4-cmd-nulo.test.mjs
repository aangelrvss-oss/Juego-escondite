// A2-4 · {t:'cmd', id, cmd:null} (o sin el campo cmd) pasa protocol.ts (cmd: any) y hace fallar
// Hub.run en `cmd.type` (TypeError): main.ts lo captura y cierra la conexión con 1011. Los demás ven
// «desconectado» / «conectado» del jugador.
// NO EJECUTADO por el agente 2. Resultado esperado SI EL FALLO EXISTE: la prueba pasa.
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { player, testServer, waitFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/test/helpers.mjs';

let t;
const clients = [];
after(async () => {
  for (const c of clients) c.conn?.close?.();
  await t?.close();
});

it('A2-4: cmd null con sesión cierra la conexión con 1011 en lugar de responder invalid_command', async () => {
  t = await testServer();
  const ana = player(t, 'Ana');
  clients.push(ana);
  await waitFor(() => ana.conn.status === 'open', 'conexión');
  await ana.conn.create('Ana');
  const session = JSON.parse(ana.conn.storage.getItem('outrun.session'));
  ana.conn.close();

  const ws = new WebSocket(t.wsUrl);
  const got = [];
  let closeCode = null;
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)));
  ws.addEventListener('close', (e) => (closeCode = e.code));
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.send(JSON.stringify({ t: 'resume', playerId: session.playerId, secret: session.secret, lastSeq: 0 }));
  await waitFor(() => got.some((m) => m.t === 'snapshot'), 'reanudada');
  ws.send(JSON.stringify({ t: 'cmd', id: 'x1', cmd: null }));
  await waitFor(() => closeCode !== null, 'FALLO: la conexión se cierra');
  assert.equal(closeCode, 1011, 'FALLO: error interno en lugar de { ok:false, error:"invalid_command" }');
  assert.equal(got.filter((m) => m.t === 'result' && m.id === 'x1').length, 0);
});
