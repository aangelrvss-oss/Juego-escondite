import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DYNAMIC_ZONE, LIMITS, MINUTE, SECOND } from '../src/constants.ts';
import { validateConfig } from '../src/config.ts';
import { applyCommand, nextDeadline } from '../src/engine.ts';
import { distanceM, isOutsideZone, offsetM } from '../src/geo.ts';
import type { GameConfig, ZoneVersion } from '../src/types.ts';
import { snapshotFor } from '../src/view.ts';
import { buildZonePlan, currentZone, isNested, visibleZonePlan, zoneInPlan, zonePhaseStarts } from '../src/zone.ts';
import { CENTER, activeGame, config } from './helpers.ts';

// Zona dinámica (ciclo del 1/11/2026, QA/ciclo-20261101-zona-dinamica). Los valores (5 min, 15 %, 50 m)
// son hipótesis de prueba (DYNAMIC_ZONE), no reglas aprobadas: las pruebas los leen de las constantes.

const P = DYNAMIC_ZONE.phaseMs;
const RADII = [50, 100, 250, 500, 1_000];
const dyn = (radiusM: number, durationMs = 20 * MINUTE): GameConfig =>
  config({ dynamicZone: true, durationMs, zone: [{ fromOffsetMs: 0, center: CENTER, radiusM }] });

describe('radio inicial', () => {
  it('admite 50, 100, 250, 500 y 1.000 m y sigue admitiendo los radios anteriores', () => {
    for (const r of [...RADII, 150, 200, 300, 400, 600, 800, 1_200, 2_000]) {
      assert.equal(validateConfig(config({ zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: r }] })), null, `${r} m`);
    }
  });

  it('rechaza radios por debajo de 50 m, por encima de 2.000 m o no numéricos', () => {
    for (const r of [0, 49, 2_001, Number.NaN, -100]) {
      assert.equal(validateConfig(config({ zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: r }] })), 'zone', `${r} m`);
    }
    assert.equal(LIMITS.zoneRadiusM.min, 50);
  });

  it('el cliente no puede enviar un calendario de zonas propio (solo la zona inicial)', () => {
    const g = activeGame();
    // En LOBBY de otra sala: el validador del motor rechaza más de una versión aunque pida zona dinámica.
    assert.equal(validateConfig(config({ dynamicZone: true, zone: [...dyn(500).zone, { fromOffsetMs: P, center: CENTER, radiusM: 50 }] })), 'zone');
    assert.equal(g.state.zonePlan, null, 'sin dynamicZone, zona fija como siempre');
  });

  it('dynamicZone tiene que ser booleano', () => {
    const g = activeGame();
    const r = applyCommand(g.state, 'h', { type: 'configure', config: { ...config(), dynamicZone: 'si' as unknown as boolean } }, g.now);
    assert.deepEqual(r.result, { ok: false, error: 'invalid_command', detail: 'config.dynamicZone' });
  });
});

