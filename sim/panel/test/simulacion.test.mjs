// Pruebas del simulador local (sim/panel) contra el servidor y el motor reales, sin navegador.
// SIMULADO: GPS, decisiones de los bots y reloj (se adelanta con advance o se acelera).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startServer } from '../../../server/main.ts';
import { startSimulator } from '../servidor.mjs';
import { NAMES, Simulation } from '../simulacion.mjs';

const sims = [];
after(async () => {
  for (const s of sims) await s.close();
});

async function sim() {
  const s = await new Simulation({ seed: 11 }).open();
  sims.push(s);
  return s;
}

const room = (s) => s.room();
const byName = (s, name) => room(s).players[s.avatar(name).id];

/** Avanza el reloj a pasos hasta que se cumpla `fn` (o hasta `maxMs` de juego). */
async function advanceUntil(s, fn, maxMs, step = 60_000) {
  for (let t = 0; t < maxMs && !fn(); t += step) await s.advance(step);
  return fn();
}

describe('simulador: tres modos con 10 participantes, motor real', () => {
  for (const [mode, hunters] of [
    ['classic', 3],
    ['infection', 2],
    ['fox_hunt', 9],
  ]) {
    it(`${mode}: 10 participantes, roles del motor (${hunters} cazadores) y la partida termina con un resultado del motor`, async () => {
      const s = await sim();
      await s.start(mode);
      const st = room(s);
      assert.equal(st.playerOrder.length, 10);
      assert.deepEqual(st.playerOrder.map((id) => s.nameOf(id)), [...NAMES]);
      assert.equal(st.config.mode, mode);
      assert.equal(Object.values(st.players).filter((p) => p.team === 'hunter').length, hunters);
      assert.ok(await advanceUntil(s, () => room(s).phase === 'FINISHED', 25 * 60_000), `termina (${room(s).phase})`);
      const end = room(s);
      const out = end.outcome;
      assert.ok(out && out.cause, JSON.stringify(out));
      // El resultado coincide con el estado (sin desconexiones solo caben estos dos finales):
      // - all_captured => ganan los cazadores y no queda ningún fugitivo activo;
      // - time_up => ganan los fugitivos (supervivientes / el zorro) y queda alguno activo.
      const players = Object.values(end.players);
      const freeRunners = players.filter((p) => p.team === 'runner' && p.status === 'active').length;
      assert.ok(['all_captured', 'time_up'].includes(out.cause), `final inesperado: ${JSON.stringify(out)}`);
      if (out.cause === 'all_captured') {
        assert.equal(out.winner, 'hunter');
        assert.equal(freeRunners, 0);
      } else {
        assert.equal(out.winner, 'runner');
        assert.ok(freeRunners > 0, 'con tiempo agotado y victoria de los fugitivos queda alguno libre');
      }
      assert.equal(players.filter((p) => p.status === 'left').length, 0, 'nadie queda fuera');
      const capturedIds = end.captures.map((c) => c.runnerId);
      assert.equal(new Set(capturedIds).size, capturedIds.length, 'nadie es capturado dos veces');
      if (mode === 'infection') {
        // En Infección toda captura convierte: todo capturado es cazador activo (nadie queda «capturado»).
        assert.ok(end.captures.every((c) => c.converted), 'en Infección toda captura convierte');
        for (const id of capturedIds) {
          assert.equal(end.players[id].team, 'hunter', `${s.nameOf(id)} infectado es cazador`);
          assert.equal(end.players[id].status, 'active');
        }
        assert.equal(players.filter((p) => p.status === 'captured').length, 0);
        assert.equal(players.filter((p) => p.team === 'hunter').length, hunters + capturedIds.length);
        assert.match(s.outcomeText(out), out.winner === 'runner' ? /ganan los supervivientes/ : /ganan los cazadores/);
      } else {
        for (const id of capturedIds) assert.equal(end.players[id].status, 'captured');
        assert.equal(players.filter((p) => p.status === 'captured').length, capturedIds.length);
        if (mode === 'fox_hunt' && out.winner === 'runner') assert.match(s.outcomeText(out), /gana el zorro/);
        if (mode === 'classic' && out.winner === 'runner') assert.match(s.outcomeText(out), /ganan los fugitivos/);
      }
      // Avanzar a saltos no deja lecturas ni respuestas atrás (fallo corregido: llegaban con el reloj ya adelantado).
      assert.deepEqual(s.log.filter((l) => /your_location_stale|target_location_stale|caducada/.test(l.text)).map((l) => l.text), []);
      assert.deepEqual(s.errors, []);
    });
  }
});

