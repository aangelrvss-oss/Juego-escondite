// Reproducciones del Agente 1 (auditoría de solo lectura). NO modifica el repositorio.
// Ejecutar: node C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\agente1\repro-agente1.ts
// Cada escenario imprime «OBSERVADO» y «ESPERADO SI EL HALLAZGO EXISTE».
import { Harness, config } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { MINUTE, SECOND, TIMING, PRESENCE } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/constants.ts';
import { snapshotFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';
import { MODES } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/modes.ts';
import { resolveTeams } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/teams.ts';

const out = (id: string, observed: unknown, expected: string) =>
  console.log(`\n[${id}]\n  OBSERVADO: ${JSON.stringify(observed)}\n  ESPERADO SI EL HALLAZGO EXISTE: ${expected}`);

function toActive(g: Harness) {
  g.readyAll();
  const r = g.cmd('h', { type: 'start' });
  if (!r.ok) return r;
  g.advance(TIMING.countdownMs);
  g.advance(g.state.config?.headStartMs ?? 0);
  return r;
}

// ---------------------------------------------------------------------------------------------
// A1-1: un jugador (no anfitrión) se elige a sí mismo zorro con set_team_pref (cliente modificado),
// aunque §11.3 dice «por sorteo o asignado por el anfitrión». También puede bloquear el inicio.
{
  const g = new Harness();
  for (const id of ['a', 'b', 'c']) g.join(id);
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  g.ok('c', { type: 'set_team_pref', pref: 'runner' }); // c se pide ser el zorro
  g.readyAll();
  // repetimos con varias semillas/partidas: c siempre es el zorro
  const r = g.cmd('h', { type: 'start' });
  out('A1-1a fox self-pick', { start: r, foxIs: Object.values(g.state.players).filter((p) => p.team === 'runner').map((p) => p.id), hostSeesPrefOfC: snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'c')?.teamPref },
    'start ok y foxIs = ["c"] siempre (independiente del sorteo); el anfitrión no ve la preferencia de c (teamPref null)');

  const g2 = new Harness();
  for (const id of ['a', 'b', 'c']) g2.join(id);
  g2.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  g2.ok('b', { type: 'set_team_pref', pref: 'runner' });
  g2.ok('c', { type: 'set_team_pref', pref: 'runner' });
  g2.readyAll();
  out('A1-1b fox start blocked by players', g2.cmd('h', { type: 'start' }),
    '{"ok":false,"error":"teams_unbalanced","detail":"fox_hunt"} sin que el anfitrión pueda ver por qué (prefs ocultas)');

  const g3 = new Harness();
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'x']) g3.join(id); // n = 8 -> 2 cazadores
  g3.ok('h', { type: 'configure', config: config({ mode: 'infection' }) });
  g3.ok('x', { type: 'set_team_pref', pref: 'hunter' });
  g3.readyAll();
  const r3 = g3.cmd('h', { type: 'start' });
  out('A1-1c infection self-pick hunter', { start: r3, xTeam: g3.state.players.x?.team }, 'start ok y xTeam = "hunter" siempre');
}

// ---------------------------------------------------------------------------------------------
// A1-2: revancha de Clásico con swapRoles:true y después cambio de modo a Fox Hunt / Infección:
// las preferencias arrastradas (ocultas: teamPrefSetBy=null) impiden empezar.
{
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  for (const id of ['a', 'b', 'c']) g.join(id, 'runner');
  g.ok('h', { type: 'configure', config: config() });
  toActive(g);
  g.advance(21 * MINUTE); // final por tiempo
  g.ok('h', { type: 'rematch', swapRoles: true });
  for (const id of ['a', 'b', 'c']) g.ok(id, { type: 'join_rematch' });
  g.ok('h', { type: 'configure', config: config({ mode: 'infection' }) });
  g.readyAll();
  const r = g.cmd('h', { type: 'start' });
  out('A1-2 swap->infection', { start: r, prefsVisibleToHost: snapshotFor(g.state, 'h', g.now).players.map((p) => [p.id, p.teamPref]) },
    '{"ok":false,"error":"teams_unbalanced","detail":"infection"} (swap fija 3 cazadores; Infección con n=4 exige 1) y prefs no visibles para el anfitrión (null salvo la suya)');
}

