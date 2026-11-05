// Prueba de carga LOCAL de THE OUTRUN (nunca contra producción). Arranca su propio servidor
// (node server/main.ts en 127.0.0.1:<puerto>, puertos 8811–8819), lo mide desde dentro con
// muestreo-servidor.mjs y lo detiene al terminar. Los jugadores son clientes reales del protocolo
// (mobile/www/js/net.js, GameConnection) sobre el WebSocket nativo de Node, todos en este proceso.
//
// Uso:
//   node QA/ciclo-ux-202611/infra/scripts/carga.mjs --nombre 1x10 --salas 1 --jugadores 10 \
//        [--activo 60] [--puerto 8811] [--reinicio no|estado|sin-estado] [--estable 20]
//
// Fases medidas: entrada (crear/unirse/configurar/listos/empezar), huida (HEAD_START, 2 min mínimo),
// activo (ACTIVE, --activo s), reconexion (todos los sockets se cierran a la vez), estable,
// reinicio (opcional: se mata el servidor y se arranca otro en el mismo puerto), final (end_game).
//
// Ritmo de los clientes (igual que la app): ubicación 1 por segundo y jugador (cota alta: app.js envía
// cada lectura de watchPosition, como mucho 1/s, y repite cada 5 s; el servidor acepta 1 cada 900 ms),
// ping cada 10 s (net.js), y cada cazador intenta una captura cada 5 s en ACTIVE (el servidor admite 1/3 s).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { offsetM } from '../../../../engine/src/geo.ts';
import { GameConnection } from '../../../../mobile/www/js/net.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const registros = resolve(here, '../registros');
mkdirSync(registros, { recursive: true });

