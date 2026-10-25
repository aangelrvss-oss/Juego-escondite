// DEMO VISUAL · interfaz. Todo lo que se ve es SIMULADO: no hay GPS, red ni servidor.
// No pide permisos de ubicación. La lógica de juego está en sim.js (no es el motor de S0).
import * as S from './sim.js';

const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
const X = S.EXPERIMENTAL;

const state = {
  route: 'inicio',
  settings: S.defaultSettings(),
  moreOpen: false,
  joinValue: '',
  joinError: '',
  room: null,
  game: null,
  speed: X.defaultSpeed,
  paused: false,
  vibrate: true,
  sheetOpen: false,
  tab: 'pistas',
  modal: null,
  lastEvent: 0,
  tapped: false,
  nextPolicy: 'redraw',
  finishing: false,
  hostStartAt: null,
  roleCard: false, // tarjeta de rol abierta: el reloj de la partida no avanza hasta «Entendido»
};

// ------------------------------------------------------------------ utilidades

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ago = (s) => (s < 60 ? `${Math.max(0, Math.floor(s))} s` : S.formatClock(s));
const teamName = (t, plural = false) => (t === 'hunter' ? (plural ? 'Cazadores' : 'Cazador') : t === 'runner' ? (plural ? 'Fugitivos' : 'Fugitivo') : 'Sin equipo');
const initial = (name) => esc([...name][0]);

function buzz(pattern) {
  if (!state.vibrate || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* sin vibración */ }
}

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 011-1h10"/></svg>',
  hunter: '<svg class="dot" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1l6 12H1z" fill="currentColor"/></svg>',
  runner: '<svg class="dot" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="currentColor"/></svg>',
  spect: '<svg class="dot" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

// ------------------------------------------------------------------ marca THE OUTRUN

const BRAND = { name: 'THE OUTRUN', slogan: 'RUN. HIDE. STAY AHEAD.' };

/**
 * Símbolo y logotipo: vectores reconstruidos a partir de la referencia elegida (calco de sus
 * regiones blancas y naranjas, con limpieza a mano de defectos del original). Sin texto en imagen:
 * se dibujan nítidos a cualquier tamaño. El símbolo es el mismo en el icono, el favicon y las cabeceras.
 */
const SYMBOL_PATHS = '<path fill="#fff" d="M40 41.3L62.8 22.0L119.8 22.0L123 25.8L95.6 50.0L69.3 50.0L63 55.5L55.5 84.2L20.8 113.7ZM128.4 51.3L112.6 111.6L89.8 131.0L27.6 131.0L60.3 103.3L80.8 103.3L84.8 101.0L88 97.8L92.1 82.2Z"/><path fill="#ff6b1f" d="M99.4 54.6L125.5 32.3L128.4 51.3L92.1 82.2ZM54.7 92.5L52.1 102.2L21.6 128.1L24.2 118.4Z"/>';
const WORDMARK_PATHS = '<path fill="#fff" d="M36.8 12.0L59.2 12.5L57.8 18.0L50 18.2L44.8 39.0L38 38.8L43 18.2L35.2 18.0L35 15.8ZM64.2 12.0L70 12.2L68 22.0L74.8 22.8L79.8 22.2L83 12.0L88.5 12.2L83 37.2L81.8 39.0L76 38.8L77.8 28.8L66.2 29.0L64 38.8L57.8 38.8ZM95.2 12.0L118 12.5L116.8 18.0L100.2 18.0L99 20.8L99.2 23.0L113.5 23.5L113 27.2L111.5 28.5L98.8 28.2L97 29.2L96 32.0L96.5 33.2L111.5 33.0L112 36.8L110.8 39.0L88.8 38.8L91 26.0ZM38.2 49.0L87 49.0L94 56.0L71.8 74.0L68 71.0L45 71.0L43.2 72.0L40 74.5L35 94.8L16.8 110.0L7.2 116.0L8 108.2L9 107.2L20 63.2ZM109.2 50.2L129 51.2L117 96.0L118.2 99.0L139.8 99.0L152.2 50.5L171.8 50.2L173 51.0L159.8 106.2L146.2 118.8L101.2 119.0L94 108.8L94 105.5L99 89.5L108 51.5ZM180.5 50.2L234.5 50.2L235 51.8L217.8 69.0L211.2 70.0L209 79.8L184.2 102.0L191.5 70.2L175 69.8L178 54.5L179.2 50.8ZM308.5 50.2L322.2 50.2L327.8 51.2L318 89.2L316.5 99.0L336.8 98.5L348.2 50.8L365.8 50.2L369 51.0L356 107.0L342.8 119.0L301 119.0L294 109.5L294 105.2L299 87.5L301 76.0L306 58.8L307 51.8ZM377.5 50.2L396.5 50.5L413.2 85.2L415 82.8L422 51.2L423.2 50.2L442.8 50.8L425.8 119.0L406.5 119.0L390 85.2L389 85.2L388 92.5L381 118.8L361 118.5ZM289.2 51.0L293 54.2L298 61.2L297 62.2L291.8 87.8L281.8 96.0L279 96.5L288.2 118.8L266 119.0L258 99.2L256.8 98.0L253.5 97.8L254 95.2L263.2 82.0L273 81.8L275.5 70.2L270.8 70.0L270.5 69.0ZM255 70.0L256 70.2L256 72.0L251 87.8L251 91.0L244 118.8L224.2 119.0L224 116.5L230.2 90.5Z"/><path fill="#ff6b1f" d="M244 50.2L286.5 50.5L288.2 51.2L287 53.5L269.5 69.5L254.2 70.0L251.2 72.0L205 112.0L192.5 119.0L178.8 118.8L178.2 116.2ZM95.8 62.0L97.2 62.5L96.8 67.2L95 71.0L94.8 75.2L93 78.5L84.8 111.5L68 127.0L65.8 128.0L6.5 127.2L11 122.0L32.5 104.2L58.5 105.0L61.2 103.5L65 98.8L67.5 86.0L71.2 81.0Z"/>';
/** Símbolo compacto (sin fondo). */
const MARK = `<span class="mark"><svg viewBox="18.6 20.5 112 112" aria-hidden="true" focusable="false">${SYMBOL_PATHS}</svg></span>`;
/** Icono de la app: el mismo símbolo centrado en una baldosa oscura (igual que el favicon). */
const APP_ICON = `<svg class="app-icon" viewBox="-1.4 0.5 152 152" aria-hidden="true" focusable="false"><rect x="-1.4" y="0.5" width="152" height="152" rx="34" fill="#121317"/>${SYMBOL_PATHS}</svg>`;
const WORDMARK = `<svg class="wordmark" viewBox="4 10 442 120" aria-hidden="true" focusable="false">${WORDMARK_PATHS}</svg>`;
/** Logotipo completo (portada) y versión horizontal para cabeceras. */
const LOGO = `<h1 class="logo"><span class="sr-only">${BRAND.name}</span>${WORDMARK}</h1>`;
const LOCKUP = `<span class="lockup" role="img" aria-label="${BRAND.name}">${MARK}${WORDMARK}</span>`;

// ------------------------------------------------------------------ navegación

const ROUTES = ['inicio', 'unirse', 'reglas', 'crear', 'sala', 'partida', 'final'];

function go(route, replace = false) {
  const hash = `#/${route}`;
  if (location.hash === hash) return onRoute();
  if (replace) location.replace(hash);
  else location.hash = hash;
}

function onRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  let route = ROUTES.includes(raw) ? raw : 'inicio';
  const g = state.game;
  // Salir de una partida en curso exige confirmación.
  if (state.route === 'partida' && route !== 'partida' && g && g.phase !== 'finished' && !state.leaving) {
    history.pushState(null, '', '#/partida');
    state.modal = { type: 'leave' };
    return paint();
  }
  state.leaving = false;
  if (route !== state.route) state.modal = null;
  if (route === 'partida' && !g) return go(state.room ? 'sala' : 'inicio', true);
  if (route === 'partida' && g.phase === 'finished') return go('final', true);
  if (route === 'final' && (!g || g.phase !== 'finished')) return go(state.room ? 'sala' : 'inicio', true);
  if (route === 'sala' && !state.room) return go('inicio', true);
  if (route === 'sala' && g && g.phase === 'finished') {
    // Volver atrás desde el final = volver a la sala con los mismos equipos.
    S.nextRound(state.room, g, 'keep');
    state.game = null;
  }
  if (route === 'inicio') {
    // Al volver al inicio se descarta la sala simulada.
    state.room = null;
    state.game = null;
  }
  if (route !== state.route) {
    const box = document.getElementById('toasts');
    if (box) box.innerHTML = '';
  }
  state.route = route;
  document.body.classList.toggle('in-game', route === 'partida');
  paint();
  syncTimers();
}

// ------------------------------------------------------------------ pintado con regiones

const painted = { route: null, regions: new Map(), layer: '' };
const $app = () => document.getElementById('app');
const $layer = () => document.getElementById('layer');

function paint() {
  const html = SCREENS[state.route]();
  const app = $app();
  if (painted.route !== state.route) {
    app.innerHTML = html;
    painted.route = state.route;
    painted.regions.clear();
    for (const el of app.querySelectorAll('[data-region]')) painted.regions.set(el.dataset.region, el.outerHTML);
    window.scrollTo(0, 0);
    const focus = app.querySelector('[data-autofocus]');
    if (focus) focus.focus();
  } else {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const el of tpl.content.querySelectorAll('[data-region]')) {
      const name = el.dataset.region;
      const s = el.outerHTML;
      if (painted.regions.get(name) === s) continue;
      const current = app.querySelector(`[data-region="${name}"]`);
      if (current) current.replaceWith(el);
      painted.regions.set(name, s);
    }
  }
  const layer = renderLayer();
  if (layer !== painted.layer) {
    $layer().innerHTML = layer;
    painted.layer = layer;
    const focus = $layer().querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }
  if (state.route === 'partida') {
    paintMarkers();
    // Los avisos breves se colocan bajo el HUD (banners incluidos) cuando el panel está abierto.
    const hud = document.querySelector('.hud');
    if (hud) document.body.style.setProperty('--toast-top', `${Math.round(hud.getBoundingClientRect().bottom + 8)}px`);
  }
  document.body.classList.toggle('sheet-open', state.route === 'partida' && state.sheetOpen);
  applyBinds();
}

