// THE OUTRUN · interfaz de partida. Se dibuja siempre a partir de la vista autorizada que envía el
// servidor (snapshot) y de lo que el servidor permite ver (posiciones, pistas). Los eventos solo
// producen avisos. Ninguna regla se decide aquí: todo lo valida el servidor.
import { SYMBOL_PATHS, WORDMARK_PATHS, WORDMARK_VIEWBOX } from './brand.generated.js';
import { INVITE_PARAM, PHASE_TEXT, TEAM_TEXT, ago, briefing, clock, codeFromLink, connectionNotice, errorText, gpsCheckError, gpsStatus, inviteLink, me, missionReport, normalizeCode, phaseDeadline, reportShareText, rivals, sharingStatus, startBlockers } from './game-view.js';
import { createLocationSource } from './location.js';
import { GameConnection, toWsUrl, uploadUrl } from './net.js';
import { qrSvg } from './qr.js';
import { radarSvg } from './radar.js';

const $app = document.getElementById('app');
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
const RADII = [200, 300, 400, 600, 800, 1200];

const ui = {
  conn: null,
  snap: null,
  reading: null, // última lectura propia (solo en este móvil)
  positions: [], // posiciones autorizadas por el servidor
  positionsAt: 0, // hora del servidor del último envío de posiciones
  ping: null, // última pista (cazadores)
  toasts: [],
  reveal: null, // { team, until }
  claimSent: null, // { runnerId, expiresAt }
  zoneWarning: null, // { exposedAt } (fugitivo fuera de la zona)
  startZoneWarning: false,
  draft: { durationMin: 20, headStartMin: 2, pingMin: 3, radiusM: 400, safety: false, center: null },
  sheet: null, // 'selftag' | 'qr' | null
  locating: false,
  homeError: null,
  leaving: false,
  confirmEnd: false,
  confirmNewCode: false,
  confirmLeave: false,
  gpsChecked: false, // este móvil ya ha dado una posición válida (se comprueba al pulsar «Estoy listo»)
  location: null,
  tracking: false,
  inviteCode: null, // código recibido por enlace de invitación (?sala=)
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
const nameOf = (id) => ui.snap?.players.find((p) => p.id === id)?.name ?? 'Alguien';
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

let frame = 0;
function render() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
}

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
    ui.snap = snap;
    syncTracking();
    render();
  });
  conn.on('event', onEvent);
  conn.on('positions', (msg) => {
    ui.positions = msg.positions;
    ui.positionsAt = msg.at;
    render();
  });
  conn.on('error', (code) => toast(errorText(code), 'danger'));
  conn.on('code', (code) => toast(`Nuevo código de sala: ${code}. El anterior ya no sirve.`));
  conn.on('session_lost', (code) => {
    resetGame();
    if (!ui.leaving) ui.homeError = errorText(code);
    render();
  });
  conn.start();
  return conn;
}

function resetGame() {
  stopTracking();
  ui.snap = null;
  ui.positions = [];
  ui.ping = null;
  ui.claimSent = null;
  ui.zoneWarning = null;
  ui.startZoneWarning = false;
  ui.reveal = null;
  ui.sheet = null;
}

async function cmd(command) {
  const r = await ui.conn.command(command);
  if (!r.ok) toast(errorText(r.error), 'danger');
  return r;
}

