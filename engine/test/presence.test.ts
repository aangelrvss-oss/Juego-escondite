import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, PRESENCE, SECOND, TIMING } from '../src/constants.ts';
import { canReceive, snapshotFor } from '../src/view.ts';
import { activeGame } from './helpers.ts';

// D-057 (30/10/2026): presencia y periodo de gracia. A los 30 s sin ninguna señal de la aplicación los
// demás ven al jugador «sin conexión»; a los 5 min queda fuera de la partida, como si la abandonara.
// Las reglas de captura y de victoria no cambian.

describe('presencia (D-057)', () => {
  it('30 s sin señales: todos reciben «sin conexión», sin equipo ni posición; al volver, «ha vuelto»', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.awayAfterMs + SECOND);
    const away = g.eventsOf('player_presence').filter((e) => e.data.playerId === 'r1');
    assert.equal(away.length, 1);
    assert.deepEqual(away[0]?.audience, { kind: 'all' });
    assert.deepEqual(away[0]?.data, { playerId: 'r1', away: true });
    assert.equal(snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'r1')?.away, true);
    g.ok('r1', { type: 'connection', connected: true });
    assert.deepEqual(g.eventsOf('player_presence').at(-1)?.data, { playerId: 'r1', away: false });
    assert.equal(snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'r1')?.away, false);
  });

  it('una página congelada (socket abierto, sin mensajes de la aplicación) también queda «sin conexión»', () => {
    const g = activeGame();
    // Sin `connection: false`: el servidor no sabe que la página está congelada. Solo deja de dar señales.
    g.tickTo(g.now + PRESENCE.awayAfterMs + SECOND);
    assert.ok(g.eventsOf('player_presence').some((e) => e.data.playerId === 'r1' && e.data.away === true));
  });

  it('una lectura de ubicación cuenta como señal de vida', () => {
    const g = activeGame();
    for (let i = 0; i < 20; i++) {
      g.tickTo(g.now + 20 * SECOND);
      g.at('r1', 50);
      g.at('h', 0);
    }
    assert.equal(g.eventsOf('player_presence').length, 0);
    assert.equal(g.state.players.r1?.status, 'active');
  });

  it('reanudar sobre una conexión ya abierta no avisa otra vez a todos', () => {
    const g = activeGame();
    const before = g.eventsOf('player_connection').length;
    g.ok('r1', { type: 'connection', connected: true });
    g.ok('r1', { type: 'connection', connected: true });
    assert.equal(g.eventsOf('player_connection').length, before);
  });

  it('las señales de vida no mantienen abierta una sala de espera olvidada', () => {
    const g = activeGame();
    g.advance(25 * MINUTE); // termina la partida
    assert.equal(g.state.phase, 'FINISHED');
    const before = g.state.lastActivityAt;
    g.ok('h', { type: 'seen' });
    assert.equal(g.state.lastActivityAt, before);
  });
});

