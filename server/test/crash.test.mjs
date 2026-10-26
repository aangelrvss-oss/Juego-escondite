import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import { offsetM } from '../../engine/src/geo.ts';
import { CENTER, gameConfig, player, room, waitFor } from './helpers.mjs';

// Persistencia (STATE_FILE) ante una caída REAL del proceso: `node server/main.ts` en un proceso
// aparte, terminado sin aviso (SIGKILL; en Windows, TerminateProcess) y arrancado otra vez con el
// mismo archivo y el mismo puerto. A diferencia de persistence.test.mjs, aquí no hay cierre ordenado
// ni último guardado: solo cuenta lo que el guardado periódico (2 s) llegó a escribir.
// Reloj real (la cuenta atrás de 5 s se espera de verdad). Clientes reales (net.js). No es un móvil.

const MAIN = fileURLToPath(new URL('../main.ts', import.meta.url));
const children = [];
const files = [];
let clients = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) await kill(child);
  for (const f of files.splice(0)) for (const x of [f, `${f}.tmp`]) rmSync(x, { force: true });
});

function stateFile() {
  const f = join(tmpdir(), `outrun-crash-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  files.push(f);
  return f;
}

/** Arranca el servidor real en otro proceso; devuelve el puerto que anuncia y su salida. */
function launch(file, port = 0) {
  const child = spawn(process.execPath, [MAIN], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATE_FILE: file, LOG: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const out = { text: '' };
  child.stdout.on('data', (d) => (out.text += d));
  child.stderr.on('data', (d) => (out.text += d));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`el servidor no arrancó:\n${out.text}`)), 10_000);
    child.stdout.on('data', () => {
      const m = /escuchando en http:\/\/127\.0\.0\.1:(\d+)/.exec(out.text);
      if (!m) return;
      clearTimeout(timer);
      const p = Number(m[1]);
      resolve({ child, out, port: p, wsUrl: `ws://127.0.0.1:${p}/ws` });
    });
    child.once('exit', (code) => reject(new Error(`el servidor terminó (${code}):\n${out.text}`)));
  });
}

function kill(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
  });
}

