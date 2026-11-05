// QA · escenarios (a) empezar en los 3 modos, (b) guía en sala y partida, (c) Mission Report con varias causas,
// historial local y compartir; (d) consola/desbordamiento/objetivos en partida e informe.
// Uso: node QA/ciclo-ux-202611/qa/e2e-partidas.mjs http://127.0.0.1:8831
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, overflowX, pressReady, rows, shot, sleep, smallTargets, stateOf, until, netStatus } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const { check, log, save, results } = makeRecorder('e2e-partidas');
const browser = await launch();
const players = [];
let jitterOn = true;
const COORD = /-?\d{1,3}[.,]\d{4,}/; // algo que parezca una coordenada

async function jitter() {
  // Pequeños movimientos para que watchPosition siga dando lecturas frescas (capturas con GPS reciente).
  let k = 0;
  while (jitterOn) {
    k++;
    for (const p of players) {
      const d = (k % 2) * 1.5;
      await p.context.setGeolocation({ latitude: p.pos.lat + d / 111_320, longitude: p.pos.lng, accuracy: 6 }).catch(() => {});
    }
    await sleep(2000);
  }
}

const reportText = (p) => p.page.$eval('.card.result', (e) => e.innerText.replace(/ (Tú|TÚ)(?=\s|$)/g, '').replace(/\s+/g, ' ').trim());
const stats = (p) => p.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.stats') ?? 'null'));
const phaseIs = async (p, what) => {
  if (what === 'FINISHED') return Boolean(await p.page.$('.card.result'));
  if (what === 'LOBBY') return Boolean(await p.page.$('.code-card'));
  if (what === 'GAME') return Boolean(await p.page.$('[data-act="leave-game"]'));
  return false;
};
async function dismissReveal(p) {
  const r = await p.page.$('.overlay.reveal');
  if (r) await r.click().catch(() => {});
}
async function assign(host, name, pref) {
  if (!(await host.page.$('select[aria-label="Rol de ' + name + '"]'))) await host.page.click('[data-act="manage"]');
  await host.page.selectOption(`select[aria-label="Rol de ${name}"]`, pref);
  await sleep(600);
}
async function startFromSheet(host) {
  await host.page.waitForSelector('[data-act="start"]:not([disabled])', { timeout: 20_000 });
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  await host.page.click('[data-act="start-now"]');
  await until(async () => (await phaseIs(host, 'GAME')) || (await host.page.$('.countdown')), 'partida empezada', 20_000);
}
async function waitAll(list, what, ms = 30_000) {
  await until(async () => {
    for (const p of list) if (!(await phaseIs(p, what))) return false;
    return true;
  }, `todos en ${what}`, ms);
}
async function compareReports(list, tag) {
  const texts = [];
  for (const p of list) texts.push(await reportText(p));
  const same = texts.every((t) => t === texts[0]);
  check(`C ${tag}: el informe común es idéntico para todos`, same, same ? texts[0].slice(0, 300) : texts.map((t) => t.slice(0, 200)));
  check(`C ${tag}: el informe no muestra nada parecido a coordenadas`, !texts.some((t) => COORD.test(t)));
  return texts[0];
}
async function shareCheck(p, tag) {
  await p.page.evaluate(() => (window.__shared = []));
  await p.page.click('[data-act="share-report"]');
  await sleep(500);
  const shared = await p.page.evaluate(() => window.__shared);
  const text = shared.map((s) => `${s.title ?? ''}\n${s.text ?? ''}\n${s.url ?? ''}`).join('\n');
  log(`texto compartido (${tag})`, text);
  check(`C ${tag}: compartir sin coordenadas, sin código de sala ni URL`, shared.length === 1 && !COORD.test(text) && !/sala=|https?:|ws:/.test(text) && !/lat|lng|\bm de radio/i.test(text), text);
  return text;
}
async function reloadAndCompare(p, before, tag) {
  const s0 = await stats(p);
  await p.page.reload({ waitUntil: 'domcontentloaded' });
  await p.page.waitForSelector('.card.result', { timeout: 20_000 });
  await sleep(1500);
  const after = await reportText(p);
  check(`C ${tag}: tras recargar, el informe se reconstruye igual (${p.label})`, after === before, after === before ? '' : { before: before.slice(0, 200), after: after.slice(0, 200) });
  const s1 = await stats(p);
  check(`C ${tag}: tras recargar, el historial no cuenta dos veces (${p.label})`, s0?.games === s1?.games, { antes: s0?.games, despues: s1?.games });
}
async function rematch(host, others) {
  await host.page.click('[data-act="rematch"]');
  // AF-11: la revancha pide un segundo toque («Toca otra vez para empezar la revancha»).
  const again = await until(async () => (await phaseIs(host, 'LOBBY')) || /otra vez/i.test((await host.page.textContent('[data-act="rematch"]').catch(() => '')) ?? ''), 'revancha: confirmación o sala', 5_000);
  if (again && !(await phaseIs(host, 'LOBBY'))) await host.page.click('[data-act="rematch"]');
  await until(() => phaseIs(host, 'LOBBY'), 'anfitrión en sala (revancha)');
  for (const p of others) {
    await until(() => p.page.$('[data-act="join_rematch"]'), `${p.label} ve «Unirme a la revancha»`, 20_000);
    const st = await stateOf(host, p.name);
    log(`revancha: ${p.label} antes de unirse se ve como`, st);
    await p.page.click('[data-act="join_rematch"]');
  }
  await until(async () => (await rows(host)).every((r) => r.state !== 'Invitado'), 'todos unidos a la revancha');
}

