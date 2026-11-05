// QA · sonda: (1) aviso «perderán el listo» al editar justo después de que alguien se marque listo;
// (2) corte de red (context.setOffline) de un jugador en la sala: cuánto tarda en verse y en volver.
// Uso: node QA/ciclo-ux-202611/qa/sonda-offline.mjs http://127.0.0.1:8831
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, pressReady, rows, sleep, stateOf, until, netStatus } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const { check, log, save } = makeRecorder('sonda-offline');
const browser = await launch();
const ps = [];
try {
  const host = await newPlayer(browser, base, { label: 'host', width: 412 });
  const b = await newPlayer(browser, base, { label: 'b', width: 360, pos: offset(MADRID, 3, 0) });
  ps.push(host, b);
  await enterHome(host, { name: 'Ana Host', create: true });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  await enterHome(b, { name: 'Beto', code });
  await pressReady(b);
  await until(async () => (await stateOf(host, 'Beto')) === 'Listo', 'Beto listo en el anfitrión');
  await host.page.click('[data-act="edit-config"]');
  await sleep(500);
  const warn = await host.page.$eval('.cfg-edit', (e) => e.innerText).catch(() => '');
  check('S1 con un jugador listo, «Cambiar» avisa de que perderá el «listo»', /quita el «listo»/.test(warn), warn.replace(/\s+/g, ' ').slice(-200));
  await host.page.click('[data-act="edit-config"]');

  // corte de red
  const t0 = Date.now();
  await b.context.setOffline(true);
  let seenOffAt = null;
  let bStatus = [];
  while (Date.now() - t0 < 60_000) {
    const r = (await rows(host)).find((x) => x.name === 'Beto');
    const s = await netStatus(b);
    if (bStatus.at(-1) !== s) bStatus.push(s);
    if (r?.off && !seenOffAt) seenOffAt = Date.now() - t0;
    if (seenOffAt && Date.now() - t0 > seenOffAt + 3000) break;
    await sleep(500);
  }
  log('estado de red visto por Beto durante el corte', bStatus, 'anfitrión lo ve sin conexión a los ms', seenOffAt);
  const t1 = Date.now();
  await b.context.setOffline(false);
  let backAt = null;
  const statusAfter = [];
  while (Date.now() - t1 < 90_000) {
    const s = await netStatus(b);
    if (statusAfter.at(-1) !== s) statusAfter.push(`${Date.now() - t1}ms:${s}`);
    const r = (await rows(host)).find((x) => x.name === 'Beto');
    if (r && !r.off && s === 'Conectado') {
      backAt = Date.now() - t1;
      break;
    }
    await sleep(500);
  }
  log('tras volver la red: estados de Beto', statusAfter, 'reconectado a los ms', backAt);
  check('S2 tras el corte de red, Beto vuelve solo (≤ 30 s) y sigue listo', backAt !== null && backAt <= 30_000 && (await stateOf(host, 'Beto')) === 'Listo', { seenOffAt, backAt, statusAfter });
} catch (e) {
  check('EXCEPCIÓN', false, e.stack?.split('\n').slice(0, 3).join(' | '));
} finally {
  for (const p of ps) log(`consola ${p.label}`, p.console);
  save();
  await browser.close();
}
