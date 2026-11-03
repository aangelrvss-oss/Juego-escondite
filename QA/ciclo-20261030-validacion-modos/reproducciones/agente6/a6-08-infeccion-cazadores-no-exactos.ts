// A6-8: Infección exige cazadores iniciales «exactos» max(1, floor(n/4)) al empezar, pero si un fugitivo
// sale durante la cuenta atrás la partida sigue con los cazadores calculados para n (leave() solo mira
// equipos vacíos y el mínimo de jugadores). Con 8 -> 7 jugadores quedan 2 cazadores donde la regla da 1.
// Uso: node a6-08-infeccion-cazadores-no-exactos.ts. NO ejecutado por el agente 6.
import { Harness, config } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { MODES } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/modes.ts';

const g = new Harness();
for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) g.join(id);
g.ok('h', { type: 'configure', config: config({ mode: 'infection' }) });
g.readyAll();
g.ok('h', { type: 'start' });
const runnerToLeave = g.state.playerOrder.find((id) => g.state.players[id]?.team === 'runner' && id !== 'h')!;
g.ok(runnerToLeave, { type: 'leave' });
g.advance(5_000 + 120_000);
const active = Object.values(g.state.players).filter((p) => p.status === 'active');
const hunters = active.filter((p) => p.team === 'hunter').length;
console.log('fase:', g.state.phase, '| jugadores:', active.length, '| cazadores:', hunters, '| la regla daría:', MODES.infection.hunters(active.length));
// SI EL FALLO EXISTE imprime: fase: ACTIVE | jugadores: 7 | cazadores: 2 | la regla daría: 1
