import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GameConnection } from '../../mobile/www/js/net.js';
import { CODE_ALPHABET, CODE_LENGTH } from '../hub.ts';
import { gameConfig, memoryStorage, player, room, settle, testServer, waitFor } from './helpers.mjs';

// Renovación del código de sala (Plan Maestro §2.2: «debe existir una opción para cambiar o invalidar
// el código»; DECISION_LOG D-048). Reglas: solo el anfitrión, solo en la sala de espera (LOBBY); el
// código anterior deja de servir para entrar; quien ya está dentro conserva su sesión.
// Clientes reales (net.js) por WebSocket contra el servidor real en un puerto local; reloj SIMULADO.

let t;
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  for (const c of t?.extra ?? []) c.close();
  await t?.close();
});

const isCode = (c) => typeof c === 'string' && c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
const codeMsgs = (p) => p.raw.filter((m) => m.t === 'code');

/** Un jugador nuevo intenta entrar con `code`. Devuelve el código de la sala o el error. */
async function tryJoin(name, code) {
  const p = player(t, name);
  t.players.push(p);
  await waitFor(() => p.conn.status === 'open', `conexión de ${name}`);
  try {
    return (await p.conn.join(code, name)).code;
  } catch (e) {
    return `error:${e.message}`;
  }
}