/** Textos que cambian cada segundo: se actualizan sin sustituir botones (evita toques perdidos). */
function applyBinds() {
  const values = state.route === 'partida' && state.game ? gameBinds(state.game) : {};
  for (const el of document.querySelectorAll('[data-bind]')) {
    const v = values[el.dataset.bind];
    if (v !== undefined && el.textContent !== v) el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-bindw]')) {
    const v = values[el.dataset.bindw];
    if (v !== undefined) el.style.width = v;
  }
  for (const el of document.querySelectorAll('[data-age]')) {
    const v = state.game ? ago(state.game.t - Number(el.dataset.age)) : '';
    if (el.textContent !== v) el.textContent = v;
  }
}

// ------------------------------------------------------------------ avisos breves

function toast(text, kind = 'info') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="ico" aria-hidden="true"></span><span>${esc(text)}</span>`;
  box.appendChild(el);
  while (box.children.length > 2) box.firstElementChild.remove();
  setTimeout(() => el.remove(), 3400);
}

// ------------------------------------------------------------------ pantallas

const topbar = (title, back = 'inicio') => `
  <div class="topbar">
    <button class="icon-btn" data-action="go" data-to="${back}" aria-label="Volver">${ICON.back}</button>
    <h1>${title}</h1>
    <span class="demo-pill">${MARK} Simulada</span>
  </div>`;

const SCREENS = {
  inicio: () => `
  <main class="screen home">
    <div class="topbar"><span class="mark-tile">${APP_ICON}</span><span class="demo-pill">Demo simulada · sin GPS real</span></div>
    <section class="cover">
      <div class="cover-brand">${LOGO}<p class="slogan">${BRAND.slogan}</p></div>
      <div class="cover-art" role="img" aria-label="Una persona con mochila observa la ciudad al atardecer desde una azotea"></div>
    </section>
    <p class="home-text">Escondite urbano por equipos. Partida simulada: sin GPS real ni servidor.</p>
    <div class="home-actions">
      <button class="btn btn-primary btn-block" data-action="go" data-to="crear">Crear sala</button>
      <button class="btn btn-outline btn-block" data-action="go" data-to="unirse">Unirse a sala</button>
      <button class="btn btn-ghost btn-block" data-action="go" data-to="reglas">Cómo se juega</button>
    </div>
    <p class="home-foot">Versión de demostración · ${esc(BUILD)}</p>
  </main>`,

  unirse: () => `
  <main class="screen">
    ${topbar('Unirse a una sala')}
    <form class="card" data-form="join" novalidate>
      <h2><label for="code">Código de la sala</label></h2>
      <input id="code" class="code-input mono" name="code" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false"
        inputmode="text" enterkeyhint="go" placeholder="······" value="${esc(state.joinValue)}" aria-describedby="code-err code-help"
        aria-invalid="${state.joinError ? 'true' : 'false'}" data-autofocus>
      <div id="code-err" class="error-text" role="alert" data-region="join-err">${esc(state.joinError)}</div>
      <p id="code-help" class="hint">6 caracteres. No se usan O, 0, I, 1 ni L para evitar confusiones.</p>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:14px">Entrar en la sala</button>
      <button class="link-btn" type="button" data-action="example-code">Usar un código de ejemplo</button>
      <p class="hint">En la demo, cualquier código válido abre una sala simulada con jugadores ficticios.</p>
    </form>
  </main>`,

  reglas: () => `
  <main class="screen rules">
    ${topbar('Cómo se juega')}
    <section class="card"><h3>Modo Clásico</h3><ul>
      <li>Dos equipos fijos: <b style="color:var(--hunter)">cazadores</b> y <b style="color:var(--runner)">fugitivos</b>.</li>
      <li>Los fugitivos ganan si queda al menos uno libre al acabar el tiempo. Los cazadores, si capturan a todos antes.</li>
    </ul></section>
    <section class="card"><h3>Ventaja y pistas <span class="exp">Experimental</span></h3><ul>
      <li>Al empezar, los fugitivos tienen una ventaja (${X.headStartS / 60} min en la demo). Los cazadores esperan en el punto de encuentro sin ver a nadie.</li>
      <li>Cada ${X.pingEveryS / 60} min los cazadores reciben una pista: la última posición conocida de cada fugitivo libre, <b>con su antigüedad</b>.</li>
      <li>Cada equipo ve a sus compañeros. Los fugitivos nunca ven a los cazadores.</li>
      <li>Los cazadores tienen un escáner con ${X.scan.uses} usos: dice cuántos fugitivos hay cerca, nunca dónde.</li>
    </ul></section>
    <section class="card"><h3>Zona <span class="exp">Experimental</span></h3><ul>
      <li>Se juega dentro de un círculo. Si un fugitivo pasa más de ${X.outsideGraceS} s fuera, los cazadores lo ven mientras siga fuera.</li>
      <li>Un cazador fuera de la zona no se expone, pero no puede capturar.</li>
      <li>La zona puede encogerse y moverse, con aviso previo. Nadie queda eliminado por estar fuera.</li>
      <li>El círculo es solo una referencia de juego: <b>no garantiza que la zona sea segura</b>.</li>
    </ul></section>
    <section class="card"><h3>Capturas sin contacto</h3><ul>
      <li>El cazador reclama la captura y el fugitivo la confirma. También puedes declarar que te han pillado.</li>
      <li>Si el fugitivo la disputa, queda pendiente: sigue en juego hasta que se resuelva, siempre antes del final.</li>
      <li>En la demo la cercanía es simulada. En la app real la validaría el servidor con la ubicación.</li>
    </ul></section>
    <section class="card"><h3>Seguridad</h3><ul>
      <li>Solo adultos. Sin forcejeos: una captura es tocar el botón, no al otro jugador.</li>
      <li>Respeta el tráfico y los espacios privados. No hace falta correr.</li>
    </ul></section>
    <section class="card future-note"><h3>Más adelante</h3><ul><li>Modo Infección: ampliación futura, no disponible en esta versión.</li></ul></section>
  </main>`,

  crear: () => {
    const s = state.settings;
    const k = S.huntersTarget(s.players, s.ratio);
    const seg = (key, options) => `<div class="seg" role="group">${options.map(([v, label]) => `<button type="button" data-action="set" data-key="${key}" data-value="${v}" aria-pressed="${String(s[key]) === String(v)}">${label}</button>`).join('')}</div>`;
    return `
  <main class="screen">
    ${topbar('Configurar sala')}
    <section class="card" data-region="mode">
      <h2>Modo de juego</h2>
      <div class="mode-grid">
        <div class="mode-card" aria-current="true"><b>Clásico</b><span>Equipos fijos. Ganan los fugitivos si alguno sigue libre al final.</span></div>
        <button class="mode-card future" type="button" disabled aria-disabled="true"><b>Infección · ampliación futura, no disponible</b></button>
      </div>
    </section>
    <section class="card" data-region="players">
      <h2>Jugadores simulados</h2>
      <div class="stepper">
        <button type="button" data-action="players" data-delta="-1" aria-label="Quitar jugador" ${s.players <= X.minPlayers ? 'disabled' : ''}>−</button>
        <output aria-live="polite">${s.players}<small>incluido tú · ${X.minPlayers}–${X.maxPlayers}</small></output>
        <button type="button" data-action="players" data-delta="1" aria-label="Añadir jugador" ${s.players >= X.maxPlayers ? 'disabled' : ''}>+</button>
      </div>
    </section>
    <section class="card" data-region="assign">
      <h2>Reparto de equipos</h2>
      ${seg('assignment', [['auto', 'Sorteo automático'], ['manual', 'Manual']])}
      <p class="hint">${s.assignment === 'auto' ? 'Se sortean en la sala de espera. Podrás ajustarlos antes de empezar.' : 'Eliges el equipo de cada jugador en la sala de espera.'}</p>
    </section>
    <section class="card" data-region="ratio">
      <h2>Proporción de cazadores <span class="exp">Experimental</span></h2>
      ${seg('ratio', [['pocos', 'Pocos'], ['equilibrado', 'Equilibrada'], ['muchos', 'Muchos']])}
      <div class="preview"><span class="chip hunter">${ICON.hunter} ${k} cazador${k === 1 ? '' : 'es'}</span><span class="chip runner">${ICON.runner} ${s.players - k} fugitivo${s.players - k === 1 ? '' : 's'}</span></div>
      <p class="hint">Fórmula provisional: al menos 1 cazador y como mucho la mitad.</p>
    </section>
    <details class="more" ${state.moreOpen ? 'open' : ''} data-region="more">
      <summary>Duración y zona <span class="exp">Experimental</span></summary>
      <div class="inner">
        <div><div class="field-label">Duración de la caza</div>${seg('durationMin', X.durationsMin.map((m) => [m, `${m} min`]))}</div>
        <div><div class="field-label">Radio de la zona</div>${seg('zoneRadiusM', X.zoneRadiiM.map((r) => [r, `${r} m`]))}</div>
        <div class="switch"><span><b>Zona dinámica</b><br><small class="hint">Encoge y se mueve con aviso previo. Parámetros por definir.</small></span>
          <button type="button" role="switch" aria-checked="${s.dynamicZone}" aria-label="Zona dinámica" data-action="toggle-dynamic"></button></div>
      </div>
    </details>
    <div class="sticky-foot"><button class="btn btn-primary btn-block" data-action="create-room">Crear sala</button></div>
  </main>`;
  },

  sala: () => {
    const room = state.room;
    const isHost = room.players.find((p) => p.isSelf).isHost;
    const counts = S.teamCounts(room);
    const issues = S.validateLobby(room);
    const me = room.players.find((p) => p.isSelf);
    const s = room.settings;
    const ready = S.canStart(room);
    const prev = room.history.at(-1);
    const playerRow = (p) => {
      const editable = isHost;
      const team = editable
        ? `<div class="team-toggle" role="group" aria-label="Equipo de ${esc(p.name)}">
            <button type="button" class="hunter" data-action="team" data-id="${p.id}" data-team="hunter" aria-pressed="${p.team === 'hunter'}">Caza</button>
            <button type="button" class="runner" data-action="team" data-id="${p.id}" data-team="runner" aria-pressed="${p.team === 'runner'}">Fuga</button></div>`
        : `<span class="team-tag ${p.team ?? 'none'}">${teamName(p.team)}</span>`;
      return `<li class="player" data-region="player-${p.id}"><span class="avatar ${p.team ?? ''}">${initial(p.name)}</span>
        <span class="who"><b>${esc(p.name)}</b><small>${p.isHost ? 'Anfitrión · ' : ''}<span class="ready ${p.ready ? 'on' : ''}">${p.ready ? '✓ Listo' : 'Sin confirmar'}</span></small></span>
        ${team}</li>`;
    };
    return `
  <main class="screen">
    ${topbar('Sala de espera', 'inicio')}
    <section class="card">
      <div class="code-box"><span class="code mono" aria-label="Código ${[...room.code].join(' ')}">${esc(room.code)}</span>
        <button class="btn" data-action="copy-code">${ICON.copy} Copiar</button></div>
      <p class="meta-line">Ronda ${room.round} · Clásico · ${room.players.length} jugadores · ${s.durationMin} min · zona ${s.zoneRadiusM} m${s.dynamicZone ? ' dinámica' : ''}</p>
      <p class="hint">Código ficticio: nadie más puede entrar en esta sala simulada.</p>
      ${prev ? `<p class="hint">Ronda ${prev.round}: ${esc(prev.outcome ?? '—')} · ${prev.captures} captura(s).${room.lastPolicy === 'first_captured' ? ' Los primeros capturados empiezan cazando.' : room.lastPolicy === 'redraw' ? ' Equipos sorteados de nuevo.' : room.lastPolicy === 'redraw_fallback' ? ' Nadie fue capturado: equipos sorteados de nuevo.' : ''}</p>` : ''}
    </section>
    <section class="card" data-region="quota">
      <h2>Equipos <span class="exp">Proporción experimental</span></h2>
      <div class="quota">
        <div class="quota-item hunter"><span class="n num">${counts.hunters}</span><small>Cazadores · sugeridos ${counts.target}</small></div>
        <div class="quota-item runner"><span class="n num">${counts.runners}</span><small>Fugitivos${counts.unassigned ? ` · ${counts.unassigned} sin equipo` : ''}</small></div>
      </div>
      ${isHost ? `<button class="btn btn-outline btn-block" style="margin-top:12px" data-action="draw">${room.drawCount ? 'Volver a sortear' : 'Sortear equipos'}</button>
        <p class="hint">${room.drawCount ? `Sorteo nº ${room.drawCount}: reproducible (misma sala y mismo número, mismo reparto).` : s.assignment === 'manual' ? 'Modo manual: asigna cada jugador o usa el sorteo.' : 'Sorteo automático: pulsa para repartir.'}</p>`
        : '<p class="hint">El anfitrión (simulado) ya ha sorteado los equipos.</p>'}
    </section>
    <section class="card">
      <h2>Jugadores</h2>
      <ul class="players">${room.players.map(playerRow).join('')}</ul>
    </section>
    <section class="card" data-region="issues">
      <h2>Antes de empezar</h2>
      <ul class="issues">${issues.length ? issues.map((i) => `<li class="issue ${i.level}">${i.level === 'error' ? '✕' : '!'} ${esc(i.message)}</li>`).join('') : '<li class="issue ok">✓ Todo listo.</li>'}</ul>
    </section>
    <div class="sticky-foot" data-region="foot">
      ${(() => {
        const first = issues.find((i) => i.level === 'error');
        if (first) return `<p class="foot-status error">${esc(first.message)}</p>`;
        return `<p class="foot-status ${isHost ? 'ok' : 'wait'}">${isHost ? 'Todo listo para empezar.' : 'Esperando a que el anfitrión empiece.'}</p>`;
      })()}
      <div class="btn-row">
        <button class="btn ${me.ready ? 'btn-outline' : 'btn-primary'}" data-action="ready" aria-pressed="${me.ready}">${me.ready ? '✓ Estoy listo' : 'Estoy listo'}</button>
        ${isHost
          ? `<button class="btn ${me.ready ? 'btn-primary' : ''}" data-action="start" ${ready ? '' : 'disabled'}>Empezar</button>`
          : `<button class="btn" disabled>${ready ? 'Empezando…' : 'Espera al anfitrión'}</button>`}
      </div>
    </div>
  </main>`;
  },

  partida: () => {
    const g = state.game;
    const me = S.self(g);
    return `
  <main class="game">
    <div class="map-wrap" data-region="map">${mapStatic(g)}</div>
    <div class="hud">
      <div class="hud-row" data-region="hud-top">${hudTop(g, me)}</div>
      <div class="status-strip glass" data-region="hud-meta">${hudMeta(g, me)}</div>
      <div data-region="banners">${banners(g, me)}</div>
    </div>
    <div class="dock">
      <div class="dock-actions" data-region="actions">${dockActions(g, me)}</div>
      <section class="sheet glass" data-region="sheet">${sheet(g, me)}</section>
    </div>
  </main>`;
  },

  final: () => {
    const g = state.game;
    const sum = S.summary(g);
    const room = state.room;
    const win = sum.outcome.winner;
    const disputes = sum.disputes;
    return `
  <main class="screen">
    <div class="topbar"><h1>Fin de la ronda ${g.round}</h1><span class="demo-pill">${MARK} Simulada</span></div>
    <section class="result-hero ${win ?? ''}">
      <div class="role-head"><span class="chip">${win ? teamName(win, true) : 'Sin ganador'}</span><span class="card-brand">${LOCKUP}</span></div>
      <h1>${esc(sum.outcome.title)}</h1>
      <p>${esc(sum.outcome.subtitle)}</p>
      <div class="stats">
        <div class="stat"><b class="num">${sum.captures.length}</b><small>Capturas</small></div>
        <div class="stat"><b class="num">${sum.survivors.length}</b><small>Supervivientes</small></div>
        <div class="stat"><b class="num">${S.formatClock(sum.huntSeconds)}</b><small>De caza</small></div>
      </div>
    </section>
    <section class="card"><h2>Supervivientes</h2>
      ${sum.survivors.length ? `<div class="preview">${sum.survivors.map((n) => `<span class="chip runner">${ICON.runner} ${esc(n)}</span>`).join('')}</div>` : '<p>Ninguno.</p>'}
    </section>
    <section class="card"><h2>Capturas</h2>
      ${sum.captures.length ? `<ul class="list">${sum.captures.map((c) => `<li class="row"><span class="num mono">${c.clock}</span><span class="grow"><b>${esc(c.runnerName)}</b><small>por ${esc(c.hunterName)} · ${esc(c.via)}</small></span></li>`).join('')}</ul>` : '<p>No hubo capturas.</p>'}
    </section>
    ${disputes.length ? `<section class="card"><h2>Disputas</h2><ul class="list">${disputes.map((c) => `<li class="row"><span class="grow"><b>${esc(c.hunterName)} → ${esc(c.runnerName)}</b></span>${claimChip(c)}</li>`).join('')}</ul>
      <p class="hint">Ninguna disputa queda abierta al terminar. Regla predeterminada provisional: si no se resuelve, no hay captura.</p></section>` : ''}
    <section class="card" data-region="policy"><h2>Siguiente ronda</h2>
      ${room.settings.assignment === 'manual'
        ? '<p>Modo manual: los equipos se mantienen y puedes cambiarlos en la sala.</p>'
        : `<div class="seg" role="group">
            <button type="button" data-action="policy" data-value="redraw" aria-pressed="${state.nextPolicy === 'redraw'}">Sorteo nuevo</button>
            <button type="button" data-action="policy" data-value="first_captured" aria-pressed="${state.nextPolicy === 'first_captured'}">Cazan los primeros capturados</button></div>
          <p class="hint">${state.nextPolicy === 'first_captured' ? 'Los primeros capturados empiezan cazando; el resto se sortea.' : 'Equipos nuevos con la misma proporción.'} La rotación equilibrada está pospuesta.</p>`}
    </section>
    <div class="sticky-foot">
      <button class="btn btn-primary btn-block" data-action="next-round">Nueva ronda</button>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-outline" data-action="back-lobby">Volver a la sala</button>
        <button class="btn btn-ghost" data-action="exit">Salir</button>
      </div>
    </div>
  </main>`;
  },
};

// ------------------------------------------------------------------ partida: HUD y paneles

function phaseInfo(g) {
  switch (g.phase) {
    case 'countdown': return { label: 'Preparados', left: -g.t };
    case 'headstart': return { label: 'Ventaja', left: g.headStartS - g.t };
    case 'hunt': return { label: 'Caza', left: g.headStartS + g.durationS - g.t };
    case 'resolving': return { label: 'Resolviendo', left: g.resolutionEndsAt - g.t };
    default: return { label: 'Fin', left: 0 };
  }
}

function hudTop(g, me) {
  const role = me.status === 'captured'
    ? `<div class="role spect">${ICON.spect} Espectador</div>`
    : `<div class="role ${me.team}">${ICON[me.team]} ${teamName(me.team)}</div>`;
  return `<div class="hud-card glass phase-${g.phase}"><div class="timer"><span class="label">${phaseInfo(g).label}</span><span class="clock num" data-bind="clock"></span></div>${role}</div>
    <button class="icon-btn glass" data-action="pause" aria-label="${state.paused ? 'Reanudar' : 'Pausar'} la demo">${state.paused ? ICON.play : ICON.pause}</button>`;
}

function hudMeta(g, self) {
  const zone = S.zoneAt(g, g.t);
  const sep = '<i class="sep" aria-hidden="true"></i>';
  return `<span class="sim">Simulado · sin GPS real</span>${sep}
    <span class="num">Act. hace <span data-bind="lastUpdate"></span></span>${sep}
    <span class="num">Zona ${Math.round(zone.r)} m${S.nextZoneChange(g, g.t) ? ' · cambia en <span data-bind="zoneIn"></span>' : ''}</span>${sep}
    ${state.paused ? '<span class="paused">En pausa</span>' : `<span>×${state.speed}</span>`}`;
}

// Una sola indicación del siguiente paso (prioridades en S.nextStep) y, al principio, cómo moverse.
const STEP_CLASS = { act: 'danger', wait: '', danger: 'danger', zone: 'zone', go: 'go', info: '', muted: 'spect' };

/**
 * Indicación del siguiente paso (S.nextStep) con un único ajuste de texto: en la ventana de
 * resolución, quien no tiene ninguna reclamación abierta solo tiene que esperar. nextStep ya
 * antepone las reclamaciones propias, la reclamación entrante y estar fuera de zona.
 */
export function stepFor(game) {
  const step = S.nextStep(game);
  const me = S.self(game);
  const involved = game.incoming || me.outsideSince !== null
    || game.claims.some((c) => (c.hunterIsSelf || c.runnerId === 'me') && (c.state === 'pending' || c.state === 'disputed'));
  if (game.phase === 'resolving' && me.status === 'active' && !involved) {
    return { tone: 'wait', text: `Tiempo agotado. Otros jugadores están resolviendo disputas: tú no tienes que hacer nada. Resultado en ${S.formatClock(game.resolutionEndsAt - game.t)}.` };
  }
  return step;
}

function banners(g, self) {
  const step = stepFor(g);
  const out = [`<div class="banner glass ${STEP_CLASS[step.tone] ?? ''}" role="status">${esc(step.text)}</div>`];
  const canWalk = self.status === 'active' && g.phase !== 'countdown' && !(self.team === 'hunter' && g.phase === 'headstart');
  if (!state.tapped && canWalk) out.push('<div class="banner glass hint">Toca el mapa para caminar (posición simulada)</div>');
  return out.join('');
}

function openClaimBy(g, who) {
  return g.claims.find((c) => (who === 'hunter' ? c.hunterIsSelf : c.runnerId === 'me') && (c.state === 'pending' || c.state === 'disputed'));
}

function dockActions(g, self) {
  if (self.status === 'captured') {
    return `<button class="btn glass main" disabled>Modo espectador<small>Retraso de ${X.spectatorDelayS} s</small></button>`;
  }
  if (self.team === 'hunter') {
    const open = openClaimBy(g, 'hunter');
    const claimable = S.claimableRunners(g);
    let main;
    if (open) main = `<button class="btn glass main" data-action="show-claim" data-id="${open.id}">Reclamación ${open.state === 'pending' ? 'pendiente' : 'disputada'}<small>${esc(open.runnerName)} · ver estado</small></button>`;
    else if (g.phase !== 'hunt') main = `<button class="btn glass main" disabled>Capturar<small>${g.phase === 'resolving' ? 'El tiempo ha terminado' : 'Disponible al empezar la caza'}</small></button>`;
    else if (self.outsideSince !== null) main = '<button class="btn glass main" disabled>Capturar<small>Vuelve a la zona</small></button>';
    else if (claimable.length) main = `<button class="btn btn-primary main" data-action="claim"><span class="btn-line">${ICON.hunter}Capturar${claimable.length === 1 ? ` a ${esc(claimable[0].name)}` : ` (${claimable.length})`}</span><small>Cercanía simulada</small></button>`;
    else main = `<button class="btn glass main" disabled>Capturar<small>Acércate a ≤ ${X.captureRadiusM} m (simulado)</small></button>`;
    const sc = g.scan;
    const scanReady = g.phase === 'hunt' && sc.left > 0 && g.t >= sc.readyAt && self.outsideSince === null;
    const scanSub = sc.left <= 0 ? 'Sin usos' : g.phase !== 'hunt' ? `${sc.left} usos` : g.t < sc.readyAt ? 'Recarga <span data-bind="scanCd"></span>' : `${sc.left} uso${sc.left === 1 ? '' : 's'}`;
    return `${main}<button class="btn glass side" data-action="scan" ${scanReady ? '' : 'disabled'}>Escáner<small>${scanSub}</small></button>`;
  }
  const open = openClaimBy(g, 'runner');
  const main = open
    ? `<button class="btn btn-danger main" data-action="show-dispute" data-id="${open.id}">Disputa abierta<small>con ${esc(open.hunterName)} · ver</small></button>`
    : `<button class="btn glass main" data-action="self-tag" ${g.phase === 'hunt' ? '' : 'disabled'}>Me han pillado<small>${g.phase === 'hunt' ? 'Declarar captura' : 'Disponible en la caza'}</small></button>`;
  return main;
}

function claimChip(c) {
  const labels = {
    pending: ['pending', 'Pendiente'], confirmed: ['confirmed', 'Confirmada'], disputed: ['disputed', 'Disputada'],
    accepted: ['accepted', 'Aceptada tras disputa'], withdrawn: ['closed', 'Retirada'], default_no_capture: ['closed', 'Sin captura (regla)'],
    timeout: ['closed', 'Sin respuesta · sin captura'],
  };
  const [cls, label] = labels[c.state] ?? ['closed', c.state];
  return `<span class="state ${cls}">${label}</span>`;
}

function sheet(g, self) {
  const ping = g.pings.at(-1);
  let summaryLine;
  if (g.phase === 'countdown' || g.phase === 'headstart') summaryLine = 'Las pistas empiezan con la caza';
  else if (self.team === 'hunter' && ping) summaryLine = `Pista #${ping.n} · hace <span data-age="${ping.t}"></span>`;
  else summaryLine = g.phase === 'hunt' ? 'Próxima pista en <span data-bind="nextPing"></span>' : 'Sin más pistas';
  const head = `<button class="sheet-handle" data-action="sheet" aria-expanded="${state.sheetOpen}"><span class="grab"></span><b>Panel</b><span>${summaryLine}</span><b aria-hidden="true">${state.sheetOpen ? '▾' : '▴'}</b></button>`;
  if (!state.sheetOpen) return head;
  const tabs = [['pistas', 'Pistas'], ['capturas', 'Capturas'], ['jugadores', 'Equipos'], ['demo', 'Demo']];
  const tabBar = `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${state.tab === k}" data-action="tab" data-tab="${k}">${l}${k === 'capturas' && g.claims.some((c) => c.state === 'disputed') ? ' •' : ''}</button>`).join('')}</div>`;
  return `${head}${tabBar}<div class="sheet-body">${sheetBody(g, self)}</div>`;
}

/** Pestaña «Pistas» (pura: sin DOM ni estado de la interfaz). */
export function cluesBody(g, self) {
  const rows = [];
  // Antes de la primera pista, el fugitivo ya ve la cuenta atrás en «Lo que recibieron de ti».
  const trailCountdown = self.team === 'runner' && S.ownTrail(g)?.status === 'none';
  if (g.phase === 'hunt' && !trailCountdown) rows.push(`<div class="row"><span class="grow">Próxima pista en <b class="num" data-bind="nextPing"></b><small>Cada ${X.pingEveryS / 60} min (experimental)</small></span></div>`);
  if (self.team === 'hunter') {
    const ping = g.pings.at(-1);
    if (!ping) rows.push('<p class="empty">Aún no hay pistas.</p>');
    else {
      rows.push(`<p class="empty">Pista #${ping.n}: posiciones de hace un rato, no en directo.</p>`);
      for (const e of ping.entries) {
        const alive = g.players.find((p) => p.id === e.id)?.status === 'active';
        rows.push(`<div class="row"><span class="grow"><b>${esc(e.name)}</b><small>${alive ? 'Posición de hace ' : 'Capturado · dato de hace '}<span data-age="${e.measuredAt}"></span></small></span>
          ${alive && self.status === 'active' ? `<button class="btn" data-action="walk-to" data-x="${e.pos.x.toFixed(1)}" data-y="${e.pos.y.toFixed(1)}">Ir allí</button>` : ''}</div>`);
      }
    }
    if (g.scan.last) rows.push(`<div class="row"><span class="grow">Escáner: <b>${g.scan.last.count}</b> fugitivo(s) a menos de ${X.scan.radiusM} m<small>Aproximado · hace <span data-age="${g.scan.last.t}"></span> · quedan ${g.scan.left} usos</small></span></div>`);
  } else {
    rows.push(`<p class="empty">Los cazadores reciben tu última posición conocida en cada pista. Nunca ves a los cazadores.</p>`);
    rows.push(trailPanel(g));
  }
  return rows.join('');
}

