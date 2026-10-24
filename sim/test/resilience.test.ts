import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, SECOND, TIMING } from '../../engine/src/constants.ts';
import { offsetM } from '../../engine/src/geo.ts';
import { availabilityOf, latestSample } from '../../engine/src/location.ts';
import { SimClient } from '../client.ts';
import type { ServerMessage } from '../host.ts';
import { CENTER, deterministicHost, startedGame } from '../scenario.ts';

const toActive = (host: ReturnType<typeof deterministicHost>) => host.advance(TIMING.countdownMs + 2 * MINUTE);

function contiguous(client: SimClient): boolean {
  return client.applied.every((e, i) => e.seq === (client.applied[0]?.seq ?? 1) + i);
}

describe('desconexión y reconexión (AC-F1, AC-F2, T07, T08)', () => {
  it('tras 60 s sin conexión recupera los eventos perdidos, en orden y sin duplicados', () => {
    const host = deterministicHost(3);
    const lobby = startedGame(host, 1, 2);
    toActive(host);
    const r = lobby.runners[0]!;
    r.disconnect();
    host.advance(10 * SECOND);
    lobby.runners[1]!.send({ type: 'self_tag' }); // evento que r1 se pierde
    host.advance(50 * SECOND);
    const before = r.applied.length;
    r.connect();
    assert.ok(r.applied.length > before);
    assert.ok(r.applied.some((e) => e.type === 'runner_captured'));
    assert.equal(r.duplicatesIgnored, 0);
    assert.ok(contiguous(r));
    assert.equal(r.lastSeq, host.outboxOf(r.playerId).at(-1)?.seq);
  });

  it('una app cerrada a la fuerza (sin historial local) recibe una instantánea correcta', () => {
    const host = deterministicHost(3);
    const lobby = startedGame(host, 1, 1);
    toActive(host);
    const original = lobby.runners[0]!;
    const reopened = new SimClient(host, original.name, original.deviceId);
    reopened.playerId = original.playerId;
    reopened.secret = original.secret; // guardado en el almacenamiento seguro del móvil
    reopened.connect();
    assert.equal(reopened.snapshot?.phase, 'ACTIVE');
    assert.equal(reopened.snapshot?.gameEnd, host.stateOf(original.playerId).gameEnd);
  });

  it('si el servidor ya no conserva el historial pedido, envía una instantánea', () => {
    const host = deterministicHost(3, { logRetention: 2 });
    const lobby = startedGame(host, 1, 2);
    const r = lobby.runners[0]!;
    r.disconnect();
    toActive(host);
    r.connect();
    const last = r.received.at(-2);
    assert.equal(last?.kind, 'snapshot');
    assert.equal(r.snapshot?.phase, 'ACTIVE');
  });

  it('el temporizador vence con todos desconectados; al volver reciben el final', () => {
    const host = deterministicHost(3);
    const lobby = startedGame(host, 1, 1);
    for (const c of lobby.clients) c.disconnect();
    host.advance(TIMING.countdownMs + 2 * MINUTE + 20 * MINUTE);
    for (const c of lobby.clients) {
      c.connect();
      assert.ok(c.applied.some((e) => e.type === 'game_finished'));
    }
  });

  it('el anfitrión desconectado 120 s cede el puesto a través del servidor', () => {
    const host = deterministicHost(3);
    const lobby = startedGame(host, 2, 1);
    toActive(host);
    lobby.hostClient.disconnect();
    host.advance(TIMING.hostHandoverMs);
    const newHost = lobby.hunters[1]!;
    assert.equal(host.stateOf(newHost.playerId).hostId, newHost.playerId);
    assert.equal(newHost.send({ type: 'end_game' }).ok, true);
  });
});