describe('plan de zona (determinista, servidor)', () => {
  it('con cada radio admitido: empieza con la zona configurada y la mantiene los primeros 5 min', () => {
    for (const r of RADII) {
      const plan = buildZonePlan(dyn(r), 7);
      assert.deepEqual(plan[0], { fromOffsetMs: 0, center: CENTER, radiusM: r });
      assert.equal(zoneInPlan(plan, -2 * MINUTE).radiusM, r, 'en la huida, la zona inicial');
      assert.equal(zoneInPlan(plan, P).radiusM, r, 'hasta los 5 min no cambia');
      assert.deepEqual(zoneInPlan(plan, P).center, CENTER);
    }
  });

  it('cada fase reduce el radio un 15 % (redondeado a metros) hasta el mínimo de 50 m, y ahí se queda', () => {
    assert.deepEqual(buildZonePlan(dyn(1_000), 1).map((z) => z.radiusM), [1_000, 1_000, 850, 723, 615]);
    assert.deepEqual(buildZonePlan(dyn(500), 1).map((z) => z.radiusM), [500, 500, 425, 361, 307]);
    assert.deepEqual(buildZonePlan(dyn(250), 1).map((z) => z.radiusM), [250, 250, 213, 181, 154]);
    assert.deepEqual(buildZonePlan(dyn(100, 60 * MINUTE), 1).map((z) => z.radiusM), [100, 100, 85, 72, 61, 52, 50]);
    // 50 m ya es el mínimo: la zona no cambia en toda la partida (ni de tamaño ni de sitio).
    assert.deepEqual(buildZonePlan(dyn(50, 60 * MINUTE), 1), [{ fromOffsetMs: 0, center: CENTER, radiusM: 50 }]);
  });

  it('las fases empiezan a los 5, 10, 15… min y ninguna empieza al acabar la persecución', () => {
    assert.deepEqual(zonePhaseStarts(buildZonePlan(dyn(500, 20 * MINUTE), 3)), [P, 2 * P, 3 * P]);
    assert.deepEqual(zonePhaseStarts(buildZonePlan(dyn(500, 22 * MINUTE), 3)), [P, 2 * P, 3 * P, 4 * P]);
    assert.deepEqual(zonePhaseStarts(buildZonePlan(dyn(500, 10 * MINUTE), 3)), [P]);
    assert.deepEqual(zonePhaseStarts(buildZonePlan(dyn(50, 60 * MINUTE), 3)), []);
  });

  it('cada zona queda dentro de la anterior (y de la inicial), y nadie necesita correr: muchas semillas', () => {
    const v = DYNAMIC_ZONE.walkMps * (P / SECOND);
    for (const r of [...RADII, 2_000]) {
      for (let seed = 0; seed < 300; seed++) {
        const plan = buildZonePlan(dyn(r, 120 * MINUTE), seed);
        for (let i = 1; i < plan.length; i++) {
          const a = plan[i - 1] as ZoneVersion;
          const b = plan[i] as ZoneVersion;
          assert.ok(isNested(b, a), `r=${r} seed=${seed} i=${i}`);
          assert.ok(isNested(b, plan[0] as ZoneVersion));
          assert.ok(b.radiusM >= DYNAMIC_ZONE.minRadiusM);
          assert.ok(distanceM(a.center, b.center) + a.radiusM - b.radiusM <= v + 0.01, 'a paso normal se llega');
        }
      }
    }
  });

  it('el centro se desplaza hacia un destino (no se queda quieto) salvo en el mínimo', () => {
    for (let seed = 0; seed < 50; seed++) {
      const plan = buildZonePlan(dyn(500), seed);
      const moved = distanceM((plan[1] as ZoneVersion).center, (plan[2] as ZoneVersion).center);
      const lost = (plan[1] as ZoneVersion).radiusM - (plan[2] as ZoneVersion).radiusM;
      assert.ok(moved >= lost * DYNAMIC_ZONE.shift.min - 0.05 && moved <= lost * DYNAMIC_ZONE.shift.max + 0.05, `${moved} m`);
    }
  });

  it('determinista: misma semilla, mismo plan; otra semilla, otro destino', () => {
    assert.deepEqual(buildZonePlan(dyn(500), 11), buildZonePlan(dyn(500), 11));
    assert.notDeepEqual(buildZonePlan(dyn(500), 11)[2]?.center, buildZonePlan(dyn(500), 12)[2]?.center);
  });

  it('coordenadas guardadas con 7 decimales, sin ruido de coma flotante', () => {
    for (const z of buildZonePlan(dyn(1_000, 60 * MINUTE), 5)) {
      assert.equal(Math.round(z.center.lat * 1e7) / 1e7, z.center.lat);
      assert.equal(Math.round(z.center.lng * 1e7) / 1e7, z.center.lng);
      assert.ok(Number.isFinite(z.center.lat) && Number.isFinite(z.center.lng));
    }
  });
});

