// A2-1 · Un «join» cuya respuesta (welcome con el secreto) se pierde deja un jugador fantasma que
// bloquea al mismo dispositivo: al reintentar recibe «already_joined» y, si el anfitrión expulsa al
// fantasma, el dispositivo queda bloqueado («not_found»).
// NO EJECUTADO por el agente 2. Resultado esperado SI EL FALLO EXISTE: la prueba pasa (las aserciones
// describen el fallo). Si se corrige el servidor, las aserciones marcadas con «FALLO» fallarán.
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { GameConnection } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/mobile/www/js/net.js';
import { memoryStorage, player, settle, testServer, waitFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/test/helpers.mjs';

let t;
const closers = [];
after(async () => {
  for (const c of closers) c();
  await t?.close();
});

it('A2-1: welcome perdido en el join → jugador fantasma y dispositivo bloqueado', async () => {
  t = await testServer();
  const ana = player(t, 'Ana');
  closers.push(() => ana.conn.close());
  await waitFor(() => ana.conn.status === 'open', 'Ana conectada');
  const { code } = await ana.conn.create('Ana');

  // Beto pulsa «Entrar» y el móvil pierde la conexión (o recarga) antes de recibir el welcome.
  const INSTALL = 'dispositivo-beto';
  const raw = new WebSocket(t.wsUrl);
  await new Promise((r) => raw.addEventListener('open', r, { once: true }));
  raw.send(JSON.stringify({ t: 'join', code, name: 'Beto', installId: INSTALL }));
  raw.close(); // la respuesta (con el secreto) no llega a guardarse
  await waitFor(() => ana.snap.players.length === 2, 'el servidor ha creado a Beto');
  await settle(100);

  // Beto vuelve a intentarlo desde el mismo dispositivo (mismo installId, sin sesión guardada).
  const storage = memoryStorage();
  storage.setItem('outrun.installId', INSTALL);
  const beto = new GameConnection({ url: t.wsUrl, storage });
  closers.push(() => beto.close());
  beto.start();
  await waitFor(() => beto.status === 'open', 'Beto conectado');
  await assert.rejects(beto.join(code, 'Beto'), /already_joined/, 'FALLO: el mismo dispositivo no puede volver a entrar');

  // El fantasma (desconectado, sin «listo») impide empezar.
  const ghost = ana.snap.players.find((p) => p.name === 'Beto');
  assert.equal(ghost.connected, false);

  // Única salida del anfitrión: expulsarlo… y entonces el dispositivo de Beto queda bloqueado.
  assert.equal((await ana.conn.command({ type: 'kick', targetId: ghost.id })).ok, true);
  await assert.rejects(beto.join(code, 'Beto'), /not_found/, 'FALLO: tras expulsar al fantasma, Beto no puede entrar nunca');
});
