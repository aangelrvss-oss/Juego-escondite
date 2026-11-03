// A4-2 · Quien sale durante la cuenta atrás (p. ej. el zorro sorteado) sigue contando como participante
// de la partida siguiente con el mismo gameNo: aparece en el Mission Report (con el equipo del sorteo
// abortado) y se le invita a la revancha.
// NO EJECUTADO por el agente 4. Uso (Node 24, raíz del repo): node <ruta>/repro-a4-2-fantasma-cuenta-atras.mjs
// Resultado esperado HOY (fallo): imprime "FALLO" con dos entradas en el grupo «Zorro».
import assert from 'node:assert/strict';

const R = 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion';
const { Harness, config } = await import(`${R}/engine/test/helpers.ts`);
const { TIMING, MINUTE } = await import(`${R}/engine/src/constants.ts`);
const { snapshotFor } = await import(`${R}/engine/src/view.ts`);
const { reportParticipants } = await import(`${R}/mobile/www/js/game-view.js`);

const g = new Harness();
for (const id of ['f', 'a', 'b']) g.join(id);
g.ok('h', { type: 'assign_team', targetId: 'f', pref: 'runner' });
g.ok('h', { type: 'configure', config: config({ mode: 'fox_hunt' }) });
g.readyAll();
g.ok('h', { type: 'start' });
assert.equal(g.state.players.f.team, 'runner');
// El zorro sale en la cuenta atrás: sin zorro → vuelve a la sala (correcto, §11.3).
g.ok('f', { type: 'leave' });
assert.equal(g.state.phase, 'LOBBY');
console.log('f tras salir:', { status: g.state.players.f.status, team: g.state.players.f.team, leftRoom: g.state.players.f.leftRoom, playedGameNo: g.state.players.f.playedGameNo, gameNo: g.state.gameNo });

// Partida siguiente con h, a, b (sorteo: un zorro entre ellos).
g.readyAll();
g.ok('h', { type: 'start' });
g.advance(TIMING.countdownMs);
g.advance(2 * MINUTE);
g.advance(20 * MINUTE);
assert.equal(g.state.phase, 'FINISHED');

const snap = snapshotFor(g.state, 'h', g.now);
const people = reportParticipants(snap, (id) => id);
const foxes = people.filter((p) => p.team === 'runner');
console.log('Grupo «Zorro» del Mission Report:', foxes.map((p) => `${p.id} (${p.detail})`));
console.log(foxes.length === 1 ? 'OK: un solo zorro en el informe' : 'FALLO: el informe lista a quien salió en la cuenta atrás de un sorteo abortado');

g.ok('h', { type: 'rematch', swapRoles: false });
console.log('f en la revancha:', g.state.players.f.status, '(esperado hoy: invited; correcto: left/fuera)');