try {
  jitter();
  const host = await newPlayer(browser, base, { label: 'host', width: 412, height: 915, pos: MADRID });
  host.name = 'Ana Host';
  players.push(host);
  await enterHome(host, { name: host.name, create: true });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  const beto = await newPlayer(browser, base, { label: 'beto', width: 360, height: 740, pos: offset(MADRID, 4, 2) });
  beto.name = 'Beto';
  const caro = await newPlayer(browser, `${base}/?sala=${code}`, { label: 'caro', width: 320, height: 568, pos: offset(MADRID, -3, 2) });
  caro.name = 'Caro';
  players.push(beto, caro);
  await enterHome(beto, { name: beto.name, code });
  await enterHome(caro, { name: caro.name });

  // ---------- (b) guía desde la sala: no pierde la sala ni la conexión
  const rowsBefore = JSON.stringify(await rows(caro));
  await caro.page.click('#app [data-act="guide-open"]');
  await caro.page.waitForSelector('.guide-overlay[data-guide-context="lobby"]');
  const kicker = await caro.page.textContent('.guide-kicker');
  await caro.page.keyboard.press('Escape');
  await sleep(300);
  check('B1 guía desde la sala (320 px): se abre en contexto sala y Escape la cierra', !(await caro.page.$('.guide-overlay')), kicker);
  check('B2 tras cerrar la guía: misma sala y conectado', JSON.stringify(await rows(caro)) === rowsBefore && (await netStatus(caro)) === 'Conectado' && (await codeOf(caro)) === code);
  const focusAfter = await caro.page.evaluate(() => document.activeElement?.dataset?.act ?? document.activeElement?.tagName);
  check('B3 el foco vuelve al botón que abrió la guía', focusAfter === 'guide-open', focusAfter);

  // ---------- Partida 1 (Clásico): terminada por el anfitrión durante la huida
  await pressReady(beto);
  await pressReady(caro);
  await assign(host, 'Beto', 'hunter');
  await assign(host, 'Caro', 'runner');
  await assign(host, 'Ana Host', 'runner');
  log('tras asignar roles', await rows(host));
  // ¿ve un jugador la preferencia de equipo de otro? (privacidad)
  const caroHtml = await caro.page.content();
  check('E1 privacidad: Caro no ve el rol asignado a Beto en la sala', !/Cazador|hunter/.test((await caro.page.$eval('ul.players', (e) => e.innerText)) ?? ''), (await caro.page.$eval('ul.players', (e) => e.innerText)).slice(0, 200));
  void caroHtml;
  await startFromSheet(host);
  await until(async () => (await caro.page.$('.countdown')) || (await phaseIs(caro, 'GAME')), 'caro en cuenta atrás');
  const cdText = await caro.page.$eval('.countdown', (e) => e.innerText).catch(() => '');
  check('E2 cuenta atrás sin revelar roles', !/cazador|fugitivo/i.test(cdText.replace(/Tu rol aparecerá|Nadie lo sabe/g, '')) , cdText.replace(/\s+/g, ' ').slice(0, 160));
  await waitAll([host, beto, caro], 'GAME', 30_000);
  await sleep(800);
  for (const p of players) await dismissReveal(p);
  // guía en la partida
  await beto.page.click('[data-act="guide-open"]');
  await beto.page.waitForSelector('.guide-overlay[data-guide-context="game"]');
  const gameStep = await beto.page.textContent('.guide-count');
  await shot(beto, 'guia-360-en-partida');
  await beto.page.click('[data-act="guide-close"]');
  check('B4 guía en partida (huida): abre en contexto partida y se cierra con ✕; sigue en partida y conectado', (await phaseIs(beto, 'GAME')) && (await netStatus(beto)) === 'Conectado', gameStep);
  for (const p of players) {
    const o = await overflowX(p.page);
    check(`D1 partida sin desbordamiento a ${p.width}px (${p.label})`, o.over <= 0, o);
  }
  log('objetivos < 44 px en partida (caro 320)', await smallTargets(caro.page, 'body'));
  await host.page.click('[data-act="end"]');
  await host.page.click('[data-act="end"]');
  await waitAll(players, 'FINISHED', 20_000);
  await sleep(1000);
  const r1 = await compareReports(players, 'P1 terminada por el anfitrión');
  check('C P1: causa «terminada por el anfitrión» y sin ganador', /Sin ganador/i.test(r1) && /anfitri/i.test(r1), r1.slice(0, 200));
  await shot(caro, 'informe-320-terminada-anfitrion');
  await shareCheck(caro, 'P1');
  const st1 = await stats(caro);
  check('C P1: historial local con 1 partida', st1?.games === 1, st1);
  await reloadAndCompare(caro, r1, 'P1');
  for (const p of players) {
    const o = await overflowX(p.page);
    check(`D1 informe sin desbordamiento a ${p.width}px (${p.label})`, o.over <= 0, o);
    const small = await smallTargets(p.page, '#app');
    results.push({ id: `D2 objetivos táctiles < 44 px en el informe (${p.label})`, ok: small.length === 0, detail: small });
    log(`objetivos < 44 px informe (${p.label})`, small);
  }

  // ---------- Partida 2 (Clásico): todos capturados con confirmación; la guía no tapa la reclamación
  await rematch(host, [beto, caro]);
  const inv = await stateOf(host, 'Beto');
  log('estado Beto tras unirse a la revancha', inv);
  await pressReady(beto);
  await pressReady(caro);
  await assign(host, 'Beto', 'hunter');
  await assign(host, 'Caro', 'runner');
  await assign(host, 'Ana Host', 'runner');
  await startFromSheet(host);
  await waitAll(players, 'GAME', 30_000);
  log('esperando el fin de la huida (2 min)…');
  await until(() => beto.page.$('[data-claim]'), 'botones de captura del cazador (fase ACTIVE)', 170_000, 1000);
  for (const p of players) await dismissReveal(p);
  // Caro abre la guía; Beto la reclama: la guía debe cerrarse y la reclamación quedar a la vista.
  await caro.page.click('[data-act="guide-open"]');
  await caro.page.waitForSelector('.guide-overlay');
  const caroId = await beto.page.$eval('[data-claim]', (b) => [...document.querySelectorAll('[data-claim]')].find((x) => x.textContent.trim() === 'Caro')?.dataset.claim);
  await beto.page.click(`[data-claim="${caroId}"]`);
  const claimSeen = await until(() => caro.page.$('.claim-sheet'), 'reclamación a Caro', 15_000).then(() => true).catch(() => false);
  const guideStill = Boolean(await caro.page.$('.guide-overlay'));
  check('B5 la reclamación de captura cierra la guía y queda a la vista', claimSeen && !guideStill, { claimSeen, guideStill });
  await shot(caro, 'reclamacion-320-tras-guia');
  if (claimSeen) await caro.page.click('[data-respond="yes"]');
  await sleep(1500);
  await sleep(3500); // el servidor admite una reclamación cada 3 s por cazador (RATE.claimMinIntervalMs)
  const hostBtn = await until(() => beto.page.$$eval('[data-claim]', (l) => l.find((x) => x.textContent.trim() === 'Ana Host')?.dataset.claim), 'botón de captura de Ana Host', 40_000, 500);
  await beto.page.click(`[data-claim="${hostBtn}"]`);
  const hostClaim = await until(() => host.page.$('.claim-sheet'), 'reclamación al anfitrión', 15_000).then(() => true).catch(() => false);
  log('reclamación al anfitrión vista', hostClaim, await beto.page.$$eval('.toast, .toasts *', (l) => l.map((x) => x.textContent.trim())).catch(() => []));
  await host.page.click('[data-respond="yes"]').catch(() => {});
  await waitAll(players, 'FINISHED', 30_000);
  await sleep(1000);
  const r2 = await compareReports(players, 'P2 todos capturados');
  check('C P2: ganan los cazadores, 2 capturas, captura decisiva', /Ganan los cazadores/i.test(r2) && /Capturas 2/i.test(r2) && /Decisiva/i.test(r2), r2.slice(0, 400));
  await shot(beto, 'informe-360-todos-capturados');
  await shareCheck(beto, 'P2');
  const st2 = await stats(beto);
  check('C P2: historial de Beto = 2 partidas, 1 victoria, 2 capturas hechas', st2?.games === 2 && st2?.wins === 1 && st2?.captures === 2, st2);
  const st2c = await stats(caro);
  check('C P2: historial de Caro = 2 partidas, 1 derrota, capturada 1 vez', st2c?.games === 2 && st2c?.losses === 1 && st2c?.captured === 1, st2c);
  await reloadAndCompare(host, r2, 'P2');

  // ---------- Partida 3 (Caza del zorro, 3 jugadores): atrapan al zorro
  await rematch(host, [beto, caro]);
  await host.page.click('[data-act="edit-config"]');
  await host.page.selectOption('#c-mode', 'fox_hunt');
  await sleep(1000);
  await host.page.click('[data-act="edit-config"]');
  await pressReady(beto);
  await pressReady(caro);
  await startFromSheet(host);
  await waitAll(players, 'GAME', 30_000);
  await sleep(1500);
  const foxLines = {};
  for (const p of players) foxLines[p.label] = await p.page.$eval('.overlay.reveal', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
  log('revelación de roles (zorro)', foxLines);
  for (const p of players) await dismissReveal(p);
  log('esperando el fin de la huida (2 min)…');
  const hunterP = await until(async () => {
    for (const p of players) if (await p.page.$('[data-claim]')) return p;
    return null;
  }, 'algún cazador con botones de captura', 170_000, 1000);
  const foxName = await hunterP.page.$eval('[data-claim]', (b) => b.textContent.trim());
  const foxP = players.find((p) => p.name === foxName);
  await hunterP.page.click('[data-claim]');
  await until(() => foxP.page.$('.claim-sheet'), 'reclamación al zorro', 15_000);
  await foxP.page.click('[data-respond="yes"]');
  await waitAll(players, 'FINISHED', 30_000);
  await sleep(1000);
  const r3 = await compareReports(players, 'P3 Caza del zorro');
  check('C P3: zorro atrapado → ganan los cazadores', /Ganan los cazadores/i.test(r3), r3.slice(0, 300));
  await shot(foxP, `informe-${foxP.width}-zorro`);
  await reloadAndCompare(foxP, r3, 'P3');

  // ---------- Partida 4 (Infección, 4 jugadores): el único cazador abandona → otra causa
  const dani = await newPlayer(browser, base, { label: 'dani', width: 412, height: 915, pos: offset(MADRID, 2, -3) });
  dani.name = 'Dani';
  players.push(dani);
  await rematch(host, [beto, caro]);
  await enterHome(dani, { name: dani.name, code });
  await host.page.click('[data-act="edit-config"]');
  await host.page.selectOption('#c-mode', 'infection');
  await sleep(1000);
  await host.page.click('[data-act="edit-config"]');
  for (const p of [beto, caro, dani]) await pressReady(p);
  await assign(host, 'Dani', 'hunter');
  for (const n of ['Beto', 'Caro', 'Ana Host']) await assign(host, n, 'runner');
  await startFromSheet(host);
  await waitAll(players, 'GAME', 30_000);
  // «GAME» también es cierto en la cuenta atrás (tiene su propio «Abandonar»): si Dani sale ahí, el servidor
  // vuelve a la sala (team_empty), no termina. Hay que abandonar ya en la huida.
  await until(async () => { for (const p of players) if (await p.page.$('.countdown')) return false; return true; }, 'fin de la cuenta atrás (P4)', 20_000);
  await sleep(1200);
  for (const p of players) await dismissReveal(p);
  await dani.page.click('[data-act="leave-game"]');
  await dani.page.click('[data-act="leave-game"]');
  await waitAll([host, beto, caro], 'FINISHED', 30_000);
  await sleep(1000);
  const r4 = await compareReports([host, beto, caro], 'P4 Infección, abandona el cazador');
  check('C P4: causa de abandono de los cazadores mostrada', /abandon|cazador/i.test(r4) && /Infección/i.test(r4), r4.slice(0, 300));
  await shot(host, 'informe-412-infeccion-abandono');
  const st4 = await stats(dani);
  log('historial de Dani (abandonó antes del final)', st4);
  await reloadAndCompare(beto, r4, 'P4');
  const st4b = await stats(beto);
  check('C historial de Beto tras 4 partidas = 4 (sin duplicados tras recargas)', st4b?.games === 4, st4b);
} catch (e) {
  check('EXCEPCIÓN del escenario', false, e.stack?.split('\n').slice(0, 4).join(' | '));
  for (const p of players) await shot(p, `error-partidas-${p.label}`);
} finally {
  jitterOn = false;
  for (const p of players) {
    check(`D3 errores de consola/página (${p.label})`, p.errors.length === 0, p.errors);
    log(`consola ${p.label}`, p.console);
  }
  save();
  await browser.close();
}