function sheetBody(g, self) {
  if (state.tab === 'pistas') return cluesBody(g, self);
  if (state.tab === 'capturas') {
    if (!g.claims.length) return '<p class="empty">Todavía no hay reclamaciones.</p>';
    return [...g.claims].reverse().map((c) => {
      let action = '';
      if (c.state === 'disputed' && c.hunterIsSelf) action = `<button class="btn" data-action="withdraw" data-id="${c.id}">Retirar</button>`;
      if (c.state === 'disputed' && c.runnerId === 'me') action = `<button class="btn" data-action="accept-dispute" data-id="${c.id}">Aceptar</button>`;
      return `<div class="row"><span class="grow"><b>${esc(c.hunterName)} → ${esc(c.runnerName)}</b><small>hace <span data-age="${c.since}"></span></small></span>${claimChip(c)}${action}</div>`;
    }).join('') + '<p class="empty">Una captura disputada no elimina a nadie: queda pendiente hasta resolverse.</p>';
  }
  if (state.tab === 'jugadores') {
    const list = (team) => g.players.filter((p) => p.team === team).map((p) => `<div class="row"><span class="avatar ${team}">${initial(p.name)}</span><span class="grow"><b>${esc(p.name)}</b><small>${p.status === 'captured' ? 'Capturado' : 'En juego'}</small></span></div>`).join('');
    return `<p class="section-label hunter">${teamName('hunter', true)}</p>${list('hunter')}<p class="section-label runner">${teamName('runner', true)}</p>${list('runner')}`;
  }
  return `<div class="demo-ctrl">
    <div class="field-label">Velocidad de la demo</div>
    <div class="seg" role="group">${X.demoSpeeds.map((v) => `<button type="button" data-action="speed" data-value="${v}" aria-pressed="${state.speed === v}">×${v}</button>`).join('')}</div>
    <div class="switch"><span>Vibración en los avisos</span><button type="button" role="switch" aria-checked="${state.vibrate}" aria-label="Vibración" data-action="toggle-vibrate"></button></div>
    <div class="switch"><span>Sonido<br><small class="hint">No disponible en la demo</small></span><button type="button" role="switch" aria-checked="false" aria-label="Sonido (no disponible)" disabled></button></div>
    <button class="btn btn-danger" data-action="ask-end">Terminar partida (anfitrión)</button>
    <p class="hint">Controles exclusivos de la demo: en una partida real el tiempo no se acelera ni se pausa.</p>
  </div>`;
}

