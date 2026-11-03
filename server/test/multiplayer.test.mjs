import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Partidas completas con cinco clientes reales por WebSocket contra el servidor real.
// SIMULADO: el paso del tiempo (reloj controlado) y las lecturas de ubicación. No son móviles.

let t;
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  await t?.close();
});

/**
 * Revisa TODO lo recibido por cada cliente (texto crudo del WebSocket) contra el estado interno:
 * ningún equipo ajeno salvo compañeros, ninguna preferencia ajena, ninguna posición de rivales.
 */
function assertNoLeaks(players, state) {
  for (const p of players) {
    const me = p.id;
    const myTeam = state.players[me]?.team ?? null;
    const mate = (id) => myTeam !== null && state.players[id]?.team === myTeam;
    for (const msg of p.raw) {
      if (msg.t === 'snapshot') {
        for (const v of msg.snapshot.players) {
          if (v.teamPref !== null) assert.equal(state.players[v.id]?.teamPrefSetBy, me, `${p.name} ve una preferencia ajena`);
          if (v.team !== null) {
            assert.notEqual(msg.snapshot.phase, 'COUNTDOWN', `${p.name} ve un equipo en la cuenta atrás`);
            // Al terminar, todos ven el equipo de todos (decisión del 29/10/2026); antes, nunca el de un rival.
            if (msg.snapshot.phase !== 'FINISHED') assert.ok(v.id === me || mate(v.id), `${p.name} ve el equipo de un rival`);
          }
        }
      } else if (msg.t === 'event') {
        if (msg.type === 'role_revealed') assert.deepEqual(msg.data, { team: myTeam });
        else if (!(msg.type === 'player_updated' && msg.data.playerId === me)) {
          assert.doesNotMatch(JSON.stringify(msg.data), /"team(Pref)?"/, `${p.name}: ${msg.type}`);
        }
      } else if (msg.t === 'positions') {
        for (const pos of msg.positions) {
          if (pos.reason === 'spectator_delayed') continue; // capturados: todos con 60 s de retraso (§6.4)
          const rival = !mate(pos.playerId);
          if (rival) assert.equal(pos.reason, 'exposed', `${p.name} recibe la posición de un rival no expuesto`);
        }
      } else if (msg.t === 'welcome') {
        if (msg.secret) assert.equal(msg.playerId, me, 'el secreto solo llega a su dueño');
      }
    }
  }
}

