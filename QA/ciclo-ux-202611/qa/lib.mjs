// QA independiente (agente 6) · utilidades e2e con Playwright + Chrome headless contra un servidor LOCAL.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('../../../mobile/node_modules/playwright');

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SHOTS = join(HERE, 'capturas');
export const LOGS = join(HERE, 'registros');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(LOGS, { recursive: true });

export const MADRID = { lat: 40.4153, lng: -3.6845 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function offset(p, northM = 0, eastM = 0) {
  return { lat: p.lat + northM / 111_320, lng: p.lng + eastM / (111_320 * Math.cos((p.lat * Math.PI) / 180)) };
}

export function makeRecorder(name) {
  const results = [];
  const file = join(LOGS, `${name}.log`);
  writeFileSync(file, '');
  const log = (...a) => {
    const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    console.log(line);
    appendFileSync(file, line + '\n');
  };
  const check = (id, ok, detail = '') => {
    results.push({ id, ok: Boolean(ok), detail });
    log(`${ok ? 'PASA' : 'FALLA'} · ${id}${detail ? ` · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
    return ok;
  };
  const save = () => writeFileSync(join(LOGS, `${name}.json`), JSON.stringify(results, null, 2));
  return { results, log, check, save };
}

export async function launch() {
  return chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
}

/** Jugador = contexto de navegador propio (almacenamiento propio) con geolocalización emulada. */
export async function newPlayer(browser, base, { label, width = 360, height = 740, pos = MADRID } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    geolocation: { latitude: pos.lat, longitude: pos.lng, accuracy: 8 },
    permissions: ['geolocation'],
  });
  await context.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write'], { origin: base });
  // Compartir: se intercepta el texto (navigator.share y el portapapeles) para revisarlo.
  await context.addInitScript(() => {
    window.__shared = [];
    try {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => void window.__shared.push({ via: 'share', ...d }) });
    } catch {}
    try {
      const cb = navigator.clipboard;
      if (cb) cb.writeText = async (t) => void window.__shared.push({ via: 'clipboard', text: t });
    } catch {}
  });
  const p = { label, context, width, errors: [], console: [], page: null, pos };
  await openPage(p, base);
  return p;
}

export async function openPage(p, url) {
  const page = await p.context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') p.console.push(`[${m.type()}] ${m.text()}`.slice(0, 400));
    if (m.type() === 'error') p.errors.push(`console: ${m.text()}`.slice(0, 400));
  });
  page.on('response', (r) => {
    if (r.status() >= 400) p.console.push(`[http ${r.status()}] ${r.url().replace(/key=[^&]+/, 'key=…')}`.slice(0, 300));
  });
  page.on('pageerror', (e) => p.errors.push(`pageerror: ${e.message}`.slice(0, 400)));
  page.on('dialog', (d) => {
    p.errors.push(`dialog inesperado: ${d.message()}`);
    d.dismiss();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  p.page = page;
  return page;
}

export async function setPos(p, pos) {
  p.pos = pos;
  await p.context.setGeolocation({ latitude: pos.lat, longitude: pos.lng, accuracy: 8 });
}

export async function until(fn, what, ms = 20_000, step = 150) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(step);
  }
  throw new Error(`tiempo agotado: ${what}${last instanceof Error ? ` (${last.message})` : ''}`);
}

/** Rellena el formulario de inicio y crea o se une. */
export async function enterHome(p, { name, code = null, create = false, mode = null }) {
  const page = p.page;
  await page.waitForSelector('#f-name');
  if (mode) await page.click(`label.mode.m-${mode}`);
  await page.fill('#f-name', name);
  if (await page.$('#f-adult')) await page.check('#f-adult');
  if (create) await page.click('[data-act="create"]');
  else {
    if (code !== null) await page.fill('#f-code', code);
    await page.click('[data-act="join"]');
  }
  await page.waitForSelector('.code-card .code', { timeout: 20_000 });
}

export const codeOf = (p) => p.page.textContent('.code-card .code').then((t) => t.trim());

/** Filas de jugadores de la sala: nombre → estado mostrado. */
export async function rows(p) {
  return p.page.$$eval('ul.players li.player', (lis) =>
    lis.map((li) => ({
      name: li.querySelector('.pname')?.childNodes[0]?.textContent?.trim(),
      state: li.querySelector('.pstate')?.textContent?.trim(),
      off: li.classList.contains('off'),
      html: li.querySelector('.pname')?.innerHTML,
    })),
  );
}
export async function stateOf(p, name) {
  return (await rows(p)).find((r) => r.name === name)?.state ?? null;
}

export async function pressReady(p) {
  await p.page.waitForSelector('[data-act="ready"]:not([disabled])', { timeout: 20_000 });
  const label = (await p.page.textContent('[data-act="ready"]')).trim();
  if (label !== 'Estoy listo') throw new Error(`botón listo inesperado: ${label}`);
  await p.page.click('[data-act="ready"]');
  await until(async () => (await p.page.textContent('[data-act="ready"]')).trim() === 'No estoy listo', `${p.label} listo`);
}

export async function netStatus(p) {
  return p.page.$eval('.net', (e) => e.textContent.trim()).catch(() => null);
}

/** Desbordamiento horizontal de la página. */
export async function overflowX(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const over = d.scrollWidth - d.clientWidth;
    const culprits = over > 0 ? [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`) : [];
    return { over, culprits };
  });
}

/** Objetivos táctiles visibles de menos de 44 px (alto o ancho) dentro de `scope`. */
export async function smallTargets(page, scope = 'body') {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope);
    if (!root) return [];
    const out = [];
    for (const el of root.querySelectorAll('button, a[href], input, select, summary, [role="button"]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      // casillas: se mide la etiqueta que las envuelve
      let box = r;
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const lab = el.closest('label');
        if (lab) box = lab.getBoundingClientRect();
      }
      if (box.height < 44 || box.width < 44) out.push({ el: `${el.tagName.toLowerCase()}${el.dataset.act ? `[${el.dataset.act}]` : ''}${el.className ? '.' + String(el.className).split(' ').join('.') : ''}`, text: (el.textContent || el.value || '').trim().slice(0, 40), w: Math.round(box.width), h: Math.round(box.height) });
    }
    return out;
  }, scope);
}

export async function shot(p, name) {
  await p.page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});
}
