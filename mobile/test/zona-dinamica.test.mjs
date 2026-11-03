import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DYNAMIC_ZONE } from '../../engine/src/constants.ts';
import { distanceM } from '../../engine/src/geo.ts';
import { buildZonePlan, visibleZonePlan, zoneInPlan } from '../../engine/src/zone.ts';
import { RULES, briefing, mapModel, zoneLine, zoneNow } from '../www/js/game-view.js';
import { circleRing, mapFeatures } from '../www/js/map-view.js';

// Zona dinámica en el móvil (ciclo del 1/11/2026). El móvil no decide nada: calcula el círculo con el plan
// que manda el servidor y la hora del servidor. Estas pruebas comprueban que el cálculo es el mismo que
// el del motor, que no hay saltos ni círculos antiguos, y que las zonas pequeñas se dibujan bien.

const CENTER = { lat: 40.4153, lng: -3.6845 };
const MIN = 60_000;
const P = DYNAMIC_ZONE.phaseMs;
const START = Date.UTC(2026, 10, 1, 17, 0, 0);
const cfg = (radiusM, durationMs = 20 * MIN) => ({
  mode: 'classic', durationMs, headStartMs: 2 * MIN, pingIntervalMs: 3 * MIN,
  zone: [{ fromOffsetMs: 0, center: CENTER, radiusM }], dynamicZone: true, meetingPoint: CENTER, safetyChecklistConfirmed: true,
});
const snapOf = (radiusM, phasesStarted, seed = 9, durationMs = 20 * MIN) => {
  const config = cfg(radiusM, durationMs);
  return { phase: 'ACTIVE', activeStart: START, config, zonePlan: visibleZonePlan(buildZonePlan(config, seed), phasesStarted), players: [] };
};

test('las reglas de zona que explica el móvil son las del motor', () => {
  assert.equal(RULES.zonePhaseMs, DYNAMIC_ZONE.phaseMs);
  assert.equal(RULES.zoneShrink, DYNAMIC_ZONE.shrink);
  assert.equal(RULES.zoneMinRadiusM, DYNAMIC_ZONE.minRadiusM);
});

test('el móvil calcula el mismo círculo que el servidor, con cada radio, en toda la partida', () => {
  for (const r of [50, 100, 250, 500, 1_000]) {
    const config = cfg(r, 60 * MIN);
    const plan = buildZonePlan(config, 3);
    const snap = { phase: 'ACTIVE', activeStart: START, config, zonePlan: plan };
    for (let t = -2 * MIN; t <= 61 * MIN; t += 13_000) {
      const mine = zoneNow(snap, START + t);
      const server = zoneInPlan(plan, t);
      assert.ok(Math.abs(mine.radiusM - server.radiusM) < 1e-9, `r=${r} t=${t}`);
      assert.ok(distanceM(mine.center, server.center) < 1e-6, `r=${r} t=${t}`);
    }
  }
});

test('dos móviles con la misma instantánea y la hora del servidor ven exactamente lo mismo', () => {
  // Cada móvil corrige su reloj con el del servidor (net.js serverNow): lo que se compara es esa hora.
  const a = snapOf(500, 1);
  const b = structuredClone(a); // el otro móvil recibe su propia copia (JSON)
  for (const t of [P + 1, P + 90_000, 2 * P - 1]) assert.deepEqual(zoneNow(a, START + t), zoneNow(b, START + t));
});

test('reconexión o navegador suspendido: la zona sale de la hora, no se reinicia ni se pausa', () => {
  // Un móvil que estuvo 7 min sin ejecutar nada recibe la instantánea al volver y ve la zona de ese instante.
  const late = snapOf(500, 1);
  const z = zoneNow(late, START + P + 2 * MIN);
  assert.equal(z.radiusM, 500 - 75 * (2 / 5));
  assert.equal(z.target.radiusM, 425);
  assert.equal(z.target.at, START + 2 * P, 'el destino se alcanza a su hora, sin reiniciar los 5 min');
});

