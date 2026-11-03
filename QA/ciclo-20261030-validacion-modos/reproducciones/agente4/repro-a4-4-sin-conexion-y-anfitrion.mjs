// A4-4 / A4-5 · (a) Un cazador «sin conexión» (30 s) sigue llegando al zorro como `hunter_seen` con su
// última posición; un zorro «sin conexión» sigue saliendo en las pistas con posición. (b) El anfitrión
// que es el zorro puede terminar la partida sin ganador con una reclamación pendiente contra él.
// NO EJECUTADO por el agente 4. Uso (Node 24): node <ruta>/repro-a4-4-sin-conexion-y-anfitrion.mjs
const R = 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion';
const { Harness, config } = await import(`${R}/engine/test/helpers.ts`);
const { TIMING, MINUTE, SECOND } = await import(`${R}/engine/src/constants.ts`);
const { visiblePositions } = await import(`${R}/engine/src/view.ts`);

{
  const g = new Harness();
  for (const id of ['f', 'h2', 'h3']) g.join(id);
  g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt', pingIntervalMs: 2 * MINUTE }) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs + 2 * MINUTE);
  for (const [id, n] of [['h', 0], ['h2', 50], ['h3', 80], ['f', 200]]) g.at(id, n);
  g.ok('h2', { type: 'connection', connected: false }); // deja de dar señales
  g.advance(40 * SECOND);
  console.log('(a) h2.away =', g.state.players.h2.away, '| el zorro recibe h2:', visiblePositions(g.state, 'f', g.now).filter((p) => p.playerId === 'h2').map((p) => ({ reason: p.reason, hasPos: p.lat !== null, ageS: Math.round(p.ageMs / 1000), availability: p.availability })));
  g.ok('f', { type: 'connection', connected: false });
  g.advance(2 * MINUTE);
  const ping = g.eventsOf('ping').at(-1)?.data.ping;
  console.log('(a) f.away =', g.state.players.f.away, '| pista:', ping?.entries.map((e) => ({ hasPos: Boolean(e.position), ageS: Math.round(e.ageMs / 1000), availability: e.availability })));
}
{
  const g = new Harness();
  for (const id of ['h2', 'h3']) g.join(id);
  g.ok('h', { type: 'set_team_pref', pref: 'runner' }); // el anfitrión es el zorro
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs + 2 * MINUTE);
  g.at('h', 100);
  g.at('h2', 100);
  const r = g.cmd('h2', { type: 'claim_tag', runnerId: 'h' });
  console.log('(b) claim:', r.ok);
  g.ok('h', { type: 'end_game' });
  console.log('(b) outcome:', g.state.outcome, '(esperado hoy: winner null, ended_by_host)');
}
