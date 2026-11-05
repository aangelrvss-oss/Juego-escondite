// Capturas REALES de la interfaz ACTUAL de THE OUTRUN para refrescar las imágenes de la guía (cierre del
// ciclo UX 2026-11). Servidor local (servidor-acelerado.mjs con factor 1 = reloj real), Chrome headless con
// geolocalización emulada y jugadores de prueba: unos en el navegador (los que se capturan) y otros
// scriptados con GameConnection (mobile/www/js/net.js) que envían ubicación y responden a las capturas.
// Guarda capturas de página completa (PNG, 360×740 CSS px a 2×) en ./capturas/<escena>-*.png.
// Uso: node QA/ciclo-ux-202611/cierre/guia/capturar.mjs <repo> <puerto> <classic|fox|infection>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [repo, port, scene] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, 'capturas');
mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(join(repo, 'mobile', 'package.json'))('playwright');
const { GameConnection } = await import(pathToFileURL(join(repo, 'mobile/www/js/net.js')).href);
const BASE = `http://127.0.0.1:${port}/`;
const C = { lat: 40.4153, lng: -3.6845 };
const off = (n, e) => ({ lat: C.lat + n / 111_320, lng: C.lng + e / (111_320 * Math.cos((C.lat * Math.PI) / 180)) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function until(f, what, ms = 30_000, step = 200) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await f();
      if (v) return v;
    } catch {}
    await sleep(step);
  }
  throw new Error(`tiempo agotado: ${what}`);
}
const mem = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

// ---------- jugadores scriptados
const fakes = [];
async function fake(name, pos) {
  const c = new GameConnection({ url: `ws://127.0.0.1:${port}/ws`, storage: mem() });
  c.start();
  await until(() => c.status === 'open', `${name} abierto`);
  const f = { name, c, pos, alive: true };
  f.loop = (async () => {
    let k = 0;
    while (f.alive) {
      k++;
      const d = (k % 2) * 1.2;
      c.sendLocation({ lat: f.pos.lat + d / 111_320, lng: f.pos.lng, accuracyM: 6, ageMs: 0, isMock: false });
      const pend = c.snapshot?.pendingClaimForMe;
      if (pend && f.accept && !f.answered?.has(pend.claimId)) {
        (f.answered ??= new Set()).add(pend.claimId);
        await c.command({ type: 'respond_tag', claimId: pend.claimId, accept: true });
        log(`${name} acepta la captura`);
      }
      await sleep(1500);
    }
  })();
  fakes.push(f);
  return f;
}
async function fakeJoin(f, code) {
  await f.c.join(code, f.name);
  await until(() => f.c.snapshot?.config, `${f.name} ve la config`);
  await sleep(2000);
  const r = await f.c.command({ type: 'set_ready', ready: true });
  log(`${f.name} listo`, r.ok, r.error ?? '');
}