// ------------------------------------------------------------------ argumentos
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const NOMBRE = args.nombre ?? 'prueba';
const SALAS = Number(args.salas ?? 1);
const JUGADORES = Number(args.jugadores ?? 5);
const ACTIVO_S = Number(args.activo ?? 60);
const ESTABLE_S = Number(args.estable ?? 20);
const PUERTO = Number(args.puerto ?? 8811);
const REINICIO = args.reinicio ?? 'no';
if (PUERTO < 8811 || PUERTO > 8819) throw new Error('puerto fuera de 8811–8819');
const BASE = `http://127.0.0.1:${PUERTO}`;
const WS_URL = `ws://127.0.0.1:${PUERTO}/ws`;
const muestreoArchivo = join(registros, `${NOMBRE}.muestras.jsonl`);
rmSync(muestreoArchivo, { force: true });
const stateFile = REINICIO === 'estado' ? join(tmpdir(), `outrun-carga-${process.pid}.json`) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ servidor propio
let server = null;
let serverLog = '';
async function arrancarServidor() {
  const env = {
    ...process.env,
    PORT: String(PUERTO),
    HOST: '127.0.0.1',
    MAX_ROOMS_PER_IP: '1000', // todos los clientes salen de 127.0.0.1. PRODUCCIÓN (render.yaml) no lo define: usa el valor por defecto, 5
    MUESTREO_ARCHIVO: muestreoArchivo,
  };
  delete env.STATE_FILE;
  delete env.TRUST_PROXY;
  if (stateFile) env.STATE_FILE = stateFile;
  const t0 = Date.now();
  const child = spawn(process.execPath, ['--import', `file:///${join(here, 'muestreo-servidor.mjs').replace(/\\/g, '/')}`, 'server/main.ts'], {
    cwd: repo,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (serverLog += d));
  child.stderr.on('data', (d) => (serverLog += d));
  server = child;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`el servidor terminó al arrancar: ${serverLog}`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch {}
    await sleep(50);
  }
  return Date.now() - t0;
}
async function pararServidor() {
  if (!server || server.exitCode !== null) return;
  const s = server;
  const fin = new Promise((r) => s.once('exit', r));
  s.kill(); // en Windows: TerminateProcess (sin guardado final; STATE_FILE se guarda cada 2 s)
  await fin;
}
const health = async () => {
  try {
    return await (await fetch(`${BASE}/health`)).json();
  } catch (e) {
    return { error: e.message };
  }
};
// Comprobación cruzada desde fuera del proceso (PowerShell Get-Process: CPU acumulada y memoria).
function getProcess(pid) {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid}; "$($p.CPU);$($p.WorkingSet64)"`], { encoding: 'utf8' }).trim();
    const [cpu, ws] = out.split(';').map((x) => Number(x.replace(',', '.')));
    return { at: Date.now(), cpuS: cpu, workingSetMB: Math.round(ws / 1e5) / 10 };
  } catch (e) {
    return { at: Date.now(), error: String(e.message).slice(0, 200) };
  }
}

// ------------------------------------------------------------------ medidas del lado cliente
let fase = 'arranque';
const marcas = [];
const marcar = (f) => {
  fase = f;
  marcas.push({ fase: f, t: Date.now() });
  log(`— fase ${f}`);
};
const trafico = {}; // fase → { in, out, bytesIn, bytesOut }
const tr = () => (trafico[fase] ??= { msgIn: 0, msgOut: 0, bytesIn: 0, bytesOut: 0 });
const latencias = {}; // tipo → [ms]
const lat = (k, ms) => (latencias[k] ??= []).push(ms);
const errores = {}; // texto → n
const err = (k) => (errores[k] = (errores[k] ?? 0) + 1);
const rttPorFase = {};
const tiposIn = {};

class SpyWebSocket extends WebSocket {
  constructor(url) {
    super(url);
    this.addEventListener('message', (e) => {
      const t = tr();
      t.msgIn++;
      t.bytesIn += Buffer.byteLength(e.data);
      const tipo = /"t":"(\w+)"/.exec(e.data)?.[1] ?? '?';
      tiposIn[tipo] = (tiposIn[tipo] ?? 0) + 1;
      if (tipo === 'pong') {
        const c = Number(/"c":(\d+)/.exec(e.data)?.[1]);
        if (c) (rttPorFase[fase] ??= []).push(Date.now() - c);
      }
    });
    this.addEventListener('close', (e) => {
      if (e.code !== 1000 && e.code !== 1005) err(`cierre_${e.code}`);
    });
  }
  send(data) {
    const t = tr();
    t.msgOut++;
    t.bytesOut += Buffer.byteLength(data);
    super.send(data);
  }
}
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};
const eldCliente = monitorEventLoopDelay({ resolution: 10 });
eldCliente.enable();

const jugadores = [];
function nuevoJugador(sala, i) {
  const conn = new GameConnection({ url: WS_URL, storage: memory(), WebSocketImpl: SpyWebSocket });
  const p = { sala, i, conn, id: null, pos: null, esperaReanudar: false, reanudadoAt: null, mismaId: null, perdida: null };
  conn.on('welcome', (w) => {
    if (p.esperaReanudar && p.resumeWelcomeAt == null) {
      p.resumeWelcomeAt = Date.now();
      p.mismaId = w.playerId === p.id;
    }
  });
  conn.on('snapshot', () => {
    if (p.esperaReanudar && p.resumeWelcomeAt != null && p.reanudadoAt == null) p.reanudadoAt = Date.now();
  });
  conn.on('session_lost', (why) => {
    err(`session_lost_${why}`);
    if (p.esperaReanudar) p.perdida = why;
  });
  conn.on('error', (e) => {
    err(`error_${e}`);
    // Una reanudación rechazada por el límite de fallos por dirección deja el socket abierto y sin sesión:
    // net.js no vuelve a intentarlo. Para la medida cuenta como no recuperado.
    if (p.esperaReanudar && !p.reanudadoAt && e === 'rate_limited') p.perdida = 'rate_limited';
  });
  conn.start();
  jugadores.push(p);
  return p;
}
async function hasta(fn, que, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (fn()) return true;
    await sleep(100);
  }
  log(`AVISO: tiempo agotado esperando ${que}`);
  err(`timeout_${que}`);
  return false;
}
// Tiempo máximo por comando: net.js no resuelve command() si el servidor contesta con un `error` en vez de
// un `result` (p. ej. no_session tras perder la sala); sin este plazo la prueba se quedaba colgada.
const CMD_PLAZO_MS = 15_000;
async function cmd(p, c) {
  const t0 = Date.now();
  const r = await Promise.race([p.conn.command(c), sleep(CMD_PLAZO_MS).then(() => ({ ok: false, error: `sin_respuesta_${CMD_PLAZO_MS / 1000}s` }))]);
  if (!String(r.error ?? '').startsWith('sin_respuesta')) lat(`cmd_${c.type}`, Date.now() - t0);
  if (!r.ok) err(`cmd_${c.type}_${r.error}`);
  return r;
}

// ------------------------------------------------------------------ escenario
const CENTRO = { lat: 40.4153, lng: -3.6845 }; // punto de referencia de las pruebas del repositorio
const salas = [];
const pid0 = { muestrasProceso: [] };
let resumen = {};
// Vigilante: ninguna ejecución pasa de 15 min; si ocurre, se registra el fallo y se cierra ordenadamente.
let abortar = false;
const vigilante = setTimeout(() => {
  abortar = true;
  err('vigilante_15min');
  log('VIGILANTE: 15 min agotados; se registra el fallo y se termina');
  for (const p of jugadores) p.conn.close();
  void pararServidor().then(() => {
    escribirSalida();
    process.exit(2);
  });
}, 15 * 60_000);
vigilante.unref();
try {
  marcar('arranque');
  const arranqueMs = await arrancarServidor();
  pid0.pid = server.pid;
  log(`servidor propio pid ${server.pid} en ${BASE} (arranque ${arranqueMs} ms)`);
  resumen.arranqueServidorMs = arranqueMs;
  await sleep(1_500);
  marcar('reposo');
  await sleep(3_000);

  // ---------------- entrada
  marcar('entrada');
  for (let s = 0; s < SALAS; s++) salas.push({ s, jugadores: Array.from({ length: JUGADORES }, (_, i) => nuevoJugador(s, i)) });
  await hasta(() => jugadores.every((p) => p.conn.status === 'open'), 'conexiones', 60_000);
  await Promise.all(
    salas.map(async (sala) => {
      const host = sala.jugadores[0];
      const t0 = Date.now();
      try {
        sala.code = (await host.conn.create(`Anfitrion ${sala.s}`)).code;
        lat('create', Date.now() - t0);
      } catch (e) {
        err(`create_${e.message}`);
        return;
      }
      await Promise.all(
        sala.jugadores.slice(1).map(async (p) => {
          const t1 = Date.now();
          try {
            await p.conn.join(sala.code, `Jugador ${sala.s}-${p.i}`);
            lat('join', Date.now() - t1);
          } catch (e) {
            err(`join_${e.message}`);
          }
        }),
      );
    }),
  );
  for (const p of jugadores) p.id = p.conn.playerId;
  const centro = (s) => offsetM(CENTRO, (s % 10) * 3_000, Math.floor(s / 10) * 3_000);
  await Promise.all(
    salas.map(async (sala) => {
      if (!sala.code) return;
      const c = centro(sala.s);
      const config = {
        mode: 'classic', durationMs: 30 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 2 * 60_000,
        zone: [{ fromOffsetMs: 0, center: c, radiusM: 1_000 }], dynamicZone: true, meetingPoint: c, safetyChecklistConfirmed: true,
      };
      const host = sala.jugadores[0];
      await cmd(host, { type: 'configure', config });
      const cazadores = Math.max(1, Math.round(JUGADORES / 4));
      await Promise.all(sala.jugadores.map((p) => cmd(p, { type: 'set_team_pref', pref: p.i < cazadores ? 'hunter' : 'runner' })));
      await Promise.all(sala.jugadores.map((p) => cmd(p, { type: 'set_ready', ready: true })));
      const r = await cmd(host, { type: 'start' });
      sala.empezada = r.ok;
      for (const p of sala.jugadores) {
        const q = offsetM(c, (Math.random() - 0.5) * 1_000, (Math.random() - 0.5) * 1_000);
        p.pos = { ...q, centro: c, rumbo: Math.random() * 2 * Math.PI };
      }
    }),
  );
  resumen.salasEmpezadas = salas.filter((s) => s.empezada).length;
  log(`salas empezadas ${resumen.salasEmpezadas}/${SALAS}`);

  // ---------------- bucles de juego: ubicación 1/s por jugador, captura cada 5 s por cazador
  const intervalos = [];
  for (const p of jugadores) {
    const desfase = Math.random() * 1_000;
    setTimeout(() => {
      intervalos.push(
        setInterval(() => {
          if (!p.pos || p.conn.status !== 'open') return;
          // Paso de 1,2 m/s con rumbo aleatorio, sin salir de 450 m del centro de su zona.
          p.pos.rumbo += (Math.random() - 0.5) * 0.6;
          let q = offsetM(p.pos, Math.cos(p.pos.rumbo) * 1.2, Math.sin(p.pos.rumbo) * 1.2);
          const dLat = (q.lat - p.pos.centro.lat) * 111_000;
          const dLng = (q.lng - p.pos.centro.lng) * 111_000 * Math.cos((q.lat * Math.PI) / 180);
          if (Math.hypot(dLat, dLng) > 450) {
            p.pos.rumbo += Math.PI;
            q = offsetM(p.pos, Math.cos(p.pos.rumbo) * 1.2, Math.sin(p.pos.rumbo) * 1.2);
          }
          p.pos.lat = q.lat;
          p.pos.lng = q.lng;
          p.conn.sendLocation({ lat: q.lat, lng: q.lng, accuracyM: 8, ageMs: 200 });
        }, 1_000),
      );
    }, desfase);
  }
  const cazadoresN = Math.max(1, Math.round(JUGADORES / 4));
  for (const p of jugadores.filter((x) => x.i < cazadoresN)) {
    setTimeout(() => {
      intervalos.push(
        setInterval(() => {
          if (fase !== 'activo' && fase !== 'estable') return;
          if (p.conn.status !== 'open' || p.conn.snapshot?.phase !== 'ACTIVE') return;
          const otros = salas[p.sala].jugadores.filter((x) => x.i >= cazadoresN && x.id);
          const objetivo = otros[Math.floor(Math.random() * otros.length)];
          if (objetivo) void cmd(p, { type: 'claim_tag', runnerId: objetivo.id });
        }, 5_000),
      );
    }, Math.random() * 5_000);
  }

  // ---------------- huida y activo
  const enFase = (ph) => jugadores.every((p) => !salas[p.sala].empezada || p.conn.snapshot?.phase === ph);
  await hasta(() => enFase('HEAD_START'), 'HEAD_START', 30_000);
  marcar('huida');
  const tHuida = Date.now();
  await sleep(40_000);
  pid0.muestrasProceso.push({ fase: 'huida', ...getProcess(server.pid) });
  await sleep(10_000);
  pid0.muestrasProceso.push({ fase: 'huida', ...getProcess(server.pid) });
  await hasta(() => enFase('ACTIVE'), 'ACTIVE', 150_000);
  resumen.huidaRealS = Math.round((Date.now() - tHuida) / 1000);
  marcar('activo');
  await sleep(Math.max(5_000, ACTIVO_S * 1_000 - 15_000));
  pid0.muestrasProceso.push({ fase: 'activo', ...getProcess(server.pid) });
  await sleep(10_000);
  pid0.muestrasProceso.push({ fase: 'activo', ...getProcess(server.pid) });
  await sleep(5_000);
  resumen.healthActivo = await health();

  // ---------------- reconexión simultánea (red del móvil cortada a la vez para todos)
  const reconexion = async (etiqueta, cortar, plazoMs = 90_000) => {
    for (const p of jugadores) Object.assign(p, { esperaReanudar: true, resumeWelcomeAt: null, reanudadoAt: null, mismaId: null, perdida: null });
    const t0 = Date.now();
    marcar(etiqueta);
    const extra = await cortar();
    await hasta(() => jugadores.every((p) => p.reanudadoAt || p.perdida), `recuperacion_${etiqueta}`, plazoMs);
    const tiempos = jugadores.filter((p) => p.reanudadoAt).map((p) => p.reanudadoAt - t0);
    for (const p of jugadores) p.esperaReanudar = false;
    return {
      jugadores: jugadores.length,
      recuperados: tiempos.length,
      mismaIdentidad: jugadores.filter((p) => p.mismaId === true).length,
      sesionPerdida: jugadores.filter((p) => p.perdida).length,
      motivosPerdida: Object.fromEntries([...new Set(jugadores.map((p) => p.perdida).filter(Boolean))].map((m) => [m, jugadores.filter((p) => p.perdida === m).length])),
      sinRespuesta: jugadores.filter((p) => !p.reanudadoAt && !p.perdida).length,
      conclusion: tiempos.length === jugadores.length ? 'todas las sesiones se recuperan' : tiempos.length === 0 ? 'las sesiones se pierden' : 'recuperación parcial',
      faseTrasRecuperar: [...new Set(jugadores.filter((p) => p.reanudadoAt).map((p) => p.conn.snapshot?.phase))],
      msHastaTodos: tiempos.length ? Math.max(...tiempos) : null,
      ...pct(tiempos, 'ms'),
      ...extra,
    };
  };
  resumen.reconexionClientes = await reconexion('reconexion', async () => {
    for (const p of jugadores) p.conn.socket?.close();
    return {};
  });
  log('reconexión:', JSON.stringify(resumen.reconexionClientes));
  marcar('estable');
  await sleep(ESTABLE_S * 1_000);

  // ---------------- reinicio del servidor (opcional)
  if (REINICIO !== 'no') {
    await sleep(2_500); // el guardado periódico (STATE_FILE) es cada 2 s
    resumen.reinicio = await reconexion(`reinicio_${REINICIO}`, async () => {
      const t0 = Date.now();
      await pararServidor();
      const arranque = await arrancarServidor();
      return { modo: REINICIO, servidorCaidoMs: Date.now() - t0, arranqueNuevoMs: arranque, nuevoPid: server.pid };
    });
    log('reinicio:', JSON.stringify(resumen.reinicio));
    resumen.healthTrasReinicio = await health();
    marcar('estable2');
    await sleep(10_000);
  }

  // ---------------- final de partida
  marcar('final');
  const t0 = Date.now();
  // Solo las salas que siguen existiendo (tras un reinicio sin estado, el anfitrión ya no tiene sesión).
  const conSala = salas.filter((s) => s.empezada && s.jugadores[0].conn.playerId);
  resumen.salasVivasAlFinal = `${conSala.length}/${salas.length}`;
  await Promise.all(conSala.map((s) => cmd(s.jugadores[0], { type: 'end_game' })));
  const vivos = jugadores.filter((p) => p.conn.status === 'open' && p.conn.snapshot && p.conn.playerId);
  await hasta(() => vivos.every((p) => p.conn.snapshot?.phase === 'FINISHED'), 'FINISHED', 60_000);
  resumen.finalMsHastaTodos = Date.now() - t0;
  resumen.finalVistoPor = `${vivos.filter((p) => p.conn.snapshot?.phase === 'FINISHED').length}/${vivos.length}`;
  await sleep(3_000);
  resumen.healthTrasFinal = await health();
  for (const i of intervalos) clearInterval(i);
  marcar('cierre');
  for (const p of jugadores) p.conn.close();
  await sleep(3_000);
  resumen.healthTrasCerrarClientes = await health();
  marcar('fin');
  await sleep(1_500);
} catch (e) {
  err(`excepcion_${e.message}`);
  log('EXCEPCIÓN', e.stack);
} finally {
  for (const p of jugadores) p.conn.close();
  await pararServidor();
  if (stateFile) for (const f of [stateFile, `${stateFile}.tmp`]) rmSync(f, { force: true });
}

// ------------------------------------------------------------------ resumen
function pct(xs, suf = '') {
  if (!xs.length) return {};
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { [`n`]: s.length, [`p50${suf}`]: q(50), [`p95${suf}`]: q(95), [`p99${suf}`]: q(99), [`max${suf}`]: s.at(-1) };
}
clearTimeout(vigilante);
escribirSalida();
process.exit(0);

function escribirSalida() {
const muestras = existsSync(muestreoArchivo) ? readFileSync(muestreoArchivo, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const ventanas = marcas.map((m, i) => ({ fase: m.fase, desde: m.t, hasta: marcas[i + 1]?.t ?? Number.POSITIVE_INFINITY }));
const porFase = {};
for (const v of ventanas) {
  const ms = muestras.filter((x) => x.t > v.desde && x.t <= v.hasta);
  const dur = (Math.min(v.hasta, Date.now()) - v.desde) / 1000;
  const t = trafico[v.fase] ?? { msgIn: 0, msgOut: 0, bytesIn: 0, bytesOut: 0 };
  porFase[v.fase] = {
    duracionS: Math.round(dur),
    muestras: ms.length,
    cpuMediaPct1Nucleo: ms.length ? Math.round((ms.reduce((a, x) => a + x.cpuPct, 0) / ms.length) * 10) / 10 : null,
    cpuMaxPct1Nucleo: ms.length ? Math.max(...ms.map((x) => x.cpuPct)) : null,
    rssMaxMB: ms.length ? Math.max(...ms.map((x) => x.rssMB)) : null,
    heapMaxMB: ms.length ? Math.max(...ms.map((x) => x.heapMB)) : null,
    retrasoBucleP99MaxMs: ms.length ? Math.max(...ms.map((x) => x.eldP99)) : null,
    retrasoBucleMaxMs: ms.length ? Math.max(...ms.map((x) => x.eldMax)) : null,
    // Desde el punto de vista del servidor: «entrantes» = lo que envían los clientes.
    msgEntrantesPorS: Math.round((t.msgOut / dur) * 10) / 10,
    msgSalientesPorS: Math.round((t.msgIn / dur) * 10) / 10,
    kBSalientesPorS: Math.round((t.bytesIn / dur / 1024) * 10) / 10,
    kBEntrantesPorS: Math.round((t.bytesOut / dur / 1024) * 10) / 10,
    rttPing: pct(rttPorFase[v.fase] ?? [], 'ms'),
  };
}
const salida = {
  nombre: NOMBRE,
  fecha: new Date().toISOString(),
  maquina: { node: process.version, plataforma: process.platform },
  parametros: { salas: SALAS, jugadores: JUGADORES, total: SALAS * JUGADORES, activoS: ACTIVO_S, reinicio: REINICIO, puerto: PUERTO },
  resumen,
  porFase,
  latenciasComandos: Object.fromEntries(Object.entries(latencias).map(([k, v]) => [k, pct(v, 'ms')])),
  errores,
  mensajesRecibidosPorTipo: tiposIn,
  retrasoBucleCliente: { p99Ms: Math.round(eldCliente.percentile(99) / 1e4) / 100, maxMs: Math.round(eldCliente.max / 1e4) / 100 },
  getProcess: pid0,
  salidaServidor: serverLog.split('\n').filter(Boolean).slice(-15),
};
writeFileSync(join(registros, `${NOMBRE}.json`), JSON.stringify(salida, null, 2));
console.log(JSON.stringify(salida, null, 2));
}
