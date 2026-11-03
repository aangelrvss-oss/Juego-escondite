import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildReport, parseRecords } from '../informe-diagnostico.mjs';
import { diagnosticsFile } from '../main.ts';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Registro de diagnóstico de la prueba física (DIAG_FILE) y su informe. Servidor real y clientes
// reales por WebSocket; reloj y ubicaciones SIMULADOS. Comprueba que el registro contiene lo que hace
// falta para analizar la prueba (conexiones, fases, GPS, capturas, final y revancha) y que no lleva
// coordenadas, nombres, códigos de sala, identificadores, secretos ni direcciones.

let t;
let players = [];
afterEach(async () => {
  for (const p of players.splice(0)) p.conn.close();
  await t?.close();
});

const COORDINATE = /-?\d{1,3}\.\d{4,}/; // como en logs.test.mjs

/** Partida completa de 4 con reclamación rechazada y confirmada, corte y reanudación, final y revancha. */
async function fullGame(records) {
  t = await testServer({ diag: (r) => records.push(structuredClone(r)) });
  const names = ['Ana', 'Beto', 'Caro', 'Dani'];
  const created = await room(t, names);
  players = created.players;
  const [ana, beto, caro, dani] = players;
  for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner'], [dani, 'runner']]) await p.conn.command({ type: 'set_team_pref', pref });
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  for (const [i, p] of players.entries()) p.at(10 * i, { east: 3, acc: 6 + i });
  await settle(); // llegan durante la huida
  await t.advance(2 * 60_000); // la persecución empieza sola (por tiempo)
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  ana.at(0, { east: 1 });
  beto.at(6, { east: 2 });
  caro.at(120, { east: -75, acc: 80 });
  dani.at(-90, { east: 44 });
  await settle();
  const first = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
  assert.equal(first.ok, true, JSON.stringify(first));
  await beto.conn.command({ type: 'respond_tag', claimId: first.data.claimId, accept: false });
  await t.advance(3_500);
  beto.at(5, { east: 1 });
  ana.at(1, { east: 1 });
  await settle();
  const second = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
  await beto.conn.command({ type: 'respond_tag', claimId: second.data.claimId, accept: true });
  caro.conn.socket.close();
  await waitFor(() => caro.conn.status === 'open' && ana.snap.players.find((v) => v.id === caro.id)?.connected, 'reconexión');
  await t.advance(40_000); // un resumen de GPS con huecos
  assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
  await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');
  assert.equal((await ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
  for (const p of players.slice(1)) assert.equal((await p.conn.command({ type: 'join_rematch' })).ok, true);
  await waitFor(() => players.every((p) => p.snap?.phase === 'LOBBY' && p.snap.gameNo === 2), 'revancha');
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await waitFor(() => players.every((p) => p.snap?.phase === 'COUNTDOWN'), 'cuenta atrás de la revancha');
  t.server.hub.flushDiagnostics();
  return { names, code: created.code };
}

describe('registro de diagnóstico de la prueba física (DIAG_FILE)', () => {
  it('recoge conexiones, fases, GPS, capturas, final y revancha sin datos personales', async () => {
    const records = [];
    const { names, code } = await fullGame(records);
    const of = (k, pred = () => true) => records.filter((r) => r.k === k && pred(r));

    // 1-2. Conexiones, sala y participantes, con alias.
    assert.ok(of('ws_open').length >= 5, 'aperturas de conexión (4 + la reconexión)');
    assert.deepEqual(of('session', (r) => r.how !== 'resume').map((r) => `${r.how}:${r.player}`), ['create:J1', 'join:J2', 'join:J3', 'join:J4']);
    assert.ok(of('session', (r) => r.how === 'resume' && r.player === 'J3').length >= 1, 'la reanudación de Caro');
    assert.ok(of('ws_close', (r) => r.player === 'J3' && /^(client_|network_closed)/.test(r.why)).length >= 1, 'el corte de Caro con su motivo');
    assert.ok(of('event', (r) => r.type === 'player_connection' && r.who === 'J3' && r.connected === false).length >= 1);

    // 3. Fases, también las que cambian por tiempo, con quién estaba conectado.
    const phases = of('phase').map((r) => `${r.game}:${r.phase}`);
    for (const p of ['1:COUNTDOWN', '1:HEAD_START', '1:ACTIVE', '1:FINISHED', '2:LOBBY', '2:COUNTDOWN']) assert.ok(phases.includes(p), `fase ${p} en ${phases}`);
    const active = of('phase', (r) => r.phase === 'ACTIVE')[0];
    assert.deepEqual([...active.online].sort(), ['J1', 'J2', 'J3', 'J4']);

    // 4. GPS: resúmenes por jugador con lecturas aceptadas, precisión y motivos.
    const gps = of('gps', (r) => r.game === 1);
    for (const j of ['J1', 'J2', 'J3', 'J4']) assert.ok(gps.some((r) => r.player === j && r.ws > 0), `lecturas aceptadas de ${j}`);
    assert.ok(gps.some((r) => r.player === 'J3' && r.accMax === 80), 'precisión peor de Caro');
    assert.ok(gps.some((r) => r.ignored.gone > 0 || r.ignored.too_soon > 0 || r.maxGapS > 0), 'huecos o lecturas ignoradas');

    // 5. Capturas: reclamaciones con su resultado y la captura.
    assert.deepEqual(of('cmd', (r) => r.type === 'claim_tag').map((r) => `${r.player}>${r.target}:${r.ok}`), ['J1>J2:true', 'J1>J2:true']);
    assert.deepEqual(of('event', (r) => r.type === 'tag_claim_resolved').map((r) => `${r.claim}:${r.result}`), ['R1:rejected', 'R2:confirmed']);
    assert.equal(of('event', (r) => r.type === 'runner_captured' && r.runner === 'J2' && r.hunter === 'J1').length, 1);

    // 7. Final y resultado.
    const finished = of('event', (r) => r.type === 'game_finished')[0];
    assert.equal(finished.winner, null); // la terminó el anfitrión
    assert.equal(typeof finished.cause, 'string');
    assert.equal(finished.captures, 1);
    assert.equal(of('event', (r) => r.type === 'role_revealed' && r.to[0] === 'J1')[0].team, 'hunter');

    // 8. Revancha: propuesta, unión y nueva cuenta atrás en la misma sala.
    assert.equal(of('event', (r) => r.type === 'rematch_offered')[0].gameNo, 2);
    assert.equal(of('cmd', (r) => r.type === 'join_rematch' && r.ok).length, 3);

    // Privacidad.
    const text = records.map((r) => JSON.stringify(r)).join('\n');
    const coordinate = text.split('\n').find((l) => COORDINATE.test(l));
    assert.equal(coordinate, undefined, `coordenada en el diagnóstico: ${coordinate}`);
    for (const n of names) assert.ok(!text.includes(n), `nombre en el diagnóstico: ${n}`);
    assert.ok(!text.includes(code), 'código de sala en el diagnóstico');
    assert.ok(!text.includes('127.0.0.1'), 'dirección en el diagnóstico');
    for (const p of players) {
      assert.ok(!text.includes(p.id), 'identificador de jugador en el diagnóstico');
      assert.ok(!text.includes(p.conn.session.secret), 'secreto en el diagnóstico');
    }
    assert.ok(!/"(lat|lng|center|meetingPoint|name|ip|installId|deviceId)"/.test(text), 'campo personal en el diagnóstico');

    // Informe: se genera, señala la revancha empezada y tampoco lleva datos personales.
    const report = buildReport(records);
    assert.match(report, /## Sala S1/);
    assert.match(report, /### Partida 2/);
    assert.match(report, /Fin: sin ganador/);
    assert.match(report, /J2 capturado/);
    assert.doesNotMatch(report, /se propuso la partida 2 pero no llegó a empezar/);
    assert.ok(!COORDINATE.test(report) && !names.some((n) => report.includes(n)) && !report.includes(code));
  });

  it('sin DIAG_FILE no se registra nada ni se crean alias', async () => {
    t = await testServer();
    const created = await room(t, ['Ana', 'Beto']);
    players = created.players;
    await t.advance(60_000);
    assert.equal(t.server.hub.aliases.size, 0);
  });

  it('el archivo se crea con su carpeta, se añade al final y el informe se genera por línea de comandos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outrun-diag-'));
    try {
      const file = join(dir, 'sub', 'diagnostico.jsonl');
      const at = Date.UTC(2026, 9, 28, 17, 0, 0);
      for (const k of ['server_start', 'server_stop']) {
        const sink = diagnosticsFile(file); // dos arranques: el segundo añade, no borra
        sink.write({ k, at });
        sink.close();
      }
      const { records, bad } = parseRecords(`${readFileSync(file, 'utf8')}{"k":"cortada`);
      assert.deepEqual(records.map((r) => r.k), ['server_start', 'server_stop']);
      assert.equal(records[0].t, new Date(at).toISOString());
      assert.equal(bad, 1, 'una última línea a medias no impide el informe');
      const script = fileURLToPath(new URL('../informe-diagnostico.mjs', import.meta.url));
      execFileSync(process.execPath, [script, file], { stdio: 'pipe' });
      assert.match(readFileSync(join(dir, 'sub', 'diagnostico.md'), 'utf8'), /Arranques del servidor: 1 · paradas limpias: 1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('el informe señala una revancha que no llega a empezar y un jugador sin GPS', () => {
    const at = Date.UTC(2026, 9, 28, 17, 0, 0);
    const base = { room: 'S1', game: 1 };
    const report = buildReport([
      { k: 'server_start', at },
      { k: 'phase', at: at + 1_000, ...base, phase: 'ACTIVE', from: 'HEAD_START', online: ['J1', 'J2'], offline: [] },
      { k: 'gps', at: at + 31_000, ...base, phase: 'ACTIVE', player: 'J2', secs: 30, ws: 0, http: 0, ignored: {}, maxGapS: 0, sinceLastS: 95, accP50: null, accMax: null, ageP50: null, ageMax: null, connected: true },
      { k: 'event', at: at + 60_000, ...base, phase: 'FINISHED', type: 'game_finished', winner: 'hunter', cause: 'time_up', captures: 0, activeDurationMs: 59_000 },
      { k: 'event', at: at + 70_000, room: 'S1', game: 2, phase: 'LOBBY', type: 'rematch_offered', gameNo: 2 },
    ]);
    assert.match(report, /J2 tuvo 1 ventana\(s\) de juego sin ninguna lectura aceptada/);
    assert.match(report, /se propuso la partida 2 pero no llegó a empezar/);
    assert.match(report, /cierre del servidor no fue limpio/);
  });
});
