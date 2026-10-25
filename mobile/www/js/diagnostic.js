// Pantalla de diagnóstico GPS (H1). Capa fina sobre el puente y el modelo de vista: crea la
// estructura una vez y solo actualiza textos, para no sustituir botones mientras se tocan.
import { SYMBOL_PATHS, WORDMARK_PATHS, WORDMARK_VIEWBOX } from './brand.generated.js';
import { BridgeError, INTERVAL, createLocationBridge, nativePlugin } from './location-bridge.js';
import { collectingView, errorText, permissionView, providerView, readingView, sessionView } from './view-model.js';

const INTERVAL_OPTIONS_S = [1, 2, 5, 10, 30]; // opciones de prueba (experimentales, D-038)

const state = {
  permissions: { location: 'prompt', notifications: 'prompt' },
  provider: { locationEnabled: false, provider: null, fusedAvailable: false, gpsEnabled: false },
  status: { running: false, sessionId: null, intervalMs: INTERVAL.defaultMs, fixes: 0, gaps: 0, gapOpen: false, provider: null, lastError: null, message: null },
  reading: null,
  intervalMs: INTERVAL.defaultMs,
  showCoordinates: false,
  log: [],
  busy: false,
};

const $ = (id) => document.getElementById(id);
const setText = (id, text) => {
  const el = $(id);
  if (el && el.textContent !== text) el.textContent = text;
};
const setTone = (id, tone) => {
  const el = $(id);
  if (el) el.dataset.tone = tone;
};

function log(text) {
  const t = new Date().toLocaleTimeString('es-ES', { hour12: false });
  state.log.unshift(`${t} · ${text}`);
  state.log.length = Math.min(state.log.length, 8);
  $('log').innerHTML = state.log.map((l) => `<li>${l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</li>`).join('');
}

function layout() {
  $('app').innerHTML = `
  <header class="top">
    <span class="lockup" role="img" aria-label="THE OUTRUN">
      <svg class="symbol" viewBox="18.6 20.5 112 112" aria-hidden="true">${SYMBOL_PATHS}</svg>
      <svg class="wordmark" viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true">${WORDMARK_PATHS}</svg>
    </span>
    <span class="pill">Diagnóstico GPS · sin red</span>
  </header>
  <p id="collecting" class="collecting" role="status" aria-live="polite"></p>

  <section class="card">
    <h2>Permisos</h2>
    <p class="why">La ubicación precisa solo se usa durante una sesión de diagnóstico, con la app abierta o con su notificación visible. No se envía a ningún sitio y el registro no guarda coordenadas. Las notificaciones sirven para mostrar ese aviso.</p>
    <dl>
      <dt>Ubicación</dt><dd id="perm-location"></dd>
      <dt>Notificaciones</dt><dd id="perm-notif"></dd>
    </dl>
    <button id="btn-perm" class="btn btn-primary btn-block" type="button">Conceder permisos</button>
    <p id="perm-settings" class="hint" hidden>Android ya no volverá a preguntar. Ve a Ajustes › Aplicaciones › THE OUTRUN › Permisos › Ubicación › «Permitir solo mientras se usa la app» y activa «Usar ubicación precisa».</p>
  </section>

  <section class="card">
    <h2>Proveedor de ubicación</h2>
    <p id="provider" class="line"></p>
    <button id="btn-provider" class="btn btn-outline btn-block" type="button">Comprobar de nuevo</button>
  </section>

  <section class="card">
    <h2>Sesión <span class="exp">Intervalo experimental</span></h2>
    <div class="seg" role="group" aria-label="Intervalo solicitado">${INTERVAL_OPTIONS_S.map((s) => `<button type="button" data-interval="${s * 1000}">${s} s</button>`).join('')}</div>
    <p class="hint">Es lo que se pide al sistema; Android puede entregar lecturas más espaciadas.</p>
    <div class="btn-row">
      <button id="btn-start" class="btn btn-primary" type="button">Iniciar sesión</button>
      <button id="btn-stop" class="btn btn-outline" type="button">Detener</button>
    </div>
    <p id="session-counts" class="line"></p>
    <p id="session-error" class="line danger" hidden></p>
    <p id="session-message" class="hint" hidden></p>
  </section>

  <section class="card">
    <h2>Última lectura</h2>
    <p id="reading-label" class="status-chip"></p>
    <dl>
      <dt>Antigüedad</dt><dd id="reading-age" class="num"></dd>
      <dt>Precisión estimada</dt><dd><span id="reading-acc" class="num"></span> · <span id="reading-acc-label"></span></dd>
      <dt>Proveedor</dt><dd id="reading-provider"></dd>
      <dt>Velocidad</dt><dd id="reading-speed" class="num"></dd>
    </dl>
    <p id="reading-hint" class="hint" hidden></p>
    <p id="reading-mock" class="line danger" hidden></p>
    <label class="toggle"><input id="chk-coords" type="checkbox"> Mostrar coordenadas en pantalla (no se guardan)</label>
    <p id="reading-coords" class="line num" hidden></p>
  </section>

  <section class="card">
    <h2>Registro de la sesión</h2>
    <p class="hint">CSV sin columnas de latitud ni longitud: calidad, antigüedad y huecos de cada lectura, y estado del móvil (pantalla, batería, ahorro de energía).</p>
    <button id="btn-export" class="btn btn-outline btn-block" type="button">Exportar CSV</button>
  </section>

  <section class="card">
    <h2>Incidencias</h2>
    <ul id="log" class="log"></ul>
  </section>
  <p class="foot">THE OUTRUN · H1 · prueba de ubicación. No es la partida.</p>`;
}

