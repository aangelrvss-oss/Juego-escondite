// Servidor de THE OUTRUN: HTTP (interfaz web y /health) + WebSocket en /ws.
// Uso: node server/main.ts            (PORT=8787, HOST=127.0.0.1 por defecto)
// Variables:
//   PORT, HOST          dónde escuchar. Por defecto solo en este ordenador (127.0.0.1): un túnel
//                       HTTPS se conecta a él. HOST=0.0.0.0 lo abre a la red local (decisión tuya).
//   ALLOWED_ORIGINS     orígenes web extra admitidos en /ws, separados por comas.
//   TRUST_PROXY=1       usar CF-Connecting-IP / X-Forwarded-For como dirección del cliente (solo
//                       detrás de un túnel o proxy de confianza).
//   LOG=1               registro de operaciones (sin nombres, coordenadas ni secretos).

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hub } from './hub.ts';
import type { HubOptions, UploadOutcome } from './hub.ts';
import { LIMITS, parseLocationUpload } from './protocol.ts';
import { acceptWebSocket, handshakeKey, rejectUpgrade } from './ws.ts';

// Orígenes de la app Capacitor (Android usa https://localhost; iOS, capacitor://localhost).
const APP_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost'];
const MAX_CONNECTIONS = 1_000; // holgado para decenas de salas de 20 jugadores
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
};

export interface ServerOptions {
  port?: number;
  host?: string;
  staticRoot?: string | null;
  allowedOrigins?: string[];
  trustProxy?: boolean;
  hub?: HubOptions;
  /** Tiempos del WebSocket (las pruebas los acortan). */
  ws?: { idleTimeoutMs?: number; pingIntervalMs?: number };
}

export interface RunningServer {
  url: string;
  hub: Hub;
  server: Server;
  /** Ejecuta ahora los plazos pendientes (las pruebas lo usan tras adelantar su reloj). */
  pump(): void;
  close(): Promise<void>;
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf;
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function originAllowed(origin: string | undefined, host: string | undefined, extra: readonly string[]): boolean {
  if (origin === undefined) return true; // clientes nativos o de pruebas: sin cabecera Origin
  if (APP_ORIGINS.includes(origin) || extra.includes(origin)) return true;
  // La propia interfaz web servida por este servidor (mismo host, directo o tras el túnel).
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Código HTTP de cada resultado de POST /api/loc (el servicio nativo decide con él si sigue enviando).
const UPLOAD_STATUS: Record<UploadOutcome, number> = { accepted: 204, ignored: 202, gone: 410, bad_session: 401, rate_limited: 429 };

/** Lee el cuerpo de una petición con un tope de bytes. null si se pasa del tope o la conexión falla. */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((done) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > maxBytes) {
      req.resume();
      return done(null);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        // Se responde 413 y se descarta el resto (el tiempo límite de la petición corta un envío sin fin).
        done(null);
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => done(size > maxBytes ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => done(null));
  });
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const hub = new Hub(options.hub);
  const extra = options.allowedOrigins ?? [];
  const trustProxy = options.trustProxy ?? false;
  const root = options.staticRoot === undefined ? fileURLToPath(new URL('../mobile/www/', import.meta.url)) : options.staticRoot;
  const rootAbs = root ? resolve(root) : null;

  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    const now = (options.hub?.now ?? Date.now)();
    const delay = Math.max(0, Math.min(1_000, hub.nextWakeAt() - now));
    timer = setTimeout(() => {
      hub.pump();
      schedule();
    }, delay);
    timer.unref?.();
  };

  const server = createServer((req, res) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end(); // URL mal formada: nunca debe tumbar el servidor
      return;
    }
    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...hub.stats() }));
      return;
    }
    if (path === '/api/loc') {
      // Envío nativo de la ubicación (servicio en primer plano de la app). Sin cabeceras CORS: un
      // navegador no puede usarlo desde otra web, y el propio cliente web envía por WebSocket.
      if (req.method !== 'POST') return void res.writeHead(405, { allow: 'POST' }).end();
      if (!originAllowed(req.headers.origin, req.headers.host, extra)) return void res.writeHead(403).end();
      if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return void res.writeHead(415).end();
      req.setTimeout(10_000, () => req.destroy());
      void readBody(req, LIMITS.maxUploadBytes).then((body) => {
        if (res.writableEnded) return;
        if (body === null) return void res.writeHead(413, { connection: 'close' }).end();
        const upload = parseLocationUpload(body);
        if (!upload) return void res.writeHead(400).end();
        res.writeHead(UPLOAD_STATUS[hub.uploadLocation(clientIp(req, trustProxy), upload)], { 'cache-control': 'no-store' }).end();
        schedule();
      });
      return;
    }
    if (!rootAbs || req.method !== 'GET') {
      res.writeHead(404).end();
      return;
    }
    const file = normalize(join(rootAbs, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(rootAbs + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  });

  const upgraded = new Set<Duplex>(); // sockets WebSocket: el servidor HTTP ya no los gestiona
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const key = handshakeKey(req);
    if (path !== '/ws' || !key) return rejectUpgrade(socket, 400, 'Bad Request');
    if (!originAllowed(req.headers.origin, req.headers.host, extra)) return rejectUpgrade(socket, 403, 'Forbidden');
    if (upgraded.size >= MAX_CONNECTIONS) return rejectUpgrade(socket, 503, 'Service Unavailable');
    const ws = acceptWebSocket(socket, key, head, {
      maxPayloadBytes: LIMITS.maxMessageBytes,
      maxBufferedBytes: 1_000_000,
      idleTimeoutMs: options.ws?.idleTimeoutMs ?? 75_000,
      pingIntervalMs: options.ws?.pingIntervalMs ?? 20_000,
    });
    const handle = hub.connect(ws, clientIp(req, trustProxy));
    upgraded.add(socket);
    socket.on('close', () => upgraded.delete(socket));
    ws.onMessage = (text) => {
      try {
        handle.receive(text);
      } catch (e) {
        // Un fallo inesperado afecta solo a esta conexión, nunca al resto de partidas. Se registra el
        // tipo de error (sin el mensaje recibido, que puede llevar datos privados).
        console.error(new Date().toISOString(), 'error interno al procesar un mensaje:', (e as Error).name, (e as Error).message);
        ws.close(1011, 'internal error');
      }
      schedule();
    };
    ws.onClose = () => {
      handle.closed();
      schedule();
    };
  });

  await new Promise<void>((done) => server.listen(options.port ?? 0, options.host ?? '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  schedule();
  return {
    url: `http://${options.host ?? '127.0.0.1'}:${port}`,
    hub,
    server,
    pump: () => {
      hub.pump();
      schedule();
    },
    close: () =>
      new Promise((done) => {
        if (timer) clearTimeout(timer);
        for (const socket of upgraded) socket.destroy();
        server.closeAllConnections?.();
        server.close(() => done());
      }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer({
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? '127.0.0.1',
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === '1',
    hub: { log: process.env.LOG === '1' ? (line) => console.log(new Date().toISOString(), line) : undefined },
  });
  console.log(`THE OUTRUN escuchando en ${running.url} (WebSocket en /ws, estado en /health)`);
}
