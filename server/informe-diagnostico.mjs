// Informe de una prueba física a partir del registro de diagnóstico del servidor (DIAG_FILE).
// Uso: node server/informe-diagnostico.mjs <diagnostico.jsonl> [informe.md]
// Sin el segundo argumento, escribe el informe junto al registro, con extensión .md. Funciona sin
// conexión y sin dependencias. El registro ya no lleva datos personales (alias S1/J1, sin
// coordenadas, nombres, códigos ni IP), así que el informe tampoco.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYING = new Set(['HEAD_START', 'ACTIVE']);
const PHASE_NAMES = {
  LOBBY: 'Sala de espera',
  COUNTDOWN: 'Cuenta atrás',
  HEAD_START: 'Huida',
  ACTIVE: 'Persecución',
  FINISHED: 'Final',
  CANCELLED: 'Cancelada',
};
// Umbrales del informe para señalar problemas (no son reglas del juego).
export const ALERT = { gpsGapS: 30, gpsAccM: 50, offlineS: 60 };

/** Lee el registro: una línea JSON por hecho. Las líneas ilegibles se cuentan y se saltan. */
export function parseRecords(text) {
  const records = [];
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r.k === 'string' && typeof r.at === 'number') records.push(r);
      else bad++;
    } catch {
      bad++; // p. ej., la última línea a medias si se cortó la corriente
    }
  }
  records.sort((a, b) => a.at - b.at);
  return { records, bad };
}

