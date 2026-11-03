// A6-4: quien sale durante la cuenta atrás y provoca la vuelta a la sala (team_empty) queda status=left con
// su equipo y playedGameNo de una partida que nunca se jugó (backToLobby solo limpia a los 'active'). El
// número de partida no cambia, así que al terminar la partida real aparece en el Mission Report como
// participante que «Abandonó» (con equipo) y es invitado a la revancha.
// Uso: node a6-04-fantasma-en-informe.ts. NO ejecutado por el agente 6.
import { Harness, config } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { snapshotFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';

const g = new Harness();
g.join('a', 'hunter', 'Alba');
g.join('b', 'runner', 'Bea');
g.ok('h', { type: 'configure', config: config() });
g.readyAll();
g.ok('h', { type: 'start' });
g.ok('a', { type: 'leave' }); // el único cazador sale en la cuenta atrás -> vuelta a la sala
console.log('fase:', g.state.phase, '| a:', g.state.players.a?.status, g.state.players.a?.team, 'jugó la partida', g.state.players.a?.playedGameNo);
// Alba vuelve a entrar con el mismo móvil (su app olvidó la sesión) y se juega la partida 1 de verdad.
g.ok('a2', { type: 'join', name: 'Alba', deviceId: 'dev-a' });
g.ok('a2', { type: 'set_team_pref', pref: 'hunter' });
g.readyAll();
g.ok('h', { type: 'start' });
g.advance(5_000 + 120_000);
g.ok('h', { type: 'end_game' });
const report = snapshotFor(g.state, 'h', g.now).players.map((p) => `${p.id}:${p.name}:${p.team}:${p.status}:${p.leftReason}`);
console.log('jugadores del informe (partida', g.state.gameNo + '):', report.join(' | '));
g.ok('h', { type: 'rematch', swapRoles: false });
console.log('fantasma en la revancha:', g.state.players.a?.status);
// SI EL FALLO EXISTE imprime:
//   fase: LOBBY | a: left hunter jugó la partida 1
//   jugadores del informe (partida 1): h:Ana:...:active:null | a:Alba:hunter:left:left | b:Bea:... | a2:Alba:hunter:active:null
//   fantasma en la revancha: invited
