// QA · escenario (a) Sala guiada + (d) consola/desbordamiento/objetivos táctiles en la sala.
// Uso: node QA/ciclo-ux-202611/qa/e2e-sala.mjs http://127.0.0.1:8831
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, openPage, overflowX, pressReady, rows, setPos, shot, sleep, smallTargets, stateOf, until, netStatus } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const { check, log, save, results } = makeRecorder('e2e-sala');
const browser = await launch();
const players = [];
try {
  // ---------- primera visita: la guía no se abre sola
  const host = await newPlayer(browser, base, { label: 'host', width: 412, height: 915 });
  players.push(host);
  await host.page.waitForSelector('#f-name');
  await sleep(800);
  check('A0 primera visita: la guía no se abre sola', !(await host.page.$('.guide-overlay')));

  // ---------- crear sala: zona centrada sola
  await enterHome(host, { name: 'Ana Host', create: true });
  const code = await codeOf(host);
  check('A1 crear sala muestra el código', /^[A-Z0-9]{6}$/.test(code), code);
  await until(() => host.page.$('[data-act="edit-config"]'), 'zona autocentrada', 25_000);
  check('A2 autocentrado: la configuración aparece sin pulsar nada', true);
  await shot(host, 'sala-anfitrion-412-autocentrado');
  const steps = await host.page.$$eval('.lobby-step', (l) => l.map((x) => `${x.className.replace('lobby-step ', '')}:${x.textContent.trim()}`));
  log('pasos anfitrión', steps);

  // ---------- unirse por código (360) y por enlace (320, nombre con HTML)
  const p2 = await newPlayer(browser, base, { label: 'p2', width: 360, height: 740, pos: offset(MADRID, 10, 5) });
  players.push(p2);
  await enterHome(p2, { name: 'Beto', code });
  check('A3 unirse por código', (await codeOf(p2)) === code);
  const evil = `<i>Zo</i>"&'x`;
  const p3 = await newPlayer(browser, `${base}/?sala=${code}`, { label: 'p3', width: 320, height: 568, pos: offset(MADRID, -8, 3) });
  players.push(p3);
  const prefilled = await p3.page.inputValue('#f-code');
  check('A4 enlace ?sala= rellena el código', prefilled === code, prefilled);
  await enterHome(p3, { name: evil });
  check('A4b unirse por enlace', (await codeOf(p3)) === code);
  await until(async () => (await rows(host)).length === 3, '3 jugadores en la sala del anfitrión');
  const evilRow = (await rows(host)).find((r) => r.name === evil);
  check('A5 nombre con HTML se muestra escapado (sin <i>)', evilRow && !/<i>/.test(evilRow.html) && /&lt;i&gt;/.test(evilRow.html), evilRow?.html);

  // ---------- QR
  await host.page.click('[data-act="qr"]');
  const qr = await until(() => host.page.$('.qr-sheet svg'), 'QR', 5_000).catch(() => null);
  check('A6 el QR se genera (svg en la hoja)', Boolean(qr));
  const qrLink = await host.page.$eval('.qr-sheet', (e) => e.textContent).catch(() => '');
  log('texto hoja QR', qrLink.replace(/\s+/g, ' ').slice(0, 200));
  await shot(host, 'sala-qr-412');
  await host.page.click('.qr-sheet [data-act="close-sheet"]');

  // ---------- listos
  await pressReady(p2);
  await pressReady(p3);
  await until(async () => (await stateOf(host, 'Beto')) === 'Listo' && (await stateOf(host, evil)) === 'Listo', 'listos en anfitrión');
  check('A7 dos jugadores listos (visto por el anfitrión)', true);
  await shot(p3, 'sala-jugador-320-listo');

  // ---------- cambios NO materiales: QR, compartir (anfitrión y jugador), recentrar 20 m
  await host.page.click('[data-act="qr"]');
  await host.page.click('.qr-sheet [data-act="close-sheet"]');
  await host.page.click('[data-act="share"]');
  await p2.page.click('[data-act="share"]');
  await p2.page.click('[data-act="qr"]');
  await p2.page.click('.qr-sheet [data-act="close-sheet"]');
  const sharedInvite = await host.page.evaluate(() => window.__shared);
  log('compartir enlace (anfitrión)', sharedInvite);
  check('A8 compartir enlace incluye ?sala=', sharedInvite.some((s) => (s.url ?? s.text ?? '').includes(`sala=${code}`)), sharedInvite);
  await setPos(host, offset(MADRID, 20, 0));
  await host.page.click('[data-act="center"]');
  await sleep(2500);
  check('A9 QR/compartir/recentrar 20 m no quitan el «listo»', (await stateOf(host, 'Beto')) === 'Listo' && (await stateOf(host, evil)) === 'Listo', await rows(host));

  // ---------- recentrar 45 m tres veces (deriva acumulada, ver QA-01)
  for (const n of [65, 110, 155]) {
    await setPos(host, offset(MADRID, n, 0));
    await host.page.click('[data-act="center"]');
    await sleep(1800);
  }
  const driftState = await stateOf(host, 'Beto');
  log('INFO A10 deriva por recentrados de ~45 m en el navegador (no concluyente: depende de qué lectura GPS toma locateOnce); Beto =', driftState);
  results.push({ id: 'A10 INFO deriva por recentrados en e2e (ver test engine/test/qa-preparacion-deriva.test.ts)', ok: true, detail: driftState });
  await setPos(host, offset(MADRID, 155, 0));
  for (const p of [p2, p3]) if ((await p.page.textContent('[data-act="ready"]')).trim() === 'Estoy listo') await pressReady(p);

  // ---------- empezar con un jugador que se quita el listo durante la hoja (estado imposible)
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  await shot(host, 'sala-hoja-empezar-412');
  const ackPre = await host.page.isChecked('#start-safety');
  log('casilla de seguridad premarcada', ackPre);
  if (!ackPre) await host.page.check('#start-safety');
  await p2.page.click('[data-act="ready"]'); // Beto: «No estoy listo»
  await until(async () => (await stateOf(host, 'Beto')) !== 'Listo', 'Beto ya no listo');
  await host.page.click('[data-act="start-now"]');
  const err = await until(() => host.page.$eval('.start-sheet .msg.danger', (e) => e.textContent.trim()).catch(() => null), 'error en la hoja', 15_000).catch(() => null);
  check('A11 empezar con alguien no listo: error en la hoja, sigue en la sala', Boolean(err) && (await host.page.$('.code-card')), err);
  await host.page.click('.start-sheet [data-act="close-sheet"]');
  const hostRowAfter = await stateOf(host, 'Ana Host');
  log('anfitrión tras intento fallido', hostRowAfter);
  await pressReady(p2);

  // ---------- cambio material: radio → los demás pierden el listo, el anfitrión no
  await host.page.click('[data-act="edit-config"]');
  // Carrera del script (auditoría R2): el «listo» de Beto puede llegar al anfitrión después de abrir «Cambiar».
  const warnOthers = await until(() => host.page.$('.cfg-edit .msg.warn'), 'aviso de que perderán el «listo»', 5_000).catch(() => null);
  check('A12 al editar con jugadores listos, aviso de que perderán el «listo»', Boolean(warnOthers));
  await host.page.selectOption('#c-radius', '250');
  await until(async () => (await stateOf(host, 'Beto')) !== 'Listo', 'Beto pierde listo', 8_000).catch(() => null);
  const after = await rows(host);
  check('A13 cambio material (radio) quita el «listo» a los demás', after.filter((r) => r.name !== 'Ana Host').every((r) => r.state !== 'Listo'), after);
  check('A14 …y no al anfitrión (si ya estaba listo)', hostRowAfter !== 'Listo' || after.find((r) => r.name === 'Ana Host')?.state === 'Listo', { hostRowAfter, now: after.find((r) => r.name === 'Ana Host') });
  const notice = await p2.page.$eval('.msg.warn[role="status"]', (e) => e.textContent.trim()).catch(() => null);
  check('A15 el jugador ve qué cambió («la zona»)', /zona/.test(notice ?? ''), notice);
  await shot(p2, 'sala-jugador-360-aviso-cambio');
  await host.page.click('[data-act="edit-config"]'); // Hecho
  await pressReady(p2);
  await pressReady(p3);

  // ---------- desconexión (offline) y reconexión de p3 sin tocar a los demás
  await p3.context.setOffline(true);
  const sawOff = await until(async () => (await rows(host)).find((r) => r.name === evil)?.off, 'p3 sin conexión visto por el anfitrión', 45_000).then(() => true).catch(() => false);
  log('p3 offline visto por anfitrión', sawOff, await rows(host));
  await p3.context.setOffline(false);
  // Carrera del script (cierre, 05/11/2026): con la red emulada el anfitrión puede no ver nunca el corte
  // (sawOff false) y el servidor cerrar el socket viejo justo al volver la red. Esperar «no está sin
  // conexión» pasaba al instante, antes de ese cierre. Se espera a que p3 diga «Conectado» y a que el
  // anfitrión lo vea conectado 3 s seguidos.
  await until(async () => /Conectado/.test((await netStatus(p3)) ?? ''), 'p3 conectado', 45_000).catch(() => null);
  await until(async () => {
    if ((await rows(host)).find((r) => r.name === evil)?.off !== false) return false;
    await sleep(3_000);
    return (await rows(host)).find((r) => r.name === evil)?.off === false;
  }, 'p3 reconectado (visto por el anfitrión)', 45_000).catch(() => null);
  const r3 = await rows(host);
  check('A16 corte de red de p3: vuelve y sigue listo; Beto no se ve afectado', r3.find((r) => r.name === evil)?.state === 'Listo' && r3.find((r) => r.name === 'Beto')?.state === 'Listo', { sawOff, r3 });

  // ---------- cerrar la página de p3 y reabrir (misma sesión)
  await p3.page.close();
  await sleep(1500);
  await openPage(p3, base);
  await p3.page.waitForSelector('.code-card .code', { timeout: 20_000 });
  await until(async () => (await rows(host)).find((r) => r.name === evil && !r.off), 'p3 reabierto', 20_000).catch(() => null);
  const r4 = await rows(host);
  check('A17 cerrar y reabrir la pestaña de p3: misma plaza y sigue listo', r4.length === 3 && r4.find((r) => r.name === evil)?.state === 'Listo', r4);

  // ---------- volver de segundo plano (visibilitychange simulado)
  await p2.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(1000);
  check('A18 volver de segundo plano: p2 sigue conectado y listo', (await netStatus(p2)) === 'Conectado' && (await stateOf(host, 'Beto')) === 'Listo', await netStatus(p2));

  // ---------- recarga del anfitrión
  const cfgBefore = await host.page.$eval('.cfg-summary', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  await host.page.reload({ waitUntil: 'domcontentloaded' });
  await host.page.waitForSelector('[data-act="edit-config"]', { timeout: 20_000 });
  await sleep(2500);
  const cfgAfter = await host.page.$eval('.cfg-summary', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  const r5 = await rows(host);
  check('A19 recarga del anfitrión: misma configuración, los demás siguen listos, sin recentrar', cfgBefore === cfgAfter && r5.filter((r) => r.name !== 'Ana Host').every((r) => r.state === 'Listo'), { cfgBefore, cfgAfter, r5 });

  // ---------- desbordamiento y objetivos táctiles en la sala
  for (const p of [host, p2, p3]) {
    const o = await overflowX(p.page);
    check(`D1 sala sin desbordamiento horizontal a ${p.width}px (${p.label})`, o.over <= 0, o);
    const small = await smallTargets(p.page, '#app');
    log(`objetivos < 44 px en la sala (${p.label}, ${p.width}px)`, small);
    results.push({ id: `D2 objetivos táctiles < 44 px en sala (${p.label})`, ok: small.length === 0, detail: small });
  }
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  const smallSheet = await smallTargets(host.page, '.start-sheet');
  results.push({ id: 'D2 objetivos táctiles < 44 px en la hoja de empezar', ok: smallSheet.length === 0, detail: smallSheet });
  log('objetivos < 44 px hoja empezar', smallSheet);
  await host.page.click('.start-sheet [data-act="close-sheet"]');

  // ---------- cambio de modo a Infección con 3 jugadores: bloqueo de mínimo
  await host.page.click('[data-act="edit-config"]');
  await host.page.selectOption('#c-mode', 'infection');
  await sleep(1500);
  const blk = await host.page.$eval('.start-card', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  const startDisabled = await host.page.$eval('[data-act="start"]', (e) => e.disabled);
  check('A20 Infección con 3 jugadores: «Empezar» bloqueado y explica el mínimo de 4', startDisabled && /4 jugadores/.test(blk), blk);
  const p2Notice = await p2.page.$eval('.msg.warn[role="status"]', (e) => e.textContent.trim()).catch(() => null);
  check('A21 cambio de modo: el jugador ve «el modo»', /modo/.test(p2Notice ?? ''), p2Notice);
  await host.page.selectOption('#c-mode', 'classic');
  await sleep(1000);
  await host.page.click('[data-act="edit-config"]');
  await pressReady(p2);
  await pressReady(p3);

  // ---------- empezar Clásico (hoja + seguridad) y terminar en la huida (anfitrión)
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  const dbl = host.page.click('[data-act="start-now"]');
  await host.page.click('[data-act="start-now"]', { timeout: 1500 }).catch(() => {}); // doble toque
  await dbl;
  await until(async () => (await host.page.$('.countdown')) || (await host.page.$('.overlay.reveal')) || (await host.page.$('[data-act="end"]')), 'cuenta atrás', 15_000);
  check('A22 Clásico: la hoja de empezar arranca la partida (doble toque sin error)', !host.errors.length, host.errors);
  log('errores de consola hasta aquí', players.map((p) => ({ [p.label]: p.errors })));
} catch (e) {
  check('EXCEPCIÓN del escenario', false, e.stack?.split('\n').slice(0, 3).join(' | '));
  for (const p of players) await shot(p, `error-sala-${p.label}`);
} finally {
  for (const p of players) {
    check(`D3 errores de consola/página (${p.label})`, p.errors.length === 0, p.errors);
    log(`consola ${p.label}`, p.console);
  }
  save();
  await browser.close();
}