describe('partida completa con cinco jugadores reales por WebSocket', () => {
  it('sala → cuenta atrás → roles privados → huida → persecución → capturas validadas → reconexión → final → revancha', async () => {
    t = await testServer();
    const { code, players } = await room(t, ['Ana', 'Beto', 'Caro', 'Dani', 'Eva']);
    t.players = players;
    const [ana] = players;
    assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
    const state = () => t.server.hub.roomStateByCode(code);

    // Sala de espera: todos ven a los cinco, conectados.
    for (const p of players) assert.ok(p.snap.players.every((v) => v.connected));
    assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await waitFor(() => players.every((p) => p.snap.phase === 'COUNTDOWN'), 'cuenta atrás en todos');
    // La cuenta atrás termina a la misma hora del servidor para todos.
    assert.equal(new Set(players.map((p) => p.snap.countdownEnd)).size, 1);
    assertNoLeaks(players, state());

    await t.advance(5_000);
    await waitFor(() => players.every((p) => p.eventsOf('role_revealed').length === 1), 'revelación individual');
    await waitFor(() => players.every((p) => p.snap.phase === 'HEAD_START'), 'huida en todos');
    const team = (p) => state().players[p.id].team;
    for (const p of players) assert.equal(p.eventsOf('role_revealed')[0].data.team, team(p));
    const hunters = players.filter((p) => team(p) === 'hunter');
    const runners = players.filter((p) => team(p) === 'runner');
    assert.ok(hunters.length >= 1 && runners.length >= 3, `reparto ${hunters.length}/${runners.length}`);

    // Huida: 2 min mínimos, controlados por el servidor.
    assert.equal(players[0].snap.headStartEnd - players[0].snap.countdownEnd, 2 * 60_000);
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'ACTIVE'), 'persecución en todos');
    assert.equal(new Set(players.map((p) => p.snap.gameEnd)).size, 1);

    // Ubicaciones: cazador en el centro, un fugitivo a 6 m, otro con lectura antigua, otro impreciso.
    const [h] = hunters;
    const [r1, r2, r3] = runners;
    h.at(0);
    r1.at(6);
    r2.at(5, { age: 60_000 });
    r3.at(4, { acc: 80 });
    await settle();
    const claim = (target) => h.conn.command({ type: 'claim_tag', runnerId: target.id });
    assert.equal((await claim(r2)).error, 'target_location_stale', 'nunca se valida con una lectura antigua');
    await t.advance(3_000);
    h.at(0);
    assert.equal((await claim(r3)).error, 'accuracy_too_low');
    assert.equal((await claim(r1)).error, 'rate_limited', 'reclamaciones a ráfagas: limitadas');
    await t.advance(3_000);
    h.at(0);
    r1.at(6);
    await settle();
    const ok = await claim(r1);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    await waitFor(() => r1.eventsOf('tag_claimed').length === 1, 'aviso de reclamación al fugitivo');
    // El cliente no decide la captura: solo el fugitivo confirma, y lo valida el servidor.
    assert.equal((await h.conn.command({ type: 'respond_tag', claimId: ok.data.claimId, accept: true })).error, 'claim_not_found');
    assert.equal((await r1.conn.command({ type: 'respond_tag', claimId: ok.data.claimId, accept: true })).ok, true);
    await waitFor(() => players.every((p) => p.snap.captures.length === 1), 'captura vista por todos');

    // Desconexión inesperada de un fugitivo y reconexión automática con recuperación del estado.
    const lastSeqBefore = r2.conn.lastSeq;
    r2.conn.socket.close();
    await waitFor(() => ana.snap.players.find((v) => v.id === r2.id)?.connected === false, 'los demás ven la desconexión');
    await t.advance(3 * 60_000); // pista a los cazadores y evento ping_sent a los fugitivos mientras está fuera
    // La reconexión se confirma con un dato nuevo del servidor (los demás lo ven conectado otra vez), no
    // con la instantánea antigua de r2, que ya decía «conectado» antes del corte.
    await waitFor(() => r2.conn.status === 'open' && ana.snap.players.find((v) => v.id === r2.id)?.connected === true, 'reconexión', 6_000);
    const trace = () => r2.raw.slice(-14).map((m) => `${m.t}${m.seq !== undefined ? `#${m.seq}` : ''}${m.type ? `:${m.type}` : ''}`).join(' ');
    await waitFor(() => r2.eventsOf('ping_sent').length >= 1, `recupera el evento perdido durante el corte · ${trace()}`, 2_000).catch((e) => {
      throw new Error(`${e.message} · ${trace()} · lastSeq=${r2.conn.lastSeq}`);
    });
    assert.ok(r2.conn.lastSeq > lastSeqBefore);
    assert.equal(r2.snap.phase, 'ACTIVE');
    assert.equal(r2.snap.gameEnd, ana.snap.gameEnd, 'misma hora de final tras reconectar');
    assert.ok(hunters.every((x) => x.eventsOf('ping').length >= 1), 'los cazadores reciben la pista');
    assertNoLeaks(players, state());

    // Final y revancha.
    assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap.phase === 'FINISHED'), 'final en todos');
    assertNoLeaks(players, state());
    // Al terminar, todos ven el equipo real de todos, y la misma lista.
    const finalTeams = (p) => JSON.stringify(p.snap.players.map((v) => [v.id, v.team]));
    for (const p of players) {
      for (const v of p.snap.players) assert.equal(v.team, state().players[v.id].team, `${p.name} ve el equipo de ${v.name} al final`);
    }
    assert.equal(new Set(players.map(finalTeams)).size, 1, 'los equipos del final son iguales para todos');
    assert.equal((await ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    for (const p of players.slice(1)) assert.equal((await p.conn.command({ type: 'join_rematch' })).ok, true);
    await waitFor(() => players.every((p) => p.snap.phase === 'LOBBY' && p.snap.gameNo === 2), 'revancha en la sala');
    assert.ok(players.every((p) => p.snap.players.every((v) => v.team === null && v.teamPref === null)), 'la revancha no revela el arrastre');
  });

  it('un cliente con el reloj desfasado una hora juega igual: la antigüedad la mide el servidor', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const skewed = players[1];
    skewed.conn.now = () => Date.now() + 3_600_000; // reloj de pared del móvil mal
    const [ana, beto] = players;
    await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
    await beto.conn.command({ type: 'set_team_pref', pref: 'runner' });
    await ana.conn.command({ type: 'configure', config: gameConfig() });
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    await ana.conn.command({ type: 'start' });
    await waitFor(() => beto.snap?.phase === 'COUNTDOWN', 'cuenta atrás');
    await t.advance(5_000 + 2 * 60_000);
    await waitFor(() => ana.snap.phase === 'ACTIVE', 'persecución');
    ana.at(0);
    beto.at(6);
    await settle();
    assert.equal((await ana.conn.command({ type: 'claim_tag', runnerId: beto.id })).ok, true, 'la lectura del reloj desfasado cuenta como actual');
  });
});
