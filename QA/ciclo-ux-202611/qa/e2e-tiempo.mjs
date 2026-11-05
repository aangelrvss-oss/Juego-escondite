// QA · escenario (c) «tiempo agotado» contra el servidor LOCAL con reloj acelerado (servidor-acelerado.mjs).
// Uso: node QA/ciclo-ux-202611/qa/e2e-tiempo.mjs http://127.0.0.1:8832
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, pressReady, shot, sleep, until } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8832';
const { check, log, save } = makeRecorder('e2e-tiempo');
const browser = await launch();
const ps = [];
const COORD = /-?\d{1,3}[.,]\d{4,}/;
try {
  const host = await newPlayer(browser, base, { label: 'host', width: 412, height: 915 });
  const runner = await newPlayer(browser, base, { label: 'runner', width: 360, height: 740, pos: offset(MADRID, 5, 0) });
  ps.push(host, runner);
  await enterHome(host, { name: 'Ana Host', create: true });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  await enterHome(runner, { name: 'Rita', code });
  await host.page.click('[data-act="edit-config"]');
  await host.page.selectOption('#c-duration', '10');
  await sleep(800);
  await host.page.click('[data-act="edit-config"]');
  await pressReady(runner);
  await host.page.click('[data-act="manage"]');
  await host.page.selectOption('select[aria-label="Rol de Rita"]', 'runner');
  await host.page.selectOption('select[aria-label="Rol de Ana Host"]', 'hunter');
  await sleep(600);
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  await host.page.click('[data-act="start-now"]');
  log('partida empezada; esperando el final por tiempo (≈ 12 min de juego a x8 ≈ 90 s)…');
  await until(async () => (await host.page.$('.card.result')) && (await runner.page.$('.card.result')), 'informe en los dos', 240_000, 1000);
  await sleep(1000);
  const t = [];
  for (const p of ps) t.push(await p.page.$eval('.card.result', (e) => e.innerText.replace(/ (Tú|TÚ)(?=\s|$)/g, '').replace(/\s+/g, ' ').trim()));
  log('informe', t[0]);
  check('C tiempo agotado: informe idéntico en los dos', t[0] === t[1], t);
  check('C tiempo agotado: ganan los fugitivos por tiempo, 0 capturas, libres 1/1', /Ganan los fugitivos/i.test(t[0]) && /tiempo/i.test(t[0]) && /Capturas 0/i.test(t[0]) && /1\/1/.test(t[0]), t[0].slice(0, 400));
  check('C tiempo agotado: sin coordenadas', !COORD.test(t[0]));
  const me = await runner.page.$eval('.result-me', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
  log('Tu partida (Rita)', me);
  await shot(runner, 'informe-360-tiempo-agotado');
  const st = await runner.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.stats')));
  check('C tiempo agotado: historial de Rita = 1 victoria, supervivencia ≈ 10:00', st?.games === 1 && st?.wins === 1 && Math.abs(st.bestSurvivalMs - 600_000) < 30_000, st);
  await runner.page.reload();
  await runner.page.waitForSelector('.card.result');
  await sleep(1200);
  const st2 = await runner.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.stats')));
  check('C tiempo agotado: recargar no duplica el historial', st2?.games === 1, st2);
} catch (e) {
  check('EXCEPCIÓN', false, e.stack?.split('\n').slice(0, 4).join(' | '));
  for (const p of ps) await shot(p, `error-tiempo-${p.label}`);
} finally {
  for (const p of ps) check(`D3 errores de consola (${p.label})`, p.errors.filter((x) => !/403|vibrate/.test(x)).length === 0, p.errors);
  save();
  await browser.close();
}
