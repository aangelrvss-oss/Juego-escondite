// Registro de /health para la prueba física: cada 10 s, conexiones y lecturas recibidas por canal
// (WebSocket = la página; HTTP = el servicio nativo de la app, que sigue con la pantalla bloqueada).
// Sin nombres, coordenadas ni secretos: solo contadores.
// Uso (con el servidor ya arrancado): node server/health-watch.mjs [http://127.0.0.1:8787] [segundos]
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const everyS = Number(process.argv[3] ?? 10);
let last = null;
console.log('hora      salas  conexiones  lecturas_ws(+)  lecturas_http(+)');
async function poll() {
  try {
    const h = await (await fetch(`${base}/health`)).json();
    const d = (k) => (last ? `+${h[k] - last[k]}` : '');
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    console.log(`${time}  ${String(h.rooms).padStart(5)}  ${String(h.clients).padStart(10)}  ${`${h.locWs} ${d('locWs')}`.padStart(14)}  ${`${h.locHttp} ${d('locHttp')}`.padStart(16)}`);
    last = h;
  } catch (e) {
    console.log(new Date().toLocaleTimeString('es-ES', { hour12: false }), 'sin respuesta del servidor:', e.message);
  }
}
await poll();
setInterval(poll, everyS * 1_000);
