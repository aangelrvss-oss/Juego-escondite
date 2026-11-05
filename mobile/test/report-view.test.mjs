import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missionReport, reportShareText, reportSurvival, totalDuration } from '../www/js/game-view.js';
import { missionReportScreen } from '../www/js/report-view.js';

// Mission Report ampliado (ciclo UX 11/2026): resumen, rendimiento, momentos y pantalla completa, para cada
// causa de final y los tres modos, solo con la instantánea oficial. Datos de ejemplo, sin red.

const T0 = 1_700_000_000_000; // inicio de la huida (hora del servidor)
const HS = 2 * 60_000;
const ZONE = { fromOffsetMs: 0, center: { lat: 40.41537, lng: -3.68452 }, radiusM: 250 };
const config = (mode) => ({ mode, durationMs: 20 * 60_000, headStartMs: HS, pingIntervalMs: 180_000, zone: [ZONE], meetingPoint: { lat: 40.41537, lng: -3.68452 }, safetyChecklistConfirmed: true });

/** Instantánea FINISHED como la del servidor (con la configuración, que sí lleva el punto de encuentro). */
function snap({ mode = 'classic', cause, winner, captures = [], players, chaseMs = 12 * 60_000, inHeadStart = false, gameNo = 3, hostId = 'h1' }) {
  const activeStart = inHeadStart ? null : T0 + HS;
  return {
    roomId: 'r-interna', gameNo, phase: 'FINISHED', hostId, serverNow: T0 + 30 * 60_000,
    countdownEnd: T0 - 5_000, headStartEnd: T0 + HS, gameEnd: inHeadStart ? null : T0 + HS + 20 * 60_000, nextPingAt: null,
    activeStart, finishedAt: inHeadStart ? T0 + 70_000 : activeStart + chaseMs, rulesVersion: 'clasico/2026-10-30',
    players, config: config(mode), zonePlan: null, captures, outcome: { winner, cause }, lastPing: null,
    pendingClaimForMe: null, pendingClaimByMe: null, canTagFrom: null, closeReason: null,
  };
}
const pl = (id, name, team, status = 'active', leftReason = null) => ({ id, name, team, teamPref: null, status, ready: false, connected: true, away: false, leftReason });
const classicPlayers = () => [pl('h1', 'Ana', 'hunter'), pl('h2', 'Beto', 'hunter'), pl('r1', 'Caro', 'runner', 'captured'), pl('r2', 'Dani', 'runner', 'captured'), pl('r3', 'Eva', 'runner', 'captured')];
const cap = (runnerId, hunterId, min, via = 'claim', converted) => ({ runnerId, hunterId, atOffsetMs: Math.round(min * 60_000), via, ...(converted ? { converted: true } : {}) });

