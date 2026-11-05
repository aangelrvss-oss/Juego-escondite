// Cierre del ciclo UX (05/11/2026) · rehace las dos imágenes de la guía que mostraban la interfaz antigua
// (auditoría R2, AF-09): `sala-codigo.webp` (sala de espera) y `final.webp` (Mission Report). Capturas REALES
// de la interfaz actual: Chrome headless con una sola página (la anfitriona, Ana) y dos jugadores por
// programa (GameConnection de net.js), contra un servidor LOCAL con el reloj acelerado. Las originales se
// copian antes en anteriores/. Una sola página para no agotar la memoria de la máquina.
// Uso: node QA/ciclo-ux-202611/cierre/guia/imagenes-cierre.mjs <repo> <puerto>
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [repo, port] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(repo, 'mobile', 'package.json'))('playwright');
const { GameConnection } = await import(pathToFileURL(join(repo, 'mobile/www/js/net.js')).href);
const BASE = `http://127.0.0.1:${port}/`;
const GEO = { latitude: 40.4153, longitude: -3.6845, accuracy: 8 };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const wait = async (f, what = 'condición', ms = 30_000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`tiempo agotado: ${what}`);
};
const guia = join(repo, 'mobile/www/guia');
const shots = join(here, 'capturas');
mkdirSync(shots, { recursive: true });
mkdirSync(join(here, 'anteriores'), { recursive: true });
const manifest = [];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu', '--renderer-process-limit=1'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', geolocation: GEO, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Recorta `clip` (px CSS) de la página, lo guarda en PNG y en WebP de 720 px (calidad 0,78, como la guía). */
async function save(out, clip, reason) {
  const png = await page.screenshot({ clip });
  writeFileSync(join(shots, `${out}.png`), png);
  const h = Math.round(clip.height * 2);
  const webp = await page.evaluate(async ([b64, h]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, 720, h);
    return c.toDataURL('image/webp', 0.78).split(',')[1];
  }, [png.toString('base64'), h]);
  copyFileSync(join(guia, `${out}.webp`), join(here, 'anteriores', `${out}.webp`));
  writeFileSync(join(guia, `${out}.webp`), Buffer.from(webp, 'base64'));
  manifest.push({ out, size: [720, h], bytes: statSync(join(guia, `${out}.webp`)).size, src: `capturas/${out}.png`, clip, reason });
}

/** Coloca `selector` arriba de la pantalla (8 px de margen) y devuelve el recorte desde ahí. */
async function clipFrom(selector, height) {
  await page.evaluate((sel) => {
    document.querySelector(sel).scrollIntoView({ block: 'start' });
    window.scrollBy(0, -8);
  }, selector);
  await page.waitForTimeout(400);
  return { x: 0, y: 0, width: 360, height };
}

await page.goto(BASE);
await page.fill('#f-name', 'Ana');
if (await page.$('#f-adult')) await page.check('#f-adult');
await page.click('[data-act="create"]');
await page.waitForSelector('.code-card');
const code = (await page.textContent('.code-card .code')).trim();
await page.waitForSelector('[data-act="edit-config"]'); // zona centrada sola
const guests = [];
for (const name of ['Beto', 'Cris']) {
  const c = new GameConnection({ url: `ws://127.0.0.1:${port}/ws`, storage: mem() });
  c.start();
  await wait(() => c.status === 'open', 'conexión');
  await c.join(code, name);
  await wait(() => c.snapshot?.config, 'configuración');
  await c.command({ type: 'set_team_pref', pref: 'runner' });
  guests.push(c);
}
await page.waitForFunction(() => document.querySelectorAll('.players li, .player-row, [data-player]').length >= 3 || /3\/20/.test(document.body.textContent));
await guests[0].command({ type: 'set_ready', ready: true });
await page.waitForTimeout(4500); // que pasen los avisos «ha entrado»

// 1 · sala-codigo: el código para invitar y la lista de jugadores, tal como la ve el anfitrión.
await save('sala-codigo', await clipFrom('.code-card', 380), 'AF-09: la sala de espera cambió (pasos, «Invita · código de la sala», roles en «Gestionar jugadores», el anfitrión como «Anfitrión»)');

// 2 · final: partida Clásica en la que Ana (cazadora) captura a los dos fugitivos.
await guests[1].command({ type: 'set_ready', ready: true });
await page.waitForSelector('[data-act="start"]:not([disabled])');
await page.click('[data-act="start"]');
await page.waitForSelector('.start-sheet');
if (!(await page.isChecked('#start-safety'))) await page.check('#start-safety');
await page.click('[data-act="start-now"]');
await wait(() => guests.every((c) => c.snapshot?.phase === 'ACTIVE'), 'persecución', 60_000);
const hunterId = guests[0].snapshot.hostId;
for (const c of guests) {
  const r = await c.command({ type: 'self_tag', hunterId });
  if (!r.ok) throw new Error(`self_tag: ${JSON.stringify(r)}`);
  await new Promise((r) => setTimeout(r, 1500));
}
await page.waitForSelector('.mr');
await page.waitForTimeout(4500);
await save('final', await clipFrom('.result-me', 490), 'AF-09: el Mission Report cambió (cuarta cifra, «Partida de X en total», etiquetas, rendimiento)');

writeFileSync(join(here, 'imagenes-cierre.json'), JSON.stringify({ date: '2026-11-05', server: 'local, reloj acelerado', pageErrors: errors, images: manifest }, null, 2));
console.log(JSON.stringify(manifest.map((m) => [m.out, m.size, m.bytes])), 'errores de página', errors.length);
for (const c of guests) c.close();
await browser.close();
setTimeout(() => process.exit(0), 200);
