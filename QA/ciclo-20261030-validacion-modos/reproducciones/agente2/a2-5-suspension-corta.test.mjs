// A2-5 · Suspensión del servidor entre 30 y 60 s: no se detecta (SUSPEND_GAP_MS = 60 s) y TODOS los
// jugadores pasan a «sin conexión» a la vez al despertar (aviso a todos de cada uno). Con más de 60 s sí
// se perdona. La regla D-057 dice «tras suspensión del servidor el plazo empieza de cero».
// Se simula la suspensión moviendo a la vez el reloj del juego y Date.now (que es lo que mira
// checkSuspended). NO EJECUTADO por el agente 2. Resultado esperado SI EL FALLO EXISTE: la prueba pasa.
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { gameConfig, player, settle, testServer, waitFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/test/helpers.mjs';

let t;
const clients = [];
const realNow = Date.now;
let offset = 0;
after(async () => {
  Date.now = realNow;
  for (const c of clients) c.conn.close();
  await t?.close();
});

async function huida() {
  t = await testServer();
  const ps = ['Ana', 'Beto', 'Caro'].map((n) => player(t, n));
  clients.push(...ps);
  await waitFor(() => ps.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await ps[0].conn.create('Ana');
  for (const p of ps.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => ps[0].snap?.players.length === 3, 'sala');
  await ps[0].conn.command({ type: 'configure', config: gameConfig() });
  for (const p of ps) await p.conn.command({ type: 'set_ready', ready: true });
  await ps[0].conn.command({ type: 'start' });
  await t.advance(6_000);
  await waitFor(() => ps.every((p) => p.snap?.phase === 'HEAD_START'), 'huida');
  return ps;
}

function suspend(ms) {
  offset += ms;
  Date.now = () => realNow() + offset;
  t.clock.t += ms;
  t.server.pump();
}

it('A2-5: 45 s de suspensión del servidor → todos «sin conexión» (no se perdona)', async () => {
  const [ana] = await huida();
  suspend(45_000);
  await settle(50);
  await waitFor(() => ana.snap.players.every((p) => p.away === true), 'FALLO: todos «sin conexión» de golpe');
});
