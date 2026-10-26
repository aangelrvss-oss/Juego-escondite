// Regresión del bloqueo de H1: «ningún botón funciona» en la app Android.
// Usa el runtime REAL de @capacitor/core (el mismo archivo que se copia a www/vendor), no un objeto
// plano: el defecto está en el proxy de registerPlugin, que responde también a «then». El lado nativo
// (androidBridge) se simula como lo prepara native-bridge.js; esto no prueba el código Java real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_NAME, createLocationBridge, nativePlugin } from '../www/js/location-bridge.js';

const METHODS = ['checkPermissions', 'requestPermissions', 'getProviderStatus', 'startSession', 'stopSession', 'getStatus', 'exportSession'];
const nativeCalls = [];

// Lo que inyecta Capacitor Android antes de la página: el puente y la cabecera de cada plugin nativo.
globalThis.androidBridge = { postMessage() {} };
globalThis.Capacitor = {
  PluginHeaders: [PLUGIN_NAME, 'ProxyDeEjemplo'].map((name) => ({
    name,
    methods: [...METHODS.map((m) => ({ name: m, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener' }],
  })),
  nativePromise: async (plugin, method) => {
    nativeCalls.push(`${plugin}.${method}`);
    return method === 'getProviderStatus' ? { locationEnabled: true, provider: 'fused', fusedAvailable: true, gpsEnabled: true } : {};
  },
  nativeCallback: (plugin, method) => (nativeCalls.push(`${plugin}.${method}`), 'cb-1'),
};
const core = await import('../node_modules/@capacitor/core/dist/index.js');
const loadCore = async () => core;
const exampleProxy = core.registerPlugin('ProxyDeEjemplo');

const settles = (promise, ms = 300) => Promise.race([
  promise.then(() => true, () => true),
  new Promise((resolve) => setTimeout(() => resolve(false), ms)),
]);

test('el proxy real de Capacitor es «thenable» y nunca llama a resolve ni a reject', async () => {
  const proxy = exampleProxy;
  assert.equal(typeof proxy.then, 'function');
  // Es lo que hace JavaScript al resolver una promesa con el proxy: llamar a then(resolve, reject).
  let called = false;
  const inner = proxy.then(() => (called = true), () => (called = true));
  await assert.rejects(inner, /"ProxyDeEjemplo\.then\(\)" is not implemented on android/);
  assert.equal(called, false, 'Capacitor trata «then» como un método nativo y no avisa a la promesa');
});

test('el patrón antiguo (devolver el proxy desde una función async) deja la promesa pendiente', async () => {
  const oldPattern = async () => exampleProxy; // lo que hacía nativePlugin() en dc05d46
  // El rechazo interno no lo recoge nadie: es el defecto. Se captura aquí para que no cuente como
  // un fallo inesperado del ejecutor de pruebas, y se restauran sus manejadores al terminar.
  const previous = process.listeners('unhandledRejection');
  const unhandled = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => unhandled.push(e && e.message));
  try {
    assert.equal(await settles(oldPattern()), false, 'la promesa debería quedarse pendiente');
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (const l of previous) process.on('unhandledRejection', l);
  }
  assert.deepEqual(unhandled, ['"ProxyDeEjemplo.then()" is not implemented on android']);
});

test('nativePlugin() termina y entrega el plugin envuelto en { plugin }', async () => {
  const pending = nativePlugin(loadCore);
  assert.equal(await settles(pending), true, 'nativePlugin() no terminó');
  const { plugin } = await pending;
  assert.ok(plugin, 'en la plataforma Android simulada debe haber plugin');
  assert.equal(core.Capacitor.getPlatform(), 'android');
});

test('con el plugin real del proxy, el puente llega al módulo nativo', async () => {
  const { plugin } = await nativePlugin(loadCore);
  const bridge = createLocationBridge(plugin);
  assert.equal(bridge.available, true);
  nativeCalls.length = 0;
  await bridge.onReading(() => {});
  await bridge.onStatus(() => {});
  const provider = await bridge.providerStatus();
  assert.equal(provider.provider, 'fused');
  assert.deepEqual(nativeCalls, [`${PLUGIN_NAME}.addListener`, `${PLUGIN_NAME}.addListener`, `${PLUGIN_NAME}.getProviderStatus`]);
});

test('fuera de la app (sin puente Android), nativePlugin() termina con { plugin: null }', async () => {
  const saved = globalThis.androidBridge;
  delete globalThis.androidBridge;
  try {
    assert.deepEqual(await nativePlugin(loadCore), { plugin: null });
  } finally {
    globalThis.androidBridge = saved;
  }
});
