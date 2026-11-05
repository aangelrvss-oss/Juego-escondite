// QA · sonda: diferencias del Mission Report entre jugadores y tras recargar (partida terminada por el anfitrión).
// Uso: node QA/ciclo-ux-202611/qa/sonda-informe.mjs http://127.0.0.1:8831
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOGS, MADRID, codeOf, enterHome, launch, newPlayer, offset, pressReady, sleep, until } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const browser = await launch();
const out = {};
try {
  const host = await newPlayer(browser, base, { label: 'host', width: 412 });
  const b = await newPlayer(browser, base, { label: 'b', width: 360, pos: offset(MADRID, 3, 0) });
  await enterHome(host, { name: 'Ana Host', create: true });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  await enterHome(b, { name: 'Beto', code });
  await pressReady(b);
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  await host.page.click('[data-act="start-now"]');
  await until(() => host.page.$('[data-act="end"]'), 'en partida', 20_000);
  await sleep(1500);
  await host.page.click('[data-act="end"]');
  await host.page.click('[data-act="end"]');
  await until(async () => (await host.page.$('.card.result')) && (await b.page.$('.card.result')), 'informe', 20_000);
  await sleep(1500);
  const txt = (p) => p.page.$eval('.card.result', (e) => e.innerText);
  out.host = await txt(host);
  out.b = await txt(b);
  out.bHtml = await b.page.$eval('.card.result', (e) => e.outerHTML);
  await sleep(3000);
  out.bLater = await txt(b);
  await b.page.reload();
  await b.page.waitForSelector('.card.result');
  await sleep(1500);
  out.bReload = await txt(b);
  out.bReloadHtml = await b.page.$eval('.card.result', (e) => e.outerHTML);
} finally {
  writeFileSync(join(LOGS, 'sonda-informe.json'), JSON.stringify(out, null, 2));
  await browser.close();
}