function render() {
  const now = Date.now();
  const pv = permissionView(state.permissions);
  setText('perm-location', pv.location.text);
  setTone('perm-location', pv.location.tone);
  setText('perm-notif', pv.notifications.text);
  setTone('perm-notif', pv.notifications.tone);
  $('btn-perm').hidden = !pv.canRequest;
  $('perm-settings').hidden = !pv.needsSettings;

  const prov = providerView(state.provider);
  setText('provider', prov.text);
  setTone('provider', prov.tone);

  const col = collectingView(state.status);
  setText('collecting', col.text);
  setTone('collecting', col.tone);

  for (const b of document.querySelectorAll('[data-interval]')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.interval) === state.intervalMs));
    b.disabled = state.status.running;
  }
  $('btn-start').disabled = state.busy || state.status.running || !pv.canStart || !state.provider.locationEnabled;
  $('btn-stop').disabled = state.busy || !state.status.running;

  const sv = sessionView(state.status);
  setText('session-counts', `${sv.counts} · ${sv.interval}`);
  $('session-error').hidden = !sv.error;
  setText('session-error', sv.error ?? '');
  $('session-message').hidden = !sv.message;
  setText('session-message', sv.message ?? '');

  // Sin sesión en curso no se enseña ninguna lectura: no hay posición actual.
  const rv = readingView(state.status.running ? state.reading : null, now, { showCoordinates: state.showCoordinates });
  setText('reading-label', rv.label);
  setTone('reading-label', rv.tone);
  setText('reading-age', rv.age);
  setText('reading-acc', rv.accuracy);
  setText('reading-acc-label', rv.accuracyLabel);
  setText('reading-provider', rv.provider);
  setText('reading-speed', rv.speed);
  $('reading-hint').hidden = !rv.hint;
  setText('reading-hint', rv.hint ?? '');
  $('reading-mock').hidden = !rv.mock;
  setText('reading-mock', rv.mock ?? '');
  $('reading-coords').hidden = !rv.coordinates;
  setText('reading-coords', rv.coordinates ?? '');
}

async function guarded(fn) {
  state.busy = true;
  render();
  try {
    await fn();
  } catch (e) {
    log(errorText(e instanceof BridgeError ? e.code : 'native_error'));
  } finally {
    state.busy = false;
    render();
  }
}

async function boot() {
  layout();
  const bridge = createLocationBridge(await nativePlugin().catch(() => null));
  if (!bridge.available) log(errorText('unavailable'));

  const refresh = async () => {
    if (!bridge.available) return;
    state.permissions = await bridge.checkPermissions();
    state.provider = await bridge.providerStatus();
    state.status = await bridge.status();
    if (state.status.running) state.intervalMs = state.status.intervalMs;
    if (state.status.lastError) log(errorText(state.status.lastError));
  };

  await bridge.onReading((r) => {
    state.reading = r;
  }, () => log('Lectura descartada: datos incompletos del módulo nativo.'));
  await bridge.onStatus((s) => {
    if (s.lastError && s.lastError !== state.status.lastError) log(errorText(s.lastError));
    if (!s.running) state.reading = null;
    state.status = s;
  });

  $('btn-perm').addEventListener('click', () => guarded(async () => {
    state.permissions = await bridge.requestPermissions();
  }));
  $('btn-provider').addEventListener('click', () => guarded(async () => {
    state.provider = await bridge.providerStatus();
  }));
  for (const b of document.querySelectorAll('[data-interval]')) {
    b.addEventListener('click', () => {
      state.intervalMs = Number(b.dataset.interval);
      render();
    });
  }
  $('btn-start').addEventListener('click', () => guarded(async () => {
    state.reading = null;
    state.status = await bridge.start(state.intervalMs);
    log(`Sesión iniciada (${state.intervalMs / 1000} s solicitados).`);
  }));
  $('btn-stop').addEventListener('click', () => guarded(async () => {
    state.status = await bridge.stop();
    state.reading = null;
    log('Sesión detenida.');
  }));
  $('btn-export').addEventListener('click', () => guarded(async () => {
    const r = await bridge.exportSession();
    log(r.saved ? `Registro exportado: ${r.name ?? 'CSV'}` : errorText('export_cancelled'));
  }));
  $('chk-coords').addEventListener('change', (ev) => {
    state.showCoordinates = ev.target.checked;
    render();
  });
  // Al volver a la app (bloqueo, cambio de aplicación) se relee el estado real.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') guarded(refresh);
  });

  await guarded(refresh);
  setInterval(render, 500);
}

boot();
