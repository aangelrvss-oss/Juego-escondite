import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BridgeError, INTERVAL, PERMISSION_LOCATION, PERMISSION_NOTIFICATIONS, PLUGIN_NAME,
  createLocationBridge, normalizePermissions, normalizeReading, normalizeStatus,
} from '../www/js/location-bridge.js';

const contract = JSON.parse(readFileSync(new URL('../contract/location-bridge.json', import.meta.url), 'utf8'));

// Lectura válida según el contrato (lo que enviaría el módulo nativo).
const validRaw = () => ({
  sessionId: 's-1', lat: 40.41531, lng: -3.68452, accuracyM: 7.5, ageMs: 420, receivedAt: 1_700_000_000_000,
  measuredAt: 1_699_999_999_580, provider: 'fused', isMock: false, speedMps: 1.4,
});

// Módulo nativo simulado con la forma de un plugin de Capacitor.
function fakePlugin(overrides = {}) {
  const listeners = {};
  const calls = [];
  const plugin = {
    calls,
    emit: (event, data) => (listeners[event] ?? []).forEach((l) => l(data)),
    addListener: async (event, l) => {
      (listeners[event] ??= []).push(l);
      return { remove: async () => {} };
    },
    checkPermissions: async () => ({ location: 'precise', notifications: 'granted' }),
    requestPermissions: async () => ({ location: 'approximate', notifications: 'denied' }),
    getProviderStatus: async () => ({ locationEnabled: true, provider: 'fused', fusedAvailable: true, gpsEnabled: true }),
    startSession: async (args) => (calls.push(['startSession', args]), { running: true, sessionId: 's-1', intervalMs: args.intervalMs, fixes: 0, gaps: 0, gapOpen: false, provider: 'fused', lastError: null, message: null }),
    stopSession: async () => ({ running: false, sessionId: 's-1', intervalMs: 5000, fixes: 3, gaps: 0, gapOpen: false, provider: 'fused', lastError: null, message: null }),
    getStatus: async () => ({ running: false }),
    exportSession: async () => ({ saved: true, name: 'outrun-1.csv' }),
    ...overrides,
  };
  return plugin;
}

test('el puente usa el nombre, los intervalos y los estados del contrato', () => {
  assert.equal(PLUGIN_NAME, contract.plugin);
  assert.deepEqual({ ...INTERVAL }, { minMs: contract.interval.minMs, maxMs: contract.interval.maxMs, defaultMs: contract.interval.defaultMs });
  assert.deepEqual([...PERMISSION_LOCATION], contract.enums.permissionLocation);
  assert.deepEqual([...PERMISSION_NOTIFICATIONS], contract.enums.permissionNotifications);
});

test('una lectura válida se normaliza con exactamente los campos del contrato', () => {
  const r = normalizeReading(validRaw());
  assert.deepEqual(Object.keys(r).sort(), Object.keys(contract.types.Reading).sort());
  assert.equal(r.isMock, false);
  assert.equal(normalizeReading({ ...validRaw(), isMock: true }).isMock, true, 'se conserva isMock');
  assert.equal(normalizeReading({ ...validRaw(), accuracyM: null }).accuracyM, null, 'precisión desconocida, no inventada');
  assert.equal(normalizeReading({ ...validRaw(), speedMps: undefined }).speedMps, null);
});

test('las lecturas que no cumplen el contrato se descartan', () => {
  const bad = [
    null, {}, { ...validRaw(), lat: undefined }, { ...validRaw(), lat: NaN }, { ...validRaw(), lat: 91 },
    { ...validRaw(), lng: -181 }, { ...validRaw(), ageMs: -1 }, { ...validRaw(), receivedAt: 'ayer' },
    { ...validRaw(), sessionId: '' }, { ...validRaw(), lat: '40.4' },
  ];
  for (const raw of bad) assert.equal(normalizeReading(raw), null, JSON.stringify(raw));
});

test('estado y permisos desconocidos se normalizan a valores seguros', () => {
  assert.deepEqual(normalizePermissions({ location: 'whatever', notifications: 7 }), { location: 'prompt', notifications: 'prompt' });
  const s = normalizeStatus(undefined);
  assert.equal(s.running, false);
  assert.equal(s.intervalMs, INTERVAL.defaultMs);
  assert.deepEqual(Object.keys(s).sort(), Object.keys(contract.types.Status).sort());
});

test('el puente valida el intervalo antes de llamar al módulo nativo', async () => {
  const plugin = fakePlugin();
  const bridge = createLocationBridge(plugin);
  for (const bad of [0, 999, 60_001, 2.5, '5000']) {
    await assert.rejects(bridge.start(bad), (e) => e instanceof BridgeError && e.code === 'invalid_interval');
  }
  assert.equal(plugin.calls.length, 0);
  const st = await bridge.start(2_000);
  assert.deepEqual(plugin.calls, [['startSession', { intervalMs: 2_000 }]]);
  assert.equal(st.running, true);
  assert.equal(st.intervalMs, 2_000);
});

test('los errores nativos conservan su código del contrato', async () => {
  for (const code of contract.enums.errors) {
    const bridge = createLocationBridge(fakePlugin({ startSession: async () => { const e = new Error('x'); e.code = code; throw e; } }));
    await assert.rejects(bridge.start(5_000), (e) => e instanceof BridgeError && e.code === code);
  }
  const bridge = createLocationBridge(fakePlugin({ stopSession: async () => { throw new Error('sin código'); } }));
  await assert.rejects(bridge.stop(), (e) => e.code === 'native_error');
});

test('sin módulo nativo, todo falla con «unavailable» y los listeners no hacen nada', async () => {
  const bridge = createLocationBridge(null);
  assert.equal(bridge.available, false);
  await assert.rejects(bridge.checkPermissions(), (e) => e.code === 'unavailable');
  const sub = await bridge.onReading(() => assert.fail('no debe llamarse'));
  await sub.remove();
});

test('los eventos de lectura solo entregan lecturas válidas; las inválidas se notifican aparte', async () => {
  const plugin = fakePlugin();
  const bridge = createLocationBridge(plugin);
  const got = [];
  const invalid = [];
  await bridge.onReading((r) => got.push(r), (raw) => invalid.push(raw));
  plugin.emit('reading', validRaw());
  plugin.emit('reading', { ...validRaw(), lat: null });
  assert.equal(got.length, 1);
  assert.equal(invalid.length, 1);
  const statuses = [];
  await bridge.onStatus((s) => statuses.push(s));
  plugin.emit('status', { running: true, lastError: 'provider_disabled' });
  assert.equal(statuses[0].lastError, 'provider_disabled');
});

test('permisos, proveedor y exportación pasan por el puente normalizados', async () => {
  const bridge = createLocationBridge(fakePlugin());
  assert.deepEqual(await bridge.checkPermissions(), { location: 'precise', notifications: 'granted' });
  assert.deepEqual(await bridge.requestPermissions(), { location: 'approximate', notifications: 'denied' });
  assert.equal((await bridge.providerStatus()).provider, 'fused');
  assert.deepEqual(await bridge.exportSession(), { saved: true, name: 'outrun-1.csv' });
});
