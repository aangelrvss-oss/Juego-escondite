// THE OUTRUN · interfaz de partida. Se dibuja siempre a partir de la vista autorizada que envía el
// servidor (snapshot) y de lo que el servidor permite ver (posiciones, pistas). Los eventos solo
// producen avisos. Ninguna regla se decide aquí: todo lo valida el servidor.
import { SYMBOL_PATHS, WORDMARK_PATHS, WORDMARK_VIEWBOX } from './brand.generated.js';
import { CAPTURE_NORMS, INVITE_PARAM, MODES, PHASE_TEXT, zoneLine, modeInfo, teamName, PING_WARNING_MS, TEAM_TEXT, ago, briefing, mapModel, clock, codeFromLink, commandErrorText, connectionNotice, conversionText, countdownAbortText, errorText, foxLine, gpsCheckError, lobbyRolesHint, pendingConversion, pingWaitText, revealOpen, sheetAfterSnapshot, gpsStatus, inviteLink, isStaleEvent, locationDeniedNotice, me, missionReport, nightNotice, normalizeCode, pingCountdown, screenNotice, phaseDeadline, reportShareText, rivals, sharingStatus, startBlockers, SAFETY_CHECKLIST, configSummary, lobbySteps, playerReadiness, readyButton, readyProgress, readyResetNotice, acceptedConfig, guideStaysOpen, startSummary } from './game-view.js';
import { createLocationSource } from './location.js';
import { GameConnection, toWsUrl, uploadUrl } from './net.js';
import { qrSvg } from './qr.js';
import { MAP_MESSAGES, createMapController, loadMapConfig, loadMapLibre } from './map-view.js';
import { radarSvg } from './radar.js';
import { missionReportScreen } from './report-view.js';
import { readStats, recordGame } from './stats.js';
import { previousReportFor, readLastReport, saveLastReport } from './last-report.js';
import { guideOverlay, guideStepFor, guideSteps } from './guide.js';

// La interfaz se redibuja entera (innerHTML) en #app y #app-after. El mapa vive entre los dos, en
// #map-host, que el redibujado nunca toca: así no se reinicia ni pierde el zoom (ver syncMap).
const $app = document.getElementById('app');
const $after = document.getElementById('app-after');
const $mapHost = document.getElementById('map-host');
const store = (() => {
  try {
    localStorage.setItem('outrun.probe', '1');
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  }
})();
const isApp = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());

// Opciones de configuración (dentro de los límites del motor; los valores son parámetros de prueba).
const DURATIONS = [10, 15, 20, 30, 45, 60];
const HEAD_STARTS = [2, 3, 5]; // mínimo de 2 min aprobado (D-042)
const PING_INTERVALS = [2, 3, 5, 10];
// Radio inicial de la zona (1/11/2026). El motor admite 50–2.000 m: una sala configurada antes con otro
// radio (200, 400…) lo sigue mostrando como opción extra.
const RADII = [50, 100, 250, 500, 1000];

const ui = {
  conn: null,
  snap: null,
  reading: null, // última lectura propia (solo en este móvil)
  positions: [], // posiciones autorizadas por el servidor
  positionsAt: 0, // hora del servidor del último envío de posiciones
  ping: null, // última pista (cazadores)
  toasts: [],
  reveal: null, // { team, until }
  lobbyNotice: null, // por qué se volvió a la sala desde la cuenta atrás (hasta volver a marcar «Estoy listo»)
  acceptedConfig: null, // configuración que aceptó este jugador al marcarse listo (D-062; game-view acceptedConfig)
  claimSent: null, // { runnerId, expiresAt }
  zoneWarning: null, // { exposedAt } (fugitivo fuera de la zona)
  startZoneWarning: false,
  sentAt: null, // hora del servidor en que los cazadores recibieron la posición de este fugitivo (ping_sent)
  pingWarnedFor: null, // nextPingAt del que ya se avisó «Pista en 1 min»
  phaseKey: null, // partida y fase de la última instantánea: al cambiar se limpian los avisos de la anterior
  names: new Map(), // nombres de quien ha jugado: el Mission Report los conserva aunque salgan de la sala
  draft: { mode: 'classic', durationMin: 20, headStartMin: 2, pingMin: 3, radiusM: 500, safety: false, center: null },
  sheet: null, // 'selftag' | 'qr' | null
  locating: false,
  homeError: null,
  adult: false, // casilla «Tengo 18 años o más» marcada (se recuerda en el móvil al entrar, D-008)
  leaving: false,
  confirmEnd: false,
  confirmNewCode: false,
  confirmLeave: false,
  confirmRematch: false, // el anfitrión ha tocado «Revancha» una vez: el segundo toque la empieza
  confirmRematchTimer: undefined,
  viewReport: false, // viendo el informe guardado de la partida anterior (last-report.js)
  gpsChecked: false, // este móvil ya ha dado una posición válida (se comprueba al pulsar «Estoy listo»)
  gpsCheckedAt: 0, // cuándo (performance.now) dio la última posición válida
  location: null,
  tracking: false,
  locationDenied: false, // el permiso de ubicación falta o se ha retirado durante la partida (AC-D9)
  screenHeld: false, // el navegador mantiene la pantalla encendida (Screen Wake Lock)
  inviteCode: null, // código recibido por enlace de invitación (?sala=)
  guide: null, // guía rápida abierta: { step, mode, context } (guide.js). No toca la sala ni la conexión
  guideOpener: null, // botón que abrió la guía: recupera el foco al cerrarla
  guideFocus: false, // dar el foco al título de la guía en el próximo dibujo (al abrirla o cambiar de paso)
  // Sala guiada (ciclo UX 11/2026)
  autoCenter: false, // ya se intentó centrar la zona sola al entrar como anfitrión sin configuración
  centerError: null, // por qué no se pudo centrar la zona (se reintenta con «Centrar la zona aquí»)
  readyError: null, // por qué falló la comprobación de GPS de «Estoy listo» (se queda hasta el siguiente intento)
  editConfig: false, // selectores de la configuración desplegados («Cambiar»)
  manage: false, // fila secundaria de cada jugador: asignar rol y expulsar
  startAck: false, // lista de seguridad marcada en la hoja de «Empezar partida»
  sheetFocus: null, // id que recibe el foco en el próximo dibujo (al abrir la hoja «Antes de empezar»)
  starting: null, // texto del paso en curso al empezar (configurar, GPS, listo, empezar) o null
  startError: null, // por qué no se pudo empezar (se muestra en la hoja, que no se cierra)
};

// Enlace de invitación: se toma el código y se quita de la barra de direcciones (no hace falta
// conservarlo, y así no se vuelve a aplicar al recargar después de entrar).
ui.inviteCode = codeFromLink(location.href);
if (new URL(location.href).searchParams.has(INVITE_PARAM)) {
  try {
    const clean = new URL(location.href);
    clean.searchParams.delete(INVITE_PARAM);
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
  } catch {
    /* sin history (p. ej., algunas vistas incrustadas): no pasa nada */
  }
}

/** Enlace de invitación de la sala actual, o null si no hay servidor o código. */
const currentInvite = () => (ui.conn?.code ? inviteLink(serverUrl(), ui.conn.code) : null);

// ------------------------------------------------------------------ utilidades

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nameOf = (id) => ui.snap?.players.find((p) => p.id === id)?.name ?? ui.names.get(id) ?? 'Alguien';
const serverNow = () => ui.conn?.serverNow() ?? Date.now();

function toast(text, tone = 'info') {
  const t = { id: Math.random(), text, tone, until: performance.now() + 4_500 };
  ui.toasts = [...ui.toasts.slice(-2), t];
  render();
  setTimeout(() => {
    ui.toasts = ui.toasts.filter((x) => x !== t);
    render();
  }, 4_600);
}

/** Anuncio para lectores de pantalla en una región fija (fuera de lo que se redibuja). */
function announce(text) {
  const live = document.getElementById('sr-live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => (live.textContent = text), 50);
}

let frame = 0;
function render() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (touching) return void (drawAfterTouch = true);
    draw();
  });
}

// Mientras un dedo toca la pantalla no se redibuja: si el botón pulsado se sustituyera entre que el
// dedo baja y sube, el toque podría perderse (p. ej. «Sí, me ha pillado», con 30 s para responder).
// Se suelta poco después de levantar el dedo (el clic llega antes) y, por seguridad, a los 1,5 s.
let touching = false;
let drawAfterTouch = false;
let touchTimer = 0;
function releaseTouch() {
  clearTimeout(touchTimer);
  if (!touching) return;
  touching = false;
  if (drawAfterTouch) {
    drawAfterTouch = false;
    render();
  }
}
document.addEventListener('pointerdown', () => {
  touching = true;
  clearTimeout(touchTimer);
  touchTimer = setTimeout(releaseTouch, 1_500);
}, true);
document.addEventListener('pointerup', () => {
  clearTimeout(touchTimer);
  touchTimer = setTimeout(releaseTouch, 150);
}, true);
document.addEventListener('pointercancel', releaseTouch, true);

// Prioridad de los avisos cuando solo cabe uno: peligro (p. ej. «te han enviado a los cazadores»),
// después los de la partida y por último los informativos. A igual prioridad, el más reciente.
const TOAST_RANK = { danger: 3, brand: 2, info: 1 };
const topToast = (list) => list.reduce((best, t) => (!best || (TOAST_RANK[t.tone] ?? 1) >= (TOAST_RANK[best.tone] ?? 1) ? t : best), null);

function lockup() {
  return `<span class="lockup" role="img" aria-label="THE OUTRUN">
    <svg class="symbol" viewBox="18.6 20.5 112 112" aria-hidden="true">${SYMBOL_PATHS}</svg>
    <svg class="wordmark" viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true">${WORDMARK_PATHS}</svg></span>`;
}

function statusDot() {
  const s = ui.conn?.status ?? 'idle';
  const text = { open: 'Conectado', connecting: 'Conectando…', reconnecting: 'Reconectando…', closed: 'Desconectado', idle: '' }[s];
  return s === 'idle' ? '' : `<span class="net net-${s}" role="status">${text}</span>`;
}

// ------------------------------------------------------------------ conexión

function serverInput() {
  return store.getItem('outrun.server') ?? '';
}

function serverUrl() {
  if (!isApp() && /^https?:$/.test(location.protocol)) return toWsUrl(location.origin); // web servida por el propio servidor
  return toWsUrl(serverInput());
}

function connect() {
  const url = serverUrl();
  if (!url) return null;
  if (ui.conn && ui.conn.url === url && ui.conn.status !== 'closed') return ui.conn;
  ui.conn?.close();
  const conn = new GameConnection({ url, storage: store });
  ui.conn = conn;
  conn.on('status', render);
  conn.on('snapshot', (snap) => {
    // Si el motor acaba de quitarle el «listo» por un cambio material del anfitrión, se le explica qué ha
    // cambiado desde lo que aceptó al marcarse listo (D-062; el protocolo no cambia).
    // Tras recargar, lo aceptado se recupera de este móvil: si no, se mediría desde la zona de ahora.
    const accepted = ui.acceptedConfig ?? storedAccepted(snap, conn.playerId);
    const reset = readyResetNotice(ui.snap, snap, conn.playerId, accepted);
    if (reset) {
      ui.lobbyNotice = reset;
      announce(reset);
    }
    ui.acceptedConfig = acceptedConfig(accepted, snap, conn.playerId);
    storeAccepted(snap, conn.playerId, ui.acceptedConfig);
    // La guía se cierra sola al empezar la cuenta atrás o cambiar de fase: no tapa el rol ni el inicio (AF-10).
    if (ui.guide && !guideStaysOpen(ui.snap, snap, ui.reveal, performance.now())) dropGuide();
    ui.snap = snap;
    for (const p of snap.players) ui.names.set(p.id, p.name);
    forgetStaleWarnings(snap);
    // La última pista viene también en la vista (solo para un cazador activo): así no se pierde al
    // recargar, y desaparece de la pantalla en cuanto la partida termina.
    ui.ping = snap.lastPing ?? null;
    // La reclamación pendiente de este cazador la dice el servidor: así no se pierde al recargar.
    if ('pendingClaimByMe' in snap) {
      const c = snap.pendingClaimByMe;
      ui.claimSent = c ? { runnerId: c.runnerId, claimId: c.claimId, expiresAt: c.expiresAt } : null;
    }
    // Fuera de la huida y la persecución no se guarda ninguna posición de otros jugadores.
    if (snap.phase !== 'HEAD_START' && snap.phase !== 'ACTIVE') ui.positions = [];
    if (snap.phase !== 'LOBBY') ui.lobbyNotice = null;
    // «¿Quién te ha pillado?» no sobrevive al final (el motor cierra las reclamaciones sin avisar).
    ui.sheet = sheetAfterSnapshot(ui.sheet, snap);
    // Una reclamación de captura tiene 30 s para responder: la guía no puede taparla.
    if (snap.pendingClaimForMe && snap.phase === 'ACTIVE') dropGuide();
    // Infección: la tarjeta de conversión también sale de la instantánea si el evento llegó viejo o se perdió.
    showConversion(snap);
    // Historial de este móvil: una vez por partida (recordGame no cuenta dos veces tras recargar).
    if (snap.phase === 'FINISHED' && ui.conn?.playerId) {
      recordGame(store, snap, ui.conn.playerId);
      // La revancha devuelve a todos a la sala y el servidor olvida el informe: este móvil guarda una copia.
      saveLastReport(store, snap, ui.conn.playerId);
    }
    // El informe anterior se ve en la sala o en el inicio; al empezar otra partida, se cierra.
    if (snap.phase !== 'LOBBY') ui.viewReport = false;
    if (snap.phase !== 'FINISHED') ui.confirmRematch = false;
    syncTracking();
    maybeAutoCenter(snap);
    render();
  });
  conn.on('event', onEvent);
  conn.on('positions', (msg) => {
    ui.positions = msg.positions;
    ui.positionsAt = msg.at;
    render();
  });
  // Abierta en otra pestaña: no es un aviso pasajero, lo explica su propia pantalla (replacedScreen).
  conn.on('error', (code) => (code === 'replaced' ? render() : toast(errorText(code), 'danger')));
  conn.on('code', (code) => toast(`Nuevo código de sala: ${code}. El anterior ya no sirve.`));
  conn.on('session_lost', (code) => {
    resetGame();
    if (!ui.leaving) ui.homeError = errorText(code);
    render();
  });
  conn.start();
  return conn;
}

