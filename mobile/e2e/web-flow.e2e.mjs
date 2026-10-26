// Flujo web real de una sala (Plan Maestro D-002, §2.2 y §4.4): enlace de invitación, QR, cambio de
// código y una partida corta hasta el Mission Report, que se vuelve a abrir tras recargar la página.
// Servidor real (127.0.0.1, puerto aleatorio, solo este ordenador) con su reloj controlado por la
// prueba, y Chrome o Edge sin interfaz controlado por el protocolo DevTools (sin Playwright ni
// dependencias). Cada jugador va en un contexto aislado (almacenamiento propio, como móviles
// distintos), con la geolocalización EMULADA. Uso, desde la raíz:
//   node mobile/e2e/web-flow.e2e.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"
// LÍMITES: no es un móvil; el QR se lee con un lector de prueba, no con una cámara (AC-A6); el paso
// del tiempo y las posiciones son simulados.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const chromePath = process.argv[2] ?? process.env.CHROME_PATH;
if (!chromePath) throw new Error('Indica la ruta de Chrome o Edge (argumento o CHROME_PATH)');
const profile = join(tmpdir(), `outrun-web-flow-e2e-${process.pid}`);
const imp = (p) => import(pathToFileURL(join(repo, p)).href);
const { startServer } = await imp('server/main.ts');
const qr = await imp('mobile/www/js/qr.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

// Reloj del servidor controlado: la cuenta atrás (5 s) y la huida (2 min) se adelantan sin esperar.
const clock = { t: Date.now() };
const server = await startServer({ port: 0, host: '127.0.0.1', hub: { now: () => clock.t } });
const advance = async (ms) => {
  clock.t += ms;
  server.pump();
  await sleep(300);
};
console.log('servidor', server.url);
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();

  // Conexión al navegador para crear un contexto aislado por jugador (almacenamiento propio: como
  // móviles distintos; en el mismo perfil, el segundo reanudaría la sesión guardada del primero).
  const { webSocketDebuggerUrl: browserWs } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const bws = new WebSocket(browserWs);
  await new Promise((r) => bws.addEventListener('open', r, { once: true }));
  let bid = 0;
  const bwait = new Map();
  bws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && bwait.has(m.id)) (bwait.get(m.id)(m), bwait.delete(m.id));
  });
  const bsend = (method, params = {}) => new Promise((r) => (bwait.set(++bid, r), bws.send(JSON.stringify({ id: bid, method, params }))));

  async function newPage(url, { geolocation = true } = {}) {
    const { result: ctx } = await bsend('Target.createBrowserContext', { disposeOnDetach: true });
    const { result: created } = await bsend('Target.createTarget', { url, browserContextId: ctx.browserContextId });
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.id === created.targetId);
      if (!target) await sleep(100);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const waiting = new Map();
    const errors = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && waiting.has(msg.id)) {
        waiting.get(msg.id)(msg);
        waiting.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? 'error');
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(JSON.stringify(msg.params.args.map((a) => a.value)));
    });
    const send = (method, params = {}) =>
      new Promise((r) => {
        waiting.set(++id, r);
        ws.send(JSON.stringify({ id, method, params }));
      });
    await send('Runtime.enable');
    // Geolocalización EMULADA en el punto de prueba de siempre (fixture de las pruebas del motor).
    if (geolocation) {
      await bsend('Browser.grantPermissions', { origin: server.url, permissions: ['geolocation'], browserContextId: ctx.browserContextId });
      await send('Emulation.setGeolocationOverride', { latitude: 40.4153, longitude: -3.6845, accuracy: 8 });
    } else {
      // Jugador que deniega el permiso de ubicación.
      await bsend('Browser.setPermission', { origin: server.url, permission: { name: 'geolocation' }, setting: 'denied', browserContextId: ctx.browserContextId });
    }
    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate');
      return r.result?.result?.value;
    };
    const waitFor = async (expr, what, ms = 8000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await evaluate(expr).catch(() => false)) return true;
        await sleep(100);
      }
      throw new Error(`timeout: ${what}`);
    };
    return {
      evaluate,
      waitFor,
      errors,
      reload: () => send('Page.reload', {}),
      close: () => ws.close(),
      /** Cierra la pestaña (como cerrar la app): su WebSocket se corta de verdad. */
      closeTab: () => (ws.close(), bsend('Target.closeTarget', { targetId: created.targetId })),
    };
  }

  const click = (sel) => `(document.querySelector(${JSON.stringify(sel)}).click(), true)`;
  const type = (sel, v) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; return true; })()`;

  // Anfitrión: crea la sala.
  const host = await newPage(`${server.url}/`);
  await host.waitFor(`!!document.querySelector('#home-form')`, 'inicio del anfitrión');
  await host.evaluate(type('#f-name', 'Ana'));
  await host.evaluate(`(document.querySelector('[data-act="create"]').click(), true)`);
  await host.waitFor(`!!document.querySelector('.code-card .code')`, 'sala de espera');
  const code1 = await host.evaluate(`document.querySelector('.code-card .code').textContent.trim()`);
  check('el anfitrión crea la sala y ve un código válido', /^[A-HJKMNP-Z2-9]{6}$/.test(code1), code1);
  check('hay botones «Compartir enlace», «Mostrar QR» y «Cambiar el código»', await host.evaluate(`['share','qr','new-code'].every((a) => document.querySelector('[data-act="' + a + '"]'))`));

  // QR: se lee la matriz del SVG y se decodifica (lector de prueba con las piezas exportadas).
  await host.evaluate(click('[data-act="qr"]'));
  await host.waitFor(`!!document.querySelector('.qr-sheet svg.qr')`, 'QR visible');
  const svg = await host.evaluate(`document.querySelector('.qr-sheet svg.qr').outerHTML`);
  const n = Number(/viewBox="0 0 (\d+)/.exec(svg)[1]);
  const size = n - 8;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) modules[Number(y) - 4][Number(x) - 4] = true;
  const version = (size - 17) / 4;
  const fmtCells = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let fv = 0;
  fmtCells.forEach(([x, y], i) => modules[y][x] && (fv |= 1 << i));
  const mask = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => qr.formatBits(k) === fv);
  const { fn } = qr.functionPatterns(version);
  const bits = qr.dataPositions(fn).map(([x, y]) => modules[y][x] !== qr.maskAt(mask, x, y));
  // Versiones de 1 bloque (1-3) o el reparto de la v4 (2 bloques de 32 + 18): basta para una URL corta.
  const blocks = { 1: [1, 16, 10], 2: [1, 28, 16], 3: [1, 44, 26], 4: [2, 32, 18], 5: [2, 43, 24] }[version];
  const cw = [];
  for (let i = 0; i < blocks[0] * (blocks[1] + blocks[2]); i++) cw.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0));
  const data = [];
  for (let b = 0; b < blocks[0]; b++) for (let i = 0; i < blocks[1]; i++) data.push(cw[i * blocks[0] + b]);
  const stream = data.flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (byte >>> i) & 1));
  const take = (k) => stream.splice(0, k).reduce((a, b) => (a << 1) | b, 0);
  take(4);
  const len = take(8);
  const decoded = new TextDecoder().decode(Uint8Array.from({ length: len }, () => take(8)));
  const expectedLink = `${server.url}/?sala=${code1}`;
  check('el QR de la interfaz contiene el enlace de invitación', decoded === expectedLink, `${decoded} (v${version}, máscara ${mask})`);
  await host.evaluate(click('[data-act="close-sheet"]'));

  // Invitado: abre el enlace (como al escanear el QR).
  const guest = await newPage(decoded);
  await guest.waitFor(`!!document.querySelector('#f-code')`, 'inicio del invitado');
  check('el enlace precarga el código en «Unirme»', (await guest.evaluate(`document.querySelector('#f-code').value`)) === code1);
  check('el aviso de invitación muestra la sala', await guest.evaluate(`document.body.textContent.includes('Te han invitado a la sala')`));
  check('el parámetro se quita de la barra de direcciones', !(await guest.evaluate(`location.search.includes('sala=')`)), await guest.evaluate('location.href'));
  await guest.evaluate(type('#f-name', 'Beto'));
  await guest.evaluate(click('[data-act="join"]'));
  await guest.waitFor(`!!document.querySelector('.code-card .code')`, 'invitado en la sala');
  await host.waitFor(`document.querySelectorAll('.players li').length === 2`, 'dos jugadores en la lista del anfitrión');
  check('el invitado entra y ambos ven 2 jugadores', true);
  check('el invitado no ve «Cambiar el código»', !(await guest.evaluate(`!!document.querySelector('[data-act="new-code"]')`)));

  // Cambio de código: dos toques del anfitrión.
  await host.evaluate(click('[data-act="new-code"]'));
  await host.waitFor(`document.querySelector('[data-act="new-code"]').textContent.includes('Toca otra vez')`, 'confirmación');
  await host.evaluate(click('[data-act="new-code"]'));
  await host.waitFor(`document.querySelector('.code-card .code').textContent.trim() !== ${JSON.stringify(code1)}`, 'código nuevo en el anfitrión');
  const code2 = await host.evaluate(`document.querySelector('.code-card .code').textContent.trim()`);
  await guest.waitFor(`document.querySelector('.code-card .code').textContent.trim() === ${JSON.stringify(code2)}`, 'código nuevo en el invitado');
  check('tras confirmar, los dos ven el código nuevo', code2 !== code1, `${code1} → ${code2}`);

  // Un tercero con el enlace antiguo ya no entra; con el nuevo, sí.
  const late = await newPage(`${server.url}/?sala=${code1}`);
  await late.waitFor(`!!document.querySelector('#f-code')`, 'inicio del tercero');
  await late.evaluate(type('#f-name', 'Cris'));
  // Un código mal escrito se rechaza en el propio móvil, sin consultar al servidor.
  const before = code1;
  await late.evaluate(type('#f-code', 'ABC10O'));
  await late.evaluate(click('[data-act="join"]'));
  await late.waitFor(`document.body.textContent.includes('El código tiene 6 letras o números')`, 'aviso de código mal escrito');
  check('un código mal escrito muestra el aviso y no entra', true);
  await late.evaluate(type('#f-code', before));
  await late.evaluate(click('[data-act="join"]'));
  await late.waitFor(`document.body.textContent.includes('No existe ninguna sala con ese código')`, 'error con el código antiguo');
  check('el enlace antiguo ya no sirve («No existe ninguna sala…»)', true);
  await late.evaluate(type('#f-code', code2));
  await late.evaluate(click('[data-act="join"]'));
  await host.waitFor(`document.querySelectorAll('.players li').length === 3`, 'tres jugadores');
  check('con el código nuevo entra el tercero', true);

  // Un cuarto jugador deniega la ubicación: no puede declararse listo y ve por qué (Plan §2.1 paso 4).
  const dani = await newPage(`${server.url}/?sala=${code2}`, { geolocation: false });
  await dani.waitFor(`!!document.querySelector('#f-code')`, 'inicio de Dani');
  await dani.evaluate(type('#f-name', 'Dani'));
  await dani.evaluate(click('[data-act="join"]'));
  await dani.waitFor(`!!document.querySelector('[data-act="ready"]')`, 'Dani en la sala');
  check('antes de estar listo se explica que se comprobará el GPS', await dani.evaluate(`document.body.textContent.includes('se comprueba tu GPS')`));
  await dani.evaluate(click('[data-act="ready"]'));
  await dani.waitFor(`document.body.textContent.includes('Para jugar hace falta permitir la ubicación')`, 'aviso de permiso denegado', 10_000);
  const daniReady = Object.values(server.hub.roomStateByCode(code2).players).find((p) => p.name === 'Dani')?.ready;
  check('sin permiso de ubicación no puede declararse listo', daniReady === false);
  check('quien no es anfitrión ve qué falta para empezar', await guest.evaluate(`document.querySelector('.blockers')?.textContent.includes('Falta que estén listos') && document.querySelector('.blockers').textContent.includes('Dani')`));

  // Dani cierra la app: todos ven que está sin conexión y el anfitrión la expulsa con el botón real.
  await dani.closeTab();
  await guest.waitFor(`document.querySelector('.blockers')?.textContent.includes('Sin conexión: Dani')`, 'los demás ven a Dani sin conexión');
  await host.waitFor(`[...document.querySelectorAll('.msg')].some((m) => m.textContent.includes('Sin conexión: Dani'))`, 'el anfitrión ve a Dani sin conexión');
  check('cuando alguien se desconecta, todos ven quién es', true);
  await host.evaluate(click('button[aria-label="Expulsar a Dani"]'));
  await host.waitFor(`document.querySelectorAll('.players li').length === 3`, 'Dani expulsada');
  check('el anfitrión puede expulsar a quien se ha quedado sin conexión', !Object.values(server.hub.roomStateByCode(code2).players).some((p) => p.name === 'Dani' && p.status === 'lobby'));

  // Partida corta: Ana y Cris cazadores, Beto fugitivo (asignación manual del anfitrión).
  const assign = (name, pref) =>
    `(() => { const el = document.querySelector('select[aria-label="Rol de ${name}"]'); el.value = '${pref}'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;
  await host.evaluate(assign('Ana', 'hunter'));
  await host.evaluate(assign('Beto', 'runner'));
  await host.evaluate(assign('Cris', 'hunter'));
  await host.evaluate(click('[data-act="center"]'));
  await host.waitFor(`document.querySelector('[data-act="center"]')?.textContent.includes('Volver')`, 'zona centrada (geolocalización emulada)');
  await host.evaluate(click('#c-safety'));
  await host.waitFor(`document.querySelector('#c-safety')?.checked`, 'lista de seguridad');
  for (const p of [host, guest, late]) await p.evaluate(click('[data-act="ready"]'));
  await host.waitFor(`!!document.querySelector('[data-act="start"]:not([disabled])')`, 'botón de empezar activo');
  await host.evaluate(click('[data-act="start"]'));
  for (const p of [host, guest, late]) await p.waitFor(`document.body.textContent.includes('La partida empieza en')`, 'cuenta atrás');
  await advance(5_000);
  await guest.waitFor(`document.querySelector('.overlay.reveal')?.textContent.includes('FUGITIVO')`, 'Beto descubre que es fugitivo');
  check('cuenta atrás y revelación privada del rol', true);
  for (const p of [host, guest, late]) await p.evaluate(`(document.querySelector('[data-act="dismiss-reveal"]')?.click(), true)`);
  await advance(2 * 60_000);
  await guest.waitFor(`!!document.querySelector('[data-act="selftag"]')`, 'persecución');
  await advance(75_000); // 1:15 de persecución
  await guest.evaluate(click('[data-act="selftag"]'));
  await guest.waitFor(`!!document.querySelector('[data-selftag]:not([data-selftag=""])')`, 'lista de cazadores');
  await guest.evaluate(`(() => { [...document.querySelectorAll('[data-selftag]')].find((b) => b.textContent.trim() === 'Ana').click(); return true; })()`);

  // Mission Report en los tres, y de nuevo tras recargar la página (reconexión con la sesión guardada).
  const reportOk = `(() => { const r = document.querySelector('.result'); return !!r && r.textContent.includes('Mission Report') && r.textContent.includes('Ganan los cazadores') && r.textContent.includes('Captura decisiva: Beto por Ana a los 1:15'); })()`;
  for (const p of [host, guest, late]) await p.waitFor(reportOk, 'Mission Report');
  const texts = await Promise.all([host, guest, late].map((p) => p.evaluate(`document.querySelector('.result').textContent.replace(/\\s+/g, ' ').trim()`)));
  check('Mission Report igual en los tres móviles', texts.every((x) => x === texts[0]), texts[0].slice(0, 160));
  check('el informe incluye duración y capturas', texts[0].includes('Persecución') && texts[0].includes('1:15') && texts[0].includes('Capturas'));
  await guest.reload();
  await guest.waitFor(reportOk, 'Mission Report tras recargar', 10_000);
  const after = await guest.evaluate(`document.querySelector('.result').textContent.replace(/\\s+/g, ' ').trim()`);
  check('tras recargar, el Mission Report se reconstruye igual', after === texts[0]);

  // Revancha y abandono a mitad de partida con el botón real (Plan Maestro §4.5).
  await host.evaluate(click('[data-act="rematch"]'));
  for (const p of [guest, late]) {
    await p.waitFor(`!!document.querySelector('[data-act="join_rematch"]')`, 'invitación a la revancha');
    await p.evaluate(click('[data-act="join_rematch"]'));
  }
  for (const p of [host, guest, late]) {
    await p.waitFor(`!!document.querySelector('[data-act="ready"]') && document.querySelector('[data-act="ready"]').textContent.includes('Estoy listo')`, 'sala de la revancha');
    await p.evaluate(click('[data-act="ready"]'));
  }
  await host.waitFor(`!!document.querySelector('[data-act="start"]:not([disabled])')`, 'empezar la revancha');
  await host.evaluate(click('[data-act="start"]'));
  await late.waitFor(`!!document.querySelector('[data-act="leave-game"]')`, 'botón de abandonar en la cuenta atrás');
  check('durante la cuenta atrás se puede abandonar', true);
  await advance(5_000);
  for (const p of [host, guest, late]) await p.evaluate(`(document.querySelector('[data-act="dismiss-reveal"]')?.click(), true)`);
  await advance(2 * 60_000);
  await late.waitFor(`document.querySelector('.hud')?.textContent.includes('Persecución')`, 'persecución en la revancha');
  const cris = () => Object.values(server.hub.roomStateByCode(code2)?.players ?? {}).find((p) => p.name === 'Cris');
  await late.waitFor(`!!document.querySelector('[data-act="leave-game"]')`, 'botón de abandonar en la persecución');
  await late.evaluate(click('[data-act="leave-game"]'));
  await late.waitFor(`document.querySelector('[data-act="leave-game"]').textContent.includes('dejarás de compartir tu ubicación')`, 'confirmación de abandono');
  check('el primer toque pide confirmación y avisa de que deja de compartir la ubicación', cris()?.status === 'active');
  await late.evaluate(click('[data-act="leave-game"]'));
  await late.waitFor(`!!document.querySelector('#home-form')`, 'Cris vuelve al inicio');
  check('al confirmar, sale de la partida y vuelve al inicio', cris()?.status === 'left' && cris()?.samples.length === 0, `estado ${cris()?.status}, lecturas ${cris()?.samples.length}`);
  check('la partida sigue para los demás', server.hub.roomStateByCode(code2)?.phase === 'ACTIVE');

  const errs = [...host.errors, ...guest.errors, ...late.errors];
  check('sin errores de JavaScript en las tres páginas', errs.length === 0, errs.join(' | '));
  for (const p of [host, guest, late]) p.close();
} catch (e) {
  check('ejecución', false, e.message);
} finally {
  chrome.kill();
  await server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones superadas`);
process.exitCode = failed ? 1 : 0;
