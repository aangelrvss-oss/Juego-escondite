import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERROR_TEXT, collectingView, permissionView, providerView, readingView, sessionView } from '../www/js/view-model.js';

const contract = JSON.parse(readFileSync(new URL('../contract/location-bridge.json', import.meta.url), 'utf8'));
const reading = (o = {}) => ({ sessionId: 's', lat: 40.41531, lng: -3.68452, accuracyM: 6, ageMs: 0, receivedAt: 0, measuredAt: 0, provider: 'fused', isMock: false, speedMps: null, ...o });

test('estados de permisos: qué se puede hacer en cada uno', () => {
  assert.deepEqual(
    Object.fromEntries(contract.enums.permissionLocation.map((p) => [p, permissionView({ location: p, notifications: 'granted' }).canStart])),
    { precise: true, approximate: true, denied: false, denied_permanently: false, prompt: false },
  );
  const perm = permissionView({ location: 'denied_permanently', notifications: 'granted' });
  assert.equal(perm.needsSettings, true);
  assert.equal(perm.canRequest, false, 'Android ya no pregunta: se remite a Ajustes');
  assert.match(permissionView({ location: 'approximate', notifications: 'granted' }).location.text, /aproximada/);
  assert.match(permissionView({ location: 'precise', notifications: 'denied' }).notifications.text, /no verás el aviso/);
});

test('proveedor: ubicación desactivada y proveedor fusionado o solo GPS', () => {
  assert.equal(providerView({ locationEnabled: false, provider: 'fused' }).tone, 'danger');
  assert.match(providerView({ locationEnabled: true, provider: 'fused' }).text, /fusionado/);
  assert.match(providerView({ locationEnabled: true, provider: 'gps' }).text, /solo GPS/);
});

test('el indicador de recopilación siempre dice si se usa la ubicación', () => {
  assert.equal(collectingView({ running: true }).tone, 'live');
  assert.match(collectingView({ running: true }).text, /Recopilando ubicación/);
  assert.match(collectingView({ running: false }).text, /No se está recopilando/);
});

test('sin lectura: «No disponible», sin datos inventados', () => {
  const v = readingView(null, 1_000);
  assert.equal(v.label, 'No disponible');
  assert.equal(v.age, '—');
  assert.equal(v.coordinates, null);
  assert.match(v.hint, /no hay ninguna lectura/);
});

test('lectura antigua, imprecisa o caducada nunca aparece como actual', () => {
  assert.equal(readingView(reading(), 3_000).label, 'Actual');
  const old = readingView(reading(), 20_000);
  assert.equal(old.label, 'Antigua');
  assert.match(old.hint, /perdido la señal/);
  const imprecise = readingView(reading({ accuracyM: 120 }), 1_000);
  assert.equal(imprecise.label, 'Imprecisa');
  assert.equal(imprecise.accuracy, '±120 m');
  assert.equal(imprecise.accuracyLabel, 'Insuficiente');
  const unknown = readingView(reading({ accuracyM: null }), 1_000);
  assert.equal(unknown.label, 'Imprecisa');
  assert.equal(unknown.accuracy, 'Desconocida');
  assert.equal(readingView(reading(), 200_000).label, 'No disponible');
});

test('ubicación simulada señalada y coordenadas ocultas salvo que se pidan', () => {
  assert.match(readingView(reading({ isMock: true }), 1_000).mock, /simulada/);
  assert.equal(readingView(reading(), 1_000).coordinates, null);
  assert.equal(readingView(reading(), 1_000, { showCoordinates: true }).coordinates, '40.41531, -3.68452');
});

test('cada error del contrato tiene un texto para el usuario', () => {
  for (const code of contract.enums.errors) assert.ok(ERROR_TEXT[code], code);
  const s = sessionView({ fixes: 4, gaps: 1, gapOpen: true, intervalMs: 5_000, lastError: 'service_destroyed', message: null });
  assert.match(s.counts, /4 lecturas · 1 hueco \(hueco abierto ahora\)/);
  assert.match(s.error, /Android detuvo el servicio/);
});
