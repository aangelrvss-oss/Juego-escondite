// Caza del zorro, variante «Mr. X» (D-057), en el navegador real (Chromium de Playwright) contra el
// servidor real con el reloj controlado, tres jugadores a 360×740. Comprueba y fotografía:
//   - el anfitrión elige el modo; en la sala el rol se llama «Zorro»; la tarjeta de rol dice ZORRO;
//   - el zorro ve a los dos cazadores en el mapa (radar de reserva) con su leyenda;
//   - la pista: los cazadores reciben la posición del zorro; el zorro, el aviso;
//   - la captura del zorro termina la partida: el mismo Mission Report para los tres.
// SIMULADO: GPS emulado, reloj del servidor adelantado (y recarga para resincronizar), todo en un
// ordenador. Sin MapTiler (radar de reserva: el mapa real no cambia en este modo).
// Uso (en mobile/): node e2e/zorro.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor
const clock = { t: Date.UTC(2026, 9, 30, 19, 0, 0) };
const server = await startServer({ hub: { now: () => clock.t } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const advance = async (ms) => {
  for (const end = clock.t + ms; clock.t < end; ) {
    clock.t = Math.min(end, clock.t + 20_000);
    server.pump();
    server.hub.keepAliveConnected();
  }
  await sleep(400);
};
let passed = 0;
const ok = (text) => console.log(`ok · ${text} (${++passed})`);

const browser = await chromium.launch();
const players = {};
const errors = [];
try {
  for (const [name, north] of [['Ana', 0], ['Beto', 60], ['Zoe', 4]]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', permissions: ['geolocation'] });
    await context.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
    await context.addInitScript(() => {
      window.__toasts = [];
      new MutationObserver(() => {
        for (const t of document.querySelectorAll('.toast')) if (!window.__toasts.includes(t.textContent)) window.__toasts.push(t.textContent);
      }).observe(document, { childList: true, subtree: true });
    });
    const p = { name, context, north };
    let j = 0;
    const move = () => {
      j = 1 - j;
      const q = offsetM(CENTER, p.north + j * 0.3, 0);
      return context.setGeolocation({ latitude: q.lat, longitude: q.lng, accuracy: 6 }).catch(() => {});
    };
    await move();
    p.timer = setInterval(move, 1_000);
    p.page = await context.newPage();
    p.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.location()?.url ?? '') && !m.text().includes('navigator.vibrate') && errors.push(`${name}: ${m.text()}`));
    await p.page.goto(server.url);
    players[name] = p;
  }
  const { Ana: ana, Beto: beto, Zoe: zoe } = players;
  const all = [ana, beto, zoe];
  const shot = (p, label) => shots && p.page.screenshot({ path: `${shots}/${label}-${p.name}.png`, fullPage: true });
  const text = (p, sel) => p.page.locator(sel).first().textContent().then((t) => t.trim().replace(/\s+/g, ' '));
  const noOverflow = async (p) => assert.ok(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${p.name}: desbordamiento horizontal`);
  const reload = async (p) => {
    await p.page.reload();
    await p.page.waitForSelector('.hud, .result');
  };

  await ana.page.fill('#f-name', 'Ana');
  await ana.page.check('#f-adult');
  await ana.page.click('[data-act=create]');
  const code = (await text(ana, '.code')).trim();
  for (const p of [beto, zoe]) {
    await p.page.fill('#f-name', p.name);
    await p.page.check('#f-adult');
    await p.page.fill('#f-code', code);
    await p.page.click('[data-act=join]');
  }
  await ana.page.waitForFunction(() => document.querySelectorAll('.player').length === 3);
  await ana.page.click('[data-act=center]');
  await ana.page.waitForFunction(() => document.querySelector('[data-act=center]')?.textContent.includes('Volver'));
  await ana.page.check('#c-safety');
  await ana.page.selectOption('#c-mode', 'fox_hunt');
  await ana.page.waitForFunction(() => document.querySelector('#c-mode')?.value === 'fox_hunt' && /Mínimo 3 jugadores/.test(document.querySelector('.mode-line')?.textContent ?? ''));
  await ana.page.selectOption('#c-duration', '10');
  await ana.page.selectOption('#c-ping', '3');
  const idOf = {};
  for (const p of all) idOf[p.name] = await p.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.session')).playerId);
  assert.deepEqual(await ana.page.$$eval(`[data-assign="${idOf.Zoe}"] option`, (o) => o.map((x) => x.textContent)), ['Sorteo', 'Cazador', 'Zorro']);
  await ana.page.selectOption(`[data-assign="${idOf.Zoe}"]`, 'runner');
  await ana.page.waitForFunction((id) => document.querySelector(`[data-assign="${id}"]`)?.value === 'runner', idOf.Zoe);
  await zoe.page.waitForFunction(() => /Caza del zorro ·/.test(document.body.textContent) && /posición exacta del zorro/.test(document.querySelector('.rules')?.textContent ?? ''));
  await shot(ana, '01-sala');
  ok('el anfitrión elige la Caza del zorro; el rol se llama «Zorro»; los demás ven el modo y sus reglas');

  for (const p of all) await p.page.click('[data-act=ready]');
  await ana.page.waitForSelector('[data-act=start]:not([disabled])');
  await ana.page.click('[data-act=start]');
  await advance(5_000);
  for (const p of all) await p.page.waitForSelector('.overlay.reveal');
  assert.equal(await text(zoe, '.overlay.reveal .role'), 'ZORRO');
  assert.match(await text(zoe, '.overlay.reveal'), /Verás a los cazadores en el mapa/);
  assert.equal(await text(beto, '.overlay.reveal .role'), 'CAZADOR');
  // V-09: roles públicos tras la cuenta atrás: el cazador sabe quién es el zorro; el zorro no ve nada nuevo.
  assert.match(await text(beto, '.overlay.reveal'), /El zorro es Zoe/);
  assert.doesNotMatch(await text(zoe, '.overlay.reveal'), /El zorro es/);
  await shot(zoe, '02-rol');
  await shot(beto, '02-rol');
  ok('la tarjeta de rol dice ZORRO y explica que verá a los cazadores; la del cazador nombra al zorro');
  for (const p of all) await p.page.locator('.overlay.reveal').click();
  await beto.page.waitForFunction(() => /El zorro es Zoe/.test(document.querySelector('.callout')?.textContent ?? ''));
  assert.doesNotMatch(await text(zoe, '.callout'), /El zorro es/);
  // Regresión (ciclo de correcciones): el texto propio del zorro no debe sustituirse por el de Clásico.
  assert.match(await text(zoe, '.callout'), /Verás a los cazadores en el mapa/);
  ok('durante la huida, el cazador lee «El zorro es Zoe» bajo el reloj');
  await advance(2 * 60_000);
  for (const p of all) await reload(p);
  for (const p of all) await p.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');

  // El zorro ve a los dos cazadores (radar de reserva: marcas de «visible» con el color del cazador).
  // Las posiciones salen cada 5 s de reloj del servidor, que en la prueba solo avanza a mano.
  await sleep(2_000);
  await advance(6_000);
  await zoe.page.waitForFunction(() => document.querySelectorAll('#map-host .rd-exposed.t-hunter').length === 2, null, { timeout: 15_000 }).catch(async (e) => {
    console.log('DIAG', await zoe.page.evaluate(() => [...document.querySelectorAll('#map-host [class]')].map((x) => x.getAttribute('class')).join(' | ')));
    throw e;
  });
  assert.match(await text(zoe, '.legend'), /Cazadores \(en directo\)/);
  assert.doesNotMatch(await text(zoe, '.legend'), /Tu equipo/, 'el zorro juega solo');
  assert.equal(await text(zoe, '.role-chip'), 'ZORRO');
  assert.equal(await ana.page.locator('#map-host .rd-exposed').count(), 0, 'los cazadores no ven al zorro en directo');
  assert.match(await text(ana, '.callout'), /El zorro es Zoe/, 'en la persecución, el cazador sigue sabiendo quién es el zorro');
  assert.match(await text(zoe, '.callout'), /ves a los cazadores en directo/, 'el zorro conserva su indicación propia en la persecución');
  assert.match(await text(ana, '.callout'), /Cada pista te dice dónde estaba/, 'y el cazador, la suya tras el nombre del zorro');
  await shot(zoe, '03-zorro-ve');
  await noOverflow(zoe);
  ok('el zorro ve a los dos cazadores en directo; los cazadores no lo ven');

  // Pista a los 3 min: los cazadores reciben la posición del zorro.
  await advance(3 * 60_000);
  await ana.page.waitForFunction(() => window.__toasts.some((t) => t.includes('Nueva pista: posición del zorro')), null, { timeout: 6_000 });
  await zoe.page.waitForFunction(() => document.querySelector('.exposure'), null, { timeout: 6_000 });
  await reload(ana);
  await ana.page.waitForFunction(() => /Pista nº 1/.test(document.querySelector('.pings-card')?.textContent ?? '') && /Zoe/.test(document.querySelector('.pings-card')?.textContent ?? ''));
  await shot(ana, '04-pista');
  ok('la pista da a los cazadores la posición del zorro; el zorro ve que se ha enviado');

  // Ana atrapa a Zoe (están a 4 m): termina la partida.
  for (const p of [ana, zoe]) await reload(p);
  const fresh = (n) => {
    const s = server.hub.roomStateByCode(code)?.players[idOf[n]]?.samples.at(-1);
    return s && !s.jump && clock.t - s.effectiveAt < 10_000;
  };
  for (let i = 0; i < 300 && !(fresh('Ana') && fresh('Zoe')); i++) await sleep(100);
  assert.ok(fresh('Ana') && fresh('Zoe'), 'lecturas recientes de Ana y Zoe');
  const claimable = await ana.page.$$eval('[data-claim]', (b) => b.map((x) => x.textContent.trim()));
  assert.deepEqual(claimable, ['Zoe'], 'el cazador solo puede reclamar al zorro');
  await ana.page.click(`[data-claim="${idOf.Zoe}"]`);
  await zoe.page.waitForSelector('.claim-sheet');
  await zoe.page.click('[data-respond=yes]');
  for (const p of all) await p.page.waitForSelector('[aria-label="Mission Report"]', { timeout: 6_000 });
  const reports = [];
  for (const p of all) reports.push(await text(p, '[aria-label="Mission Report"]'));
  assert.ok(reports.every((r) => r === reports[0]), 'el Mission Report es igual para los tres');
  assert.match(reports[0], /Caza del zorro/);
  assert.match(reports[0], /Ganan los cazadores/);
  assert.match(reports[0], /Zorro atrapado/);
  assert.match(reports[0], /Zoe cayó a los \d+:\d\d, atrapado por Ana/);
  assert.match(reports[0], /ZorroZoe/);
  assert.match(await text(zoe, '.result-me'), /Pierdes/, 'el zorro juega solo: no «Tu equipo»');
  await shot(zoe, '05-informe');
  await noOverflow(zoe);
  ok('atrapar al zorro termina la partida: el mismo Mission Report para los tres');

  assert.deepEqual(errors, []);
  ok('sin errores en la consola de ninguna página');
  console.log(`\n${passed}/${passed} comprobaciones correctas`);
} finally {
  for (const p of Object.values(players)) clearInterval(p.timer);
  await browser.close();
  await server.close();
}
