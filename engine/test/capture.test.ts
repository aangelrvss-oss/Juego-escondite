import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SECOND, TIMING } from '../src/constants.ts';
import { activeGame } from './helpers.ts';
import type { Harness } from './helpers.ts';

function claimId(g: Harness): string {
  const ev = g.eventsOf('tag_claimed').at(-1);
  return String(ev?.data.claimId);
}

const err = (r: { ok: boolean; error?: string }) => (r.ok ? 'ok' : r.error);

describe('validación de capturas (AC-E1 a AC-E7)', () => {
  it('autodeclaración del fugitivo: captura inmediata; si era el último, ganan los cazadores', () => {
    const g = activeGame();
    g.ok('r1', { type: 'self_tag', hunterId: 'h' });
    assert.equal(g.state.players.r1?.status, 'captured');
    assert.deepEqual(g.state.captures[0], { runnerId: 'r1', hunterId: 'h', atOffsetMs: 0, via: 'self' });
    assert.deepEqual(g.state.outcome, { winner: 'hunter', cause: 'all_captured' });
  });

  it('reclamación plausible + confirmación del fugitivo = captura', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 6);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
    assert.equal(r.ok, true);
    const claimed = g.eventsOf('tag_claimed')[0];
    assert.deepEqual(claimed?.audience, { kind: 'players', ids: ['r1'] });
    assert.equal(g.state.players.r1?.status, 'active'); // aún no capturado
    g.ok('r1', { type: 'respond_tag', claimId: claimId(g), accept: true });
    assert.equal(g.state.players.r1?.status, 'captured');
  });

  it('el fugitivo puede rechazar; sin respuesta en 30 s no hay captura', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 6);
    g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
    g.ok('r1', { type: 'respond_tag', claimId: claimId(g), accept: false });
    assert.equal(g.state.players.r1?.status, 'active');

    g.now += SECOND;
    g.at('h', 0);
    g.at('r1', 6);
    g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
    const id = claimId(g);
    g.advance(TIMING.tagConfirmMs);
    assert.equal(g.state.players.r1?.status, 'active');
    assert.equal(g.eventsOf('tag_claim_resolved').at(-1)?.data.result, 'expired');
    assert.equal(err(g.cmd('r1', { type: 'respond_tag', claimId: id, accept: true })), 'claim_not_found');
  });

  it('el cazador no puede confirmar su propia reclamación (captura falsificada)', () => {
    const g = activeGame();
    g.at('h', 0);
    g.at('r1', 6);
    g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
    assert.equal(err(g.cmd('h', { type: 'respond_tag', claimId: claimId(g), accept: true })), 'claim_not_found');
    assert.equal(g.state.players.r1?.status, 'active');
  });

  const rejections: [string, (g: Harness) => void, string][] = [
    ['sin posición del cazador', (g) => g.at('r1', 5), 'your_location_stale'],
    ['posición del cazador de hace más de 15 s', (g) => {
      g.at('h', 0, 8, g.now - 16 * SECOND);
      g.at('r1', 5);
    }, 'your_location_stale'],
    ['posición del fugitivo de hace más de 15 s', (g) => {
      g.at('h', 0);
      g.at('r1', 5, 8, g.now - 16 * SECOND);
    }, 'target_location_stale'],
    ['reloj sospechoso', (g) => {
      g.at('h', 0, 8, g.now + 60 * SECOND);
      g.at('r1', 5);
    }, 'your_location_stale'],
    ['precisión peor de 30 m', (g) => {
      g.at('h', 0, 31);
      g.at('r1', 5);
    }, 'accuracy_too_low'],
    ['demasiado lejos: 22 m con umbral 5+8+8 = 21 m', (g) => {
      g.at('h', 0);
      g.at('r1', 22);
    }, 'not_close_enough'],
    ['tope de 40 m aunque la suma de precisiones sea mayor', (g) => {
      g.at('h', 0, 30);
      g.at('r1', 41, 30);
    }, 'not_close_enough'],
  ];
  for (const [name, prepare, expected] of rejections) {
    it(`rechaza: ${name}`, () => {
      const g = activeGame();
      prepare(g);
      const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
      assert.equal(err(r), expected);
      // El rechazo no revela la distancia ni la posición del fugitivo.
      assert.deepEqual(Object.keys(r).sort(), ['error', 'ok']);
      assert.equal(g.state.players.r1?.status, 'active');
    });
  }

  it('acepta justo en el umbral (20 m con precisiones de 8 m)', () => {
    const g = activeGame();
    g.at('h', 0);
    g.at('r1', 20);
    assert.equal(g.cmd('h', { type: 'claim_tag', runnerId: 'r1' }).ok, true);
  });

  it('reclamaciones simultáneas: solo una pendiente por fugitivo y por cazador (AC-E5)', () => {
    const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] });
    for (const id of ['h', 'h2', 'r1', 'r2']) g.at(id, 3);
    g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
    assert.equal(err(g.cmd('h2', { type: 'claim_tag', runnerId: 'r1' })), 'already_pending');
    assert.equal(err(g.cmd('h', { type: 'claim_tag', runnerId: 'r2' })), 'already_pending');
    // Si el fugitivo se autodeclara con una reclamación pendiente, se atribuye a ese cazador.
    g.ok('r1', { type: 'self_tag' });
    assert.equal(g.state.captures[0]?.hunterId, 'h');
    assert.equal(err(g.cmd('h2', { type: 'claim_tag', runnerId: 'r1' })), 'already_captured');
  });

  it('roles y fases incorrectos (AC-E6)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 3);
    g.at('r2', 3);
    assert.equal(err(g.cmd('r2', { type: 'claim_tag', runnerId: 'r1' })), 'not_a_hunter');
    assert.equal(err(g.cmd('h', { type: 'claim_tag', runnerId: 'h' })), 'target_not_active');
    assert.equal(err(g.cmd('h', { type: 'self_tag' })), 'not_a_runner');
    g.ok('h', { type: 'end_game' });
    assert.equal(err(g.cmd('h', { type: 'claim_tag', runnerId: 'r1' })), 'wrong_phase');
  });

  it('tres rechazos del mismo fugitivo quedan marcados', () => {
    const g = activeGame();
    for (let i = 0; i < 3; i++) {
      g.now += SECOND;
      g.at('h', 0);
      g.at('r1', 4);
      g.ok('h', { type: 'claim_tag', runnerId: 'r1' });
      g.ok('r1', { type: 'respond_tag', claimId: claimId(g), accept: false });
    }
    assert.deepEqual(g.state.players.r1?.flags, ['repeated_tag_rejections']);
  });

  it('si un implicado abandona, la reclamación se cancela', () => {
    const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] });
    g.at('h2', 0);
    g.at('r1', 4);
    g.ok('h2', { type: 'claim_tag', runnerId: 'r1' });
    g.ok('h2', { type: 'leave' });
    assert.deepEqual(g.state.claims, {});
    assert.equal(g.eventsOf('tag_claim_resolved').at(-1)?.data.result, 'cancelled');
  });
});
