// Mapa real de la partida: MapLibre GL JS (www/vendor/maplibre-gl, BSD-3-Clause) con la cartografía de
// un proveedor configurado en www/mapa.config.json (p. ej. MapTiler; ver mobile/MAPA.md).
//
// Ciclo de vida: el mapa se crea UNA vez al entrar en la huida o la persecución, vive en un contenedor
// que el redibujado de la interfaz no toca (#map-host) y solo se actualizan sus capas y marcadores. Nunca
// mueve la cámara por su cuenta: el zoom y el desplazamiento del jugador se conservan. Se destruye al salir
// de la partida.
//
// Privacidad: dibuja SOLO el modelo que recibe (mapModel en game-view.js), hecho con lo que el servidor
// ha autorizado a este jugador. No pide nada al servidor del juego. Los nombres se escriben con
// textContent (nunca como HTML). El proveedor de cartografía ve qué zona se consulta (no quién juega).

// Metros por grado con la misma esfera que usa el servidor para decidir quién está fuera
// (engine/src/geo.ts, radio 6.371.008,8 m): el círculo del mapa es el borde real de la zona, también en
// zonas de 50 m. (Antes, 110.540/111.320, del radar: el círculo salía un 0,6 % más alto que el del servidor.)
const M_PER_DEG_LAT = (6_371_008.8 * Math.PI) / 180;
const M_PER_DEG_LNG_EQ = M_PER_DEG_LAT;

/** Estilo oscuro de MapTiler comprobado en su documentación (mapas oscuros, 27/10/2026). */
export const DEFAULT_MAPTILER_STYLE = 'dataviz-v4-dark';
export const MAP_CONFIG_URL = 'mapa.config.json';
const PLACEHOLDER_KEYS = new Set(['TU_CLAVE_PUBLICA', 'YOUR_MAPTILER_API_KEY_HERE', 'YOUR-API-KEY']);

// Colores de la marca (tokens.generated.css). Las capas de MapLibre no leen variables CSS.
const BRAND = '#ff6b1f';
const ME = '#ffffff';

export const MAP_MESSAGES = Object.freeze({
  loading: 'Cargando el mapa…',
  no_config: 'Mapa sin configurar: falta la clave del proveedor de mapas (mobile/MAPA.md). Se muestra el radar.',
  bad_config: 'La configuración del mapa no es válida (mobile/MAPA.md). Se muestra el radar.',
  library: 'No se pudo cargar el mapa en este móvil. Se muestra el radar.',
  webgl: 'Este navegador no puede dibujar el mapa. Se muestra el radar.',
  key: 'El proveedor del mapa ha rechazado la clave (¿es válida y admite esta dirección?). Se muestra el radar.',
  style: 'No se pudo cargar la cartografía (¿sin conexión?). Se muestra el radar.',
  timeout: 'La cartografía tarda demasiado en cargar. Se muestra el radar.',
  degraded: 'Faltan partes del mapa (sin cobertura o el proveedor no responde). La partida sigue.',
  offline: 'Sin conexión con el servidor: las posiciones de los demás están congeladas.',
});

// ------------------------------------------------------------------ geometría (pura)

const lngScale = (lat) => M_PER_DEG_LNG_EQ * Math.cos((lat * Math.PI) / 180);

/** Anillo cerrado [lng, lat] de un círculo de `radiusM` metros alrededor de `center`. */
export function circleRing(center, radiusM, steps = 64) {
  const kx = lngScale(center.lat);
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((i % steps) / steps) * 2 * Math.PI;
    ring.push([center.lng + (radiusM * Math.sin(a)) / kx, center.lat + (radiusM * Math.cos(a)) / M_PER_DEG_LAT]);
  }
  return ring;
}

/** Rectángulo [[oeste, sur], [este, norte]] que contiene la zona. */
export function zoneBounds(center, radiusM) {
  const dLng = radiusM / lngScale(center.lat);
  const dLat = radiusM / M_PER_DEG_LAT;
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ];
}

const validPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const collection = (features) => ({ type: 'FeatureCollection', features });
const circleFeature = (center, radiusM) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(center, radiusM)] } });

/**
 * Traduce el modelo de la vista (el mismo que usa el radar) a lo que dibuja el mapa. Solo aparece lo
 * que viene en el modelo; un punto sin coordenadas válidas se descarta.
 */