/** Lleva la sala hasta el inicio de la partida (anfitrión cazador, el resto fugitivos). */
async function startGame(players) {
  const [host, ...rest] = players;
  await host.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  for (const p of rest) await p.conn.command({ type: 'set_team_pref', pref: 'runner' });
  assert.equal((await host.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
  assert.equal((await host.conn.command({ type: 'start' })).ok, true);
}

describe('renovación del código de sala', () => {
  it('el anfitrión obtiene un código nuevo, todos lo reciben una vez y el anterior deja de servir', async () => {
    t = await testServer();
    const { code: old, players } = await room(t, ['Ana', 'Beto', 'Cris']);
    t.players = players;
    const r = await players[0].conn.command({ type: 'new_code' });
    assert.equal(r.ok, true);
    const fresh = r.data.code;
    assert.ok(isCode(fresh));
    assert.notEqual(fresh, old);
    await waitFor(() => players.every((p) => p.conn.code === fresh), 'todos con el código nuevo');
    for (const p of players) assert.equal(codeMsgs(p).length, 1, `${p.name} recibe el aviso una vez`);
    assert.equal(t.server.hub.roomStateByCode(old), undefined, 'el código anterior ya no apunta a ninguna sala');
    assert.equal(t.server.hub.roomStateByCode(fresh)?.playerOrder.length, 3, 'el nuevo apunta a la misma sala');

    assert.equal(await tryJoin('Dani', old), 'error:not_found', 'el código anterior no sirve');
    assert.equal(await tryJoin('Eva', fresh), fresh, 'el nuevo sí');
    await waitFor(() => players[0].snap?.players.length === 4, 'Eva en la sala');
  });

  it('tras dos renovaciones, ninguno de los códigos anteriores sirve', async () => {
    t = await testServer();
    const { code: c1, players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const c2 = (await players[0].conn.command({ type: 'new_code' })).data.code;
    const c3 = (await players[0].conn.command({ type: 'new_code' })).data.code;
    assert.equal(new Set([c1, c2, c3]).size, 3);
    assert.equal(await tryJoin('Cris', c1), 'error:not_found');
    assert.equal(await tryJoin('Dani', c2), 'error:not_found');
    assert.equal(await tryJoin('Eva', c3), c3);
  });

  it('quien ya está dentro conserva su sesión: al reconectar recibe el código nuevo', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const [host, guest] = players;
    const fresh = (await host.conn.command({ type: 'new_code' })).data.code;
    await waitFor(() => guest.conn.code === fresh, 'aviso al invitado');
    const storage = guest.conn.storage;
    guest.conn.close();
    const again = new GameConnection({ url: t.wsUrl, storage });
    t.extra = [again];
    again.start();
    await waitFor(() => again.status === 'open' && again.snapshot?.phase === 'LOBBY', 'reanudación');
    assert.equal(again.code, fresh, 'la reanudación trae el código vigente');
    assert.equal(again.playerId, guest.id, 'misma sesión');
  });

  it('un jugador que no es el anfitrión no puede renovarlo y el código sigue igual', async () => {
    t = await testServer();
    const { code, players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const [host, guest] = players;
    assert.deepEqual(await guest.conn.command({ type: 'new_code' }), { ok: false, error: 'forbidden' });
    assert.equal(t.server.hub.roomStateByCode(code)?.hostId, host.id, 'el código sigue apuntando a la sala');
    for (const p of players) assert.equal(codeMsgs(p).length, 0, 'nadie recibe un código nuevo');
    assert.equal(await tryJoin('Cris', code), code, 'el código sigue sirviendo');
  });

  it('un comando con campos extra se rechaza sin cambiar el código', async () => {
    t = await testServer();
    const { code, players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const r = await players[0].conn.command({ type: 'new_code', code: 'AAAAAA' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_command');
    assert.ok(t.server.hub.roomStateByCode(code));
    assert.equal(t.server.hub.roomStateByCode('AAAAAA'), undefined, 'no se puede elegir el código');
  });

  it('el mismo comando repetido (mismo id) no renueva dos veces', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const [host, guest] = players;
    const msg = JSON.stringify({ t: 'cmd', id: 'renovar-1', cmd: { type: 'new_code' } });
    host.conn.socket.send(msg);
    host.conn.socket.send(msg);
    await waitFor(() => host.raw.filter((m) => m.t === 'result' && m.id === 'renovar-1').length === 2, 'dos respuestas');
    const [a, b] = host.raw.filter((m) => m.t === 'result' && m.id === 'renovar-1').map((m) => m.result);
    assert.deepEqual(a, b, 'la segunda respuesta es la guardada');
    await settle(50);
    assert.equal(codeMsgs(guest).length, 1, 'un solo cambio de código');
  });

  it('colisiones: el código nuevo nunca coincide con el de otra sala activa ni con el actual', async () => {
    // Generador forzado: sala 1 → AAAAAA, sala 2 → BBBBBB; al renovar la sala 1 salen AAAAAA (su
    // código actual) y BBBBBB (de la sala 2) antes de CCCCCC.
    const seq = ['AAAAAA', 'BBBBBB', 'AAAAAA', 'BBBBBB', 'CCCCCC'];
    t = await testServer({ generateCode: () => seq.shift() ?? 'ZZZZZZ' });
    const one = await room(t, ['Ana', 'Beto']);
    const two = await room(t, ['Cris', 'Dani']);
    t.players = [...one.players, ...two.players];
    assert.deepEqual([one.code, two.code], ['AAAAAA', 'BBBBBB']);
    const r = await one.players[0].conn.command({ type: 'new_code' });
    assert.equal(r.data.code, 'CCCCCC');
    assert.equal(t.server.hub.roomStateByCode('BBBBBB')?.hostId, two.players[0].id, 'la sala 2 conserva su código');
    assert.equal(t.server.hub.roomStateByCode('CCCCCC')?.hostId, one.players[0].id);
    assert.equal(t.server.hub.roomStateByCode('AAAAAA'), undefined);
    assert.equal(codeMsgs(two.players[0]).length, 0, 'la otra sala no recibe nada');
  });

  it('fuera de la sala de espera se rechaza (cuenta atrás, huida, persecución y final); en la revancha vuelve a estar permitido', async () => {
    t = await testServer();
    const { code, players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const [host, guest] = players;
    const expectWrongPhase = async (phase) => {
      await waitFor(() => host.snap?.phase === phase, phase);
      assert.deepEqual(await host.conn.command({ type: 'new_code' }), { ok: false, error: 'wrong_phase' }, phase);
      assert.ok(t.server.hub.roomStateByCode(code), `${phase}: el código no cambia`);
    };
    await startGame(players);
    await expectWrongPhase('COUNTDOWN');
    await t.advance(5_000);
    await expectWrongPhase('HEAD_START');
    await t.advance(2 * 60_000);
    await expectWrongPhase('ACTIVE');
    assert.equal((await host.conn.command({ type: 'end_game' })).ok, true);
    await expectWrongPhase('FINISHED');
    for (const p of players) assert.equal(codeMsgs(p).length, 0);

    assert.equal((await host.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    await waitFor(() => host.snap?.phase === 'LOBBY', 'revancha');
    const r = await host.conn.command({ type: 'new_code' });
    assert.equal(r.ok, true, 'en la sala de espera de la revancha sí se puede');
    await waitFor(() => guest.conn.code === r.data.code, 'aviso al invitado de la revancha');
  });

  it('al cerrar la sala tras renovar, el código vigente también deja de servir', async () => {
    t = await testServer();
    const { players } = await room(t, ['Ana', 'Beto']);
    t.players = players;
    const fresh = (await players[0].conn.command({ type: 'new_code' })).data.code;
    assert.equal((await players[0].conn.command({ type: 'cancel' })).ok, true);
    assert.equal(t.server.hub.roomStateByCode(fresh), undefined);
    assert.equal(await tryJoin('Cris', fresh), 'error:not_found');
  });
});