// ---------------------------------------------------------------------------------------------
// A1-3: límite exacto de la espera de 60 s (verificación, no fallo esperado).
{
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  for (const id of ['r1', 'r2', 'r3']) g.join(id, 'runner');
  g.ok('h', { type: 'configure', config: config({ mode: 'infection' }) });
  toActive(g);
  g.at('h', 0); g.at('r1', 4);
  const c = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' }) as { ok: true; data: { claimId: string } };
  g.ok('r1', { type: 'respond_tag', claimId: c.data.claimId, accept: true });
  const canTagFrom = g.state.players.r1!.canTagFrom!;
  // reconexión / away durante la espera no la cambia
  g.ok('r1', { type: 'connection', connected: false });
  g.tickTo(g.now + PRESENCE.awayAfterMs + 1);
  const awayFlag = g.state.players.r1!.away;
  g.ok('r1', { type: 'connection', connected: true });
  const afterReconnect = g.state.players.r1!.canTagFrom;
  g.now = canTagFrom - 1;
  g.at('r1', 100); g.at('r2', 104);
  const at59999 = g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' });
  g.now = canTagFrom;
  g.at('r1', 100, 8, g.now); g.at('r2', 104, 8, g.now);
  const at60000 = g.cmd('r1', { type: 'claim_tag', runnerId: 'r2' });
  out('A1-3 cooldown limit', { awayFlag, unchangedAfterReconnect: afterReconnect === canTagFrom, at59999, at60000: at60000.ok },
    'VERIFICACIÓN: at59999 = tag_cooldown, at60000 = true, unchangedAfterReconnect = true');
}

// ---------------------------------------------------------------------------------------------
// A1-4: el zorro deja de dar señales 4 min antes del final y gana por tiempo (sigue «sin conexión»).
{
  const g = new Harness();
  for (const id of ['f', 'h2', 'h3']) g.join(id);
  g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
  g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
  toActive(g);
  g.advance(16 * MINUTE);
  g.ok('f', { type: 'connection', connected: false });
  g.advance(4 * MINUTE + SECOND);
  out('A1-4 fox silent wins', { outcome: g.state.outcome, foxAwayEvents: g.eventsOf('player_presence').filter((e) => e.data.playerId === 'f').length },
    'outcome {"winner":"runner","cause":"time_up"} aunque el zorro lleva 4 min sin señal (conforme a D-057 literal; riesgo de diseño)');
}

// ---------------------------------------------------------------------------------------------
// A1-5: todos sin señal a la vez: la causa del final depende del orden alfabético de los ids.
{
  for (const runnerId of ['a', 'z']) {
    const g = new Harness();
    g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
    g.join(runnerId, 'runner');
    g.ok('h', { type: 'configure', config: config() });
    toActive(g);
    g.tickTo(g.now + PRESENCE.absenceTimeoutMs + 1); // nadie da señales
    out(`A1-5 all timeout (runner id=${runnerId})`, g.state.outcome,
      'runner "a" -> runners_abandoned; runner "z" -> hunters_abandoned (depende del id, ambos sin ganador)');
  }
}

// ---------------------------------------------------------------------------------------------
// A1-6: Infección, todos los cazadores iniciales abandonan; queda un convertido en su espera.
{
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  for (const id of ['r1', 'r2', 'r3']) g.join(id, 'runner');
  g.ok('h', { type: 'configure', config: config({ mode: 'infection' }) });
  toActive(g);
  g.ok('r1', { type: 'self_tag', hunterId: 'h' });
  g.ok('h', { type: 'leave' });
  out('A1-6 converted counts as hunter', { phase: g.state.phase, outcome: g.state.outcome, host: g.state.hostId },
    'VERIFICACIÓN: phase ACTIVE (el convertido cuenta como cazador; §3.6 «iniciales y convertidos»)');
}

// ---------------------------------------------------------------------------------------------
// A1-7: Infección n=4..20, sorteo con 50 semillas: número exacto de cazadores.
{
  const bad: unknown[] = [];
  for (let n = 4; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, teamPref: 'random' })) as never[];
    for (let seed = 0; seed < 50; seed++) {
      const t = resolveTeams(players, seed, MODES.infection);
      const h = [...(t?.values() ?? [])].filter((x) => x === 'hunter').length;
      if (h !== Math.max(1, Math.floor(n / 4))) bad.push({ n, seed, h });
      const f = resolveTeams(players, seed, MODES.fox_hunt);
      const r = [...(f?.values() ?? [])].filter((x) => x === 'runner').length;
      if (n >= 3 && r !== 1) bad.push({ fox: true, n, seed, r });
    }
  }
  out('A1-7 exact hunters n=4..20', bad, 'VERIFICACIÓN: [] (ningún caso incorrecto)');
}
