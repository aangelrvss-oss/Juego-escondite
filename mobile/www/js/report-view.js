// THE OUTRUN · pantalla del Mission Report (Plan Maestro §4.4). Solo genera el HTML (cadenas escapadas con
// `esc`) a partir de la instantánea oficial FINISHED: el mismo informe para todos y tras recargar. Lo
// personal («Tu partida», «Tu historial») va fuera del informe común. Sin coordenadas ni nada de ubicación.
// Los botones mantienen los data-act de siempre (rematch, share-report, leave): los atiende app.js.
import { clock, missionReport, personalResult, reportParticipants } from './game-view.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TAG_TEXT = Object.freeze({ first: 'Primera', decisive: 'Decisiva', last: 'Última' });

/**
 * HTML completo de la pantalla final (lo que antes producía `finishedScreen` en app.js).
 * @param {object} snap instantánea del servidor (fase FINISHED)
 * @param {{ myId?: string|null, nameOf?: (id:string)=>string, stats?: object|null }} opts
 *   `nameOf`: nombres que recuerda este móvil (solo para «Tu partida»); el informe común usa los de la
 *   instantánea. `stats`: historial local (stats.js, readStats) o null para no mostrarlo. `archived`: copia
 *   guardada en este móvil tras la revancha (last-report.js): solo se puede compartir o volver.
 *   `confirmRematch`: el anfitrión ya ha tocado «Revancha» una vez y tiene que confirmarlo.
 */
