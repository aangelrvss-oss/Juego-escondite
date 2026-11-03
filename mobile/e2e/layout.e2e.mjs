// Desbordamiento horizontal a 360×740 con la emulación móvil de Playwright (Chromium de Playwright,
// isMobile + hasTouch). Aquí se reprodujo un desbordamiento de 35 px en la sala de espera (los botones
// «Compartir enlace» / «Mostrar QR» y la fila del anfitrión no podían estrecharse), que web-flow.e2e.mjs y
// map.e2e.mjs (Chrome instalado por CDP) no detectaban. NO es un móvil real: otros tipos de letra y
// navegadores pueden medir distinto.
// Uso (en mobile/, con `npm install` hecho): node e2e/layout.e2e.mjs
import { createRequire } from 'node:module';
import { startServer } from '../../server/main.ts';
import { player, waitFor } from '../../server/test/helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await startServer({});
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ✔' : '  ✖'} ${name}${ok ? '' : ` → ${detail}`}`);
};
const overflow = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > vw + 0.5 && el.getBoundingClientRect().width > 0)
      .map((el) => `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : ''}`);
    return { ok: document.documentElement.scrollWidth <= vw, scrollWidth: document.documentElement.scrollWidth, vw, wide: wide.slice(0, 5) };
  });
let guest;
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 40.4153, longitude: -3.6845, accuracy: 6 } });
  // Prueba de maquetación: nunca usa la mapa.config.json local (puede llevar una clave real).
  await ctx.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
  const page = await ctx.newPage();
  await page.goto(server.url);
  let r = await overflow(page);
  check('pantalla inicial', r.ok, JSON.stringify(r));
  await page.fill('#f-name', 'Anfitriona Larga');
  await page.check('#f-adult');
  await page.tap('[data-act=create]');
  await page.waitForSelector('[data-act=center]');
  r = await overflow(page);
  check('sala de espera del anfitrión (sin zona)', r.ok, JSON.stringify(r));
  await page.tap('[data-act=center]');
  await page.waitForSelector('#c-radius');
  const code = (await page.locator('.code').first().textContent()).trim();
  guest = player({ wsUrl: `${server.url.replace('http', 'ws')}/ws` }, 'Invitado Veinte Letr');
  await waitFor(() => guest.conn.status === 'open', 'invitado conectado');
  await guest.conn.join(code, 'Invitado Veinte Letr');
  await page.waitForFunction(() => document.querySelectorAll('.player').length === 2);
  r = await overflow(page);
  check('sala de espera del anfitrión con zona y un nombre de 20 letras', r.ok, JSON.stringify(r));
  check('la etiqueta «Anfitrión» sigue visible', await page.locator('.player .tag').first().isVisible());
  // Con desbordamiento, «Mostrar QR» puede quedar fuera de la pantalla y no poder pulsarse.
  const qrOpened = await page
    .tap('[data-act=qr]', { timeout: 5_000 })
    .then(() => page.waitForSelector('.qr-sheet', { timeout: 5_000 }))
    .then(() => true, () => false);
  check('«Mostrar QR» se puede pulsar', qrOpened);
  if (qrOpened) {
    r = await overflow(page);
    check('hoja del QR', r.ok, JSON.stringify(r));
  }
} finally {
  guest?.conn.close();
  await browser.close();
  await server.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} pantallas sin desbordamiento a 360 px (emulación móvil de Playwright)`);
process.exit(failed ? 1 : 0);
