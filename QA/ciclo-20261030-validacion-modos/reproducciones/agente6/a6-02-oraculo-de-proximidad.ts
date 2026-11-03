// A6-2: «Reclamar captura» funciona como un escáner ilimitado y silencioso. Cada 3 s (límite del servidor,
// RATE.claimMinIntervalMs) un cazador puede pulsar el nombre de cualquier fugitivo (la interfaz lista a
// todos los rivales activos) y la respuesta dice si está cerca (umbral 5 m + precisiones, máx. 40 m), si su
// GPS no es reciente o si da saltos. El fugitivo no recibe nada cuando la reclamación falla.
// Uso: node a6-02-oraculo-de-proximidad.ts. NO ejecutado por el agente 6.
import { activeGame } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/test/helpers.ts';

const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] }); // Clásico: h y h2 cazadores
const before = g.events.length;
const results: string[] = [];
for (let north = 0; north <= 200; north += 40) {
  g.advance(3_000);
  g.at('r1', 200); // fugitivo escondido a 200 m al norte (precisión 8 m)
  g.at('h', north); // el cazador barre la calle
  const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
  results.push(`${north} m -> ${r.ok ? 'RECLAMACIÓN CREADA (está a <= 21 m)' : r.error}`);
  if (r.ok) break;
}
console.log(results.join('\n'));
const tagEventsToR1 = g.events
  .slice(before)
  .filter((e) => e.type === 'tag_claimed' && e.audience.kind === 'players' && e.audience.ids.includes('r1'));
console.log('avisos tag_claimed recibidos por r1:', tagEventsToR1.length, '(solo el del acierto)');
// r2 no tiene GPS reciente: la respuesta lo delata sin que r2 se entere.
g.at('h2', 0);
console.log('sondeo a r2:', JSON.stringify(g.cmd('h2', { type: 'claim_tag', runnerId: 'r2' })));
// SI EL FALLO EXISTE imprime:
//   0 m -> not_close_enough
//   40 m -> not_close_enough   ... 160 m -> not_close_enough
//   200 m -> RECLAMACIÓN CREADA (está a <= 21 m)
//   avisos tag_claimed recibidos por r1: 1 (solo el del acierto)
//   sondeo a r2: {"ok":false,"error":"target_location_stale"}
