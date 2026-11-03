// Panel del simulador local (herramienta de desarrollo). Lee el estado de /sim/api/estado y manda las
// acciones a /sim/api/<acción>. El mapa es el componente real del juego (map-view.js); si la cartografía no
// carga, se usa el radar real (radar.js) y se dice que es un plano de prueba, no el mapa.
import { SYMBOL_PATHS, WORDMARK_PATHS, WORDMARK_VIEWBOX } from '/js/brand.generated.js';
import { createMapController, loadMapConfig, loadMapLibre } from '/js/map-view.js';
import { radarSvg } from '/js/radar.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NAMES = Array.from({ length: 10 }, (_, i) => `AVATAR_${String(i + 1).padStart(2, '0')}`);
const PHASE = { LOBBY: 'Sala de espera', COUNTDOWN: 'Cuenta atrás', HEAD_START: 'Huida', ACTIVE: 'Persecución', FINISHED: 'Terminada', CANCELLED: 'Cancelada' };
const STATUS = { active: 'En juego', captured: 'Capturado', left: 'Fuera', lobby: 'En la sala', invited: 'Invitado' };
const REASON = { teammate: 'compañero', hunter_seen: 'cazador a la vista', exposed: 'expuesto', spectator: 'espectador' };
const LINK = { open: 'Conectado', connecting: 'Conectando', reconnecting: 'Reconectando', closed: 'Cerrada', idle: '—', desconectado: 'Desconectado (forzado)', suspendida: 'Pestaña suspendida', reemplazada: 'Abierta en otra pestaña' };

let state = null;
let selected = null;
let frameKey = '';
let map = null; // { ctl } o { radar: true }

$('#logo').innerHTML = `<svg viewBox="18.6 20.5 112 112" aria-hidden="true">${SYMBOL_PATHS}</svg><svg class="wm" viewBox="${WORDMARK_VIEWBOX}" role="img" aria-label="THE OUTRUN">${WORDMARK_PATHS}</svg>`;
for (const n of NAMES.slice(1)) $('#humano').add(new Option(n, n, n === 'AVATAR_02', n === 'AVATAR_02'));
for (const n of NAMES) $('#vista').add(new Option(`Lo que ve ${n}`, n));

const mmss = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1_000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ------------------------------------------------------------------ acciones

