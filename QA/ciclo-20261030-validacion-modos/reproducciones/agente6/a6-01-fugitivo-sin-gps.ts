// A6-1: un fugitivo que deja de enviar ubicación (permiso retirado / GPS apagado) pero mantiene la app
// abierta (sus pings por WebSocket son "señal de vida", D-057) sigue en la partida, no queda "sin conexión",
// no se le puede capturar por reclamación aunque el cazador esté encima, no se le detecta fuera de la zona
// y gana por tiempo. Uso: node a6-01-fugitivo-sin-gps.ts (Node 24). NO ejecutado por el agente 6.
import { activeGame } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';
import { snapshotFor } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';

const MIN = 60_000;
const g = activeGame({ runners: ['r1'] }); // h cazador, r1 fugitivo; ya en ACTIVE
// r1 da UNA lectura al empezar y apaga el GPS; la app sigue viva (advance() envía 'seen' cada 20 s).
g.at('r1', 0);
g.advance(30_000);
// El cazador está físicamente junto a él (misma posición que la última lectura de r1) y reclama.
g.at('h', 2);
console.log('reclamación:', JSON.stringify(g.cmd('h', { type: 'claim_tag', runnerId: 'r1' })));
// r1 sale de la zona (5 km) sin GPS: el motor no lo sabe.
g.advance(10 * MIN);
console.log('r1 away:', g.state.players.r1?.away, 'expuesto:', g.state.players.r1?.exposed, 'status:', g.state.players.r1?.status);
console.log('pista: disponibilidad de r1 =', g.state.lastPing?.entries.find((e) => e.runnerId === 'r1')?.availability);
g.advance(15 * MIN);
console.log('resultado:', JSON.stringify(g.state.outcome), 'fase:', g.state.phase);
console.log('equipo de r1 visto por h al final:', snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'r1')?.team);
// SI EL FALLO EXISTE imprime:
//   reclamación: {"ok":false,"error":"target_location_stale"}
//   r1 away: false expuesto: false status: active
//   pista: disponibilidad de r1 = UNAVAILABLE
//   resultado: {"winner":"runner","cause":"time_up"} fase: FINISHED