export function mapFeatures(model) {
  const zoneOk = model && validPoint(model.center) && model.radiusM > 0;
  const me = model && validPoint(model.me) ? model.me : null;
  return {
    zone: collection(zoneOk ? [circleFeature(model.center, model.radiusM)] : []),
    // El círculo de precisión no pasa de 2 veces el radio de la zona (una lectura muy mala taparía el mapa).
    accuracy: collection(me && me.accuracyM > 0 && zoneOk ? [circleFeature(me, Math.min(me.accuracyM, model.radiusM * 2))] : []),
    me: me ? { lng: me.lng, lat: me.lat } : null,
    meeting: model && validPoint(model.meeting) ? { lng: model.meeting.lng, lat: model.meeting.lat } : null,
    markers: (model?.dots ?? []).filter(validPoint).map((d) => ({
      id: String(d.id ?? `${d.kind}:${d.label}`),
      lng: d.lng,
      lat: d.lat,
      label: String(d.label ?? ''),
      kind: d.kind,
      team: d.team ?? 'x',
      stale: Boolean(d.stale),
    })),
  };
}

// ------------------------------------------------------------------ configuración del proveedor

/**
 * URL del estilo a partir de mapa.config.json, o null si no es válida. Dos formas:
 *   { "proveedor": "maptiler", "clave": "<clave pública>", "estilo": "dataviz-v4-dark" }
 *   { "estiloUrl": "https://…/style.json" }            (cualquier proveedor compatible con MapLibre)
 */
