// Arranque en frío de un despliegue (Render, plan gratuito): mide la respuesta con el servicio despierto,
// espera sin enviar NADA el tiempo indicado (Render lo duerme tras 15 min sin tráfico) y mide cuánto tarda en
// volver a responder /health, la página y un WebSocket nuevo. Si alguien usa el servicio mientras tanto, la
// segunda medida saldrá «despierto» (se indica).
// Uso: node server/arranque-frio.mjs https://the-outrun.onrender.com [minutos-de-espera=16]
const base = (process.argv[2] ?? '').replace(/\/$/, '');
const waitMin = Number(process.argv[3] ?? 16);
if (!/^https?:\/\//.test(base)) {
  console.log('Uso: node server/arranque-frio.mjs <url> [minutos]');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

async function probe(label) {
  const t0 = performance.now();
  let status = 0;
  let body = '';
  let headers = {};
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(180_000), headers: { 'cache-control': 'no-cache' } });
    status = r.status;
    headers = Object.fromEntries([...r.headers].filter(([k]) => /^(x-render|rndr|content-type|server)/i.test(k)));
    body = (await r.text()).slice(0, 120);
  } catch (e) {
    body = `error: ${e.name}`;
  }
  const healthMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  const page = await fetch(`${base}/`, { signal: AbortSignal.timeout(180_000) }).then((r) => r.status).catch((e) => e.name);
  const pageMs = Math.round(performance.now() - t1);
  // WebSocket nuevo: hasta que se abre y responde a un ping del protocolo.
  const t2 = performance.now();
  const ws = await new Promise((done) => {
    const sock = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
    const timer = setTimeout(() => (sock.close(), done('sin respuesta en 60 s')), 60_000);
    sock.onopen = () => sock.send(JSON.stringify({ t: 'ping', c: Date.now() }));
    sock.onmessage = (ev) => {
      if (JSON.parse(ev.data).t === 'pong') {
        clearTimeout(timer);
        sock.close();
        done(`abierto y responde en ${Math.round(performance.now() - t2)} ms`);
      }
    };
    sock.onerror = () => {
      clearTimeout(timer);
      done('error al abrir');
    };
  });
  const warm = status === 200 && healthMs < 3_000;
  console.log(`${stamp()} ${label}: /health HTTP ${status} en ${healthMs} ms · página ${page} en ${pageMs} ms · WebSocket ${ws} · ${warm ? 'DESPIERTO' : 'ARRANQUE EN FRÍO'}`);
  console.log(`         cuerpo: ${body.replace(/\s+/g, ' ')} · cabeceras: ${JSON.stringify(headers)}`);
  return { status, healthMs, warm };
}

await probe('despierto (referencia)');
await probe('despierto (segunda medida)');
console.log(`${stamp()} Esperando ${waitMin} min sin ningún tráfico desde aquí…`);
await sleep(waitMin * 60_000);
const cold = await probe(`tras ${waitMin} min sin uso`);
await probe('justo después');
console.log(cold.warm
  ? '\nEl servicio seguía despierto: alguien lo usó durante la espera, o Render no lo durmió. Repetir en un momento sin uso.'
  : '\nArranque en frío medido: es el tiempo que espera el primer jugador que abre la URL tras un rato sin uso.');
