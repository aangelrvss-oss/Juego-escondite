// Arquitecto · sonda: tras un corte de red de 45 s (context.setOffline), ¿el anfitrión ve al jugador
// «sin conexión» DESPUÉS de que haya reconectado? Muestrea durante 90 s el estado visto por el anfitrión
// y el estado de red del jugador. Uso: node QA/ciclo-ux-202611/qa/sonda-socket-viejo.mjs http://127.0.0.1:8842
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, pressReady, rows, sleep, until, netStatus } from './lib.mjs';

const base = process.argv[2];
const { check, log, save } = makeRecorder('sonda-socket-viejo');
const browser = await launch();
try {
  const host = await newPlayer(browser, base, { label: 'host', width: 412 });
  const b = await newPlayer(browser, base, { label: 'b', width: 360, pos: offset(MADRID, 3, 0) });
  await enterHome(host, { name: 'Ana Host', create: true });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  await enterHome(b, { name: 'Beto', code });
  await pressReady(b);
  await b.context.setOffline(true);
  await sleep(45_000);
  await b.context.setOffline(false);
  const t1 = Date.now();
  const timeline = [];
  let reconnectedAt = null;
  let offAfterReconnect = null;
  while (Date.now() - t1 < 90_000) {
    const s = await netStatus(b);
    const r = (await rows(host)).find((x) => x.name === 'Beto');
    const line = `${Math.round((Date.now() - t1) / 1000)}s red=${s} anfitrión=${r?.off ? 'SIN CONEXIÓN' : 'conectado'} estado=${r?.state}`;
    if (timeline.at(-1)?.slice(timeline.at(-1).indexOf(' ')) !== line.slice(line.indexOf(' '))) timeline.push(line);
    if (s === 'Conectado' && reconnectedAt === null) reconnectedAt = Date.now() - t1;
    if (reconnectedAt !== null && r?.off && offAfterReconnect === null) offAfterReconnect = Date.now() - t1;
    await sleep(1000);
  }
  log('cronología tras volver la red', timeline);
  check('V1 tras reconectar, el anfitrión no vuelve a verlo «sin conexión»', offAfterReconnect === null, { reconnectedAt, offAfterReconnect, timeline });
} catch (e) {
  check('EXCEPCIÓN', false, e.stack?.split('\n').slice(0, 3).join(' | '));
} finally {
  save();
  await browser.close();
}