const CASES = {
  'Clásico · todos capturados': snap({
    cause: 'all_captured', winner: 'hunter', chaseMs: 9 * 60_000,
    captures: [cap('r1', 'h1', 1.5), cap('r2', null, 4, 'self'), cap('r3', 'h1', 9)],
    players: classicPlayers(),
  }),
  'Clásico · tiempo agotado': snap({
    cause: 'time_up', winner: 'runner', chaseMs: 20 * 60_000,
    captures: [cap('r1', 'h2', 3)],
    players: [pl('h1', 'Ana', 'hunter'), pl('h2', 'Beto', 'hunter'), pl('r1', 'Caro', 'runner', 'captured'), pl('r2', 'Dani', 'runner'), pl('r3', 'Eva', 'runner', 'left', 'left')],
  }),
  'Clásico · terminada por el anfitrión en la persecución': snap({
    cause: 'ended_by_host', winner: null, chaseMs: 5 * 60_000, captures: [cap('r1', 'h1', 2)],
    players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner', 'captured'), pl('r2', 'Dani', 'runner')],
  }),
  'Clásico · terminada por el anfitrión en la huida': snap({
    cause: 'ended_by_host', winner: null, inHeadStart: true,
    players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner')],
  }),
  'Clásico · los fugitivos abandonaron': snap({
    cause: 'runners_abandoned', winner: null, chaseMs: 6 * 60_000, captures: [cap('r1', 'h1', 2)],
    players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner', 'captured'), pl('r2', 'Dani', 'runner', 'left', 'timeout')],
  }),
  'Clásico · los cazadores abandonaron': snap({
    cause: 'hunters_abandoned', winner: null, chaseMs: 4 * 60_000,
    players: [pl('h1', 'Ana', 'hunter', 'left', 'left'), pl('r1', 'Caro', 'runner'), pl('r2', 'Dani', 'runner')],
  }),
  'Infección · todos infectados': snap({
    mode: 'infection', cause: 'all_captured', winner: 'hunter', chaseMs: 7 * 60_000,
    captures: [cap('r1', 'h1', 1, 'claim', true), cap('r2', 'r1', 3, 'claim', true), cap('r3', null, 7, 'self', true)],
    players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'hunter'), pl('r2', 'Dani', 'hunter'), pl('r3', 'Eva', 'hunter')],
  }),
  'Infección · tiempo agotado con supervivientes': snap({
    mode: 'infection', cause: 'time_up', winner: 'runner', chaseMs: 20 * 60_000,
    captures: [cap('r1', 'h1', 2, 'claim', true)],
    players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'hunter'), pl('r2', 'Dani', 'runner'), pl('r3', 'Eva', 'runner')],
  }),
  'Caza del zorro · zorro atrapado': snap({
    mode: 'fox_hunt', cause: 'all_captured', winner: 'hunter', chaseMs: 5 * 60_000,
    captures: [cap('f', 'h2', 5)],
    players: [pl('h1', 'Ana', 'hunter'), pl('h2', 'Beto', 'hunter'), pl('f', 'Zoe', 'runner', 'captured')],
  }),
  'Caza del zorro · el zorro aguanta': snap({
    mode: 'fox_hunt', cause: 'time_up', winner: 'runner', chaseMs: 20 * 60_000,
    players: [pl('h1', 'Ana', 'hunter'), pl('h2', 'Beto', 'hunter'), pl('f', 'Zoe', 'runner')],
  }),
  'Caza del zorro · el zorro abandona': snap({
    mode: 'fox_hunt', cause: 'runners_abandoned', winner: null, chaseMs: 3 * 60_000,
    players: [pl('h1', 'Ana', 'hunter'), pl('h2', 'Beto', 'hunter'), pl('f', 'Zoe', 'runner', 'left', 'left')],
  }),
};

const nameOf = (s) => (id) => s.players.find((p) => p.id === id)?.name ?? 'Alguien';
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('cada causa de final y modo: la pantalla tiene el informe, las cifras y los botones de siempre', () => {
  for (const [name, s] of Object.entries(CASES)) {
    for (const myId of ['h1', 'r1', 'f', 'nadie']) {
      const html = missionReportScreen(s, { myId, nameOf: nameOf(s), stats: null });
      assert.match(html, /<section class="card result mr t-(hunter|runner|x)" aria-label="Mission Report">/, name);
      assert.match(html, /data-act="share-report"/, name);
      assert.match(html, /data-act="leave"/, name);
      assert.equal(/data-act="rematch"/.test(html), myId === s.hostId, `${name}: la revancha solo la propone el anfitrión`);
      if (myId !== s.hostId) assert.match(html, /Esperando a que el anfitrión proponga la revancha/, name);
      const text = textOf(html);
      const r = missionReport(s, nameOf(s));
      assert.ok(text.includes(r.winner) && text.includes(r.cause), `${name}: resultado y motivo`);
      assert.ok(!/undefined|null|NaN/.test(text), `${name}: nada sin calcular («${text.match(/.{30}(undefined|null|NaN).{30}/)?.[0]}»)`);
    }
  }
});

test('resumen: ganador, motivo, persecución y duración total (huida incluida)', () => {
  const r = missionReport(CASES['Clásico · todos capturados'], nameOf(CASES['Clásico · todos capturados']));
  assert.equal(r.winnerTeam, 'hunter');
  assert.equal(r.causeId, 'all_captured');
  assert.equal(r.durationMs, 9 * 60_000);
  assert.equal(r.totalMs, HS + 9 * 60_000);
  const html = missionReportScreen(CASES['Clásico · todos capturados'], { myId: 'h1' });
  assert.match(textOf(html), /Partida de 11:00 en total · 2:00 de huida/);
  // En plena huida: sin persecución, pero con cuándo terminó.
  const hs = CASES['Clásico · terminada por el anfitrión en la huida'];
  assert.equal(missionReport(hs).durationMs, null);
  assert.equal(totalDuration(hs), 70_000);
  assert.match(textOf(missionReportScreen(hs, { myId: 'r1' })), /Terminó durante la huida, a los 1:10/);
  assert.match(textOf(missionReportScreen(hs, { myId: 'r1' })), /Huida Final durante la huida: El anfitrión terminó la partida/);
  // Una instantánea sin los datos de la huida no inventa la duración total.
  assert.equal(totalDuration({ ...hs, headStartEnd: null }), null);
});

