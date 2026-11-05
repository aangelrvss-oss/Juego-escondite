// Bytes que descarga un navegador al abrir el juego (servidor LOCAL propio, nunca producción).
// Sigue index.html (src/href) y los import de los módulos JS, y suma lo que sirve el servidor tal cual
// (sin compresión: server/main.ts no comprime; y envía cache-control: no-store, así que se repite en cada carga).
// Uso: node QA/ciclo-ux-202611/infra/scripts/peso-pagina.mjs [--puerto 8811]
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const i = process.argv.indexOf('--puerto');
const PUERTO = Number(i > 0 ? process.argv[i + 1] : 8811);
if (PUERTO < 8811 || PUERTO > 8819) throw new Error('puerto fuera de 8811–8819');
const BASE = `http://127.0.0.1:${PUERTO}`;
const env = { ...process.env, PORT: String(PUERTO), HOST: '127.0.0.1' };
delete env.STATE_FILE;
const server = spawn(process.execPath, ['server/main.ts'], { cwd: repo, env, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (;;) {
  try {
    if ((await fetch(`${BASE}/health`)).ok) break;
  } catch {}
  await sleep(50);
}
const vistos = new Map();
const cola = ['/'];
while (cola.length) {
  const path = cola.shift();
  if (vistos.has(path)) continue;
  const r = await fetch(BASE + path);
  const buf = Buffer.from(await r.arrayBuffer());
  vistos.set(path, { status: r.status, bytes: buf.length, cache: r.headers.get('cache-control'), enc: r.headers.get('content-encoding') });
  if (!r.ok) continue;
  const text = /\.(js|html|css)$|\/$/.test(path) ? buf.toString('utf8') : '';
  const refs = [
    ...text.matchAll(/(?:src|href)="([^"#?]+)"/g),
    ...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
  ].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|data:|mailto:)/.test(ref)) continue;
    const abs = new URL(ref, BASE + path).pathname;
    if (!vistos.has(abs)) cola.push(abs);
  }
}
let total = 0;
for (const [p, v] of vistos) {
  if (v.status === 200) total += v.bytes;
  console.log(`${String(v.status).padEnd(4)} ${String(v.bytes).padStart(9)}  ${p}  cache=${v.cache} enc=${v.enc ?? '-'}`);
}
console.log(`\nTotal servido (HTTP 200): ${total} bytes = ${(total / 1024 / 1024).toFixed(2)} MiB en ${[...vistos.values()].filter((v) => v.status === 200).length} archivos`);
console.log('Nota: el worker de MapLibre (maplibre-gl-worker.js) se descarga aparte si el mapa lo pide; se suma abajo.');
const w = await fetch(`${BASE}/vendor/maplibre-gl/maplibre-gl-worker.js`);
const wb = (await w.arrayBuffer()).byteLength;
console.log(`worker: HTTP ${w.status}, ${wb} bytes → total con worker ${((total + (vistos.has('/vendor/maplibre-gl/maplibre-gl-worker.js') ? 0 : wb)) / 1024 / 1024).toFixed(2)} MiB`);
server.kill();
process.exit(0);
