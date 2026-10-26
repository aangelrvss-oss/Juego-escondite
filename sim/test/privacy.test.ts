import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TIMING } from '../../engine/src/constants.ts';
import type { RoomState } from '../../engine/src/types.ts';
import { SimClient } from '../client.ts';
import type { SimHost } from '../host.ts';
import { deterministicHost, scenarioConfig } from '../scenario.ts';

// Privacidad de roles y preferencias: se inspecciona TODO lo que el servidor simulado entrega a
// cada cliente (eventos, instantáneas y respuestas), no lo que mostraría una interfaz.

interface Table {
  host: SimHost;
  clients: SimClient[]; // [0] es el anfitrión
  cursor: Map<SimClient, number>;
  replies: { from: SimClient; reply: unknown }[];
}

function table(): Table {
  const host = deterministicHost(7);
  const anfitrion = new SimClient(host, 'Ana', 'dev-a');
  const created = anfitrion.createRoom();
  if (!created.ok) throw new Error('createRoom failed');
  const code = String(created.data?.code);
  const clients = [anfitrion];
  for (const [name, dev] of [['Beto', 'dev-b'], ['Caro', 'dev-c'], ['Dani', 'dev-d'], ['Eva', 'dev-e']]) {
    const c = new SimClient(host, name!, dev!);
    assert.equal(c.join(code).ok, true);
    clients.push(c);
  }
  return { host, clients, cursor: new Map(), replies: [] };
}

function send(t: Table, from: SimClient, cmd: Parameters<SimClient['send']>[0]): void {
  t.replies.push({ from, reply: from.send(cmd) });
}

function startGame(t: Table): void {
  send(t, t.clients[0]!, { type: 'configure', config: scenarioConfig() });
  for (const c of t.clients) if (t.host.stateOf(c.playerId).players[c.playerId]?.status === 'lobby') send(t, c, { type: 'set_ready', ready: true });
  send(t, t.clients[0]!, { type: 'start' });
}

// Fuerza una instantánea completa para cada cliente (como al reconectar sin historial).
function resnapshot(t: Table): void {
  for (const c of t.clients) {
    c.disconnect();
    c.lastSeq = 0;
    c.connect();
  }
}

const state = (t: Table): RoomState => t.host.stateOf(t.clients[0]!.playerId);

/**
 * Comprueba los mensajes nuevos de cada cliente contra el estado interno (el oráculo):
 * - una preferencia solo puede llegar a quien la fijó (teamPrefSetBy);
 * - un equipo solo puede llegar a su dueño o a sus compañeros, y nunca durante la cuenta atrás;
 * - ningún otro evento puede contener campos `team` o `teamPref`.
 */
function assertNoLeaks(t: Table): void {
  const s = state(t);
  for (const c of t.clients) {
    const me = c.playerId;
    const myTeam = s.players[me]?.team ?? null;
    const sameTeam = (id: string) => myTeam !== null && s.players[id]?.team === myTeam;
    const from = t.cursor.get(c) ?? 0;
    for (const msg of c.received.slice(from)) {
      if (msg.kind === 'snapshot') {
        for (const p of msg.snapshot.players) {
          if (p.teamPref !== null) assert.equal(s.players[p.id]?.teamPrefSetBy, me, `${c.name} ve la preferencia de ${p.name}`);
          if (p.team !== null) {
            assert.notEqual(msg.snapshot.phase, 'COUNTDOWN', `${c.name} ve un equipo durante la cuenta atrás`);
            assert.ok(p.id === me || sameTeam(p.id), `${c.name} ve el equipo de ${p.name}, que no es compañero`);
          }
        }
      } else if (msg.kind === 'event') {
        if (msg.type === 'role_revealed') {
          assert.deepEqual(msg.data, { team: myTeam }, `${c.name} recibe un rol que no es el suyo`);
        } else if (msg.type === 'player_updated' && 'teamPref' in msg.data) {
          assert.equal(s.players[String(msg.data.playerId)]?.teamPrefSetBy, me, `${c.name} recibe una preferencia ajena`);
        } else {
          const json = JSON.stringify(msg.data);
          assert.ok(!/"team(Pref)?"/.test(json), `${c.name} recibe ${msg.type} con datos de equipo: ${json}`);
        }
      }
    }
    t.cursor.set(c, c.received.length);
  }
  // Las respuestas a los comandos nunca llevan equipos ni preferencias.
  for (const { from, reply } of t.replies) {
    assert.ok(!/"team(Pref)?"/.test(JSON.stringify(reply)), `respuesta a ${from.name} con datos de equipo`);
  }
}