// Hueco sin ningún hecho, con una partida en juego, a partir del cual el servidor no estaba en marcha.
const SILENT_GAP_S = 120;
const hhmmss = (at) => new Date(at).toLocaleTimeString('es-ES', { hour12: false });
const mmss = (s) => (s === null || s === undefined ? '—' : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const winnerText = (w) => (w === 'hunter' ? 'ganan los cazadores' : w === 'runner' ? 'ganan los fugitivos' : 'sin ganador');
const phaseName = (p) => PHASE_NAMES[p] ?? p ?? '—';
const count = (list, key) => list.reduce((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
const listCounts = (m) => Object.entries(m).map(([k, n]) => `${k} ×${n}`).join(', ') || '—';
const table = (head, rows) => (rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') : '_Nada registrado._');

/** Una línea legible de la cronología, o null si el hecho no va en ella. */
function timelineText(r) {
  if (r.k === 'phase') return `Fase: **${phaseName(r.phase)}** (online: ${r.online.join(', ') || 'nadie'}${r.offline.length ? `; **sin conexión: ${r.offline.join(', ')}**` : ''})`;
  if (r.k === 'session') return { create: `${r.player} crea la sala`, join: `${r.player} entra`, resume: `${r.player} reanuda la sesión${r.replayed === null ? ' (solo instantánea)' : ` (${r.replayed} eventos reenviados)`}` }[r.how] ?? null;
  if (r.k === 'cmd' && !r.ok) return `${r.player}: ${r.type} rechazado (${r.error})${r.target ? ` → ${r.target}` : ''}`;
  if (r.k === 'cmd' && ['start', 'end_game', 'rematch', 'join_rematch', 'self_tag', 'leave', 'kick', 'abort', 'cancel', 'configure'].includes(r.type)) return `${r.player}: ${r.type}${r.target ? ` → ${r.target}` : ''}`;
  if (r.k === 'event') {
    switch (r.type) {
      case 'player_connection':
        return `${r.who} ${r.connected ? 'vuelve a estar conectado' : '**pierde la conexión**'}`;
      case 'tag_claimed':
        return `${r.hunter} reclama la captura de ${r.to?.join(', ')} (${r.claim})`;
      case 'tag_claim_resolved':
        return `Reclamación ${r.claim}: **${r.result}**`;
      case 'runner_captured':
        return `**${r.runner} capturado** por ${r.hunter ?? 'nadie (autodeclarada)'} (${r.via}, ${mmss((r.atOffsetMs ?? 0) / 1_000)} de persecución)`;
      case 'ping_sent':
        return `Pista nº ${r.pingNo}`;
      case 'game_finished':
        return `**Fin: ${winnerText(r.winner)}** (${r.cause}, ${r.captures} capturas)`;
      case 'rematch_offered':
        return `Revancha propuesta (partida ${r.gameNo})`;
      case 'countdown_aborted':
        return `Cuenta atrás anulada (${r.reason})`;
      case 'host_changed':
        return `Nuevo anfitrión: ${r.host}`;
      case 'player_left':
      case 'player_kicked':
        return `${r.who} ${r.type === 'player_left' ? 'sale' : 'es expulsado'}`;
      case 'zone_exit_warning':
        return `${r.to?.join(', ')} sale de la zona`;
      case 'runner_exposed':
        return `${r.runner} queda expuesto (fuera de la zona)`;
      case 'room_closed':
        return `Sala cerrada (${r.reason})`;
      default:
        return null;
    }
  }
  if (r.k === 'ws_close' && r.player) return `${r.player}: conexión cerrada (${r.why}, duró ${mmss(r.secs)})`;
  if (r.k === 'error_sent' && r.player) return `${r.player}: error enviado al móvil (${r.error})`;
  return null;
}

/** Tiempo sin conexión de cada jugador (según el servidor), a partir de player_connection. */
function offlineTimes(records, endAt) {
  const since = {};
  const total = {};
  const longest = {};
  const cuts = {};
  for (const r of records) {
    if (r.k !== 'event' || r.type !== 'player_connection') continue;
    if (!r.connected) {
      since[r.who] = r.at;
      cuts[r.who] = (cuts[r.who] ?? 0) + 1;
    } else if (since[r.who] !== undefined) {
      const s = (r.at - since[r.who]) / 1_000;
      total[r.who] = (total[r.who] ?? 0) + s;
      longest[r.who] = Math.max(longest[r.who] ?? 0, s);
      delete since[r.who];
    }
  }
  for (const [who, at] of Object.entries(since)) {
    const s = (endAt - at) / 1_000;
    total[who] = (total[who] ?? 0) + s;
    longest[who] = Math.max(longest[who] ?? 0, s);
  }
  return { total, longest, cuts, stillOffline: Object.keys(since) };
}

function gameSection(roomId, game, recs, alerts) {
  const out = [];
  const label = `${roomId} · partida ${game}`;
  const startAt = recs[0]?.at;
  const endAt = recs.at(-1)?.at;
  const finished = recs.find((r) => r.k === 'event' && r.type === 'game_finished');
  const phases = recs.filter((r) => r.k === 'phase');
  const config = recs.filter((r) => r.k === 'event' && r.type === 'config_updated').at(-1)?.config;
  const players = [...new Set(recs.map((r) => r.player).filter(Boolean))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const roles = Object.fromEntries(recs.filter((r) => r.k === 'event' && r.type === 'role_revealed').map((r) => [r.to?.[0], r.team]));

  out.push(`### Partida ${game}`);
  out.push(`- Desde ${hhmmss(startAt)} hasta ${hhmmss(endAt)}. Fases: ${phases.map((p) => `${phaseName(p.phase)} (${hhmmss(p.at)})`).join(' → ') || 'ninguna'}.`);
  if (config) out.push(`- Configuración: persecución ${config.durationMin} min, huida ${config.headStartMin} min, pistas cada ${config.pingEveryMin} min, radio ${config.radiusM ?? '—'} m.`);
  if (finished) out.push(`- **Resultado:** ${winnerText(finished.winner)} · causa ${finished.cause} · ${finished.captures} capturas · persecución de ${mmss((finished.activeDurationMs ?? 0) / 1_000)}.${finished.flags && Object.keys(finished.flags).length ? ` Marcas de GPS: ${Object.entries(finished.flags).map(([j, f]) => `${j}: ${f.join(', ')}`).join('; ')}.` : ''}`);
  else if (phases.some((p) => PLAYING.has(p.phase))) {
    out.push('- **La partida no llegó a terminar en el registro.**');
    alerts.push(`${label}: empezó pero no hay final registrado.`);
  }

  // Jugadores y conexión.
  const off = offlineTimes(recs, endAt);
  const closes = recs.filter((r) => r.k === 'ws_close' && r.player);
  const resumes = recs.filter((r) => r.k === 'session' && r.how === 'resume');
  out.push('', '**Jugadores y conexión** (cortes según el servidor; «tiempo sin conexión» desde que el servidor lo detecta hasta que el móvil reanuda):', '');
  out.push(
    table(
      ['Jugador', 'Rol', 'Cortes', 'Tiempo sin conexión (total / más largo)', 'Cierres de conexión (motivo)', 'Reanudaciones'],
      players.map((j) => [
        j,
        roles[j] === 'hunter' ? 'cazador' : roles[j] === 'runner' ? 'fugitivo' : '—',
        String(off.cuts[j] ?? 0),
        off.cuts[j] ? `${mmss(off.total[j] ?? 0)} / ${mmss(off.longest[j] ?? 0)}${off.stillOffline.includes(j) ? ' (sin volver)' : ''}` : '—',
        listCounts(count(closes.filter((r) => r.player === j), (r) => r.why)),
        String(resumes.filter((r) => r.player === j).length),
      ]),
    ),
  );
  for (const j of players) {
    if ((off.longest[j] ?? 0) > ALERT.offlineS) alerts.push(`${label}: ${j} estuvo ${mmss(off.longest[j])} seguidos sin conexión.`);
  }
  for (const p of phases) if (p.offline.length && p.phase !== 'LOBBY') alerts.push(`${label}: al pasar a ${phaseName(p.phase)} (${hhmmss(p.at)}) estaban sin conexión ${p.offline.join(', ')} (lo verían al reconectar).`);

  // GPS.
  const gps = recs.filter((r) => r.k === 'gps');
  if (gps.length) {
    out.push('', `**GPS** (resúmenes cada 30 s y en cada cambio de fase; solo lecturas que llegaron al servidor):`, '');
    const rows = [];
    for (const j of players) {
      const g = gps.filter((r) => r.player === j);
      if (!g.length) continue;
      const ok = g.reduce((n, r) => n + r.ws + r.http, 0);
      const ws = g.reduce((n, r) => n + r.ws, 0);
      const http = g.reduce((n, r) => n + r.http, 0);
      const playSecs = g.filter((r) => PLAYING.has(r.phase)).reduce((n, r) => n + r.secs, 0);
      const empty = g.filter((r) => PLAYING.has(r.phase) && r.ws + r.http === 0 && r.secs >= 10);
      const gaps = g.map((r) => r.maxGapS ?? 0);
      const accs = g.map((r) => r.accP50).filter((x) => x !== null);
      const accMax = Math.max(...g.map((r) => r.accMax ?? 0));
      const ageMax = Math.max(...g.map((r) => r.ageMax ?? 0));
      const ignored = {};
      for (const r of g) for (const [k, n] of Object.entries(r.ignored ?? {})) ignored[k] = (ignored[k] ?? 0) + n;
      const maxGap = Math.max(0, ...gaps);
      const accTyp = accs.length ? accs.sort((a, b) => a - b)[Math.floor(accs.length / 2)] : null;
      rows.push([
        j,
        `${ok} (WebSocket ${ws} · app ${http})`,
        playSecs > 0 ? `${(ok / (playSecs / 60)).toFixed(1)}/min` : '—',
        maxGap ? mmss(maxGap) : '—',
        String(empty.length),
        accTyp === null ? '—' : `${accTyp} m / ${accMax} m`,
        ok ? `${ageMax} s` : '—',
        listCounts(ignored),
      ]);
      if (maxGap > ALERT.gpsGapS) alerts.push(`${label}: ${j} pasó ${mmss(maxGap)} sin lecturas de GPS aceptadas.`);
      if (empty.length) alerts.push(`${label}: ${j} tuvo ${empty.length} ventana(s) de juego sin ninguna lectura aceptada (${empty.map((r) => hhmmss(r.at)).join(', ')}).`);
      if (accTyp !== null && accTyp > ALERT.gpsAccM) alerts.push(`${label}: precisión típica de ${j} de ${accTyp} m (peor que ${ALERT.gpsAccM} m).`);
    }
    out.push(table(['Jugador', 'Lecturas aceptadas', 'Frecuencia en juego', 'Mayor hueco', 'Ventanas vacías', 'Precisión típica / peor', 'Antigüedad peor', 'Ignoradas (motivo)'], rows));
  }

  // Capturas.
  const claims = recs.filter((r) => r.k === 'event' && r.type === 'tag_claimed');
  const resolved = Object.fromEntries(recs.filter((r) => r.k === 'event' && r.type === 'tag_claim_resolved').map((r) => [r.claim, r]));
  const failedClaims = recs.filter((r) => r.k === 'cmd' && ['claim_tag', 'respond_tag', 'self_tag'].includes(r.type) && !r.ok);
  const captures = recs.filter((r) => r.k === 'event' && r.type === 'runner_captured');
  out.push('', '**Capturas**', '');
  out.push(
    table(
      ['Hora', 'Hecho', 'Resultado'],
      [
        ...claims.map((c) => [hhmmss(c.at), `${c.hunter} reclama a ${c.to?.join(', ')} (${c.claim})`, resolved[c.claim] ? `${resolved[c.claim].result} a los ${mmss((resolved[c.claim].at - c.at) / 1_000)}` : 'sin resolver en el registro']),
        ...failedClaims.map((r) => [hhmmss(r.at), `${r.player}: ${r.type}${r.target ? ` → ${r.target}` : ''}`, `rechazado: ${r.error}`]),
        ...captures.map((r) => [hhmmss(r.at), `${r.runner} capturado (${r.via})`, r.hunter ? `por ${r.hunter}` : 'autodeclarada sin cazador']),
      ].sort((a, b) => a[0].localeCompare(b[0])),
    ),
  );

  // Cronología.
  out.push('', '<details><summary>Cronología completa</summary>', '');
  out.push(table(['Hora', 'Hecho'], recs.map((r) => [hhmmss(r.at), timelineText(r)]).filter(([, t]) => t)));
  out.push('', '</details>', '');
  return out;
}

/** Informe en Markdown a partir de los registros ya leídos. */
export function buildReport(records, { source = 'registro', bad = 0 } = {}) {
  const out = [];
  const alerts = [];
  const first = records[0];
  const last = records.at(-1);
  out.push('# Informe de diagnóstico · THE OUTRUN', '');
  out.push(`- Origen: \`${source}\` · ${records.length} hechos${bad ? ` · **${bad} líneas ilegibles**` : ''}.`);
  if (!first) {
    out.push('', '**El registro está vacío.** ¿Se arrancó el servidor con DIAG_FILE (iniciar-servidor.ps1 lo hace solo)?');
    return out.join('\n') + '\n';
  }
  out.push(`- Desde ${new Date(first.at).toLocaleString('es-ES')} hasta ${new Date(last.at).toLocaleString('es-ES')} (${mmss((last.at - first.at) / 1_000)}).`);
  const starts = records.filter((r) => r.k === 'server_start');
  const stops = records.filter((r) => r.k === 'server_stop');
  out.push(`- Arranques del servidor: ${starts.length} · paradas limpias: ${stops.length}.`);
  if (starts.length > 1) alerts.push(`El servidor arrancó ${starts.length} veces (${starts.map((r) => hhmmss(r.at)).join(', ')}): en cada arranque los alias S/J empiezan de nuevo.`);
  if (starts.length > stops.length) alerts.push('Al menos un cierre del servidor no fue limpio (o el registro se copió con el servidor en marcha).');
  out.push('- Limitaciones: solo cuenta lo que llegó al servidor. Lo que pasó solo en un móvil (avisos en pantalla, errores del GPS del teléfono, qué fase mostraba) no está aquí.');
  // El ordenador del servidor suspendido: todos los móviles pierden la conexión a la vez y nadie puede volver
  // (incidente del 31/10/2026). El servidor lo anota al despertar; en registros anteriores se nota por un
  // hueco largo sin ningún hecho con una partida en juego (en la huida y la persecución hay GPS cada 30 s).
  for (const r of records.filter((x) => x.k === 'server_suspended')) {
    alerts.push(`El ordenador del servidor estuvo suspendido ${mmss(r.gapS)} (despertó a las ${hhmmss(r.at)}): servidor y túnel caídos, todos los móviles sin conexión a la vez. No es un fallo de los móviles.`);
  }
  if (!records.some((x) => x.k === 'server_suspended')) {
    const live = {};
    for (let i = 1; i < records.length; i++) {
      const prev = records[i - 1];
      if (prev.k === 'phase' && prev.room) live[prev.room] = prev.phase === 'HEAD_START' || prev.phase === 'ACTIVE';
      const gap = (records[i].at - prev.at) / 1_000;
      if (gap >= SILENT_GAP_S && Object.values(live).some(Boolean)) {
        alerts.push(`Ningún hecho registrado durante ${mmss(gap)} (de ${hhmmss(prev.at)} a ${hhmmss(records[i].at)}) con una partida en juego: lo más probable es que el servidor no estuviera en marcha (¿ordenador suspendido?).`);
      }
    }
  }

  const rooms = [...new Set(records.map((r) => r.room).filter(Boolean))];
  const sections = [];
  for (const roomId of rooms) {
    const recs = records.filter((r) => r.room === roomId);
    const games = [...new Set(recs.map((r) => r.game))].sort((a, b) => a - b);
    sections.push(`## Sala ${roomId}`, '', `- Jugadores: ${[...new Set(recs.map((r) => r.player).filter(Boolean))].join(', ')}. Partidas: ${games.join(', ')}.`, '');
    for (const g of games) sections.push(...gameSection(roomId, g, recs.filter((r) => r.game === g), alerts));
    // Segunda partida (revancha) sin reiniciar el servidor.
    const offered = recs.filter((r) => r.k === 'event' && r.type === 'rematch_offered');
    for (const o of offered) {
      const next = recs.filter((r) => r.game === o.gameNo);
      const started = next.some((r) => r.k === 'phase' && r.phase === 'COUNTDOWN');
      const joinErrors = next.filter((r) => r.k === 'cmd' && !r.ok);
      if (!started) alerts.push(`Sala ${roomId}: se propuso la partida ${o.gameNo} pero no llegó a empezar.`);
      if (joinErrors.length) alerts.push(`Sala ${roomId}, partida ${o.gameNo}: comandos rechazados: ${listCounts(count(joinErrors, (r) => `${r.type}:${r.error}`))}.`);
    }
  }

  // Errores y conexiones sin sala.
  const serverErrors = records.filter((r) => r.k === 'server_error');
  const errorsSent = records.filter((r) => r.k === 'error_sent');
  const rejected = records.filter((r) => r.k === 'ws_rejected');
  const closes = records.filter((r) => r.k === 'ws_close');
  const refusedHttp = records.filter((r) => r.k === 'loc_http_refused');
  const errorSection = [
    '## Errores y conexiones',
    '',
    `- Errores internos del servidor: ${serverErrors.length ? serverErrors.map((r) => `${hhmmss(r.at)} ${r.what} ${r.error}${r.where ? ` (${r.where})` : ''}`).join('; ') : 'ninguno'}.`,
    `- Errores enviados a los móviles: ${listCounts(count(errorsSent, (r) => r.error))}.`,
    `- Conexiones abiertas: ${records.filter((r) => r.k === 'ws_open').length} · cerradas por motivo: ${listCounts(count(closes, (r) => r.why))}.`,
    `- Conexiones rechazadas al abrir: ${listCounts(count(rejected, (r) => String(r.status)))}.`,
    `- Envíos de ubicación de la app rechazados: ${listCounts(count(refusedHttp, (r) => r.outcome))}.`,
    '',
    'Motivos de cierre: `client_1000/1001` el móvil cerró (salir, recargar, pasar a segundo plano); `network_closed` o `socket_error` la conexión se cortó (cobertura, túnel, ordenador del servidor suspendido); `idle_timeout` el servidor dejó de recibir del móvil 75 s; `server_4001` la sesión se abrió en otra conexión; `server_4000` sala borrada.',
    '',
  ];
  if (serverErrors.length) alerts.push(`${serverErrors.length} error(es) interno(s) del servidor.`);
  if (rejected.some((r) => r.status === 403)) alerts.push(`${rejected.filter((r) => r.status === 403).length} conexión(es) rechazadas por origen (403): ¿alguien abrió otra dirección?`);
  const unexpected = errorsSent.filter((r) => !['not_found'].includes(r.error));
  if (unexpected.length) alerts.push(`Errores enviados a los móviles: ${listCounts(count(unexpected, (r) => r.error))}.`);

  out.push('', '## Alertas', '');
  out.push(alerts.length ? alerts.map((a) => `- ${a}`).join('\n') : '- Ninguna con los umbrales del informe.');
  out.push('', ...sections, ...errorSection);
  return out.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: node server/informe-diagnostico.mjs <diagnostico.jsonl> [informe.md]');
    process.exit(2);
  }
  const output = process.argv[3] ?? input.replace(/\.jsonl?$/i, '') + '.md';
  const { records, bad } = parseRecords(readFileSync(input, 'utf8'));
  writeFileSync(output, buildReport(records, { source: input.split(/[\\/]/).pop(), bad }));
  console.log(`Informe escrito en ${resolve(output)} (${records.length} hechos${bad ? `, ${bad} líneas ilegibles` : ''}).`);
}
