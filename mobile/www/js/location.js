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

export async function createLocationSource({ geolocation = globalThis.navigator?.geolocation, loadNative = inNativeApp() ? nativePlugin : null, nativeOptions, webOptions } = {}) {
  let native = null;
  try {
    if (loadNative) ({ plugin: native } = await loadNative());
  } catch {
    native = null; // sin runtime de Capacitor: se usa la geolocalización web
  }
  if (native) return nativeSource(createLocationBridge(native), nativeOptions);
  if (geolocation) return webSource(geolocation, webOptions);
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

// Con el móvil quieto (un fugitivo escondido), muchos navegadores apenas entregan lecturas nuevas por
// watchPosition, sobre todo en iPhone. Su posición caducaría para el servidor (> 15 s) y nadie podría
// reclamar su captura. Si pasan `refreshAfterMs` sin lectura, se pide una nueva con getCurrentPosition.
// Una petición sin respuesta pasado su plazo (más un margen) se da por perdida: hay navegadores que no
// llaman a ninguna función de getCurrentPosition aunque tenga timeout (p. ej., con la página en segundo
// plano), y entonces el refresco se quedaba bloqueado para siempre y la posición dejaba de renovarse.
function webSource(geolocation, { refreshAfterMs = 8_000, checkMs = 2_000, requestTimeoutMs = 10_000 } = {}) {
  let watch = null;
  let refresh = null;
  const stopRefresh = () => {
    if (refresh !== null) clearInterval(refresh);
    refresh = null;
  };
  return {
    kind: 'web',
    start(onReading, onError = () => {}) {
      if (watch !== null) geolocation.clearWatch(watch); // nunca dos seguimientos a la vez
      stopRefresh();
      let lastAt = performance.now();
      let lastTimestamp = Number.NEGATIVE_INFINITY; // hora de medida (reloj del móvil) de la última lectura entregada
      let seq = 0;
      let current = 0; // id de la petición en curso (0 = ninguna)
      let askedAt = 0;
      let abandoned = 0; // peticiones dadas por perdidas que aún podrían responder
      const MAX_ABANDONED = 2; // nunca se acumulan peticiones colgadas sin límite
      const emit = (pos) => {
        // Nunca una lectura más vieja que la última entregada: la posición no retrocede y lo ya superado
        // no se vuelve a enviar (p. ej., la respuesta tardía de una petición dada por perdida).
        if (pos.timestamp <= lastTimestamp) return;
        lastTimestamp = pos.timestamp;
        lastAt = performance.now();
        onReading({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          ageMs: Math.max(0, Date.now() - pos.timestamp), // mismo reloj del dispositivo
          at: lastAt,
        });
      };
      refresh = setInterval(() => {
        const now = performance.now();
        if (current && now - askedAt > requestTimeoutMs + checkMs) {
          current = 0; // perdida: se puede pedir otra (si responde tarde, su lectura sigue valiendo)
          abandoned++;
        }
        if (current || abandoned >= MAX_ABANDONED || now - lastAt < refreshAfterMs || !geolocation.getCurrentPosition) return;
        const id = ++seq;
        current = id;
        askedAt = now;
        // Solo la petición en curso desbloquea el refresco; una abandonada que responde deja de contar.
        const settle = () => {
          if (current === id) current = 0;
          else abandoned = Math.max(0, abandoned - 1);
        };
        geolocation.getCurrentPosition(
          (pos) => (settle(), watch !== null && emit(pos)),
          () => settle(), // los fallos de permiso los avisa el seguimiento
          { enableHighAccuracy: true, maximumAge: 0, timeout: requestTimeoutMs },
        );
      }, checkMs);
      return new Promise((resolve, reject) => {
        let first = true;
        watch = geolocation.watchPosition(
          (pos) => {
            emit(pos);
            if (first) resolve((first = false));
          },
          (err) => {
            const code = err.code === 1 ? 'permission_missing' : 'position_unavailable';
            if (first) {
              stopRefresh();
              reject(new Error(code));
            } else onError(code);
          },
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
        );
      });
    },
    async stop() {
      if (watch !== null) geolocation.clearWatch(watch);
      watch = null;
      stopRefresh();
    },
  };
}