// Lo que aceptó este jugador al marcarse listo (D-062), para seguir explicando bien un «listo» perdido tras
// recargar. Solo la sala y la partida en las que vale; se borra al dejar de estar listo.
const ACCEPTED_KEY = 'outrun.accepted';

function storedAccepted(snap, myId) {
  try {
    const saved = JSON.parse(store.getItem(ACCEPTED_KEY) ?? 'null');
    return saved && saved.roomId === snap.roomId && saved.gameNo === snap.gameNo && saved.playerId === myId ? saved.config : null;
  } catch {
    return null;
  }
}

function storeAccepted(snap, myId, config) {
  try {
    if (config) store.setItem(ACCEPTED_KEY, JSON.stringify({ roomId: snap.roomId, gameNo: snap.gameNo, playerId: myId, config }));
    else store.removeItem(ACCEPTED_KEY);
  } catch {
    /* sin almacenamiento: se mide desde la instantánea */
  }
}

// Última conversión ya mostrada en este móvil (sala:partida): la tarjeta sale una sola vez.
const CONVERTED_KEY = 'outrun.converted';

/** Tarjeta «Te han infectado» (una vez por partida), anunciada también a los lectores de pantalla. */
function showConversion(snap) {
  const seen = pendingConversion(snap, ui.conn?.playerId, store.getItem(CONVERTED_KEY));
  if (!seen) return;
  store.setItem(CONVERTED_KEY, seen.key);
  // Se cierra al tocarla o sola a los 15 s; después lo recuerda la franja «podrás capturar en…».
  ui.reveal = { team: seen.team, converted: true, until: performance.now() + 15_000 };
  dropGuide();
  announce(`Te han infectado: ahora eres cazador. ${conversionText(snap.canTagFrom, serverNow())}`);
}

function resetGame() {
  stopTracking();
  ui.snap = null;
  ui.positions = [];
  ui.ping = null;
  ui.locationDenied = false;
  ui.claimSent = null;
  ui.zoneWarning = null;
  ui.startZoneWarning = false;
  ui.reveal = null;
  ui.lobbyNotice = null;
  ui.acceptedConfig = null;
  ui.sheet = null;
  ui.viewReport = false;
  ui.confirmRematch = false;
  ui.sentAt = null;
  ui.phaseKey = null;
  ui.names.clear();
  ui.autoCenter = false;
  ui.centerError = null;
  ui.readyError = null;
  ui.editConfig = false;
  ui.manage = false;
  ui.startAck = false;
  ui.starting = null;
  ui.startError = null;
  syncWakeLock(); // sin partida, la pantalla vuelve a apagarse sola
}

/**
 * Avisos que solo valen dentro de una fase: el motor no siempre emite un evento que los cierre (fin de la
 * huida, captura estando fuera de la zona, final con una reclamación pendiente, revancha). Se olvidan al
 * cambiar de fase o de partida, y al dejar de estar libre.
 */
function forgetStaleWarnings(snap) {
  const key = `${snap.gameNo}:${snap.phase}`;
  if (key !== ui.phaseKey) {
    ui.phaseKey = key;
    if (snap.phase !== 'HEAD_START') ui.startZoneWarning = false;
    if (snap.phase !== 'ACTIVE') {
      ui.claimSent = null;
      ui.sentAt = null;
    }
    // El aviso de zona puede llegar justo antes de la instantánea de la huida (mismo paso del servidor).
    if (snap.phase !== 'HEAD_START' && snap.phase !== 'ACTIVE') ui.zoneWarning = null;
  }
  if (me(snap, ui.conn?.playerId)?.status !== 'active') {
    ui.zoneWarning = null;
    ui.sentAt = null;
  }
}

async function cmd(command) {
  const r = await ui.conn.command(command);
  if (!r.ok) {
    // Un control (desplegable, casilla) puede mostrar un valor que el servidor no ha aceptado: se vuelve
    // a dibujar entero para que muestre el valor real aunque el resto no haya cambiado.
    drawn.delete($app);
    drawn.delete($after);
    toast(commandErrorText(r.error, r.detail, command?.type), 'danger');
  }
  return r;
}

function onEvent(e) {
  const d = e.data;
  // Un evento repetido al reanudar (p. ej. tras recargar la página) actualiza el estado, pero no vuelve
  // a avisar: nada de tarjetas, mensajes ni vibraciones de algo que pasó hace rato.
  const stale = isStaleEvent(e, ui.snap);
  const notify = stale ? () => {} : toast;
  const buzz = (pattern) => (stale ? undefined : navigator.vibrate?.(pattern));
  switch (e.type) {
    case 'role_revealed':
      if (!stale) {
        ui.reveal = { team: d.team, until: performance.now() + 5_000 };
        dropGuide(); // la tarjeta del rol no puede quedar bajo la guía
      }
      buzz([120, 60, 120]);
      break;
    case 'role_changed':
      // Infección: le han capturado y ahora caza. La tarjeta (una vez por partida) también puede salir de la
      // instantánea; aquí no se repite si ya se mostró.
      if (!stale && ui.snap) showConversion(ui.snap);
      // Lo que avisaba al fugitivo ya no le afecta: zona, posición enviada, hoja «Me han pillado».
      ui.zoneWarning = null;
      ui.sentAt = null;
      if (ui.sheet === 'selftag') ui.sheet = null;
      // Las posiciones locales son las de su antiguo equipo: fuera hasta el siguiente envío.
      ui.positions = [];
      buzz([300, 100, 300, 100, 300]);
      break;
    case 'player_joined':
      // Quien recupera su plaza tras perder la conexión en la sala (`replaces`) no es alguien nuevo.
      notify(d.replaces ? `${d.name} ha vuelto` : `${d.name} ha entrado`);
      break;
    case 'player_left':
      if (d.playerId === ui.conn.playerId) break; // lo explica su propia pantalla
      ui.positions = ui.positions.filter((p) => p.playerId !== d.playerId); // sin esperar al siguiente envío
      if (d.reason === 'timeout') notify(`${nameOf(d.playerId)} ha quedado fuera: más de 5 min sin conexión`, 'brand');
      else notify(`${nameOf(d.playerId)} ha salido`);
      break;
    case 'player_presence':
      // D-057: 30 s sin ninguna señal de su móvil. Sin equipo ni posición: lo ven todos igual.
      if (d.playerId !== ui.conn.playerId) notify(d.away ? `${nameOf(d.playerId)} no da señales: sin conexión` : `${nameOf(d.playerId)} ha vuelto`);
      break;
    case 'player_kicked': // al expulsado le llega «removed» (session_lost), no este evento
      notify(`${nameOf(d.playerId)} ha sido expulsado`);
      break;
    case 'host_changed':
      notify(`${nameOf(d.hostId)} es ahora el anfitrión`);
      break;
    case 'hunt_started':
      notify('¡Empieza la persecución!', 'brand');
      buzz(300);
      break;
    case 'zone_phase':
      // El círculo lo dibuja la instantánea (plan del servidor); aquí solo se avisa.
      notify(`La zona se cierra: ${metres(d.radiusM)} en 5 min. Sin correr, ve hacia el centro.`, 'brand');
      buzz(150);
      break;
    case 'start_zone_warning':
      ui.startZoneWarning = true;
      buzz(200);
      break;
    case 'start_zone_returned':
      ui.startZoneWarning = false;
      break;
    case 'zone_exit_warning':
      ui.zoneWarning = { exposedAt: d.exposedAt };
      buzz([200, 100, 200]);
      break;
    case 'zone_reentered':
      ui.zoneWarning = null;
      notify('Has vuelto a la zona');
      break;
    case 'runner_exposed':
      if (d.runnerId === ui.conn.playerId) {
        notify('Llevas demasiado fuera: los cazadores te ven', 'danger');
        buzz([200, 100, 200]);
      } else notify(`${nameOf(d.runnerId)} está fuera de la zona: visible`, 'brand');
      break;
    case 'runner_unexposed':
      // Al convertirse (Infección) también deja de estar expuesto, pero no ha vuelto a la zona: lo anuncia la conversión.
      if (d.runnerId !== ui.conn.playerId && d.reason !== 'converted') notify(`${nameOf(d.runnerId)} ha vuelto a la zona: ya no se ve`);
      break;
    case 'ping': {
      ui.ping = d.ping;
      const n = (d.ping?.entries ?? []).filter((x) => x.position).length;
      if (ui.snap?.config?.mode === 'fox_hunt') notify(n ? 'Nueva pista: posición del zorro' : 'Nueva pista: el zorro no tiene señal', 'brand');
      else notify(n ? `Nueva pista: ${n === 1 ? 'posición de 1 fugitivo' : `posiciones de ${n} fugitivos`}` : 'Nueva pista: ningún fugitivo con señal', 'brand');
      buzz(150);
      break;
    }
    case 'ping_sent':
      // El espectador (fugitivo ya capturado) también lo recibe: a él no le afecta.
      if (me(ui.snap, ui.conn.playerId)?.status !== 'active') break;
      // Sin aviso pasajero: lo dice la franja fija bajo el reloj (30 s). Se anuncia una sola vez aparte,
      // porque la franja se vuelve a dibujar cada segundo con el reloj.
      if (!stale) {
        ui.sentAt = e.at ?? serverNow();
        announce('Los cazadores acaban de recibir tu posición. Muévete.');
      }
      buzz([200, 80, 200]);
      break;
    case 'tag_claimed':
      buzz([300, 100, 300]);
      break;
    case 'tag_claim_resolved': {
      // «confirmed» no avisa aquí: el aviso de la captura llega a todos con runner_captured.
      const text = { rejected: 'Captura rechazada', expired: 'Sin respuesta: no hay captura', cancelled: 'Reclamación cancelada' }[d.result];
      if (ui.claimSent?.claimId === d.claimId) ui.claimSent = null;
      if (text) notify(text, 'info');
      break;
    }
    case 'runner_captured':
      if (d.converted) notify(d.runnerId === ui.conn.playerId ? 'Te han infectado: ahora cazas' : `${nameOf(d.runnerId)} ha sido infectado: ahora caza`, d.runnerId === ui.conn.playerId ? 'danger' : 'brand');
      else notify(d.runnerId === ui.conn.playerId ? 'Te han capturado' : `Captura: ${nameOf(d.runnerId)}`, d.runnerId === ui.conn.playerId ? 'danger' : 'brand');
      break;
    case 'game_finished':
      stopTracking();
      // Los avisos de la partida (pistas, capturas) ya no aplican: el resultado lo cuenta el Mission Report.
      ui.toasts = [];
      // Ni la tarjeta de conversión (tapaba el informe) ni las hojas de reclamación: el motor borra las
      // reclamaciones al terminar sin emitir tag_claim_resolved.
      ui.reveal = null;
      if (ui.sheet === 'selftag') ui.sheet = null;
      ui.claimSent = null;
      break;
    case 'countdown_aborted': {
      // Vuelta a la sala: el motor quita el «Listo» a todos. Se explica y se recuerda en la sala.
      const text = countdownAbortText(d?.reason, { host: ui.snap?.hostId === ui.conn?.playerId });
      // Uno repetido al reanudar (de una cuenta atrás anterior) no vuelve a fijar el aviso en la sala (R-3).
      if (!stale) ui.lobbyNotice = text;
      notify(text, 'danger');
      if (!stale) announce(text);
      break;
    }
    case 'room_closed':
      stopTracking();
      break;
  }
  render();
}

