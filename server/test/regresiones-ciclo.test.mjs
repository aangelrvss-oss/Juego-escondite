import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hub, RATE } from '../hub.ts';
import { CENTER, T0, gameConfig } from './helpers.mjs';

// Regresiones del ciclo de validación de modos (QA/ciclo-20261030-validacion-modos): C4 (V-07),
// C6 (V-17), C7 (V-18) y C8 (V-19). Hub en memoria con reloj inyectado y transportes falsos: sin red,
// sin puertos. C5 (V-16) es del cliente de red: mobile/test/net-regresiones.test.mjs.

/** Hub con reloj controlado y clientes que guardan lo que reciben. */
function harness() {
  const clock = { t: T0 };
  const hub = new Hub({ now: () => clock.t });
  let n = 0;
  const client = (ip = '10.0.0.1') => {
    const out = [];
    const transport = { closedWith: null, send: (s) => out.push(JSON.parse(s)), close: (code) => (transport.closedWith = code) };
    const h = hub.connect(transport, ip);
    const send = (m) => h.receive(JSON.stringify(m));
    const c = {
      out,
      h,
      transport,
      send,
      cmd: (cmd, id = `c${++n}`) => {
        send({ t: 'cmd', id, cmd });
        return out.filter((m) => m.t === 'result' && m.id === id).at(-1)?.result;
      },
      welcome: () => out.find((m) => m.t === 'welcome' && m.secret),
      get id() {
        return c.welcome()?.playerId;
      },
      lastSeq: () => Math.max(0, ...out.filter((m) => typeof m.seq === 'number').map((m) => m.seq)),
    };
    return c;
  };
  /** Adelanta el reloj en pasos de 1 s; `each` en cada paso; keepAlive a todos salvo `except`. */
  const advance = (ms, { each, except = new Set(), keepAlive = true } = {}) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + 1_000);
      each?.();
      hub.pump();
      if (keepAlive) hub.keepAliveConnected(except);
    }
  };
  return { clock, hub, client, advance };
}

/** Sala con `names` jugadores, configurada en `mode` y en la fase de huida (HEAD_START). */
function startedRoom(env, mode, count) {
  const players = [];
  for (let i = 0; i < count; i++) players.push(env.client(`10.0.1.${i + 1}`));
  players[0].send({ t: 'create', name: 'J0', installId: 'dev-0' });
  const code = players[0].welcome().code;
  players.slice(1).forEach((p, i) => p.send({ t: 'join', code, name: `J${i + 1}`, installId: `dev-${i + 1}` }));
  assert.equal(players[0].cmd({ type: 'configure', config: gameConfig({ mode }) }).ok, true);
  for (const p of players) assert.equal(p.cmd({ type: 'set_ready', ready: true }).ok, true);
  assert.equal(players[0].cmd({ type: 'start' }).ok, true);
  env.advance(6_000);
  const state = () => env.hub.roomStateByCode(code);
  assert.equal(state().phase, 'HEAD_START');
  return { code, players, state };
}

const MODES = ['classic', 'infection', 'fox_hunt'];

/** Un jugador que no es el anfitrión y cuyo equipo tiene más de uno (su salida no acaba la partida). */
function expendable(players, state) {
  const team = (p) => state().players[p.id].team;
  return players.slice(1).find((p) => players.filter((q) => team(q) === team(p)).length >= 2);
}

