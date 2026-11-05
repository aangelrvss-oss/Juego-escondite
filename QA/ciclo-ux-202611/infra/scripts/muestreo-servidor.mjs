// Muestreo de recursos DENTRO del proceso del servidor, sin tocar el código del juego.
// Se carga antes de server/main.ts con:  node --import ./muestreo-servidor.mjs server/main.ts
// Cada MUESTREO_MS (1 s por defecto) añade una línea JSON a MUESTREO_ARCHIVO con:
//   cpuPct  CPU usada en el intervalo (usuario + sistema) como % de UN núcleo (100 = un núcleo entero)
//   rssMB, heapMB  memoria residente y montón de V8
//   eldP50, eldP99, eldMax  retraso del bucle de eventos en ms (saturación del servidor)
// Solo mide; no cambia el comportamiento del servidor.
import { appendFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const file = process.env.MUESTREO_ARCHIVO;
const every = Number(process.env.MUESTREO_MS ?? 1_000);
if (file) {
  const eld = monitorEventLoopDelay({ resolution: 10 });
  eld.enable();
  let prevCpu = process.cpuUsage();
  let prevAt = process.hrtime.bigint();
  const timer = setInterval(() => {
    const cpu = process.cpuUsage(prevCpu);
    const at = process.hrtime.bigint();
    const wallUs = Number(at - prevAt) / 1_000;
    prevCpu = process.cpuUsage();
    prevAt = at;
    const m = process.memoryUsage();
    const line = {
      t: Date.now(),
      cpuPct: Math.round(((cpu.user + cpu.system) / wallUs) * 1_000) / 10,
      rssMB: Math.round(m.rss / 1e5) / 10,
      heapMB: Math.round(m.heapUsed / 1e5) / 10,
      eldP50: Math.round(eld.percentile(50) / 1e4) / 100,
      eldP99: Math.round(eld.percentile(99) / 1e4) / 100,
      eldMax: Math.round(eld.max / 1e4) / 100,
    };
    eld.reset();
    try {
      appendFileSync(file, `${JSON.stringify(line)}\n`);
    } catch {}
  }, every);
  timer.unref();
}
