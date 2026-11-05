// QA visual de la sala guiada (agente 2). Uso: node qa-sala.mjs <repo>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
const require = createRequire(join(repo, 'mobile', 'package.json'));
const { chromium } = require('playwright');
const out = join(repo, 'QA', 'ciclo-ux-202611', 'sala', 'capturas');
mkdirSync(out, { recursive: true });
const BASE = 'http://127.0.0.1:8821/';
const GEO = { latitude: 40.4153, longitude: -3.6845, accuracy: 8 };
const north = (m) => ({ ...GEO, latitude: GEO.latitude + m / 111_195 });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [];
const log = (...a) => console.log(...a);

async function open(name, width, { grant = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, locale: 'es-ES', geolocation: GEO, ...(grant ? { permissions: ['geolocation'] } : {}) });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  return { name, context, page };
}
async function enter(p, url, act) {
  await p.page.goto(url);
  await p.page.fill('#f-name', p.name);
  if (await p.page.$('#f-adult')) await p.page.check('#f-adult');
  await p.page.click(`[data-act="${act}"]`);
  await p.page.waitForSelector('.code-card');
}
async function shot(p, file) {
  await p.page.bringToFront();
  await p.page.waitForTimeout(300);
  const h = await p.page.evaluate(() => document.documentElement.scrollHeight);
  log(`captura ${file}: alto ${h}px`);
  try {
    await p.page.screenshot({ path: join(out, file), fullPage: true });
  } catch (e) {
    log('  captura completa fallida, se toma la vista:', e.message.slice(0, 80));
    await p.page.screenshot({ path: join(out, file) });
  }
}
const text = (p, sel) => p.page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const waitText = (p, sel, re, timeout = 15_000) =>
  p.page.waitForFunction(([s, src]) => [...document.querySelectorAll(s)].some((e) => new RegExp(src).test(e.textContent)), [sel, re.source], { timeout });
async function noOverflow(p) {
  const o = await p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 0) errors.push(`${p.name}: desbordamiento horizontal de ${o}px`);
}
const check = (cond, msg) => {
  if (!cond) errors.push(`FALLO: ${msg}`);
  log(cond ? 'OK  ' : 'FALLO', msg);
};

// 1. Anfitrión sin permiso de ubicación: el autocentrado falla con un error comprensible y el botón para reintentar.
const host = await open('Ana', 360, { grant: false });
await enter(host, BASE, 'create');
await host.page.waitForSelector('.card .msg.danger', { timeout: 40_000 });
check(Boolean(await host.page.$('[data-act="center"]')), 'sin GPS: botón «Centrar la zona aquí» visible');
log('error de centrado:', await text(host, '.card .msg.danger'));
await shot(host, '01-anfitrion-sin-gps-360.png');
const code = await text(host, '.code');
log('código', code);

// 2. Jugador entra antes de que exista la configuración: no puede marcarse listo.
const beto = await open('Beto', 412);
await enter(beto, `${BASE}?sala=${code}`, 'join');
const readyDisabled = await beto.page.$eval('[data-act="ready"]', (b) => b.disabled);
check(readyDisabled, 'jugador sin zona: «Estoy listo» deshabilitado y explica la espera');
await shot(beto, '02-jugador-espera-zona-412.png');

// 3. El anfitrión concede el permiso y reintenta: zona centrada y configuración enviada.
await host.context.grantPermissions(['geolocation']);
await host.page.click('[data-act="center"]');
await host.page.waitForSelector('.cfg-summary', { timeout: 40_000 });
await waitText(beto, '.cfg-summary', /Clásico/);
check(!(await beto.page.$eval('[data-act="ready"]', (b) => b.disabled)), 'con zona fijada, el jugador ya puede pulsar «Estoy listo»');
await shot(host, '03-anfitrion-zona-centrada-360.png');

// 4. Entra un segundo jugador; los dos se marcan listos (comprobación de GPS).
const cris = await open('Cris', 360);
await enter(cris, `${BASE}?sala=${code}`, 'join');
for (const p of [beto, cris]) {
  await p.page.click('[data-act="ready"]');
  await waitText(p, '[data-act="ready"]', /No estoy listo/, 40_000);
}
await waitText(host, '.progress-text', /2 de 2 listos/);
check(!(await host.page.$eval('[data-act="start"]', (b) => b.disabled)), 'todos listos: «Empezar partida» habilitado sin pulsar «Estoy listo» el anfitrión');
await shot(host, '04-anfitrion-todos-listos-360.png');
await noOverflow(host);
await noOverflow(beto);

// 5. Cambio NO material: recentrar 20 m. Nadie pierde el «listo».
await host.context.setGeolocation(north(20));
await host.page.click('[data-act="center"]');
await host.page.waitForFunction(() => !document.querySelector('[data-act="center"]')?.disabled);
await host.page.waitForTimeout(800);
check((await text(beto, '[data-act="ready"]')) === 'No estoy listo', 'recentrar 20 m no quita el «listo» a Beto');
check((await text(cris, '[data-act="ready"]')) === 'No estoy listo', 'recentrar 20 m no quita el «listo» a Cris');

// 6. Cambio material: modo Infección (mín. 4). Los demás pierden el «listo» y ven qué ha cambiado.
await host.page.click('[data-act="edit-config"]');
await host.page.selectOption('#c-mode', 'infection');
await waitText(beto, '.msg.warn', /ha cambiado el modo/);
await waitText(host, '.blockers .msg', /Infección necesita al menos 4 jugadores/);
await waitText(host, '.progress-text', /0 de 2 listos/);
check(true, 'cambio material: quita el «listo» a los demás y el anfitrión ve el mínimo de Infección');
await shot(beto, '05-jugador-cambio-material-412.png');
await shot(host, '06-anfitrion-editar-infeccion-360.png');

// 7. Caza del zorro y 30 min de persecución; se vuelven a marcar listos.
await host.page.selectOption('#c-mode', 'fox_hunt');
await host.page.selectOption('#c-duration', '30');
await host.page.click('[data-act="edit-config"]');
await waitText(beto, '.cfg-summary', /Caza del zorro/);
await waitText(beto, '.cfg-summary', /30 min/);
for (const p of [beto, cris]) {
  await p.page.click('[data-act="ready"]');
  await waitText(p, '[data-act="ready"]', /No estoy listo/, 40_000);
}
await waitText(host, '.progress-text', /2 de 2 listos/);

// 8. Hoja de empezar: resumen, lista de seguridad, «Empezar ya» solo con la casilla marcada.
await host.page.click('[data-act="start"]');
await host.page.waitForSelector('.start-sheet');
check(await host.page.$eval('[data-act="start-now"]', (b) => b.disabled), '«Empezar ya» deshabilitado hasta confirmar la lista de seguridad');
await host.page.check('#start-safety');
await shot(host, '07-hoja-empezar-360.png');
await noOverflow(host);
await host.page.click('[data-act="start-now"]');
for (const p of [host, beto, cris]) await p.page.waitForSelector('.countdown', { timeout: 20_000 });
check(true, 'la partida empieza (cuenta atrás en los tres móviles): seguridad + GPS + listo del anfitrión + start');
await shot(beto, '08-cuenta-atras-412.png');

log('\nErrores de consola / fallos:', errors.length);
for (const e of errors) log(' -', e);
await browser.close();
process.exit(errors.length ? 1 : 0);