function onEvent(e) {
  const d = e.data;
  switch (e.type) {
    case 'role_revealed':
      ui.reveal = { team: d.team, until: performance.now() + 5_000 };
      navigator.vibrate?.([120, 60, 120]);
      break;
    case 'player_joined':
      toast(`${d.name} ha entrado`);
      break;
    case 'player_left':
      toast(`${nameOf(d.playerId)} ha salido`);
      break;
    case 'player_kicked': // al expulsado le llega «removed» (session_lost), no este evento
      toast(`${nameOf(d.playerId)} ha sido expulsado`);
      break;
    case 'host_changed':
      toast(`${nameOf(d.hostId)} es ahora el anfitrión`);
      break;
    case 'hunt_started':
      toast('¡Empieza la persecución!', 'brand');
      navigator.vibrate?.(300);
      break;
    case 'start_zone_warning':
      ui.startZoneWarning = true;
      navigator.vibrate?.(200);
      break;
    case 'start_zone_returned':
      ui.startZoneWarning = false;
      break;
    case 'zone_exit_warning':
      ui.zoneWarning = { exposedAt: d.exposedAt };
      navigator.vibrate?.([200, 100, 200]);
      break;
    case 'zone_reentered':
      ui.zoneWarning = null;
      toast('Has vuelto a la zona');
      break;
    case 'runner_exposed':
      if (d.runnerId === ui.conn.playerId) toast('Llevas demasiado fuera: los cazadores te ven', 'danger');
      else toast(`${nameOf(d.runnerId)} está fuera de la zona: visible`, 'brand');
      break;
    case 'ping':
      ui.ping = d.ping;
      toast('Nueva pista de los fugitivos', 'brand');
      navigator.vibrate?.(150);
      break;
    case 'ping_sent':
      toast('Los cazadores acaban de recibir una pista', 'danger');
      break;
    case 'tag_claimed':
      navigator.vibrate?.([300, 100, 300]);
      break;
    case 'tag_claim_resolved': {
      const text = { confirmed: 'Captura confirmada', rejected: 'Captura rechazada', expired: 'Sin respuesta: no hay captura', cancelled: 'Reclamación cancelada' }[d.result];
      if (ui.claimSent?.claimId === d.claimId) ui.claimSent = null;
      if (text) toast(text, d.result === 'confirmed' ? 'brand' : 'info');
      break;
    }
    case 'runner_captured':
      toast(d.runnerId === ui.conn.playerId ? 'Te han capturado' : `${nameOf(d.runnerId)} capturado`, 'danger');
      break;
    case 'game_finished':
      stopTracking();
      break;
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

async function syncTracking() {
  if (wantsTracking() && !ui.tracking) {
    ui.tracking = true;
    try {
      const src = await locationSource();
      // Sin señal o quieto: lo indica la barra de GPS con la antigüedad real; solo el permiso es un aviso.
      await src.start(onReading, (code) => code === 'permission_missing' && toast('Se ha retirado el permiso de ubicación', 'danger'), {
        upload: nativeUpload(),
      });
    } catch (e) {
      ui.tracking = false;
      toast(e.message === 'permission_missing' ? 'Necesitas dar permiso de ubicación para jugar.' : 'No se pudo activar la ubicación.', 'danger');
    }
  } else if (!wantsTracking() && ui.tracking) {
    stopTracking();
  }
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
    return reading;
  } finally {
    ui.locating = false;
    render();
  }
}

// ------------------------------------------------------------------ pantallas

function draw() {
  const snap = ui.snap;
  const toasts = `<div class="toasts" aria-live="polite">${ui.toasts.map((t) => `<p class="toast tone-${t.tone}">${esc(t.text)}</p>`).join('')}</div>`;
  let body;
  if (!snap || !ui.conn?.playerId) body = homeScreen();
  else if (snap.phase === 'LOBBY') body = lobbyScreen(snap);
  else if (snap.phase === 'COUNTDOWN') body = countdownScreen(snap);
  else if (snap.phase === 'HEAD_START' || snap.phase === 'ACTIVE') body = gameScreen(snap);
  else if (snap.phase === 'FINISHED') body = finishedScreen(snap);
  else body = closedScreen();
  // Redibujar no puede borrar lo que el jugador está escribiendo ni quitarle el foco.
  const typed = new Map([...$app.querySelectorAll('input[id]:not([type=checkbox])')].map((i) => [i.id, i.value]));
  const keepFocus = document.activeElement?.id;
  const notice = snap && ui.conn?.playerId ? connectionNotice(ui.conn.status, snap.phase) : null;
  const banner = notice ? `<p class="msg danger conn-notice" role="alert">${esc(notice)}</p>` : '';
  $app.innerHTML = `<header class="top">${lockup()}${statusDot()}</header>${banner}${body}${toasts}${overlays()}`;
  for (const [id, value] of typed) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  if (keepFocus) document.getElementById(keepFocus)?.focus();
}

function homeScreen() {
  const resuming = ui.conn?.session && ui.conn.status !== 'closed';
  if (resuming) return `<section class="hero"><p class="lead">Recuperando tu partida…</p></section>`;
  const needsServer = isApp() || !/^https?:$/.test(location.protocol);
  return `<section class="hero">
    <h1 class="slogan">RUN. HIDE.<br><span>STAY AHEAD.</span></h1>
    <p class="lead">Escondite urbano con GPS real. Cada uno con su móvil.</p>
  </section>
  <form class="card stack" id="home-form" autocomplete="off">
    <label class="field">Tu nombre<input id="f-name" name="name" maxlength="20" minlength="2" required value="${esc(store.getItem('outrun.name') ?? '')}" placeholder="Cómo te verán los demás"></label>
    ${needsServer ? `<label class="field">Servidor<input id="f-server" name="server" inputmode="url" value="${esc(serverInput())}" placeholder="tu-tunel.trycloudflare.com"></label>` : ''}
    <button class="btn btn-primary" type="submit" data-act="create">Crear sala</button>
    ${ui.inviteCode ? `<p class="msg">Te han invitado a la sala <strong class="num">${esc(ui.inviteCode)}</strong>. Escribe tu nombre y pulsa «Unirme».</p>` : ''}
    <div class="join-row">
      <input id="f-code" name="code" maxlength="6" placeholder="CÓDIGO" autocapitalize="characters" aria-label="Código de la sala" value="${esc(ui.inviteCode ?? '')}">
      <button class="btn ${ui.inviteCode ? 'btn-primary' : 'btn-outline'}" type="button" data-act="join">Unirme</button>
    </div>
    ${ui.homeError ? `<p class="msg danger">${esc(ui.homeError)}</p>` : ''}
  </form>
  <p class="foot">Mayores de 18 · Sin chat · La ubicación solo se usa durante la partida y se borra al terminar.${isApp() ? ' · <a href="diagnostic.html">Diagnóstico GPS</a>' : ''}</p>`;
}

function playerRow(p, snap, isHost) {
  const host = p.id === snap.hostId;
  const mine = p.id === ui.conn.playerId;
  const assign = isHost
    ? `<select class="mini" data-assign="${esc(p.id)}" aria-label="Rol de ${esc(p.name)}">
        ${['random', 'hunter', 'runner'].map((v) => `<option value="${v}"${(p.teamPref ?? 'random') === v ? ' selected' : ''}>${{ random: 'Sorteo', hunter: 'Cazador', runner: 'Fugitivo' }[v]}</option>`).join('')}
      </select>`
    : '';
  const kick = isHost && !host ? `<button class="icon-btn" data-kick="${esc(p.id)}" aria-label="Expulsar a ${esc(p.name)}">✕</button>` : '';
  const state = p.status === 'invited' ? 'Invitado' : p.ready ? 'Listo' : 'Esperando';
  return `<li class="player${p.connected ? '' : ' off'}">
    <span class="dot${p.connected ? ' on' : ''}" aria-hidden="true"></span>
    <span class="pname">${esc(p.name)}${mine ? ' <em>(tú)</em>' : ''}${host ? ' <span class="tag">Anfitrión</span>' : ''}</span>
    <span class="pstate${p.ready ? ' ready' : ''}">${state}</span>${assign}${kick}</li>`;
}

function lobbyScreen(snap) {
  const self = me(snap, ui.conn.playerId);
  const isHost = snap.hostId === ui.conn.playerId;
  const code = ui.conn.code ?? '';
  const players = snap.players.filter((p) => p.status === 'lobby' || p.status === 'invited');
  const invited = self?.status === 'invited';
  const cfg = snap.config;
  const summary = cfg
    ? `${cfg.durationMs / 60_000} min de persecución · ${cfg.headStartMs / 60_000} min de huida · zona de ${cfg.zone[0].radiusM} m · pistas cada ${cfg.pingIntervalMs / 60_000} min`
    : 'El anfitrión aún no ha fijado la zona.';
  const blockers = startBlockers(snap, { forHost: isHost });
  return `<section class="card code-card">
      <p class="label">Código de la sala</p>
      <p class="code num">${esc(code)}</p>
      <div class="row2">
        <button class="btn btn-outline btn-small" data-act="share">Compartir enlace</button>
        <button class="btn btn-outline btn-small" data-act="qr"${currentInvite() ? '' : ' disabled'}>Mostrar QR</button>
      </div>
      ${isHost ? `<button class="btn btn-ghost btn-small" data-act="new-code">${ui.confirmNewCode ? 'Toca otra vez: el código actual dejará de servir' : 'Cambiar el código'}</button>` : ''}
    </section>
    ${invited ? `<button class="btn btn-primary" data-act="join_rematch">Unirme a la revancha</button>` : ''}
    <section class="card">
      <h2>Jugadores <span class="count">${players.length}/20</span></h2>
      <ul class="players">${players.map((p) => playerRow(p, snap, isHost)).join('')}</ul>
      ${isHost ? '<p class="hint">Roles: «Sorteo» los reparte el servidor en secreto al empezar. Si asignas uno, solo tú lo ves; cada jugador descubre el suyo al terminar la cuenta atrás.</p>' : ''}
      ${!invited ? `<button class="btn ${self?.ready ? 'btn-outline' : 'btn-primary'}" data-act="ready"${ui.locating ? ' disabled' : ''}>${ui.locating ? 'Comprobando tu GPS…' : self?.ready ? 'No estoy listo' : 'Estoy listo'}</button>` : ''}
      ${!invited && !self?.ready && !ui.gpsChecked ? '<p class="hint">Al pulsar «Estoy listo» se comprueba tu GPS. La ubicación solo se usa durante la partida y se borra al terminar.</p>' : ''}
    </section>
    ${isHost ? hostConfig(snap) : `<section class="card"><h2>Partida</h2><p class="line">${esc(summary)}</p>${blockers.length ? `<div class="blockers" aria-live="polite"><p class="label">Para empezar falta</p>${blockers.map((b) => `<p class="msg">${esc(b)}</p>`).join('')}</div>` : '<p class="msg">Todo listo: el anfitrión puede empezar.</p>'}</section>`}
    ${rulesCard(snap)}
    ${isHost ? `<section class="card stack">${blockers.map((b) => `<p class="msg">${esc(b)}</p>`).join('')}
      <button class="btn btn-primary btn-big" data-act="start"${blockers.length ? ' disabled' : ''}>Empezar partida</button></section>` : ''}
    <button class="btn btn-ghost" data-act="leave">Salir de la sala</button>`;
}

/** Reglas de la partida, visibles para todos antes de empezar (Plan Maestro §7, reglas/briefing). */
function rulesCard(snap) {
  const rules = briefing(snap.config);
  if (!rules) return '';
  return `<details class="card rules" open><summary><h2>Reglas de la partida</h2></summary>
    <dl>${rules.map((r) => `<dt>${esc(r.title)}</dt><dd>${esc(r.text)}</dd>`).join('')}</dl></details>`;
}

function hostConfig(snap) {
  const d = ui.draft;
  if (snap.config) {
    d.durationMin = snap.config.durationMs / 60_000;
    d.headStartMin = snap.config.headStartMs / 60_000;
    d.pingMin = snap.config.pingIntervalMs / 60_000;
    d.radiusM = snap.config.zone[0].radiusM;
    d.center = snap.config.zone[0].center;
    d.safety = snap.config.safetyChecklistConfirmed;
  }
  const sel = (id, values, current, unit) =>
    `<select id="${id}" data-cfg>${values.map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>${v} ${unit}</option>`).join('')}</select>`;
  return `<section class="card stack">
    <h2>Configuración</h2>
    <button class="btn btn-outline" data-act="center"${ui.locating ? ' disabled' : ''}>${ui.locating ? 'Buscando tu posición…' : d.center ? 'Volver a centrar la zona aquí' : 'Centrar la zona aquí'}</button>
    <p class="hint">${d.center ? 'Zona fijada en tu posición. También es el punto de encuentro y la zona de salida de los cazadores.' : 'La zona se centra en tu posición actual: colócate en el punto de encuentro.'}</p>
    <div class="grid2">
      <label class="field">Radio${sel('c-radius', RADII, d.radiusM, 'm')}</label>
      <label class="field">Persecución${sel('c-duration', DURATIONS, d.durationMin, 'min')}</label>
      <label class="field">Huida${sel('c-head', HEAD_STARTS, d.headStartMin, 'min')}</label>
      <label class="field">Pistas cada${sel('c-ping', PING_INTERVALS, d.pingMin, 'min')}</label>
    </div>
    <label class="check"><input type="checkbox" id="c-safety" data-cfg${d.safety ? ' checked' : ''}>
      Lista de seguridad revisada: sin calzadas ni vías, toque suave para capturar, todos mayores de 18 y punto de encuentro acordado.</label>
  </section>`;
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
  const s = sharingStatus(ui.tracking, Boolean(ui.location?.uploading));
  return `<p class="sharing${s.on ? ' on' : ''}" role="status">${esc(s.text)}</p>`;
}

/**
 * Plan Maestro §4.5: se puede abandonar la partida en cualquier momento, y al salir se deja de
 * compartir la ubicación. Doble toque para no salir por error.
 */
function leaveGameButton() {
  return `<button class="btn btn-ghost" data-act="leave-game">${ui.confirmLeave ? 'Toca otra vez: saldrás y dejarás de compartir tu ubicación' : 'Abandonar la partida'}</button>`;
}

function gameScreen(snap) {
  const self = me(snap, ui.conn.playerId);
  const team = self?.team ?? null;
  const left = phaseDeadline(snap) - serverNow();
  const head = snap.phase === 'HEAD_START';
  const captured = self?.status === 'captured';
  let call;
  if (captured) call = 'Estás capturado: ahora eres espectador (con 60 s de retraso).';
  else if (head) call = team === 'hunter' ? 'Espera en la zona de salida hasta que termine la huida.' : '¡Huye! Escóndete dentro de la zona.';
  else call = team === 'hunter' ? 'Caza a los fugitivos. Usa las pistas.' : 'Que no te pillen. No salgas de la zona.';
  const gps = gpsStatus(ui.reading, performance.now());
  const radar = snap.config ? radarSvg(radarModel(snap, team)) : '';
  return `<section class="hud t-${team ?? 'x'}">
      <div><p class="label">${esc(PHASE_TEXT[snap.phase])}</p><p class="timer num">${clock(left)}</p></div>
      <div class="role-chip t-${team ?? 'x'}">${team ? TEAM_TEXT[team] : '—'}</div>
    </section>
    <p class="callout${captured ? ' muted' : ''}">${esc(call)}</p>
    ${ui.startZoneWarning ? '<p class="msg danger">Te has alejado de la zona de salida. Vuelve hasta que acabe la huida.</p>' : ''}
    ${ui.zoneWarning ? `<p class="msg danger">Estás fuera de la zona. Vuelve antes de ${clock(ui.zoneWarning.exposedAt - serverNow())} o los cazadores te verán.</p>` : ''}
    <section class="card radar-card">${radar}<p class="gps tone-${gps.tone}">${esc(gps.text)}</p>${sharingPill()}</section>
    ${!captured && snap.phase === 'ACTIVE' ? actions(snap, team) : ''}
    ${team === 'hunter' && ui.ping ? pingList(ui.ping) : ''}
    <p class="foot num">Capturas: ${snap.captures.length}</p>
    ${snap.hostId === ui.conn.playerId ? `<button class="btn btn-ghost" data-act="end">${ui.confirmEnd ? 'Toca otra vez para terminar la partida' : 'Terminar partida (anfitrión)'}</button>` : ''}
    ${leaveGameButton()}`;
}

function radarModel(snap, team) {
  const z = snap.config.zone[0];
  const dots = [];
  for (const p of ui.positions) {
    if (p.lat === null) continue;
    const kind = p.reason === 'teammate' ? 'mate' : p.reason === 'exposed' ? 'exposed' : 'spectator';
    // Solo se colorea lo que se sabe: compañeros (tu equipo) y expuestos (siempre fugitivos).
    const dotTeam = kind === 'mate' ? team : kind === 'exposed' ? 'runner' : 'x';
    // La antigüedad dice si su ubicación sigue llegando (p. ej., con su pantalla bloqueada).
    const age = p.ageMs === null ? '' : ` · ${ago(p.ageMs + Math.max(0, serverNow() - ui.positionsAt))}`;
    dots.push({ lat: p.lat, lng: p.lng, label: `${nameOf(p.playerId)}${age}`, kind, team: dotTeam, stale: p.availability !== 'CURRENT' });
  }
  if (team === 'hunter' && ui.ping) {
    for (const e of ui.ping.entries) {
      if (!e.position) continue;
      dots.push({ ...e.position, label: `${nameOf(e.runnerId)} · ${ago(e.ageMs + (serverNow() - ui.ping.at))}`, kind: 'ping', team: 'runner', stale: true });
    }
  }
  const mine = ui.reading ? { lat: ui.reading.lat, lng: ui.reading.lng, accuracyM: ui.reading.accuracyM } : null;
  return { center: z.center, radiusM: z.radiusM, meeting: snap.config.meetingPoint, me: mine, myTeam: team, dots };
}

function actions(snap, team) {
  const others = rivals(snap, ui.conn.playerId);
  if (team === 'hunter') {
    if (ui.claimSent) {
      return `<section class="card"><p class="line">Esperando a que ${esc(nameOf(ui.claimSent.runnerId))} confirme (${clock(ui.claimSent.expiresAt - serverNow())}).</p></section>`;
    }
    return `<section class="card stack"><h2>¿Has pillado a alguien?</h2>
      <p class="hint">Tócale suavemente y pulsa su nombre. El servidor comprueba que estáis cerca con lecturas recientes y el fugitivo confirma.</p>
      <div class="chips">${others.map((p) => `<button class="btn btn-primary btn-small" data-claim="${esc(p.id)}">${esc(p.name)}</button>`).join('') || '<p class="hint">No quedan fugitivos libres.</p>'}</div></section>`;
  }
  return `<section class="card"><button class="btn btn-danger" data-act="selftag">Me han pillado</button></section>`;
}

function pingList(ping) {
  return `<section class="card"><h2>Última pista</h2><ul class="pings">${ping.entries
    .map((e) => `<li>${esc(nameOf(e.runnerId))} <span class="muted">${e.position ? ago(e.ageMs + (serverNow() - ping.at)) : 'sin señal'}${e.availability === 'CURRENT' ? '' : ' · imprecisa o antigua'}</span></li>`)
    .join('')}</ul></section>`;
}

function finishedScreen(snap) {
  const o = snap.outcome;
  const report = missionReport(snap, nameOf);
  const isHost = snap.hostId === ui.conn.playerId;
  if (!report) return `<section class="card"><p class="line">Calculando el resultado…</p></section>`;
  const stat = (label, value) => `<div class="stat"><p class="label">${esc(label)}</p><p class="num">${esc(value)}</p></div>`;
  return `<section class="card result t-${o?.winner ?? 'x'}" aria-label="Mission Report">
      <p class="label">Mission Report · ${esc(report.cause)}</p>
      <h1>${esc(report.winner)}</h1>
      <div class="stats">
        ${stat('Persecución', report.durationMs === null ? '—' : clock(report.durationMs))}
        ${stat('Capturas', String(report.captureCount))}
        ${report.timeToVictoryMs !== null ? stat('Hasta la victoria', clock(report.timeToVictoryMs)) : ''}
      </div>
      ${report.highlights.length ? `<h2>Momentos</h2><ul class="highlights">${report.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      <h2>Capturas</h2>
      <ul class="captures">${report.captures.map((c) => `<li>${esc(c.runner)} capturado a los ${clock(c.atMs)}${c.hunter ? ` por ${esc(c.hunter)}` : ''}${c.via === 'self' ? ' · lo declaró el fugitivo' : ''}</li>`).join('') || '<li>Ninguna captura</li>'}</ul>
      <p class="hint">Solo datos oficiales del servidor. Las ubicaciones de la partida ya se han borrado.${report.rulesVersion ? ` Reglas: ${esc(report.rulesVersion)}.` : ''}</p>
    </section>
    <button class="btn btn-outline" data-act="share-report">Compartir resultado</button>
    ${isHost ? '<button class="btn btn-primary" data-act="rematch">Revancha</button>' : '<p class="line">Esperando a que el anfitrión proponga la revancha…</p>'}
    <button class="btn btn-ghost" data-act="leave">Salir</button>`;
}