test('sin el aviso de la fase siguiente, el móvil mantiene el último destino: nunca se inventa la zona', () => {
  // Instantánea de la fase 1; ya son las 10:30 y el aviso de la fase 2 todavía no ha llegado.
  const snap = snapOf(500, 1);
  const z = zoneNow(snap, START + 2 * P + 30_000);
  assert.equal(z.radiusM, 425);
  assert.equal(z.target, null);
  // Al llegar la instantánea nueva, sigue desde ese mismo círculo (sin salto).
  const next = snapOf(500, 2);
  const at = zoneNow(next, START + 2 * P);
  assert.equal(at.radiusM, 425);
  assert.deepEqual(at.center, z.center);
});

test('sin zona dinámica o sin persecución: la zona fija de la configuración', () => {
  const fixed = { phase: 'ACTIVE', activeStart: START, config: { ...cfg(400), dynamicZone: undefined }, zonePlan: null };
  assert.deepEqual(zoneNow(fixed, START + 30 * MIN), { center: CENTER, radiusM: 400, target: null });
  const head = { ...snapOf(500, 0), phase: 'HEAD_START', activeStart: null };
  assert.equal(zoneNow(head, START).radiusM, 500);
  assert.equal(zoneNow({ config: null }, 0), null);
});

test('el mapa dibuja la zona de este instante, una sola', () => {
  const snap = snapOf(1_000, 1);
  const at = (t) => mapModel({ snap, team: 'runner', now: START + t });
  assert.equal(at(0).radiusM, 1_000);
  assert.equal(at(P + P / 2).radiusM, (1_000 + 850) / 2);
  assert.notDeepEqual(at(P + P / 2).center, at(P).center, 'el centro se desplaza');
  assert.equal(mapFeatures(at(P + P / 2)).zone.features.length, 1, 'sin círculos duplicados');
});

test('zonas pequeñas: el círculo del mapa tiene el radio del servidor (±0,1 %) con 50 y 100 m', () => {
  for (const r of [50, 100, 250, 1_000]) {
    for (const [lng, lat] of circleRing(CENTER, r)) {
      const d = distanceM(CENTER, { lat, lng });
      assert.ok(Math.abs(d - r) <= r * 0.001, `${r} m: vértice a ${d.toFixed(3)} m`);
    }
  }
  // A 60° de latitud (Escandinavia) también.
  const north = { lat: 60.17, lng: 24.94 };
  for (const [lng, lat] of circleRing(north, 50)) assert.ok(Math.abs(distanceM(north, { lat, lng }) - 50) <= 0.05);
});

test('línea de zona: cuánto falta para que empiece a cerrarse, hasta dónde y cuándo', () => {
  assert.deepEqual(zoneLine(snapOf(500, 0), START + MIN), { text: 'Zona 500 m · empieza a cerrarse en', leftMs: 4 * MIN, closing: false });
  assert.deepEqual(zoneLine(snapOf(500, 1), START + P + MIN), { text: 'Zona 485 m · se cierra hasta 425 m', leftMs: 4 * MIN, closing: true });
  assert.deepEqual(zoneLine(snapOf(50, 0), START + MIN), { text: 'Zona 50 m · ya no cambia', leftMs: null, closing: false });
  assert.equal(zoneLine({ ...snapOf(500, 0), phase: 'HEAD_START' }, START), null);
  assert.equal(zoneLine({ ...snapOf(500, 0), config: { ...cfg(500), dynamicZone: false } }, START), null);
  assert.doesNotMatch(JSON.stringify(zoneLine(snapOf(500, 1), START + P + MIN)), /lat|lng|40\.41/, 'sin coordenadas');
});

test('el briefing explica la zona dinámica solo si la sala la tiene', () => {
  const zone = (c) => briefing(c).find((r) => r.title === 'Zona').text;
  assert.match(zone(cfg(250)), /250 m.*Cada 5 min.*15 %.*50 m.*dentro de la zona anterior/);
  assert.doesNotMatch(zone({ ...cfg(250), dynamicZone: undefined }), /Cada 5 min/);
});
