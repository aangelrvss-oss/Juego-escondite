// Resume los registros de carga (registros/*.json) en una tabla Markdown (salida estándar).
// Uso: node QA/ciclo-ux-202611/infra/scripts/tabla.mjs > QA/ciclo-ux-202611/infra/registros/tabla-resultados.md
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../registros');
const files = readdirSync(dir).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();
const v = (x) => (x === null || x === undefined ? '—' : x);
console.log('| Escenario | Jug. | CPU media ACTIVE (% 1 núcleo) | CPU máx ACTIVE | RSS máx (MB) | Entrantes msg/s | Salientes msg/s | Salientes kB/s | RTT ping p50/p95/p99 ACTIVE (ms) | claim_tag p50/p95/p99 (ms) | Reconexión: recuperados · todos en (ms) · p50 | Reinicio | Final (ms) | Errores |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const a = j.porFase.activo ?? {};
  const rssMax = Math.max(...Object.values(j.porFase).map((x) => x.rssMaxMB ?? 0));
  const r = j.resumen.reconexionClientes ?? {};
  const re = j.resumen.reinicio;
  const c = j.latenciasComandos.cmd_claim_tag ?? {};
  const errs = Object.entries(j.errores).filter(([k]) => !k.startsWith('cmd_claim_tag_not_close_enough')).map(([k, n]) => `${k}:${n}`).join(', ') || 'ninguno';
  console.log(
    `| ${j.nombre} | ${j.parametros.total} | ${v(a.cpuMediaPct1Nucleo)} | ${v(a.cpuMaxPct1Nucleo)} | ${rssMax} | ${v(a.msgEntrantesPorS)} | ${v(a.msgSalientesPorS)} | ${v(a.kBSalientesPorS)} | ${v(a.rttPing?.p50ms)}/${v(a.rttPing?.p95ms)}/${v(a.rttPing?.p99ms)} | ${v(c.p50ms)}/${v(c.p95ms)}/${v(c.p99ms)} | ${v(r.recuperados)}/${v(r.jugadores)} · ${v(r.msHastaTodos)} · ${v(r.p50ms)} | ${re ? `${re.modo}: ${re.recuperados}/${re.jugadores} recuperados, ${re.sesionPerdida} sesiones perdidas, todos en ${v(re.msHastaTodos)} ms` : '—'} | ${v(j.resumen.finalMsHastaTodos)} (${v(j.resumen.finalVistoPor)}) | ${errs} |`,
  );
}
