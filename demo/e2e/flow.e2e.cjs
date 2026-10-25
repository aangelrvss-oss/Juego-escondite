// Prueba de extremo a extremo de la demo construida (file://), con el Chromium y el Playwright
// preinstalados en el entorno. NO forma parte de las dependencias del proyecto.
// Uso: node demo/e2e/flow.e2e.cjs [carpeta-de-capturas]
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const file = path.resolve(__dirname, '../dist/rastro-demo.html');
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const VIEWPORTS = [
  { name: 'xiaomi14t', width: 412, height: 915, deviceScaleFactor: 3 }, // aproximación CSS, no medida en el dispositivo
  { name: 'compacto', width: 360, height: 740, deviceScaleFactor: 2 },
];

async function checkLayout(page, where) {
  const res = await page.evaluate(() => {
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth > vw + 1;
    const small = [];
    for (const el of document.querySelectorAll('button, input, summary, [role="switch"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (r.bottom < 0 || r.top > window.innerHeight * 3) continue;
      // Interruptores: 58×34 visibles, con fila táctil de 52 px.
      const minH = el.getAttribute('role') === 'switch' ? 34 : 44;
      if (r.height < minH - 0.5 || r.width < 44 - 0.5) small.push(`${el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label')} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return { overflow, small, vw, sw: document.documentElement.scrollWidth };
  });
  assert.equal(res.overflow, false, `${where}: desbordamiento horizontal (${res.sw} > ${res.vw})`);
  assert.deepEqual(res.small, [], `${where}: objetivos táctiles pequeños`);
}

async function shot(page, vp, name) {
  if (!shots) return;
  await page.screenshot({ path: path.join(shots, `${vp.name}-${name}.png`) });
}

const tap = (page, text) => page.getByRole('button', { name: text, exact: false }).first().click();

// Tarjeta de rol: no se cierra sola, el reloj no avanza mientras está abierta y «Entendido» continúa.
async function confirmRole(page, vp, shotName) {
  const card = page.locator('.role-card');
  await card.waitFor();
  const t0 = await page.evaluate(() => window.__rastro.state.game.t);
  await page.waitForTimeout(1500); // a ×10 serían 15 s de juego
  assert.ok(await card.isVisible(), 'la tarjeta de rol no desaparece sola');
  assert.equal(await page.evaluate(() => window.__rastro.state.game.t), t0, 'el reloj no avanza con la tarjeta abierta');
  assert.equal(await page.locator('.countdown').count(), 0, 'sin cuenta atrás debajo de la tarjeta');
  await card.getByText(/Juega caminando, mira al cruzar/).waitFor();
  await checkLayout(page, 'tarjeta-rol');
  if (shotName) await shot(page, vp, shotName);
  await card.getByRole('button', { name: 'Entendido' }).click();
  await card.waitFor({ state: 'detached' });
  await page.waitForFunction((t) => window.__rastro.state.game.t > t, t0, { timeout: 5000 });
}

// Avanza el tiempo simulado en pasos de 1 s; si un bot reclama, el jugador lo disputa (como en el resto del flujo).
const advance = (page, seconds) => page.evaluate((secs) => {
  const { state, S } = window.__rastro;
  const g = state.game;
  for (let left = secs; left > 0 && g.phase === 'hunt'; left -= 1) {
    S.stepGame(g, Math.min(1, left));
    if (g.incoming) S.respondIncoming(g, false);
  }
}, seconds);
async function closeInfoModal(page) {
  await page.waitForTimeout(250);
  for (const name of ['Entendido', 'Cerrar']) {
    const b = page.locator('.overlay').getByRole('button', { name, exact: true });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
}

const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x1: r.left, x2: r.right, y1: r.top, y2: r.bottom }; });
const intersects = (a, b) => Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1) + 0.5 && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1) + 0.5;

async function runViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: true, hasTouch: true, locale: 'es-ES' });
  // La demo no debe pedir la ubicación nunca.
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Ninguna petición fuera del propio archivo (sin red).
  const requests = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.addInitScript(() => {
    window.__geoCalls = 0;
    const g = navigator.geolocation;
    if (g) {
      g.getCurrentPosition = () => { window.__geoCalls++; };
      g.watchPosition = () => { window.__geoCalls++; return 0; };
    }
  });
  await page.goto(`file://${file}?e2e&seed=20261024`);

  // A. Inicio
  await page.getByText('Crear sala').waitFor();
  await checkLayout(page, 'inicio');
  await shot(page, vp, '01-inicio');

  await tap(page, 'Cómo se juega');
  await page.getByText('Modo Clásico').waitFor();
  await checkLayout(page, 'reglas');
  await shot(page, vp, '02-reglas');
  await page.goBack();

  // Unirse: error y código válido
  await tap(page, 'Unirse a sala');
  await page.fill('#code', 'ab01');
  await tap(page, 'Entrar en la sala');
  await page.getByText('Código no válido').waitFor();
  await checkLayout(page, 'unirse');
  await shot(page, vp, '03-unirse-error');
  await page.fill('#code', 'hk7 m2q');
  await tap(page, 'Entrar en la sala');
  await page.getByText('HK7M2Q').waitFor();
  await page.getByText('El anfitrión (simulado) ya ha sorteado').waitFor();
  assert.equal(await page.locator('[data-action="team"]').count(), 0, 'sin ser anfitrión no se cambian equipos');
  await tap(page, 'Estoy listo');
  // El anfitrión simulado empieza cuando todos están listos.
  await page.locator('.game').waitFor({ timeout: 15000 });
  await page.evaluate(() => window.__rastro.S.endGame(window.__rastro.state.game));
  await page.getByText('Fin de la ronda 1').waitFor({ timeout: 5000 });
  await tap(page, 'Salir');
  await page.getByText('Crear sala').waitFor();

  // B. Configuración
  await tap(page, 'Crear sala');
  await page.getByText('Configurar sala').waitFor();
  assert.equal(await page.getByRole('button', { name: /Infección/ }).isDisabled(), true, 'Infección no disponible');
  await tap(page, 'Quitar jugador');
  await tap(page, 'Quitar jugador');
  await page.getByRole('button', { name: 'Manual' }).click();
  await page.getByRole('button', { name: 'Muchos' }).click();
  await page.getByText('Duración y zona').click();
  await page.getByRole('button', { name: '10 min' }).click();
  await page.getByRole('button', { name: '250 m' }).click();
  await checkLayout(page, 'crear');
  await shot(page, vp, '04-crear');
  await page.locator('.sticky-foot').getByRole('button', { name: 'Crear sala' }).click();

  // C. Sala de espera
  await page.getByText('Sala de espera').waitFor();
  await page.getByText(/sin equipo/).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Empezar' }).isDisabled(), true, 'no empieza sin equipos');
  await shot(page, vp, '05-sala-errores');
  await tap(page, 'Copiar');
  await page.getByText(/Código .* copiado|No se pudo copiar/).waitFor();
  await tap(page, 'Sortear equipos');
  const drawA = await page.evaluate(() => window.__rastro.state.room.players.map((p) => p.team).join());
  // Me paso a cazador a mano.
  await page.locator('[data-action="team"][data-id="me"][data-team="hunter"]').click();
  await tap(page, 'Estoy listo');
  await page.waitForFunction(() => window.__rastro.S.canStart(window.__rastro.state.room), null, { timeout: 15000 });
  await page.getByRole('button', { name: 'Empezar' }).waitFor({ state: 'visible' });
  await checkLayout(page, 'sala');
  await shot(page, vp, '06-sala-lista');
  assert.ok(drawA.length > 0);

  // D. Partida como cazador
  await page.getByRole('button', { name: 'Empezar' }).click();
  await confirmRole(page, vp, '07-tarjeta-rol');
  await page.locator('.countdown').waitFor({ state: 'detached', timeout: 6000 });
  await page.getByText('Simulado · sin GPS real').waitFor();
  await page.getByText(/Act\. hace/).waitFor();
  await shot(page, vp, '08-ventaja-cazador');
  // Velocidad x30 desde el panel de la demo
  await page.locator('.sheet-handle').click();
  await page.getByRole('tab', { name: 'Demo' }).click();
  await page.getByRole('button', { name: '×30' }).click();
  await checkLayout(page, 'partida-panel');
  await shot(page, vp, '09-panel-demo');
  await page.locator('.sheet-handle').click();
  await page.waitForFunction(() => window.__rastro.state.game.phase === 'hunt', null, { timeout: 20000 });
  // Tocar el mapa para caminar
  const box = await page.locator('svg.map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  assert.ok(await page.evaluate(() => !!window.__rastro.S.self(window.__rastro.state.game).target), 'tocar el mapa fija un destino');
  // Escáner
  await page.getByRole('button', { name: /Escáner/ }).click();
  await page.getByText(/Escáner: \d+ fugitivo/).first().waitFor();
  // Esperar a la primera pista y verla en el panel
  await page.waitForFunction(() => window.__rastro.state.game.pings.length >= 1 || window.__rastro.state.game.phase === 'finished', null, { timeout: 20000 });
  await page.evaluate(() => { window.__rastro.state.paused = true; });
  await page.locator('.sheet-handle').click();
  await page.getByRole('tab', { name: 'Pistas' }).click();
  await checkLayout(page, 'partida-pistas');
  await shot(page, vp, '10-caza-pistas');
  await page.locator('.sheet-handle').click();
  await page.waitForTimeout(200);
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#m-dyn text')].map((t) => ({ text: t.textContent, r: t.getBoundingClientRect() }));
    const key = boxes.filter((b) => / · hace /.test(b.text) || b.text === 'Tú');
    const out = [];
    for (let i = 0; i < key.length; i++) for (let j = i + 1; j < key.length; j++) {
      const a = key[i].r, b = key[j].r;
      if (Math.min(a.right, b.right) > Math.max(a.left, b.left) + 0.5 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 0.5) out.push(`${key[i].text} / ${key[j].text}`);
    }
    return { n: key.filter((b) => / · hace /.test(b.text)).length, out };
  });
  assert.ok(overlaps.n > 0, 'hay etiquetas de pista en el mapa');
  assert.deepEqual(overlaps.out, [], 'las etiquetas de pista y «Tú» no se solapan');
  await shot(page, vp, '11-caza-mapa');

  // E. Captura reclamada (la cercanía se fuerza con el gancho de pruebas: es simulada)
  const target = await page.evaluate(() => {
    const { state, S } = window.__rastro;
    const g = state.game;
    const me = S.self(g);
    const open = (id) => g.claims.some((c) => c.runnerId === id && (c.state === 'pending' || c.state === 'disputed'));
    const r = g.players.find((p) => p.team === 'runner' && p.status === 'active' && !open(p.id));
    if (!r || g.phase !== 'hunt') return null;
    me.pos = { x: r.pos.x + 5, y: r.pos.y };
    me.target = null;
    me.outsideSince = null;
    state.speed = 5;
    return r.name;
  });
  assert.ok(target, 'hay un fugitivo libre para la prueba de captura');
  await page.getByRole('button', { name: `Capturar a ${target}` }).click();
  await page.getByText(/Pendiente: esperando/).waitFor();
  await checkLayout(page, 'captura-pendiente');
  await shot(page, vp, '12-captura-pendiente');
  await page.evaluate(() => { window.__rastro.state.paused = false; });
  await page.waitForFunction(() => {
    const g = window.__rastro.state.game;
    return g.phase === 'finished' || g.claims.at(-1).state !== 'pending';
  }, null, { timeout: 10000 });
  await page.evaluate(() => { window.__rastro.state.paused = true; });
  const claimState = await page.evaluate(() => window.__rastro.state.game.claims.at(-1).state);
  assert.ok(['confirmed', 'disputed'].includes(claimState), `estado ${claimState}`);
  if (await page.locator('.modal').isVisible()) {
    await page.getByText(/Captura confirmada|Disputada/).first().waitFor();
    await shot(page, vp, '13-captura-resultado');
    await page.locator('.modal').getByRole('button').first().click();
  }

  // F. Final
  await page.evaluate(() => { const { state, S } = window.__rastro; S.endGame(state.game); state.paused = false; });
  await page.getByText('Fin de la ronda 1').waitFor({ timeout: 5000 });
  await checkLayout(page, 'final');
  await shot(page, vp, '14-final');
  await page.getByRole('button', { name: 'Volver a la sala' }).click();
  await page.getByText('Ronda 2').first().waitFor();

  // Partida como fugitivo, hasta el final real (x30), respondiendo a reclamaciones
  await page.locator('[data-action="team"][data-id="me"][data-team="runner"]').click();
  await page.evaluate(() => {
    const room = window.__rastro.state.room;
    if (!room.players.some((p) => !p.isSelf && p.team === 'hunter')) room.players[1].team = 'hunter';
  });
  await tap(page, 'Estoy listo');
  await page.waitForFunction(() => window.__rastro.S.canStart(window.__rastro.state.room), null, { timeout: 15000 });
  await page.getByRole('button', { name: 'Empezar' }).click();
  await confirmRole(page, vp, null);
  await page.locator('.countdown').waitFor({ state: 'detached', timeout: 6000 });
  await shot(page, vp, '15-ventaja-fugitivo');
  await page.evaluate(() => { window.__rastro.state.speed = 30; });
  await page.waitForFunction(() => window.__rastro.state.game.phase === 'hunt', null, { timeout: 20000 });

  // Rastro bajo «Tú»: sin moverse desde la pista, el anillo histórico rodea el halo.
  await page.evaluate(() => {
    const { state, S } = window.__rastro;
    state.paused = true;
    S.self(state.game).target = null;
  });
  await advance(page, await page.evaluate(() => { const g = window.__rastro.state.game; return g.nextPingAt - g.t + 0.5; }));
  await closeInfoModal(page);
  const trailInfo = await page.evaluate(() => {
    const { state, S } = window.__rastro;
    const t = S.ownTrail(state.game);
    const me = S.self(state.game).pos;
    const w = (sel) => document.querySelector(sel)?.getBoundingClientRect().width ?? 0;
    return { status: t?.status, same: Math.hypot(t.pos.x - me.x, t.pos.y - me.y) < 1, trail: w('.mk-trail'), halo: w('.mk-me-halo') };
  });
  assert.equal(trailInfo.status, 'sent');
  assert.ok(trailInfo.same, 'la posición comunicada coincide con la actual');
  assert.ok(trailInfo.trail > trailInfo.halo + 4, `el rastro (${trailInfo.trail}px) se ve fuera del halo (${trailInfo.halo}px)`);
  await page.getByText(/Recibieron · hace/).waitFor();
  await shot(page, vp, '15b-rastro-coincide');

  // Peligro con el panel abierto: el aviso de la siguiente pista no tapa el banner de fuera de zona.
  // Se sale de la zona justo antes de la siguiente pista (expuesto tras el margen) y llega la pista.
  await advance(page, await page.evaluate(() => { const g = window.__rastro.state.game; return g.nextPingAt - g.t - window.__rastro.S.EXPERIMENTAL.outsideGraceS - 3; }));
  await closeInfoModal(page);
  const home = await page.evaluate(() => {
    const { state, S } = window.__rastro;
    const g = state.game;
    const me = S.self(g);
    const back = { ...me.pos };
    me.pos = { x: g.settings.zoneRadiusM + 120, y: 0 };
    me.target = null;
    return back;
  });
  await advance(page, await page.evaluate(() => window.__rastro.S.EXPERIMENTAL.outsideGraceS + 1));
  await closeInfoModal(page);
  await page.locator('.sheet-handle').click();
  await page.locator('.banner.danger').waitFor();
  await advance(page, await page.evaluate(() => { const g = window.__rastro.state.game; return g.nextPingAt - g.t + 0.5; }));
  await page.locator('.toast').first().waitFor();
  const danger = await rect(page, '.banner.danger');
  for (let i = 0; i < await page.locator('.toast').count(); i++) {
    const t = await page.locator('.toast').nth(i).evaluate((el) => { const r = el.getBoundingClientRect(); return { x1: r.left, x2: r.right, y1: r.top, y2: r.bottom }; });
    assert.ok(!intersects(t, danger), 'el aviso no tapa el banner de peligro');
  }
  await checkLayout(page, 'peligro-con-aviso');
  await shot(page, vp, '15c-peligro-con-aviso');
  await closeInfoModal(page);
  await page.locator('.sheet-handle').click();
  await page.evaluate((pos) => {
    const { state, S } = window.__rastro;
    S.self(state.game).pos = pos;
    S.stepGame(state.game, 1);
    state.paused = false;
  }, home);

  // Reclamación entrante simulada para ver el modal
  await page.evaluate(() => {
    const { state } = window.__rastro;
    const g = state.game;
    const h = g.players.find((p) => p.team === 'hunter');
    g.incoming = { hunterId: h.id, hunterName: h.name, since: g.t };
    g.events.push({ t: g.t, type: 'incoming', text: '' });
    state.speed = 1;
  });
  await page.getByRole('heading', { name: /dice que te ha pillado/ }).waitFor();
  await checkLayout(page, 'captura-entrante');
  await shot(page, vp, '16-captura-entrante');
  await tap(page, 'No, lo disputo');
  await page.getByText(/Has disputado la captura/).first().waitFor();
  await tap(page, 'Entendido');
  await page.getByRole('button', { name: /Disputa abierta/ }).waitFor();
  await shot(page, vp, '17-disputa-abierta');
  await page.evaluate(() => { window.__rastro.state.speed = 30; });
  // Responder a cualquier otra reclamación disputándola, hasta que acabe la partida.
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const phase = await page.evaluate(() => window.__rastro.state.game?.phase ?? 'none');
    if (phase === 'finished' || phase === 'none') break;
    const incoming = await page.getByRole('button', { name: 'No, lo disputo' }).isVisible().catch(() => false);
    if (incoming) await tap(page, 'No, lo disputo');
    const ok = await page.getByRole('button', { name: 'Entendido' }).isVisible().catch(() => false);
    if (ok) await tap(page, 'Entendido');
    await page.waitForTimeout(400);
  }
  await page.getByText('Fin de la ronda 2').waitFor({ timeout: 10000 });
  const sum = await page.evaluate(() => {
    const { state, S } = window.__rastro;
    const g = state.game;
    return { open: g.claims.filter((c) => c.state === 'pending' || c.state === 'disputed').length, me: S.self(g).status };
  });
  assert.equal(sum.open, 0, 'ninguna disputa abierta al final');
  await shot(page, vp, '18-final-fugitivo');
  // Sala en modo manual: la política de ronda no aplica y se explica en pantalla.
  await page.getByText('Modo manual: los equipos se mantienen').waitFor();
  await page.getByRole('button', { name: 'Nueva ronda' }).click();
  await page.getByText('Ronda 3').first().waitFor();

  const geo = await page.evaluate(() => window.__geoCalls);
  assert.equal(geo, 0, 'no se usa la geolocalización');
  assert.deepEqual(requests, [], 'sin peticiones de red');
  assert.deepEqual(errors, [], `errores de consola: ${errors.join(' | ')}`);
  await context.close();
  return { viewport: vp.name, me: sum.me };
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const r = await runViewport(browser, vp);
      console.log(`ok ${vp.name} (${vp.width}×${vp.height}) · fugitivo terminó ${r.me}`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('FALLO:', e.message);
  process.exit(1);
});
