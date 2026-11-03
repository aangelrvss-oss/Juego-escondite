// A6-7: las asignaciones manuales del anfitrión solo las ve quien las hizo (teamPrefSetBy). Si el anfitrión
// sale de la sala (o pierde la conexión 2 min) y otro hereda el papel, el nuevo anfitrión ve «Sorteo» en
// todos, pero el motor sigue aplicando las asignaciones del anterior. En la caza del zorro / Infección eso
// da teams_unbalanced sin causa visible; en Clásico, roles fijados por alguien que ya no está.
// Uso: node a6-07-asignaciones-invisibles-tras-traspaso.ts. NO ejecutado por el agente 6.
import { Harness, config } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { snapshotFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';

const g = new Harness();
for (const id of ['a', 'b', 'c']) g.join(id);
g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
g.ok('h', { type: 'assign_team', targetId: 'b', pref: 'runner' }); // Ana elige a b como zorro
g.ok('h', { type: 'leave' }); // Ana se va; a hereda la sala
console.log('nuevo anfitrión:', g.state.hostId);
const seen = snapshotFor(g.state, 'a', g.now).players.map((p) => `${p.id}=${p.teamPref ?? 'oculto(Sorteo en la UI)'}`);
console.log('lo que ve el nuevo anfitrión:', seen.join(' '));
g.ok('a', { type: 'assign_team', targetId: 'c', pref: 'runner' }); // a elige a c como zorro
g.readyAll();
console.log('empezar:', JSON.stringify(g.cmd('a', { type: 'start' })));
// SI EL FALLO EXISTE imprime:
//   nuevo anfitrión: a
//   lo que ve el nuevo anfitrión: a=oculto(Sorteo en la UI) b=oculto(Sorteo en la UI) c=runner
//   empezar: {"ok":false,"error":"teams_unbalanced","detail":"fox_hunt"}
//   (y en la UI de a, «Sorteo» ya está seleccionado para b: no puede «volver» a Sorteo sin elegir otra opción antes)
