// Servidor estático mínimo para la vista previa de la guía (raíz = repositorio). Solo lectura, 127.0.0.1.
// Uso: node QA/ciclo-ux-202611/guia/servidor.mjs [puerto=8822]
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const port = Number(process.argv[2] ?? 8822);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if (!statSync(file).isFile()) throw new Error('no');
  } catch {
    return res.writeHead(404).end('404');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=60' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/QA/ciclo-ux-202611/guia/preview.html`));
