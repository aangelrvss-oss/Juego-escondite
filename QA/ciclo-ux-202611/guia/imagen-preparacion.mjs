// Imagen del paso 3 de la guía con la sala guiada nueva (captura real de la interfaz, servidor local y
// jugadores de prueba). Uso: node QA/ciclo-ux-202611/guia/imagen-preparacion.mjs <repo> <puerto>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [repo, port] = process.argv.slice(2);
const { chromium } = createRequire(join(repo, 'mobile', 'package.json'))('playwright');
const { GameConnection } = await import(pathToFileURL(join(repo, 'mobile/www/js/net.js')).href);
const BASE = `http://127.0.0.1:${port}/`;
const GEO = { latitude: 40.4153, longitude: -3.6845, accuracy: 8 };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const wait = async (f) => { for (let i = 0; i < 200; i++) { if (await f()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error('tiempo agotado'); };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', geolocation: GEO, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);
await page.fill('#f-name', 'Ana');
if (await page.$('#f-adult')) await page.check('#f-adult');
await page.click('[data-act="create"]');
await page.waitForSelector('.code-card');
const code = (await page.textContent('.code-card .code')).trim();
await page.waitForFunction(() => /500 m/.test(document.body.textContent));
const guests = [];
for (const name of ['Beto', 'Cris']) {
  const c = new GameConnection({ url: `ws://127.0.0.1:${port}/ws`, storage: mem() });
  c.start();
  await wait(() => c.status === 'open');
  await c.join(code, name);
  await wait(() => c.snapshot?.config);
  await c.command({ type: 'set_ready', ready: true });
  guests.push(c);
}
await page.waitForFunction(() => /2 de 2 listos/.test(document.body.textContent));
await page.waitForTimeout(4500); // que pasen los avisos «ha entrado»
// Encuadre: desde la lista de jugadores hasta «Empezar partida».
const box = await page.evaluate(() => {
  const players = [...document.querySelectorAll('section.card')].find((s) => /Jugadores/.test(s.querySelector('h2')?.textContent ?? ''));
  players.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -8);
  return players.getBoundingClientRect().height;
});
await page.waitForTimeout(400);
const png = await page.screenshot({ clip: { x: 0, y: 0, width: 360, height: 407.5 } });
const webp = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 815;
  c.getContext('2d').drawImage(img, 0, 0, 720, 815);
  return c.toDataURL('image/webp', 0.78).split(',')[1];
}, png.toString('base64'));
writeFileSync(join(repo, 'mobile/www/guia/preparacion.webp'), Buffer.from(webp, 'base64'));
writeFileSync(join(repo, 'QA/ciclo-ux-202611/guia/capturas/preparacion-sala-guiada.png'), png);
console.log('jugadores', box, 'px · errores de página', errors.length);
for (const c of guests) c.close();
await browser.close();
setTimeout(() => process.exit(0), 200);
