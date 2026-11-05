// QA · servidor LOCAL con el reloj del servidor acelerado (solo para probar «tiempo agotado» sin esperar 12 min).
// No toca el código de producto: usa startServer de server/main.ts con la opción hub.now (inyección de reloj
// que el propio servidor ofrece). Uso: node QA/ciclo-ux-202611/qa/servidor-acelerado.mjs 8832 40
import { startServer } from '../../../server/main.ts';

const port = Number(process.argv[2] ?? 8832);
const factor = Number(process.argv[3] ?? 40);
const t0 = Date.now();
const now = () => t0 + (Date.now() - t0) * factor;
const running = await startServer({ port, host: '127.0.0.1', hub: { now, maxRoomsPerIp: 50 } });
console.log(`servidor acelerado x${factor} en ${running.url}`);
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => void running.close().then(() => process.exit(0)));