// ------------------------------------------------------------------ ubicación

async function locationSource() {
  ui.location ??= await createLocationSource();
  return ui.location;
}

function onReading(r) {
  ui.reading = r;
  ui.locationDenied = false;
  sendReading();
  render();
}

let lastSentAt = 0;
function sendReading() {
  const r = ui.reading;
  if (!r || !ui.tracking || !ui.conn) return;
  // En la app, el servicio nativo ya envía cada lectura (también con la pantalla bloqueada). Si su
  // envío falla, su estado lo dice en ≤ 5 s y la página vuelve a enviar por el WebSocket.
  if (ui.location?.uploading) return;
  if (performance.now() - lastSentAt < 1_000) return;
  lastSentAt = performance.now();
  // Antigüedad en el momento de enviar: la de la lectura más lo que lleva esperando aquí.
  ui.conn.sendLocation({ ...r, ageMs: r.ageMs + (performance.now() - r.at) });
}
setInterval(sendReading, 5_000);

function wantsTracking() {
  const self = me(ui.snap, ui.conn?.playerId);
  return Boolean(self && self.status === 'active' && ['COUNTDOWN', 'HEAD_START', 'ACTIVE'].includes(ui.snap.phase));
}

// Pantalla encendida durante la partida, solo en el navegador. El sistema suelta el bloqueo al ocultar
// la página; se vuelve a pedir al volver a ella.
let wakeLock = null;
let wakeLockPending = false;
async function syncWakeLock() {
  const want = wantsTracking() && !isApp() && document.visibilityState === 'visible';
  if (want && !wakeLock && !wakeLockPending && navigator.wakeLock) {
    wakeLockPending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
        ui.screenHeld = false;
        render();
      });
      ui.screenHeld = true;
    } catch {
      ui.screenHeld = false; // sin permiso o batería baja: queda el aviso
    } finally {
      wakeLockPending = false;
    }
    render();
    if (!wantsTracking()) syncWakeLock(); // la partida terminó mientras se pedía
  } else if (!want && wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    ui.screenHeld = false;
    lock.release().catch(() => {});
  }
}

async function syncTracking() {
  syncWakeLock();
  // Sin permiso no se reintenta con cada instantánea (sería un aviso en bucle): solo con «Reintentar».
  if (wantsTracking() && !ui.tracking && !ui.locationDenied) {
    ui.tracking = true;
    try {
      const src = await locationSource();
      // Sin señal o quieto: lo indica la barra de GPS con la antigüedad real; solo el permiso es un aviso.
      await src.start(onReading, (code) => code === 'permission_missing' && locationDenied(), {
        upload: nativeUpload(),
      });
    } catch (e) {
      ui.tracking = false;
      if (e.message === 'permission_missing') locationDenied();
      else toast('No se pudo activar la ubicación.', 'danger');
    }
  } else if (!wantsTracking() && ui.tracking) {
    stopTracking();
  }
}

function locationDenied() {
  if (!ui.locationDenied) toast('Falta el permiso de ubicación', 'danger');
  ui.locationDenied = true;
  render();
}

/** Destino del envío nativo (solo app y servidor HTTPS): la sesión del jugador viaja al servicio. */
function nativeUpload() {
  const url = ui.conn && uploadUrl(ui.conn.url);
  const session = ui.conn?.session;
  return url && session ? { url, playerId: session.playerId, secret: session.secret } : null;
}

function stopTracking() {
  if (!ui.tracking) return;
  ui.tracking = false;
  ui.location?.stop();
}

/** Una sola lectura para que el anfitrión centre la zona (solo en la sala, solo si lo pide). */
async function locateOnce() {
  ui.locating = true;
  render();
  try {
    const src = await locationSource();
    const reading = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 30_000);
      src.start((r) => {
        if (r.accuracyM <= 100) {
          clearTimeout(timer);
          resolve(r);
        }
      }).catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    if (!ui.tracking) await src.stop();
    ui.reading = reading;
    ui.gpsChecked = true;
    ui.gpsCheckedAt = performance.now();
    return reading;
  } finally {
    ui.locating = false;
    render();
  }
}

// ------------------------------------------------------------------ pantallas

function draw() {
  const snap = ui.snap;
  const toastHtml = (list) => list.map((t) => `<p class="toast tone-${t.tone}">${esc(t.text)}</p>`).join('');
  const toasts = `<div class="toasts" aria-live="polite">${toastHtml(ui.toasts)}</div>`;
  let body;
  let below = ''; // lo que va debajo del mapa (solo en la huida y la persecución)
  const home = !snap || !ui.conn?.playerId;
  document.body.classList.toggle('is-home', home);
  const previous = ui.viewReport ? previousReportFor(readLastReport(store), home ? null : snap) : null;
  if (previous) body = archivedReportScreen(previous);
  else if (home) body = homeScreen();
  else if (ui.conn.replaced) body = replacedScreen();
  else if (snap.phase === 'LOBBY') body = lobbyScreen(snap);
  else if (snap.phase === 'COUNTDOWN') body = countdownScreen(snap);
  else if (snap.phase === 'HEAD_START' || snap.phase === 'ACTIVE') ({ top: body, bottom: below } = gameScreen(snap));
  else if (snap.phase === 'FINISHED') body = finishedScreen(snap);
  else body = closedScreen();
  // Redibujar no puede borrar lo que el jugador está escribiendo ni quitarle el foco.
  const typed = new Map([...document.querySelectorAll('#app input[id]:not([type=checkbox]), #app-after input[id]:not([type=checkbox])')].map((i) => [i.id, i.value]));
  const keepFocus = document.activeElement?.id;
  const notice = snap && ui.conn?.playerId && !ui.conn.replaced ? connectionNotice(ui.conn.status, snap.phase) : null;
  const banner = notice ? `<p class="msg danger conn-notice" role="alert">${esc(notice)}</p>` : '';
  // En la huida y la persecución los avisos van en línea, bajo la cabecera de la partida: así nunca tapan
  // el reloj, el rol ni la acción (antes flotaban encima). Solo los dos últimos.
  // Si el jugador ha desplazado la página y el reloj ya no se ve, el aviso flota arriba (allí ya no tapa nada
  // crítico); si no, en línea no se vería.
  const inGame = Boolean(below);
  const hudOffScreen = (document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 1) < 0;
  // En el Mission Report tampoco flotan: tapaban las cifras (p. ej. la captura que acaba la partida).
  const finished = snap?.phase === 'FINISHED' && Boolean(ui.conn?.playerId);
  const inline = (inGame && !hudOffScreen) || finished;
  // Siempre presente en la partida y con altura reservada para un aviso: la región se anuncia (aria-live
  // ya existe cuando llega el texto) y la página no salta, así nadie pulsa un nombre que se ha movido.
  const shown = topToast(ui.toasts);
  const inlineToasts = inline ? `<div class="toasts inline${finished ? ' compact' : ''}" aria-live="polite">${toastHtml(shown ? [shown] : [])}</div>` : '';
  setHtml($app, `<header class="top">${lockup()}${statusDot()}</header>${banner}${finished ? inlineToasts : ''}${body}${finished ? '' : inlineToasts}`);
  setHtml($after, `${below}${inline ? '' : toasts}${overlays()}`);
  for (const [id, value] of typed) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  if (keepFocus) document.getElementById(keepFocus)?.focus();
  syncMap();
  if (ui.sheetFocus) {
    document.getElementById(ui.sheetFocus)?.focus({ preventScroll: true });
    ui.sheetFocus = null;
  }
  if (ui.guideFocus) {
    ui.guideFocus = false;
    document.getElementById('guide-title')?.focus({ preventScroll: true });
  }
}

/** Sustituye el contenido solo si ha cambiado: así un botón no se recrea si nada ha cambiado. */
const drawn = new WeakMap();
function setHtml(el, html) {
  if (drawn.get(el) === html) return;
  drawn.set(el, html);
  el.innerHTML = html;
}

// ------------------------------------------------------------------ mapa

// Un mapa por partida: se crea al entrar en la huida o la persecución, se actualiza con cada redibujado
// (solo capas y marcadores) y se destruye al salir. Si la cartografía no está disponible (sin
// configurar, sin red, sin WebGL o clave rechazada) se usa el radar de siempre: la partida sigue.
const mapState = { ctrl: null, starting: false, failure: null, token: 0 };

const mapVisible = (snap) =>
  Boolean(snap?.config && ui.conn?.playerId && !ui.conn.replaced && (snap.phase === 'HEAD_START' || snap.phase === 'ACTIVE') && me(snap, ui.conn.playerId)?.status !== 'left');

function currentMapModel() {
  const snap = ui.snap;
  const team = me(snap, ui.conn?.playerId)?.team ?? null;
  return mapModel({ snap, team, positions: ui.positions, positionsAt: ui.positionsAt, ping: team === 'hunter' ? livePing() : null, reading: ui.reading, now: serverNow(), nameOf });
}

function syncMap() {
  if (!mapVisible(ui.snap)) return closeMap();
  $mapHost.hidden = false;
  const model = currentMapModel();
  const offline = ui.conn.status !== 'open';
  if (mapState.ctrl) return mapState.ctrl.update(model, { offline });
  if (mapState.failure) return drawRadarFallback(model, offline);
  if (!mapState.starting) void startMap();
}

async function startMap() {
  mapState.starting = true;
  const token = ++mapState.token;
  $mapHost.innerHTML = `<p class="map-status" role="status">${esc(MAP_MESSAGES.loading)}</p>`;
  const config = await loadMapConfig();
  let failure = config.ok ? null : config.reason;
  let lib = null;
  if (!failure) {
    try {
      lib = await loadMapLibre();
    } catch {
      failure = 'library';
    }
  }
  if (token !== mapState.token) return; // la partida terminó mientras se cargaba
  mapState.starting = false;
  if (failure) mapState.failure = failure;
  else if (mapVisible(ui.snap)) {
    mapState.ctrl = createMapController($mapHost, {
      lib,
      styleUrl: config.styleUrl,
      model: currentMapModel(),
      onFail: (reason) => {
        if (token !== mapState.token) return;
        mapState.ctrl?.destroy();
        mapState.ctrl = null;
        mapState.failure = reason;
        render();
      },
    });
  }
  render();
}

function closeMap() {
  if ($mapHost.hidden && !mapState.ctrl && !mapState.starting && !mapState.failure) return;
  mapState.token++;
  mapState.ctrl?.destroy();
  mapState.ctrl = null;
  mapState.starting = false;
  mapState.failure = null;
  $mapHost.replaceChildren();
  $mapHost.classList.remove('is-offline');
  $mapHost.hidden = true;
}

/** Radar SVG de siempre, con el motivo por el que no hay mapa y la opción de reintentarlo. */
function drawRadarFallback(model, offline) {
  $mapHost.classList.toggle('is-offline', offline);
  $mapHost.innerHTML = `<div class="map-fallback">${model ? radarSvg(model) : ''}
    ${offline ? `<p class="map-note warn">${esc(MAP_MESSAGES.offline)}</p>` : ''}
    <p class="map-note">${esc(MAP_MESSAGES[mapState.failure] ?? MAP_MESSAGES.style)}</p>
    <button class="btn btn-ghost btn-small" data-act="retry-map">Reintentar el mapa</button></div>`;
}

