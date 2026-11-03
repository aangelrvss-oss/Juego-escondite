// Simulador local de THE OUTRUN: arranca un servidor del juego PROPIO (no toca el de :8787) con el panel de
// control en /sim/ y la interfaz real del juego en /. Herramienta de desarrollo, no forma parte del juego.
//
// Uso (desde la carpeta del repositorio):  npm run sim:panel        o   node sim/panel/servidor.mjs [puerto]
// Después abre  http://localhost:8790/sim/  (localhost y no 127.0.0.1: es el origen que admite la clave del
// mapa). Escucha solo en este ordenador (127.0.0.1). Para detenerlo: Ctrl+C en su ventana.
//
// Lo que sirve:
//   /            la interfaz REAL (mobile/www/index.html) con un guion de simulación (shim.js) que le da el
//                GPS simulado y el reloj de la simulación al participante que juegas desde la interfaz.
//   /sim/        el panel de control.        /sim/api/*   estado y acciones (solo desde este mismo origen).
//   /ws, /health, archivos de la interfaz: el servidor real del juego, sin cambios.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation, SPEEDS } from './simulacion.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const WWW = join(HERE, 'www');
const APP_INDEX = fileURLToPath(new URL('../../mobile/www/index.html', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const PANEL_FILES = new Set(['index.html', 'panel.js', 'panel.css', 'shim.js']);
const MAX_BODY = 4_096;

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
};

/** Las acciones solo se aceptan desde el propio panel (mismo origen): otra web abierta en el navegador no puede mandarlas. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((done) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        done(null);
      }
    });
    req.on('error', () => done(null));
  });
}

// `banner: false` quita el rótulo «SIMULACIÓN» de la interfaz (solo para grabar material promocional:
// sim/grabacion/grabar-demo.mjs). El panel lo deja siempre.
export function createRoutes(getSim, { banner = true } = {}) {
  return (req, res, path) => {
    const sim = getSim();
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      // La interfaz real, con el guion de simulación antes de la app (y solo en este servidor de pruebas).
      const html = readFileSync(APP_INDEX, 'utf8').replace('<script type="module" src="js/app.js"></script>', '<script src="/sim/shim.js"></script>\n<script type="module" src="js/app.js"></script>');
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(html);
      return true;
    }
    if (path === '/sim') {
      res.writeHead(302, { location: '/sim/' }).end();
      return true;
    }
    if (req.method === 'GET' && path.startsWith('/sim/') && !path.startsWith('/sim/api/')) {
      const name = path === '/sim/' ? 'index.html' : path.slice(5);
      if (!PANEL_FILES.has(name)) return void res.writeHead(404).end(), true;
      res.writeHead(200, { 'content-type': MIME[extname(name)], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(readFileSync(join(WWW, name)));
      return true;
    }
    if (!path.startsWith('/sim/api/')) return false;
    const api = path.slice(9);
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://x');
      if (api === 'estado') return json(res, 200, sim.state(url.searchParams.get('vista') || null)), true;
      if (api === 'reloj') return json(res, 200, sim.clock.info()), true;
      if (api === 'jugador') {
        // Para la interfaz real: quién juega desde ella, su sesión (solo en este ordenador) y su GPS simulado.
        if (!sameOrigin(req) && req.headers['sec-fetch-site'] !== 'same-origin') return json(res, 403, { error: 'origen' }), true;
        const name = sim.human;
        const a = name ? sim.avatars.find((x) => x.name === name) : null;
        return json(res, 200, { name, run: sim.runNo, session: name ? sim.sessionFor(name) : null, pos: a ? { lat: a.pos.lat, lng: a.pos.lng, acc: 6 } : null, clock: sim.clock.info(), banner }), true;
      }
      return json(res, 404, { error: 'no existe' }), true;
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'método' }), true;
    if (!sameOrigin(req)) return json(res, 403, { error: 'origen' }), true;
    void readJson(req).then(async (body) => {
      if (!body) return json(res, 400, { error: 'cuerpo' });
      try {
        json(res, 200, { ok: true, result: (await act(sim, api, body)) ?? null });
      } catch (e) {
        sim.note(body.nombre ?? '', 'error', `Acción «${api}» no realizada: ${e.message}`);
        json(res, 409, { ok: false, error: e.message });
      }
    });
    return true;
  };
}

function later(sim, fn) {
  if (sim.busy) throw new Error(`La simulación está ocupada (${sim.busy})`);
  sim.busy = 'preparando';
  setTimeout(() => {
    sim.busy = null;
    fn().catch(() => {}); // el error ya queda en el registro de la simulación
  }, 50);
}

async function act(sim, api, b) {
  switch (api) {
    // Estas dos reinician el servidor HTTP (también el que atiende esta petición): se responde ya y se
    // ejecutan justo después; el panel sigue el progreso con su consulta periódica.
    case 'iniciar':
      if (!['classic', 'infection', 'fox_hunt'].includes(b.modo)) throw new Error('modo desconocido');
      later(sim, () => sim.start(b.modo, { human: b.humano || null }));
      return 'en_curso';
    case 'reiniciar':
      later(sim, () => sim.reset());
      return 'en_curso';
    case 'pausar':
      return sim.pause();
    case 'reanudar':
      return sim.resume();
    case 'velocidad':
      if (!SPEEDS.includes(b.x)) throw new Error('velocidad no admitida');
      return sim.setSpeed(b.x);
    case 'avanzar':
      if (![30_000, 60_000, 5 * 60_000].includes(b.ms)) throw new Error('avance no admitido');
      return sim.advance(b.ms);
    case 'desconectar':
      return sim.disconnect(b.nombre);
    case 'suspender':
      return sim.freeze(b.nombre);
    case 'restaurar':
      return sim.restore(b.nombre);
    case 'duplicar':
      return sim.duplicate(b.nombre);
    case 'captura-valida':
      return sim.validCapture(b.cazador || null, b.fugitivo || null);
    case 'captura-invalida':
      return sim.invalidCapture();
    case 'finalizar':
      return sim.finish();
    case 'revancha':
      return sim.rematch({ swapRoles: false });
    case 'humano':
      if (b.nombre) {
        sim.prepareHuman(b.nombre);
        return null;
      }
      return sim.releaseHuman();
    case 'destino':
      return sim.steer(b.lat, b.lng);
    default:
      throw new Error('acción desconocida');
  }
}

/** Arranca el simulador. Devuelve la simulación (las pruebas la usan con puerto 0). */
export async function startSimulator({ port = 8790 } = {}) {
  let sim = null;
  sim = new Simulation({ port, host: '127.0.0.1', routes: createRoutes(() => sim) });
  await sim.open();
  return sim;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? process.env.SIM_PORT ?? 8790);
  if (port === 8787) {
    console.error('El 8787 es el puerto del servidor del juego para pruebas reales: usa otro (por defecto, 8790).');
    process.exit(2);
  }
  let sim;
  try {
    sim = await startSimulator({ port });
  } catch (e) {
    console.error(`No se pudo arrancar en el puerto ${port}: ${e.code ?? e.message}. ¿Está ocupado? Prueba: node sim/panel/servidor.mjs 8791`);
    process.exit(1);
  }
  console.log(`Simulador de THE OUTRUN (herramienta de desarrollo) escuchando solo en este ordenador, puerto ${sim.port}.`);
  console.log(`Abre  http://localhost:${sim.port}/sim/   ·  Para detenerlo: Ctrl+C en esta ventana.`);
  const stop = async () => {
    await sim.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