async function post(action, body = {}) {
  let r;
  try {
    const res = await fetch(`/sim/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    r = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  } catch {
    r = { ok: false, error: 'Sin respuesta del simulador' };
  }
  if (!r.ok) flash(r.error ?? 'No se pudo', true);
  await refresh();
  return r;
}

let flashTimer;
function flash(text, bad = false) {
  const el = $('#status');
  el.dataset.flash = bad ? 'bad' : 'ok';
  el.querySelector('.sim-flash')?.remove();
  el.insertAdjacentHTML('beforeend', `<span class="sim-flash">${esc(text)}</span>`);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.querySelector('.sim-flash')?.remove(), 5_000);
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button, tr[data-name]');
  if (!b) return;
  if (b.matches('tr[data-name]')) {
    selected = b.dataset.name;
    return render();
  }
  if (b.dataset.speed) return post('velocidad', { x: Number(b.dataset.speed) });
  if (b.dataset.advance) {
    b.disabled = true;
    await post('avanzar', { ms: Number(b.dataset.advance) });
    b.disabled = false;
    return;
  }
  const act = b.dataset.act;
  if (!act) return;
  if (act === 'iniciar') {
    b.disabled = true;
    flash('Creando la sala y conectando a los 10 participantes…');
    const r = await post('iniciar', { modo: document.querySelector('input[name=modo]:checked').value, humano: $('#humano').value });
    b.disabled = false;
    if (r.ok) flash('Preparando: el anfitrión (AVATAR_01) crea la sala, entran los demás y empieza la partida');
  } else if (act === 'pausa') await post(state?.clock.paused ? 'reanudar' : 'pausar');
  else if (act === 'soltar') await post('humano', { nombre: null });
  else if (act === 'jugar') await post('humano', { nombre: selected });
  else if (['desconectar', 'suspender', 'restaurar', 'duplicar'].includes(act)) await post(act, { nombre: selected });
  else if (act === 'captura-valida') await post('captura-valida', selected ? { fugitivo: isRunner(selected) ? selected : null, cazador: isRunner(selected) ? null : selected } : {});
  else await post(act);
});

const isRunner = (name) => state?.avatars.find((a) => a.name === name)?.team === 'runner';

// ------------------------------------------------------------------ mapa

function model(s) {
  const zone = s.run?.zone ?? { center: { lat: 40.4153, lng: -3.6845 }, radiusM: 400 };
  const dots = [];
  let me = null;
  let myTeam = null;
  if (s.view) {
    // Lo que el servidor autoriza a ver a ese participante (visiblePositions del motor).
    const viewer = s.avatars.find((a) => a.name === s.view.viewer);
    me = viewer ? { ...viewer.pos, accuracyM: 6 } : null;
    myTeam = viewer?.team ?? 'x';
    for (const p of s.view.positions) {
      if (p.lat === null || p.lng === null) continue;
      const team = p.reason === 'teammate' ? myTeam : p.reason === 'hunter_seen' ? 'hunter' : p.reason === 'exposed' ? 'runner' : 'x';
      dots.push({ id: p.playerId, lat: p.lat, lng: p.lng, label: `${p.name} · ${REASON[p.reason] ?? p.reason}`, kind: p.reason === 'exposed' || p.reason === 'hunter_seen' ? 'exposed' : p.reason === 'teammate' ? 'mate' : 'spectator', team, stale: p.availability !== 'CURRENT' });
    }
  } else {
    for (const a of s.avatars) {
      const out = a.status && a.status !== 'active';
      const tag = a.status === 'captured' ? ' · capturado' : a.status === 'left' ? ' · fuera' : a.away ? ' · sin conexión' : a.link !== 'open' && a.control === 'bot' ? ` · ${LINK[a.link] ?? a.link}` : '';
      dots.push({ id: a.name, lat: a.pos.lat, lng: a.pos.lng, label: `${a.name}${a.control === 'interfaz' ? ' (tú)' : ''}${tag}`, kind: out ? 'spectator' : 'mate', team: out ? 'x' : a.team ?? 'x', stale: a.away || out });
    }
  }
  const showPing = !s.view || s.avatars.find((a) => a.name === s.view.viewer)?.team === 'hunter';
  for (const e of showPing ? s.lastPing?.entries ?? [] : []) {
    if (e.position) dots.push({ id: `ping:${e.runner}`, ...e.position, label: `pista ${s.lastPing.pingNo}: ${e.runner}`, kind: 'ping', team: 'runner', stale: true });
  }
  return { center: zone.center, radiusM: zone.radiusM, meeting: zone.center, me, myTeam, dots };
}

async function startMap() {
  const host = $('#map');
  const cfg = await loadMapConfig((url, opts) => fetch(`/${url}`, opts));
  if (!cfg.ok) return useRadar(cfg.reason);
  try {
    const lib = await loadMapLibre();
    const ctl = createMapController(host, { lib, styleUrl: cfg.styleUrl, model: model(state ?? { avatars: [] }), onFail: (why) => useRadar(why) });
    map = { ctl };
    ctl.map?.on?.('click', (e) => {
      if (state?.human) void post('destino', { lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    $('#map-note').textContent = 'Mapa real del juego (misma cartografía y componente que la app). Haz clic para mover a quien juegas desde la interfaz.';
  } catch {
    useRadar('library');
  }
}

function useRadar(why) {
  map?.ctl?.destroy?.();
  map = { radar: true };
  $('#map-note').textContent = `PLANO DE PRUEBA, no es el mapa real: la cartografía no está disponible (${why}). Se dibuja con el radar del juego.`;
  $('#map-note').classList.add('warn');
  renderMap();
}

function renderMap() {
  if (!state || !map) return;
  if (map.ctl) map.ctl.update(model(state));
  else if (map.radar) $('#map').innerHTML = radarSvg(model(state));
}

// ------------------------------------------------------------------ pantalla

function timing(s) {
  const r = s.run;
  if (!r) return { label: 'Sin partida', detail: 'Elige un modo e inicia' };
  const now = s.clock.now;
  if (r.phase === 'COUNTDOWN') return { label: PHASE[r.phase], detail: mmss(r.countdownEnd - now) };
  if (r.phase === 'HEAD_START') return { label: PHASE[r.phase], detail: `quedan ${mmss(r.headStartEnd - now)}` };
  if (r.phase === 'ACTIVE') return { label: PHASE[r.phase], detail: `${mmss(now - r.activeStart)} · quedan ${mmss(r.gameEnd - now)} · pista en ${mmss(r.nextPingAt - now)}` };
  return { label: PHASE[r.phase] ?? r.phase, detail: r.outcomeText ?? '' };
}

function render() {
  const s = state;
  if (!s) return;
  const t = timing(s);
  const speed = s.clock.paused ? '<b class="sim-badge warn">EN PAUSA</b>' : s.clock.speed > 1 ? `<b class="sim-badge warn">TIEMPO ACELERADO ×${s.clock.speed}</b>` : '<b class="sim-badge">Tiempo real ×1</b>';
  const flashEl = $('#status .sim-flash');
  $('#status').innerHTML = `${s.run ? `<b>${esc(s.run.modeName)}</b> · ` : ''}<b>${esc(t.label)}</b> <span>${esc(t.detail)}</span> ${speed}${s.busy ? ` <span class="sim-badge">${esc(s.busy)}…</span>` : ''}`;
  if (flashEl) $('#status').append(flashEl);
  $('#pausa').textContent = s.clock.paused ? 'Reanudar' : 'Pausar';
  for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s.clock.speed));
  const active = s.run && (s.run.phase === 'ACTIVE' || s.run.phase === 'HEAD_START');
  for (const b of document.querySelectorAll('[data-act=captura-valida],[data-act=captura-invalida]')) b.disabled = s.run?.phase !== 'ACTIVE';
  $('[data-act=finalizar]').disabled = !active;
  $('[data-act=revancha]').disabled = s.run?.phase !== 'FINISHED' || Boolean(s.busy);
  for (const b of document.querySelectorAll('[data-advance]')) b.disabled = !s.run || Boolean(s.busy);

  // Participantes
  const fox = s.run?.mode === 'fox_hunt';
  const conv = (a) => (a.convertedAt ? ' · infectado' : '');
  const role = (a) => (a.team === 'hunter' ? `Cazador${conv(a)}` : a.team === 'runner' ? (fox ? 'Zorro' : 'Fugitivo') : '—');
  $('#count').textContent = `${s.avatars.length} · anfitrión ${s.run?.host ?? 'AVATAR_01'}`;
  $('#people').innerHTML = s.avatars
    .map((a) => {
      const wait = a.canTagFrom && a.canTagFrom > s.clock.now ? ` · captura en ${mmss(a.canTagFrom - s.clock.now)}` : '';
      const st = `${STATUS[a.status] ?? '—'}${a.leftReason === 'timeout' ? ' (5 min sin señal)' : ''}${a.away ? ' · sin conexión' : ''}`;
      const link = `${a.control === 'interfaz' ? 'Interfaz real' : LINK[a.link] ?? a.link}${a.extraTab ? ' · 2.ª pestaña' : ''}`;
      return `<tr data-name="${esc(a.name)}" class="${a.name === selected ? 'is-sel' : ''} t-${a.team ?? 'x'}" tabindex="0" aria-selected="${a.name === selected}">
        <th scope="row">${esc(a.name)}${a.host ? ' <small>anfitrión</small>' : ''}${a.control === 'interfaz' ? ' <small>tú</small>' : ''}</th>
        <td><i class="lg t-${a.team ?? 'x'}"></i>${esc(role(a))}${esc(wait)}</td><td>${esc(st)}</td><td>${esc(link)}</td>
        <td>${a.lastSeenAgoMs === null ? '—' : `hace ${mmss(a.lastSeenAgoMs)}`}</td></tr>`;
    })
    .join('');

  const sel = s.avatars.find((a) => a.name === selected);
  $('#actions').innerHTML = sel
    ? `<p><b>${esc(sel.name)}</b> · ${esc(role(sel))} · ${esc(sel.control === 'interfaz' ? 'lo juegas tú' : 'bot')}${sel.action ? ` · última acción: ${esc(sel.action)}` : ''}</p>
      <div class="sim-row">
        <button class="btn btn-outline btn-small" data-act="desconectar" ${sel.control === 'interfaz' ? 'disabled' : ''}>Forzar desconexión</button>
        <button class="btn btn-outline btn-small" data-act="suspender" ${sel.control === 'interfaz' ? 'disabled' : ''}>Suspender pestaña</button>
        <button class="btn btn-outline btn-small" data-act="restaurar">Restaurar conexión</button>
        <button class="btn btn-outline btn-small" data-act="duplicar">Pestaña duplicada</button>
        <button class="btn btn-ghost btn-small" data-act="jugar" ${sel.host || sel.control === 'interfaz' ? 'disabled' : ''}>Jugar como ${esc(sel.name)}</button>
      </div>
      <p class="sim-note">«Captura válida» usa a este participante (como fugitivo o como cazador). La desconexión y la suspensión de quien juegas desde la interfaz se prueban desde el navegador.</p>`
    : '<p class="sim-note">Selecciona un participante en la tabla para probar su conexión.</p>';

  // Capturas y resultado
  const r = s.run;
  const caps = r?.captures ?? [];
  $('#results').innerHTML = !r
    ? '<p class="sim-note">Sin partida.</p>'
    : `${r.outcome ? `<p class="sim-result"><b>Resultado del motor:</b> ${esc(r.outcomeText)}</p>` : ''}
      <p class="sim-note">Pistas enviadas: ${r.pingCount ?? 0} · reglas ${esc(r.rulesVersion ?? '—')}${r.claims.length ? ` · reclamaciones pendientes: ${r.claims.map((c) => `${esc(c.hunter)} → ${esc(c.runner)}`).join(', ')}` : ''}</p>
      ${caps.length ? `<ol class="sim-caps">${caps.map((c) => `<li><b>${mmss(c.atOffsetMs)}</b> ${esc(c.runner)} ${c.converted ? 'infectado' : 'capturado'}${c.hunter ? ` por ${esc(c.hunter)}` : ''}${c.via === 'self' ? ' (se declaró capturado)' : ''}</li>`).join('')}</ol>` : '<p class="sim-note">Aún no hay capturas.</p>'}
      ${s.errors.length ? `<p class="sim-err"><b>Errores de ejecución:</b> ${s.errors.map((e) => esc(e.text)).join(' · ')}</p>` : '<p class="sim-note">Errores de ejecución: ninguno.</p>'}`;

  // Consola
  const t0 = r?.activeStart ?? r?.headStartEnd ?? null;
  const when = (at) => {
    const d = new Date(at);
    return t0 && at >= t0 ? `+${mmss(at - t0)}` : d.toLocaleTimeString('es-ES', { hour12: false });
  };
  $('#log').innerHTML = [...s.log]
    .reverse()
    .slice(0, 150)
    .map((l) => `<li class="k-${esc(l.kind)}"><time>${esc(when(l.at))}</time><b>${esc(l.who || '')}</b><span>${esc(l.text)}</span></li>`)
    .join('');

  // Interfaz real
  const key = s.human ? `${s.run?.no ?? 0}:${s.human}` : '';
  $('#phone-title').textContent = s.human ? `Interfaz real · ${s.human}` : 'Interfaz real';
  $('#soltar').hidden = !s.human;
  if (key !== frameKey) {
    frameKey = key;
    const box = $('#frame-box');
    box.querySelector('iframe')?.remove();
    $('#frame-empty').hidden = Boolean(key);
    if (key) {
      const f = document.createElement('iframe');
      f.title = `Interfaz real del juego de ${s.human}`;
      f.src = `/?simulacion=${encodeURIComponent(key)}`;
      f.allow = 'geolocation';
      box.append(f);
    }
  }
  $('#map-title').textContent = s.view ? `Lo que ve ${s.view.viewer}` : 'Vista de control';
  $('#map-sub').textContent = s.view ? 'Solo lo que el servidor le autoriza a ver (mismo filtro que en la partida).' : 'Todos los participantes con su GPS simulado: ningún jugador ve esto.';
  renderMap();
}

async function refresh() {
  try {
    const v = $('#vista').value;
    const res = await fetch(`/sim/api/estado${v ? `?vista=${encodeURIComponent(v)}` : ''}`, { cache: 'no-store' });
    state = await res.json();
    render();
    if (!map) void startMap();
  } catch {
    $('#status').innerHTML = '<b class="sim-badge warn">Sin conexión con el simulador</b> ¿Se ha detenido? Arráncalo con npm run sim:panel';
  }
}

$('#vista').addEventListener('change', refresh);
setInterval(refresh, 700);
void refresh();