function gameBinds(g) {
  const self = S.self(g);
  const upcoming = S.nextZoneChange(g, g.t);
  const binds = {
    clock: S.formatClock(phaseInfo(g).left),
    lastUpdate: ago(g.t - self.lastUpdate),
    nextPing: g.nextPingAt !== null ? S.formatClock(g.nextPingAt - g.t) : '—',
    scanCd: S.formatClock(g.scan.readyAt - g.t),
    incomingLeft: g.incoming ? S.formatClock(X.incomingTimeoutS - (g.t - g.incoming.since)) : '0:00',
  };
  if (upcoming) {
    binds.zoneIn = S.formatClock(upcoming.at - g.t);
  }
  return Object.assign(binds, trailBinds(g));
}

// ------------------------------------------------------------------ rastro propio del fugitivo
// Única fuente: S.ownTrail(game), que solo devuelve datos propios (nunca de cazadores ni de otros
// fugitivos). Funciones puras y exportadas para poder probarlas sin navegador.

const ME_HALO_PX = 22; // radio del halo de «Tú» en píxeles de pantalla
const TRAIL_PX = 12;

/**
 * Marcador del rastro (forma y etiqueta por separado, para colocar la etiqueta con las demás).
 * Si la posición comunicada coincide con «Tú», el anillo se amplía hasta rodear el halo: la
 * posición dibujada sigue siendo la histórica, solo cambia el tamaño en pantalla.
 */
