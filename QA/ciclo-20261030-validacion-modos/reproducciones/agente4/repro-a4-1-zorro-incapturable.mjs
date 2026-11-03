// A4-1 · El zorro puede volverse incapturable por reclamación sin quedar «sin conexión»:
//   A) deja de enviar ubicación (GPS apagado/permiso retirado) pero la app sigue viva (señales de vida);
//   B) envía lecturas con precisión > 30 m (interiores o valor manipulado);
//   C) no responde a las reclamaciones (caducan sin marca de juego limpio);
//   D) reclamación pendiente al llegar el final: gana el zorro por tiempo.
// NO EJECUTADO por el agente 4. Uso (Node 24): node <ruta>/repro-a4-1-zorro-incapturable.mjs
// Resultado esperado HOY: A → target_location_stale y gana el zorro; B → accuracy_too_low y no
// expuesto fuera de la zona; C → flags {} tras 3 caducidades; D → time_up, ganador runner.
import assert from 'node:assert/strict';

const R = 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion';
const { Harness, config } = await import(`${R}/engine/test/helpers.ts`);
const { TIMING, MINUTE, SECOND } = await import(`${R}/engine/src/constants.ts`);
const { visiblePositions } = await import(`${R}/engine/src/view.ts`);

function foxGame() {
  const g = new Harness();
  for (const id of ['f', 'h2', 'h3']) g.join(id);
  g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs);
  g.advance(2 * MINUTE);
  assert.equal(g.state.phase, 'ACTIVE');
  return g;
}

// A) GPS apagado, app viva.
{
  const g = foxGame();
  g.at('f', 100);
  g.advance(20 * SECOND); // Harness.advance envía `seen` de quien está conectado (la app viva)
  g.at('h', 100);
  console.log('A claim:', g.cmd('h', { type: 'claim_tag', runnerId: 'f' }), '| f.away =', g.state.players.f.away);
  g.advance(4 * MINUTE);
  const ping = g.eventsOf('ping').at(-1)?.data.ping;
  console.log('A última pista:', ping?.entries.map((e) => ({ ageS: Math.round(e.ageMs / 1000), availability: e.availability, hasPos: Boolean(e.position) })));
  g.advance(20 * MINUTE);
  console.log('A resultado:', g.state.outcome, '(esperado hoy: winner runner, time_up)');
}

// B) Precisión > 30 m: reclamación imposible; fuera de la zona sin exposición.
{
  const g = foxGame();
  g.at('f', 100, 31);
  g.at('h', 100);
  console.log('B claim con acc 31 m:', g.cmd('h', { type: 'claim_tag', runnerId: 'f' }));
  g.advance(2 * SECOND);
  g.at('f', 450, 200); // 50 m fuera del círculo de 400 m, ±200 m
  g.advance(TIMING.outOfZoneGraceMs + 5 * SECOND);
  g.at('f', 451, 200);
  console.log('B expuesto:', g.state.players.f.exposed, '| h ve al zorro:', visiblePositions(g.state, 'h', g.now).some((p) => p.playerId === 'f'));
}

// C) Ignorar reclamaciones: caducan y no dejan marca.
{
  const g = foxGame();
  for (let i = 0; i < 3; i++) {
    g.at('f', 100);
    g.at('h', 100);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'f' });
    assert.equal(r.ok, true, JSON.stringify(r));
    g.advance(TIMING.tagConfirmMs + SECOND);
  }
  console.log('C caducidades:', g.eventsOf('tag_claim_resolved').filter((e) => e.data.result === 'expired').length, '| rejectedTagCount:', g.state.players.f.rejectedTagCount, '| flags:', g.state.players.f.flags);
  g.advance(20 * MINUTE);
  console.log('C flags en game_finished:', g.eventsOf('game_finished').at(-1)?.data.flags, '| outcome:', g.state.outcome);
}

// D) Reclamación válida pendiente cuando llega el final.
{
  const g = foxGame();
  g.advance(g.state.gameEnd - g.now - 20 * SECOND);
  g.at('f', 100);
  g.at('h', 100);
  const r = g.cmd('h', { type: 'claim_tag', runnerId: 'f' });
  assert.equal(r.ok, true, JSON.stringify(r));
  g.advance(25 * SECOND);
  console.log('D outcome:', g.state.outcome, '| responder tarde:', g.cmd('f', { type: 'respond_tag', claimId: r.data.claimId, accept: true }));
}
