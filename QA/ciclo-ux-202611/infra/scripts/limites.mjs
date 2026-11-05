// Comprobación LOCAL de los límites de la propia aplicación (nunca contra producción). Arranca su propio
// servidor en 127.0.0.1:<puerto> (8811–8819) y lo detiene al terminar.
// Uso: node QA/ciclo-ux-202611/infra/scripts/limites.mjs [--puerto 8811]
//
// 1. Salas por dirección (MAX_ROOMS_PER_IP, 5 por defecto).
// 2. Máximo global de salas (maxRooms = 100, fijo en server/hub.ts).
// 3. Máximo de conexiones WebSocket (MAX_CONNECTIONS = 1.000, server/main.ts).
// 4. Tamaño máximo de mensaje (4.096 bytes, server/protocol.ts).
// 5. Límite de mensajes por conexión (ráfaga 30, 10/s, corte tras 200 descartados).
// 6. Fallos por dirección (20/min): tras un reinicio sin estado, las reanudaciones fallidas de un grupo
//    que comparte dirección (misma Wi-Fi o CGNAT del operador) bloquean crear/unirse/reanudar a todos.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameConnection } from '../../../../mobile/www/js/net.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const i = process.argv.indexOf('--puerto');
const PUERTO = Number(i > 0 ? process.argv[i + 1] : 8811);
if (PUERTO < 8811 || PUERTO > 8819) throw new Error('puerto fuera de 8811–8819');
const BASE = `http://127.0.0.1:${PUERTO}`;
const WS = `ws://127.0.0.1:${PUERTO}/ws`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (...a) => console.log(...a);

let server = null;
async function arrancar(extraEnv = {}) {
  const env = { ...process.env, PORT: String(PUERTO), HOST: '127.0.0.1', ...extraEnv };
  delete env.STATE_FILE;
  if (!('MAX_ROOMS_PER_IP' in extraEnv)) delete env.MAX_ROOMS_PER_IP;
  server = spawn(process.execPath, ['server/main.ts'], { cwd: repo, env, stdio: 'ignore' });
  for (;;) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await sleep(50);
  }
}
async function parar() {
  if (!server || server.exitCode !== null) return;
  const fin = new Promise((r) => server.once('exit', r));
  server.kill();
  await fin;
}

/** WebSocket crudo: abre, guarda los mensajes y el código de cierre. */
function abrir() {
  return new Promise((done) => {
    const ws = new WebSocket(WS);
    const c = { ws, msgs: [], closeCode: null, abierto: false, fallo: false };
    ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data));
    ws.onclose = (e) => {
      c.closeCode = e.code;
      if (!c.abierto) {
        c.fallo = true;
        done(c);
      }
    };
    ws.onerror = () => {};
    ws.onopen = () => {
      c.abierto = true;
      done(c);
    };
  });
}
const enviar = (c, m) => c.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
const ultimo = (c) => c.msgs.filter((m) => m.t === 'error' || m.t === 'welcome').at(-1);

