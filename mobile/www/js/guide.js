// Guía visual de THE OUTRUN (onboarding y ayuda contextual). Módulo puro: sin DOM ni estado global;
// solo devuelve datos y cadenas HTML, como game-view.js, y se prueba en Node (mobile/test/guide.test.mjs).
//
// Las cifras NO se escriben a mano: salen de RULES y MODES (game-view.js), que una prueba ya compara con
// el motor (briefing.test.mjs), y de GUIDE_RULES, que guide.test.mjs compara con engine/src/constants.ts.
// Las imágenes son capturas reales de la interfaz (QA/ciclo-ux-202611/guia/INFORME_GUIA.md).

import { MODES, RULES } from './game-view.js';

export const GUIDE_VERSION = 1;

/** Reglas del motor que la guía cita y que no están en RULES (engine/src/constants.ts). */
export const GUIDE_RULES = Object.freeze({
  maxPlayers: 20, // LIMITS.maxPlayers
  awayAfterMs: 30_000, // PRESENCE.awayAfterMs
  absenceTimeoutMs: 300_000, // PRESENCE.absenceTimeoutMs
});

/** Capturas de la interfaz (mobile/www/guia), con su tamaño real para reservar el hueco. */
export const GUIDE_IMAGES = Object.freeze({
  inicio: [720, 839],
  'sala-codigo': [720, 760],
  preparacion: [720, 815],
  'cuenta-atras': [720, 629],
  'rol-cazador': [720, 463],
  'rol-fugitivo': [720, 463],
  pista: [720, 1060],
  captura: [720, 419],
  zona: [720, 860],
  final: [720, 980],
  conexion: [720, 880],
  ubicacion: [720, 390],
  'zorro-cazador': [720, 680],
  'zorro-fugitivo': [720, 980],
  'zorro-pista': [720, 1070],
  'infeccion-convertido': [720, 580],
});

