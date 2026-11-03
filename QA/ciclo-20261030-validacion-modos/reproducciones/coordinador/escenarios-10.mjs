// Escenarios A/B/C del ciclo de validación: partida completa con 10 participantes (servidor, motor y
// net.js reales; bots y reloj simulados) + revancha. Comprueba con lo que RECIBE cada cliente por la red:
// fugas de posiciones, destinatarios de pistas, un único final por cliente, equipo visible en snapshots,
// y que el resultado es coherente con el estado. Uso: node escenarios-10.mjs <modo> <semilla>
import assert from 'node:assert/strict';
import { Simulation } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/sim/panel/simulacion.mjs';

const [mode = 'classic', seed = '7'] = process.argv.slice(2);
const s = await new Simulation({ seed: Number(seed) }).open();
const problems = [];
const bad = (m) => {
  problems.push(m);
  if (problems.length < 15) console.log('PROBLEMA:', m);
};
const st = () => s.room();
const nm = (id) => s.nameOf(id);
const counts = { positionsMsgs: 0, positionsItems: 0, pings: 0, finished: {} };

function hook(a) {
  if (a.__hooked === a.conn) return;
  a.__hooked = a.conn;
  const conn = a.conn;
  conn.on('positions', (p) => {
    if (conn !== a.conn) return;
    const S = st();
    if (!S) return;
    const me = S.players[a.id];
    counts.positionsMsgs++;
    for (const v of p.positions ?? []) {
      counts.positionsItems++;
      const o = S.players[v.playerId];
      if (!o) { bad(`${a.name} recibe posición de id desconocido`); continue; }
      const ok =
        me.status === 'captured' ||
        o.team === me.team ||
        (me.team === 'hunter' && o.team === 'runner' && o.exposed) ||
        (mode === 'fox_hunt' && me.team === 'runner' && o.team === 'hunter');
      if (!ok) bad(`${S.phase} ${a.name}(${me.team}/${me.status}) recibe posición de ${nm(o.id)}(${o.team}/${o.status}, exp=${o.exposed}) razón=${v.reason}`);
    }
  });
  conn.on('event', (e) => {
    if (conn !== a.conn) return;
    const S = st();
    const me = S?.players[a.id];
    if (e.type === 'ping') {
      counts.pings++;
      if (me.team !== 'hunter') bad(`${a.name}(${me.team}) recibe una pista`);
      for (const en of e.data.ping.entries) {
        const r = S.players[en.runnerId];
        if (r.team !== 'runner' && mode !== 'infection') bad(`pista con entrada de no fugitivo ${nm(en.runnerId)}`);
      }
      if (mode === 'fox_hunt' && e.data.ping.entries.length !== 1) bad(`pista del zorro con ${e.data.ping.entries.length} entradas`);
    }
    if (e.type === 'game_finished') counts.finished[a.name] = (counts.finished[a.name] ?? 0) + 1;
  });
}

