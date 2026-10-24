import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR } from '../../engine/src/constants.ts';
import { runBotGame } from '../scenario.ts';
import type { BotGameResult } from '../scenario.ts';

// Partidas completas con bots SIMULADOS. No sustituyen a dispositivos reales:
// validan reglas e invariantes, no GPS, batería, red móvil ni segundo plano.

function summary(r: BotGameResult) {
  const state = r.host.stateOf(r.hostClient.playerId);
  return {
    outcome: state.outcome,
    captures: state.captures,
    perClient: r.clients.map((c) => c.applied.map((e) => `${e.seq}:${e.type}:${e.at}`)),
    positions: r.clients.map((c) => c.positions.length),
  };
}

describe('simulación determinista', () => {
  it('la misma semilla produce exactamente la misma partida', () => {
    const a = runBotGame({ seed: 11, hunters: 2, runners: 5, wanderer: true });
    const b = runBotGame({ seed: 11, hunters: 2, runners: 5, wanderer: true });
    assert.deepEqual(summary(a), summary(b));
  });

  it('semillas distintas pueden producir partidas distintas', () => {
    const outs = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(summary(runBotGame({ seed, hunters: 2, runners: 5 }))));
    assert.ok(new Set(outs).size > 1);
  });
});

describe('invariantes de visibilidad en partidas completas', () => {
  for (const [hunters, runners] of [
    [1, 1],
    [3, 7],
    [5, 15],
  ] as const) {
    it(`${hunters + runners} jugadores (${hunters}C + ${runners}F), 5 semillas`, () => {
      for (const seed of [21, 22, 23, 24, 25]) {
        const r = runBotGame({ seed, hunters, runners, wanderer: true });
        const state = r.host.stateOf(r.hostClient.playerId);
        assert.equal(state.phase, 'FINISHED');
        const team = new Map(Object.values(state.players).map((p) => [p.id, p.team]));
        const activeStart = state.activeStart ?? Number.POSITIVE_INFINITY;

        for (const c of r.clients) {
          const myTeam = team.get(c.playerId);
          for (const batch of c.positions) {
            for (const v of batch.positions) {
              const theirTeam = team.get(v.playerId);
              // Toda posición lleva antigüedad o se declara no disponible.
              assert.ok(v.ageMs !== null || v.availability === 'UNAVAILABLE');
              if (v.reason === 'spectator_delayed') continue; // solo capturados (comprobado abajo)
              if (myTeam === 'runner') assert.equal(theirTeam, 'runner', 'un fugitivo recibió a un cazador');
              if (myTeam === 'hunter' && theirTeam === 'runner') {
                assert.equal(v.reason, 'exposed');
                assert.ok(batch.at > activeStart, 'cazador recibió a un fugitivo antes de ACTIVE');
              }
            }
          }
          const pings = c.applied.filter((e) => e.type === 'ping');
          if (myTeam === 'runner') assert.equal(pings.length, 0, 'un fugitivo recibió una pista');
          for (const p of pings) assert.ok(p.at > activeStart);
          // Tras el final no llega ninguna posición más.
          const finishedAt = state.finishedAt ?? 0;
          assert.ok(c.positions.every((b) => b.at <= finishedAt));
        }
        // Los espectadores con retraso son, efectivamente, fugitivos capturados.
        for (const c of r.clients) {
          if (c.positions.some((b) => b.positions.some((v) => v.reason === 'spectator_delayed'))) {
            assert.equal(state.players[c.playerId]?.status, 'captured');
          }
        }
      }
    });
  }

  it('el fugitivo que sale de la zona llega a quedar expuesto y los cazadores lo reciben', () => {
    const r = runBotGame({ seed: 31, hunters: 1, runners: 3, wanderer: true, cfg: { pingIntervalMs: 15 * 60_000 } });
    const hunter = r.hunters[0]!;
    assert.ok(hunter.applied.some((e) => e.type === 'runner_exposed'));
    assert.ok(hunter.positions.some((b) => b.positions.some((v) => v.reason === 'exposed')));
  });
});

describe('volumen de mensajes SIMULADO (T13, entrada para el §5 del plan)', () => {
  it('mensajes por jugador y hora con envío cada 5 s', (t) => {
    const rows: string[] = [];
    for (const [hunters, runners] of [
      [1, 1],
      [3, 7],
      [5, 15],
    ] as const) {
      const r = runBotGame({ seed: 41, hunters, runners });
      const state = r.host.stateOf(r.hostClient.playerId);
      const liveStart = state.countdownEnd ?? 0;
      const finishedAt = state.finishedAt ?? 0;
      const liveMs = finishedAt - liveStart;
      const n = hunters + runners;
      // Tiempo enviando de cada jugador: hasta su captura (los capturados dejan de enviar) o el final.
      const capturedAt = new Map(state.captures.map((c) => [c.runnerId, (state.activeStart ?? 0) + c.atOffsetMs]));
      const sendingMs = r.clients.reduce((sum, c) => sum + ((capturedAt.get(c.playerId) ?? finishedAt) - liveStart), 0);
      const inbound = [...r.host.inbound.values()].reduce((a, b) => a + b, 0);
      const outbound = [...r.host.outbound.values()].reduce((a, b) => a + b, 0);
      const perPlayerHourIn = inbound * (HOUR / sendingMs);
      const perPlayerHourOut = (outbound / n) * (HOUR / liveMs);
      rows.push(
        `n=${n} vivo=${Math.round(liveMs / 60_000)}min capturas=${state.captures.length} subida/jug-activo/h=${Math.round(perPlayerHourIn)} bajada/jug/h=${Math.round(perPlayerHourOut)}`,
      );
      // Subida esperada ≈ 720/h (1 cada 5 s) más algunos comandos; bajada ≈ 720/h agrupada más eventos.
      assert.ok(perPlayerHourIn > 650 && perPlayerHourIn < 900, rows.at(-1));
      assert.ok(perPlayerHourOut < 1_200, rows.at(-1));
    }
    for (const row of rows) t.diagnostic(row);
  });
});