test('resultado personal: victoria o derrota propia, encima del informe común', () => {
  const s = CASES['Clásico · todos capturados'];
  assert.match(missionReportScreen(s, { myId: 'h1', nameOf: nameOf(s) }), /class="result-me tone-win".*Tu equipo gana.*Hiciste 2 capturas/s);
  assert.match(missionReportScreen(s, { myId: 'r3', nameOf: nameOf(s) }), /class="result-me tone-lose".*Tu equipo pierde.*Te capturó Ana a los 9:00/s);
  assert.doesNotMatch(missionReportScreen(s, { myId: 'nadie' }), /result-me/, 'quien no jugó no tiene «Tu partida»');
  const fox = CASES['Caza del zorro · el zorro aguanta'];
  assert.match(missionReportScreen(fox, { myId: 'f' }), /Ganas/);
});

test('rendimiento: supervivencia por fugitivo, capturas por cazador y quién llegó al final', () => {
  const s = CASES['Clásico · tiempo agotado'];
  const surv = reportSurvival(s, nameOf(s));
  assert.deepEqual(surv.map((x) => [x.name, x.ms, x.until]), [['Dani', 20 * 60_000, 'end'], ['Caro', 3 * 60_000, 'captured'], ['Eva', null, 'left']]);
  const r = missionReport(s, nameOf(s));
  assert.deepEqual(r.survivors, ['Dani']);
  const text = textOf(missionReportScreen(s, { myId: 'h2' }));
  assert.match(text, /Libres al final 1\/3/);
  assert.match(text, /Dani Libre al final 20:00/);
  assert.match(text, /Caro Captura a los 3:00/);
  assert.match(text, /Beto Tú 1 captura/);
  assert.doesNotMatch(text, /Eva Abandonó \d/, 'quien abandonó no tiene tiempo inventado');
  // Infección: cuenta a todos los que empezaron como fugitivos (también los convertidos).
  const inf = CASES['Infección · tiempo agotado con supervivientes'];
  assert.deepEqual(reportSurvival(inf, nameOf(inf)).map((x) => x.name), ['Dani', 'Eva', 'Caro']);
  assert.match(textOf(missionReportScreen(inf, { myId: 'h1' })), /Supervivientes 2\/3/);
  assert.match(textOf(missionReportScreen(inf, { myId: 'h1' })), /Ana Tú 1 captura/);
  // Terminada en la huida: nadie tiene tiempo de persecución.
  assert.deepEqual(reportSurvival(CASES['Clásico · terminada por el anfitrión en la huida']).map((x) => x.ms), [null]);
});

