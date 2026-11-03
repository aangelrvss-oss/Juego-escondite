// A6-3: quien pulsa «Abandonar la partida» (un solo `leave` en HEAD_START/ACTIVE; el cliente después olvida
// la sesión, app.js:1380-1385) queda status=left con leftRoom=false. En la revancha el motor lo invita
// (status=invited) y, como su móvil ya no tiene sesión, NO puede volver a entrar con el código: join da
// already_joined por su deviceId. Si el anfitrión lo expulsa para «arreglarlo», su dispositivo queda vetado.
// Uso: node a6-03-abandono-bloquea-revancha.ts. NO ejecutado por el agente 6.
import { activeGame } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';

const g = activeGame({ runners: ['r1', 'r2'] });
g.ok('r2', { type: 'leave' }); // «Abandonar la partida» (la app hace forget() justo después)
console.log('r2 tras abandonar:', g.state.players.r2?.status, 'leftRoom =', g.state.players.r2?.leftRoom);
g.ok('h', { type: 'end_game' });
g.ok('h', { type: 'rematch', swapRoles: false });
console.log('r2 en la revancha:', g.state.players.r2?.status);
// Mismo móvil (deviceId dev-r2), sesión olvidada: entra con el código como un jugador nuevo.
console.log('volver a entrar:', JSON.stringify(g.cmd('r2-nuevo', { type: 'join', name: 'Jug r2', deviceId: 'dev-r2' })));
g.ok('h', { type: 'kick', targetId: 'r2' }); // el anfitrión quita la fila «Invitado» fantasma
console.log('tras expulsar al fantasma:', JSON.stringify(g.cmd('r2-otra', { type: 'join', name: 'Jug r2', deviceId: 'dev-r2' })));
// SI EL FALLO EXISTE imprime:
//   r2 tras abandonar: left leftRoom = false
//   r2 en la revancha: invited
//   volver a entrar: {"ok":false,"error":"already_joined"}
//   tras expulsar al fantasma: {"ok":false,"error":"not_found"}