describe('C4 · V-07: los fallos ajenos por dirección no bloquean una sesión válida en /api/loc', () => {
  it('20 códigos falsos desde la misma IP: la sesión válida sigue enviando; las inválidas siguen frenadas', () => {
    const env = harness();
    const IP = '203.0.113.7';
    const ana = env.client(IP);
    ana.send({ t: 'create', name: 'Ana', installId: 'dev-a' });
    const { playerId, secret } = ana.welcome();
    const reading = { lat: CENTER.lat, lng: CENTER.lng, acc: 8, age: 0 };
    assert.equal(env.hub.uploadLocation(IP, { playerId, secret, ...reading }), 'gone', 'sala de espera: 410');
    // Un tercero desde la misma dirección: RATE.failuresPerMinutePerIp códigos inventados.
    for (let c = 0; c * RATE.attemptsPerMinute < RATE.failuresPerMinutePerIp; c++) {
      const x = env.client(IP);
      for (let i = 0; i < RATE.attemptsPerMinute; i++) x.send({ t: 'join', code: `ZZZZZ${'ABCDEFGHJK'[i]}`, name: 'x', installId: 'x' });
    }
    assert.equal(env.hub.uploadLocation(IP, { playerId, secret, ...reading }), 'gone', 'sesión válida: no 429');
    // La protección contra fuerza bruta se mantiene para las sesiones inválidas.
    assert.equal(env.hub.uploadLocation(IP, { playerId, secret: 'x'.repeat(43), ...reading }), 'rate_limited');
    assert.equal(env.hub.uploadLocation(IP, { playerId: 'p_inventado', secret, ...reading }), 'rate_limited');
    // Desde otra dirección, una sesión inválida aún no está frenada.
    assert.equal(env.hub.uploadLocation('198.51.100.1', { playerId, secret: 'y'.repeat(43), ...reading }), 'bad_session');
  });

  for (const mode of MODES) {
    it(`${mode}: en partida, la lectura válida se acepta aunque la dirección acumule fallos`, () => {
      const env = harness();
      const { players, state } = startedRoom(env, mode, mode === 'infection' ? 4 : 3);
      const p = players[1];
      const ip = '10.0.1.2';
      for (let i = 0; i < RATE.failuresPerMinutePerIp; i++) env.hub.uploadLocation(ip, { playerId: p.id, secret: 'z'.repeat(43), lat: 0, lng: 0, acc: 5, age: 0 });
      assert.equal(env.hub.uploadLocation(ip, { playerId: p.id, secret: 'z'.repeat(43), lat: 0, lng: 0, acc: 5, age: 0 }), 'rate_limited');
      const { secret } = p.welcome();
      assert.equal(env.hub.uploadLocation(ip, { playerId: p.id, secret, lat: CENTER.lat, lng: CENTER.lng, acc: 8, age: 0 }), 'accepted');
      assert.equal(state().players[p.id].samples.length > 0, true);
    });
  }
});

describe('C6 · V-17: los plazos de presencia (D-057) cuentan desde la última señal real', () => {
  for (const mode of MODES) {
    it(`${mode}: una señal descartada por la frecuencia sigue contando; «sin conexión» a los 30 s y fuera a los 5 min`, () => {
      const env = harness();
      const { players, state } = startedRoom(env, mode, 4);
      const beto = expendable(players, state);
      const except = new Set([beto.id]);
      const quiet = (ms) => env.advance(ms, { except });
      // Beto da una señal que se pasa al motor y otra 4,9 s después (dentro de SEEN_EVERY_MS).
      quiet(6_000);
      beto.send({ t: 'ping', c: 1 });
      const first = env.clock.t;
      env.clock.t += 4_900;
      beto.send({ t: 'ping', c: 2 });
      const last = env.clock.t;
      const away = () => state().players[beto.id].away;
      // A los 30 s de la PRIMERA (25,1 s de la última) aún no está «sin conexión».
      quiet(first + 30_000 - env.clock.t);
      assert.equal(away(), false, '«sin conexión» antes de 30 s desde la última señal');
      // Al cumplir 30 s desde la última, sí.
      quiet(last + 30_000 - env.clock.t);
      assert.equal(away(), true, '«sin conexión» a los 30 s de la última señal');
      // Fuera: no antes de 5 min desde la última señal; sí al cumplirlos.
      quiet(first + 5 * 60_000 - env.clock.t);
      assert.equal(state().players[beto.id].status, 'active', 'fuera antes de 5 min desde la última señal');
      quiet(last + 5 * 60_000 - env.clock.t);
      assert.equal(state().players[beto.id].status, 'left');
      assert.equal(state().players[beto.id].leftReason, 'timeout');
    });
  }

  it('pings reales cada 10 s, sin keepAliveConnected, nunca dan «sin conexión»; 31 s de silencio, sí', () => {
    const env = harness();
    const { players, state } = startedRoom(env, 'classic', 3);
    const beto = players[1];
    const except = new Set([beto.id]);
    for (let i = 0; i < 18; i++) {
      beto.send({ t: 'ping', c: i });
      env.advance(10_000, { except });
      assert.equal(state().players[beto.id].away, false, `ping ${i}`);
    }
    beto.send({ t: 'ping', c: 99 });
    env.advance(29_000, { except });
    assert.equal(state().players[beto.id].away, false);
    env.advance(2_000, { except });
    assert.equal(state().players[beto.id].away, true);
    // Vuelve al momento con la siguiente señal.
    beto.send({ t: 'ping', c: 100 });
    assert.equal(state().players[beto.id].away, false);
  });
});