describe('privacidad de roles y preferencias (transmitido por destinatario)', () => {
  it('asignación automática con preferencias distintas: cada uno solo ve la suya y su rol al terminar la cuenta atrás', () => {
    const t = table();
    const [, beto, caro] = t.clients;
    send(t, beto!, { type: 'set_team_pref', pref: 'hunter' });
    send(t, caro!, { type: 'set_team_pref', pref: 'runner' });
    assertNoLeaks(t);
    // Beto sí recibe su propia preferencia.
    assert.ok(beto!.received.some((m) => m.kind === 'event' && m.type === 'player_updated' && m.data.teamPref === 'hunter'));

    startGame(t);
    assert.equal(state(t).phase, 'COUNTDOWN');
    resnapshot(t);
    assertNoLeaks(t);
    for (const c of t.clients) {
      const snap = c.snapshot!;
      assert.ok(snap.players.every((p) => p.team === null), `${c.name} no ve ningún equipo en la cuenta atrás`);
      assert.ok(!c.received.some((m) => m.kind === 'event' && m.type === 'role_revealed'));
    }

    t.host.advance(TIMING.countdownMs);
    assert.equal(state(t).phase, 'HEAD_START');
    for (const c of t.clients) {
      const reveals = c.received.filter((m) => m.kind === 'event' && m.type === 'role_revealed');
      assert.equal(reveals.length, 1, `${c.name} recibe exactamente una revelación`);
    }
    resnapshot(t);
    assertNoLeaks(t);
    // Tras la revelación: el propio equipo sí; los del otro equipo, nunca.
    const s = state(t);
    for (const c of t.clients) {
      const own = c.snapshot!.players.find((p) => p.id === c.playerId);
      assert.equal(own?.team, s.players[c.playerId]?.team);
      const rivals = c.snapshot!.players.filter((p) => s.players[p.id]?.team !== own?.team);
      assert.ok(rivals.length > 0 && rivals.every((p) => p.team === null));
    }
  });

  it('asignación manual: solo el anfitrión ve lo que asigna; los asignados lo descubren al terminar la cuenta atrás', () => {
    const t = table();
    const [ana, beto, caro, dani, eva] = t.clients;
    send(t, ana!, { type: 'assign_team', targetId: ana!.playerId, pref: 'hunter' });
    send(t, ana!, { type: 'assign_team', targetId: beto!.playerId, pref: 'hunter' });
    for (const c of [caro, dani, eva]) send(t, ana!, { type: 'assign_team', targetId: c!.playerId, pref: 'runner' });
    assertNoLeaks(t);
    resnapshot(t);
    assertNoLeaks(t);
    const hostView = ana!.snapshot!.players.map((p) => p.teamPref);
    assert.deepEqual(hostView, ['hunter', 'hunter', 'runner', 'runner', 'runner'], 'el anfitrión consulta sus asignaciones');
    for (const c of [beto, caro, dani, eva]) {
      assert.ok(c!.snapshot!.players.every((p) => p.teamPref === null), `${c!.name} no ve ninguna asignación, ni la suya`);
    }

    startGame(t);
    resnapshot(t);
    assertNoLeaks(t);
    assert.ok(ana!.snapshot!.players.every((p) => p.team === null), 'tampoco el anfitrión ve equipos en la cuenta atrás');
    t.host.advance(TIMING.countdownMs);
    assertNoLeaks(t);
    const revealed = (c: SimClient) => {
      const m = c.received.find((x) => x.kind === 'event' && x.type === 'role_revealed');
      return m?.kind === 'event' ? m.data.team : undefined;
    };
    assert.equal(revealed(beto!), 'hunter');
    assert.equal(revealed(caro!), 'runner');
  });

  it('un anfitrión nuevo no hereda la vista de las asignaciones del anterior', () => {
    const t = table();
    const [ana, beto, caro] = t.clients;
    send(t, ana!, { type: 'assign_team', targetId: caro!.playerId, pref: 'hunter' });
    send(t, ana!, { type: 'leave' });
    assert.equal(state(t).hostId, beto!.playerId);
    t.clients.shift(); // Ana ya no está en la sala
    resnapshot(t);
    assertNoLeaks(t);
    assert.equal(beto!.snapshot!.players.find((p) => p.id === caro!.playerId)?.teamPref, null);
  });

  it('revancha (con intercambio de roles): nadie ve el arrastre de equipos, tampoco el anfitrión', () => {
    const t = table();
    const [ana, beto] = t.clients;
    send(t, ana!, { type: 'assign_team', targetId: ana!.playerId, pref: 'hunter' });
    send(t, ana!, { type: 'assign_team', targetId: beto!.playerId, pref: 'hunter' });
    startGame(t);
    t.host.advance(TIMING.countdownMs);
    assertNoLeaks(t); // antes de la revancha, que reinicia equipos y preferencias del oráculo
    send(t, ana!, { type: 'end_game' });
    send(t, ana!, { type: 'rematch', swapRoles: true });
    for (const c of t.clients.slice(1)) send(t, c, { type: 'join_rematch' });
    assert.equal(state(t).phase, 'LOBBY');
    resnapshot(t);
    assertNoLeaks(t);
    for (const c of t.clients) {
      assert.ok(c.snapshot!.players.every((p) => p.teamPref === null && p.team === null), `${c.name} no ve el arrastre`);
    }
    startGame(t);
    resnapshot(t);
    assertNoLeaks(t);
    t.host.advance(TIMING.countdownMs);
    assertNoLeaks(t);
    assert.equal(state(t).players[ana!.playerId]?.team, 'runner', 'el intercambio se aplica internamente');
  });
});