function trailParts(game, u) {
  const trail = S.ownTrail(game);
  if (!trail || trail.status !== 'sent') return null;
  const { x, y } = trail.pos;
  const me = S.self(game).pos;
  const r = Math.hypot(x - me.x, y - me.y) / u < ME_HALO_PX + 4 ? ME_HALO_PX + 7 : TRAIL_PX;
  return {
    r,
    shape: `<circle cx="${x}" cy="${y}" r="${r * u}" class="mk-trail" stroke-width="${2.5 * u}" stroke-dasharray="${4 * u} ${3 * u}"/>`,
    label: { owner: 'trail', x, y, r, text: `Recibieron · hace ${ago(trail.ageNow)}`, tone: 'dim', prio: 1 },
  };
}

/** Marcador en la última posición comunicada: círculo discontinuo de tamaño fijo en pantalla. */
export function trailMarker(game, u) {
  const p = trailParts(game, u);
  return p ? p.shape + label(p.label.x, p.label.y - (p.r + 6) * u, p.label.text, u, 'dim') : '';
}

/** Filas del panel de pistas del fugitivo. Lo que cambia cada segundo va por data-bind (trailBinds). */
export function trailPanel(game) {
  const trail = S.ownTrail(game);
  if (!trail) return '';
  const rows = ['<p class="section-label">Lo que recibieron de ti</p>'];
  if (trail.status === 'none') {
    rows.push(`<div class="row"><span class="grow">Aún no han recibido ninguna pista con tu posición.${trail.nextPingIn !== null ? '<small>Primera pista en <span class="num" data-bind="trailNext"></span></small>' : ''}</span></div>`);
  } else if (trail.status === 'unavailable') {
    rows.push(`<div class="row"><span class="grow">La pista #${trail.pingN} no incluía una posición tuya disponible.<small>No hay nada que marcar en el mapa.</small></span></div>`);
  } else {
    rows.push(`<div class="row"><span class="trail-key" aria-hidden="true"></span><span class="grow">Pista #${trail.pingN}: recibieron tu posición de hace <b class="num" data-bind="trailAge"></b><small>Medida ${ago(trail.sentAt - trail.measuredAt)} antes del envío · círculo discontinuo en el mapa (posición simulada)</small></span></div>`);
    if (trail.exposedLive) rows.push('<div class="row alert"><span class="grow">Mientras estés fuera de la zona, los cazadores te ven en directo.</span></div>');
  }
  return rows.join('');
}

/** Textos que cambian con el tiempo del simulador. La antigüedad se mide desde la medición. */
export function trailBinds(game) {
  const trail = S.ownTrail(game);
  if (trail?.status === 'sent') return { trailAge: ago(trail.ageNow) };
  if (trail?.status === 'none' && trail.nextPingIn !== null) return { trailNext: S.formatClock(trail.nextPingIn) };
  return {};
}

// ------------------------------------------------------------------ mapa esquemático (SVG propio)

function mapExtent(g) {
  return g.zones[0].r * 1.25;
}

function streets(g) {
  const E = mapExtent(g) * 3;
  const random = S.mulberry32(g.seed ^ 0x5a5a);
  const angle = -18 + random() * 36;
  const gap = 70 + random() * 20;
  const lines = [];
  for (let i = -Math.ceil(E / gap); i <= Math.ceil(E / gap); i++) {
    const off = i * gap + (random() - 0.5) * 12;
    const avenue = i % 4 === 0;
    lines.push(`<line x1="${-E}" y1="${off}" x2="${E}" y2="${off}" class="${avenue ? 'av' : 'st'}"/>`);
    const off2 = i * gap * 1.1 + (random() - 0.5) * 12;
    lines.push(`<line x1="${off2}" y1="${-E}" x2="${off2}" y2="${E}" class="${i % 5 === 0 ? 'av' : 'st'}"/>`);
  }
  const r0 = g.zones[0].r;
  const park = { x: (random() - 0.5) * r0, y: (random() - 0.5) * r0, w: 110 + random() * 80, h: 80 + random() * 60 };
  const riverY = (random() < 0.5 ? -1 : 1) * r0 * (1.05 + random() * 0.2);
  const river = `M ${-E} ${riverY} C ${-E / 3} ${riverY - 120}, ${E / 3} ${riverY + 140}, ${E} ${riverY - 40}`;
  return `<g transform="rotate(${angle.toFixed(1)})">
      <path d="${river}" class="mz-river"/>
      ${lines.join('')}
      <rect x="${park.x}" y="${park.y}" width="${park.w}" height="${park.h}" rx="18" class="mz-park"/>
    </g>`;
}

function mapStatic(g) {
  const E = mapExtent(g);
  const zone = S.zoneAt(g, g.t);
  const upcoming = S.nextZoneChange(g, g.t);
  const showNext = upcoming && upcoming.at - g.t <= X.dynamicZone.warnS;
  const big = E * 4;
  const c = zone.center;
  const hole = `M ${-big} ${-big} H ${big} V ${big} H ${-big} Z M ${c.x - zone.r} ${c.y} a ${zone.r} ${zone.r} 0 1 0 ${zone.r * 2} 0 a ${zone.r} ${zone.r} 0 1 0 ${-zone.r * 2} 0 Z`;
  return `<svg class="map" viewBox="${-E} ${-E} ${2 * E} ${2 * E}" preserveAspectRatio="xMidYMid meet" data-action="map" role="img"
      aria-label="Mapa esquemático simulado de la zona de juego">
    <rect x="${-big}" y="${-big}" width="${2 * big}" height="${2 * big}" class="mz-bg"/>
    ${streets(g)}
    <path d="${hole}" class="mz-out" fill-rule="evenodd"/>
    <circle cx="${c.x}" cy="${c.y}" r="${zone.r}" class="mz-zone" vector-effect="non-scaling-stroke"/>
    <text x="${c.x}" y="${c.y + zone.r + E * 0.09}" font-size="${E * 0.06}" class="mz-note" text-anchor="middle">Plano esquemático · no es un mapa real</text>
    ${showNext ? `<circle cx="${upcoming.center.x}" cy="${upcoming.center.y}" r="${upcoming.r}" class="mz-next" vector-effect="non-scaling-stroke"/>` : ''}
    <g id="m-dyn"></g>
  </svg>`;
}