// Iconos de los modos (SVG en línea, 24 px; sin imágenes).
const MODE_ICONS = Object.freeze({
  classic: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2"/>',
  infection: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="4.5" cy="6" r="2" fill="currentColor"/><circle cx="19.5" cy="6" r="2" fill="currentColor"/><circle cx="12" cy="21" r="2" fill="currentColor"/><path d="M6 7.5l3.5 2.5M18 7.5l-3.5 2.5M12 15.5V19" stroke="currentColor" stroke-width="1.8"/>',
  fox_hunt: '<path d="M3 3l5 5h8l5-5-1 9-8 9-8-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/>',
});
const MODE_PLAYERS = Object.freeze({ classic: '2–20 jugadores', infection: '4–20 jugadores', fox_hunt: '3–20 jugadores' });

/** A qué campo se refiere un error de la pantalla de inicio (para mostrarlo junto a él). */
function homeErrorField(text) {
  if (/18 años/.test(text)) return 'adult';
  if (/nombre/i.test(text)) return 'name';
  if (/servidor/i.test(text) && isApp()) return 'server';
  if (/código|sala|partida ya ha empezado|Este móvil ya está/i.test(text)) return 'code';
  return 'form';
}

function homeScreen() {
  const resuming = ui.conn?.session && ui.conn.status !== 'closed';
  if (resuming) return `<section class="hero home-hero" role="status"><p class="kicker"><span class="blip" aria-hidden="true"></span>Recuperando tu partida…</p></section>`;
  const needsServer = isApp() || !/^https?:$/.test(location.protocol);
  const invite = ui.inviteCode;
  const err = ui.homeError ? { field: homeErrorField(ui.homeError), text: ui.homeError } : null;
  const errHtml = (field) => (err?.field === field ? `<p class="msg danger field-error" id="err-${field}" role="alert">${esc(err.text)}</p>` : '');
  const invalid = (field) => (err?.field === field ? ` aria-invalid="true" aria-describedby="err-${field}"` : '');
  const busy = ui.entering;
  const mode = MODES[ui.draft.mode] ?? MODES.classic;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  // Solo modos jugables (D-057): nada de «Próximamente».
  const modes = invite
    ? ''
    : `<fieldset class="modes"><legend class="h-sec">Modo de juego</legend>
      <div class="mode-strip">${Object.values(MODES)
        .map(
          (m) => `<label class="mode m-${m.id}"><input type="radio" name="home-mode" id="m-${m.id}" value="${m.id}"${m.id === mode.id ? ' checked' : ''}>
          <span class="mode-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${MODE_ICONS[m.id]}</svg></span><span class="mode-name">${esc(m.name)}</span><span class="mode-meta">${MODE_PLAYERS[m.id]}</span></label>`,
        )
        .join('')}</div>
      <div class="mode-detail m-${mode.id}"><p aria-live="polite"><strong>${esc(mode.name)}</strong> <span>${esc(mode.line)}</span></p>
        <button class="link-btn" type="button" data-act="rules" aria-haspopup="dialog">Reglas de ${esc(mode.name)}</button></div></fieldset>`;
  const createBtn = invite
    ? `<p class="secondary-note">¿Prefieres organizar tú? <button class="link-btn" type="submit" data-act="create"${busy ? ' disabled' : ''}>Crear otra partida</button></p>`
    : `<button class="btn btn-primary btn-hero" type="submit" data-act="create"${busy ? ' disabled' : ''}${busy === 'create' ? ' aria-busy="true"' : ''}>${
        busy === 'create' ? '<span class="spin" aria-hidden="true"></span>Creando la sala…' : 'Crear partida <span class="arrow" aria-hidden="true">→</span>'
      }</button>
      <p class="secondary-note">Recibirás un código y un QR para invitar al grupo.</p>`;
  return `<div class="city" aria-hidden="true"></div>
  <section class="hero home-hero">
    <p class="kicker"><span class="blip" aria-hidden="true"></span>Escondite urbano · GPS real</p>
    <h1 class="slogan" lang="en">RUN. HIDE.<span>STAY AHEAD.</span></h1>
    <p class="lead"><b>Unos huyen, otros cazan.</b> La ciudad es el tablero y cada jugador lleva su móvil.</p>
    ${invite ? '<button class="link-btn" type="button" data-act="rules" aria-haspopup="dialog">Cómo se juega y reglas</button>' : ''}
  </section>
  <form class="home-action" id="home-form" autocomplete="off" novalidate>
    ${offline ? '<p class="msg danger" role="alert">Sin conexión a internet: la necesitas para crear o unirte a una partida.</p>' : ''}
    <section class="card stack home-card" aria-label="${invite ? 'Entrar en la partida' : 'Crear partida'}">
      ${invite ? `<p class="ticket">Te han invitado a la sala <strong class="num">${esc(invite)}</strong>.</p>` : ''}
      ${modes}
      <label class="field">Tu nombre<input id="f-name" name="name" maxlength="20" minlength="2" required autocomplete="nickname" enterkeyhint="done" value="${esc(store.getItem('outrun.name') ?? '')}" placeholder="Cómo te verán los demás"${invalid('name')}></label>
      ${errHtml('name')}
      ${needsServer ? `<label class="field">Servidor<input id="f-server" name="server" inputmode="url" value="${esc(serverInput())}" placeholder="tu-tunel.trycloudflare.com"${invalid('server')}></label>${errHtml('server')}` : ''}
      ${adultDeclared() ? '' : `<label class="check home-check${err?.field === 'adult' ? ' is-invalid' : ''}"><input type="checkbox" id="f-adult"${ui.adult ? ' checked' : ''}${invalid('adult')}><span>Tengo 18 años o más<small>THE OUTRUN es solo para adultos. Se pregunta una vez en este móvil.</small></span></label>`}
      ${errHtml('adult')}
      ${invite ? '' : createBtn}
      ${errHtml('form')}
    </section>
    <section class="card stack home-card join${invite ? ' is-invited' : ''}" aria-labelledby="join-h">
      <h2 id="join-h" class="h-sec">${invite ? 'Entra en la sala' : '¿Ya tienes código?'}</h2>
      <div class="join-row">
        <input id="f-code" name="code" maxlength="200" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Código" aria-label="Código de la sala (6 letras o números)" aria-describedby="code-hint${err?.field === 'code' ? ' err-code' : ''}" value="${esc(invite ?? '')}"${err?.field === 'code' ? ' aria-invalid="true"' : ''}>
        <button class="btn ${invite ? 'btn-primary' : 'btn-outline'}" type="button" data-act="join"${busy ? ' disabled' : ''}${busy === 'join' ? ' aria-busy="true"' : ''}>${busy === 'join' ? 'Entrando…' : 'Unirme'}</button>
      </div>
      ${errHtml('code')}
      <p id="code-hint" class="hint">${invite ? 'El código ya está puesto. Escribe tu nombre y pulsa «Unirme».' : '6 letras o números. También puedes pegar el enlace que te han enviado o escanear el QR con la cámara del móvil.'}</p>
    </section>
    ${invite ? createBtn : ''}
  </form>
  ${previousReportButton(null)}
  <section class="card how" aria-labelledby="how-h">
    <h2 id="how-h" class="h-sec">Cómo se juega</h2>
    <button class="btn btn-outline btn-small guide-open" type="button" data-act="guide-open" aria-haspopup="dialog">Guía rápida con capturas</button>
    <ol class="steps">
      <li><span><b>Crea la sala y comparte el código</b>Por enlace, QR o de palabra. El anfitrión elige el modo y marca la zona y el punto de encuentro.</span></li>
      <li><span><b>Los fugitivos salen con ventaja</b>Los cazadores esperan en el punto de encuentro. Cada uno descubre su rol al terminar la cuenta atrás.</span></li>
      <li><span><b>Pistas, persecución y toque suave</b>Los cazadores reciben la última posición conocida cada pocos minutos. La captura se confirma en la app.</span></li>
    </ol>
    <h3 class="h-sec">Antes de salir</h3>
    <ul class="facts">
      <li><b>2–20 jugadores</b>Mayores de 18</li>
      <li><b>Móvil con GPS</b>y datos móviles</li>
      <li><b>Batería cargada</b>la partida usa el GPS</li>
      <li><b>Zona segura</b>sin calzadas ni vías</li>
    </ul>
  </section>
  <p class="foot">Mayores de 18 · Sin chat ni cuentas · Tu ubicación solo se comparte durante la partida, según tu rol, y se borra al terminar.${isApp() ? ' · <a href="diagnostic.html">Diagnóstico GPS</a>' : ''}</p>`;
}

/** Reglas antes de crear la sala: las del modo elegido, con los valores por defecto (el anfitrión los cambia). */
function rulesSheet() {
  const d = ui.draft;
  const rules = briefing({ mode: d.mode, durationMs: d.durationMin * 60_000, headStartMs: d.headStartMin * 60_000, pingIntervalMs: d.pingMin * 60_000, zone: [{ fromOffsetMs: 0, radiusM: d.radiusM }], safetyChecklistConfirmed: false });
  return `<div class="overlay sheet rules-sheet" role="dialog" aria-label="Cómo se juega">
    <h2>${esc(modeInfo({ mode: d.mode }).name)}: cómo se juega</h2>
    <p class="hint">Con los valores por defecto. El anfitrión los ajusta en la sala y todos ven allí las reglas definitivas.</p>
    <dl class="rules-list">${rules.map((r) => `<dt>${esc(r.title)}</dt><dd>${esc(r.text)}</dd>`).join('')}</dl>
    <button class="btn btn-primary" data-act="close-sheet">Entendido</button></div>`;
}

// Sala guiada (ciclo UX 11/2026): pasos visibles y una única acción principal en cada momento. El
// anfitrión configura (la zona se centra sola al entrar), invita y empieza; la lista de seguridad y su
// propio «listo» se confirman en la hoja de «Empezar partida». Los jugadores ven el resumen, su «Estoy
// listo» y qué falta. Quién está listo lo decide el motor: aquí solo se muestra.

function playerRow(p, snap, isHost) {
  const host = p.id === snap.hostId;
  const mine = p.id === ui.conn.playerId;
  const st = playerReadiness(p, snap);
  // Asignar rol y expulsar van en una fila secundaria, solo con «Gestionar jugadores» abierto.
  const tools = isHost && ui.manage && p.status === 'lobby'
    ? `<span class="ptools"><select class="mini" data-assign="${esc(p.id)}" aria-label="Rol de ${esc(p.name)}">
        ${['random', 'hunter', 'runner'].map((v) => `<option value="${v}"${(p.teamPref ?? 'random') === v ? ' selected' : ''}>${{ random: 'Sorteo', hunter: 'Cazador', runner: snap.config?.mode === 'fox_hunt' ? 'Zorro' : 'Fugitivo' }[v]}</option>`).join('')}
      </select>${host ? '' : `<button class="btn btn-ghost btn-small" data-kick="${esc(p.id)}" aria-label="Expulsar a ${esc(p.name)}">Expulsar</button>`}</span>`
    : '';
  return `<li class="player st-${st.tone}${p.connected ? '' : ' off'}">
    <span class="dot${p.connected ? ' on' : ''}" aria-hidden="true"></span>
    <span class="pname">${esc(p.name)}${mine ? ' <em>(tú)</em>' : ''}${host ? ' <span class="tag">Anfitrión</span>' : ''}<small class="preason">${esc(st.reason)}</small></span>
    <span class="pstate${p.ready ? ' ready' : ''}">${esc(st.text)}</span>${tools}</li>`;
}

/** Pasos de la sala: dónde está el jugador y qué viene después. */
function stepsBar(snap) {
  const steps = lobbySteps(snap, ui.conn.playerId);
  const current = steps.find((s) => s.state === 'current');
  return `<ol class="lobby-steps" aria-label="Pasos para empezar${current ? `. Ahora: ${esc(current.label)}` : ''}">${steps
    .map((s, i) => `<li class="lobby-step is-${s.state}"${s.state === 'current' ? ' aria-current="step"' : ''}><span class="lobby-step-n" aria-hidden="true">${s.state === 'done' ? '✓' : i + 1}</span>${esc(s.label)}</li>`)
    .join('')}</ol>`;
}

function playersCard(snap, isHost) {
  const players = snap.players.filter((p) => p.status === 'lobby' || p.status === 'invited');
  const progress = readyProgress(snap);
  return `<section class="card">
      <h2>Jugadores <span class="count">${players.length}/20</span></h2>
      <div class="progress" role="status" aria-live="polite">
        <p class="progress-text"><b class="num">${esc(progress.text)}</b>${progress.total ? '' : ' · comparte el código'}</p>
        <span class="progress-bar" style="--p:${progress.ratio}" aria-hidden="true"></span>
      </div>
      <ul class="players">${players.map((p) => playerRow(p, snap, isHost)).join('')}</ul>
      ${isHost ? `<button class="btn btn-ghost btn-small" data-act="manage" aria-expanded="${ui.manage}">${ui.manage ? 'Cerrar la gestión de jugadores' : 'Gestionar jugadores (roles, expulsar)'}</button>
      ${ui.manage ? `<p class="hint">${esc(lobbyRolesHint(snap.config))}</p>` : ''}` : ''}
    </section>`;
}

function lobbyScreen(snap) {
  const self = me(snap, ui.conn.playerId);
  const isHost = snap.hostId === ui.conn.playerId;
  const code = ui.conn.code ?? '';
  const night = nightNotice(new Date()); // hora local de este móvil (AC-B3)
  const invited = self?.status === 'invited';
  const notice = ui.lobbyNotice && !self?.ready ? `<p class="msg warn" role="status">${esc(ui.lobbyNotice)}</p>` : '';
  const invite = `<section class="card code-card">
      <p class="label">Invita · código de la sala</p>
      <p class="code num">${esc(code)}</p>
      <div class="row2">
        <button class="btn btn-outline btn-small" data-act="share">Compartir enlace</button>
        <button class="btn btn-outline btn-small" data-act="qr"${currentInvite() ? '' : ' disabled'}>Mostrar QR</button>
      </div>
      ${isHost ? `<button class="btn btn-ghost btn-small" data-act="new-code">${ui.confirmNewCode ? 'Toca otra vez: el código actual dejará de servir' : 'Cambiar el código'}</button>` : ''}
    </section>`;
  const nightHtml = night ? `<p class="msg warn" role="note">${esc(night)}</p>` : '';
  if (isHost) {
    // Con todo listo, «Empezar partida» queda fijo abajo (la única acción que falta); con bloqueos, en su
    // sitio: fijo taparía la configuración mientras se cambia.
    const blockers = startBlockers(snap, { forHost: true, atStart: true });
    return `${stepsBar(snap)}${notice}
    ${hostConfig(snap)}
    ${invite}
    ${playersCard(snap, true)}
    <section class="card stack start-card${blockers.length ? '' : ' dock'}">
      ${blockers.length
        ? `<div class="blockers" aria-live="polite"><p class="label">Para empezar falta</p>${blockers.map((b) => `<p class="msg">${esc(b)}</p>`).join('')}</div>`
        : '<p class="msg ok" role="status">Todo listo. Al empezar confirmarás la lista de seguridad y se comprobará tu GPS.</p>'}
      <button class="btn btn-primary btn-big" data-act="start"${blockers.length || ui.starting ? ' disabled' : ''}>Empezar partida</button></section>
    ${nightHtml}
    ${rulesCard(snap, false)}
    ${previousReportButton(snap)}
    ${guideButton()}
    <button class="btn btn-ghost" data-act="leave">Salir de la sala</button>`;
  }
  const blockers = startBlockers(snap, { forHost: false, atStart: true });
  const btn = readyButton(snap, ui.conn.playerId, { locating: ui.locating });
  const rows = configSummary(snap.config);
  const mine = invited
    ? '<button class="btn btn-primary btn-big" data-act="join_rematch">Unirme a la revancha</button>'
    : `<section class="card stack ready-card">
      <h2>Tu preparación</h2>
      <button class="btn ${btn.primary ? 'btn-primary btn-big' : 'btn-outline'}" data-act="ready"${btn.disabled ? ' disabled' : ''}>${esc(btn.label)}</button>
      ${ui.readyError ? `<p class="msg danger" role="alert">${esc(ui.readyError)}</p>` : ''}
      ${!snap.config
        ? '<p class="hint">Cuando el anfitrión fije la zona podrás confirmar. Así no tendrás que hacerlo dos veces.</p>'
        : !self?.ready && !ui.gpsChecked ? '<p class="hint">Al pulsar «Estoy listo» se comprueba tu GPS. La ubicación solo se usa durante la partida y se borra al terminar.</p>' : ''}
    </section>`;
  return `${stepsBar(snap)}${notice}
    ${mine}
    <section class="card"><h2>Partida</h2>
      ${rows ? summaryList(rows) : '<p class="line muted" role="status">El anfitrión está fijando la zona de juego…</p>'}
      ${blockers.length
        ? `<div class="blockers" aria-live="polite"><p class="label">Para empezar falta</p>${blockers.map((b) => `<p class="msg">${esc(b)}</p>`).join('')}</div>`
        : '<p class="msg ok" role="status">Todo listo: falta que el anfitrión pulse «Empezar partida».</p>'}
    </section>
    ${playersCard(snap, false)}
    ${invite}
    ${nightHtml}
    ${rulesCard(snap, false)}
    ${previousReportButton(snap)}
    ${guideButton()}
    <button class="btn btn-ghost" data-act="leave">Salir de la sala</button>`;
}

/** Resumen de la configuración como lista legible (concepto, valor y su explicación breve). */
// El anfitrión lo ve compacto (las explicaciones las tiene al desplegar «Cambiar»); los jugadores, explicado.
function summaryList(rows, notes = true) {
  return `<dl class="cfg-summary">${rows.map((r) => `<div class="cfg-row"><dt>${esc(r.label)}</dt><dd><b>${esc(r.value)}</b>${notes ? `<small>${esc(r.note)}</small>` : ''}</dd></div>`).join('')}</dl>`;
}

/** Reglas de la partida, visibles para todos antes de empezar (Plan Maestro §7, reglas/briefing). */
function rulesCard(snap, open = true) {
  const rules = briefing(snap.config);
  if (!rules) return '';
  return `<details class="card rules"${open ? ' open' : ''}><summary><h2>Reglas de la partida</h2></summary>
    <dl>${rules.map((r) => `<dt>${esc(r.title)}</dt><dd>${esc(r.text)}</dd>`).join('')}</dl></details>`;
}

function hostConfig(snap) {
  const d = ui.draft;
  if (snap.config) {
    d.mode = snap.config.mode ?? 'classic';
    d.durationMin = snap.config.durationMs / 60_000;
    d.headStartMin = snap.config.headStartMs / 60_000;
    d.pingMin = snap.config.pingIntervalMs / 60_000;
    d.radiusM = snap.config.zone[0].radiusM;
    d.center = snap.config.zone[0].center;
    d.safety = snap.config.safetyChecklistConfirmed;
  }
  const centerLabel = ui.locating ? 'Buscando tu posición…' : d.center ? 'Volver a centrar' : 'Centrar la zona aquí';
  if (!snap.config) {
    // Sin configuración: la zona se centra sola en la posición del anfitrión (maybeAutoCenter). Si el GPS
    // falla, se explica por qué y queda el botón para reintentarlo.
    const failed = ui.centerError && !ui.locating;
    return `<section class="card stack">
      <h2>Configurar la partida</h2>
      ${failed
        ? `<p class="msg danger" role="alert">${esc(ui.centerError)}</p>
      <button class="btn btn-primary" data-act="center">${centerLabel}</button>`
        : '<p class="line" role="status">Buscando tu posición para centrar la zona… Colócate en el punto de encuentro.</p>'}
      <p class="hint">La zona se centra en tu posición: también es el punto de encuentro y la salida de los cazadores. Después podrás cambiar el modo y los tiempos.</p>
    </section>`;
  }
  const othersReady = snap.players.some((p) => p.status === 'lobby' && p.id !== snap.hostId && p.ready);
  const sel = (id, values, current, unit) =>
    `<select id="${id}" data-cfg>${values.map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>${unit === 'm' ? metres(v) : `${v} ${unit}`}</option>`).join('')}</select>`;
  const mode = MODES[d.mode] ?? MODES.classic;
  const body = ui.editConfig
    ? `<div class="cfg-edit stack">
      <label class="field">Modo de juego<select id="c-mode" data-cfg>${Object.values(MODES)
        .map((m) => `<option value="${m.id}"${m.id === mode.id ? ' selected' : ''}>${esc(m.name)}${m.minPlayers > 2 ? ` (mín. ${m.minPlayers})` : ''}</option>`)
        .join('')}</select></label>
      <p class="hint mode-line">${esc(mode.line)}</p>
      <div class="grid2">
        <label class="field">Radio inicial${sel('c-radius', RADII.includes(d.radiusM) ? RADII : [...RADII, d.radiusM].sort((a, b) => a - b), d.radiusM, 'm')}</label>
        <label class="field">Persecución${sel('c-duration', DURATIONS, d.durationMin, 'min')}</label>
        <label class="field">Huida${sel('c-head', HEAD_STARTS, d.headStartMin, 'min')}</label>
        <label class="field">Pistas cada${sel('c-ping', [...new Set([...pingChoices(d.durationMin), d.pingMin])].sort((a, b) => a - b), d.pingMin, 'min')}</label>
      </div>
      <p class="hint">La huida es la ventaja para esconderse; las pistas envían a los cazadores la posición de los fugitivos; la zona se cierra cada 5 min.</p>
      ${othersReady ? '<p class="msg warn">Cambiar el modo, la zona o los tiempos quita el «listo» a los demás: tendrán que confirmarlo otra vez.</p>' : ''}
      <button class="btn btn-outline" data-act="edit-config" aria-expanded="true">Hecho</button>
    </div>`
    : `${summaryList(configSummary(snap.config), false)}
    <button class="btn btn-outline btn-small" data-act="edit-config" aria-expanded="false">Cambiar</button>`;
  return `<section class="card stack">
    <h2>Partida</h2>
    ${body}
    <button class="btn btn-ghost btn-small" data-act="center"${ui.locating ? ' disabled' : ''}>${centerLabel}</button>
    ${ui.centerError ? `<p class="msg danger" role="alert">${esc(ui.centerError)}</p>` : ''}
    <p class="hint">Zona centrada en tu posición: es el punto de encuentro. Recentrar unos metros no obliga a nadie a confirmar otra vez; si la zona acaba a 50 m o más de donde estaba cuando alguien se marcó listo, tendrá que confirmarlo de nuevo.</p>
  </section>`;
}