function closedScreen() {
  return `<section class="card"><h2>La sala se ha cerrado</h2><p class="line">Crea una nueva o únete con otro código.</p>
    <button class="btn btn-primary" data-act="home">Volver al inicio</button></section>`;
}

function overlays() {
  const snap = ui.snap;
  let out = '';
  if (ui.reveal && performance.now() < ui.reveal.until) {
    out += `<div class="overlay reveal t-${ui.reveal.team}" data-act="dismiss-reveal" role="dialog" aria-label="Tu rol">
      <p class="label">Tu rol</p><p class="role">${TEAM_TEXT[ui.reveal.team]}</p>
      <p class="lead">${ui.reveal.team === 'hunter' ? 'Espera en la zona de salida durante la huida.' : 'Corre: tienes ventaja.'}</p>
      <p class="hint">Solo lo ves tú. Toca para continuar.</p></div>`;
  }
  const pending = snap?.pendingClaimForMe;
  if (pending && snap.phase === 'ACTIVE') {
    out += `<div class="overlay sheet" role="alertdialog" aria-label="Reclamación de captura">
      <p class="label">Reclamación · ${clock(pending.expiresAt - serverNow())}</p>
      <h2>¿Te ha pillado ${esc(nameOf(pending.hunterId))}?</h2>
      <div class="row2"><button class="btn btn-danger" data-respond="yes">Sí, me ha pillado</button>
      <button class="btn btn-outline" data-respond="no">No</button></div></div>`;
  }
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
  if (ui.sheet === 'selftag' && snap?.phase === 'ACTIVE') {
    const hunters = rivals(snap, ui.conn.playerId);
    out += `<div class="overlay sheet" role="dialog" aria-label="Declararte capturado">
      <h2>¿Quién te ha pillado?</h2>
      <div class="chips">${hunters.map((h) => `<button class="btn btn-outline btn-small" data-selftag="${esc(h.id)}">${esc(h.name)}</button>`).join('')}
      <button class="btn btn-outline btn-small" data-selftag="">No lo sé</button></div>
      <button class="btn btn-ghost" data-act="close-sheet">Cancelar</button></div>`;
  }
  return out;
}