/** Temas de la ayuda contextual → id del paso. */
const TOPICS = Object.freeze({ capture: 'capture', zone: 'zone', connection: 'connection', location: 'location', roles: 'roles' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sec = (ms) => `${Math.round(ms / 1000)} s`;
const min = (ms) => `${Math.round(ms / 60_000)} min`;
const pct = (f) => `${Math.round(f * 100)} %`;

const MODE_IDS = ['classic', 'infection', 'fox_hunt'];
const modeId = (mode) => (MODE_IDS.includes(mode) ? mode : null);

function step(id, title, text, file, alt) {
  const [width, height] = GUIDE_IMAGES[file];
  return { id, title, text, img: `guia/${file}.webp`, alt, width, height };
}

/**
 * Pasos de la guía para un modo ('classic' | 'infection' | 'fox_hunt' | null = general). Siempre 12, en el
 * mismo orden (los índices de guideStepFor valen para todos). Cada paso: { id, title, text, img, alt,
 * width, height }.
 */
export function guideSteps(mode) {
  const m = modeId(mode);
  const inf = m === 'infection';
  const fox = m === 'fox_hunt';
  const players = m ? `${MODES[m].minPlayers}–${GUIDE_RULES.maxPlayers}` : `${MODES.classic.minPlayers}–${GUIDE_RULES.maxPlayers}`;

  const intro = inf
    ? `Infección: escondite urbano con GPS real para ${players} jugadores, mayores de 18. Cada fugitivo capturado se convierte en cazador: si caen todos, ganan los cazadores; si alguien sigue libre al final, ganan los supervivientes.`
    : fox
      ? `Caza del zorro: escondite urbano con GPS real para ${players} jugadores, mayores de 18. Un zorro contra todos: si lo atrapan, ganan los cazadores; si aguanta libre hasta el final, gana el zorro.`
      : `Escondite urbano con GPS real: unos huyen, otros cazan, y cada uno lleva su móvil (${players} jugadores, mayores de 18). Los cazadores ganan si capturan a todos los fugitivos antes del final; los fugitivos, si queda alguno libre.${
          m ? '' : ' Hay tres modos: Clásico, Infección y Caza del zorro.'
        }`;

  const roles = fox
    ? `Al empezar hay una cuenta atrás de ${sec(RULES.countdownMs)}. Al terminar, cada uno ve su rol y, desde ese momento, todos saben quién es el zorro.`
    : `Al empezar hay una cuenta atrás de ${sec(RULES.countdownMs)}. Al terminar, cada uno descubre su rol en privado: nadie lo sabe antes (si el anfitrión asigna roles a mano, él los conoce).${
        inf ? ' Empieza 1 cazador por cada 4 jugadores (al menos 1).' : ''
      }`;

  const hunter = fox
    ? step('hunter', 'Si eres cazador', 'Todos sois cazadores y sabéis quién es el zorro. Durante la huida esperas en la zona de salida; después, cada pista te dice dónde estaba el zorro.', 'zorro-cazador', 'Tarjeta «Tu rol: CAZADOR» en la Caza del zorro, con el texto «El zorro es Zoe».')
    : step(
        'hunter',
        'Si eres cazador',
        `Durante la huida esperas en la zona de salida, junto al punto de encuentro. Después sales a cazar: ves a tu equipo, pero a los fugitivos solo en las pistas o si salen de la zona.${inf ? ' Los que captures se unen a tu equipo.' : ''}`,
        'rol-cazador',
        'Tarjeta «Tu rol: CAZADOR»: «Espera 2 min en la zona de salida mientras huyen. Captura: toque suave, nunca en la calzada».',
      );

  const runner = fox
    ? step('runner', 'Si eres el zorro', 'Juegas solo contra todos, pero ves a los cazadores en directo en el mapa. Ellos reciben tu posición en cada pista: muévete y aguanta libre hasta el final.', 'zorro-fugitivo', 'Pantalla del zorro: el mapa muestra a los cazadores en directo y abajo el botón «Me han pillado».')
    : step(
        'runner',
        'Si eres fugitivo',
        `Tienes la huida de ventaja para esconderte dentro de la zona. La barra de arriba te dice cuándo reciben los cazadores tu posición. Si te pillan, pulsa «Me han pillado»${inf ? ' y pasarás a cazar.' : '.'}`,
        'rol-fugitivo',
        'Tarjeta «Tu rol: FUGITIVO»: «Corre: tienes 2 min de ventaja. Captura: toque suave, nunca en la calzada».',
      );

  const clues = fox
    ? step('clues', 'Pistas y mapa', 'Cada pocos minutos (lo fija el anfitrión) los cazadores reciben la posición exacta del zorro: la última conocida, con su antigüedad. Es dónde estaba, no dónde está ahora.', 'zorro-pista', 'Pantalla del cazador con «Nueva pista: posición del zorro» y el punto «Zoe · hace 3 min» en el mapa.')
    : step('clues', 'Pistas y mapa', 'Cada pocos minutos (lo fija el anfitrión) los cazadores reciben la última posición conocida de cada fugitivo, con su antigüedad. Es dónde estaba, no dónde está ahora: el contador de arriba dice cuándo llega la siguiente.', 'pista', 'Pantalla del cazador con «Nueva pista: posiciones de 2 fugitivos» y sus puntos en el mapa, con la hora de cada posición.');

  const after = inf
    ? `Quien es capturado se convierte en cazador y puede capturar pasados ${sec(RULES.convertTagDelayMs)}.`
    : fox
      ? 'Si atrapáis al zorro, la partida termina en ese momento.'
      : `Quien es capturado pasa a espectador y ve a los demás con ${sec(RULES.spectatorDelayMs)} de retraso.`;
  const capture = step(
    'capture',
    'Captura: toque suave',
    `Toca con suavidad, nunca en la calzada, y pulsa su nombre en la app. El servidor comprueba que estáis cerca, con GPS reciente (±${RULES.tagMaxAccuracyM} m o mejor), y el fugitivo confirma en ${sec(RULES.tagConfirmMs)}: sin respuesta no hay captura. ${after}`,
    inf ? 'infeccion-convertido' : 'captura',
    inf
      ? 'Tarjeta «Te han infectado · ahora eres CAZADOR» con la espera antes de poder capturar.'
      : 'Aviso al fugitivo: «Reclamación de captura · responde en 0:30. ¿Te ha pillado Ana?», con los botones «Sí, me ha pillado» y «No».',
  );

  const who = fox ? 'el zorro pasa' : 'un fugitivo pasa';
  const zone = step(
    'zone',
    'La zona se cierra',
    `Jugad siempre dentro del círculo. Cada ${min(RULES.zonePhaseMs)} de persecución encoge un poco (un ${pct(RULES.zoneShrink)} del radio, nunca por debajo de ${RULES.zoneMinRadiusM} m): ve hacia el centro sin correr. Si ${who} más de ${sec(RULES.outOfZoneGraceMs)} fuera, los cazadores lo ven; un cazador fuera no puede capturar.`,
    'zona',
    'Pantalla de un fugitivo durante la persecución: «Zona 92 m · se cierra hasta 85 m» y el círculo de la zona en el mapa de prueba.',
  );

  const endWhy = inf ? 'cuando están todos infectados' : fox ? 'cuando atrapan al zorro' : 'cuando caen todos los fugitivos';
  return [
    step('intro', 'Qué es THE OUTRUN', intro, 'inicio', 'Pantalla de inicio de THE OUTRUN: «RUN. HIDE. STAY AHEAD.» y los modos Clásico, Infección y Caza del zorro.'),
    step('room', 'Crea una sala o únete', 'Quien organiza pulsa «Crear partida» y recibe un código de 6 letras o números. Los demás lo escriben en «¿Ya tienes código?», abren el enlace que les envían o escanean el QR con la cámara.', 'sala-codigo', 'Sala de espera con el código de la sala en grande y los botones «Compartir enlace» y «Mostrar QR».'),
    step('setup', 'Preparad la partida', 'Al crear la sala, la zona se centra sola en la posición del anfitrión, que debe estar en el punto de encuentro. Cada jugador pulsa «Estoy listo», que comprueba su GPS. Con todos listos, el anfitrión pulsa «Empezar partida», revisa el resumen y confirma la lista de seguridad.', 'preparacion', 'Sala del anfitrión: «2 de 2 listos» con la barra de progreso, cada jugador con su estado («Listo · GPS comprobado») y, debajo, «Todo listo» antes de «Empezar partida».'),
    step('roles', 'Los roles, en secreto', roles, 'cuenta-atras', 'Cuenta atrás: «La partida empieza en 5. Tu rol aparecerá al terminar. Nadie lo sabe todavía».'),
    hunter,
    runner,
    clues,
    capture,
    zone,
    step('end', 'Final y Mission Report', `La partida acaba al terminar el tiempo o ${endWhy}. El Mission Report muestra quién gana, las capturas y los momentos clave, solo con datos oficiales del servidor; las ubicaciones se borran. El anfitrión puede proponer la revancha.`, 'final', 'Mission Report: «Ganan los cazadores. Todos los fugitivos capturados», con el tiempo, las capturas y los momentos.'),
    step('connection', 'Si se pierde la conexión', `La partida sigue: el servidor manda en el tiempo y en las capturas, y la app reconecta sola. Tras ${sec(GUIDE_RULES.awayAfterMs)} sin señal de tu móvil, los demás te ven «sin conexión»; a los ${min(GUIDE_RULES.absenceTimeoutMs)} quedas fuera, como si abandonaras.`, 'conexion', 'Aviso «Sin conexión con el servidor. La partida sigue… Reconectando» y, en el mapa, «las posiciones de los demás están congeladas».'),
    step('location', 'Si falla la ubicación', 'Sin permiso de ubicación el servidor no puede validar capturas: actívalo en los ajustes y pulsa «Reintentar». Si no hay posición fiable, sal al aire libre y espera unos segundos. En el navegador, mantén la pantalla encendida: apagada, deja de enviar tu ubicación.', 'ubicacion', 'Estado del GPS: «GPS ±6 m», «Compartiendo tu ubicación con el servidor de la partida» y el aviso de mantener la pantalla encendida.'),
  ];
}

/** Índice del paso de la guía para la ayuda contextual: 'capture' | 'zone' | 'connection' | 'location' | 'roles'. 0 si no se conoce. */
export function guideStepFor(topic) {
  const id = TOPICS[topic];
  if (!id) return 0;
  return guideSteps(null).findIndex((s) => s.id === id);
}

/**
 * HTML del overlay de la guía. state = { step: número (0..n-1), mode, context: 'home' | 'lobby' | 'game' }.
 * Botones: data-act="guide-prev" | "guide-next" | "guide-close" y los puntos data-act="guide-goto" data-step="N".
 */
export function guideOverlay(state = {}) {
  const steps = guideSteps(state.mode ?? null);
  const n = steps.length;
  const i = Math.min(n - 1, Math.max(0, Math.trunc(Number(state.step) || 0)));
  const s = steps[i];
  const last = i === n - 1;
  const m = modeId(state.mode);
  const label = m ? `Guía · ${MODES[m].name}` : 'Guía rápida';
  const context = ['home', 'lobby', 'game'].includes(state.context) ? state.context : 'home';
  const img = s.img
    ? `<figure class="guide-figure"><img class="guide-img" src="${esc(s.img)}" width="${s.width}" height="${s.height}" alt="${esc(s.alt)}"${
        i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'
      } decoding="async"></figure>`
    : `<div class="guide-figure guide-noimg" aria-hidden="true"><span>${i + 1}</span></div>`;
  const dots = steps
    .map(
      (d, k) =>
        `<button class="guide-dot${k === i ? ' is-current' : ''}${k < i ? ' is-done' : ''}" type="button" data-act="guide-goto" data-step="${k}" aria-label="Paso ${k + 1}: ${esc(d.title)}"${
          k === i ? ' aria-current="step"' : ''
        }><span aria-hidden="true"></span></button>`,
    )
    .join('');
  return `<div class="guide-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-text" data-guide-context="${context}" data-guide-version="${GUIDE_VERSION}">
  <div class="guide-panel">
    <header class="guide-head">
      <p class="guide-kicker">${esc(label)} <span class="guide-count">Paso ${i + 1} de ${n}</span></p>
      <button class="guide-close" type="button" data-act="guide-close" aria-label="Cerrar la guía">✕</button>
    </header>
    <div class="guide-body">
      ${img}
      <h2 class="guide-title" id="guide-title" tabindex="-1">${esc(s.title)}</h2>
      <p class="guide-text" id="guide-text">${esc(s.text)}</p>
      ${context === 'game' ? '<p class="guide-note">La partida sigue en marcha mientras lees.</p>' : ''}
    </div>
    <nav class="guide-dots" aria-label="Pasos de la guía">${dots}</nav>
    <div class="guide-nav">
      <button class="btn btn-outline guide-prev" type="button" data-act="guide-prev"${i === 0 ? ' disabled' : ''}>Anterior</button>
      ${
        last
          ? '<button class="btn btn-primary guide-next" type="button" data-act="guide-close">Entendido</button>'
          : '<button class="btn btn-primary guide-next" type="button" data-act="guide-next">Siguiente</button>'
      }
    </div>
  </div>
</div>`;
}