test('momentos: primera, decisiva, última y final, sin repetir la misma captura', () => {
  const s = CASES['Clásico · todos capturados'];
  const r = missionReport(s, nameOf(s));
  assert.deepEqual(r.moments.map((m) => [m.kind, m.atMs, m.tags.join('+')]), [
    ['start', 0, ''], ['capture', 90_000, 'first'], ['capture', 240_000, ''], ['capture', 540_000, 'decisive'], ['end', 540_000, ''],
  ]);
  assert.deepEqual(r.decisive, { runner: 'Eva', hunter: 'Ana', atMs: 540_000 });
  assert.equal(r.firstCaptureMs, 90_000);
  // Fin por tiempo: la última captura no es decisiva.
  const t = missionReport(CASES['Clásico · tiempo agotado'], nameOf(CASES['Clásico · tiempo agotado']));
  assert.equal(t.decisive, null);
  assert.deepEqual(t.moments.map((m) => m.tags.join('+')), ['', 'first', '']);
  // Una sola captura que acaba la partida: un momento «Primera + Decisiva», no dos líneas iguales.
  const one = snap({ cause: 'all_captured', winner: 'hunter', chaseMs: 4 * 60_000, captures: [cap('r1', 'h1', 4)], players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner', 'captured')] });
  const ro = missionReport(one, nameOf(one));
  assert.deepEqual(ro.highlights, ['Captura decisiva: Caro por Ana a los 4:00']);
  assert.deepEqual(ro.moments[1].tags, ['first', 'decisive']);
  const html = missionReportScreen(one, { myId: 'h1' });
  assert.match(html, /Primera<\/span><span class="mr-tag mr-tag-decisive">Decisiva/);
  // La cronología no repite en «Momentos» lo que ya marca con etiquetas.
  assert.doesNotMatch(html.split('<h2>Cronología')[0], /Captura decisiva:/);
});

test('reconstrucción: la misma instantánea (tras recargar o reconectar) da exactamente la misma pantalla', () => {
  for (const s of Object.values(CASES)) {
    const copy = JSON.parse(JSON.stringify(s));
    assert.equal(missionReportScreen(copy, { myId: 'h1' }), missionReportScreen(s, { myId: 'h1' }));
    assert.deepEqual(missionReport(copy, nameOf(copy)), missionReport(s, nameOf(s)));
  }
  // El informe común no depende de quién lo mira (solo «Tu partida» y la revancha cambian).
  const s = CASES['Infección · todos infectados'];
  const common = (html) => html.split('<section class="card result')[1].split('<div class="result-actions">')[0];
  assert.equal(common(missionReportScreen(s, { myId: 'r2' })).replace(/ is-me| <span class="mr-you">Tú<\/span>/g, ''), common(missionReportScreen(s, { myId: 'h1' })).replace(/ is-me| <span class="mr-you">Tú<\/span>/g, ''));
});

test('privacidad: ni la pantalla ni el texto para compartir llevan coordenadas, códigos ni identificadores', () => {
  for (const [name, s] of Object.entries(CASES)) {
    const html = missionReportScreen(s, { myId: 'h1', stats: null });
    const r = missionReport(s, nameOf(s));
    const share = reportShareText(r);
    for (const out of [html, share, JSON.stringify(r)]) {
      assert.doesNotMatch(out, /40\.41|-3\.68|lat|lng|accuracy|r-interna|meetingPoint/, `${name}: sin ubicación ni sala`);
    }
    assert.doesNotMatch(JSON.stringify(r), /"(team|teamPref)"/, `${name}: el informe común no lleva el campo de equipo`);
    assert.doesNotMatch(share, /Tú|Tu partida|historial/i, `${name}: compartir no lleva lo personal`);
  }
});

test('los nombres se escapan (HTML generado como cadenas)', () => {
  const s = snap({ cause: 'all_captured', winner: 'hunter', captures: [cap('r1', 'h1', 1)], players: [pl('h1', '<img src=x onerror=alert(1)>', 'hunter'), pl('r1', 'Caro "&"', 'runner', 'captured')] });
  const html = missionReportScreen(s, { myId: 'h1' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /Caro &quot;&amp;&quot;/);
});

test('«Tu historial» solo aparece con partidas guardadas, plegado y explicando que es de este móvil', () => {
  const s = CASES['Clásico · todos capturados'];
  assert.doesNotMatch(missionReportScreen(s, { myId: 'h1', stats: null }), /mr-history/);
  assert.doesNotMatch(missionReportScreen(s, { myId: 'h1', stats: { games: 0 } }), /mr-history/);
  const stats = { games: 4, wins: 3, losses: 1, other: 0, captures: 5, captured: 1, survivalMs: 600_000, bestSurvivalMs: 420_000, byMode: { classic: { games: 3, wins: 2 }, infection: { games: 1, wins: 1 }, fox_hunt: { games: 0, wins: 0 } } };
  const text = textOf(missionReportScreen(s, { myId: 'h1', stats }));
  assert.match(text, /Tu historial en este móvil/);
  assert.match(text, /Partidas 4 Victorias 3 Derrotas 1 Sin ganador o fuera 0 Capturas hechas 5 Veces capturado 1 Mejor supervivencia 7:00 Tiempo libre total 10:00/);
  assert.match(text, /Victorias por modo: Clásico: 2\/3 · Infección: 1\/1/);
  assert.match(text, /cambiar de móvil/);
});

test('sin final todavía: aviso de cálculo, sin botones', () => {
  const s = { ...CASES['Clásico · todos capturados'], outcome: null };
  assert.equal(missionReportScreen(s, { myId: 'h1' }), '<section class="card"><p class="line">Calculando el resultado…</p></section>');
});
