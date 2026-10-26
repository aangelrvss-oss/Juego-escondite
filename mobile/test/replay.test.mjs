import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STALE_EVENT_MS, isStaleEvent } from '../www/js/game-view.js';
import { GameConnection } from '../www/js/net.js';

// Al reanudar (reconexión o página recargada), el servidor repite los eventos perdidos y después manda
// la instantánea. El cliente los entrega tras la instantánea con su antigüedad según la hora del
// servidor, y la interfaz no vuelve a anunciar lo que pasó hace rato.

function fakeServer() {
  const sockets = [];
  class FakeSocket {
    constructor() {
      this.readyState = 1;
      this.sent = [];
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(text) {
      this.sent.push(JSON.parse(text));
    }
    close() {
      this.readyState = 3;
    }
    push(msg) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
  }
  return { sockets, FakeSocket };
}

function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

const snapshot = (serverNow, extra = {}) => ({ serverNow, phase: 'ACTIVE', players: [], pendingClaimForMe: null, lastPing: null, ...extra });
const SESSION = JSON.stringify({ playerId: 'p1', secret: 's', code: 'ABCDEF' });

test('reanudar: los eventos repetidos llegan después de la instantánea, en orden y con su antigüedad', async (t) => {
  const { sockets, FakeSocket } = fakeServer();
  const conn = new GameConnection({ url: 'ws://x/ws', WebSocketImpl: FakeSocket, storage: memory({ 'outrun.session': SESSION }) });
  const seen = [];
  conn.on('snapshot', () => seen.push('snapshot'));
  conn.on('event', (e) => seen.push(`${e.type}@${e.ageMs}`));
  conn.start();
  t.after(() => conn.close());
  await new Promise((r) => setTimeout(r, 5));
  const ws = sockets[0];
  const resume = ws.sent.find((m) => m.t === 'resume');
  assert.ok(resume, 'la página recargada reanuda con la sesión guardada');
  assert.equal(resume.lastSeq, 0);
  ws.push({ t: 'welcome', playerId: 'p1', code: 'ABCDEF' });
  ws.push({ t: 'event', seq: 1, type: 'role_revealed', at: 1_000, data: { team: 'hunter' } });
  ws.push({ t: 'event', seq: 2, type: 'hunt_started', at: 121_000, data: {} });
  assert.deepEqual(seen, [], 'nada se entrega antes de la instantánea');
  ws.push({ t: 'snapshot', seq: 2, snapshot: snapshot(400_000) });
  assert.deepEqual(seen, ['snapshot', 'role_revealed@399000', 'hunt_started@279000']);
  // A partir de aquí, los eventos en vivo llegan al momento.
  ws.push({ t: 'event', seq: 3, type: 'ping', at: 401_000, data: {} });
  assert.deepEqual(seen.at(-1), 'ping@0');
  assert.equal(conn.lastSeq, 3);
});

test('crear o unirse no retiene nada: los eventos se entregan en vivo', async (t) => {
  const { sockets, FakeSocket } = fakeServer();
  const conn = new GameConnection({ url: 'ws://x/ws', WebSocketImpl: FakeSocket, storage: memory() });
  const seen = [];
  conn.on('event', (e) => seen.push(`${e.type}@${e.ageMs}`));
  conn.start();
  t.after(() => conn.close());
  await new Promise((r) => setTimeout(r, 5));
  const joined = conn.join('ABCDEF', 'Ana');
  sockets[0].push({ t: 'welcome', playerId: 'p1', code: 'ABCDEF', secret: 'nuevo' });
  await joined;
  sockets[0].push({ t: 'event', seq: 1, type: 'player_joined', at: 5, data: { name: 'Ana' } });
  assert.deepEqual(seen, ['player_joined@0']);
});

test('isStaleEvent: lo antiguo no se anuncia, salvo lo que sigue vigente', () => {
  const old = STALE_EVENT_MS + 1;
  assert.equal(isStaleEvent({ type: 'hunt_started', ageMs: 0 }), false, 'en vivo');
  assert.equal(isStaleEvent({ type: 'hunt_started', ageMs: STALE_EVENT_MS }), false, 'reciente');
  assert.equal(isStaleEvent({ type: 'hunt_started', ageMs: old }), true);
  assert.equal(isStaleEvent({ type: 'ping', ageMs: old }), true);
  assert.equal(isStaleEvent({ type: 'player_joined' }), false, 'sin antigüedad (cliente antiguo): se anuncia como antes');
  // La reclamación aún pendiente se anuncia aunque llegue tarde; una ya cerrada, no.
  const claim = { type: 'tag_claimed', ageMs: 20_000, data: { claimId: 'c1' } };
  assert.equal(isStaleEvent(claim, snapshot(0, { pendingClaimForMe: { claimId: 'c1' } })), false);
  assert.equal(isStaleEvent(claim, snapshot(0)), true);
  // La revelación del rol se muestra si aún dura la huida.
  const reveal = { type: 'role_revealed', ageMs: 60_000, data: { team: 'runner' } };
  assert.equal(isStaleEvent(reveal, snapshot(0, { phase: 'HEAD_START' })), false);
  assert.equal(isStaleEvent(reveal, snapshot(0, { phase: 'ACTIVE' })), true);
});