async function waitForFile(file, predicate, what) {
  await waitFor(() => {
    if (!existsSync(file)) return false;
    try {
      return predicate(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      return false; // a medio escribir no debería verse nunca (se escribe aparte y se renombra)
    }
  }, what, 8_000);
}

const roomsIn = (saved) => saved.rooms ?? [];

describe('persistencia ante una caída real del proceso', () => {
  it('una partida en huida sobrevive a matar el proceso; los móviles se reconectan solos y la partida sigue', async () => {
    const file = stateFile();
    const a = await launch(file);
    const { code, players } = await room(a, ['Ana', 'Beto', 'Caro']);
    clients = players;
    const [ana, beto, caro] = players;
    for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner']]) await p.conn.command({ type: 'set_team_pref', pref });
    assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'HEAD_START'), 'huida (tras 5 s reales)', 9_000);
    const headStartEnd = ana.snap.headStartEnd;
    const roomId = ana.snap.roomId;
    // Lecturas en huida: sí están en memoria; no deben llegar al archivo.
    beto.at(37, { east: -12 });
    caro.at(-53, { east: 21 });
    ana.at(3, { east: 7 });
    await waitForFile(file, (s) => roomsIn(s).some((r) => r.state?.phase === 'HEAD_START'), 'guardado periódico de la huida');
    const savedText = readFileSync(file, 'utf8');

    await kill(a.child);
    // Sin coordenadas de jugadores ni secretos en el archivo (sí la zona, que es de la partida).
    const saved = JSON.parse(savedText);
    for (const r of roomsIn(saved)) {
      for (const p of Object.values(r.state.players)) assert.deepEqual(p.samples, [], `lecturas de ${p.name} en el archivo`);
      assert.equal(r.state.lastPing, null);
    }
    for (const [n, e] of [[37, -12], [-53, 21], [3, 7]]) {
      const pos = offsetM(CENTER, n, e);
      assert.ok(!savedText.includes(String(pos.lat)) && !savedText.includes(String(pos.lng)), 'una lectura llegó al archivo');
    }
    for (const p of players) assert.ok(!savedText.includes(p.conn.session.secret), 'secreto de sesión en el archivo');

    const b = await launch(file, a.port);
    assert.match(b.out.text, /estado restaurado: 1 salas/);
    await waitFor(
      () => players.every((p) => p.conn.status === 'open' && p.snap?.phase === 'HEAD_START' && p.snap.players.every((x) => x.connected)),
      'reconexión automática de los tres',
      15_000,
    );
    for (const p of players) {
      assert.equal(p.snap.roomId, roomId);
      assert.equal(p.snap.headStartEnd, headStartEnd, 'la huida no se reinicia');
      assert.equal(p.conn.code, code);
    }
    // El rol de cada uno sigue siendo el mismo y nadie ve el de los rivales.
    assert.equal(ana.snap.players.find((x) => x.id === ana.id).team, 'hunter');
    assert.equal(ana.snap.players.find((x) => x.id === beto.id).team, null);
    // La partida sigue: el servidor nuevo acepta lecturas y órdenes de la sesión anterior.
    assert.equal(beto.at(40), true);
    assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final tras el reinicio');
    assert.equal(ana.snap.outcome.cause, 'ended_by_host');
    await kill(b.child);
  });

  it('lo ocurrido en los últimos instantes antes de la caída se pierde sin romper nada: quien entró justo antes vuelve a la pantalla de inicio', async () => {
    const file = stateFile();
    const a = await launch(file);
    const { code, players } = await room(a, ['Ana', 'Beto']);
    clients = [...players];
    await waitForFile(file, (s) => roomsIn(s).some((r) => Object.keys(r.state.players).length === 2), 'sala guardada con dos');
    // Dani entra y el proceso cae antes del siguiente guardado (cada 2 s).
    const dani = player(a, 'Dani');
    clients.push(dani);
    await waitFor(() => dani.conn.status === 'open', 'conexión de Dani');
    await dani.conn.join(code, 'Dani');
    const lost = [];
    dani.conn.on('session_lost', (why) => lost.push(why));
    await kill(a.child);
    // Un temporal a medio escribir de una caída anterior no impide arrancar.
    writeFileSync(`${file}.tmp`, '{"version":1,"rooms":[{"trunc');

    await launch(file, a.port);
    await waitFor(() => lost.length > 0, 'Dani recibe que su sesión ya no existe', 15_000);
    assert.deepEqual(lost, ['bad_session']);
    assert.equal(dani.conn.session, null, 'su sesión se borra: la app vuelve a la entrada');
    await waitFor(() => players.every((p) => p.conn.status === 'open' && p.snap?.players.length === 2), 'Ana y Beto siguen en la sala', 15_000);
    // Con el mismo código, Dani puede volver a entrar.
    await dani.conn.join(code, 'Dani');
    await waitFor(() => players.every((p) => p.snap?.players.length === 3), 'Dani vuelve a estar en la sala');
  });

  it('un archivo de estado dañado no impide arrancar ni se sobrescribe hasta que haya cambios', async () => {
    const file = stateFile();
    writeFileSync(file, '{"rooms": [ esto no es JSON');
    const a = await launch(file);
    assert.match(a.out.text, /no se pudo leer el archivo de estado/);
    await new Promise((r) => setTimeout(r, 2_500)); // más que un ciclo de guardado
    assert.equal(readFileSync(file, 'utf8'), '{"rooms": [ esto no es JSON', 'sin cambios no se toca el archivo');
    const p = player(a, 'Ana');
    clients = [p];
    await waitFor(() => p.conn.status === 'open', 'conexión');
    await p.conn.create('Ana');
    await waitForFile(file, (s) => roomsIn(s).length === 1, 'primer guardado tras un cambio');
  });
});