describe('mensajes duplicados o fuera de orden', () => {
  it('los duplicados se ignoran y el resultado es idéntico al de una red limpia', () => {
    const run = (duplicate: boolean) => {
      const host = deterministicHost(5);
      const lobby = startedGame(host, 1, 2);
      const r = lobby.runners[0]!;
      if (duplicate) host.setFault(r.playerId, (m) => [m, m]);
      toActive(host);
      lobby.runners[1]!.send({ type: 'self_tag' });
      host.advance(5 * MINUTE);
      return r;
    };
    const clean = run(false);
    const dup = run(true);
    assert.ok(dup.duplicatesIgnored > 0);
    assert.deepEqual(dup.applied, clean.applied);
  });

  it('un desorden se detecta como hueco, se resincroniza y no se aplica nada fuera de orden', () => {
    const host = deterministicHost(5);
    const lobby = startedGame(host, 1, 2);
    const r = lobby.runners[0]!;
    let held: ServerMessage | null = null;
    // Retiene un evento y lo entrega después del siguiente (intercambio de orden).
    host.setFault(r.playerId, (m) => {
      if (m.kind !== 'event') return [m];
      if (!held) {
        held = m;
        return [];
      }
      const out = [m, held];
      held = null;
      return out;
    });
    toActive(host);
    host.setFault(r.playerId, null);
    assert.ok(r.needsResync);
    r.resyncIfNeeded();
    assert.ok(contiguous(r));
    assert.equal(r.lastSeq, host.outboxOf(r.playerId).at(-1)?.seq);
    // El cliente empezó con una instantánea: desde ahí, todos los eventos aplicados una vez y en orden.
    const firstSnapshot = r.received.find((m) => m.kind === 'snapshot');
    const fromSeq = firstSnapshot?.kind === 'snapshot' ? firstSnapshot.seq : 0;
    assert.deepEqual(
      r.applied.map((e) => e.seq),
      host.outboxOf(r.playerId).map((e) => e.seq).filter((seq) => seq > fromSeq),
    );
  });
});

describe('relojes de cliente desfasados (AC-C3, T09)', () => {
  for (const skew of [10 * MINUTE, -10 * MINUTE]) {
    it(`con ${skew > 0 ? '+' : '-'}10 min de desfase: tras sincronizar, la muestra es CURRENT y los plazos no cambian`, () => {
      const host = deterministicHost(9);
      const lobby = startedGame(host, 1, 1);
      const skewed = new SimClient(host, 'Desfasado', 'dev-skew', skew);
      // Sustituye al fugitivo por un cliente con el reloj desfasado (misma sesión).
      const r = lobby.runners[0]!;
      skewed.playerId = r.playerId;
      skewed.secret = r.secret;
      skewed.lastSeq = r.lastSeq;
      skewed.syncClock();
      const expectedEnd = host.stateOf(r.playerId).countdownEnd;
      toActive(host);
      assert.equal(host.stateOf(r.playerId).activeStart, (expectedEnd ?? 0) + 2 * MINUTE);
      const p = offsetM(CENTER, 10, 0);
      assert.equal(skewed.sendLocation(p.lat, p.lng, 8).ok, true);
      const sample = latestSample(host.stateOf(r.playerId).players[r.playerId]!);
      assert.equal(availabilityOf(sample, host.now), 'CURRENT');
    });
  }

  it('sin sincronizar, un reloj adelantado se marca sospechoso y uno atrasado parece antiguo: nunca CURRENT', () => {
    for (const skew of [10 * MINUTE, -10 * MINUTE]) {
      const host = deterministicHost(9);
      const lobby = startedGame(host, 1, 1);
      toActive(host);
      const r = lobby.runners[0]!;
      const unsynced = new SimClient(host, 'SinSync', 'dev-u', skew);
      unsynced.playerId = r.playerId;
      unsynced.secret = r.secret;
      const p = offsetM(CENTER, 10, 0);
      unsynced.sendLocation(p.lat, p.lng, 8);
      const sample = latestSample(host.stateOf(r.playerId).players[r.playerId]!);
      assert.notEqual(availabilityOf(sample, host.now), 'CURRENT', `skew ${skew}`);
    }
  });
});