/** Hoja de «Empezar partida»: resumen breve y la lista de seguridad que el anfitrión confirma aquí. */
function startSheet(snap) {
  const rows = startSummary(snap);
  return `<div class="overlay sheet start-sheet" role="dialog" aria-modal="true" aria-labelledby="start-title">
    <h2 id="start-title" tabindex="-1">Antes de empezar</h2>
    <dl class="start-summary">${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>
    <div class="safety">
      <p class="label">Lista de seguridad</p>
      <ul>${SAFETY_CHECKLIST.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <label class="home-check"><input type="checkbox" id="start-safety"${ui.startAck ? ' checked' : ''}><span>La he revisado con el grupo</span></label>
    </div>
    ${ui.startError ? `<p class="msg danger" role="alert">${esc(ui.startError)}</p>` : ''}
    <button class="btn btn-primary btn-big" data-act="start-now"${!ui.startAck || ui.starting ? ' disabled' : ''}>${esc(ui.starting ?? 'Empezar ya')}</button>
    <button class="btn btn-ghost" data-act="close-sheet"${ui.starting ? ' disabled' : ''}>Volver a la sala</button></div>`;
}

function countdownScreen(snap) {
  const left = Math.max(0, snap.countdownEnd - serverNow());
  return `<section class="countdown" aria-live="assertive">
    <p class="label">La partida empieza en</p>
    <p class="big num">${Math.max(1, Math.ceil(left / 1000))}</p>
    <p class="lead">Tu rol aparecerá al terminar. Nadie lo sabe todavía.</p></section>
    ${sharingPill()}
    ${leaveGameButton()}`;
}

/** Si este móvil comparte su ubicación ahora mismo (Plan Maestro §4.5). */
function sharingPill() {
  const s = sharingStatus(ui.tracking, Boolean(ui.location?.uploading), ui.locationDenied);
  const denied = wantsTracking() ? locationDeniedNotice(ui.locationDenied) : null;
  const screen = wantsTracking() ? screenNotice({ app: isApp(), held: ui.screenHeld }) : null;
  return `<p class="sharing${s.on ? ' on' : ''}" role="status">${esc(s.text)}</p>${
    screen ? `<p class="${screen.warn ? 'msg warn screen-notice' : 'hint screen-notice'}">${esc(screen.text)}</p>` : ''
  }${
    denied ? `<div class="msg danger" role="alert"><p>${esc(denied)}</p><button class="btn btn-outline btn-small" data-act="retry-location">Reintentar</button></div>` : ''
  }`;
}

/**
 * Plan Maestro §4.5: se puede abandonar la partida en cualquier momento, y al salir se deja de
 * compartir la ubicación. Doble toque para no salir por error.
 */
