// Pantalla de inicio (rediseño del 30/10/2026, D-057 §4) en el navegador real (Chromium de Playwright)
// contra el servidor real, a 360×740 y a 1280×800. Comprueba y fotografía:
//   - sin desbordamiento, controles de 44 px o más, texto de 12 px o más, un solo h1 (en inglés);
//   - solo los modos jugables, seleccionables, con su descripción; el modo elegido pasa a la sala;
//   - error de edad junto a su casilla (role=alert, aria-invalid);
//   - reglas antes de entrar (hoja), invitación con un solo botón principal;
//   - pegar el enlace de invitación entero en el código; dos toques en «Crear partida» = una sala;
//   - sin animaciones con «reducir movimiento».
// Sin MapTiler. Uso (en mobile/): node e2e/inicio.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startServer } from '../../server/main.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const server = await startServer({});
let passed = 0;
const ok = (text) => console.log(`ok · ${text} (${++passed})`);

const LAYOUT = () => {
  const issues = [];
  if (document.documentElement.scrollWidth > innerWidth) issues.push(`desborda: ${document.documentElement.scrollWidth}`);
  for (const el of document.querySelectorAll('button, select, input:not([type=checkbox]):not([type=radio]), a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.height < 44) issues.push(`control de ${Math.round(r.height)}px: ${el.id || el.textContent.trim().slice(0, 30)}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement.checkVisibility?.()) continue;
    const size = parseFloat(getComputedStyle(n.parentElement).fontSize);
    if (size < 12) issues.push(`texto de ${size}px: ${n.textContent.trim().slice(0, 30)}`);
  }
  const h1 = document.querySelectorAll('h1');
  if (h1.length !== 1 || h1[0].lang !== 'en') issues.push('h1');
  return issues;
};

const browser = await chromium.launch();
const errors = [];
try {
  for (const [w, h, tag] of [[360, 740, 'movil-360'], [1280, 800, 'escritorio-1280']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'es-ES', isMobile: w < 500, hasTouch: w < 500, permissions: ['geolocation'], geolocation: { latitude: 40.4153, longitude: -3.6845, accuracy: 6 } });
    await ctx.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(server.url);
    await page.waitForSelector('#home-form');
    await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(LAYOUT), [], tag);
    const modes = await page.$$eval('input[name=home-mode]', (r) => r.map((x) => x.value));
    assert.deepEqual(modes, ['classic', 'infection', 'fox_hunt']);
    assert.equal(await page.getByText('Próximamente').count(), 0);
    if (shots) await page.screenshot({ path: `${shots}/inicio-${tag}.png` });
    ok(`${tag}: sin desbordamiento, controles ≥ 44 px, texto ≥ 12 px, un solo h1; tres modos jugables y ninguno «Próximamente»`);

    // Modo: la descripción cambia y las reglas son las de ese modo.
    await page.click('#m-fox_hunt');
    await page.waitForFunction(() => /Caza del zorro/.test(document.querySelector('.mode-detail')?.textContent ?? ''));
    await page.click('[data-act=rules]');
    await page.waitForSelector('.rules-sheet');
    assert.match(await page.locator('.rules-sheet').textContent(), /posición exacta del zorro/);
    if (shots) await page.screenshot({ path: `${shots}/inicio-reglas-${tag}.png` });
    await page.click('.rules-sheet [data-act=close-sheet]');
    ok(`${tag}: al elegir un modo cambian la descripción y las reglas`);

    // Error de edad junto a la casilla.
    await page.fill('#f-name', 'Ana');
    await page.click('[data-act=create]');
    await page.waitForSelector('#err-adult[role=alert]');
    assert.equal(await page.getAttribute('#f-adult', 'aria-invalid'), 'true');
    assert.match(await page.locator('.msg.danger').first().textContent(), /18 años/);
    if (shots) await page.screenshot({ path: `${shots}/inicio-error-${tag}.png` });
    ok(`${tag}: sin la edad no se crea la sala; el aviso va junto a la casilla y se anuncia`);

    // Dos toques seguidos: una sola sala, y en la sala está el modo elegido.
    const before = server.hub.exportState().rooms.length;
    await page.check('#f-adult');
    await page.evaluate(() => {
      const b = document.querySelector('[data-act=create]');
      b.click();
      b.click();
    });
    await page.waitForSelector('.code-card .code');
    assert.equal(server.hub.exportState().rooms.length, before + 1);
    await page.click('[data-act=center]');
    await page.waitForFunction(() => document.querySelector('#c-mode')?.value === 'fox_hunt');
    ok(`${tag}: dos toques en «Crear partida» crean una sola sala, con el modo elegido en el inicio`);
    const code = (await page.locator('.code').first().textContent()).trim();

    // Invitación: un solo botón principal, sin selector de modos. Pegar el enlace entero también vale.
    const guest = await ctx.browser().newContext({ viewport: { width: w, height: h }, locale: 'es-ES' });
    await guest.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
    const g = await guest.newPage();
    g.on('pageerror', (e) => errors.push(`${tag} invitado: ${e.message}`));
    await g.goto(`${server.url}/?sala=${code}`);
    await g.waitForSelector('#home-form');
    await g.waitForTimeout(500);
    assert.deepEqual(await g.evaluate(LAYOUT), [], `${tag} invitación`);
    assert.equal(await g.locator('.btn-primary').count(), 1);
    assert.equal(await g.locator('.modes').count(), 0);
    assert.match(await g.locator('.ticket').textContent(), /Te han invitado a la sala/);
    if (shots) await g.screenshot({ path: `${shots}/inicio-invitacion-${tag}.png`, fullPage: true });
    await g.fill('#f-code', `${server.url}/?sala=${code}`);
    await g.fill('#f-name', 'Beto');
    await g.check('#f-adult');
    await g.click('[data-act=join]');
    await g.waitForSelector('.code-card .code');
    ok(`${tag}: con invitación, un solo botón principal; pegar el enlace entero en el código también entra`);
    await guest.close();

    // Reducir movimiento: ninguna animación.
    const calm = await ctx.browser().newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const c = await calm.newPage();
    await c.goto(server.url);
    await c.waitForSelector('#home-form');
    assert.equal(await c.evaluate(() => document.getAnimations().length), 0);
    await calm.close();
    ok(`${tag}: con «reducir movimiento» no hay animaciones`);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  ok('sin errores de JavaScript');
  console.log(`\n${passed}/${passed} comprobaciones correctas`);
} finally {
  await browser.close();
  await server.close();
}
