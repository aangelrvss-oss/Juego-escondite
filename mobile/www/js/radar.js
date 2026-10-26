// Radar de la partida en SVG (puro, sin mapas externos ni red): la zona, tu posición y solo lo que el
// servidor te ha autorizado a ver (compañeros, fugitivos expuestos y pistas con su antigüedad).
// No escribe coordenadas en ningún texto.

const M_PER_DEG_LAT = 110_540;

/** Proyección local equirectangular en metros respecto al centro (suficiente para ≤ 2 km). */
export function project(center, p) {
  const x = (p.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180) * 111_320;
  const y = (p.lat - center.lat) * M_PER_DEG_LAT;
  return { x, y: -y }; // en SVG el eje y crece hacia abajo
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{center:{lat:number,lng:number}, radiusM:number, meeting?:{lat:number,lng:number},
 *   me?:{lat:number,lng:number,accuracyM:number}|null, myTeam?:string|null,
 *   dots?:{lat:number,lng:number,label:string,kind:'mate'|'exposed'|'ping'|'spectator',team?:string,stale?:boolean}[]}} v
 */
export function radarSvg(v) {
  const r = v.radiusM;
  const view = r * 1.18;
  const size = view * 2;
  const pt = (p) => project(v.center, p);
  const parts = [];
  parts.push(`<circle cx="0" cy="0" r="${r}" class="rz"/>`);
  for (const f of [0.5]) parts.push(`<circle cx="0" cy="0" r="${r * f}" class="rg"/>`);
  parts.push(`<line x1="${-view}" y1="0" x2="${view}" y2="0" class="rg"/><line x1="0" y1="${-view}" x2="0" y2="${view}" class="rg"/>`);
  if (v.meeting) {
    const m = pt(v.meeting);
    const s = r * 0.035;
    parts.push(`<rect x="${m.x - s}" y="${m.y - s}" width="${s * 2}" height="${s * 2}" class="rm"/>`);
  }
  const dot = r * 0.03;
  for (const d of v.dots ?? []) {
    const p = pt(d);
    const cls = `rd rd-${d.kind} t-${d.team ?? 'x'}${d.stale ? ' stale' : ''}`;
    parts.push(
      `<g class="${cls}"><circle cx="${p.x}" cy="${p.y}" r="${d.kind === 'ping' ? dot * 1.4 : dot}"/>` +
        `<text x="${p.x + dot * 1.6}" y="${p.y + dot * 0.6}" font-size="${r * 0.075}">${esc(d.label)}</text></g>`,
    );
  }
  if (v.me) {
    const p = pt(v.me);
    parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${Math.min(v.me.accuracyM, r)}" class="ra"/>`);
    parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${dot * 1.3}" class="rme t-${v.myTeam ?? 'x'}"/>`);
  }
  return `<svg class="radar" viewBox="${-view} ${-view} ${size} ${size}" role="img" aria-label="Radar de la zona de juego">${parts.join('')}</svg>`;
}