describe('interpolación (encogimiento y desplazamiento progresivos)', () => {
  const plan = buildZonePlan(dyn(500), 21);
  const [, z1, z2, , z4] = plan as [ZoneVersion, ZoneVersion, ZoneVersion, ZoneVersion, ZoneVersion];

  it('el radio baja de forma continua dentro de la fase, no de golpe', () => {
    assert.equal(zoneInPlan(plan, P).radiusM, 500);
    assert.equal(zoneInPlan(plan, P + P / 2).radiusM, (500 + 425) / 2);
    assert.equal(zoneInPlan(plan, 2 * P).radiusM, 425);
    assert.equal(zoneInPlan(plan, 2 * P + P / 2).radiusM, (425 + 361) / 2);
    assert.equal(zoneInPlan(plan, 3 * P).radiusM, 361);
    assert.equal(zoneInPlan(plan, 4 * P).radiusM, z4.radiusM);
    assert.equal(zoneInPlan(plan, 99 * P).radiusM, z4.radiusM, 'tras el último punto, fijo');
  });

  it('el centro avanza en línea recta hacia el destino', () => {
    const half = zoneInPlan(plan, P + P / 2).center;
    const total = distanceM(z1.center, z2.center);
    assert.ok(Math.abs(distanceM(z1.center, half) - total / 2) < 0.01);
    assert.ok(Math.abs(distanceM(half, z2.center) - total / 2) < 0.01);
  });

  it('sin saltos: en cualquier instante, 1 s después el borde se mueve menos de 1,2 m', () => {
    for (let t = -MINUTE; t < 25 * MINUTE; t += 7 * SECOND) {
      const a = zoneInPlan(plan, t);
      const b = zoneInPlan(plan, t + SECOND);
      assert.ok(distanceM(a.center, b.center) + Math.abs(a.radiusM - b.radiusM) < DYNAMIC_ZONE.walkMps, `t=${t}`);
    }
  });

  it('cada círculo intermedio queda dentro del de cualquier instante anterior', () => {
    for (let t = 0; t < 20 * MINUTE; t += 20 * SECOND) {
      assert.ok(isNested(zoneInPlan(plan, t + 20 * SECOND), zoneInPlan(plan, t)), `t=${t}`);
    }
  });
});