/** Guía rápida, a petición (nunca se abre sola). En la partida abre en el paso que más ayuda ahora. */
function guideButton(label = 'Guía rápida') {
  return `<button class="btn btn-ghost btn-small guide-open" type="button" data-act="guide-open" aria-haspopup="dialog">${esc(label)}</button>`;
}

/** Cierra la guía sin mover el foco: la cierra la partida (cambio de fase, tarjeta del rol), no el jugador. */
function dropGuide() {
  ui.guide = null;
  ui.guideOpener = null;
  ui.guideFocus = false;
}

/** Cierra la guía y devuelve el foco al botón que la abrió (o al primero de la guía que haya). */
function closeGuide() {
  if (!ui.guide) return;
  const opener = ui.guideOpener;
  ui.guide = null;
  ui.guideOpener = null;
  draw();
  (opener?.isConnected ? opener : document.querySelector('[data-act="guide-open"]'))?.focus();
}

/** Paso de la guía para la ayuda de la partida: el problema actual si lo hay; si no, la captura. */
function guideTopic(snap) {
  if (ui.locationDenied) return 'location';
  if (ui.conn && ui.conn.status !== 'open') return 'connection';
  return snap?.phase === 'HEAD_START' ? 'roles' : 'capture';
}

function leaveGameButton() {
  return `<button class="btn btn-ghost" data-act="leave-game">${ui.confirmLeave ? 'Toca otra vez: saldrás y dejarás de compartir tu ubicación' : 'Abandonar la partida'}</button>`;
}

function gameScreen(snap) {
  const self = me(snap, ui.conn.playerId);
  if (self?.status === 'left') return { top: outOfGameScreen(self), bottom: '' };
  const team = self?.team ?? null;
  const left = phaseDeadline(snap) - serverNow();
  const head = snap.phase === 'HEAD_START';
  const captured = self?.status === 'captured';
  let call;
  const fox = snap.config?.mode === 'fox_hunt';
  if (captured) call = 'Estás capturado: ahora eres espectador (con 60 s de retraso).';
  else if (fox) call = head
    ? (team === 'hunter' ? 'Espera en la zona de salida hasta que termine la huida.' : '¡Huye! Verás a los cazadores en el mapa.')
    : (team === 'hunter' ? 'Caza al zorro. Cada pista te dice dónde estaba.' : 'Que no te pillen: ves a los cazadores en directo. No salgas de la zona.');
  else if (head) call = team === 'hunter' ? 'Espera en la zona de salida hasta que termine la huida.' : '¡Huye! Escóndete dentro de la zona.';
  else call = team === 'hunter' ? 'Caza a los fugitivos. Usa las pistas.' : 'Que no te pillen. No salgas de la zona.';
  // Caza del zorro: los roles son públicos tras la cuenta atrás; el cazador ve quién es el zorro.
  const foxIs = captured ? null : foxLine(snap, ui.conn.playerId, nameOf);
  if (foxIs) call = `${foxIs}. ${call}`;
  const gps = gpsStatus(ui.reading, performance.now());
  const now = serverNow();
  // Bajo el reloj: qué pasa cuando llegue a cero (huida) o cuándo llega la próxima pista (persecución).
  let next = '';
  if (head && !captured) {
    next = `<div class="hud-next"><span>${team === 'hunter' ? 'Al llegar a 0:00 sales a cazar' : 'Al llegar a 0:00 empiezan a buscarte'}</span></div>`;
  } else if (!captured) {
    const pc = pingCountdown(snap, team, now);
    if (pc) {
      next = `<div class="hud-next${pc.imminent ? ' is-imminent' : ''}"><span>${esc(pc.text)}</span>${pc.leftMs === null ? '' : `<b class="num">${clock(pc.leftMs)}</b>`}${
        pc.leftMs === null ? '' : `<i class="meter" style="--p:${pc.progress.toFixed(3)}" aria-hidden="true"></i>`
      }</div>`;
    }
  }
  // El fugitivo ve durante 30 s que su posición acaba de llegar a los cazadores (además del aviso).
  const sentAgo = ui.sentAt !== null && team === 'runner' && !captured ? now - ui.sentAt : null;
  const exposure = sentAgo !== null && sentAgo < 30_000
    ? '<p class="exposure">Los cazadores acaban de recibir tu posición. Muévete.</p>'
    : '';
  // Encima del mapa: fase, reloj, rol y avisos. Debajo: GPS, acciones y pistas. El mapa va en #map-host.
  const top = `<section class="hud t-${team ?? 'x'}">
      <div><p class="label">${esc(PHASE_TEXT[snap.phase])}</p><p class="timer num">${clock(left)}</p></div>
      <div class="role-chip t-${team ?? 'x'}">${team ? teamName(team, snap.config) : '—'}</div>
      ${next}
    </section>
    ${exposure}
    <p class="callout${captured ? ' muted' : ''}">${esc(call)}</p>
    ${zoneInfo(snap, now)}
    ${awayLine(snap)}
    ${ui.startZoneWarning ? '<p class="msg danger">Te has alejado de la zona de salida. Vuelve hasta que acabe la huida.</p>' : ''}
    ${ui.zoneWarning ? `<p class="msg danger">Estás fuera de la zona. Vuelve antes de ${clock(ui.zoneWarning.exposedAt - serverNow())} o los cazadores te verán.</p>` : ''}`;
  // La pista, justo bajo el mapa: es lo que el cazador consulta (el GPS y la leyenda, después).
  const bottom = `${team === 'hunter' && !captured && snap.phase === 'ACTIVE' ? pingList(livePing(), snap) : ''}
    <section class="card map-meta"><p class="gps tone-${gps.tone}">${esc(gps.text)}</p>${sharingPill()}${mapLegend(team, captured, snap.config?.mode === 'fox_hunt', foxIs)}</section>
    ${!captured && snap.phase === 'ACTIVE' && !snap.pendingClaimForMe ? actions(snap, team) : ''}
    <p class="foot num">${snap.config?.mode === 'infection' ? 'Infectados' : 'Capturas'}: ${snap.captures.length}</p>
    ${guideButton('Ayuda: cómo se juega')}
    ${snap.hostId === ui.conn.playerId ? `<button class="btn btn-ghost" data-act="end">${ui.confirmEnd ? 'Toca otra vez para terminar la partida' : 'Terminar partida (anfitrión)'}</button>` : ''}
    ${leaveGameButton()}`;
  return { top, bottom };
}

/** Radio en metros, con punto de millar (1.000 m). */
function metres(m) {
  return `${String(Math.round(m)).replace(/\B(?=(\d{3})+$)/g, '.')} m`;
}

/** Zona dinámica bajo la llamada: tamaño actual, hasta dónde se cierra y cuánto falta. */
function zoneInfo(snap, now) {
  const z = zoneLine(snap, now);
  if (!z) return '';
  return `<p class="zone-line${z.closing ? ' is-closing' : ''}"><span>${esc(z.text)}</span>${z.leftMs === null ? '' : ` <b class="num">${clock(z.leftMs)}</b>`}</p>`;
}

/** Qué significa cada marca del mapa, según lo que este jugador puede llegar a ver. */
function mapLegend(team, captured, fox = false, foxIs = null) {
  // El capturado ya no comparte su ubicación y ve a todos en gris (sin equipo) con 60 s de retraso.
  // El zorro juega solo: no tiene «tu equipo».
  const alone = fox && team === 'runner';
  const items = captured
    ? [['mate', 'Jugadores (hace 60 s)', 'x'], ['meeting', 'Encuentro']]
    : [['me', 'Tú', team], ...(alone ? [] : [['mate', 'Tu equipo', team]]), ['meeting', 'Encuentro']];
  if (team === 'hunter' && !captured) items.push(['ping', 'Última pista (posición antigua)'], ['exposed', fox ? `${foxIs ? `Zorro (${foxIs.replace(/^El zorro es /, '')})` : 'Zorro'} fuera de la zona` : 'Fugitivo fuera de la zona']);
  if (team === 'runner' && !captured && fox) items.push(['seen', 'Cazadores (en directo)']);
  return `<p class="legend">${items.map(([k, label, t]) => `<span class="lg lg-${k}${t !== undefined ? ` t-${t ?? 'x'}` : ''}">${esc(label)}</span>`).join('')}</p>`;
}

function actions(snap, team) {
  const others = rivals(snap, ui.conn.playerId);
  if (team === 'hunter') {
    // Una reclamación vencida sin aviso de cierre (p. ej., perdido en una reconexión) no bloquea más capturas.
    if (ui.claimSent && ui.claimSent.expiresAt < serverNow() - 3_000) ui.claimSent = null;
    if (ui.claimSent) {
      return `<section class="card dock"><p class="line">Esperando a que ${esc(nameOf(ui.claimSent.runnerId))} confirme (${clock(ui.claimSent.expiresAt - serverNow())}).</p></section>`;
    }
    // Infección: el recién convertido no puede reclamar capturas hasta `canTagFrom` (lo dice el servidor).
    const wait = snap.canTagFrom ? snap.canTagFrom - serverNow() : 0;
    if (wait > 0) {
      return `<section class="card dock"><p class="line">Acabas de convertirte: podrás capturar en <b class="num">${clock(wait)}</b>.</p></section>`;
    }
    // Compacta: fija abajo no debe tapar el mapa. Cómo se captura está en las reglas y en la tarjeta del rol.
    return `<section class="card stack dock"><h2>¿Has pillado a alguien? Pulsa su nombre</h2>
      <div class="chips">${others.map((p) => `<button class="btn btn-primary btn-small" data-claim="${esc(p.id)}">${esc(p.name)}</button>`).join('') || `<p class="hint">${snap.config?.mode === 'fox_hunt' ? 'El zorro ya no está libre.' : 'No quedan fugitivos libres.'}</p>`}</div></section>`;
  }
  return `<section class="card dock"><button class="btn btn-danger" data-act="selftag">Me han pillado</button></section>`;
}

/**
 * Última pista sin los fugitivos que ya no están libres: el motor la conserva tal cual hasta la siguiente,
 * pero un capturado (o quien abandonó) ya no es alguien a quien buscar.
 */
function livePing() {
  if (!ui.ping?.entries) return null;
  const free = (id) => ui.snap?.players.find((p) => p.id === id)?.status === 'active';
  return { ...ui.ping, entries: ui.ping.entries.filter((e) => free(e.runnerId)) };
}

function pingList(ping, snap) {
  if (!ping) {
    // Sin pista aún: que el cazador sepa que llegará sola y cuándo (lo dice el reloj de arriba). Un
    // convertido no recibe la anterior a su conversión: para él es «la próxima», no «la primera».
    const wait = pingWaitText(snap);
    return wait ? `<section class="card pings-card"><h2>Pistas</h2><p class="hint">${esc(wait)}</p></section>` : '';
  }
  const since = serverNow() - ping.at;
  return `<section class="card pings-card"><h2>Pista nº ${esc(ping.pingNo)} <span class="count num">llegó ${esc(ago(since))}</span></h2>
    <p class="hint">Es dónde estaba ${snap.config?.mode === 'fox_hunt' ? 'el zorro' : 'cada fugitivo'} al enviarse la pista, no dónde está ahora.</p>
    <ul class="pings">${ping.entries
      .map((e) => `<li><b>${esc(nameOf(e.runnerId))}</b> <span class="muted">${e.position ? `posición de ${ago(e.ageMs + since)}` : 'sin señal: no aparece en el mapa'}${e.position && e.availability !== 'CURRENT' ? ' · imprecisa o antigua' : ''}</span></li>`)
      .join('') || `<li class="muted">No queda ningún fugitivo libre en esta pista.</li>`}</ul></section>`;
}

/** Mission Report (report-view.js): el informe común, «Tu partida» y el historial de este móvil (stats.js). */
function finishedScreen(snap) {
  return missionReportScreen(snap, { myId: ui.conn.playerId, nameOf, stats: readStats(store), confirmRematch: ui.confirmRematch });
}

/** El informe guardado de la partida anterior (tras la revancha o al volver al inicio): ver, compartir, volver. */
function archivedReportScreen(last) {
  return missionReportScreen(last.snap, { myId: last.myId, stats: readStats(store), archived: true });
}

/** Acceso al informe guardado: en la sala de la revancha y en el inicio. */
function previousReportButton(snap) {
  const last = previousReportFor(readLastReport(store), snap);
  if (!last) return '';
  const label = snap?.roomId === last.snap.roomId ? `Ver el informe de la partida anterior (${last.snap.gameNo})` : 'Ver el informe de tu última partida';
  return `<button class="btn btn-outline btn-small" type="button" data-act="open-report">${esc(label)}</button>`;
}

