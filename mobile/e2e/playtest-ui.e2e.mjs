// Interfaz preparada para el primer playtest, en el navegador real (Chromium de Playwright) contra el
// servidor real con el reloj controlado, a 360×740. Comprueba y fotografía, por rol:
//   huida (qué pasa al llegar a 0:00), próxima pista (cazador y fugitivo), «Pista en 1 min», llegada de la
//   pista (cazador) y aviso persistente al fugitivo, reclamación de captura, Mission Report en una
//   victoria de los cazadores y en una de los fugitivos, revancha y salida.
// SIMULADO: GPS emulado, tiempo del servidor adelantado (tras un salto se recarga la página para que el
// reloj del móvil se resincronice, como al volver a abrir la app) y todo en un ordenador. Sin MapTiler:
// el mapa usa el radar de reserva (esta prueba es de la interfaz, no de la cartografía).
// Uso (en mobile/): node e2e/playtest-ui.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor
const clock = { t: Date.UTC(2026, 9, 26, 17, 0, 0) };
const server = await startServer({ hub: { now: () => clock.t } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const advance = async (ms) => {
  // Como en la realidad (ping cada 10 s), quien tiene la página abierta da señales de vida durante el
  // salto: el periodo de gracia (D-057) solo afecta a quien está desconectado de verdad.
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
try {
  for (const [name, north] of [['Ana', 0], ['Beto', 120], ['Caro', -150]]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', permissions: ['geolocation'] });
    await context.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
    const p = { name, context, north, errors: [] };
    // GPS emulado con una lectura nueva cada segundo (una posición fija conserva su fecha y «envejece»).
    let j = 0;
    const move = () => {
      j = 1 - j;
      const q = offsetM(CENTER, p.north + j * 0.3, 0);
      return context.setGeolocation({ latitude: q.lat, longitude: q.lng, accuracy: 6 }).catch(() => {});
    };
    await move();
    p.timer = setInterval(move, 1_000);
    p.page = await context.newPage();
    p.page.on('pageerror', (e) => p.errors.push(e.message));
    // Tras recargar, Chrome bloquea la vibración hasta el primer toque y lo anota en la consola: es una
    // regla del navegador (también en el móvil), no un error de la página.
    p.page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.location()?.url ?? '') && !m.text().includes('navigator.vibrate') && p.errors.push(m.text()));
    await p.page.goto(server.url);
    players[name] = p;
  }
  const { Ana: ana, Beto: beto, Caro: caro } = players;
  const all = [ana, beto, caro];
  const shot = (p, label) => shots && p.page.screenshot({ path: `${shots}/${label}-${p.name}.png`, fullPage: true });
  const text = (p, sel) => p.page.locator(sel).first().textContent().then((t) => t.trim().replace(/\s+/g, ' '));
  const reload = async (p) => {
    await p.page.reload();
    await p.page.waitForSelector('.hud, .result');
  };

  // Sala: Ana crea y configura (10 min de persecución, pistas cada 3 min); roles a mano.
  await ana.page.fill('#f-name', 'Ana');
  await ana.page.check('#f-adult');
  await ana.page.click('[data-act=create]');
  const code = (await text(ana, '.code')).trim();
  for (const p of [beto, caro]) {
    await p.page.fill('#f-name', p.name);
    await p.page.check('#f-adult');
    await p.page.fill('#f-code', code);
    await p.page.click('[data-act=join]');
  }
  await ana.page.waitForFunction(() => document.querySelectorAll('.player').length === 3);
  const idOf = {};
  for (const p of all) idOf[p.name] = await p.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.session')).playerId);
  for (const [n, role] of [['Ana', 'hunter'], ['Beto', 'runner'], ['Caro', 'runner']]) {
    await ana.page.selectOption(`[data-assign="${idOf[n]}"]`, role);
    await ana.page.waitForFunction(([id, r]) => document.querySelector(`[data-assign="${id}"]`)?.value === r, [idOf[n], role]);
  }
  await ana.page.click('[data-act=center]');
  await ana.page.waitForFunction(() => document.querySelector('[data-act=center]')?.textContent.includes('Volver'));
  await ana.page.check('#c-safety');
  // Pistas cada 10 min y después 10 min de persecución: la interfaz ajusta el intervalo y lo explica.
  await ana.page.selectOption('#c-ping', '10');
  await ana.page.waitForFunction(() => document.querySelector('#c-ping option[value="10"]')?.selected);
  await ana.page.selectOption('#c-duration', '10');
  await ana.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('un intervalo igual o mayor no daría ninguna pista')), null, { timeout: 5_000 });
  ok('al acortar la persecución por debajo del intervalo de pistas, se ajusta y se explica');
  await ana.page.waitForFunction(() => document.querySelector('#c-ping option[value="5"]')?.selected);
  await ana.page.selectOption('#c-ping', '3');
  await ana.page.waitForFunction(() => document.querySelector('#c-ping option[value="3"]')?.selected && document.querySelector('.rules')?.textContent.includes('Cada 3 min'));
  // Con 10 min de persecución no se ofrece «cada 10 min» (no llegaría ninguna pista).
  await ana.page.waitForFunction(() => document.querySelector('#c-duration option[value="10"]')?.selected && !document.querySelector('#c-ping option[value="10"]'), null, { timeout: 5_000 }).catch(() => {});
  const pingOptions = await ana.page.$$eval('#c-ping option', (o) => o.map((x) => x.value));
  assert.ok(!pingOptions.includes('10') && pingOptions.includes('3'), `intervalos ofrecidos: ${pingOptions}`);
  ok('con 10 min de persecución no se ofrece un intervalo de pistas sin ninguna pista');
  for (const p of all) await p.page.click('[data-act=ready]');
  await ana.page.waitForSelector('[data-act=start]:not([disabled])');

  // Cuenta atrás, rol y huida.
  await ana.page.click('[data-act=start]');
  for (const p of all) await p.page.waitForSelector('.countdown .big');
  await advance(5_000);
  for (const p of all) await p.page.waitForSelector('.overlay.reveal');
  assert.match(await text(caro, '.overlay.reveal'), /tienes 2 min de ventaja/);
  assert.match(await text(ana, '.overlay.reveal'), /Espera 2 min en la zona de salida/);
  await shot(caro, '01-rol');
  ok('la carta del rol dice cuánto dura la huida');
  for (const p of all) await p.page.locator('.overlay.reveal').click();
  await caro.page.waitForSelector('.hud-next');
  assert.match(await text(ana, '.hud-next'), /sales a cazar/);
  assert.match(await text(caro, '.hud-next'), /empiezan a buscarte/);
  await shot(ana, '02-huida');
  await shot(caro, '02-huida');
  ok('en la huida, cada rol sabe qué pasa al llegar a 0:00');

  // Persecución: próxima pista para los dos roles.
  await advance(2 * 60_000);
  for (const p of all) await p.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');
  await ana.page.waitForFunction(() => /Próxima pista en\s*[23]:\d\d/.test(document.querySelector('.hud-next')?.textContent ?? ''));
  await caro.page.waitForFunction(() => /Los cazadores reciben tu posición en\s*[23]:\d\d/.test(document.querySelector('.hud-next')?.textContent ?? ''));
  assert.match(await text(ana, '.pings-card'), /La primera pista llega sola/);
  await shot(ana, '03-persecucion');
  await shot(caro, '03-persecucion');
  ok('cazador y fugitivo ven la cuenta atrás de la próxima pista (y el cazador, que la primera llega sola)');

  // A 55 s de la pista: el fugitivo recibe «Pista en 1 min» y la línea se pone en alerta.
  await advance(2 * 60_000 + 5_000);
  await reload(caro);
  await caro.page.waitForFunction(() => document.querySelector('.hud-next.is-imminent') && [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Pista en 1 min')), null, { timeout: 5_000 });
  await shot(caro, '04-pista-en-1-min');
  ok('el fugitivo recibe «Pista en 1 min» y la cuenta atrás se pone en alerta');

  // Llega la pista: el cazador la ve (aviso y tarjeta); el fugitivo, un aviso fijo de 30 s.
  await advance(55_000);
  await caro.page.waitForSelector('.exposure', { timeout: 5_000 });
  assert.match(await text(caro, '.exposure'), /Los cazadores acaban de recibir tu posición/);
  // Se anuncia una vez a los lectores de pantalla, en una región fija que el redibujado no toca.
  await caro.page.waitForFunction(() => document.getElementById('sr-live')?.textContent.includes('acaban de recibir tu posición'));
  await shot(caro, '05-posicion-enviada');
  // Tras el salto de reloj de la prueba, Caro también resincroniza (si no, sus lecturas llegarían como antiguas).
  await reload(caro);
  await ana.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.startsWith('Nueva pista')), null, { timeout: 5_000 });
  await reload(ana);
  await ana.page.waitForFunction(() => /Pista nº 1/.test(document.querySelector('.pings-card')?.textContent ?? ''));
  const card = await text(ana, '.pings-card');
  assert.match(card, /no dónde está ahora/);
  assert.match(card, /Beto/);
  assert.match(card, /Caro/);
  await shot(ana, '05-pista');
  ok('la pista llega al cazador con número, antigüedad y explicación; el fugitivo ve que se ha enviado');

  // Reclamación de captura: Ana junto a Caro.
  ana.north = 0.5;
  caro.north = 5;
  const fresh = (n) => {
    const s = server.hub.roomStateByCode(code)?.players[idOf[n]]?.samples.at(-1);
    // Reciente, en su nueva posición y sin «salto» pendiente de confirmar (un salto aislado no vale para capturar).
    return s && !s.jump && clock.t - s.effectiveAt < 10_000 && Math.abs(s.lat - offsetM(CENTER, players[n].north, 0).lat) < 1e-5;
  };
  for (let i = 0; i < 200 && !(fresh('Ana') && fresh('Caro')); i++) await sleep(100);
  assert.ok(fresh('Ana') && fresh('Caro'), 'lecturas recientes y estables de Ana y Caro');
  await ana.page.click(`[data-claim="${idOf.Caro}"]`);
  await caro.page.waitForSelector('.claim-sheet');
  assert.equal(await caro.page.locator('[data-act=selftag]').count(), 0, 'la acción de debajo no se ve a través de la hoja');
  assert.match(await text(caro, '.claim-sheet .timer'), /0:[23]\d/);
  await shot(caro, '06-reclamacion');
  await caro.page.click('[data-respond=yes]');
  await ana.page.waitForFunction(() => document.querySelector('.foot')?.textContent.includes('Capturas: 1'));
  assert.doesNotMatch(await text(ana, '.pings-card'), /Caro/, 'la pista ya no muestra a la capturada');
  ok('reclamación con plazo grande y sin la acción de debajo; tras la captura, la pista ya no la muestra');

  // Beto se declara capturado por Ana: ganan los cazadores.
  await beto.page.click('[data-act=selftag]');
  await beto.page.click(`[data-selftag="${idOf.Ana}"]`);
  for (const p of all) await p.page.waitForSelector('.result');
  const report1 = await Promise.all(all.map((p) => text(p, '.result')));
  assert.ok(report1.every((r) => r === report1[0]), 'el Mission Report es idéntico para todos');
  assert.match(report1[0], /Ganan los cazadores/);
  assert.match(report1[0], /Captura de Caro por Ana/);
  // Al terminar se revelan los equipos de todos (y no antes: lo comprueban las pruebas del servidor).
  assert.match(report1[0], /CazadoresAna2 capturasFugitivos(Beto|Caro)Captura a los/);
  assert.equal(await ana.page.locator('.roster.t-runner li').count(), 2);
  assert.match(await text(ana, '.result-me'), /Tu equipo gana.*Hiciste 2 capturas/);
  assert.match(await text(caro, '.result-me'), /Tu equipo pierde.*Te capturó Ana a los/);
  for (const p of all) await shot(p, '07-final-cazadores');
  ok('Mission Report (ganan los cazadores): igual para todos, con el resultado personal aparte');

  // Revancha: todos vuelven a «Sorteo» (sorteo nuevo, decisión del 29/10/2026). Para que la prueba sea
  // determinista, la anfitriona vuelve a asignar a mano (sigue permitido); esta vez ganan los fugitivos.
  await ana.page.click('[data-act=rematch]');
  for (const p of [beto, caro]) {
    await p.page.waitForSelector('[data-act=join_rematch]');
    await p.page.click('[data-act=join_rematch]');
  }
  await ana.page.waitForFunction(() => document.querySelectorAll('.player').length === 3 && ![...document.querySelectorAll('.pstate')].some((e) => e.textContent === 'Invitado'));
  const prefs = await ana.page.$$eval('[data-assign]', (s) => s.map((x) => x.value));
  assert.deepEqual(prefs, ['random', 'random', 'random'], `preferencias tras la revancha: ${prefs}`);
  ok('la revancha empieza con todos en «Sorteo»');
  for (const [n, role] of [['Ana', 'hunter'], ['Beto', 'runner'], ['Caro', 'runner']]) {
    await ana.page.selectOption(`[data-assign="${idOf[n]}"]`, role);
    await ana.page.waitForFunction(([id, r]) => document.querySelector(`[data-assign="${id}"]`)?.value === r, [idOf[n], role]);
  }
  if (!(await ana.page.isChecked('#c-safety'))) await ana.page.check('#c-safety');
  for (const p of all) {
    const label = await text(p, '[data-act=ready]');
    if (label === 'Estoy listo') await p.page.click('[data-act=ready]');
  }
  await ana.page.waitForSelector('[data-act=start]:not([disabled])');
  ana.north = 0;
  caro.north = -150;
  beto.north = 120;
  await ana.page.click('[data-act=start]');
  await advance(5_000);
  for (const p of all) {
    await p.page.waitForSelector('.overlay.reveal');
    await p.page.locator('.overlay.reveal').click();
  }
  await advance(2 * 60_000);
  for (const p of all) await p.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');
  // Ningún aviso de la partida anterior (reclamación, zona) se cuela en la nueva.
  assert.equal(await ana.page.locator('[data-claim]').count(), 2, 'la cazadora puede reclamar desde el principio');
  beto.north = 3;
  ana.north = 0.5;
  for (let i = 0; i < 200 && !(fresh('Ana') && fresh('Beto')); i++) await sleep(100);
  assert.ok(fresh('Ana') && fresh('Beto'), 'lecturas recientes y estables de Ana y Beto');
  await ana.page.click(`[data-claim="${idOf.Beto}"]`);
  await beto.page.waitForSelector('[data-respond=yes]');
  await beto.page.click('[data-respond=yes]');
  await ana.page.waitForFunction(() => document.querySelector('.foot')?.textContent.includes('Capturas: 1'));
  await advance(10 * 60_000);
  for (const p of all) await p.page.waitForSelector('.result');
  const report2 = await Promise.all(all.map((p) => text(p, '.result')));
  assert.ok(report2.every((r) => r === report2[0]), 'el Mission Report es idéntico para todos');
  assert.match(report2[0], /Ganan los fugitivos/);
  assert.match(report2[0], /Se acabó el tiempo/);
  assert.match(await text(caro, '.result-me'), /Tu equipo gana.*Seguías libre al final/);
  assert.match(await text(ana, '.result-me'), /Tu equipo pierde/);
  for (const p of all) await shot(p, '08-final-fugitivos');
  ok('Mission Report (ganan los fugitivos por tiempo): igual para todos');

  // Salir: Beto se va. El informe de los demás sigue siendo el oficial (el mismo que tras recargar).
  // Caro vuelve al inicio.
  await beto.page.click('[data-act=leave]');
  await beto.page.waitForSelector('#home-form');
  await sleep(500);
  const afterLeave = await text(ana, '.result');
  await ana.page.reload();
  await ana.page.waitForSelector('.result');
  assert.equal(await text(ana, '.result'), afterLeave, 'el informe no depende de lo que recuerde cada móvil');
  assert.match(afterLeave, /Ganan los fugitivos/);
  assert.match(afterLeave, /Captura de Beto por Ana/, 'el nombre de quien salió se conserva');
  // Salir de la sala después del final no es abandonar la partida (revisión del 30/10): el informe
  // sigue diciendo lo que pasó en ella, sin «abandonó».
  assert.match(afterLeave, /BetoCaptura a los \d+:\d\d(Caro|Fugitivos|$)/);
  assert.doesNotMatch(afterLeave, /abandonó/);
  assert.match(afterLeave, /CaroLibre al final/);
  assert.doesNotMatch(afterLeave, /Alguien/);
  await caro.page.click('[data-act=leave]');
  await caro.page.waitForSelector('#home-form');
  ok('«Salir de la sala» lleva al inicio; el informe de los demás es el mismo antes y después de recargar');

  for (const p of all) assert.deepEqual(p.errors, [], `${p.name}: errores en la página`);
  ok('sin errores de JavaScript en las tres páginas');
  console.log(`Interfaz del playtest: ${passed}/${passed} comprobaciones`);
} finally {
  for (const p of Object.values(players)) clearInterval(p.timer);
  await browser.close();
  await server.close();
}