describe('C7 · V-18: un comando nulo o ausente responde invalid_command y mantiene la conexión', () => {
  it('cmd null, sin cmd, número, texto o lista → invalid_command; después, un comando válido funciona', () => {
    const env = harness();
    const ana = env.client();
    ana.send({ t: 'create', name: 'Ana', installId: 'dev-a' });
    const bodies = [
      { t: 'cmd', id: 'n1', cmd: null },
      { t: 'cmd', id: 'n2' },
      { t: 'cmd', id: 'n3', cmd: 5 },
      { t: 'cmd', id: 'n4', cmd: 'leave' },
      { t: 'cmd', id: 'n5', cmd: [] },
    ];
    for (const body of bodies) {
      assert.doesNotThrow(() => ana.send(body), `${JSON.stringify(body)} no lanza`);
      const r = ana.out.filter((m) => m.t === 'result' && m.id === body.id).at(-1)?.result;
      assert.equal(r?.ok, false, `${body.id}: responde`);
      assert.equal(r.error, 'invalid_command', `${body.id}: invalid_command`);
    }
    assert.equal(ana.transport.closedWith, null, 'la conexión sigue abierta');
    assert.equal(ana.cmd({ type: 'set_ready', ready: true }).ok, true, 'la sesión sigue funcionando');
  });
});

describe('C8 · V-19: quien queda fuera por el periodo de gracia no recibe pistas con coordenadas al reanudar', () => {
  for (const mode of MODES) {
    it(`${mode}: el cazador fuera reanuda sin coordenadas; un cazador activo las sigue recibiendo`, () => {
      const env = harness();
      const { players, state } = startedRoom(env, mode, 8);
      env.advance(2 * 60_000); // ACTIVE
      assert.equal(state().phase, 'ACTIVE');
      const hunters = players.filter((p) => state().players[p.id].team === 'hunter');
      const runners = players.filter((p) => state().players[p.id].team === 'runner');
      assert.ok(hunters.length >= 2, 'al menos dos cazadores');
      const [gone, stays] = hunters;
      const goneSeq = gone.lastSeq();
      const staysSeq = stays.lastSeq();
      gone.h.closed('test'); // pierde la conexión
      const locs = () => runners.forEach((r, i) => r.send({ t: 'loc', lat: CENTER.lat + 0.0005 + i * 0.0001, lng: CENTER.lng, acc: 8, age: 0 }));
      env.advance(6 * 60_000, { each: locs }); // pista a los 3 min (aún activo), fuera a los 5 min
      assert.equal(state().phase, 'ACTIVE');
      assert.equal(state().players[gone.id].status, 'left');
      assert.equal(state().players[gone.id].leftReason, 'timeout');
      const withCoords = (msgs) => msgs.filter((m) => m.t === 'event' && m.type === 'ping' && m.data?.ping?.entries?.some((e) => e.position));
      // El cazador activo recibió la pista en directo con coordenadas.
      assert.ok(withCoords(stays.out).length >= 1, 'el cazador activo recibe la pista con coordenadas');

      // Reanuda quien quedó fuera: ni una coordenada en lo reenviado.
      const { playerId, secret } = gone.welcome();
      const back = env.client('10.0.1.99');
      back.send({ t: 'resume', playerId, secret, lastSeq: goneSeq });
      assert.ok(back.out.some((m) => m.t === 'snapshot'), 'reanuda');
      const replayedPings = back.out.filter((m) => m.t === 'event' && m.type === 'ping');
      assert.ok(replayedPings.length >= 1, 'la pista se le reenvía (sin coordenadas) para no dejar huecos de seq');
      assert.equal(withCoords(back.out).length, 0, 'ninguna pista reenviada con coordenadas');
      assert.ok(!JSON.stringify(back.out).includes('"position":{'), 'ninguna posición en nada de lo reenviado');

      // Un cazador activo que reanuda desde antes de la pista la sigue recibiendo con coordenadas.
      const s = stays.welcome();
      const stays2 = env.client('10.0.1.98');
      stays2.send({ t: 'resume', playerId: s.playerId, secret: s.secret, lastSeq: staysSeq });
      assert.ok(withCoords(stays2.out).length >= 1, 'el activo conserva sus pistas con coordenadas');
    });
  }
});

// F-1 (ciclo de correcciones 30/10/2026): los cierres de socket durante el apagado llamaban a schedule() y
// rearmaban el temporizador que close() acababa de cancelar: el hub seguía procesando plazos ~1 s después.
describe('F-1 · apagado del servidor', () => {
  it('tras close() no se vuelven a procesar plazos aunque se cierren sockets abiertos', async () => {
    const { startServer } = await import('../main.ts');
    const server = await startServer({ staticRoot: null });
    const url = `${server.url.replace('http', 'ws')}/ws`;
    await Promise.all([1, 2, 3].map(() => new Promise((ok) => { const w = new WebSocket(url); w.onopen = () => ok(w); })));
    let closed = false;
    let after = 0;
    const pump = server.hub.pump.bind(server.hub);
    server.hub.pump = () => { if (closed) after++; return pump(); };
    await server.close();
    closed = true;
    await new Promise((r) => setTimeout(r, 1_500));
    assert.equal(after, 0, 'ningún paso del hub después de close()');
  });
});