describe('periodo de gracia (D-057)', () => {
  it('vuelve antes de 5 min: sigue en la partida con su rol', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs - SECOND);
    g.ok('r1', { type: 'connection', connected: true });
    g.advance(2 * MINUTE);
    assert.equal(g.state.players.r1?.status, 'active');
    assert.equal(g.state.players.r1?.team, 'runner');
    assert.equal(g.eventsOf('player_left').length, 0);
  });

  it('5 min sin señales: queda fuera como si abandonara, con el motivo, y se cancelan sus reclamaciones', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 4);
    g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    const r1 = g.state.players.r1;
    assert.equal(r1?.status, 'left');
    assert.equal(r1?.leftReason, 'timeout');
    assert.equal(r1?.leftRoom, false);
    assert.deepEqual(g.eventsOf('player_left').map((e) => e.data), [{ playerId: 'r1', reason: 'timeout' }]);
    // La reclamación ya había caducado a los 30 s (sin respuesta, no hay captura: regla de siempre).
    assert.equal(g.eventsOf('runner_captured').length, 0);
    assert.equal(Object.keys(g.state.claims).length, 0);
    assert.equal(g.state.phase, 'ACTIVE'); // queda r2
  });

  it('si era el último fugitivo, la partida termina sin ganador (misma regla que abandonar)', () => {
    const g = activeGame();
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    assert.equal(g.state.phase, 'FINISHED');
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
  });

  it('el anfitrión que queda fuera cede el puesto', () => {
    const g = activeGame({ hunters: ['h2'] });
    g.ok('h', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    assert.equal(g.state.players.h?.status, 'left');
    assert.equal(g.state.hostId === 'h', false);
    assert.equal(g.state.phase, 'ACTIVE');
  });

  it('sale también de la última pista guardada', () => {
    const g = activeGame({ runners: ['r1', 'r2'], cfg: { pingIntervalMs: 2 * MINUTE } });
    g.at('r1', 50);
    g.at('r2', 60);
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(2 * MINUTE + SECOND); // llega la pista con r1 (su última posición, con antigüedad)
    assert.ok(g.state.lastPing?.entries.some((e) => e.runnerId === 'r1'));
    g.advance(PRESENCE.absenceTimeoutMs);
    assert.equal(g.state.lastPing?.entries.some((e) => e.runnerId === 'r1'), false);
  });

  it('un capturado (espectador) nunca queda fuera por el periodo de gracia', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'self_tag' });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + MINUTE);
    assert.equal(g.state.players.r1?.status, 'captured');
  });

  it('si coincide con el final por tiempo, gana el final (el resultado no cambia)', () => {
    const g = activeGame({ cfg: { durationMs: 10 * MINUTE } });
    // r1 deja de dar señales justo para que su plazo venza a la vez que el final.
    const end = g.state.gameEnd ?? 0;
    g.advance(end - PRESENCE.absenceTimeoutMs - g.now);
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
    assert.equal(g.eventsOf('player_left').length, 0);
  });

  it('quien queda fuera sigue sabiendo lo público (final, revancha), sin pistas ni posiciones', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    assert.equal(canReceive(g.state, { kind: 'all' }, 'r1'), true);
    assert.equal(canReceive(g.state, { kind: 'team', team: 'runner' }, 'r1'), false);
    const view = snapshotFor(g.state, 'r1', g.now);
    assert.equal(view.players.find((p) => p.id === 'r1')?.leftReason, 'timeout');
    assert.equal(view.lastPing, null);
    // Los demás no lo ven en la partida (como a quien abandona); en el final sí, con el motivo.
    assert.equal(snapshotFor(g.state, 'h', g.now).players.some((p) => p.id === 'r1'), false);
    g.advance(20 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    assert.equal(snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'r1')?.leftReason, 'timeout');
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.equal(g.state.players.r1?.status, 'invited');
    assert.equal(g.state.players.r1?.leftReason, null);
  });

  it('quien abandona por su cuenta sigue sin recibir nada (como hasta ahora)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'leave' });
    assert.equal(g.state.players.r1?.leftReason, 'left');
    assert.equal(canReceive(g.state, { kind: 'all' }, 'r1'), false);
    assert.deepEqual(g.eventsOf('player_left').at(-1)?.data, { playerId: 'r1' });
  });

  it('quien ya quedó fuera y pulsa «Salir de la sala» sale sin otro aviso', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    const before = g.eventsOf('player_left').length;
    g.ok('r1', { type: 'leave' });
    assert.equal(g.state.players.r1?.leftRoom, true);
    assert.equal(g.eventsOf('player_left').length, before);
  });

  it('el cazador recupera su reclamación pendiente en la vista (al recargar)', () => {
    const g = activeGame();
    g.at('h', 0);
    g.at('r1', 4);
    g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
    const mine = snapshotFor(g.state, 'h', g.now).pendingClaimByMe;
    assert.equal(mine?.runnerId, 'r1');
    assert.equal(mine?.expiresAt, g.now + TIMING.tagConfirmMs);
    assert.equal(snapshotFor(g.state, 'r1', g.now).pendingClaimByMe, null);
  });

  it('salir de la sala tras el final no cambia el informe: ni «abandonó» ni pierde «sin conexión» (revisión del 30/10)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    g.advance(20 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    g.ok('r2', { type: 'leave' });
    g.ok('r1', { type: 'leave' });
    const view = snapshotFor(g.state, 'h', g.now).players;
    assert.equal(view.find((p) => p.id === 'r2')?.leftReason, 'after_end');
    assert.equal(view.find((p) => p.id === 'r1')?.leftReason, 'timeout');
  });
});
