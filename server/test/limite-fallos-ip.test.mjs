import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hub, RATE } from '../hub.ts';
import { CENTER, T0 } from './helpers.mjs';

// AF-07 / INF-02: el límite de fallos por dirección frena adivinar códigos de sala, pero no debe dejar
// fuera a un grupo que comparte Wi-Fi tras un reinicio del servidor sin estado guardado (todos los
// móviles fallan a la vez al reanudar). Hub en memoria con reloj inyectado y transportes falsos.

const WIFI = '203.0.113.50';

function harness() {
  const clock = { t: T0 };
  const hub = new Hub({ now: () => clock.t });
  const client = (ip = WIFI) => {
    const out = [];
    const transport = { send: (s) => out.push(JSON.parse(s)), close: () => {} };
    const h = hub.connect(transport, ip);
    return {
      out,
      send: (m) => h.receive(JSON.stringify(m)),
      last: () => out.at(-1),
      welcome: () => out.find((m) => m.t === 'welcome' && m.secret),
    };
  };
  return { hub, client, clock };
}

/** Sesiones reales de un servidor anterior: `n` jugadores repartidos en salas de hasta 20. */
function staleSessions(n) {
  const old = harness();
  const sessions = [];
  let code = null;
  for (let i = 0; i < n; i++) {
    const c = old.client(`10.9.${Math.floor(i / 20)}.${i % 20}`);
    if (i % 20 === 0) {
      c.send({ t: 'create', name: `H${i}`, installId: `old-${i}` });
      code = c.welcome().code;
    } else c.send({ t: 'join', code, name: `J${i}`, installId: `old-${i}` });
    const w = c.welcome();
    assert.ok(w, `sesión antigua ${i}`);
    sessions.push({ playerId: w.playerId, secret: w.secret });
  }
  return sessions;
}

const reading = { lat: CENTER.lat, lng: CENTER.lng, acc: 8, age: 0 };

describe('AF-07: fallos por dirección y grupos en la misma Wi-Fi', () => {
  it('reinicio sin estado: 26 reanudaciones fallidas desde una IP y el grupo crea la sala nueva y entra', () => {
    const sessions = staleSessions(26);
    const env = harness(); // el servidor nuevo no conoce ninguna sesión
    const phones = sessions.map((s) => {
      const c = env.client();
      c.send({ t: 'resume', playerId: s.playerId, secret: s.secret, lastSeq: 0 });
      assert.equal(c.last().error, 'bad_session', 'la sesión antigua ya no vale (no rate_limited)');
      // El servicio nativo de ubicación también falla una vez por móvil (y con 401 deja de enviar).
      assert.equal(env.hub.uploadLocation(WIFI, { playerId: s.playerId, secret: s.secret, ...reading }), 'bad_session');
      return c;
    });
    // Desde la misma conexión, uno crea la sala nueva y los demás entran con el código.
    const [host, ...rest] = phones;
    host.send({ t: 'create', name: 'Ana', installId: 'new-0' });
    const { code } = host.welcome();
    assert.ok(code, 'crear no lo bloquea el límite de fallos');
    for (const [i, c] of rest.slice(0, 19).entries()) {
      c.send({ t: 'join', code, name: `P${i}`, installId: `new-${i + 1}` });
      assert.ok(c.welcome(), `unión ${i + 1} desde la misma Wi-Fi`);
    }
    assert.equal(env.hub.roomStateByCode(code).playerOrder.length, 20);
  });

  it('una sesión válida siempre reanuda, aunque la dirección haya agotado los dos presupuestos de fallos', () => {
    const env = harness();
    const ana = env.client();
    ana.send({ t: 'create', name: 'Ana', installId: 'dev-a' });
    const { playerId, secret } = ana.welcome();
    // Códigos falsos hasta el límite (y más) desde la misma dirección.
    let g = null;
    for (let n = 0; n < RATE.failuresPerMinutePerIp + 5; n++) {
      if (n % RATE.attemptsPerMinute === 0) g = env.client();
      g.send({ t: 'join', code: 'ZZZZZZ', name: 'x', installId: 'x' });
    }
    assert.equal(g.last().error, 'rate_limited', 'los códigos falsos acaban frenados');
    // Sesiones falsas hasta agotar su presupuesto.
    for (let n = 0; n <= RATE.sessionFailuresPerMinutePerIp; n++) {
      if (n % RATE.attemptsPerMinute === 0) g = env.client();
      g.send({ t: 'resume', playerId: `p_falso${n}`, secret: 'x'.repeat(43), lastSeq: 0 });
    }
    assert.equal(g.last().error, 'rate_limited', 'las sesiones falsas acaban frenadas');
    const again = env.client();
    again.send({ t: 'resume', playerId, secret, lastSeq: 0 });
    assert.equal(again.last().t === 'error', false, 'sin error');
    assert.ok(again.out.some((m) => m.t === 'welcome' && m.playerId === playerId), 'reanudada');
    assert.equal(env.hub.uploadLocation(WIFI, { playerId, secret, ...reading }), 'gone', 'sala de espera: 410, no 429');
    // Crear tampoco lo bloquea.
    const other = env.client();
    other.send({ t: 'create', name: 'Beto', installId: 'dev-b' });
    assert.ok(other.welcome(), 'crear sala con la dirección «castigada»');
  });

  it('adivinar códigos sigue frenado: 21+ uniones con código falso desde una IP acaban en rate_limited', () => {
    const env = harness();
    const host = env.client('198.51.100.9');
    host.send({ t: 'create', name: 'Ana', installId: 'dev-a' });
    const { code } = host.welcome();
    const errors = [];
    let g = null;
    for (let n = 0; n < RATE.failuresPerMinutePerIp + 5; n++) {
      if (n % RATE.attemptsPerMinute === 0) g = env.client();
      g.send({ t: 'join', code: `ZZ${String(n).padStart(4, '0')}`, name: 'x', installId: `x${n}` });
      errors.push(g.last().error);
    }
    assert.deepEqual(errors.slice(0, RATE.failuresPerMinutePerIp), Array(RATE.failuresPerMinutePerIp).fill('not_found'));
    assert.deepEqual(errors.slice(RATE.failuresPerMinutePerIp), Array(5).fill('rate_limited'));
    // Con el presupuesto agotado, ni el código bueno entra (si no, se podría seguir probando).
    const lucky = env.client();
    lucky.send({ t: 'join', code, name: 'x', installId: 'lucky' });
    assert.equal(lucky.last().error, 'rate_limited');
    // Otra dirección no está afectada, y pasado el minuto la misma vuelve a poder.
    const elsewhere = env.client('192.0.2.1');
    elsewhere.send({ t: 'join', code, name: 'Beto', installId: 'dev-b' });
    assert.ok(elsewhere.welcome());
    env.clock.t += 60_001;
    const later = env.client();
    later.send({ t: 'join', code, name: 'Caro', installId: 'dev-c' });
    assert.ok(later.welcome());
  });
});
