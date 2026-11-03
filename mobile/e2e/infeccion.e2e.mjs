// Modo Infección (D-057) en el navegador real (Chromium de Playwright) contra el servidor real con el reloj
// controlado, cuatro jugadores a 360×740. Comprueba y fotografía:
//   - el anfitrión elige el modo; los demás lo ven en la sala y en las reglas; con 3 no se puede empezar;
//   - la conversión: tarjeta «Te han infectado» solo para él, aviso para los demás, rol nuevo y espera de
//     1 min para capturar; después ve a los fugitivos en su lista de capturas (no a los cazadores);
//   - el final con todos infectados: el mismo Mission Report para los cuatro, con la cadena de contagio y
//     el último superviviente; el resultado personal del convertido.
// SIMULADO: GPS emulado, reloj del servidor adelantado (y recarga para resincronizar), todo en un
// ordenador. Sin MapTiler (radar de reserva).
// Uso (en mobile/): node e2e/infeccion.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor
const clock = { t: Date.UTC(2026, 9, 30, 18, 0, 0) };
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
  for (const [name, north] of [['Ana', 0], ['Beto', 120], ['Caro', -150], ['Dani', 200]]) {
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
  const { Ana: ana, Beto: beto, Caro: caro, Dani: dani } = players;
  const all = [ana, beto, caro, dani];
  const shot = (p, label) => shots && p.page.screenshot({ path: `${shots}/${label}-${p.name}.png`, fullPage: true });
  const text = (p, sel) => p.page.locator(sel).first().textContent().then((t) => t.trim().replace(/\s+/g, ' '));
  const noOverflow = async (p) => assert.ok(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${p.name}: desbordamiento horizontal`);
  const reload = async (p) => {
    await p.page.reload();
    await p.page.waitForSelector('.hud, .result');
  };
  const toastSeen = (p, re) => p.page.waitForFunction((src) => window.__toasts.some((t) => new RegExp(src).test(t)), re.source, { timeout: 6_000 });

  // Sala: Ana crea y elige Infección con Beto y Caro dentro: no se puede empezar con 3.
  await ana.page.fill('#f-name', 'Ana');
  await ana.page.check('#f-adult');
  await ana.page.click('[data-act=create]');
  const code = (await text(ana, '.code')).trim();
  const enter = async (p) => {
    await p.page.fill('#f-name', p.name);
    await p.page.check('#f-adult');
    await p.page.fill('#f-code', code);
    await p.page.click('[data-act=join]');
  };
  await enter(beto);
  await enter(caro);
  await ana.page.click('[data-act=center]');
  await ana.page.waitForFunction(() => document.querySelector('[data-act=center]')?.textContent.includes('Volver'));
  await ana.page.check('#c-safety');
  await ana.page.selectOption('#c-mode', 'infection');
  await ana.page.waitForFunction(() => document.querySelector('#c-mode')?.value === 'infection' && /Mínimo 4 jugadores/.test(document.querySelector('.mode-line')?.textContent ?? ''));
  await ana.page.selectOption('#c-duration', '10');
  await ana.page.selectOption('#c-ping', '3');
  for (const p of [ana, beto, caro]) await p.page.click('[data-act=ready]');
  await ana.page.waitForFunction(() => /Infección necesita al menos 4 jugadores/.test(document.body.textContent) && document.querySelector('[data-act=start]')?.disabled);
  await beto.page.waitForFunction(() => /Infección ·/.test(document.body.textContent) && /Infectados/.test(document.querySelector('.rules')?.textContent ?? ''));
  await shot(ana, '01-sala-3');
  await noOverflow(ana);
  ok('el anfitrión elige Infección; los demás lo ven en la sala y en las reglas; con 3 no se puede empezar');

  await enter(dani);
  await ana.page.waitForFunction(() => document.querySelectorAll('.player').length === 4);
  const idOf = {};
  for (const p of all) idOf[p.name] = await p.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.session')).playerId);
  for (const [n, role] of [['Ana', 'hunter'], ['Beto', 'runner'], ['Caro', 'runner'], ['Dani', 'runner']]) {
    await ana.page.selectOption(`[data-assign="${idOf[n]}"]`, role);
    await ana.page.waitForFunction(([id, r]) => document.querySelector(`[data-assign="${id}"]`)?.value === r, [idOf[n], role]);
  }
  await dani.page.click('[data-act=ready]');
  await ana.page.waitForSelector('[data-act=start]:not([disabled])');
  await ana.page.click('[data-act=start]');
  await advance(5_000);
  for (const p of all) {
    await p.page.waitForSelector('.overlay.reveal');
    await p.page.locator('.overlay.reveal').click();
  }
  // Las posiciones de la captura se fijan ya: así, tras el salto y la recarga, las lecturas son estables.
  ana.north = 0.5;
  beto.north = 4;
  await advance(2 * 60_000);
  for (const p of all) await reload(p);
  for (const p of all) await p.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');
  assert.match(await text(ana, '.foot'), /Infectados: 0/);
  ok('empieza la persecución con 1 cazadora y 3 fugitivos; el contador dice «Infectados»');

  // Ana infecta a Beto (reclamación confirmada).
  const fresh = (n) => {
    const s = server.hub.roomStateByCode(code)?.players[idOf[n]]?.samples.at(-1);
    return s && !s.jump && clock.t - s.effectiveAt < 10_000 && Math.abs(s.lat - offsetM(CENTER, players[n].north, 0).lat) < 1e-5;
  };
  for (let i = 0; i < 300 && !(fresh('Ana') && fresh('Beto')); i++) await sleep(100);
  assert.ok(fresh('Ana') && fresh('Beto'), 'lecturas recientes y estables de Ana y Beto');
  await ana.page.click(`[data-claim="${idOf.Beto}"]`);
  await beto.page.waitForSelector('.claim-sheet');
  await beto.page.click('[data-respond=yes]');
  await beto.page.waitForFunction(() => /Te han infectado/.test(document.querySelector('.overlay.reveal')?.textContent ?? '') && /CAZADOR/.test(document.querySelector('.overlay.reveal .role')?.textContent ?? ''));
  await shot(beto, '02-infectado');
  await noOverflow(beto);
  for (const p of [ana, caro, dani]) {
    await toastSeen(p, /Beto ha sido infectado: ahora caza/);
    assert.equal(await p.page.locator('.overlay.reveal').count(), 0, `${p.name} no ve la tarjeta de Beto`);
  }
  ok('Beto ve «Te han infectado · ahora eres CAZADOR»; los demás, solo el aviso');
  await beto.page.locator('.overlay.reveal').click();
  await beto.page.waitForFunction(() => /CAZADOR/.test(document.querySelector('.role-chip')?.textContent ?? '') && /podrás capturar en/.test(document.querySelector('.dock')?.textContent ?? ''));
  assert.equal(await beto.page.locator('[data-claim]').count(), 0);
  assert.match(await text(ana, '.foot'), /Infectados: 1/);
  await shot(beto, '03-espera');
  ok('Beto ya es cazador y espera 1 min antes de poder capturar');

  await advance(61_000);
  await reload(beto);
  await beto.page.waitForSelector('[data-claim]');
  const targets = await beto.page.$$eval('[data-claim]', (b) => b.map((x) => x.textContent.trim()).sort());
  assert.deepEqual(targets, ['Caro', 'Dani']);
  await shot(beto, '04-caza');
  ok('pasado el minuto, Beto puede reclamar a los fugitivos que quedan (y no a los cazadores)');

  // Caro y Dani se declaran infectados por Beto: todos infectados.
  for (const p of [caro, dani]) {
    await reload(p);
    await p.page.click('[data-act=selftag]');
    await p.page.click(`[data-selftag="${idOf.Beto}"]`);
    await p.page.waitForFunction(() => document.querySelector('.role-chip')?.textContent.includes('CAZADOR') || document.querySelector('.result'));
  }
  for (const p of all) await p.page.waitForSelector('[aria-label="Mission Report"]', { timeout: 6_000 });
  const reports = [];
  for (const p of all) reports.push(await text(p, '[aria-label="Mission Report"]'));
  assert.ok(reports.every((r) => r === reports[0]), 'el Mission Report es igual para los cuatro');
  assert.match(reports[0], /Infección/);
  assert.match(reports[0], /Ganan los cazadores/);
  assert.match(reports[0], /Todos infectados/);
  // V-08: antes se exigía «Ana → Beto → Caro», una cadena incompleta (Beto también infectó a Dani): la
  // prueba validaba un informe erróneo. El informe tiene que dar todas las infecciones, por quién infectó.
  assert.match(reports[0], /Contagio: Ana → Beto · Beto → Caro, Dani/);
  assert.match(reports[0], /Último superviviente: Dani/);
  assert.match(reports[0], /Infección de Beto por Ana/);
  assert.match(await text(beto, '.result-me'), /Tu equipo gana.*Te infectó Ana a los .*; después infectaste a 2/);
  // V-13: la tarjeta de conversión del último infectado no tapa el informe.
  for (const p of all) assert.equal(await p.page.locator('.overlay.reveal').count(), 0, `${p.name}: ninguna tarjeta sobre el informe`);
  await shot(beto, '05-informe');
  await noOverflow(beto);
  ok('todos infectados: el mismo Mission Report para los cuatro, con la cadena de contagio y el último superviviente');

  // Revancha: sigue en Infección y con sorteo nuevo.
  await ana.page.click('[data-act=rematch]');
  for (const p of [beto, caro, dani]) await p.page.click('[data-act=join_rematch]');
  await ana.page.waitForFunction(() => document.querySelector('#c-mode')?.value === 'infection' && [...document.querySelectorAll('[data-assign]')].every((s) => s.value === 'random'));
  ok('la revancha sigue en Infección, con todos en «Sorteo»');

  assert.deepEqual(errors, []);
  ok('sin errores en la consola de ninguna página');
  console.log(`\n${passed}/${passed} comprobaciones correctas`);
} finally {
  for (const p of Object.values(players)) clearInterval(p.timer);
  await browser.close();
  await server.close();
}