// ------------------------------------------------------------------ acciones

async function enter(kind) {
  const form = document.getElementById('home-form');
  const name = form.elements.name.value.trim();
  if (name.length < 2) {
    ui.homeError = errorText('invalid_name');
    return render();
  }
  store.setItem('outrun.name', name);
  if (form.elements.server) store.setItem('outrun.server', form.elements.server.value.trim());
  const conn = connect();
  if (!conn) {
    ui.homeError = 'Escribe la dirección del servidor (la que te ha pasado el anfitrión).';
    return render();
  }
  ui.homeError = null;
  try {
    for (let i = 0; i < 50 && conn.status !== 'open'; i++) await new Promise((r) => setTimeout(r, 100));
    if (kind === 'create') await conn.create(name);
    else {
      const code = normalizeCode(form.elements.code.value);
      if (!code) throw new Error('invalid_code');
      await conn.join(code, name);
      ui.inviteCode = null;
    }
  } catch (e) {
    ui.homeError = errorText(e.message);
  }
  render();
}

async function configure(patch = {}) {
  Object.assign(ui.draft, patch);
  const d = ui.draft;
  if (!d.center) return render();
  await cmd({
    type: 'configure',
    config: {
      durationMs: d.durationMin * 60_000,
      headStartMs: d.headStartMin * 60_000,
      pingIntervalMs: d.pingMin * 60_000,
      zone: [{ fromOffsetMs: 0, center: d.center, radiusM: d.radiusM }],
      meetingPoint: d.center,
      safetyChecklistConfirmed: d.safety,
    },
  });
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
  if (el.dataset.cfg === undefined) return;
  const v = Number(el.value);
  if (el.id === 'c-radius') configure({ radiusM: v });
  else if (el.id === 'c-duration') configure({ durationMin: v });
  else if (el.id === 'c-head') configure({ headStartMin: v });
  else if (el.id === 'c-ping') configure({ pingMin: v });
  else if (el.id === 'c-safety') configure({ safety: el.checked });
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
      const text = reportShareText(missionReport(ui.snap, nameOf));
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
      // Antes de declararse listo, este móvil tiene que dar una posición: así el permiso se pide en la
      // sala (con su explicación) y no en mitad de la cuenta atrás, y nadie empieza sin GPS.
      if (ready && !ui.gpsChecked) {
        try {
          await locateOnce();
        } catch (e) {
          toast(gpsCheckError(e.message), 'danger');
          return;
        }
      }
      return void cmd({ type: 'set_ready', ready });
    }
    case 'center':
      try {
        const r = await locateOnce();
        await configure({ center: { lat: r.lat, lng: r.lng } });
      } catch (e) {
        toast(e.message === 'permission_missing' ? 'Necesitas dar permiso de ubicación.' : 'No se pudo obtener tu posición. Prueba al aire libre.', 'danger');
      }
      return;
    case 'start':
      return void cmd({ type: 'start' });
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
    case 'close-sheet':
      ui.sheet = null;
      return render();
    case 'dismiss-reveal':
      ui.reveal = null;
      return render();
    case 'rematch':
      return void cmd({ type: 'rematch', swapRoles: false });
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
  }
});

// Reloj de pantalla: los temporizadores se recalculan con la hora del servidor.
setInterval(() => {
  if (ui.snap && ['COUNTDOWN', 'HEAD_START', 'ACTIVE'].includes(ui.snap.phase)) render();
  if (ui.reveal && performance.now() >= ui.reveal.until) {
    ui.reveal = null;
    render();
  }
}, 250);

// Al volver a primer plano se reconecta si hacía falta (el sistema puede cerrar la conexión).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.conn && ui.conn.status !== 'open' && ui.conn.status !== 'closed') ui.conn.start();
});

// Sesión guardada: se reanuda la partida al abrir.
if (serverUrl() && store.getItem('outrun.session')) connect();
draw();
