// A6-9: un cazador que queda fuera por el periodo de gracia (D-057) y vuelve a conectar recibe, al reanudar,
// las pistas (con coordenadas de los fugitivos) que se emitieron mientras estaba «sin conexión» pero aún
// activo: el buzón de reanudación solo se purga al terminar la partida. Ya no juega, pero ve posiciones.
// Uso: node a6-09-reenvio-de-pistas-al-expulsado.ts. NO ejecutado por el agente 6.
import { Hub } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/hub.ts';

let t = Date.UTC(2026, 9, 30, 18, 0, 0);
const hub = new Hub({ now: () => t });
let n = 0;
function client(ip: string) {
  const out: any[] = [];
  const h = hub.connect({ send: (s: string) => out.push(JSON.parse(s)), close: () => {} }, ip);
  const send = (m: object) => h.receive(JSON.stringify(m));
  return { out, h, send, cmd: (cmd: object) => send({ t: 'cmd', id: `c${++n}`, cmd }), welcome: () => out.find((m) => m.t === 'welcome') };
}
function advance(ms: number, each?: () => void) {
  const end = t + ms;
  while (t < end) {
    t = Math.min(end, t + 5_000);
    each?.();
    hub.pump();
    hub.keepAliveConnected();
  }
}
const center = { lat: 40.4153, lng: -3.6845 };
const A = client('10.0.0.1');
A.send({ t: 'create', name: 'Ana', installId: 'dev-a' });
const code = A.welcome().code;
const B = client('10.0.0.2');
B.send({ t: 'join', code, name: 'Beto', installId: 'dev-b' });
const C = client('10.0.0.3');
C.send({ t: 'join', code, name: 'Caro', installId: 'dev-c' });
A.cmd({ type: 'set_team_pref', pref: 'hunter' });
B.cmd({ type: 'set_team_pref', pref: 'hunter' });
C.cmd({ type: 'set_team_pref', pref: 'runner' });
A.cmd({ type: 'configure', config: { durationMs: 20 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 3 * 60_000, zone: [{ fromOffsetMs: 0, center, radiusM: 400 }], meetingPoint: center, safetyChecklistConfirmed: true } });
for (const p of [A, B, C]) p.cmd({ type: 'set_ready', ready: true });
A.cmd({ type: 'start' });
advance(5_000 + 120_000); // ACTIVE
const lastSeqB = Math.max(...B.out.filter((m) => typeof m.seq === 'number').map((m) => m.seq));
B.h.closed('test'); // Beto pierde la conexión
const cLoc = () => C.send({ t: 'loc', lat: center.lat + 0.001, lng: center.lng, acc: 8, age: 0 });
advance(6 * 60_000, cLoc); // pista a los 3 min (Beto aún activo), fuera a los 5 min
const B2 = client('10.0.0.2');
const wb = B.welcome();
B2.send({ t: 'resume', playerId: wb.playerId, secret: wb.secret, lastSeq: lastSeqB });
const snap = B2.out.filter((m) => m.t === 'snapshot').at(-1)?.snapshot;
const me = snap?.players.find((p: any) => p.id === wb.playerId);
const pings = B2.out.filter((m) => m.t === 'event' && m.type === 'ping');
console.log('Beto:', me?.status, me?.leftReason, '| pistas reenviadas:', pings.length, '| con coordenadas:', pings.some((m) => m.data.ping?.entries?.some((e: any) => e.position)));
// SI EL FALLO EXISTE imprime: Beto: left timeout | pistas reenviadas: 1 | con coordenadas: true
