// Prueba de extremo a extremo del arranque de la pantalla de diagnóstico (regresión del bloqueo de H1),
// con el Chromium y el Playwright preinstalados en el entorno. NO forma parte de las dependencias del
// proyecto. Carga la interfaz con el native-bridge.js REAL de @capacitor/android y el runtime real de
// @capacitor/core (www/vendor); solo el lado nativo (androidBridge) está simulado, así que no prueba
// el código Java ni la WebView del móvil.
// Uso: node e2e/boot.e2e.cjs [carpeta-web] [native-bridge.js]
//   Por defecto, mobile/www. Para comprobar un APK, pasa su assets/public y su assets/native-bridge.js.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(process.argv[2] ?? path.join(__dirname, '../www'));
const bridgeFile = path.resolve(process.argv[3] ?? path.join(__dirname, '../node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'));
if (!fs.existsSync(path.join(root, 'vendor/capacitor-core.js'))) throw new Error(`Falta ${root}/vendor/capacitor-core.js: ejecuta «npm run vendor»`);
const nativeBridgeJs = fs.readFileSync(bridgeFile, 'utf8');

const PLUGIN = 'OutrunLocation';
const PROMISE_METHODS = ['checkPermissions', 'requestPermissions', 'getProviderStatus', 'startSession', 'stopSession', 'getStatus', 'exportSession'];
// Cabecera como la genera JSExport: addListener/removeListener son RETURN_NONE (sin «rtype»).
const HEADER = { name: PLUGIN, methods: [...PROMISE_METHODS.map((name) => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener' }] };
const RESPONSES = {
  checkPermissions: { location: 'prompt', notifications: 'prompt' },
  getProviderStatus: { locationEnabled: true, provider: 'fused', fusedAvailable: true, gpsEnabled: true },
  getStatus: { running: false, fixes: 0, gaps: 0 },
};

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '/index.html');
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

// Lo que Capacitor Android inyecta antes de la página: el puente nativo y las cabeceras de los plugins.
// El lado nativo simulado responde a las llamadas «promise» y, como Plugin.addListener, no responde a addListener.
const nativeSide = (headers) => `
  window.__calls = [];
  window.androidBridge = { postMessage(json) {
    const c = JSON.parse(json);
    window.__calls.push(c.pluginId + '.' + c.methodName);
    if (c.methodName === 'addListener' || c.methodName === 'removeListener') return;
    const data = (${JSON.stringify(RESPONSES)})[c.methodName] ?? {};
    setTimeout(() => window.Capacitor.fromNative({ callbackId: c.callbackId, pluginId: c.pluginId, methodName: c.methodName, success: true, data }), 5);
  } };
  ${nativeBridgeJs}
  window.Capacitor.PluginHeaders = ${JSON.stringify(headers)};`;

const screen = (page) => page.evaluate(() => ({
  permLocation: document.getElementById('perm-location')?.textContent ?? null,
  provider: document.getElementById('provider')?.textContent ?? null,
  log: [...document.querySelectorAll('#log li')].map((li) => li.textContent.replace(/^\S+ · /, '')),
  calls: window.__calls,
}));

async function scenario(browser, base, name, { headers = [HEADER], vendor = 'ok' } = {}, check) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript({ content: nativeSide(headers) });
  if (vendor === 'missing') await page.route('**/vendor/capacitor-core.js', (r) => r.fulfill({ status: 404, body: '' }));
  if (vendor === 'hang') await page.route('**/vendor/capacitor-core.js', () => {}); // no responde nunca
  await page.goto(base);
  await check(page, pageErrors);
  await page.close();
  console.log(`ok · ${name}`);
}

// Sin módulo nativo utilizable, pulsar «Comprobar de nuevo» debe anotar su error en «Incidencias».
async function clickCheckAgainResponds(page) {
  const before = await screen(page);
  await page.click('#btn-provider');
  await page.waitForFunction((n) => document.querySelectorAll('#log li').length > n, before.log.length, { timeout: 2000 });
  return { before, after: await screen(page) };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    await scenario(browser, base, 'app con módulo nativo: arranca, se suscribe y «Comprobar de nuevo» llama a getProviderStatus', {}, async (page, pageErrors) => {
      // render() pinta el estado inicial enseguida; se espera a que lleguen las respuestas nativas.
      await page.waitForFunction(() => window.__calls.length >= 5 && document.getElementById('provider')?.textContent.startsWith('Activada'), null, { timeout: 3000 });
      const s = await screen(page);
      assert.equal(s.permLocation, 'Sin pedir todavía');
      assert.match(s.provider, /^Activada · proveedor fusionado/);
      assert.deepEqual(s.calls, ['addListener', 'addListener', 'checkPermissions', 'getProviderStatus', 'getStatus'].map((m) => `${PLUGIN}.${m}`));
      await page.click('#btn-provider');
      await page.waitForFunction(() => window.__calls.length === 6, null, { timeout: 2000 });
      assert.equal((await screen(page)).calls[5], `${PLUGIN}.getProviderStatus`);
      assert.deepEqual(s.log, [], 'sin incidencias');
      assert.deepEqual(pageErrors, []);
    });

    await scenario(browser, base, 'plugin nativo sin registrar: el error se ve en «Incidencias» y los botones siguen respondiendo', { headers: [] }, async (page, pageErrors) => {
      await page.waitForFunction(() => document.querySelectorAll('#log li').length >= 3, null, { timeout: 3000 });
      const { before, after } = await clickCheckAgainResponds(page);
      assert.ok(before.log.some((l) => l.startsWith('No se recibirán lecturas del módulo nativo')), before.log.join(' | '));
      assert.ok(before.log.some((l) => l.startsWith('No se recibirá el estado de la sesión')), before.log.join(' | '));
      assert.equal(after.log.length, before.log.length + 1, 'la pulsación debe anotar su error');
      assert.deepEqual(pageErrors, []);
    });

    await scenario(browser, base, 'Capacitor no se puede cargar: se explica y los botones siguen respondiendo', { vendor: 'missing' }, async (page, pageErrors) => {
      await page.waitForFunction(() => document.querySelectorAll('#log li').length >= 1, null, { timeout: 3000 });
      const { before, after } = await clickCheckAgainResponds(page);
      assert.ok(before.log.some((l) => l.startsWith('No se pudo conectar con el módulo nativo')), before.log.join(' | '));
      assert.equal(after.log.length, before.log.length + 1);
      assert.deepEqual(pageErrors, []);
    });

    await scenario(browser, base, 'Capacitor no responde: a los 5 s se explica y los botones siguen respondiendo', { vendor: 'hang' }, async (page, pageErrors) => {
      await page.waitForFunction(() => document.querySelectorAll('#log li').length >= 1, null, { timeout: 8000 });
      const { before, after } = await clickCheckAgainResponds(page);
      assert.ok(before.log.some((l) => l.includes('sin respuesta en 5 s')), before.log.join(' | '));
      assert.equal(after.log.length, before.log.length + 1);
      assert.deepEqual(pageErrors, []);
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log('Arranque: 4/4 escenarios correctos');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
