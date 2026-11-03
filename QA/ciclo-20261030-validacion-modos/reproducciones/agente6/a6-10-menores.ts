// Hallazgos menores (P3) de A6, cada uno en su bloque. Uso: node a6-10-menores.ts. NO ejecutado por el agente 6.
import { Harness, activeGame, config } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { snapshotFor, visiblePositions } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';
import { mapModel } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/mobile/www/js/game-view.js';

const MIN = 60_000;

// A6-10 · Infección: tras convertirse, el móvil del convertido sigue dibujando las últimas posiciones de sus
// antiguos compañeros (fugitivos), ahora pintadas como «Tu equipo» (cazador), hasta el siguiente envío de
// posiciones (hasta 5 s): role_changed no limpia ui.positions (app.js:278-286) y el servidor no reenvía.
{
  const g = activeGame({ runners: ['r1', 'r2', 'r3'], cfg: { mode: 'infection' } });
  for (const id of ['h', 'r1', 'r2', 'r3']) g.at(id, 100);
  const before = visiblePositions(g.state, 'r1', g.now); // lo último que recibió r1 como fugitivo
  g.ok('r1', { type: 'self_tag', hunterId: 'h' });
  const snap = snapshotFor(g.state, 'r1', g.now);
  const m = mapModel({ snap, team: 'hunter', positions: before, positionsAt: g.now, now: g.now });
  console.log('A6-10 puntos de fugitivos pintados como compañeros cazadores:', m?.dots.filter((d) => d.kind === 'mate' && d.team === 'hunter').map((d) => d.id));
  // SI EL FALLO EXISTE: [ 'r2', 'r3' ]
}

// A6-11 · Una sala de espera no caduca por inactividad si algún móvil reconecta: `connection` cuenta como
// actividad (engine.ts:556-559 solo excluye 'seen'), así que una pestaña olvidada que reconecta la mantiene
// viva hasta las 6 h.
{
  const g = new Harness();
  g.join('r1');
  for (let i = 0; i < 8; i++) {
    g.now += 25 * MIN;
    g.ok('r1', { type: 'connection', connected: false });
    g.ok('r1', { type: 'connection', connected: true });
  }
  console.log('A6-11 fase tras 3 h 20 min sin que nadie haga nada en la sala:', g.state.phase);
  // SI EL FALLO EXISTE: LOBBY (la regla dice 30 min de inactividad)
}

// A6-12 · «Roles ocultos hasta el final» (§11.4) no se cumple en la práctica: cada jugador ve el equipo de
// sus compañeros y null en los demás, así que deduce el de todos por complemento.
{
  const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] });
  const view = snapshotFor(g.state, 'r1', g.now).players.map((p) => `${p.id}:${p.team ?? '¿?'}`);
  console.log('A6-12 lo que ve r1 en plena persecución:', view.join(' '), '=> los ¿? son cazadores');
}

// A6-13 · Dejar caducar una reclamación no deja rastro: solo el rechazo explícito cuenta para la marca
// repeated_tag_rejections. Un fugitivo que ignora todas las reclamaciones no aparece marcado.
{
  const g = activeGame({ runners: ['r1', 'r2'] });
  for (let i = 0; i < 4; i++) {
    g.at('h', 0);
    g.at('r1', 3);
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
    if (!r.ok) console.log('reclamación', i, r);
    g.advance(31_000); // r1 no contesta
  }
  console.log('A6-13 marcas de r1 tras 4 reclamaciones ignoradas:', JSON.stringify(g.state.players.r1?.flags), 'rechazos:', g.state.players.r1?.rejectedTagCount);
  // SI EL FALLO EXISTE: [] rechazos: 0
}
void config;
