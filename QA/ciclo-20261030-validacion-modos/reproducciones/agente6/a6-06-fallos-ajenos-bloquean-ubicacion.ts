// A6-6: el contador de fallos por dirección (códigos de sala incorrectos, sesiones no válidas) bloquea
// también las lecturas AUTENTICADAS de POST /api/loc (uploadLocation comprueba tooManyFailures antes de la
// sesión, hub.ts:614). Quien comparta dirección (misma Wi-Fi o CGNAT, o el túnel sin TRUST_PROXY) puede
// dejar sin ubicación con la pantalla bloqueada a todos los jugadores con 20 códigos falsos por minuto, sin
// sesión ni sala. Uso: node a6-06-fallos-ajenos-bloquean-ubicacion.ts. NO ejecutado por el agente 6.
import { Hub } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/server/hub.ts';

let t = Date.UTC(2026, 9, 30, 18, 0, 0);
const hub = new Hub({ now: () => t });
const IP = '203.0.113.7';
const sink = () => {
  const out: any[] = [];
  return { out, transport: { send: (s: string) => out.push(JSON.parse(s)), close: () => {} } };
};

// Un jugador legítimo con sesión válida.
const a = sink();
hub.connect(a.transport, IP).receive(JSON.stringify({ t: 'create', name: 'Ana', installId: 'dev-a' }));
const welcome = a.out.find((m) => m.t === 'welcome');
const reading = { lat: 40.4153, lng: -3.6845, acc: 8, age: 0 };
console.log('antes:', hub.uploadLocation(IP, { playerId: welcome.playerId, secret: welcome.secret, ...reading }));

// Un tercero desde la misma dirección: 20 códigos inventados, en 2 conexiones (10 intentos por conexión).
for (let c = 0; c < 2; c++) {
  const x = sink();
  const h = hub.connect(x.transport, IP);
  for (let i = 0; i < 10; i++) h.receive(JSON.stringify({ t: 'join', code: 'ZZZZZ' + 'ABCDEFGHJK'[i], name: 'x', installId: 'x' }));
}
console.log('después:', hub.uploadLocation(IP, { playerId: welcome.playerId, secret: welcome.secret, ...reading }));
t += 59_000;
console.log('59 s después:', hub.uploadLocation(IP, { playerId: welcome.playerId, secret: welcome.secret, ...reading }));
// SI EL FALLO EXISTE imprime:
//   antes: gone            (sala de espera: 410, el envío funciona)
//   después: rate_limited  (429 para un jugador con sesión válida)
//   59 s después: rate_limited
