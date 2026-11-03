// A4-3 · `set_team_pref` no está en la interfaz, pero el servidor lo acepta de cualquier jugador y la
// preferencia queda oculta al anfitrión. En la Caza del zorro un jugador puede: (1) autoelegirse zorro;
// (2) bloquear el inicio (dos «zorros» o todos «cazador») sin que el anfitrión pueda ver por qué.
// NO EJECUTADO por el agente 4. Uso (Node 24): node <ruta>/repro-a4-3-autoeleccion-zorro.mjs
// Resultado esperado HOY: (1) a es zorro y el anfitrión ve teamPref null para todos;
// (2) teams_unbalanced/fox_hunt con todas las preferencias null en la vista del anfitrión.
const R = 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion';
const { Harness, config } = await import(`${R}/engine/test/helpers.ts`);
const { TIMING } = await import(`${R}/engine/src/constants.ts`);
const { snapshotFor } = await import(`${R}/engine/src/view.ts`);

{
  const g = new Harness();
  for (const id of ['a', 'b', 'c']) g.join(id);
  g.ok('a', { type: 'set_team_pref', pref: 'runner' }); // comando enviado a mano (consola / cliente modificado)
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  g.readyAll();
  console.log('(1) prefs vistas por el anfitrión:', snapshotFor(g.state, 'h', g.now).players.map((p) => `${p.id}:${p.teamPref}`));
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs);
  console.log('(1) zorro:', Object.values(g.state.players).filter((p) => p.team === 'runner').map((p) => p.id), '(esperado hoy: [a] siempre)');
}
{
  const g = new Harness();
  for (const id of ['a', 'b', 'c']) g.join(id);
  g.ok('a', { type: 'set_team_pref', pref: 'runner' });
  g.ok('b', { type: 'set_team_pref', pref: 'runner' });
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  g.readyAll();
  console.log('(2) start:', g.cmd('h', { type: 'start' }), '| prefs vistas por el anfitrión:', snapshotFor(g.state, 'h', g.now).players.map((p) => `${p.id}:${p.teamPref}`));
}
