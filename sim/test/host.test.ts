import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE } from '../../engine/src/constants.ts';
import { SimClient } from '../client.ts';
import { CODE_ALPHABET, CODE_LENGTH, JOIN_RATE_LIMIT, SimHost, generateCode } from '../host.ts';
import { CENTER, T0, deterministicHost, runBotGame, startedGame } from '../scenario.ts';

describe('códigos de sala (AC-A2)', () => {
  it('6 caracteres de un alfabeto sin ambiguos (0/O, 1/I/L)', () => {
    for (let i = 0; i < 2_000; i++) {
      const code = generateCode();
      assert.equal(code.length, CODE_LENGTH);
      for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), ch);
    }
    assert.doesNotMatch(CODE_ALPHABET, /[0O1IL]/);
  });

  it('el servidor no reutiliza un código en uso aunque el generador lo repita', () => {
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    const host = new SimHost({ startTime: T0, seed: 1, codeGenerator: () => codes.shift() ?? 'ZZZZZZ' });
    const a = host.createRoom('d1', 'Ana');
    const b = host.createRoom('d2', 'Bea');
    assert.ok(a.ok && b.ok);
    assert.equal(a.code, 'AAAAAA');
    assert.equal(b.code, 'BBBBBB');
  });

  it('un código inexistente devuelve not_found', () => {
    const host = deterministicHost(1);
    assert.deepEqual(host.join('NOPE99', 'd', 'Ana'), { ok: false, error: 'not_found' });
  });
});

describe('límite de intentos de entrada (AC-A3)', () => {
  it(`${JOIN_RATE_LIMIT.attempts} intentos por minuto y dispositivo; luego se libera`, () => {
    const host = deterministicHost(1);
    for (let i = 0; i < JOIN_RATE_LIMIT.attempts; i++) {
      assert.equal(host.join(`BAD${i}`, 'dev-x', 'Ana').ok, false);
    }
    assert.deepEqual(host.join('BAD', 'dev-x', 'Ana'), { ok: false, error: 'rate_limited' });
    assert.notDeepEqual(host.join('BAD', 'dev-y', 'Ana'), { ok: false, error: 'rate_limited' });
    host.advance(JOIN_RATE_LIMIT.windowMs);
    assert.deepEqual(host.join('BAD', 'dev-x', 'Ana'), { ok: false, error: 'not_found' });
  });
});

describe('sesiones y comandos de sistema', () => {
  it('un secreto incorrecto no permite enviar comandos ni reconectar', () => {
    const host = deterministicHost(1);
    const { hostClient } = startedGame(host, 1, 1);
    const forged = host.send(hostClient.playerId, 'secreto-falso', 'x1', { type: 'end_game' });
    assert.deepEqual(forged, { ok: false, error: 'bad_session' });
    const intruder = new SimClient(host, 'Intruso', 'dev-z');
    assert.deepEqual(host.connect(hostClient.playerId, 'otro', intruder, 0), { ok: false, error: 'bad_session' });
    assert.equal(intruder.received.length, 0);
  });

  it('un cliente no puede enviar comandos de sistema (join, connection)', () => {
    const host = deterministicHost(1);
    const { runners } = startedGame(host, 1, 1);
    const r = runners[0]!;
    assert.deepEqual(r.send({ type: 'connection', connected: false }), { ok: false, error: 'forbidden' });
    assert.deepEqual(r.send({ type: 'join', name: 'x', deviceId: 'y' }), { ok: false, error: 'forbidden' });
  });
});

describe('idempotencia (AC-C4)', () => {
  it('el mismo commandId repetido produce un único efecto y la misma respuesta', () => {
    const host = deterministicHost(1);
    const lobby = startedGame(host, 1, 2, { headStartMs: MINUTE });
    host.advance(10_000 + MINUTE);
    const runner = lobby.runners[0]!;
    const first = runner.sendWithId('cmd-1', { type: 'self_tag' });
    const second = runner.sendWithId('cmd-1', { type: 'self_tag' });
    assert.deepEqual(first, { ok: true });
    assert.deepEqual(second, first);
    const state = host.stateOf(runner.playerId);
    assert.equal(state.captures.length, 1);
    // Con otro commandId sí se evalúa de nuevo (y se rechaza por estar ya capturado).
    assert.deepEqual(runner.sendWithId('cmd-2', { type: 'self_tag' }), { ok: false, error: 'already_captured' });
  });
});

describe('privacidad de los registros del servidor (AC-D7, AC-G3)', () => {
  const coordinatePattern = /40\.4\d{2,}|-3\.6\d{2,}/;

  it('los logs del servidor no contienen coordenadas en una partida completa', () => {
    const result = runBotGame({ seed: 7, hunters: 2, runners: 4, wanderer: true });
    assert.ok(result.host.logLines.length > 100);
    for (const line of result.host.logLines) assert.doesNotMatch(line, coordinatePattern, line);
  });

  it('al terminar, el servidor no conserva coordenadas de jugadores en eventos ni bandejas', () => {
    const result = runBotGame({ seed: 7, hunters: 2, runners: 4, wanderer: true });
    const state = result.host.stateOf(result.hostClient.playerId);
    assert.equal(state.phase, 'FINISHED');
    // La configuración (centro de zona y punto de encuentro) sí contiene coordenadas, pero son
    // datos de la sala, no de jugadores. Se excluyen los config_updated de la comprobación.
    const log = result.host.eventLog(state.roomId).filter((e) => e.event.type !== 'config_updated');
    assert.doesNotMatch(JSON.stringify(log), coordinatePattern);
    for (const c of result.clients) {
      const box = result.host.outboxOf(c.playerId).filter((e) => e.msg.kind !== 'event' || e.msg.type !== 'config_updated');
      assert.doesNotMatch(JSON.stringify(box), coordinatePattern);
    }
    for (const p of Object.values(state.players)) assert.deepEqual(p.samples, []);
    assert.equal(JSON.stringify(state.config?.meetingPoint), JSON.stringify(CENTER));
  });
});
