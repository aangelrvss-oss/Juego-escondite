// Fuente de ubicación para la partida, con el mismo resultado en todas las plataformas:
//   { lat, lng, accuracyM, ageMs, at, isMock }   (at = performance.now() al recibirla)
// - Android (app): módulo nativo OutrunLocation de H1 (servicio en primer plano; sigue con la
//   pantalla bloqueada). En partida, el propio servicio envía además las lecturas al servidor por
//   HTTPS, porque con la pantalla bloqueada la página puede quedarse dormida. Contrato:
//   contract/location-bridge.json.
// - Navegador (Android o iPhone): navigator.geolocation (solo con la página en primer plano).
// - iOS (app, futuro): un plugin Swift con el mismo contrato entra por la rama nativa sin cambios.
// La antigüedad se mide con el reloj del propio dispositivo (monótono en nativo) y nunca se compara
// con la hora de pared de otro dispositivo: el servidor la convierte a su propia hora.
import { createLocationBridge, nativePlugin } from './location-bridge.js';

// Solo dentro de la app (Capacitor inyecta su puente antes de la página) se carga el módulo nativo;
// en un navegador ni se intenta, así la web no depende de www/vendor.
const inNativeApp = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());

export async function createLocationSource({ geolocation = globalThis.navigator?.geolocation, loadNative = inNativeApp() ? nativePlugin : null, nativeOptions } = {}) {
  let native = null;
  try {
    if (loadNative) ({ plugin: native } = await loadNative());
  } catch {
    native = null; // sin runtime de Capacitor: se usa la geolocalización web
  }
  if (native) return nativeSource(createLocationBridge(native), nativeOptions);
  if (geolocation) return webSource(geolocation);
  return { kind: 'none', async start() { throw new Error('unavailable'); }, async stop() {} };
}

function nativeSource(bridge, { pollMs = 100, stopTimeoutMs = 3_000 } = {}) {
  // Un solo receptor nativo para toda la vida de la página; las lecturas van al `handler` del último
  // start(). (Antes se quedaba con el del primer start: si el anfitrión centraba la zona, en la partida
  // sus lecturas iban a la función de «centrar» y nunca se enviaban.)
  let handler = null;
  let subscription = null;
  let statusSubscription = null;
  let status = null; // último estado nativo (llega cada 5 s): dice si el envío nativo funciona
  let running = false;
  // Las operaciones con el módulo nativo van en fila: un start no se cruza con un stop pendiente.
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };
  const waitStopped = async () => {
    const end = performance.now() + stopTimeoutMs;
    let st = await bridge.status();
    while (st.running && performance.now() < end) {
      await new Promise((r) => setTimeout(r, pollMs));
      st = await bridge.status();
    }
    return st;
  };
  return {
    kind: 'native',
    /** true si el servicio nativo está enviando al servidor sin errores (la página puede no enviar). */
    get uploading() {
      return Boolean(running && status?.running && status.uploading && status.uploadError === null);
    },
    /**
     * `upload` ({ url, playerId, secret }) activa el envío nativo al servidor, que sigue con la
     * pantalla bloqueada. Sin él, el servicio solo entrega lecturas a la pantalla.
     */
    start(onReading, _onError, { upload = null } = {}) {
      handler = onReading;
      return serial(async () => {
        const perms = await bridge.requestPermissions();
        if (perms.location !== 'precise' && perms.location !== 'approximate') throw new Error('permission_missing');
        if (!subscription) {
          subscription = await bridge.onReading((r) =>
            handler?.({ lat: r.lat, lng: r.lng, accuracyM: r.accuracyM ?? 9_999, ageMs: r.ageMs, at: performance.now(), isMock: r.isMock }),
          );
        }
        statusSubscription ??= await bridge.onStatus((st) => (status = st));
        let current = await bridge.status();
        // Para enviar hace falta una sesión iniciada con este destino: si había otra (p. ej., la de
        // centrar la zona, o una anterior a recargar la página), se cierra y se abre de nuevo.
        if (current.running && upload) {
          await bridge.stop();
          current = await waitStopped();
          if (current.running) throw new Error('still_running');
        }
        if (!current.running) current = await bridge.start(5_000, upload);
        status = current;
        running = true;
      });
    },
    stop() {
      return serial(async () => {
        if (running) await bridge.stop().catch(() => {});
        running = false;
      });
    },
  };
}

function webSource(geolocation) {
  let watch = null;
  return {
    kind: 'web',
    start(onReading, onError = () => {}) {
      if (watch !== null) geolocation.clearWatch(watch); // nunca dos seguimientos a la vez
      return new Promise((resolve, reject) => {
        let first = true;
        watch = geolocation.watchPosition(
          (pos) => {
            onReading({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
              ageMs: Math.max(0, Date.now() - pos.timestamp), // mismo reloj del dispositivo
              at: performance.now(),
            });
            if (first) resolve((first = false));
          },
          (err) => {
            const code = err.code === 1 ? 'permission_missing' : 'position_unavailable';
            if (first) reject(new Error(code));
            else onError(code);
          },
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
        );
      });
    },
    async stop() {
      if (watch !== null) geolocation.clearWatch(watch);
      watch = null;
    },
  };
}
