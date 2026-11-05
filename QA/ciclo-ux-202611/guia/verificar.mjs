// Verifica la guía en Chrome headless: 4 tamaños × 4 modos × 12 pasos. Comprueba errores de consola,
// imágenes cargadas, sin desbordamiento horizontal, cierre y navegación visibles, objetivos ≥ 44 px,
// Escape y navegación con botones. Guarda unas pocas capturas en capturas/.
// Uso: node QA/ciclo-ux-202611/guia/verificar.mjs [base=http://127.0.0.1:8822]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const { chromium } = createRequire(join(root, 'mobile/package.json'))('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:8822';
const shots = join(here, 'capturas');
mkdirSync(shots, { recursive: true });

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x740', width: 360, height: 740 },
  { name: '412x915', width: 412, height: 915 },
  { name: '360x640', width: 360, height: 640 },
];
const MODES = ['', 'classic', 'infection', 'fox_hunt'];
const SHOTS = new Set(['320x568|classic|0', '360x740|classic|6', '360x740|fox_hunt|5', '412x915|infection|7', '360x640|classic|11', '360x640|classic|2', '320x568|fox_hunt|11']);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const problems = [];
const errors = [];
let checks = 0;
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${vp.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${vp.name}: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${vp.name}: HTTP ${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => errors.push(`${vp.name}: falló ${r.url()}`));
  for (const mode of MODES) {
    await page.goto(`${base}/QA/ciclo-ux-202611/guia/preview.html?mode=${mode}&context=${mode === 'infection' ? 'game' : 'home'}`);
    for (let i = 0; i < 12; i++) {
      if (i > 0) await page.click('[data-act="guide-next"]');
      await page.waitForFunction(() => { const img = document.querySelector('.guide-img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => problems.push(`${vp.name} ${mode} paso ${i}: imagen sin cargar`));
      const r = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, bt: b.bottom }; };
        const visible = (b) => b && b.x >= 0 && b.y >= 0 && b.r <= vw + 0.5 && b.bt <= vh + 0.5;
        const small = [...document.querySelectorAll('.guide-overlay button')].filter((b) => b.offsetParent !== null).map((b) => { const r = b.getBoundingClientRect(); return { a: b.dataset.act, w: r.width, h: r.height }; }).filter((b) => b.w < 43.5 || b.h < 43.5);
        const body = document.querySelector('.guide-body');
        return {
          count: document.querySelector('.guide-count')?.textContent,
          overflowX: document.documentElement.scrollWidth > vw || body.scrollWidth > body.clientWidth,
          close: visible(box('[data-act="guide-close"]')),
          next: visible(box('.guide-next')),
          prev: visible(box('[data-act="guide-prev"]')),
          img: box('.guide-img'),
          small,
          bodyScroll: body.scrollHeight > body.clientHeight,
          dialog: document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
        };
      });
      checks++;
      const where = `${vp.name} ${mode || 'general'} paso ${i + 1}`;
      if (r.count !== `Paso ${i + 1} de 12`) problems.push(`${where}: indicador «${r.count}»`);
      if (r.overflowX) problems.push(`${where}: desbordamiento horizontal`);
      if (!r.close || !r.next || !r.prev) problems.push(`${where}: botón fuera de la pantalla (cerrar ${r.close}, sig ${r.next}, ant ${r.prev})`);
      if (r.small.length) problems.push(`${where}: objetivos < 44 px ${JSON.stringify(r.small)}`);
      if (!r.dialog) problems.push(`${where}: sin role=dialog`);
      if (!r.img || r.img.h < 80) problems.push(`${where}: imagen demasiado pequeña ${JSON.stringify(r.img)}`);
      const key = `${vp.name}|${mode}|${i}`;
      if (SHOTS.has(key)) await page.screenshot({ path: join(shots, `guia-${vp.name}-${mode}-paso${String(i + 1).padStart(2, '0')}.png`) });
    }
    // Último paso: «Entendido» cierra y el foco vuelve al botón que abre la guía.
    const label = await page.textContent('.guide-next');
    if (label !== 'Entendido') problems.push(`${vp.name} ${mode}: último botón «${label}»`);
    await page.click('.guide-next');
    if (await page.$('.guide-overlay')) problems.push(`${vp.name} ${mode}: «Entendido» no cierra`);
    const focus = await page.evaluate(() => document.activeElement?.dataset?.act);
    if (focus !== 'guide-open') problems.push(`${vp.name} ${mode}: foco tras cerrar en ${focus}`);
    // Reabrir, ir con un punto al paso 9, volver atrás y cerrar con Escape.
    await page.click('[data-act="guide-open"]');
    if (vp.height > 520) {
      await page.click('[data-act="guide-goto"][data-step="8"]');
      if ((await page.textContent('.guide-count')) !== 'Paso 9 de 12') problems.push(`${vp.name} ${mode}: punto 9`);
    }
    await page.click('[data-act="guide-prev"]').catch(() => {});
    await page.keyboard.press('Escape');
    if (await page.$('.guide-overlay')) problems.push(`${vp.name} ${mode}: Escape no cierra`);
  }
  // Ayuda contextual: abrir en el paso de la conexión.
  await page.goto(`${base}/QA/ciclo-ux-202611/guia/preview.html?mode=classic&context=game&topic=connection`);
  if ((await page.textContent('.guide-count')) !== 'Paso 11 de 12') problems.push(`${vp.name}: topic=connection`);
  if (vp.name === '360x740') await page.screenshot({ path: join(shots, 'guia-360x740-ayuda-conexion-en-partida.png') });
  await ctx.close();
}
// Movimiento reducido: sin animación.
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();
await p.goto(`${base}/QA/ciclo-ux-202611/guia/preview.html`);
const motion = await p.evaluate(() => ({
  anim: getComputedStyle(document.querySelector('.guide-panel')).animationName,
  trans: getComputedStyle(document.querySelector('.guide-dot span')).transitionDuration,
}));
if (motion.anim !== 'none' || !/^0s(, 0s)*$/.test(motion.trans)) problems.push(`reduced-motion: ${JSON.stringify(motion)}`);
// Contraste AA (texto normal ≥ 4,5:1) de cada texto del overlay sobre su fondo efectivo.
const contrast = await p.evaluate(() => {
  const rgb = (s) => s.match(/[\d.]+/g).slice(0, 4).map(Number);
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0.5) return c; } return [10, 11, 13]; };
  return ['.guide-kicker', '.guide-count', '.guide-title', '.guide-text', '.guide-close', '.guide-prev', '.guide-next'].map((s) => {
    const el = document.querySelector(s);
    const fg = rgb(getComputedStyle(el).color), bg = bgOf(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return { s, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 };
  });
});
for (const c of contrast) if (c.ratio < 4.5) problems.push(`contraste ${c.s}: ${c.ratio}`);
console.log('contraste:', contrast.map((c) => `${c.s} ${c.ratio}`).join(' · '));
await browser.close();

const result = { checks, consoleErrors: errors, problems };
writeFileSync(join(here, 'verificacion.json'), JSON.stringify(result, null, 2));
console.log(`comprobaciones de paso: ${checks} · errores de consola: ${errors.length} · problemas: ${problems.length}`);
for (const x of [...errors, ...problems]) console.log(' -', x);