describe('partida con zona dinámica (motor)', () => {
  const game = (radiusM = 500, extra: Partial<GameConfig> = {}) =>
    activeGame({ runners: ['r1', 'r2'], cfg: { dynamicZone: true, zone: [{ fromOffsetMs: 0, center: CENTER, radiusM }], ...extra } });

  it('el plan se fija al empezar y la primera fase empieza exactamente a los 5 min de persecución', () => {
    const g = game();
    const start = g.state.activeStart as number;
    assert.ok(g.state.zonePlan && g.state.zonePlan.length > 2);
    assert.equal(g.eventsOf('zone_phase').length, 0);
    g.advance(P - SECOND);
    assert.equal(g.eventsOf('zone_phase').length, 0);
    g.advance(SECOND);
    const [e] = g.eventsOf('zone_phase');
    assert.equal(e?.at, start + P);
    assert.deepEqual(e?.data, { phase: 1, radiusM: 425, endsAt: start + 2 * P, last: false });
    assert.deepEqual(e?.audience, { kind: 'all' });
  });

  it('las fases siguientes llegan a los 10 y 15 min; la última lo indica', () => {
    const g = game();
    const start = g.state.activeStart as number;
    g.advance(3 * P);
    assert.deepEqual(g.eventsOf('zone_phase').map((e) => [e.at - start, e.data.phase, e.data.last]), [
      [P, 1, false],
      [2 * P, 2, false],
      [3 * P, 3, true],
    ]);
  });

  it('procesado con retraso: un tick tardío aplica la fase a su hora exacta, no a la del tick', () => {
    const g = game();
    const start = g.state.activeStart as number;
    g.advance(P - 30 * SECOND);
    assert.ok(nextDeadline(g.state)! <= start + P);
    // El servidor no procesa nada hasta 4 min tarde (sin señales: por debajo de los 5 min de D-057).
    g.tickTo(start + P + 4 * MINUTE);
    const [e] = g.eventsOf('zone_phase');
    assert.equal(e?.at, start + P);
    assert.equal(e?.data.endsAt, start + 2 * P, 'la fase termina a su hora, no 4 min más tarde');
    assert.equal(g.state.zonePhase, 1);
    // Y la zona del instante actual es la que toca a los 9 min, no la de los 5.
    assert.equal(currentZone(g.state, g.now)!.radiusM, 500 - 75 * (4 / 5));
  });

  it('la vista solo revela el destino de la fase en curso; todos reciben el mismo plan', () => {
    const g = game();
    const planOf = (id: string) => snapshotFor(g.state, id, g.now).zonePlan;
    assert.equal(planOf('r1')?.length, 2, 'antes de la primera fase: solo la zona inicial');
    g.advance(P);
    assert.equal(planOf('r1')?.length, 3);
    assert.deepEqual(planOf('r1'), visibleZonePlan(g.state.zonePlan!, 1));
    assert.deepEqual(planOf('h'), planOf('r1'), 'cazador y fugitivo ven lo mismo');
    assert.deepEqual(planOf('r2'), planOf('r1'));
  });

  it('un fugitivo quieto sin enviar lecturas queda fuera cuando la zona le alcanza', () => {
    const g = game(250);
    const start = g.state.activeStart as number;
    const plan = g.state.zonePlan!;
    // Justo dentro de la zona inicial, en el lado contrario al que se desplaza el centro.
    const away = plan[2]!.center;
    const dN = (CENTER.lat - away.lat) * 111_195;
    const dE = (CENTER.lng - away.lng) * 111_195 * Math.cos((CENTER.lat * Math.PI) / 180);
    const norm = Math.hypot(dN, dE) || 1;
    const p = offsetM(CENTER, (dN / norm) * 240, (dE / norm) * 240);
    g.cmd('r1', { type: 'location', sample: { lat: p.lat, lng: p.lng, accuracyM: 5, measuredAt: g.now } });
    assert.equal(g.eventsOf('zone_exit_warning').length, 0);
    // Sin más lecturas: al empezar la fase 2 (10 min) se reevalúa con la última y ya está fuera.
    g.advance(2 * P);
    assert.ok(isOutsideZone(p, 5, currentZone(g.state, start + 2 * P)!));
    const warn = g.eventsOf('zone_exit_warning').filter((e) => e.audience.kind === 'players' && e.audience.ids.includes('r1'));
    assert.equal(warn.length, 1);
    assert.equal(warn[0]?.at, start + 2 * P);
  });

  it('un cazador fuera de la zona actual (ya reducida) no puede reclamar capturas', () => {
    const g = game(250);
    g.advance(4 * P - 10 * SECOND);
    const z = currentZone(g.state, g.now)!;
    // Dentro de la zona inicial pero fuera de la actual.
    const north = (z.center.lat - CENTER.lat) * 111_195;
    const east = (z.center.lng - CENTER.lng) * 111_195 * Math.cos((CENTER.lat * Math.PI) / 180);
    const len = Math.hypot(north, east) || 1;
    const out = offsetM(z.center, (-north / len) * (z.radiusM + 30), (-east / len) * (z.radiusM + 30));
    assert.ok(distanceM(out, CENTER) < 250, 'sigue dentro de la zona inicial');
    for (const id of ['h', 'r1']) g.cmd(id, { type: 'location', sample: { ...out, accuracyM: 5, measuredAt: g.now } });
    assert.deepEqual(g.cmd('h', { type: 'claim_tag', runnerId: 'r1' }), { ok: false, error: 'hunter_outside_zone' });
  });

  it('sin dynamicZone: ningún plazo ni evento de zona (compatibilidad)', () => {
    const g = activeGame();
    g.advance(20 * MINUTE);
    assert.equal(g.eventsOf('zone_phase').length, 0);
    assert.equal(snapshotFor(g.state, 'h', g.now).zonePlan, null);
  });

  it('50 m: zona fija toda la partida, sin fases', () => {
    const g = game(50);
    g.advance(20 * MINUTE);
    assert.equal(g.eventsOf('zone_phase').length, 0);
    assert.equal(g.state.phase, 'FINISHED');
  });

  it('en Infección y Caza del zorro la zona evoluciona igual', () => {
    for (const mode of ['infection', 'fox_hunt'] as const) {
      const teams = mode === 'fox_hunt' ? { hunters: ['x1', 'x2'], runners: ['r1'] } : { runners: ['r1', 'r2', 'r3'] };
      const g = activeGame({ ...teams, cfg: { mode, dynamicZone: true } });
      g.advance(2 * P);
      assert.equal(g.eventsOf('zone_phase').length, 2, mode);
    }
  });

  it('revancha: plan nuevo (otra semilla) y fases desde cero; sin restos de la partida anterior', () => {
    const g = game();
    g.advance(20 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    const before = g.state.zonePlan;
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.equal(g.state.zonePlan, null);
    assert.equal(g.state.zonePhase, 0);
    assert.equal(snapshotFor(g.state, 'h', g.now).zonePlan, null);
    for (const id of ['r1', 'r2']) g.ok(id, { type: 'join_rematch' });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.ok(g.state.zonePlan);
    assert.notDeepEqual(g.state.zonePlan, before);
    g.advance(5 * SECOND + 2 * MINUTE + P);
    assert.equal(g.eventsOf('zone_phase').filter((e) => e.at > (g.state.activeStart as number)).length, 1);
  });
});