try {
  // ---------------------------------------------------------------- 1. salas por dirección (por defecto)
  out('\n1. Salas activas por dirección (servidor con la configuración por defecto)');
  await arrancar();
  const hosts = [];
  for (let k = 1; k <= 6; k++) {
    const c = await abrir();
    enviar(c, { t: 'create', name: `Ana ${k}`, installId: `inst-${k}` });
    await sleep(100);
    hosts.push(c);
    out(`   create nº ${k}: ${JSON.stringify(ultimo(c)?.t === 'welcome' ? 'welcome' : ultimo(c))}`);
  }
  for (const c of hosts) c.ws.close();
  await sleep(300);
  out(`   tras cerrar las 6 conexiones (las salas siguen en la sala de espera hasta 30 min): ${await (await fetch(`${BASE}/health`)).text()}`);
  await parar();
  await arrancar();

  // ---------------------------------------------------------------- 6. fallos por dirección
  out('\n6. Fallos por dirección (20/min): reanudaciones con sesión inexistente desde la misma dirección');
  // Un jugador legítimo con sesión válida (sala creada antes de las reanudaciones fallidas).
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: (k) => void mem.delete(k) };
  const legit = new GameConnection({ url: WS, storage });
  legit.start();
  await sleep(300);
  await legit.create('Legítimo');
  out(`   jugador legítimo en su sala: ${legit.playerId ? 'sí' : 'no'}`);
  const fallidos = [];
  for (let k = 1; k <= 22; k++) {
    const c = await abrir();
    enviar(c, { t: 'resume', playerId: `p_inexistente${k}`, secret: 'x'.repeat(43), lastSeq: 0 });
    await sleep(40);
    fallidos.push(c);
  }
  const resp = fallidos.map((c) => ultimo(c)?.error ?? '(nada)');
  out(`   respuestas a 22 reanudaciones inválidas: ${JSON.stringify(Object.fromEntries([...new Set(resp)].map((r) => [r, resp.filter((x) => x === r).length])))}`);
  const nueva = await abrir();
  enviar(nueva, { t: 'create', name: 'Otra', installId: 'inst-otra' });
  await sleep(150);
  out(`   crear sala nueva desde la misma dirección justo después: ${JSON.stringify(ultimo(nueva))}`);
  // El legítimo pierde la conexión (cambio de antena) y reanuda con su sesión VÁLIDA.
  let snapshots = 0;
  const errores = [];
  legit.on('snapshot', () => snapshots++);
  legit.on('error', (e) => errores.push(e));
  const antes = snapshots;
  legit.socket?.close();
  await sleep(15_000);
  out(`   reanudación VÁLIDA del jugador legítimo tras el corte: errores=${JSON.stringify(errores)}, instantáneas recibidas en 15 s=${snapshots - antes}, estado de la conexión=${legit.status}`);
  out('   (net.js no vuelve a intentar la reanudación mientras el socket siga abierto: queda conectado pero sin sesión)');
  legit.close();
  for (const c of [...fallidos, nueva]) c.ws.close();
  await parar();

  // ---------------------------------------------------------------- 2. máximo global de salas
  out('\n2. Máximo global de salas (MAX_ROOMS_PER_IP=1000 para que no actúe el límite por dirección)');
  await arrancar({ MAX_ROOMS_PER_IP: '1000' });
  const muchas = [];
  for (let k = 1; k <= 101; k++) {
    const c = await abrir();
    enviar(c, { t: 'create', name: `Sala ${k}`, installId: `i-${k}` });
    muchas.push(c);
  }
  await sleep(1_500);
  const res = muchas.map((c) => (ultimo(c)?.t === 'welcome' ? 'welcome' : ultimo(c)?.error ?? '(nada)'));
  out(`   101 creaciones: ${JSON.stringify(Object.fromEntries([...new Set(res)].map((r) => [r, res.filter((x) => x === r).length])))}`);
  out(`   /health: ${await (await fetch(`${BASE}/health`)).text()}`);
  for (const c of muchas) c.ws.close();
  await sleep(500);

  // ---------------------------------------------------------------- 3. máximo de conexiones
  out('\n3. Máximo de conexiones WebSocket simultáneas (1.010 intentos)');
  const conns = [];
  for (let k = 0; k < 1_010; k += 50) conns.push(...(await Promise.all(Array.from({ length: Math.min(50, 1_010 - k) }, abrir))));
  const abiertas = conns.filter((c) => c.abierto).length;
  out(`   abiertas: ${abiertas} · rechazadas: ${conns.filter((c) => c.fallo).length}`);
  out(`   /health: ${await (await fetch(`${BASE}/health`)).text()}`);
  for (const c of conns) c.ws.close();
  await sleep(1_000);

  // ---------------------------------------------------------------- 4. tamaño de mensaje
  out('\n4. Tamaño máximo de mensaje');
  const grande = await abrir();
  enviar(grande, JSON.stringify({ t: 'ping', c: 1, relleno: 'x'.repeat(5_000) }));
  await sleep(300);
  out(`   mensaje de ~5.000 bytes: código de cierre ${grande.closeCode}`);
  const medio = await abrir();
  enviar(medio, JSON.stringify({ t: 'ping', c: 1, relleno: 'x'.repeat(3_000) }));
  await sleep(300);
  out(`   mensaje de ~3.000 bytes con un campo de más: respuesta ${JSON.stringify(medio.msgs.at(-1))}, cierre ${medio.closeCode}`);
  medio.ws.close();

  // ---------------------------------------------------------------- 5. límite de mensajes
  out('\n5. Límite de mensajes por conexión');
  const rafaga = await abrir();
  for (let k = 0; k < 60; k++) enviar(rafaga, { t: 'ping', c: k });
  await sleep(500);
  out(`   60 pings de golpe: ${rafaga.msgs.filter((m) => m.t === 'pong').length} pongs`);
  const abuso = await abrir();
  for (let k = 0; k < 400; k++) enviar(abuso, { t: 'ping', c: k });
  await sleep(800);
  out(`   400 pings de golpe: ${abuso.msgs.filter((m) => m.t === 'pong').length} pongs, código de cierre ${abuso.closeCode}`);
  rafaga.ws.close();
} catch (e) {
  out('EXCEPCIÓN', e.stack);
} finally {
  await parar();
}
process.exit(0);
