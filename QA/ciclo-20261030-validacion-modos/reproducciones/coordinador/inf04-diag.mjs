import { NAMES, Simulation } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/sim/panel/simulacion.mjs';
const s = await new Simulation({ seed: 14 }).open();
try {
  await s.start('infection');
  await s.advance(5_000 + 2 * 60_000 + 5_000);
  const st = () => s.room(); const P = (n) => st().players[s.avatar(n).id];
  s.pause(); s.clock.advance(1_000);
  const hs = NAMES.filter((n) => P(n).team === 'hunter' && !(P(n).canTagFrom > s.clock.now()));
  const r = NAMES.filter((n) => P(n).team === 'runner' && P(n).status === 'active')[0];
  const R = s.avatar(r);
  console.log('fase', st().phase, 'cazadores', hs, 'fugitivo', r, 'reclamaciones ya abiertas', Object.values(st().claims).map(c=>[s.nameOf(c.hunterId), s.nameOf(c.runnerId)]));
  for (const [n, dn] of [[hs[0], 2], [hs[1], -2], [r, 0]]) {
    const a = s.avatar(n); a.pos = { lat: R.pos.lat + dn / 110_540, lng: R.pos.lng };
    a.conn.sendLocation({ lat: a.pos.lat, lng: a.pos.lng, accuracyM: 6, ageMs: 0 });
  }
  await s.settle();
  const res = await Promise.all(hs.slice(0,2).map((n) => s.avatar(n).command({ type: 'claim_tag', runnerId: R.id })));
  console.log('resultados', JSON.stringify(res));
  s.resume(); for (let i=0;i<50 && P(r).team!=='hunter';i++) await new Promise(x=>setTimeout(x,100)); console.log('fugitivo ahora', P(r).team, 'capturas sobre él', st().captures.filter(c=>c.runnerId===R.id).length); console.log('reclamaciones', Object.values(st().claims).map(c=>[s.nameOf(c.hunterId), s.nameOf(c.runnerId)]));
} finally { await s.close(); }