describe('simulador: acciones de prueba', () => {
  it('desconexión forzada: «sin conexión» a los 30 s, vuelve al restaurar; a los 5 min queda fuera', async () => {
    const s = await sim();
    await s.start('classic');
    await s.advance(5_000 + 2 * 60_000 + 5_000); // persecución
    const runner = NAMES.find((n) => byName(s, n).team === 'runner' && n !== 'AVATAR_01');
    s.disconnect(runner);
    await s.advance(35_000);
    assert.equal(byName(s, runner).away, true);
    assert.equal(byName(s, runner).connected, false);
    s.restore(runner);
    await waitFor(() => byName(s, runner).away === false, 'vuelve');
    assert.equal(byName(s, runner).status, 'active');
    // Otro: sin volver en 5 min, fuera de la partida como si abandonara. Mientras está desconectado no
    // se le puede capturar (su última lectura caduca) y sigue activo, así que la partida no puede acabar
    // por capturas antes de que venza su plazo: la comprobación no depende de lo que hagan los bots.
    const other = NAMES.find((n) => n !== runner && n !== 'AVATAR_01' && byName(s, n).team === 'runner' && byName(s, n).status === 'active');
    assert.ok(other, 'queda otro fugitivo activo al que desconectar');
    s.disconnect(other);
    await s.advance(5 * 60_000 + 10_000);
    assert.equal(byName(s, other).status, 'left');
    assert.equal(byName(s, other).leftReason, 'timeout');
    assert.ok(s.log.some((l) => l.text === `${other} queda fuera: 5 min sin señal`), 'el registro lo cuenta');
    // Si era el último fugitivo libre, la partida acaba sin ganador; si no, sigue.
    const st = room(s);
    assert.ok(st.phase === 'ACTIVE' || st.outcome?.cause === 'runners_abandoned', JSON.stringify({ phase: st.phase, outcome: st.outcome }));
  });

  it('pestaña suspendida (socket abierto, sin señales): «sin conexión» aunque el tiempo vaya acelerado', async () => {
    const s = await sim();
    await s.start('classic');
    await s.advance(5_000 + 2 * 60_000 + 5_000);
    const name = 'AVATAR_04';
    s.freeze(name);
    await s.advance(40_000);
    assert.equal(byName(s, name).away, true);
    assert.equal(byName(s, name).connected, true, 'el socket sigue abierto');
    for (const n of NAMES.filter((x) => x !== name)) assert.equal(byName(s, n).away, false, `${n} sigue con señal`);
    s.restore(name);
    await waitFor(() => byName(s, name).away === false, 'vuelve al despertar');
  });

  it('pestaña duplicada: el servidor cierra la anterior con 4001, sigue una sola conexión y el jugador nunca aparece desconectado', async () => {
    const s = await sim();
    await s.start('classic');
    const a = s.avatar('AVATAR_05');
    const old = a.conn;
    s.duplicate('AVATAR_05');
    await waitFor(() => old.replaced && old.status === 'closed', 'la anterior queda sustituida');
    await waitFor(() => a.conn.status === 'open', 'la nueva abierta');
    assert.equal(byName(s, 'AVATAR_05').connected, true);
    assert.equal(s.server.hub.stats().clients, 10);
    assert.ok(s.log.some((l) => /4001/.test(l.text)));
  });

  it('captura inválida: el motor la rechaza; captura válida guiada: el motor la acepta y el fugitivo la confirma', async () => {
    const s = await sim();
    await s.start('classic');
    await s.advance(5_000 + 2 * 60_000 + 5_000);
    const bad = await s.invalidCapture();
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error, 'not_close_enough');
    const before = room(s).captures.length;
    const { runner } = s.validCapture();
    assert.ok(await advanceUntil(s, () => byName(s, runner).status === 'captured', 6 * 60_000, 5_000), 'capturado');
    assert.ok(room(s).captures.length > before);
  });

  it('Infección: el capturado pasa a cazador y espera 60 s antes de poder capturar', async () => {
    const s = await sim();
    await s.start('infection');
    await s.advance(5_000 + 2 * 60_000 + 5_000);
    const { runner } = s.validCapture();
    assert.ok(await advanceUntil(s, () => byName(s, runner).team === 'hunter', 6 * 60_000, 5_000), 'convertido');
    const p = byName(s, runner);
    assert.equal(p.status, 'active');
    assert.equal(p.canTagFrom - p.convertedAt, 60_000);
    // Lo que importa: durante la espera, una reclamación suya la rechaza el motor con tag_cooldown
    // (antes de mirar distancia o lecturas). Se envía tal cual por su conexión real.
    assert.ok(s.clock.now() < p.canTagFrom, 'seguimos dentro de la espera');
    const target = NAMES.find((n) => byName(s, n).team === 'runner' && byName(s, n).status === 'active');
    assert.ok(target, 'queda algún superviviente');
    const during = await s.avatar(runner).conn.command({ type: 'claim_tag', runnerId: s.avatar(target).id });
    assert.deepEqual(during, { ok: false, error: 'tag_cooldown' });
    // Pasada la espera, el mismo comando ya no se rechaza por la espera (puede fallar por otra causa).
    await s.advance(65_000);
    const later = NAMES.find((n) => byName(s, n).team === 'runner' && byName(s, n).status === 'active') ?? target;
    const after = await s.avatar(runner).conn.command({ type: 'claim_tag', runnerId: s.avatar(later).id });
    assert.notEqual(after.error, 'tag_cooldown', JSON.stringify(after));
  });

  it('revancha real por comandos (Infección): sorteo nuevo con 10, sin restos de la partida anterior; registro con los textos del modo', async () => {
    const s = await sim();
    await s.start('infection');
    await s.advance(5_000 + 2 * 60_000 + 5_000);
    const { runner } = s.validCapture();
    assert.ok(await advanceUntil(s, () => byName(s, runner).team === 'hunter', 6 * 60_000, 5_000), 'convertido');
    // Textos del registro (V-35): el motor envía runnerId en la exposición y puede no haber autor.
    const id = s.avatar('AVATAR_03').id;
    assert.equal(s.describe({ type: 'runner_exposed', data: { runnerId: id } }).text, 'AVATAR_03 expuesto: lleva 30 s fuera de la zona');
    assert.equal(s.describe({ type: 'runner_unexposed', data: { runnerId: id } }).who, 'AVATAR_03');
    assert.equal(s.describe({ type: 'runner_captured', data: { runnerId: id, hunterId: null, converted: true } }).text, 'AVATAR_03 infectado (sin autor conocido): ahora caza');
    assert.equal(s.outcomeText({ winner: 'runner', cause: 'time_up' }), 'ganan los supervivientes (time_up)');
    assert.ok(!s.log.some((l) => /—/.test(l.text)), JSON.stringify(s.log.filter((l) => /—/.test(l.text))));
    const first = room(s).captures.find((c) => c.runnerId === s.avatar(runner).id);
    assert.ok(s.log.some((l) => l.text === `${runner} infectado por ${s.nameOf(first.hunterId)}: ahora caza`));

    assert.equal((await s.finish()).ok, true);
    assert.equal(room(s).phase, 'FINISHED');
    const r = await s.rematch();
    assert.equal(r.ok, true);
    const st = room(s);
    assert.equal(st.gameNo, 2);
    assert.equal(st.phase, 'COUNTDOWN');
    assert.equal(st.config.mode, 'infection');
    const players = Object.values(st.players);
    assert.equal(players.filter((p) => p.status === 'active').length, 10, 'los 10 juegan la revancha');
    assert.equal(players.filter((p) => p.team === 'hunter').length, 2, 'sorteo nuevo: floor(10/4) cazadores');
    assert.deepEqual(st.captures, []);
    assert.deepEqual(st.claims, {});
    for (const p of players) {
      assert.equal(p.canTagFrom ?? null, null, `${s.nameOf(p.id)}: canTagFrom`);
      assert.equal(p.convertedAt ?? null, null, `${s.nameOf(p.id)}: convertedAt`);
      assert.equal(p.pingsBeforeConversion ?? null, null, `${s.nameOf(p.id)}: pingsBeforeConversion`);
    }
    assert.ok(s.log.some((l) => /^Revancha: partida n\.º 2/.test(l.text)));
    // La revancha se juega: termina con un resultado del motor.
    assert.ok(await advanceUntil(s, () => room(s).phase === 'FINISHED', 25 * 60_000), `la revancha termina (${room(s).phase})`);
    assert.ok(room(s).outcome?.cause);
    assert.deepEqual(s.errors, []);
  });

  it('Caza del zorro: un único zorro, que ve a los cazadores (filtro real del servidor)', async () => {
    const s = await sim();
    await s.start('fox_hunt');
    await s.advance(5_000 + 30_000);
    const foxes = NAMES.filter((n) => byName(s, n).team === 'runner');
    assert.equal(foxes.length, 1);
    const view = s.state(foxes[0]).view.positions;
    assert.ok(view.length > 0 && view.every((p) => p.reason === 'hunter_seen'), JSON.stringify(view.slice(0, 2)));
  });

  it('pausa: el reloj del servidor se detiene; finalizar: el anfitrión termina la partida sin ganador', async () => {
    const s = await sim();
    await s.start('classic');
    s.pause();
    const t = s.clock.now();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(s.clock.now(), t);
    s.resume();
    await s.advance(5_000 + 2 * 60_000);
    const r = await s.finish();
    assert.equal(r.ok, true);
    assert.equal(room(s).phase, 'FINISHED');
    assert.equal(room(s).outcome.winner, null);
  });

  it('reiniciar: servidor nuevo sin salas, sesiones ni conexiones; la siguiente simulación no hereda participantes', async () => {
    const s = await sim();
    await s.start('classic');
    const firstIds = s.avatars.map((a) => a.id);
    const firstHub = s.server.hub;
    const firstConns = s.avatars.map((a) => a.conn);
    await s.reset();
    assert.equal(firstConns.filter((c) => c.status !== 'closed' || c.socket).length, 0, 'ninguna conexión de cliente abierta');
    await waitFor(() => firstHub.stats().clients === 0, 'el servidor anterior registra el cierre de todos los sockets'); // llega en milisegundos
    assert.deepEqual(s.server.hub.stats(), { rooms: 0, sessions: 0, clients: 0, locWs: 0, locHttp: 0 });
    assert.equal(s.avatars.length, 0);
    await s.start('infection');
    assert.equal(s.server.hub.stats().rooms, 1);
    assert.equal(s.server.hub.stats().clients, 10);
    assert.equal(s.avatars.filter((a) => firstIds.includes(a.id)).length, 0);
    await s.close();
    sims.splice(sims.indexOf(s), 1);
  });

  it('interfaz: la sesión solo se entrega para quien juega desde ella, y nunca la del anfitrión', async () => {
    const s = await sim();
    await s.start('classic', { human: 'AVATAR_02' });
    assert.equal(s.sessionFor('AVATAR_02').playerId, s.avatar('AVATAR_02').id);
    assert.equal(s.sessionFor('AVATAR_03'), null);
    assert.throws(() => s.prepareHuman('AVATAR_01'));
    assert.ok(!JSON.stringify(s.log).includes(s.sessionFor('AVATAR_02').secret), 'el secreto no va al registro');
  });
});

describe('simulador: aislamiento', () => {
  it('el servidor normal no tiene las rutas del simulador', async () => {
    const server = await startServer({});
    try {
      assert.equal((await fetch(`${server.url}/sim/`)).status, 404);
      assert.equal((await fetch(`${server.url}/sim/api/estado`)).status, 404);
      assert.doesNotMatch(await (await fetch(`${server.url}/`)).text(), /shim\.js/);
    } finally {
      await server.close();
    }
  });

  it('el simulador rechaza acciones de otro origen y escucha solo en 127.0.0.1', async () => {
    const s = await startSimulator({ port: 0 });
    sims.push(s);
    assert.match(s.server.url, /^http:\/\/127\.0\.0\.1:/);
    const r = await fetch(`${s.server.url}/sim/api/pausar`, { method: 'POST', headers: { origin: 'http://otra-web.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
    assert.equal((await fetch(`${s.server.url}/sim/api/jugador`)).status, 403);
    assert.equal(s.clock.paused, false);
  });
});

async function waitFor(fn, what, ms = 5_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`tiempo agotado: ${what}`);
}
