// QA · Infección con 4 jugadores: empezar, y el único cazador abandona en la huida (causa hunters_abandoned).
// Además: abandono durante la cuenta atrás (vuelta a la sala) y texto que ve el anfitrión.
// Uso: node QA/ciclo-ux-202611/qa/e2e-infeccion.mjs http://127.0.0.1:8831
import { MADRID, codeOf, enterHome, launch, makeRecorder, newPlayer, offset, pressReady, shot, sleep, until } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const { check, log, save } = makeRecorder('e2e-infeccion');
const browser = await launch();
const ps = [];
const COORD = /-?\d{1,3}[.,]\d{4,}/;
const reportText = (p) => p.page.$eval('.card.result', (e) => e.innerText.replace(/ (Tú|TÚ)(?=\s|$)/g, '').replace(/\s+/g, ' ').trim());
async function start(host) {
  await host.page.waitForSelector('[data-act="start"]:not([disabled])', { timeout: 20_000 });
  await host.page.click('[data-act="start"]');
  await host.page.waitForSelector('.start-sheet');
  if (!(await host.page.isChecked('#start-safety'))) await host.page.check('#start-safety');
  await host.page.click('[data-act="start-now"]');
}
try {
  const host = await newPlayer(browser, base, { label: 'host', width: 412, pos: MADRID });
  await enterHome(host, { name: 'Ana Host', create: true, mode: 'infection' });
  const code = await codeOf(host);
  await until(() => host.page.$('[data-act="edit-config"]'), 'autocentrado', 25_000);
  const modeRow = await host.page.$eval('.cfg-summary', (e) => e.innerText);
  check('I0 el modo elegido en el inicio (Infección) llega a la sala', /Infecci/.test(modeRow), modeRow.replace(/\s+/g, ' ').slice(0, 60));
  for (const [n, w, d] of [['Beto', 360, 3], ['Caro', 320, -3], ['Dani', 412, 5]]) {
    const p = await newPlayer(browser, base, { label: n, width: w, pos: offset(MADRID, d, 1) });
    p.name = n;
    ps.push(p);
    await enterHome(p, { name: n, code });
  }
  ps.unshift(host);
  for (const p of ps.slice(1)) await pressReady(p);
  await host.page.click('[data-act="manage"]');
  await host.page.selectOption('select[aria-label="Rol de Dani"]', 'hunter');
  for (const n of ['Beto', 'Caro', 'Ana Host']) await host.page.selectOption(`select[aria-label="Rol de ${n}"]`, 'runner');
  await sleep(800);
  // 1) abandono en la cuenta atrás
  await start(host);
  const dani = ps.find((p) => p.name === 'Dani');
  await until(() => dani.page.$('.countdown'), 'cuenta atrás', 15_000);
  await dani.page.click('[data-act="leave-game"]').catch(() => {});
  await dani.page.click('[data-act="leave-game"]').catch(() => {});
  await until(() => host.page.$('.code-card'), 'vuelta a la sala', 20_000);
  await sleep(800);
  const notice = await host.page.$eval('.msg.warn[role="status"]', (e) => e.textContent.trim()).catch(() => null);
  log('aviso del anfitrión tras abortar la cuenta atrás', notice);
  const hostHasReady = Boolean(await host.page.$('[data-act="ready"]'));
  check('I1 el aviso al anfitrión no le pide un botón que no tiene («Estoy listo»)', !(/«Estoy listo»/.test(notice ?? '') && !hostHasReady), { notice, hostHasReady });
  await shot(host, 'sala-412-aviso-cuenta-atras-cancelada');
  // Dani vuelve a entrar
  await dani.page.waitForSelector('#f-name', { timeout: 15_000 });
  await enterHome(dani, { name: 'Dani', code });
  for (const p of ps.slice(1)) if ((await p.page.textContent('[data-act="ready"]')).trim() === 'Estoy listo') await pressReady(p);
  if (!(await host.page.$('select[aria-label="Rol de Dani"]'))) await host.page.click('[data-act="manage"]');
  await host.page.selectOption('select[aria-label="Rol de Dani"]', 'hunter');
  await sleep(800);
  // 2) abandono del único cazador en la huida
  await start(host);
  await until(() => dani.page.$('.overlay.reveal, .role-tag, [data-act="leave-game"]:not(.countdown *)'), 'huida', 20_000);
  await until(async () => !(await dani.page.$('.countdown')), 'fin de la cuenta atrás', 20_000);
  await sleep(1500);
  const roleTxt = await dani.page.$eval('.overlay.reveal', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
  log('rol de Dani', roleTxt);
  await dani.page.$('.overlay.reveal').then((r) => r?.click()).catch(() => {});
  await sleep(500);
  await dani.page.click('[data-act="leave-game"]');
  await dani.page.click('[data-act="leave-game"]');
  const others = ps.filter((p) => p !== dani);
  await until(async () => {
    for (const p of others) if (!(await p.page.$('.card.result'))) return false;
    return true;
  }, 'informe en los 3 restantes', 30_000);
  await sleep(1000);
  const t = [];
  for (const p of others) t.push(await reportText(p));
  check('C P4 Infección: informe idéntico en los 3', t.every((x) => x === t[0]), t.map((x) => x.slice(0, 200)));
  log('informe P4', t[0]);
  check('C P4 Infección: causa de abandono de los cazadores, sin coordenadas', /abandon/i.test(t[0]) && /Infecci/i.test(t[0]) && !COORD.test(t[0]), t[0].slice(0, 250));
  await shot(host, 'informe-412-infeccion-abandono');
  const st = await ps[1].page.evaluate(() => JSON.parse(localStorage.getItem('outrun.stats')));
  check('C P4: historial de Beto = 1 partida (Infección)', st?.games === 1 && st.byMode.infection.games === 1, st);
} catch (e) {
  check('EXCEPCIÓN', false, e.stack?.split('\n').slice(0, 3).join(' | '));
  for (const p of ps) await shot(p, `error-infeccion-${p.label}`);
} finally {
  for (const p of ps) check(`D3 errores de consola (${p.label})`, p.errors.filter((x) => !/403|vibrate/.test(x)).length === 0, p.errors);
  save();
  await browser.close();
}