let unitCache = { w: 0, h: 0, u: 1 };
function unitsPerPx(svg, g) {
  const r = svg.getBoundingClientRect();
  if (r.width !== unitCache.w || r.height !== unitCache.h || unitCache.E !== mapExtent(g)) {
    unitCache = { w: r.width, h: r.height, E: mapExtent(g), u: (2 * mapExtent(g)) / Math.max(1, Math.min(r.width, r.height)) };
  }
  return unitCache.u;
}

/** tone: '' (texto), 'me' (lima), 'dim' (secundario), 'hunter'. El equipo se distingue por la forma, no por la etiqueta. */
function label(x, y, text, u, tone = '', size = 12) {
  return `<text x="${x}" y="${y}" class="m-label ${tone}" font-size="${size * u}" stroke-width="${3 * u}" text-anchor="middle">${esc(text)}</text>`;
}

function marker(team, x, y, u, opts = {}) {
  const s = (opts.size ?? 10) * u;
  const op = opts.opacity ?? 1;
  if (opts.hollow) return `<circle cx="${x}" cy="${y}" r="${s}" class="mk-ping" stroke-width="${2.5 * u}" stroke-dasharray="${4 * u} ${3 * u}" opacity="${op}"/>`;
  if (team === 'hunter') return `<path d="M ${x} ${y - s * 1.15} L ${x + s} ${y + s * 0.75} L ${x - s} ${y + s * 0.75} Z" class="mk-h" stroke-width="${2 * u}" opacity="${op}"/>`;
  return `<circle cx="${x}" cy="${y}" r="${s * 0.85}" class="mk-r" stroke-width="${2 * u}" opacity="${op}"/>`;
}

// ------------------------------------------------------------------ etiquetas del mapa

// Caja aproximada de una etiqueta (anchura media de carácter ≈ 0,6 em en negrita), en unidades del plano.
function labelBox(cx, baseline, text, size, u) {
  const w = (text.length * size * 0.6 + 4) * u;
  return { x1: cx - w / 2, x2: cx + w / 2, y1: baseline - (size * 0.9 + 2) * u, y2: baseline + (size * 0.25 + 2) * u };
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

/**
 * Colocación sencilla: por prioridad (0 primero), cada etiqueta prueba unas pocas posiciones
 * alrededor de su marcador (encima, debajo, a los lados, hasta tres líneas más lejos) y se queda con
 * la primera que no choca con etiquetas ya colocadas ni con otros marcadores; si todas chocan, con
 * la que menos se solapa. Los marcadores nunca se mueven.
 * items: { owner, x, y, r (px), text, tone, prio, size?, prefer? } · markers: cajas { owner, x1, x2, y1, y2 }
 * view (opcional): caja visible del mapa; salirse de ella cuenta como solapamiento (se recortaría).
 */
export function placeLabels(items, markers, u, view = null) {
  const placed = [];
  const order = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.prio - b.it.prio || a.i - b.i);
  for (const { it } of order) {
    const size = it.size ?? 12;
    const half = (it.text.length * size * 0.6) / 2;
    const above = -(it.r + 6);
    const below = it.r + 5 + size * 0.9;
    const line = size * 1.3;
    const side = it.r + 6 + half;
    const mid = size * 0.35;
    const cands = [[0, above], [0, below], [side, mid], [-side, mid], [0, above - line], [0, below + line],
      [side, mid - line], [-side, mid - line], [side, mid + line], [-side, mid + line],
      [0, above - 2 * line], [0, below + 2 * line], [0, above - 3 * line], [0, below + 3 * line]];
    if (it.prefer === 'below') cands.unshift(cands.splice(1, 1)[0]);
    let best = null;
    for (const [dx, dy] of cands) {
      const x = it.x + dx * u;
      const y = it.y + dy * u;
      const box = labelBox(x, y, it.text, size, u);
      // Texto sobre texto es lo peor (ilegible); texto sobre un marcador, menos grave.
      let cost = 0;
      for (const p of placed) cost += 4 * overlapArea(box, p.box);
      for (const m of markers) if (m.owner !== it.owner) cost += overlapArea(box, m);
      if (view) cost += 4 * ((box.x2 - box.x1) * (box.y2 - box.y1) - overlapArea(box, view));
      if (!best || cost < best.cost) best = { x, y, box, cost };
      if (cost === 0) break;
    }
    placed.push({ ...it, size, x: best.x, y: best.y, box: best.box, overlap: best.cost > 0 });
  }
  return placed;
}

/**
 * Contenido dinámico del mapa en unidades del plano (u = unidades por píxel): formas en orden de
 * dibujo (compañeros debajo, pistas y rastro encima, «Tú» al final) y etiquetas ya colocadas.
 * Solo usa lo que el jugador puede ver (S.visibleFor y S.ownTrail).
 */
export function mapScene(g, u, view = null) {
  const self = S.self(g);
  const back = [];
  const front = [];
  const mine = [];
  const items = [];
  const markers = [];
  const disc = (owner, x, y, r) => markers.push({ owner, x1: x - r * u, x2: x + r * u, y1: y - r * u, y2: y + r * u });
  const early = g.phase === 'countdown' || g.phase === 'headstart';
  back.push(`<circle cx="0" cy="0" r="${4 * u}" class="mk-meet"/>`);
  disc('meet', 0, 0, 4);
  if (early) items.push({ owner: 'meet', x: 0, y: 0, r: 4, text: 'Encuentro', tone: 'dim', prio: 4 });
  if (g.scan.last && g.t - g.scan.last.t < 10) {
    const a = g.scan.last.at;
    back.push(`<circle cx="${a.x}" cy="${a.y}" r="${X.scan.radiusM}" class="mk-scan scan-ring" stroke-width="${2 * u}"/>`);
    items.push({ owner: 'scan', x: a.x, y: a.y - X.scan.radiusM, r: 0, text: `${g.scan.last.count} cerca (aprox.)`, tone: 'hunter', prio: 2 });
  }
  for (const v of S.visibleFor(g)) {
    const { x, y } = v.pos;
    if (v.kind === 'ping') {
      front.push(marker('runner', x, y, u, { hollow: true, size: 11 }));
      disc(v.id, x, y, 11);
      items.push({ owner: v.id, x, y, r: 11, text: `${v.name} · hace ${ago(v.age)}`, tone: 'dim', prio: 1 });
    } else if (v.kind === 'exposed') {
      front.push(`<circle cx="${x}" cy="${y}" r="${16 * u}" class="mk-ring pulse" stroke-width="${2 * u}"/>`, marker('runner', x, y, u));
      disc(v.id, x, y, 16);
      items.push({ owner: v.id, x, y, r: 16, text: `${v.name} · fuera de zona`, tone: '', prio: 1 });
    } else {
      back.push(marker(v.team, x, y, u, { opacity: v.kind === 'spectator' ? 0.7 : 1 }));
      disc(v.id, x, y, 10);
      items.push({ owner: v.id, x, y, r: 10, text: v.kind === 'spectator' ? `${v.name} · −${X.spectatorDelayS} s` : v.name, tone: '', prio: 3 });
    }
  }
  // Rastro propio (solo fugitivo activo con pista válida); debajo de «Tú».
  const trail = trailParts(g, u);
  if (trail) {
    front.push(trail.shape);
    disc('trail', trail.label.x, trail.label.y, trail.r);
    items.push(trail.label);
  }
  if (self.status === 'active') {
    const { x, y } = self.pos;
    if (self.target) {
      mine.push(`<line x1="${x}" y1="${y}" x2="${self.target.x}" y2="${self.target.y}" class="mk-route" stroke-width="${2 * u}" stroke-dasharray="${4 * u} ${4 * u}" opacity="0.8"/>`);
      mine.push(`<circle cx="${self.target.x}" cy="${self.target.y}" r="${6 * u}" class="mk-route" stroke-width="${2.5 * u}"/>`);
    }
    if (self.team === 'hunter' && g.phase === 'hunt') mine.push(`<circle cx="${x}" cy="${y}" r="${X.captureRadiusM}" class="mk-reach" stroke-width="${1.2 * u}" stroke-dasharray="${3 * u} ${3 * u}"/>`);
    // Tú: el elemento más visible del mapa (halo, anillo del equipo y núcleo lima).
    mine.push(`<circle cx="${x}" cy="${y}" r="${ME_HALO_PX * u}" class="mk-me-halo"/>`);
    mine.push(`<circle cx="${x}" cy="${y}" r="${13 * u}" class="mk-me-ring ${self.team}" stroke-width="${3 * u}"/>`);
    mine.push(`<circle cx="${x}" cy="${y}" r="${8 * u}" class="mk-me-core"/>`);
    disc('me', x, y, 15);
    items.push({ owner: 'me', x, y, r: 13, text: 'Tú', tone: 'me', size: 14, prio: 0, prefer: 'below' });
  }
  return { shapes: [...back, ...front, ...mine], labels: placeLabels(items, markers, u, view) };
}

function paintMarkers() {
  const g = state.game;
  const svg = document.querySelector('.map');
  const dyn = document.getElementById('m-dyn');
  if (!g || !svg || !dyn) return;
  const u = unitsPerPx(svg, g);
  // Parte visible del plano: el SVG sin lo que tapan el HUD (arriba) y el dock (abajo), con 4 px de
  // margen. El viewBox está centrado en 0,0 y escalado con «meet»: misma escala u en ambos ejes.
  const r = svg.getBoundingClientRect();
  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  const dock = document.querySelector('.dock')?.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const top = Math.max(r.top, hud ? hud.bottom : r.top) + 4;
  const bottom = Math.min(r.bottom, dock ? dock.top : r.bottom) - 4;
  const view = { x1: (r.left + 4 - cx) * u, x2: (r.right - 4 - cx) * u, y1: (top - cy) * u, y2: (bottom - cy) * u };
  const { shapes, labels } = mapScene(g, u, view);
  // Las etiquetas van encima de todas las formas; las más importantes, las últimas (encima).
  const html = shapes.join('') + [...labels].reverse().map((l) => label(l.x, l.y, l.text, u, l.tone, l.size)).join('');
  if (dyn._html !== html) {
    dyn.innerHTML = html;
    dyn._html = html;
  }
}