// ---------- jugadores en el navegador
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const pages = [];
async function player(label, pos) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', geolocation: { latitude: pos.lat, longitude: pos.lng, accuracy: 6 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  const p = { label, ctx, page, pos, errors: [] };
  page.on('pageerror', (e) => p.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && p.errors.push(m.text().slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  pages.push(p);
  return p;
}
let jitter = true;
(async () => {
  let k = 0;
  while (jitter) {
    k++;
    for (const p of pages) await p.ctx.setGeolocation({ latitude: p.pos.lat + ((k % 2) * 1.2) / 111_320, longitude: p.pos.lng, accuracy: 6 }).catch(() => {});
    await sleep(2000);
  }
})();
async function shot(p, name, full = true) {
  const file = join(SHOTS, `${scene}-${name}.png`);
  await p.page.screenshot({ path: file, fullPage: full });
  log('captura', file);
}
async function enter(p, name, { create = false, code = null, mode = null } = {}) {
  await p.page.waitForSelector('#f-name');
  if (mode) await p.page.click(`label.mode.m-${mode}`);
  await p.page.fill('#f-name', name);
  if (await p.page.$('#f-adult')) await p.page.check('#f-adult');
  if (create) await p.page.click('[data-act="create"]');
  else {
    await p.page.fill('#f-code', code);
    await p.page.click('[data-act="join"]');
  }
  await p.page.waitForSelector('.code-card .code', { timeout: 20_000 });
}
async function setConfig(host, { radius, ping, mode }) {
  await host.page.click('[data-act="edit-config"]');
  if (mode) {
    await host.page.selectOption('#c-mode', mode);
    await sleep(800);
  }
  if (radius) {
    await host.page.selectOption('#c-radius', String(radius));
    await sleep(800);
  }
  if (ping) {
    await host.page.selectOption('#c-ping', String(ping));
    await sleep(800);
  }
  await host.page.click('[data-act="edit-config"]');
  await sleep(500);
}
async function pressReady(p) {
  await p.page.waitForSelector('[data-act="ready"]:not([disabled])', { timeout: 20_000 });
  await p.page.click('[data-act="ready"]');
  await until(async () => (await p.page.textContent('[data-act="ready"]')).trim() === 'No estoy listo', `${p.label} listo`);
}
async function assign(host, name, pref) {
  if (!(await host.page.$(`select[aria-label="Rol de ${name}"]`))) await host.page.click('[data-act="manage"]');
  await host.page.selectOption(`select[aria-label="Rol de ${name}"]`, pref);
  await sleep(600);
}
async function closeManage(host) {
  const b = await host.page.$('[data-act="manage"][aria-expanded="true"]');
  if (b) await b.click();
  await sleep(300);
}
async function start(host) {
  await host.page.waitForSelector('[data-act="start"]:not([disabled])', { timeout: 20_000 });
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  await host.page.click('[data-act="start-now"]');
}
const text = (p) => p.page.evaluate(() => document.body.innerText);
const dismiss = async (p) => {
  const r = await p.page.$('.overlay.reveal');
  if (r) await r.click().catch(() => {});
  await sleep(300);
};
async function claim(hunter, name) {
  const id = await until(() => hunter.page.$$eval('[data-claim]', (l, n) => l.find((x) => x.textContent.trim() === n)?.dataset.claim, name), `botón de captura de ${name}`, 60_000, 500);
  await hunter.page.click(`[data-claim="${id}"]`);
}

try {
  if (scene === 'classic') {
    const ana = await player('Ana', C);
    await sleep(1500);
    await shot(ana, '00-inicio-360');
    await enter(ana, 'Ana', { create: true });
    const code = (await ana.page.textContent('.code-card .code')).trim();
    await until(() => ana.page.$('[data-act="edit-config"]'), 'zona centrada');
    await sleep(800);
    await shot(ana, '01-sala-sola');
    await setConfig(ana, { radius: 100, ping: 2 });
    const beto = await fake('Beto', off(3, 2));
    beto.accept = true;
    await fakeJoin(beto, code);
    const caro = await player('Caro', off(-3, 2));
    await enter(caro, 'Caro', { code });
    await pressReady(caro);
    await until(async () => /2 de 2 listos/.test(await text(ana)), '2 de 2 listos');
    await sleep(4500);
    await ana.page.evaluate(() => scrollTo(0, 0));
    await shot(ana, '02-sala-anfitrion');
    await shot(caro, '02-sala-invitado');
    await assign(ana, 'Ana', 'hunter');
    await assign(ana, 'Beto', 'runner');
    await assign(ana, 'Caro', 'runner');
    await closeManage(ana);
    await start(ana);
    await until(() => caro.page.$('.countdown'), 'cuenta atrás');
    await sleep(300);
    await shot(caro, '03-cuenta-atras', false);
    await until(() => ana.page.$('.overlay.reveal'), 'revelación Ana', 20_000);
    await until(() => caro.page.$('.overlay.reveal'), 'revelación Caro', 20_000);
    await sleep(800);
    await shot(ana, '04-rol-cazador', false);
    await shot(caro, '04-rol-fugitivo', false);
    await dismiss(ana);
    await dismiss(caro);
    await sleep(1500);
    await shot(caro, '05-huida-fugitivo');
    await shot(ana, '05-huida-cazador');
    // corte de red del fugitivo durante la huida
    await caro.ctx.setOffline(true);
    await until(async () => /Sin conexión con el servidor/.test(await text(caro)), 'aviso sin conexión', 60_000, 500);
    await sleep(1500);
    await shot(caro, '06-sin-conexion');
    await caro.ctx.setOffline(false);
    await until(async () => !/Sin conexión con el servidor/.test(await text(caro)), 'reconectado', 60_000, 500);
    log('esperando el fin de la huida…');
    await until(() => ana.page.$('[data-claim]'), 'persecución (botones de captura)', 200_000, 1000);
    await dismiss(ana);
    await dismiss(caro);
    await sleep(1500);
    await shot(ana, '07-persecucion-cazador');
    // reclamación que el fugitivo rechaza (solo para la captura del aviso)
    await claim(ana, 'Caro');
    await until(() => caro.page.$('.claim-sheet'), 'hoja de reclamación', 15_000);
    await sleep(1200);
    await shot(caro, '08-reclamacion', false);
    await caro.page.click('[data-respond="no"]');
    log('esperando la primera pista…');
    await until(async () => /Nueva pista/.test(await text(ana)), 'nueva pista', 200_000, 500);
    await sleep(1200);
    await shot(ana, '09-pista-cazador');
    log('esperando la fase 1 de la zona…');
    await until(async () => /se cierra hasta/.test(await text(caro)), 'zona cerrándose', 400_000, 1000);
    await sleep(60_000);
    await shot(caro, '10-zona-fugitivo');
    await sleep(3500);
    await claim(ana, 'Beto');
    await until(async () => !(await ana.page.$$eval('[data-claim]', (l) => l.some((x) => x.textContent.trim() === 'Beto'))), 'Beto capturado', 30_000, 500);
    await sleep(3500);
    await claim(ana, 'Caro');
    await until(() => caro.page.$('.claim-sheet'), 'hoja de reclamación 2', 15_000);
    await caro.page.click('[data-respond="yes"]');
    await until(() => ana.page.$('.card.result'), 'informe', 30_000);
    await sleep(2500);
    await shot(ana, '11-informe-cazador');
    await shot(caro, '11-informe-fugitivo');
  } else if (scene === 'fox') {
    const ana = await player('Ana', C);
    await enter(ana, 'Ana', { create: true, mode: 'fox_hunt' });
    const code = (await ana.page.textContent('.code-card .code')).trim();
    await until(() => ana.page.$('[data-act="edit-config"]'), 'zona centrada');
    await setConfig(ana, { ping: 2 });
    const beto = await fake('Beto', off(4, -2));
    await fakeJoin(beto, code);
    const zoe = await player('Zoe', off(-3, 2));
    await enter(zoe, 'Zoe', { code });
    await pressReady(zoe);
    await until(async () => /2 de 2 listos/.test(await text(ana)), '2 de 2 listos');
    await assign(ana, 'Ana', 'hunter');
    await assign(ana, 'Beto', 'hunter');
    await assign(ana, 'Zoe', 'runner');
    await closeManage(ana);
    await start(ana);
    await until(() => ana.page.$('.overlay.reveal'), 'revelación Ana', 30_000);
    await until(() => zoe.page.$('.overlay.reveal'), 'revelación Zoe', 30_000);
    await sleep(800);
    await shot(ana, '02-rol-cazador', false);
    await shot(zoe, '02-rol-zorro', false);
    await dismiss(ana);
    await dismiss(zoe);
    log('esperando el fin de la huida…');
    await until(async () => /Empieza la persecución|Persecución/i.test(await text(zoe)) && (await ana.page.$('[data-claim]')), 'persecución', 200_000, 1000);
    await sleep(6000);
    await shot(zoe, '03-zorro-ve');
    await shot(ana, '03-persecucion-cazador');
    log('esperando la pista…');
    await until(async () => /Nueva pista/.test(await text(ana)), 'nueva pista', 200_000, 500);
    await sleep(1200);
    await shot(ana, '04-pista-cazador');
  } else if (scene === 'infection') {
    const ana = await player('Ana', C);
    await enter(ana, 'Ana', { create: true, mode: 'infection' });
    const code = (await ana.page.textContent('.code-card .code')).trim();
    await until(() => ana.page.$('[data-act="edit-config"]'), 'zona centrada');
    const cris = await fake('Cris', off(4, -2));
    await fakeJoin(cris, code);
    const dani = await fake('Dani', off(-4, -2));
    await fakeJoin(dani, code);
    const beto = await player('Beto', off(-3, 2));
    await enter(beto, 'Beto', { code });
    await pressReady(beto);
    await until(async () => /3 de 3 listos/.test(await text(ana)), '3 de 3 listos');
    await assign(ana, 'Ana', 'hunter');
    for (const n of ['Beto', 'Cris', 'Dani']) await assign(ana, n, 'runner');
    await closeManage(ana);
    await start(ana);
    await until(() => beto.page.$('.overlay.reveal'), 'revelación Beto', 30_000);
    await sleep(800);
    await dismiss(ana);
    await dismiss(beto);
    log('esperando el fin de la huida…');
    await until(() => ana.page.$('[data-claim]'), 'persecución', 200_000, 1000);
    await dismiss(ana);
    await dismiss(beto);
    await sleep(1500);
    await claim(ana, 'Beto');
    await until(() => beto.page.$('.claim-sheet'), 'reclamación a Beto', 15_000);
    await beto.page.click('[data-respond="yes"]');
    await until(() => beto.page.$('.overlay.reveal'), 'tarjeta de infectado', 15_000);
    await sleep(1200);
    await shot(beto, '02-infectado', false);
  }
} catch (e) {
  console.error('ERROR', e.message);
  for (const p of pages) await shot(p, `error-${p.label}`).catch(() => {});
  process.exitCode = 1;
} finally {
  jitter = false;
  for (const p of pages) log(`errores de página ${p.label}:`, p.errors.length, p.errors.slice(0, 3));
  for (const f of fakes) {
    f.alive = false;
    f.c.close();
  }
  await browser.close();
  writeFileSync(join(SHOTS, `${scene}-ok.txt`), process.exitCode ? 'error' : 'ok');
  setTimeout(() => process.exit(), 300);
}
