// Partida completa de THE OUTRUN en la interfaz real con cinco navegadores (Chromium del entorno,
// Playwright preinstalado; NO son dependencias del proyecto) contra el servidor real (HTTP + WebSocket).
// SIMULADO: la geolocalización de cada navegador (emulada por Playwright), el paso del tiempo del
// servidor (reloj controlado, para no esperar los 2 min de huida) y que todos estén en el mismo
// ordenador. NO es una prueba en móviles reales.
// Uso: npm run vendor (en mobile/) y después: node e2e/game.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor
const at = (north, east = 0) => {
  const p = offsetM(CENTER, north, east);
  return { latitude: p.lat, longitude: p.lng, accuracy: 6 };
};
const clock = { t: Date.UTC(2026, 9, 26, 17, 0, 0) };
const server = await startServer({ hub: { now: () => clock.t } });
const advance = async (ms) => {
  clock.t += ms;
  server.pump();
};

const browser = await chromium.launch();
const NAMES = ['Ana', 'Beto', 'Caro', 'Dani', 'Eva'];
const START = { Ana: at(0), Beto: at(30, 30), Caro: at(120), Dani: at(-150, 60), Eva: at(80, -200) };
const players = [];
try {
  for (const name of NAMES) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      geolocation: START[name],
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    const frames = [];
    const errors = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(JSON.parse(f.payload))));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(server.url);
    players.push({ name, context, page, frames, errors });
  }
  const [ana, beto, caro, dani, eva] = players;
  const shot = async (p, label) => shots && p.page.screenshot({ path: `${shots}/${label}-${p.name}.png` });

  // 1. Inicio: Ana crea la sala; los demás entran con el código.
  await ana.page.fill('#f-name', 'Ana');
  await ana.page.check('#f-adult'); // declaración de edad (D-008)
  await shot(ana, '01-inicio');
  await ana.page.click('[data-act=create]');
  await ana.page.waitForSelector('.code');
  const code = (await ana.page.textContent('.code')).trim();
  assert.match(code, /^[A-Z2-9]{6}$/);
  for (const p of [beto, caro, dani, eva]) {
    await p.page.fill('#f-name', p.name);
    await p.page.check('#f-adult');
    await p.page.fill('#f-code', code.toLowerCase()); // minúsculas: también vale
    await p.page.click('[data-act=join]');
  }
  for (const p of players) await p.page.waitForFunction(() => document.querySelectorAll('.player').length === 5);
  console.log('ok · 5 jugadores en la sala', code);

  // 2. Configuración del anfitrión: roles manuales, zona en su posición, seguridad.
  const roles = { Ana: 'hunter', Beto: 'hunter', Caro: 'runner', Dani: 'runner', Eva: 'runner' };
  const ids = await ana.page.$$eval('[data-assign]', (els) => els.map((e) => e.dataset.assign));
  const nameById = Object.fromEntries(await Promise.all(players.map(async (p) => [await p.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.session')).playerId), p.name])));
  assert.equal(ids.length, 5);
  for (const id of ids) {
    await ana.page.selectOption(`[data-assign="${id}"]`, roles[nameById[id]]);
    await ana.page.waitForFunction((pid) => document.querySelector(`[data-assign="${pid}"]`)?.value !== 'random', id);
  }
  await ana.page.click('[data-act=center]');
  await ana.page.waitForFunction(() => document.querySelector('[data-act=center]')?.textContent.includes('Volver'));
  await ana.page.check('#c-safety');
  await ana.page.selectOption('#c-duration', '15');
  for (const p of players) await p.page.click('[data-act=ready]');
  await ana.page.waitForSelector('[data-act=start]:not([disabled])');
  await shot(ana, '02-sala');
  await shot(caro, '02-sala');
  // Solo el anfitrión ve las asignaciones: en los demás no hay selectores ni roles.
  for (const p of [beto, caro, dani, eva]) assert.equal(await p.page.$$eval('[data-assign]', (e) => e.length), 0);
  console.log('ok · configuración, asignación manual y todos listos');

  // 3. Cuenta atrás sincronizada y revelación privada.
  await ana.page.click('[data-act=start]');
  for (const p of players) await p.page.waitForSelector('.countdown .big');
  await shot(dani, '03-cuenta');
  await advance(5_000);
  for (const p of players) {
    await p.page.waitForSelector('.overlay.reveal');
    const role = (await p.page.textContent('.overlay.reveal .role')).trim();
    assert.equal(role, roles[p.name] === 'hunter' ? 'CAZADOR' : 'FUGITIVO', `${p.name} ve su rol`);
  }
  await shot(ana, '04-rol');
  await shot(caro, '04-rol');
  console.log('ok · cuenta atrás y revelación individual del rol');

  // 4. Huida (servidor) y persecución.
  for (const p of players) await p.page.click('.overlay.reveal');
  await caro.page.waitForSelector('.hud');
  assert.match(await caro.page.textContent('.callout'), /Huye/);
  assert.match(await ana.page.textContent('.callout'), /Espera en la zona de salida/);
  await advance(2 * 60_000);
  for (const p of players) await p.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');
  console.log('ok · huida y persecución sincronizadas por el servidor');

  // 5. Captura: Caro se acerca a Ana; lecturas nuevas (el reloj del servidor ya avanzó).
  await caro.context.setGeolocation(at(5));
  await ana.context.setGeolocation(at(0.5));
  // Se espera a que el servidor tenga lecturas recientes de ambos (el cliente envía como mucho una por
  // segundo y reenvía la última cada 5 s). Se consulta el estado interno solo como oráculo de la prueba.
  const idOf = (n) => Object.keys(nameById).find((id) => nameById[id] === n);
  const fresh = (n, north) => {
    const s = server.hub.roomStateByCode(code)?.players[idOf(n)]?.samples.at(-1);
    return s && clock.t - s.effectiveAt < 10_000 && Math.abs(s.lat - at(north).latitude) < 1e-6;
  };
  for (let i = 0; i < 100 && !(fresh('Ana', 0.5) && fresh('Caro', 5)); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(fresh('Ana', 0.5) && fresh('Caro', 5), 'el servidor tiene lecturas recientes de Ana y Caro');
  await ana.page.click(`[data-claim]:has-text("Caro")`);
  await caro.page.waitForSelector('.overlay.sheet');
  assert.match(await caro.page.textContent('.overlay.sheet h2'), /Ana/);
  await shot(caro, '05-reclamacion');
  await shot(ana, '05-reclamacion');
  await caro.page.click('[data-respond=yes]');
  for (const p of players) await p.page.waitForFunction(() => document.querySelector('.foot')?.textContent.includes('Capturas: 1'));
  console.log('ok · captura reclamada, confirmada y validada por el servidor');

  // 6. Corte de red de Dani y reconexión.
  await dani.context.setOffline(true);
  // El WebSocket abierto no se cierra solo al perder la red: el latido del cliente lo detecta (silencio
  // de más de 25 s, comprobado en el siguiente ping de 10 s, y una sonda sin respuesta en 5 s: ≤ 40 s).
  await dani.page.waitForSelector('.net-reconnecting', { timeout: 55_000 });
  await dani.context.setOffline(false);
  await dani.page.waitForSelector('.net-open', { timeout: 15_000 });
  await dani.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');
  console.log('ok · Dani pierde la red y recupera la partida');

  // 7. Final y revancha.
  await ana.page.click('[data-act=end]');
  await ana.page.click('[data-act=end]');
  for (const p of players) await p.page.waitForSelector('.result');
  await shot(eva, '06-final');
  await ana.page.click('[data-act=rematch]');
  for (const p of [beto, caro, dani, eva]) {
    await p.page.waitForSelector('[data-act=join_rematch]');
    await p.page.click('[data-act=join_rematch]');
  }
  await ana.page.waitForFunction(() => [...document.querySelectorAll('.pstate')].filter((e) => e.textContent === 'Invitado').length === 0);
  console.log('ok · final y revancha');

  // 8. Privacidad en el tráfico real recibido por cada página.
  for (const p of players) {
    const myId = Object.keys(nameById).find((id) => nameById[id] === p.name);
    const myTeam = roles[p.name];
    const mate = (id) => roles[nameById[id]] === myTeam;
    for (const f of p.frames) {
      if (f.t === 'snapshot') {
        for (const v of f.snapshot.players) {
          if (v.team !== null) assert.ok(v.id === myId || mate(v.id), `${p.name} recibe el equipo de ${nameById[v.id]}`);
          if (v.teamPref !== null) assert.equal(p.name, 'Ana', `${p.name} recibe una asignación`);
        }
      }
      if (f.t === 'event' && f.type === 'role_revealed') assert.equal(f.data.team, myTeam);
      if (f.t === 'positions' && myTeam === 'runner') {
        for (const pos of f.positions) if (pos.reason === 'teammate') assert.equal(roles[nameById[pos.playerId]], 'runner', `${p.name} ve a un cazador`);
      }
    }
    assert.deepEqual(p.errors, [], `${p.name}: errores en la página`);
  }
  console.log('ok · ningún jugador recibió roles, asignaciones ni posiciones ajenas; 0 errores de página');
  console.log('Partida completa: 8/8 etapas correctas');
} finally {
  await browser.close();
  await server.close();
}