async function playGame(label) {
  for (const a of s.avatars) hook(a);
  const S0 = st();
  const n = S0.playerOrder.length;
  const hunters = S0.playerOrder.filter((id) => S0.players[id].team === 'hunter').length;
  const expected = { classic: Math.ceil(n / 4), infection: Math.max(1, Math.floor(n / 4)), fox_hunt: n - 1 }[mode];
  console.log(`[${label}] ${mode} n=${n} cazadores=${hunters} (esperado ${expected}) rulesVersion=${S0.rulesVersion}`);
  if (hunters !== expected) bad(`${label}: cazadores ${hunters} ≠ ${expected}`);
  await s.advance(5_000 + 2 * 60_000 + 5_000);
  let validTried = 0;
  let invalid = null;
  for (let t = 0; t < 26 * 60_000 && st().phase !== 'FINISHED'; t += 30_000) {
    const S = st();
    for (const a of s.avatars) {
      const me = S.players[a.id];
      for (const p of a.snap?.players ?? []) {
        if (p.id === a.id || p.team == null) continue;
        const real = S.players[p.id];
        const allowed = mode === 'fox_hunt' || real.team === me.team || (mode === 'infection' && real.convertedAt != null);
        if (!allowed) bad(`${S.phase} ${a.name}(${me.team}) ve el equipo de ${nm(p.id)} (${p.team})`);
      }
    }
    if (S.phase === 'ACTIVE' && invalid === null) {
      try { invalid = s.invalidCapture(); } catch (e) { invalid = String(e.message); }
    }
    if (S.phase === 'ACTIVE' && t % 120_000 === 0 && validTried < 6) {
      try { s.validCapture(); validTried++; } catch {}
    }
    await s.advance(30_000);
  }
  const F = st();
  console.log(`[${label}] fase=${F.phase} outcome=${JSON.stringify(F.outcome)} capturas=${F.captures.length}`);
  if (F.phase !== 'FINISHED') bad(`${label}: no terminó`);
  const runnersFree = F.playerOrder.filter((id) => F.players[id].team === 'runner' && F.players[id].status === 'active');
  if (F.outcome?.cause === 'all_captured' && runnersFree.length) bad(`${label}: all_captured con fugitivos libres`);
  if (F.outcome?.cause === 'time_up' && (F.outcome.winner !== 'runner' || !runnersFree.length)) bad(`${label}: time_up incoherente`);
  if (mode === 'fox_hunt' && F.captures.length > 1) bad(`${label}: más de una captura en el zorro`);
  if (mode === 'infection') {
    for (const c of F.captures) if (F.players[c.runnerId].team !== 'hunter') bad(`${label}: infectado ${nm(c.runnerId)} no es cazador`);
    for (const c of F.captures) {
      const h = c.hunterId && F.players[c.hunterId];
      if (h && h.convertedAt != null && c.at < h.canTagFrom) bad(`${label}: ${nm(c.hunterId)} capturó en su espera`);
    }
  }
  if (mode === 'classic') for (const c of F.captures) if (F.players[c.runnerId].status !== 'captured') bad(`${label}: capturado ${nm(c.runnerId)} no está como capturado`);
  await new Promise((r) => setTimeout(r, 300));
  const multi = Object.entries(counts.finished).filter(([, v]) => v > 1);
  if (multi.length) bad(`${label}: game_finished repetido para ${multi}`);
  const rej = s.log.filter((l) => /rechaz/i.test(l.text)).map((l) => l.text).slice(-1)[0] ?? 'NINGÚN RECHAZO REGISTRADO'; if (!/rechaz/i.test(rej)) bad(label + ': la captura inválida no consta como rechazada'); console.log(`[${label}] captura inválida → ${rej}; game_finished recibido por ${Object.keys(counts.finished).length}/10`);
  counts.finished = {};
}

try {
  await s.start(mode);
  await playGame('partida 1');
  const host = s.avatars[0];
  const r1 = await host.command({ type: 'rematch', swapRoles: false });
  assert.ok(r1.ok, JSON.stringify(r1));
  for (const a of s.avatars.slice(1)) {
    const r = await a.command({ type: 'join_rematch' });
    if (!r.ok) bad(`${a.name} join_rematch: ${r.error}`);
  }
  await s.settle();
  const L = st();
  const leftovers = L.playerOrder.filter((id) => L.players[id].canTagFrom != null || L.players[id].convertedAt != null).length;
  console.log(`[revancha] fase=${L.phase} gameNo=${L.gameNo} restos de conversión en la sala=${leftovers} reclamaciones=${Object.keys(L.claims).length}`);
  for (const a of s.avatars) {
    const r = await a.command({ type: 'set_ready', ready: true });
    if (!r.ok) bad(`${a.name} listo: ${r.error}`);
  }
  const rs = await host.command({ type: 'start' });
  if (!rs.ok) bad(`revancha no empieza: ${rs.error}`);
  await s.settle();
  const R = st();
  if (Object.keys(R.claims).length) bad('revancha con reclamaciones heredadas');
  if (R.captures.length) bad('revancha con capturas heredadas');
  if (R.playerOrder.some((id) => R.players[id].canTagFrom != null)) bad('revancha con espera heredada');
  await playGame('revancha');
} catch (e) {
  bad(`excepción: ${e.stack}`);
} finally {
  await s.close();
}
console.log(`posiciones: ${counts.positionsMsgs} mensajes, ${counts.positionsItems} elementos; pistas recibidas: ${counts.pings}`);
console.log(problems.length ? `RESULTADO: ${problems.length} problema(s)` : 'RESULTADO: sin problemas');
process.exit(problems.length ? 1 : 0);