/** D-057: quién lleva más de 30 s sin dar señales (sin equipo ni desde cuándo: lo ven todos igual). */
function awayLine(snap) {
  const away = snap.players.filter((p) => p.away && p.status === 'active' && p.id !== ui.conn.playerId);
  if (!away.length) return '';
  return `<p class="msg warn presence" role="status">Sin conexión: ${away.map((p) => esc(p.name)).join(', ')}. Si no vuelven en 5 min, quedan fuera de la partida.</p>`;
}

/** La misma sesión está abierta en otra pestaña o ventana: esta se para hasta que el jugador decida. */
function replacedScreen() {
  return `<section class="card stack"><h2>La partida está abierta en otra pestaña</h2>
    <p class="line">Solo una pantalla puede jugar a la vez. Cierra la otra pestaña o ventana, o sigue aquí: la otra se desconectará.</p>
    <button class="btn btn-primary" data-act="play-here">Jugar en esta pestaña</button></section>`;
}

/** D-057: quedó fuera de la partida por pasar 5 min sin conexión (o salió y sigue mirando). */
function outOfGameScreen(self) {
  const why = self.leftReason === 'timeout'
    ? 'Tu móvil pasó más de 5 min sin conexión y la partida siguió sin ti, como si hubieras abandonado.'
    : 'Has salido de esta partida.';
  return `<section class="card stack"><h2>Estás fuera de la partida</h2>
    <p class="line">${esc(why)}</p>
    <p class="hint">Cuando termine verás el resultado aquí y podrás unirte a la revancha.</p>
    <button class="btn btn-ghost" data-act="leave">Salir de la sala</button></section>`;
}

function closedScreen() {
  return `<section class="card"><h2>La sala se ha cerrado</h2><p class="line">Crea una nueva o únete con otro código.</p>
    <button class="btn btn-primary" data-act="home">Volver al inicio</button></section>`;
}

/** Qué hacer durante la huida, con su duración real (la de la configuración de la sala). */
function revealText(team, headStartMs, mode) {
  const min = headStartMs ? `${Math.round(headStartMs / 60_000)} min` : null;
  if (mode === 'fox_hunt' && team === 'runner') return `${min ? `Corre: tienes ${min} de ventaja.` : 'Corre: tienes ventaja.'} Verás a los cazadores en el mapa; ellos recibirán tu posición en cada pista.`;
  if (team === 'hunter') return min ? `Espera ${min} en la zona de salida mientras ${mode === 'fox_hunt' ? 'el zorro huye' : 'huyen'}.` : 'Espera en la zona de salida durante la huida.';
  return min ? `Corre: tienes ${min} de ventaja.` : 'Corre: tienes ventaja.';
}

function overlays() {
  const snap = ui.snap;
  let out = '';
  // Solo con la partida en juego: al terminar, la tarjeta no tapa el Mission Report.
  if (revealOpen(ui.reveal, snap, performance.now())) {
    const foxIs = foxLine(snap, ui.conn?.playerId, nameOf);
    out += ui.reveal.converted
      ? `<div class="overlay reveal t-${ui.reveal.team}" data-act="dismiss-reveal" role="dialog" aria-label="Tu rol">
      <p class="label">Te han infectado · ahora eres</p><p class="role">${TEAM_TEXT[ui.reveal.team]}</p>
      <p class="lead">${esc(conversionText(snap?.canTagFrom, serverNow()))}</p>
      <p class="lead">${esc(CAPTURE_NORMS)}</p>
      <p class="hint">Toca para continuar.</p></div>`
      : `<div class="overlay reveal t-${ui.reveal.team}" data-act="dismiss-reveal" role="dialog" aria-label="Tu rol">
      <p class="label">Tu rol</p><p class="role">${teamName(ui.reveal.team, snap?.config)}</p>
      <p class="lead">${esc(revealText(ui.reveal.team, snap?.config?.headStartMs, snap?.config?.mode))}</p>
      <p class="lead">${esc(CAPTURE_NORMS)}</p>
      ${foxIs ? `<p class="lead fox-is">${esc(foxIs)}.</p>` : ''}
      <p class="hint">${snap?.config?.mode === 'fox_hunt' ? (foxIs ? 'Todos saben quién es el zorro.' : 'En esta partida todos sabrán quién es el zorro.') : 'Solo lo ves tú.'} Toca para continuar.</p></div>`;
  }
  if (ui.sheet === 'rules' && !snap) out += rulesSheet();
  const invite = currentInvite();
  if (ui.sheet === 'qr' && snap?.phase === 'LOBBY' && invite) {
    let qr;
    try {
      qr = qrSvg(invite, { label: `QR para entrar en la sala ${ui.conn.code}` });
    } catch {
      qr = '<p class="msg danger">La dirección del servidor es demasiado larga para un QR.</p>';
    }
    out += `<div class="overlay sheet qr-sheet" role="dialog" aria-label="QR de la sala">
      <p class="label">Escanéalo con la cámara</p>${qr}
      <p class="code num">${esc(ui.conn.code)}</p>
      <p class="hint">Abre la partida en el navegador con el código ya puesto.</p>
      <button class="btn btn-ghost" data-act="close-sheet">Cerrar</button></div>`;
  }
  if (ui.sheet === 'start' && snap?.phase === 'LOBBY' && snap.hostId === ui.conn?.playerId) out += startSheet(snap);
  if (ui.sheet === 'selftag' && snap?.phase === 'ACTIVE') {
    const hunters = rivals(snap, ui.conn.playerId);
    out += `<div class="overlay sheet" role="dialog" aria-label="Declararte capturado">
      <h2>¿Quién te ha pillado?</h2>
      <div class="chips">${hunters.map((h) => `<button class="btn btn-outline btn-small" data-selftag="${esc(h.id)}">${esc(h.name)}</button>`).join('')}
      <button class="btn btn-outline btn-small" data-selftag="">No lo sé</button></div>
      <button class="btn btn-ghost" data-act="close-sheet">Cancelar</button></div>`;
  }
  if (ui.guide) out += guideOverlay(ui.guide);
  // La reclamación de captura va la última, encima de cualquier otra hoja: tiene 30 s para responder.
  const pending = snap?.pendingClaimForMe;
  if (pending && snap.phase === 'ACTIVE') {
    out += `<div class="overlay sheet claim-sheet" role="alertdialog" aria-label="Reclamación de captura">
      <p class="label">Reclamación de captura · responde en</p>
      <p class="timer num">${clock(pending.expiresAt - serverNow())}</p>
      <h2>¿Te ha pillado ${esc(nameOf(pending.hunterId))}?</h2>
      <p class="hint">Si no respondes a tiempo, no cuenta como captura.</p>
      <div class="row2"><button class="btn btn-danger" data-respond="yes">Sí, me ha pillado</button>
      <button class="btn btn-outline" data-respond="no">No</button></div></div>`;
  }
  return out;
}

// ------------------------------------------------------------------ acciones

// Declaración de edad (D-008, AC-A1): no es una verificación. Se pide una vez por móvil.
function adultDeclared() {
  return store.getItem('outrun.adult') === '1';
}

async function enter(kind) {
  const form = document.getElementById('home-form');
  const name = form.elements.name.value.trim();
  if (!adultDeclared() && !ui.adult) {
    ui.homeError = 'Para jugar tienes que confirmar que tienes 18 años o más.';
    return render();
  }
  if (name.length < 2) {
    ui.homeError = errorText('invalid_name');
    return render();
  }
  store.setItem('outrun.adult', '1');
  store.setItem('outrun.name', name);
  if (form.elements.server) store.setItem('outrun.server', form.elements.server.value.trim());
  const conn = connect();
  if (!conn) {
    ui.homeError = 'Escribe la dirección del servidor (la que te ha pasado el anfitrión).';
    return render();
  }
  ui.homeError = null;
  if (ui.entering) return;
  ui.entering = kind;
  render();
  try {
    for (let i = 0; i < 50 && conn.status !== 'open'; i++) await new Promise((r) => setTimeout(r, 100));
    if (conn.status !== 'open') throw new Error('no_response');
    if (kind === 'create') await conn.create(name);
    else {
      // También vale pegar el enlace de invitación entero.
      const typed = form.elements.code.value.trim();
      const code = normalizeCode(typed) ?? codeFromLink(typed);
      if (!code) throw new Error('invalid_code');
      await conn.join(code, name);
      ui.inviteCode = null;
    }
  } catch (e) {
    ui.homeError = errorText(e.message);
  } finally {
    ui.entering = null;
  }
  render();
}

// Intervalos de pista que caben en la persecución: con uno igual o mayor no llegaría ninguna pista
// (la primera llega un intervalo después de empezar).
const pingChoices = (durationMin) => PING_INTERVALS.filter((v) => v < durationMin);

/** Comando «configure» con el borrador actual (la configuración se envía siempre entera). */
function configCommand() {
  const d = ui.draft;
  return {
    type: 'configure',
    config: {
      mode: d.mode,
      durationMs: d.durationMin * 60_000,
      headStartMs: d.headStartMin * 60_000,
      pingIntervalMs: d.pingMin * 60_000,
      zone: [{ fromOffsetMs: 0, center: d.center, radiusM: d.radiusM }],
      // La zona se cierra cada 5 min (la calcula el servidor a partir de la zona inicial).
      dynamicZone: true,
      meetingPoint: d.center,
      safetyChecklistConfirmed: d.safety,
    },
  };
}

// El motor solo quita el «listo» a los demás si el cambio es material (modo, tiempos, pistas, radio o
// la zona o el encuentro a 50 m o más de lo que aceptó cada uno, D-062): confirmar la seguridad o recentrar
// unos metros no obliga a nadie.
async function configure(patch = {}) {
  Object.assign(ui.draft, patch);
  const d = ui.draft;
  const fits = pingChoices(d.durationMin);
  if (!fits.includes(d.pingMin)) {
    d.pingMin = fits[fits.length - 1];
    toast(`Pistas cada ${d.pingMin} min: con ${d.durationMin} min de persecución, un intervalo igual o mayor no daría ninguna pista.`);
  }
  if (!d.center) return void render();
  return cmd(configCommand());
}

/** Centra la zona en la posición del anfitrión (y envía la configuración). El fallo se queda a la vista. */
async function centerZone() {
  ui.centerError = null;
  try {
    const r = await locateOnce();
    await configure({ center: { lat: r.lat, lng: r.lng } });
  } catch (e) {
    ui.centerError = gpsCheckError(e.message, ui.draft.center ? 'Volver a centrar' : 'Centrar la zona aquí');
    announce(ui.centerError);
    render();
  }
}

/**
 * Paso 2 automático: el anfitrión que entra en una sala sin configuración no tiene que buscar el botón.
 * Se pide el GPS una sola vez; si falla, se explica y queda «Centrar la zona aquí» para reintentarlo.
 */
function maybeAutoCenter(snap) {
  if (ui.autoCenter || ui.locating || snap.phase !== 'LOBBY' || snap.config || snap.hostId !== ui.conn?.playerId) return;
  ui.autoCenter = true;
  centerZone();
}

// Antigüedad máxima de la lectura GPS del anfitrión al empezar (AF-12).
const HOST_GPS_FRESH_MS = 2 * 60_000;

/**
 * «Empezar ya» (hoja de empezar): confirma la lista de seguridad (no quita el «listo» a nadie), comprueba
 * el GPS del anfitrión y lo marca listo si hacía falta, y empieza. Si algo falla, se dice en la hoja, que
 * sigue abierta, y lo ya hecho se conserva (el siguiente intento no lo repite).
 */