export function missionReportScreen(snap, { myId = null, nameOf = null, stats = null, archived = false, confirmRematch = false } = {}) {
  const o = snap?.outcome;
  // El informe usa solo la instantánea (igual para todos y tras recargar): quien ya salió de la sala
  // aparece como «Alguien» para todos, no con el nombre que cada móvil recuerde.
  const officialName = (id) => snap.players.find((p) => p.id === id)?.name ?? 'Alguien';
  const report = missionReport(snap, officialName);
  if (!report) return `<section class="card"><p class="line">Calculando el resultado…</p></section>`;
  const isHost = snap.hostId === myId;
  const infection = report.modeId === 'infection';
  const fox = report.modeId === 'fox_hunt';
  // Lo personal va fuera del informe: el Mission Report es idéntico para todos (y tras recargar).
  const mine = personalResult(snap, myId, nameOf ?? officialName);
  const people = reportParticipants(snap, officialName);
  const stat = (label, value, extra = '') => `<div class="stat${extra}"><p class="label">${esc(label)}</p><p class="num">${esc(value)}</p></div>`;
  // «Hasta la victoria» repetía la duración cuando la última captura acaba la partida: entonces se
  // muestra cuándo cayó el primero, que sí aporta.
  const repeated = report.timeToVictoryMs !== null && report.durationMs !== null && Math.abs(report.timeToVictoryMs - report.durationMs) < 1_000;
  const third = report.timeToVictoryMs !== null && !repeated
    ? stat('Hasta la victoria', clock(report.timeToVictoryMs))
    : report.firstCaptureMs !== null ? stat(infection ? 'Primera infección' : 'Primera captura', clock(report.firstCaptureMs)) : '';
  // Quién llegó al final (no en la Caza del zorro: la cabecera ya lo dice).
  const runners = report.survival.length;
  const fourth = !fox && runners > 0 ? stat(infection ? 'Supervivientes' : 'Libres al final', `${report.survivors.length}/${runners}`) : '';
  const facts = report.highlights.filter((h) => !/^(Primera captura|Captura decisiva):/.test(h));
  return `${mine ? `<section class="result-me tone-${esc(mine.tone)}"><p class="label">Tu partida</p><p class="result-me-title">${esc(mine.title)}</p><p class="line">${esc(mine.detail)}</p></section>` : ''}
    <section class="card result mr t-${esc(o?.winner ?? 'x')}" aria-label="Mission Report">
      <header class="result-hero">
        <p class="label">Mission Report · ${esc(report.mode)} · Partida ${esc(snap.gameNo)}</p>
        <h1${report.winner.split(' ').some((w) => w.length > 11) ? ' class="is-long"' : ''}>${esc(report.winner)}</h1>
        <p class="result-cause">${esc(report.cause)}</p>
        ${totalLine(report)}
      </header>
      <div class="result-body">
        <div class="stats">
          ${stat('Persecución', report.durationMs === null ? '—' : clock(report.durationMs))}
          ${stat(infection ? 'Infectados' : 'Capturas', String(report.captureCount))}
          ${third}
          ${fourth}
        </div>
        ${facts.length ? `<h2>Momentos</h2><ul class="highlights">${facts.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <h2>Cronología</h2>
        ${timelineHtml(report)}
        ${performanceHtml(people, report, myId, { fox, infection })}
        ${historyHtml(stats)}
        <p class="hint">Solo datos oficiales del servidor. Las ubicaciones de la partida ya se han borrado.${report.rulesVersion ? ` Reglas: ${esc(report.rulesVersion)}.` : ''}</p>
      </div>
    </section>
    ${archived ? archivedActions() : liveActions(isHost, confirmRematch)}`;
}

/** Botones del final: revancha (con confirmación: lleva a todos a la sala), compartir y salir. */
function liveActions(isHost, confirmRematch) {
  const rematch = confirmRematch
    ? `<button class="btn btn-primary btn-big" data-act="rematch">Toca otra vez para empezar la revancha</button>
      <p class="hint">Todos volveréis a la sala. Este informe queda guardado en cada móvil: «Ver el informe de la partida anterior».</p>`
    : '<button class="btn btn-primary btn-big" data-act="rematch">Revancha</button>';
  return `<div class="result-actions">
      ${isHost ? rematch : '<p class="msg">Esperando a que el anfitrión proponga la revancha…</p>'}
      <button class="btn btn-outline" data-act="share-report">Compartir resultado</button>
      <button class="btn btn-ghost" data-act="leave">Salir de la sala</button>
    </div>`;
}

/** Informe guardado de la partida anterior (last-report.js): compartirlo o volver. */
function archivedActions() {
  return `<div class="result-actions">
      <button class="btn btn-primary" data-act="close-report">Volver</button>
      <button class="btn btn-outline" data-act="share-report">Compartir resultado</button>
    </div>`;
}

/** «Partida de 14:00 en total (2:00 de huida)», o cuándo terminó si fue en plena huida. */
function totalLine(report) {
  if (report.totalMs === null) return '';
  const text = report.durationMs === null
    ? `Terminó durante la huida, a los ${clock(report.totalMs)}`
    : `Partida de ${clock(report.totalMs)} en total · ${clock(report.totalMs - report.durationMs)} de huida`;
  return `<p class="mr-total">${esc(text)}</p>`;
}

/** Cronología: inicio, cada captura (primera, decisiva, última) y el final, con la hora de la persecución. */
function timelineHtml(report) {
  const items = report.moments.map((m) => {
    const time = m.atMs === null ? 'Huida' : clock(m.atMs);
    const tags = m.tags.map((t) => `<span class="mr-tag mr-tag-${t}">${esc(TAG_TEXT[t])}</span>`).join('');
    let body;
    if (m.kind === 'capture') {
      body = `${m.converted ? 'Infección' : 'Captura'} de <b>${esc(m.runner)}</b>${m.hunter ? ` por <b>${esc(m.hunter)}</b>` : ''}${m.via === 'self' ? ' <small>· autodeclarada</small>' : ''}`;
    } else {
      body = esc(m.text);
    }
    return `<li class="mr-m-${m.kind}"><span class="num">${esc(time)}</span><span>${body}${tags ? ` ${tags}` : ''}</span></li>`;
  });
  const none = report.captureCount === 0 ? `<li class="empty">${report.modeId === 'infection' ? 'Nadie fue infectado' : 'Nadie fue capturado'}</li>` : '';
  return `<ol class="timeline mr-timeline">${items.slice(0, -1).join('')}${none}${items.at(-1)}</ol>`;
}

/**
 * Rendimiento por equipos (se revelan al terminar; igual para todos): cada jugador con lo que hizo y una
 * barra. Fugitivos: tiempo libre sobre la persecución. Cazadores: capturas sobre las del que más hizo.
 */
function performanceHtml(people, report, myId, { fox, infection }) {
  if (!people.length) return '';
  const survival = new Map(report.survival.map((s) => [s.id, s]));
  const most = Math.max(1, ...people.map((p) => p.captures));
  // Como el contador de pistas de app.js: la fracción va en --p y el ancho lo pone report.css.
  const bar = (fraction, team) => `<span class="mr-bar t-${team}" style="--p:${Math.min(1, Math.max(0, fraction)).toFixed(3)}" aria-hidden="true"><i></i></span>`;
  const item = (p) => {
    const s = survival.get(p.id);
    // La cifra ya va en el detalle («Captura a los 0:16», «2 capturas»): aquí solo se añade la barra y, a
    // quien siguió libre, cuánto tiempo (el detalle solo dice «Libre al final»).
    let metric = '';
    if (s && s.ms !== null && report.durationMs) {
      const time = s.until === 'end' ? `<span class="mr-metric-text">${esc(clock(s.ms))}</span>` : '';
      metric = `<span class="mr-metric${time ? '' : ' no-text'}">${time}${bar(s.ms / report.durationMs, 'runner')}</span>`;
    } else if (!s && p.captures > 0) {
      metric = `<span class="mr-metric no-text">${bar(p.captures / most, 'hunter')}</span>`;
    }
    const me = p.id === myId ? ' <span class="mr-you">Tú</span>' : '';
    return `<li class="${p.caught ? 'is-caught' : ''}${p.captures ? ' has-captures' : ''}${p.left ? ' has-left' : ''}${p.id === myId ? ' is-me' : ''}"><span class="pname">${esc(p.name)}${me}</span>${p.detail ? `<span class="muted">${esc(p.detail)}</span>` : ''}${metric}</li>`;
  };
  const groups = [
    ['hunter', 'Cazadores'],
    ['runner', fox ? 'Zorro' : infection ? 'Supervivientes' : 'Fugitivos'],
    [null, 'Jugadores'],
  ]
    .map(([team, title]) => [title, people.filter((p) => p.team === team), team])
    .filter(([, list]) => list.length);
  const note = report.survival.some((s) => s.ms !== null) ? '<p class="hint mr-note">Tiempo libre contado desde el inicio de la persecución.</p>' : '';
  return `<h2>Rendimiento</h2>${groups.map(([title, list, team]) => `<h3 class="mr-group">${esc(title)}</h3><ul class="roster mr-roster t-${team ?? 'x'}">${list.map(item).join('')}</ul>`).join('')}${note}`;
}

/** «Tu historial» (solo de este móvil): discreto y plegado. Nada si no hay partidas guardadas. */
function historyHtml(stats) {
  if (!stats || !(stats.games > 0)) return '';
  const cell = (label, value) => `<div><dt>${esc(label)}</dt><dd class="num">${esc(value)}</dd></div>`;
  const modes = [['classic', 'Clásico'], ['infection', 'Infección'], ['fox_hunt', 'Caza del zorro']]
    .filter(([id]) => stats.byMode?.[id]?.games > 0)
    .map(([id, name]) => `${name}: ${stats.byMode[id].wins}/${stats.byMode[id].games}`)
    .join(' · ');
  return `<details class="mr-history"><summary>Tu historial en este móvil</summary>
      <dl class="mr-history-grid">
        ${cell('Partidas', stats.games)}
        ${cell('Victorias', stats.wins)}
        ${cell('Derrotas', stats.losses)}
        ${cell('Sin ganador o fuera', stats.other)}
        ${cell('Capturas hechas', stats.captures)}
        ${cell('Veces capturado', stats.captured)}
        ${cell('Mejor supervivencia', stats.bestSurvivalMs ? clock(stats.bestSurvivalMs) : '—')}
        ${cell('Tiempo libre total', stats.survivalMs ? clock(stats.survivalMs) : '—')}
      </dl>
      ${modes ? `<p class="hint">Victorias por modo: ${esc(modes)}</p>` : ''}
      <p class="hint">Se guarda solo en este móvil, sin nombres ni ubicaciones. Se pierde al borrar los datos de la app o al cambiar de móvil.</p>
    </details>`;
}
