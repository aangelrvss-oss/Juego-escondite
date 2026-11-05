// QA · sonda: capturar al ANFITRIÓN (y luego a otro fugitivo) registrando todos los avisos del cazador.
// Uso: node QA/ciclo-ux-202611/qa/sonda-captura.mjs http://127.0.0.1:8831
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, pressReady, sleep, until } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const { check, log, save } = makeRecorder('sonda-captura');
const browser = await launch();
const ps = [];
let on = true;
(async () => {
  let k = 0;
  while (on) {
    k++;
    for (const p of ps) await p.context.setGeolocation({ latitude: p.pos.lat + ((k % 2) * 1.5) / 111_320, longitude: p.pos.lng, accuracy: 6 }).catch(() => {});
    await sleep(2000);
  }
})();
const watchToasts = (p) =>
  p.page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(() => {
      for (const t of document.querySelectorAll('.toast')) if (!window.__toasts.includes(t.textContent.trim())) window.__toasts.push(t.textContent.trim());
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
try {
  const host = await newPlayer(browser, base, { label: 'host', width: 412, pos: MADRID });
  const beto = await newPlayer(browser, base, { label: 'beto', width: 360, pos: offset(MADRID, 4, 2) });
  const caro = await newPlayer(browser, base, { label: 'caro', width: 360, pos: offset(MADRID, -3, 2) });
  ps.push(host, beto, caro);
  await enterHome(host, { name: 'Ana Host', create: true });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  await enterHome(beto, { name: 'Beto', code });
  await enterHome(caro, { name: 'Caro', code });
  await pressReady(beto);
  await pressReady(caro);
  await host.page.click('[data-act="manage"]');
  await host.page.selectOption('select[aria-label="Rol de Beto"]', 'hunter');
  await host.page.selectOption('select[aria-label="Rol de Caro"]', 'runner');
  await host.page.selectOption('select[aria-label="Rol de Ana Host"]', 'runner');
  await sleep(800);
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  await host.page.click('[data-act="start-now"]');
  for (const p of ps) await until(() => p.page.$('[data-act="leave-game"]'), `${p.label} en partida`, 30_000);
  for (const p of ps) await watchToasts(p);
  log('esperando la persecución…');
  await until(() => beto.page.$('[data-claim]'), 'fase ACTIVE', 170_000, 1000);
  for (const p of ps) await p.page.$('.overlay.reveal').then((r) => r?.click()).catch(() => {});
  await sleep(1500);
  const ids = await beto.page.$$eval('[data-claim]', (l) => Object.fromEntries(l.map((x) => [x.textContent.trim(), x.dataset.claim])));
  log('botones de captura', ids);
  for (const target of ['Ana Host', 'Caro']) {
    const tp = target === 'Caro' ? caro : host;
    const id = await until(() => beto.page.$$eval('[data-claim]', (l, n) => l.find((x) => x.textContent.trim() === n)?.dataset.claim, target), `botón ${target}`, 40_000, 500);
    await beto.page.click(`[data-claim="${id}"]`);
    const seen = await until(() => tp.page.$('.claim-sheet'), `reclamación a ${target}`, 12_000).then(() => true).catch(() => false);
    log(`reclamación a ${target}: vista=${seen}; avisos del cazador`, await beto.page.evaluate(() => window.__toasts));
    check(`S3 reclamar a ${target} llega a su pantalla`, seen, await beto.page.evaluate(() => window.__toasts));
    if (seen) await tp.page.click('[data-respond="yes"]');
    await sleep(2500);
  }
} catch (e) {
  check('EXCEPCIÓN', false, e.stack?.split('\n').slice(0, 3).join(' | '));
} finally {
  on = false;
  save();
  await browser.close();
}