// ------------------------------------------------------------------ capas: modales y cuenta atrás

function renderLayer() {
  const g = state.game;
  let html = '';
  if (state.route === 'partida' && g && state.roleCard) return roleCard(g);
  if (state.route === 'partida' && g && g.phase === 'countdown') {
    html += `<div class="countdown" aria-live="assertive"><div><b class="num">${Math.max(1, Math.ceil(-g.t))}</b><small>${esc(S.nextStep(g).text)}<br>Partida simulada</small></div></div>`;
  }
  if (state.route === 'partida' && g && state.finishing) {
    html += `<div class="countdown"><div><b style="font-size:64px">Fin</b><small>${esc(g.outcome?.title ?? '')}</small></div></div>`;
  }
  const m = state.modal;
  if (!m) return html;
  const wrap = (inner, label) => `<div class="overlay" data-action="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}">${inner}</div></div>`;
  const disclaimer = '<p class="disclaimer">Simulación: en la demo la cercanía no se mide. En la app real, el servidor comprobaría que la cercanía GPS es plausible y el fugitivo confirmaría.</p>';
  if (m.type === 'leave') {
    return html + wrap(`<h2>¿Salir de la partida?</h2><p>La partida simulada terminará y verás el resumen.</p>
      <div class="btn-row"><button class="btn" data-action="close" data-autofocus>Seguir jugando</button><button class="btn btn-danger" data-action="end-game">Terminar</button></div>`, 'Salir de la partida');
  }
  if (m.type === 'end') {
    return html + wrap(`<h2>¿Terminar la partida?</h2><p>Como anfitrión puedes terminarla ya. No habrá ganador.</p>
      <div class="btn-row"><button class="btn" data-action="close" data-autofocus>Cancelar</button><button class="btn btn-danger" data-action="end-game">Terminar</button></div>`, 'Terminar partida');
  }
  if (m.type === 'self-tag') {
    return html + wrap(`<h2>¿Te han pillado?</h2><p>Declaras tu propia captura. Pasarás a modo espectador.</p>
      <div class="btn-row"><button class="btn" data-action="close" data-autofocus>No</button><button class="btn btn-danger" data-action="confirm-self-tag">Sí, me han pillado</button></div>`, 'Declarar captura');
  }
  if (m.type === 'pick') {
    const list = S.claimableRunners(g);
    return html + wrap(`<h2>¿A quién capturas?</h2>${list.length ? list.map((r) => `<button class="btn btn-block" data-action="claim-runner" data-id="${r.id}">${esc(r.name)}</button>`).join('') : '<p>Ya no hay nadie a tu alcance.</p>'}
      <button class="btn btn-ghost" data-action="close">Cancelar</button>${disclaimer}`, 'Elegir fugitivo');
  }
  if (m.type === 'claim') {
    const c = g?.claims.find((x) => x.id === m.id);
    if (!c) return html;
    const states = {
      pending: `<div class="big-state pending"><span class="spinner"></span> Pendiente: esperando a que ${esc(c.runnerName)} confirme…</div><p>Hasta que confirme, sigue en juego.</p>`,
      confirmed: `<div class="big-state ok">✓ Captura confirmada</div><p>${esc(c.runnerName)} ha confirmado. Pasa a modo espectador.</p>`,
      accepted: `<div class="big-state ok">✓ Aceptada tras la disputa</div>`,
      disputed: `<div class="big-state dispute">⚠ Disputada: queda pendiente</div><p>${esc(c.runnerName)} dice que no le has pillado. Sigue en juego mientras esté pendiente. Debe resolverse antes del final; si no, no hay captura (regla provisional).</p>`,
      withdrawn: '<div class="big-state closed">Reclamación retirada</div>',
      default_no_capture: '<div class="big-state closed">Sin captura (regla provisional)</div>',
    };
    const actions = c.state === 'disputed'
      ? `<div class="btn-row"><button class="btn" data-action="close">Mantener</button><button class="btn btn-danger" data-action="withdraw" data-id="${c.id}">Retirar</button></div>`
      : `<button class="btn ${c.state === 'pending' ? '' : 'btn-primary'}" data-action="close" data-autofocus>${c.state === 'pending' ? 'Seguir jugando' : 'Cerrar'}</button>`;
    return html + wrap(`<h2>Captura de ${esc(c.runnerName)}</h2>${states[c.state] ?? ''}${actions}${disclaimer}`, 'Estado de la captura');
  }
  if (m.type === 'incoming') {
    if (!g.incoming) {
      return html + wrap(`<h2>Reclamación cerrada</h2><p>${m.result === 'accepted' ? 'Has confirmado la captura. Pasas a modo espectador.' : m.result === 'disputed' ? 'Has disputado la captura: sigues en juego mientras esté pendiente.' : 'No respondiste a tiempo: no hay captura (regla provisional).'}</p>
        <button class="btn btn-primary" data-action="close" data-autofocus>Entendido</button>`, 'Reclamación');
    }
    return html + wrap(`<h2>${esc(g.incoming.hunterName)} dice que te ha pillado</h2>
      <div class="big-state pending"><span class="spinner"></span> Responde en <span class="num" data-bind="incomingLeft"></span></div>
      <p>¿Es verdad? Si lo disputas, sigues en juego y queda pendiente.</p>
      <div class="btn-row"><button class="btn btn-danger" data-action="incoming" data-accept="1">Sí, me ha pillado</button><button class="btn" data-action="incoming" data-accept="0">No, lo disputo</button></div>${disclaimer}`, 'Reclamación de captura');
  }
  if (m.type === 'dispute') {
    const c = g?.claims.find((x) => x.id === m.id);
    if (!c) return html;
    const open = c.state === 'disputed';
    return html + wrap(`<h2>Disputa con ${esc(c.hunterName)}</h2>
      <div class="big-state ${open ? 'dispute' : 'closed'}">${open ? 'Disputa abierta: sigues en juego' : 'Disputa cerrada'} ${claimChip(c)}</div>
      <p>${open ? 'Sigues en juego. Si cambias de opinión, puedes aceptar la captura. Si nadie la resuelve antes del final, no hay captura (regla provisional).' : 'Esta disputa ya está cerrada.'}</p>
      <div class="btn-row"><button class="btn" data-action="close" data-autofocus>Cerrar</button>${open ? `<button class="btn btn-danger" data-action="accept-dispute" data-id="${c.id}">Aceptar la captura</button>` : ''}</div>`, 'Disputa');
  }
  return html;
}

/**
 * Tarjeta de rol: se queda abierta (con el reloj parado) hasta pulsar «Entendido». Tocar fuera no
 * la cierra. Sin temporizadores nuevos: solo deja de avanzar el tiempo simulado mientras se lee.
 */
const ROLE_TEXT = {
  hunter: {
    title: 'Eres cazador',
    goal: 'Captura a todos los fugitivos antes de que acabe el tiempo.',
    now: (g) => `Espera en el punto de encuentro. Sales cuando acabe la ventaja (${S.formatClock(g.headStartS)}).`,
  },
  runner: {
    title: 'Eres fugitivo',
    goal: 'Que no te capturen hasta que acabe el tiempo.',
    now: (g) => `Aléjate caminando y escóndete dentro de la zona. Los cazadores salen en ${S.formatClock(g.headStartS)}.`,
  },
};

function roleCard(g) {
  const team = S.self(g).team;
  const t = ROLE_TEXT[team];
  return `<div class="overlay"><div class="modal role-card ${team}" role="dialog" aria-modal="true" aria-labelledby="role-title">
    <div class="role-head"><div class="role ${team}">${ICON[team]} ${teamName(team)}</div><span class="card-brand">${LOCKUP}</span></div>
    <h2 id="role-title">${t.title}</h2>
    <div class="role-step"><span class="section-label">Objetivo</span><p>${t.goal}</p></div>
    <div class="role-step"><span class="section-label">Ahora</span><p>${esc(t.now(g))}</p></div>
    <p class="safety">Juega caminando, mira al cruzar y no entres en propiedades privadas.</p>
    <button class="btn btn-primary btn-block" data-action="role-ok" data-autofocus>Entendido</button>
    <p class="disclaimer">El reloj de la partida no corre hasta que pulses «Entendido».</p>
  </div></div>`;
}

// ------------------------------------------------------------------ bucle de la partida

let loopTimer = null;
let lastFrame = 0;
let lobbyTimer = null;

function startLoop() {
  stopLoop();
  lastFrame = performance.now();
  loopTimer = setInterval(frame, 100);
}
function stopLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  const g = state.game;
  if (!g || state.route !== 'partida') return;
  // La tarjeta de rol solo tiene sentido antes de la cuenta atrás; si la partida acaba antes, se cierra.
  if (state.roleCard && g.phase !== 'countdown') state.roleCard = false;
  if (!state.paused && !state.roleCard && !document.hidden && g.phase !== 'finished') S.stepGame(g, dt * state.speed);
  handleEvents(g);
  if (g.phase === 'finished' && !state.finishing) {
    state.finishing = true;
    state.modal = null;
    buzz([120, 60, 120, 60, 240]);
    setTimeout(() => {
      state.finishing = false;
      state.leaving = true;
      stopLoop();
      go('final', true);
    }, 1600);
  }
  paint();
}

/**
 * Aviso para el fugitivo cuando sale una pista. Solo si es un fugitivo ACTIVO y la pista incluye
 * de verdad una posición suya (S.ownTrail): un capturado o un cazador no lo reciben.
 */
export function pingToast(game) {
  return S.ownTrail(game)?.status === 'sent' ? 'Los cazadores acaban de recibir una pista con tu última posición.' : null;
}

