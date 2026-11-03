// Simulador local (sim/panel) en el navegador real (Chromium de Playwright), con su propio servidor en un
// puerto libre (no toca el de :8787). Sin cartografía (mapa.config.json → «ninguno»): comprueba que el
// panel lo dice y usa el plano de prueba. Comprueba:
//   - a 1280 y a 360 px: sin desbordamiento horizontal, rótulo de herramienta de desarrollo;
//   - iniciar con 10 participantes y la interfaz REAL de AVATAR_02 dentro (con su rótulo de simulación);
//   - velocidad (rótulo de tiempo acelerado), pausa y reanudación;
//   - desconexión forzada → «sin conexión» tras avanzar el tiempo → restaurar;
//   - captura inválida rechazada por el motor (en la consola);
//   - cambiar a Caza del zorro: un solo «Zorro»; reiniciar sin restos;
//   - ningún error de JavaScript.
// Uso (en mobile/): node e2e/simulador.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startSimulator } from '../../sim/panel/servidor.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const sim = await startSimulator({ port: 0 });
const base = sim.server.url;
let passed = 0;
const ok = (text) => console.log(`ok · ${text} (${++passed})`);
const errors = [];
const IGNORED = /navigator\.vibrate|Failed to load resource|ERR_CONNECTION_REFUSED/; // vibrar sin toque previo; el reinicio corta conexiones a propósito

const NO_OVERFLOW = () => document.documentElement.scrollWidth <= innerWidth;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
  await ctx.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !IGNORED.test(m.text()) && errors.push(`consola: ${m.text()}`));
  await page.goto(`${base}/sim/`);
  await page.waitForSelector('#status b');
  assert.match(await page.locator('.sim-tool').textContent(), /herramienta de desarrollo/i);
  assert.ok(await page.evaluate(NO_OVERFLOW));
  ok('panel abierto: rótulo de herramienta de desarrollo, sin desbordamiento');

  // Iniciar Clásico con AVATAR_02 en la interfaz real.
  await page.click('[data-act=iniciar]');
  await page.waitForFunction(() => document.querySelectorAll('#people tr').length === 10 && /Huida|Cuenta/.test(document.querySelector('#status').textContent), null, { timeout: 20_000 });
  const names = await page.$$eval('#people th[scope=row]', (r) => r.map((x) => x.firstChild.textContent.trim()));
  assert.deepEqual(names, Array.from({ length: 10 }, (_, i) => `AVATAR_${String(i + 1).padStart(2, '0')}`));
  const app = page.frameLocator('#frame-box iframe');
  await app.locator('text=SIMULACIÓN · AVATAR_02').waitFor({ timeout: 15_000 });
  await app.locator('text=/huida|empieza en/i').first().waitFor({ timeout: 15_000 });
  assert.match(await page.locator('#map-note').textContent(), /PLANO DE PRUEBA, no es el mapa real/);
  ok('10 participantes (AVATAR_01…10) y la interfaz real de AVATAR_02 en partida; sin cartografía se avisa del plano de prueba');

  // Velocidad, pausa y reanudación.
  await page.click('[data-speed="10"]');
  await page.waitForFunction(() => /TIEMPO ACELERADO ×10/.test(document.querySelector('#status').textContent));
  await page.click('#pausa');
  await page.waitForFunction(() => /EN PAUSA/.test(document.querySelector('#status').textContent));
  const t1 = sim.clock.now();
  await page.waitForTimeout(600);
  assert.equal(sim.clock.now(), t1, 'el reloj del servidor no avanza en pausa');
  await page.click('#pausa');
  await page.waitForFunction(() => /TIEMPO ACELERADO ×10/.test(document.querySelector('#status').textContent));
  ok('velocidad ×10 con rótulo de tiempo acelerado; la pausa detiene el reloj del servidor y se reanuda');
  await page.waitForFunction(() => /Persecución/.test(document.querySelector('#status').textContent), null, { timeout: 30_000 });
  await page.click('[data-speed="1"]');
  if (shots) await page.screenshot({ path: `${shots}/simulador-clasico-1280.png` });

  // Desconexión forzada de AVATAR_05 → sin conexión → restaurar.
  await page.click('#people tr[data-name=AVATAR_05]');
  await page.click('[data-act=desconectar]');
  await page.waitForFunction(() => /Desconectado/.test(document.querySelector('#people tr[data-name=AVATAR_05]').textContent));
  await page.click('[data-advance="60000"]');
  await page.waitForFunction(() => /sin conexión/.test(document.querySelector('#people tr[data-name=AVATAR_05]').textContent), null, { timeout: 15_000 });
  await page.waitForFunction(() => /AVATAR_05 sin conexión/.test(document.querySelector('#log').textContent));
  if (shots) await page.screenshot({ path: `${shots}/simulador-desconexion-1280.png` });
  await page.click('[data-act=restaurar]');
  await page.waitForFunction(() => /AVATAR_05 ha vuelto/.test(document.querySelector('#log').textContent), null, { timeout: 15_000 });
  ok('desconexión forzada: «sin conexión» tras 30 s de juego, en la tabla y en la consola; al restaurar, «ha vuelto»');

  // Captura inválida (si la partida sigue).
  if (sim.room().phase === 'ACTIVE') {
    await page.click('[data-act=captura-invalida]');
    await page.waitForFunction(() => /rechazada por el motor/.test(document.querySelector('#log').textContent), null, { timeout: 10_000 });
    ok('captura inválida: la consola muestra el rechazo del motor');
  }

  // Caza del zorro: un único zorro.
  await page.click('label:has(input[value=fox_hunt])');
  await page.click('[data-act=iniciar]');
  await page.waitForFunction(() => /Caza del zorro/.test(document.querySelector('#status').textContent) && document.querySelectorAll('#people tr').length === 10 && /Zorro/.test(document.querySelector('#people').textContent), null, { timeout: 25_000 });
  const foxes = await page.$$eval('#people tr', (rows) => rows.filter((r) => /Zorro/.test(r.textContent)).length);
  assert.equal(foxes, 1);
  assert.equal(sim.server.hub.stats().rooms, 1, 'la partida anterior no deja salas');
  if (shots) await page.screenshot({ path: `${shots}/simulador-zorro-1280.png` });
  ok('Caza del zorro con 10: un solo zorro; la simulación anterior no deja salas');

  // 360 px: sin desbordamiento horizontal.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(NO_OVERFLOW), 'sin desbordamiento a 360 px');
  if (shots) await page.screenshot({ path: `${shots}/simulador-360.png` });
  if (shots) await page.screenshot({ path: `${shots}/simulador-360-completa.png`, fullPage: true });
  ok('a 360 px: sin desbordamiento horizontal');

  // Reiniciar: sin salas ni conexiones.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('[data-act=reiniciar]');
  await page.waitForFunction(() => document.querySelectorAll('#people tr').length === 0 && /Sin partida/.test(document.querySelector('#status').textContent), null, { timeout: 15_000 });
  await page.waitForTimeout(300);
  assert.deepEqual(sim.server.hub.stats(), { rooms: 0, sessions: 0, clients: 0, locWs: 0, locHttp: 0 }, 'ni salas, ni sesiones, ni conexiones');
  ok('reiniciar: servidor nuevo, sin salas, sesiones ni conexiones');
  await ctx.close();
  assert.deepEqual(errors, []);
  ok('sin errores de JavaScript');
  console.log(`\n${passed}/${passed} comprobaciones correctas`);
} finally {
  await browser.close();
  await sim.close();
}