async function startGame() {
  if (ui.starting) return;
  ui.startError = null;
  const step = (text) => {
    ui.starting = text;
    render();
  };
  const fail = (text) => {
    ui.starting = null;
    ui.startError = text;
    announce(text);
    render();
  };
  const send = async (command) => {
    const r = await ui.conn.command(command);
    if (!r.ok) fail(commandErrorText(r.error, r.detail, command.type));
    return r.ok;
  };
  if (!ui.snap?.config) return fail(startBlockers(ui.snap, { forHost: true })[0] ?? errorText('config_missing'));
  if (!ui.snap.config.safetyChecklistConfirmed) {
    step('Guardando la lista de seguridad…');
    ui.draft.safety = true;
    if (!(await send(configCommand()))) return;
  }
  // AF-12: la lectura del autocentrado puede tener muchos minutos. Al empezar, el GPS del anfitrión se
  // comprueba otra vez si la última lectura válida es de hace más de HOST_GPS_FRESH_MS (como dice la hoja).
  if (!ui.gpsChecked || performance.now() - ui.gpsCheckedAt > HOST_GPS_FRESH_MS) {
    step('Comprobando tu GPS…');
    try {
      await locateOnce();
    } catch (e) {
      return fail(gpsCheckError(e.message, 'Empezar ya'));
    }
  }
  if (!me(ui.snap, ui.conn.playerId)?.ready) {
    step('Preparando…');
    if (!(await send({ type: 'set_ready', ready: true }))) return;
  }
  step('Empezando…');
  if (!(await send({ type: 'start' }))) return;
  ui.starting = null;
  ui.sheet = null;
  render();
}

document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  // Intro en el campo del código = unirse; el botón «Crear sala» = crear.
  const viaButton = ev.submitter?.dataset.act === 'create';
  enter(!viaButton && ev.target.elements.code?.value.trim() ? 'join' : 'create');
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.assign !== undefined) return void cmd({ type: 'assign_team', targetId: el.dataset.assign, pref: el.value });
  if (el.id === 'f-adult') return void (ui.adult = el.checked);
  if (el.id === 'start-safety') {
    ui.startAck = el.checked;
    return render();
  }
  if (el.name === 'home-mode') {
    ui.draft.mode = el.value;
    return render();
  }
  if (el.dataset.cfg === undefined) return;
  const v = Number(el.value);
  if (el.id === 'c-mode') configure({ mode: el.value });
  else if (el.id === 'c-radius') configure({ radiusM: v });
  else if (el.id === 'c-duration') configure({ durationMin: v });
  else if (el.id === 'c-head') configure({ headStartMin: v });
  else if (el.id === 'c-ping') configure({ pingMin: v });
});

// Guía abierta: Escape la cierra y el foco no sale del diálogo (aria-modal).
document.addEventListener('keydown', (ev) => {
  // La hoja «Antes de empezar» también se cierra con Escape (salvo mientras empieza la partida).
  if (!ui.guide && ev.key === 'Escape' && ui.sheet === 'start' && !ui.starting) {
    ui.sheet = null;
    ui.startError = null;
    render();
    document.querySelector('[data-act="start"]')?.focus();
    return;
  }
  if (!ui.guide) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeGuide();
    return;
  }
  if (ev.key !== 'Tab') return;
  const box = document.querySelector('.guide-overlay');
  const f = box ? [...box.querySelectorAll('button:not([disabled])')].filter((x) => x.offsetParent !== null) : [];
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (ev.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
    ev.preventDefault();
    first.focus();
  }
});

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act],[data-kick],[data-claim],[data-respond],[data-selftag]');
  if (!el || el.disabled) return;
  const self = me(ui.snap, ui.conn?.playerId);
  if (el.dataset.kick) return void cmd({ type: 'kick', targetId: el.dataset.kick });
  if (el.dataset.claim) {
    const r = await cmd({ type: 'claim_tag', runnerId: el.dataset.claim });
    if (r.ok) ui.claimSent = { runnerId: el.dataset.claim, claimId: r.data.claimId, expiresAt: r.data.expiresAt };
    return render();
  }
  if (el.dataset.respond) {
    const pending = ui.snap?.pendingClaimForMe;
    if (pending) await cmd({ type: 'respond_tag', claimId: pending.claimId, accept: el.dataset.respond === 'yes' });
    return;
  }
  if (el.dataset.selftag !== undefined) {
    ui.sheet = null;
    await cmd(el.dataset.selftag ? { type: 'self_tag', hunterId: el.dataset.selftag } : { type: 'self_tag' });
    return render();
  }
  switch (el.dataset.act) {
    case 'create':
      return; // lo gestiona el submit del formulario
    case 'join':
      return enter('join');
    case 'share': {
      const code = ui.conn.code;
      const link = currentInvite();
      const text = `Únete a mi partida de THE OUTRUN con el código ${code}`;
      try {
        if (navigator.share) await navigator.share(link ? { title: 'THE OUTRUN', text, url: link } : { text });
        else {
          await navigator.clipboard.writeText(link ?? code);
          toast(link ? 'Enlace copiado' : 'Código copiado');
        }
      } catch {
        /* compartir cancelado */
      }
      return;
    }
    case 'qr':
      ui.sheet = 'qr';
      return render();
    case 'share-report': {
      const shown = ui.viewReport ? readLastReport(store)?.snap : ui.snap;
      const text = reportShareText(missionReport(shown, (id) => shown?.players.find((p) => p.id === id)?.name ?? 'Alguien'));
      if (!text) return;
      try {
        if (navigator.share) await navigator.share({ title: 'THE OUTRUN · Mission Report', text });
        else {
          await navigator.clipboard.writeText(text);
          toast('Resultado copiado');
        }
      } catch {
        /* compartir cancelado */
      }
      return;
    }
    case 'new-code':
      if (!ui.confirmNewCode) {
        ui.confirmNewCode = true;
        setTimeout(() => {
          ui.confirmNewCode = false;
          render();
        }, 4_000);
        return render();
      }
      ui.confirmNewCode = false;
      if (ui.sheet === 'qr') ui.sheet = null;
      return void cmd({ type: 'new_code' });
    case 'ready': {
      const ready = !self?.ready;
      if (ready) ui.lobbyNotice = null;
      // Antes de declararse listo, este móvil tiene que dar una posición: así el permiso se pide en la
      // sala (con su explicación) y no en mitad de la cuenta atrás, y nadie empieza sin GPS.
      if (ready && !ui.gpsChecked) {
        ui.readyError = null;
        try {
          await locateOnce();
        } catch (e) {
          // El motivo se queda bajo el botón (no solo un aviso pasajero) hasta el siguiente intento.
          ui.readyError = gpsCheckError(e.message);
          announce(ui.readyError);
          return render();
        }
      }
      ui.readyError = null;
      return void cmd({ type: 'set_ready', ready });
    }
    case 'center':
      return void centerZone();
    case 'edit-config':
      ui.editConfig = !ui.editConfig;
      return render();
    case 'manage':
      ui.manage = !ui.manage;
      return render();
    case 'start':
      // La hoja de empezar: resumen y lista de seguridad, que se confirma en cada partida (también en la
      // revancha: puede cambiar el sitio o el grupo).
      ui.startAck = false;
      ui.startError = null;
      ui.sheet = 'start';
      ui.sheetFocus = 'start-title';
      return render();
    case 'start-now':
      return void startGame();
    case 'end':
      if (!ui.confirmEnd) {
        ui.confirmEnd = true;
        setTimeout(() => {
          ui.confirmEnd = false;
          render();
        }, 4_000);
        return render();
      }
      ui.confirmEnd = false;
      return void cmd({ type: 'end_game' });
    case 'selftag':
      ui.sheet = 'selftag';
      return render();
    case 'rules':
      ui.sheet = 'rules';
      return render();
    case 'guide-open': {
      // El modo de la sala si ya hay; si no, el elegido en el inicio. Abrirla no toca la sala ni la conexión.
      const snap = ui.snap;
      // Ni durante la cuenta atrás ni con la tarjeta del rol a la vista (AF-10): se puede abrir justo después.
      if (ui.conn?.playerId && !guideStaysOpen(null, snap, ui.reveal, performance.now())) return toast('La guía se puede abrir en cuanto veas tu rol.');
      const context = !snap || !ui.conn?.playerId ? 'home' : snap.phase === 'LOBBY' ? 'lobby' : 'game';
      const mode = snap?.config?.mode ?? (context === 'home' ? ui.draft.mode : null);
      ui.guideOpener = el;
      ui.guide = { step: context === 'game' ? guideStepFor(guideTopic(snap)) : 0, mode, context };
      ui.guideFocus = true;
      return render();
    }
    case 'guide-prev':
    case 'guide-next':
    case 'guide-goto': {
      if (!ui.guide) return;
      const last = guideSteps(ui.guide.mode).length - 1;
      const to = el.dataset.act === 'guide-goto' ? Number(el.dataset.step) : ui.guide.step + (el.dataset.act === 'guide-next' ? 1 : -1);
      ui.guide = { ...ui.guide, step: Math.max(0, Math.min(last, to)) };
      ui.guideFocus = true;
      return render();
    }
    case 'guide-close':
      return closeGuide();
    case 'close-sheet':
      ui.sheet = null;
      ui.startError = null;
      return render();
    case 'dismiss-reveal':
      ui.reveal = null;
      return render();
    case 'retry-map':
      // Se vuelve a intentar cargar la cartografía (p. ej., tras recuperar la cobertura).
      mapState.failure = null;
      return render();
    case 'retry-location':
      // Se vuelve a pedir la ubicación desde cero (el navegador o el sistema pueden preguntar otra vez).
      stopTracking();
      ui.locationDenied = false;
      return void syncTracking().then(render);
    case 'rematch':
      // Dos toques (AF-11): la revancha lleva a todos a la sala; el informe queda guardado en cada móvil.
      clearTimeout(ui.confirmRematchTimer);
      if (!ui.confirmRematch) {
        ui.confirmRematch = true;
        ui.confirmRematchTimer = setTimeout(() => {
          ui.confirmRematch = false;
          render();
        }, 6_000);
        return render();
      }
      ui.confirmRematch = false;
      return void cmd({ type: 'rematch', swapRoles: false });
    case 'open-report':
      ui.viewReport = true;
      scrollTo(0, 0);
      return render();
    case 'close-report':
      ui.viewReport = false;
      return render();
    case 'join_rematch':
      return void cmd({ type: 'join_rematch' });
    case 'leave-game':
      if (!ui.confirmLeave) {
        ui.confirmLeave = true;
        setTimeout(() => {
          ui.confirmLeave = false;
          render();
        }, 4_000);
        return render();
      }
      ui.confirmLeave = false;
    // falls through: mismo camino que «Salir de la sala» (el servidor deja de aceptar su ubicación)
    case 'leave':
      ui.leaving = true;
      if (ui.snap && ui.snap.phase !== 'CANCELLED') await ui.conn.command({ type: 'leave' });
      resetGame();
      ui.conn.forget();
      ui.leaving = false;
      return render();
    case 'home':
      resetGame();
      ui.conn?.forget();
      return render();
    case 'play-here':
      // Recupera la sesión en esta pestaña; la otra recibe el mismo aviso y se para.
      ui.conn?.start();
      return render();
  }
});

// «Pista en 1 min» para el fugitivo libre (USER_FLOWS F8), una vez por pista. No se avisa si ya
// faltaba menos (p. ej., al recargar a 20 s de la pista): ese aviso llegaría tarde.
function warnPingSoon() {
  const snap = ui.snap;
  const self = me(snap, ui.conn?.playerId);
  if (snap?.phase !== 'ACTIVE' || self?.team !== 'runner' || self.status !== 'active' || !snap.nextPingAt) return;
  const left = snap.nextPingAt - serverNow();
  if (left > PING_WARNING_MS || ui.pingWarnedFor === snap.nextPingAt) return;
  ui.pingWarnedFor = snap.nextPingAt;
  if (left < PING_WARNING_MS - 10_000) return;
  toast('Pista en 1 min: los cazadores recibirán tu posición. Muévete.', 'brand');
  navigator.vibrate?.(120);
}

// Reloj de pantalla: los temporizadores se recalculan con la hora del servidor.
setInterval(() => {
  if (ui.snap && ['COUNTDOWN', 'HEAD_START', 'ACTIVE'].includes(ui.snap.phase)) render();
  warnPingSoon();
  if (ui.reveal && performance.now() >= ui.reveal.until) {
    ui.reveal = null;
    render();
  }
}, 250);

// Al volver a primer plano se reconecta si hacía falta (el sistema puede cerrar la conexión).
// Si sigue abierta, se da señal de vida al momento (presencia, D-057). Una pestaña sustituida por otra no
// se recupera sola: lo decide el jugador («Jugar en esta pestaña»).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') ui.conn?.wake();
  syncWakeLock();
});
// Vuelta desde la caché del navegador (atrás/adelante, pestaña restaurada) o de la red.
window.addEventListener('pageshow', (e) => e.persisted && ui.conn?.wake());
window.addEventListener('online', () => {
  ui.conn?.wake();
  render();
});
window.addEventListener('offline', render);

// Sesión guardada: se reanuda la partida al abrir.
if (serverUrl() && store.getItem('outrun.session')) connect();
draw();
