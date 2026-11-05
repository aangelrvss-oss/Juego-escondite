// Capturas del Mission Report nuevo (preview.html) en Chrome headless a 360 y 412 px, con instantáneas reales.
// Sirve los archivos del repositorio desde un origen ficticio (sin servidor) y falla si hay errores de consola
// o desbordamiento horizontal. Uso: node QA/ciclo-ux-202611/mission-report/capturar.mjs
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../mobile/node_modules/playwright/index.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const ORIGIN = 'http://vista-previa.local';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const SHOTS = [
  ['clasico-todos-capturados', 'Ana', 360, true],
  ['clasico-todos-capturados', 'Eva', 412, false],
  ['infeccion-todos', 'Mario', 360, false],
  ['zorro-atrapado', 'Sara', 412, false],
  ['clasico-anfitrion', 'Hugo', 360, false],
  ['zorro-abandona', 'Tomás', 412, false],
  ['clasico-tiempo', 'Ximena', 360, false],
  ['infeccion-tiempo', 'Zoe', 412, false],
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let problems = 0;
try {
  for (const [caso, who, width, history] of SHOTS) {
    if (!existsSync(join(root, 'QA/ciclo-ux-202611/mission-report/instantaneas', `${caso}.json`))) {
      console.log(`- ${caso}: sin instantánea (no se jugó)`);
      continue;
    }
    const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(`${ORIGIN}/**`, (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = join(root, path);
      if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: 'no' });
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    });
    const url = `${ORIGIN}/QA/ciclo-ux-202611/mission-report/preview.html?caso=${caso}&jugador=${encodeURIComponent(who)}${history ? '&historial=1' : ''}`;
    await page.goto(url);
    await page.waitForSelector('body[data-listo="1"] [aria-label="Mission Report"]', { timeout: 10_000 });
    if (history) await page.click('.mr-history summary');
    await page.waitForTimeout(500); // animaciones de entrada
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const name = `${caso}-${who.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}-${width}.png`;
    await page.screenshot({ path: join(root, 'QA/ciclo-ux-202611/mission-report/capturas', name), fullPage: true });
    const ok = errors.length === 0 && overflow <= 0;
    if (!ok) problems++;
    console.log(`${ok ? '✔' : '✖'} ${name} · errores de consola: ${errors.length}${errors.length ? ` (${errors.join(' | ')})` : ''} · desbordamiento horizontal: ${overflow} px`);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(problems ? 1 : 0);