export function styleUrlFrom(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  if (typeof cfg.estiloUrl === 'string') return /^https:\/\/[^\s]+$/.test(cfg.estiloUrl) ? cfg.estiloUrl : null;
  if (cfg.proveedor !== 'maptiler') return null;
  const key = typeof cfg.clave === 'string' ? cfg.clave.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key) || PLACEHOLDER_KEYS.has(key)) return null;
  const style = typeof cfg.estilo === 'string' && /^[a-z0-9-]{1,64}$/.test(cfg.estilo) ? cfg.estilo : DEFAULT_MAPTILER_STYLE;
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(key)}`;
}

/** Lee mapa.config.json (junto a index.html). { ok, styleUrl } o { ok: false, reason }. */
export async function loadMapConfig(fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(MAP_CONFIG_URL, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'no_config' };
  }
  if (!res.ok) return { ok: false, reason: 'no_config' };
  try {
    const cfg = await res.json();
    // El archivo que crea `npm run vendor` cuando aún no hay clave: mapa sin configurar, no un error.
    if (cfg?.proveedor === 'ninguno') return { ok: false, reason: 'no_config' };
    const styleUrl = styleUrlFrom(cfg);
    return styleUrl ? { ok: true, styleUrl } : { ok: false, reason: 'bad_config' };
  } catch {
    return { ok: false, reason: 'bad_config' };
  }
}

let libraryPromise = null;
/**
 * Carga MapLibre (módulo ES local) y su hoja de estilos una sola vez por página. Se copia con extensión
 * .js (scripts/copy-vendor.mjs) porque no todos los servidores ni WebViews sirven .mjs como JavaScript;
 * por eso se le indica dónde está su worker.
 */
export function loadMapLibre({
  importer = () => import('../vendor/maplibre-gl/maplibre-gl.js'),
  workerUrl = new URL('../vendor/maplibre-gl/maplibre-gl-worker.js', import.meta.url).href,
  doc = globalThis.document,
} = {}) {
  libraryPromise ??= (async () => {
    if (doc?.head && !doc.querySelector('link[data-maplibre]')) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'vendor/maplibre-gl/maplibre-gl.css';
      link.dataset.maplibre = '1';
      doc.head.append(link);
    }
    const mod = await importer();
    const lib = mod?.Map ? mod : mod?.default;
    if (!lib?.Map || !lib?.Marker) throw new Error('library');
    lib.setWorkerUrl?.(workerUrl);
    return lib;
  })();
  libraryPromise.catch(() => (libraryPromise = null)); // permite reintentar
  return libraryPromise;
}

// ------------------------------------------------------------------ controlador del mapa

const ZONE_LAYERS = [
  { id: 'outrun-zone-fill', type: 'fill', source: 'outrun-zone', paint: { 'fill-color': BRAND, 'fill-opacity': 0.1 } },
  { id: 'outrun-zone-line', type: 'line', source: 'outrun-zone', paint: { 'line-color': BRAND, 'line-width': 3, 'line-opacity': 0.95 } },
  { id: 'outrun-accuracy-fill', type: 'fill', source: 'outrun-accuracy', paint: { 'fill-color': ME, 'fill-opacity': 0.1 } },
  { id: 'outrun-accuracy-line', type: 'line', source: 'outrun-accuracy', paint: { 'line-color': ME, 'line-width': 1, 'line-opacity': 0.45 } },
];

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Crea el mapa dentro de `host` (vacío) y devuelve su controlador. `onFail(reason)` se llama una sola
 * vez si la cartografía no llega a cargar (la interfaz vuelve entonces al radar).
 */
export function createMapController(host, { lib, styleUrl, model, onFail = () => {}, loadTimeoutMs = 15_000, doc = globalThis.document } = {}) {
  host.replaceChildren();
  host.classList.add('map-live');
  const canvas = el(doc, 'div', 'map-canvas');
  canvas.setAttribute('role', 'region');
  canvas.setAttribute('aria-label', 'Mapa de la zona de juego');
  const status = el(doc, 'p', 'map-status', MAP_MESSAGES.loading);
  status.setAttribute('role', 'status');
  const badge = el(doc, 'p', 'map-badge');
  badge.hidden = true;
  const tools = el(doc, 'div', 'map-tools');
  const meBtn = el(doc, 'button', 'map-btn', 'Mi posición');
  meBtn.type = 'button';
  const zoneBtn = el(doc, 'button', 'map-btn', 'Ver zona');
  zoneBtn.type = 'button';
  tools.append(meBtn, zoneBtn);
  host.append(canvas, status, badge, tools);

  let latest = model;
  let offline = false;
  let loaded = false;
  let failed = false;
  let destroyed = false;
  let zoneKey = '';
  let accuracyKey = '';
  let degradedTimer = null;
  const markers = new Map(); // id → { marker, node, label }
  let meMarker = null;
  let meetMarker = null;

  const start = mapFeatures(latest);
  let map;
  try {
    map = new lib.Map({
      container: canvas,
      style: styleUrl,
      // Vista inicial: la zona (fijada con el GPS real del anfitrión). Nunca una posición inventada.
      bounds: start.zone.features.length ? zoneBounds(latest.center, latest.radiusM) : undefined,
      fitBoundsOptions: { padding: 24 },
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // MapTiler exige que la atribución esté SIEMPRE visible (maptiler.com/copyright): nunca plegada.
      attributionControl: { compact: false },
    });
  } catch {
    // Sin WebGL (o un navegador que no lo admite): el constructor falla.
    host.replaceChildren();
    host.classList.remove('map-live');
    queueMicrotask(() => onFail('webgl'));
    return { update() {}, destroy() {}, get status() { return 'failed'; }, get map() { return null; } };
  }
  map.touchZoomRotate?.disableRotation?.(); // norte siempre arriba: más fácil de leer corriendo
  map.keyboard?.disableRotation?.();

  const fail = (reason) => {
    if (failed || destroyed) return;
    failed = true;
    onFail(reason);
  };
  const timer = setTimeout(() => !loaded && fail('timeout'), loadTimeoutMs);
  timer?.unref?.(); // en Node (pruebas) no retiene el proceso; en el navegador no existe

  const onLoad = () => {
    if (destroyed) return;
    loaded = true;
    clearTimeout(timer);
    map.addSource('outrun-zone', { type: 'geojson', data: collection([]) });
    map.addSource('outrun-accuracy', { type: 'geojson', data: collection([]) });
    for (const layer of ZONE_LAYERS) map.addLayer(layer);
    status.hidden = true;
    apply();
  };
  const onError = (e) => {
    const code = e?.error?.status;
    if (!loaded) return fail(code === 401 || code === 403 ? 'key' : 'style');
    // Ya cargado: faltan teselas (sin cobertura, límite del proveedor). Aviso pasajero; se sigue jugando.
    badge.textContent = MAP_MESSAGES.degraded;
    badge.hidden = false;
    clearTimeout(degradedTimer);
    degradedTimer = setTimeout(() => {
      if (badge.textContent === MAP_MESSAGES.degraded) badge.hidden = true;
    }, 10_000);
  };
  map.on('load', onLoad);
  map.on('error', onError);

  const onMe = () => {
    const f = mapFeatures(latest);
    if (f.me) map.easeTo({ center: [f.me.lng, f.me.lat], zoom: Math.max(map.getZoom(), 16) });
  };
  const onZone = () => {
    if (latest && validPoint(latest.center)) map.fitBounds(zoneBounds(latest.center, latest.radiusM), { padding: 24 });
  };
  meBtn.addEventListener('click', onMe);
  zoneBtn.addEventListener('click', onZone);

  // MapLibre posiciona el elemento que recibe (le pone sus clases y su transform): las nuestras van en
  // un elemento interior, así cambiarlas nunca le quita las suyas.
  function newMarker(lngLat) {
    const wrap = el(doc, 'div', 'mk-wrap');
    const node = el(doc, 'div');
    node.append(el(doc, 'span', 'mk-dot'));
    const label = el(doc, 'span', 'mk-label');
    node.append(label);
    wrap.append(node);
    return { node, label, at: `${lngLat}`, marker: new lib.Marker({ element: wrap, anchor: 'center' }).setLngLat(lngLat).addTo(map) };
  }

  function place(m, className, text, lngLat) {
    if (m.at !== `${lngLat}`) {
      m.marker.setLngLat(lngLat);
      m.at = `${lngLat}`;
    }
    if (m.node.className !== className) m.node.className = className;
    if (m.label.textContent !== text) m.label.textContent = text;
    return m;
  }

  function marker(id, className, text, lngLat) {
    let m = markers.get(id);
    if (!m) {
      m = newMarker(lngLat);
      markers.set(id, m);
    }
    return place(m, className, text, lngLat);
  }

  function single(current, className, text, point) {
    if (!point) {
      current?.marker.remove();
      return null;
    }
    return place(current ?? newMarker([point.lng, point.lat]), className, text, [point.lng, point.lat]);
  }

  /** Aplica el último modelo a las capas y marcadores existentes. No toca la cámara. */
  function apply() {
    if (!loaded || destroyed) return;
    const f = mapFeatures(latest);
    const zk = latest && validPoint(latest.center) ? `${latest.center.lat},${latest.center.lng},${latest.radiusM}` : '';
    if (zk !== zoneKey) {
      map.getSource('outrun-zone')?.setData(f.zone);
      zoneKey = zk;
    }
    const ak = f.me ? `${f.me.lat},${f.me.lng},${latest.me.accuracyM}` : '';
    if (ak !== accuracyKey) {
      map.getSource('outrun-accuracy')?.setData(f.accuracy);
      accuracyKey = ak;
    }
    meetMarker = single(meetMarker, 'mk mk-meeting', '', f.meeting); // sin texto: lo explica la leyenda
    meMarker = single(meMarker, `mk mk-me t-${latest?.myTeam ?? 'x'}`, '', f.me);
    const seen = new Set();
    for (const d of f.markers) {
      seen.add(d.id);
      marker(d.id, `mk mk-${d.kind} t-${d.team}${d.stale ? ' is-stale' : ''}`, d.label, [d.lng, d.lat]);
    }
    for (const [id, m] of markers) {
      if (seen.has(id)) continue;
      m.marker.remove();
      markers.delete(id);
    }
    meBtn.disabled = !f.me;
    host.classList.toggle('is-offline', offline);
    if (offline) {
      badge.textContent = MAP_MESSAGES.offline;
      badge.hidden = false;
    } else if (badge.textContent === MAP_MESSAGES.offline) badge.hidden = true;
  }

  return {
    /** Nuevo modelo (posiciones, pistas, lectura propia) y si hay conexión con el servidor. */
    update(next, { offline: isOffline = false } = {}) {
      if (destroyed) return;
      latest = next;
      offline = isOffline;
      apply();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      clearTimeout(degradedTimer);
      meBtn.removeEventListener('click', onMe);
      zoneBtn.removeEventListener('click', onZone);
      map.off('load', onLoad);
      map.off('error', onError);
      for (const m of markers.values()) m.marker.remove();
      markers.clear();
      meMarker?.marker.remove();
      meetMarker?.marker.remove();
      map.remove(); // libera WebGL, el worker y sus listeners
      host.replaceChildren();
      host.classList.remove('map-live', 'is-offline');
    },
    get status() {
      return destroyed ? 'destroyed' : failed ? 'failed' : loaded ? 'ready' : 'loading';
    },
    /** La instancia de MapLibre (para pruebas y diagnóstico local). */
    get map() {
      return map;
    },
  };
}