function handleEvents(g) {
  while (state.lastEvent < g.events.length) {
    const e = g.events[state.lastEvent++];
    switch (e.type) {
      case 'phase': toast(e.text, 'info'); buzz([200]); break;
      // La indicación del siguiente paso ya cubre la pista del cazador y la zona: solo vibran,
      // para no repetir el mismo mensaje en dos sitios.
      case 'ping': {
        const text = pingToast(g);
        if (text) toast(text, 'ping');
        buzz([80, 60, 80]);
        break;
      }
      case 'zone': buzz([300]); break;
      case 'capture': toast(e.text, 'capture'); buzz([150, 80, 150]); break;
      case 'dispute': toast(e.text, 'dispute'); break;
      case 'scan': break;
      case 'incoming':
        state.modal = { type: 'incoming' };
        buzz([400, 120, 400]);
        break;
      case 'resolving': toast(e.text, 'dispute'); break;
      default: break;
    }
  }
  // Si la reclamación entrante caduca con el modal abierto, el modal muestra el resultado.
}

function startLobby() {
  stopLobby();
  state.hostStartAt = null;
  lobbyTimer = setInterval(() => {
    const room = state.room;
    if (!room || state.route !== 'sala') return stopLobby();
    const waiting = room.players.filter((p) => !p.isSelf && !p.ready);
    if (waiting.length && Math.random() < 0.6) waiting[Math.floor(Math.random() * waiting.length)].ready = true;
    if (room.joined && S.canStart(room)) {
      state.hostStartAt ??= performance.now() + 1500;
      if (performance.now() >= state.hostStartAt) {
        toast('El anfitrión ha empezado la partida.', 'info');
        return startGame();
      }
    } else state.hostStartAt = null;
    paint();
  }, 350);
}
function stopLobby() {
  if (lobbyTimer) clearInterval(lobbyTimer);
  lobbyTimer = null;
}

function startGame() {
  stopLobby();
  state.game = S.startGame(state.room);
  state.lastEvent = 0;
  state.modal = null;
  state.sheetOpen = false;
  state.tab = 'pistas';
  state.paused = false;
  state.finishing = false;
  state.tapped = false;
  state.roleCard = true;
  go('partida');
}

// ------------------------------------------------------------------ acciones

const ACTIONS = {
  go: (d) => go(d.to),
  'example-code': () => {
    state.joinValue = 'HK7M2Q';
    state.joinError = '';
    painted.route = null;
    paint();
  },
  set: (d) => {
    const numeric = ['durationMin', 'zoneRadiusM'].includes(d.key);
    state.settings[d.key] = numeric ? Number(d.value) : d.value;
    paint();
  },
  players: (d) => {
    state.settings.players = Math.max(X.minPlayers, Math.min(X.maxPlayers, state.settings.players + Number(d.delta)));
    paint();
  },
  'toggle-dynamic': () => {
    state.settings.dynamicZone = !state.settings.dynamicZone;
    paint();
  },
  'create-room': () => {
    // ?seed=N fija la semilla (pruebas reproducibles); si no, cada sala es distinta.
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    state.room = S.createRoom(state.settings, fixed > 0 ? fixed : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    state.game = null;
    go('sala', true);
  },
  'copy-code': async () => {
    const code = state.room.code;
    try {
      await navigator.clipboard.writeText(code);
      toast(`Código ${code} copiado.`, 'info');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      toast(ok ? `Código ${code} copiado.` : `No se pudo copiar. El código es ${code}.`, 'info');
    }
  },
  draw: () => {
    S.drawTeams(state.room);
    paint();
  },
  team: (d) => {
    S.setTeam(state.room, d.id, d.team);
    paint();
  },
  ready: () => {
    const me = state.room.players.find((p) => p.isSelf);
    S.setReady(state.room, 'me', !me.ready);
    paint();
  },
  start: () => {
    if (!S.canStart(state.room)) return;
    startGame();
  },
  pause: () => {
    state.paused = !state.paused;
    paint();
  },
  sheet: (d) => {
    if (d.tab && !state.sheetOpen) state.tab = d.tab;
    state.sheetOpen = !state.sheetOpen;
    paint();
  },
  tab: (d) => {
    state.tab = d.tab;
    paint();
  },
  speed: (d) => {
    state.speed = Number(d.value);
    paint();
  },
  'toggle-vibrate': () => {
    state.vibrate = !state.vibrate;
    paint();
  },
  map: (_d, el, ev) => {
    const g = state.game;
    const self = S.self(g);
    if (self.status !== 'active' || g.phase === 'countdown' || g.phase === 'finished') return;
    if (self.team === 'hunter' && g.phase === 'headstart') {
      toast('Durante la ventaja los cazadores esperan en el punto de encuentro.', 'info');
      return;
    }
    const m = el.getScreenCTM();
    if (!m) return;
    const pt = el.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const p = pt.matrixTransform(m.inverse());
    const E = mapExtent(g) * 2;
    self.target = { x: Math.max(-E, Math.min(E, p.x)), y: Math.max(-E, Math.min(E, p.y)) };
    state.tapped = true;
    paint();
  },
  'walk-to': (d) => {
    const self = S.self(state.game);
    if (self.status !== 'active') return;
    self.target = { x: Number(d.x), y: Number(d.y) };
    state.tapped = true;
    state.sheetOpen = false;
    paint();
  },
  claim: () => {
    const list = S.claimableRunners(state.game);
    if (list.length === 1) return ACTIONS['claim-runner']({ id: list[0].id });
    state.modal = { type: 'pick' };
    paint();
  },
  'claim-runner': (d) => {
    const res = S.claimCapture(state.game, d.id);
    if (!res.ok) {
      state.modal = null;
      toast(res.error, 'dispute');
    } else {
      state.modal = { type: 'claim', id: res.claim.id };
      buzz([60]);
    }
    paint();
  },
  'show-claim': (d) => {
    state.modal = { type: 'claim', id: d.id };
    paint();
  },
  'show-dispute': (d) => {
    state.modal = { type: 'dispute', id: d.id };
    paint();
  },
  withdraw: (d) => {
    S.withdrawClaim(state.game, d.id);
    paint();
  },
  incoming: (d) => {
    const accept = d.accept === '1';
    S.respondIncoming(state.game, accept);
    state.modal = { type: 'incoming', result: accept ? 'accepted' : 'disputed' };
    paint();
  },
  'accept-dispute': (d) => {
    S.acceptOwnDispute(state.game, d.id);
    state.modal = null;
    paint();
  },
  'self-tag': () => {
    state.modal = { type: 'self-tag' };
    paint();
  },
  'confirm-self-tag': () => {
    S.selfTag(state.game);
    state.modal = null;
    paint();
  },
  scan: () => {
    const res = S.scan(state.game);
    toast(res.ok ? `Escáner: ${res.count} fugitivo(s) a menos de ${X.scan.radiusM} m. Es aproximado: no dice dónde.` : res.error, res.ok ? 'capture' : 'dispute');
    if (res.ok) buzz([40, 40, 40]);
    paint();
  },
  'ask-end': () => {
    state.modal = { type: 'end' };
    paint();
  },
  'end-game': () => {
    state.modal = null;
    S.endGame(state.game);
    paint();
  },
  close: () => {
    state.modal = null;
    paint();
  },
  // Idempotente: pulsarlo varias veces (o tras cerrarse sola) no hace nada más.
  'role-ok': () => {
    if (!state.roleCard) return;
    state.roleCard = false;
    lastFrame = performance.now();
    paint();
  },
  overlay: (_d, el, ev) => {
    // Tocar fuera del cuadro cierra solo los modales informativos; nunca una reclamación entrante.
    if (ev.target !== el) return;
    if (state.modal && state.modal.type === 'incoming' && state.game?.incoming) return;
    state.modal = null;
    paint();
  },
  policy: (d) => {
    state.nextPolicy = d.value;
    paint();
  },
  'next-round': () => {
    S.nextRound(state.room, state.game, state.nextPolicy);
    state.game = null;
    go('sala', true);
  },
  'back-lobby': () => {
    S.nextRound(state.room, state.game, 'keep');
    state.game = null;
    go('sala', true);
  },
  exit: () => {
    state.game = null;
    state.room = null;
    go('inicio', true);
  },
};

function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el.dataset, el, ev);
}

function onSubmit(ev) {
  const form = ev.target.closest('[data-form="join"]');
  if (!form) return;
  ev.preventDefault();
  const res = S.joinRoom(state.joinValue);
  if (!res.ok) {
    state.joinError = res.error;
    const input = document.getElementById('code');
    if (input) input.setAttribute('aria-invalid', 'true');
    paint();
    return;
  }
  state.joinError = '';
  state.joinValue = '';
  state.room = res.room;
  state.game = null;
  go('sala', true);
}

function onInput(ev) {
  if (ev.target.id !== 'code') return;
  state.joinValue = ev.target.value;
  if (state.joinError) {
    state.joinError = '';
    ev.target.setAttribute('aria-invalid', 'false');
    paint();
  }
}

// Se vuelve a pintar al cambiar de pantalla: arranca o para los temporizadores.
function syncTimers() {
  if (state.route === 'partida') {
    if (!loopTimer) startLoop();
  } else stopLoop();
  if (state.route === 'sala') {
    if (!lobbyTimer) startLobby();
  } else stopLobby();
}

export function boot() {
  // Solo para las pruebas automáticas (?e2e): expone el estado simulado. No afecta al uso normal.
  if (new URLSearchParams(location.search).has('e2e')) window.__rastro = { state, S };
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('toggle', (ev) => {
    if (ev.target.matches?.('details.more')) state.moreOpen = ev.target.open;
  }, true);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('resize', () => {
    unitCache = { w: 0, h: 0, u: 1 };
    if (state.route === 'partida') paint();
  });
  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now();
  });
  onRoute();
}
