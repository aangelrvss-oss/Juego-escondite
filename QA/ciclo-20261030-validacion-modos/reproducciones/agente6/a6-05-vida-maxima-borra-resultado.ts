// A6-5: la vida máxima de la sala (6 h desde createdAt) solo se comprueba en LOBBY y FINISHED. Una partida
// que empieza antes de las 6 h y termina después pasa a CANCELLED en el MISMO paso en que termina: nadie ve
// el Mission Report ni puede pedir revancha (el hub borra la sala 60 s después).
// Uso: node a6-05-vida-maxima-borra-resultado.ts. NO ejecutado por el agente 6.
import { Harness, config, T0 } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';

const MIN = 60_000;
const g = new Harness();
g.join('r1', 'runner');
g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
g.ok('h', { type: 'configure', config: config({ durationMs: 30 * MIN }) });
// Tarde larga en la misma sala: actividad cada 20 min (aquí basta con marcar/desmarcar «listo»).
while (g.now + 20 * MIN < T0 + 6 * 60 * MIN) {
  g.now += 20 * MIN;
  g.ok('r1', { type: 'set_ready', ready: false });
}
g.readyAll();
g.ok('h', { type: 'start' }); // a las 5 h 40 min
g.advance(5_000 + 2 * MIN + 31 * MIN); // termina por tiempo a las ~6 h 12 min
const types = g.events.slice(-4).map((e) => e.type);
console.log('fase:', g.state.phase, '| closeReason:', g.state.closeReason, '| últimos eventos:', types.join(', '));
console.log('outcome conservado:', JSON.stringify(g.state.outcome));
// SI EL FALLO EXISTE imprime:
//   fase: CANCELLED | closeReason: expired | últimos eventos: ..., game_finished, room_closed
//   (el cliente pinta «La sala se ha cerrado» en lugar del informe)
