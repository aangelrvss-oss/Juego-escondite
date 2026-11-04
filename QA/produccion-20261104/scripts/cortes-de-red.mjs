// Cortes de red simulados con el servidor y el cliente reales (net.js), en tiempo real. Entre los clientes y el
// servidor hay un proxy TCP que, durante un «corte», deja de pasar datos SIN cerrar las conexiones (como al
// perder la cobertura: el móvil no recibe ningún aviso de cierre) y no acepta conexiones nuevas.
// Uso (desde la raíz): node QA/produccion-20261104/scripts/cortes-de-red.mjs
import net from 'node:net';
const REPO = new URL('../../../', import.meta.url);
const { startServer } = await import(new URL('server/main.ts', REPO).href);
const { GameConnection } = await import(new URL('mobile/www/js/net.js', REPO).href);
const { offsetM } = await import(new URL('engine/src/geo.ts', REPO).href);

const CENTER = { lat: 40.4153, lng: -3.6845 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const ts = () => `[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)} s]`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ts()} ${ok ? '✔' : '✖'} ${name}${detail ? ` · ${detail}` : ''}`);
};
const until = async (fn, what, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return Date.now();
    await sleep(100);
  }
  throw new Error(`tiempo agotado: ${what}`);
};

// ------------------------------------------------------------------ servidor real + proxy con corte
const server = await startServer({ staticRoot: null });
const target = new URL(server.url);
let cut = false;
const pairs = new Set();
const proxy = net.createServer((client) => {
  if (cut) return void client.destroy(); // sin red: la conexión nueva no llega
  const upstream = net.connect(Number(target.port), target.hostname);
  const pair = { client, upstream, held: [] };
  pairs.add(pair);
  const forward = (from, to) =>
    from.on('data', (d) => {
      if (cut) pair.held.push([to, d]); // retenido mientras dura el corte (TCP lo reintentaría)
      else to.write(d);
    });
  forward(client, upstream);
  forward(upstream, client);
  const end = () => {
    pairs.delete(pair);
    client.destroy();
    upstream.destroy();
  };
  client.on('error', end).on('close', end);
  upstream.on('error', end).on('close', end);
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
const url = `ws://127.0.0.1:${proxy.address().port}/ws`;
const startCut = () => (cut = true);
const endCut = ({ dropOld }) => {
  cut = false;
  for (const p of pairs) {
    if (dropOld) {
      // Tras un corte largo, la conexión TCP antigua ya no sirve (en el móvil caduca o cambia de IP).
      p.client.destroy();
      p.upstream.destroy();
    } else for (const [to, d] of p.held.splice(0)) to.write(d);
  }
};

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const make = (name) => {
  const conn = new GameConnection({ url, storage: memory() });
  const p = { name, conn, statuses: [], get snap() { return conn.snapshot; }, get id() { return conn.playerId; } };
  conn.on('status', (s) => p.statuses.push(`${((Date.now() - T0) / 1000).toFixed(1)}:${s}`));
  conn.start();
  return p;
};
const ana = make('Ana');
const beto = make('Beto');
const room = () => server.hub.roomStateByCode(ana.conn.code);
let gps;
try {
  await until(() => ana.conn.status === 'open' && beto.conn.status === 'open', 'conexiones');
  const { code } = await ana.conn.create('Ana');
  await beto.conn.join(code, 'Beto');
  await until(() => ana.snap?.players.length === 2 && beto.snap?.players.length === 2, 'sala');
  // Partida real: se juega con el reloj real del servidor (huida mínima de 2 min, así que se prueba en la huida).
  const cfg = { mode: 'classic', durationMs: 10 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 2 * 60_000, zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 250 }], meetingPoint: CENTER, safetyChecklistConfirmed: true };
  await ana.conn.command({ type: 'configure', config: cfg });
  await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  await beto.conn.command({ type: 'set_team_pref', pref: 'runner' });
  for (const p of [ana, beto]) await p.conn.command({ type: 'set_ready', ready: true });
  await ana.conn.command({ type: 'start' });
  await until(() => beto.snap?.phase === 'HEAD_START', 'huida', 15_000);
  gps = setInterval(() => {
    for (const [p, n] of [[ana, 0], [beto, 40]]) {
      const q = offsetM(CENTER, n, 0);
      p.conn.sendLocation({ lat: q.lat, lng: q.lng, accuracyM: 6, ageMs: 0 });
    }
  }, 3_000);
  await sleep(3_000);

  // ---------------------------------------------------------------- 1. corte de 5 s
  const socketBefore = beto.conn.socket;
  startCut();
  console.log(`${ts()} corte de red de 5 s (Beto y Ana)`);
  await sleep(5_000);
  check('5 s: el cliente no da la conexión por muerta (sin reconexión innecesaria)', beto.conn.status === 'open' && beto.conn.socket === socketBefore, beto.statuses.join(' '));
  check('5 s: el servidor no marca a nadie «sin conexión»', !room().players[beto.id].away);
  endCut({ dropOld: false });
  await sleep(2_000);
  check('5 s: tras volver la red, la misma conexión sigue funcionando', beto.conn.status === 'open' && beto.conn.socket === socketBefore);

  // ---------------------------------------------------------------- 2. corte de 35 s (conexión muerta)
  const before = beto.statuses.length;
  startCut();
  const cutAt = Date.now();
  console.log(`${ts()} corte de red de 35 s (sin aviso de cierre)`);
  const claimDuringCut = ana.conn.command({ type: 'end_game' }); // comando enviado sin red: debe llegar UNA vez al volver
  const detected = await until(() => beto.conn.status === 'reconnecting', 'detección de la conexión muerta', 40_000);
  check('35 s: el cliente detecta la conexión muerta y pasa a «reconectando»', true, `a los ${((detected - cutAt) / 1000).toFixed(1)} s (25 s de silencio + 5 s de sonda, con el ping cada 10 s)`);
  await until(() => room().players[beto.id].away === true, '«sin conexión» en el servidor', 10_000).then(
    (t) => check('35 s: el servidor marca a Beto «sin conexión» (D-057, 30 s sin señal)', true, `a los ${((t - cutAt) / 1000).toFixed(1)} s`),
    () => check('35 s: el servidor marca a Beto «sin conexión»', false),
  );
  await sleep(Math.max(0, 35_000 - (Date.now() - cutAt)));
  endCut({ dropOld: true });
  const back = await until(() => beto.conn.status === 'open' && beto.snap && !room().players[beto.id].away, 'reconexión', 20_000);
  check('35 s: al volver la red, reconecta solo y recupera la sesión', beto.statuses.length > before, `${((back - cutAt - 35_000) / 1000).toFixed(1)} s después de volver la red · ${beto.statuses.slice(before).join(' ')}`);
  check('35 s: misma identidad, mismo rol y misma partida', beto.snap.players.find((x) => x.id === beto.id)?.team === 'runner' && ['HEAD_START', 'ACTIVE', 'FINISHED'].includes(beto.snap.phase), `fase ${beto.snap.phase}`);
  const r = await claimDuringCut;
  await until(() => ana.snap?.phase === 'FINISHED' && beto.snap?.phase === 'FINISHED', 'final', 20_000);
  check('comando enviado sin red: llega al volver y se aplica una sola vez', r.ok && ana.snap.outcome?.cause === 'ended_by_host', JSON.stringify(r));
  check('estado completo tras reconectar: Beto ve el final', beto.snap.phase === 'FINISHED');
} catch (e) {
  check(`la prueba se completa (${e.message})`, false);
} finally {
  clearInterval(gps);
  ana.conn.close();
  beto.conn.close();
  proxy.close();
  await server.close();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones (cortes de red reales, servidor y net.js reales)`);
process.exit(failed ? 1 : 0);
