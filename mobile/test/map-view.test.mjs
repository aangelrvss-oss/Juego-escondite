import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, offsetM } from '../../engine/src/geo.ts';
import { mapModel } from '../www/js/game-view.js';
import { DEFAULT_MAPTILER_STYLE, MAP_MESSAGES, circleRing, createMapController, loadMapConfig, loadMapLibre, mapFeatures, styleUrlFrom, zoneBounds } from '../www/js/map-view.js';

// Mapa real (map-view.js) y su modelo (mapModel). Aquí, en Node, con un MapLibre y un DOM SIMULADOS
// que registran las llamadas: se comprueba el ciclo de vida (un solo mapa, marcadores reutilizados,
// cámara intacta, limpieza) y la privacidad (solo lo autorizado). Que la cartografía se vea de verdad
// necesita un navegador real: mobile/e2e/map.e2e.mjs (Chrome, sin clave: estilo local) y un móvil.

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor (no es la ubicación de nadie)
const at = (north, east = 0) => offsetM(CENTER, north, east);

// ------------------------------------------------------------------ dobles de prueba

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.attrs = {};
    this.listeners = new Map();
    this.dataset = {};
    const owner = this;
    this.classList = {
      add: (...c) => (owner.className = [...new Set([...owner.className.split(' ').filter(Boolean), ...c])].join(' ')),
      remove: (...c) => (owner.className = owner.className.split(' ').filter((x) => x && !c.includes(x)).join(' ')),
      toggle: (c, on) => (on ? owner.classList.add(c) : owner.classList.remove(c)),
      contains: (c) => owner.className.split(' ').includes(c),
    };
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(type, fn) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  click() {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }
  /** Todo el texto del subárbol (lo que vería alguien en pantalla). */
  get allText() {
    return [this.textContent, ...this.children.map((c) => c.allText)].join(' ');
  }
  find(cls) {
    if (this.classList.contains(cls)) return this;
    for (const c of this.children) {
      const f = c.find(cls);
      if (f) return f;
    }
    return null;
  }
}
const fakeDoc = { createElement: (tag) => new FakeElement(tag) };

function fakeLib({ throwOnCreate = false } = {}) {
  const log = { maps: [], markers: [] };
  class Map {
    constructor(opts) {
      if (throwOnCreate) throw new Error('Failed to initialize WebGL');
      this.opts = opts;
      this.handlers = {};
      this.sources = {};
      this.layers = [];
      this.camera = [];
      this.zoom = 15;
      this.removed = false;
      this.touchZoomRotate = { disableRotation: () => (this.noRotate = true) };
      this.keyboard = { disableRotation: () => {} };
      log.maps.push(this);
    }
    on(type, fn) {
      (this.handlers[type] ??= []).push(fn);
    }
    off(type, fn) {
      this.handlers[type] = (this.handlers[type] ?? []).filter((f) => f !== fn);
    }
    emit(type, e) {
      for (const fn of this.handlers[type] ?? []) fn(e);
    }
    addSource(id) {
      const src = { setData: (d) => src.data.push(d), data: [] };
      this.sources[id] = src;
    }
    getSource(id) {
      return this.sources[id];
    }
    addLayer(l) {
      this.layers.push(l.id);
    }
    getZoom() {
      return this.zoom;
    }
    easeTo(o) {
      this.camera.push(['easeTo', o]);
    }
    fitBounds(b) {
      this.camera.push(['fitBounds', b]);
    }
    jumpTo(o) {
      this.camera.push(['jumpTo', o]);
    }
    setZoom(z) {
      this.camera.push(['setZoom', z]);
    }
    remove() {
      this.removed = true;
    }
  }
  class Marker {
    constructor({ element }) {
      this.element = element;
      this.moves = [];
      this.removed = false;
      log.markers.push(this);
    }
    setLngLat(ll) {
      this.lngLat = ll;
      this.moves.push(ll);
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.removed = true;
    }
  }
  return { lib: { Map, Marker }, log };
}

function model(over = {}) {
  return {
    center: CENTER,
    radiusM: 400,
    meeting: CENTER,
    me: { ...at(10, 5), accuracyM: 8 },
    myTeam: 'runner',
    dots: [{ id: 'p_beto', ...at(50, 20), label: 'Beto · hace 2 s', kind: 'mate', team: 'runner', stale: false }],
    ...over,
  };
}

function setup(over = {}, opts = {}) {
  const { lib, log } = fakeLib(opts.lib);
  const host = new FakeElement('section');
  const failures = [];
  const ctrl = createMapController(host, { lib, styleUrl: 'https://estilo.prueba/style.json', model: model(over), onFail: (r) => failures.push(r), doc: fakeDoc, ...opts.ctrl });
  return { ctrl, host, log, failures, map: log.maps[0] };
}

const markerOf = (log, text) => log.markers.find((m) => !m.removed && m.element.allText.includes(text));

// ------------------------------------------------------------------ geometría

test('el círculo de la zona tiene el radio pedido (±1 %) y cabe en sus límites', () => {
  const ring = circleRing(CENTER, 400);
  assert.equal(ring.length, 65);
  assert.deepEqual(ring[0], ring.at(-1), 'anillo cerrado');
  for (const [lng, lat] of ring) {
    const d = distanceM(CENTER, { lat, lng });
    assert.ok(Math.abs(d - 400) < 4, `vértice a ${d.toFixed(1)} m`);
  }
  const [[w, s], [e, n]] = zoneBounds(CENTER, 400);
  for (const [lng, lat] of ring) assert.ok(lng >= w - 1e-9 && lng <= e + 1e-9 && lat >= s - 1e-9 && lat <= n + 1e-9);
});

test('mapFeatures: descarta puntos sin coordenadas válidas y limita el círculo de precisión', () => {
  const f = mapFeatures(
    model({
      me: { ...at(0), accuracyM: 5_000 },
      dots: [
        { id: 'a', lat: NaN, lng: 1, label: 'x', kind: 'mate' },
        { id: 'b', lat: 91, lng: 1, label: 'x', kind: 'mate' },
        { id: 'c', ...at(5), label: 'ok', kind: 'mate', team: 'runner' },
      ],
    }),
  );
  assert.deepEqual(f.markers.map((m) => m.id), ['c']);
  const ring = f.accuracy.features[0].geometry.coordinates[0];
  assert.ok(Math.abs(distanceM(at(0), { lng: ring[0][0], lat: ring[0][1] }) - 800) < 8, 'como mucho 2 veces el radio de la zona');
  assert.equal(mapFeatures(model({ me: null })).me, null);
  assert.equal(mapFeatures(model({ me: null })).accuracy.features.length, 0);
});

// ------------------------------------------------------------------ configuración

test('configuración del proveedor: nunca una clave de ejemplo ni una dirección sin https', () => {
  assert.equal(styleUrlFrom(null), null);
  assert.equal(styleUrlFrom({ proveedor: 'maptiler', clave: 'TU_CLAVE_PUBLICA' }), null, 'la clave del ejemplo no vale');
  assert.equal(styleUrlFrom({ proveedor: 'maptiler', clave: 'corta' }), null);
  assert.equal(styleUrlFrom({ proveedor: 'maptiler', clave: 'abc def ghi jkl' }), null);
  assert.equal(styleUrlFrom({ proveedor: 'osm', clave: 'abcdefgh12345' }), null, 'sin proveedor conocido no se inventa una URL');
  assert.equal(styleUrlFrom({ proveedor: 'maptiler', clave: 'abcdEFGH1234' }), `https://api.maptiler.com/maps/${DEFAULT_MAPTILER_STYLE}/style.json?key=abcdEFGH1234`);
  assert.equal(styleUrlFrom({ proveedor: 'maptiler', clave: 'abcdEFGH1234', estilo: 'streets-v4-dark' }), 'https://api.maptiler.com/maps/streets-v4-dark/style.json?key=abcdEFGH1234');
  assert.equal(styleUrlFrom({ proveedor: 'maptiler', clave: 'abcdEFGH1234', estilo: '../x' }), `https://api.maptiler.com/maps/${DEFAULT_MAPTILER_STYLE}/style.json?key=abcdEFGH1234`);
  assert.equal(styleUrlFrom({ estiloUrl: 'https://tiles.example/style.json' }), 'https://tiles.example/style.json');
  assert.equal(styleUrlFrom({ estiloUrl: 'http://tiles.example/style.json' }), null);
  assert.equal(styleUrlFrom({ estiloUrl: 'javascript:alert(1)' }), null);
});

test('loadMapConfig: sin archivo, ilegible o válido', async () => {
  const res = (status, body) => async () => ({ ok: status === 200, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });
  assert.deepEqual(await loadMapConfig(res(404, {})), { ok: false, reason: 'no_config' });
  assert.deepEqual(await loadMapConfig(async () => Promise.reject(new TypeError('offline'))), { ok: false, reason: 'no_config' });
  assert.deepEqual(await loadMapConfig(res(200, '{roto')), { ok: false, reason: 'bad_config' });
  assert.deepEqual(await loadMapConfig(res(200, { proveedor: 'maptiler', clave: 'TU_CLAVE_PUBLICA' })), { ok: false, reason: 'bad_config' });
  assert.deepEqual(await loadMapConfig(res(200, { proveedor: 'ninguno' })), { ok: false, reason: 'no_config' }, 'el archivo sin clave de npm run vendor');
  assert.equal((await loadMapConfig(res(200, { proveedor: 'maptiler', clave: 'abcdEFGH1234' }))).ok, true);
});

test('loadMapLibre: la hoja de estilos se añade una vez y un fallo permite reintentar', async () => {
  const head = new FakeElement('head');
  const doc = { head, createElement: (t) => new FakeElement(t), querySelector: () => (head.children.length ? head.children[0] : null) };
  await assert.rejects(loadMapLibre({ importer: async () => ({}), doc }), /library/);
  const { lib } = fakeLib();
  assert.equal(await loadMapLibre({ importer: async () => lib, doc }), lib, 'tras el fallo se vuelve a intentar');
  assert.equal(head.children.length, 1);
});

// ------------------------------------------------------------------ modelo: solo lo autorizado

test('mapModel: solo dibuja lo que el servidor ha enviado; un fugitivo nunca ve pistas', () => {
  const snap = {
    config: { zone: [{ center: CENTER, radiusM: 400 }], meetingPoint: CENTER },
    players: [
      { id: 'p_ana', name: 'Ana', team: 'hunter' },
      { id: 'p_beto', name: 'Beto', team: 'runner' },
      { id: 'p_caro', name: 'Caro', team: 'runner' },
    ],
  };
  const nameOf = (id) => snap.players.find((p) => p.id === id)?.name;
  const positions = [{ playerId: 'p_caro', ...at(30), ageMs: 1_000, availability: 'CURRENT', reason: 'teammate' }];
  const ping = { at: 0, entries: [{ runnerId: 'p_caro', position: at(100), ageMs: 0 }] };
  const runner = mapModel({ snap, team: 'runner', positions, positionsAt: 0, ping, reading: null, now: 2_000, nameOf });
  assert.deepEqual(runner.dots.map((d) => d.id), ['p_caro'], 'ni la cazadora (no enviada) ni pistas');
  assert.equal(runner.me, null, 'sin lectura propia no hay posición propia: nunca se inventa');
  assert.ok(!JSON.stringify(runner).includes('Ana'));
  const hunter = mapModel({ snap, team: 'hunter', positions: [], positionsAt: 0, ping, reading: null, now: 2_000, nameOf });
  assert.deepEqual(hunter.dots.map((d) => `${d.id}:${d.kind}`), ['ping:p_caro:ping']);
  assert.equal(mapModel({ snap: { config: null }, team: 'runner', now: 0 }), null);
});

test('mapModel: una posición se marca desactualizada por el servidor o si envejece aquí (sin conexión)', () => {
  // La vista lista a quien tiene posición (si no, ya no está en la partida y no se dibuja: V-11).
  const snap = { config: { zone: [{ center: CENTER, radiusM: 400 }], meetingPoint: CENTER }, players: [{ id: 'x', team: 'runner', status: 'active' }, { id: 'y', team: 'runner', status: 'active' }] };
  const p = (availability, ageMs) => [{ playerId: 'x', ...at(1), ageMs, availability, reason: 'teammate' }];
  assert.equal(mapModel({ snap, team: 'runner', positions: p('CURRENT', 1_000), positionsAt: 0, now: 1_000 }).dots[0].stale, false);
  assert.equal(mapModel({ snap, team: 'runner', positions: p('STALE', 1_000), positionsAt: 0, now: 1_000 }).dots[0].stale, true);
  assert.equal(mapModel({ snap, team: 'runner', positions: p('CURRENT', 1_000), positionsAt: 0, now: 20_000 }).dots[0].stale, true, 'sin posiciones nuevas durante 20 s');
  assert.equal(mapModel({ snap, team: 'runner', positions: [{ playerId: 'y', lat: null, lng: null, reason: 'teammate' }], now: 0 }).dots.length, 0);
});

// ------------------------------------------------------------------ ciclo de vida del mapa

test('un solo mapa por partida: las actualizaciones mueven los marcadores y no tocan la cámara', () => {
  const { ctrl, log, map, host } = setup();
  assert.equal(log.maps.length, 1);
  assert.deepEqual(map.opts.bounds, zoneBounds(CENTER, 400), 'empieza mostrando la zona, no una posición inventada');
  assert.equal(map.opts.style, 'https://estilo.prueba/style.json');
  assert.equal(map.noRotate, true);
  assert.deepEqual(map.opts.attributionControl, { compact: false }, 'atribución siempre visible (MapTiler)');
  assert.equal(host.find('map-status').hidden, false, 'mensaje de carga');
  ctrl.update(model()); // antes de cargar: no falla ni dibuja
  assert.equal(log.markers.length, 0);
  map.emit('load');
  assert.equal(host.find('map-status').hidden, true);
  assert.deepEqual(map.layers, ['outrun-zone-fill', 'outrun-zone-line', 'outrun-accuracy-fill', 'outrun-accuracy-line']);
  const created = log.markers.length; // encuentro + yo + Beto
  assert.equal(created, 3);
  map.zoom = 18; // el jugador ha hecho zoom
  for (let i = 0; i < 50; i++) {
    ctrl.update(model({ me: { ...at(10 + i, 5), accuracyM: 8 }, dots: [{ id: 'p_beto', ...at(50 + i, 20), label: `Beto · hace ${i} s`, kind: 'mate', team: 'runner' }] }));
  }
  assert.equal(log.maps.length, 1, 'el mapa no se recrea');
  assert.equal(log.markers.length, created, 'los marcadores se reutilizan');
  assert.equal(markerOf(log, 'Beto').moves.length, 50, 'al crearse y en cada cambio (la 1.ª actualización repite la posición)');
  assert.equal(markerOf(log, 'Beto').element.allText.includes('hace 49 s'), true);
  assert.deepEqual(map.camera, [], 'ninguna actualización mueve la cámara ni cambia el zoom');
  assert.equal(map.getZoom(), 18);
  assert.equal(map.sources['outrun-zone'].data.length, 1, 'la zona no se redibuja si no cambia');
  assert.equal(map.sources['outrun-accuracy'].data.length, 50, 'solo cuando cambia la lectura propia');
});

test('un marcador que deja de estar autorizado desaparece; uno nuevo aparece', () => {
  const { ctrl, log, map } = setup();
  map.emit('load');
  ctrl.update(model({ dots: [{ id: 'p_caro', ...at(5), label: 'Caro', kind: 'exposed', team: 'runner' }] }));
  assert.equal(log.markers.find((m) => m.element.allText.includes('Beto')).removed, true);
  assert.ok(markerOf(log, 'Caro'));
  assert.match(markerOf(log, 'Caro').element.children[0].className, /mk-exposed t-runner/);
  assert.match(markerOf(log, 'Caro').element.className, /mk-wrap/, 'la clase del envoltorio (que posiciona MapLibre) no se toca');
});

test('sin GPS propio: sin marcador propio ni círculo de precisión, «Mi posición» desactivado y sin errores', () => {
  const { ctrl, log, map, host } = setup({ me: null });
  map.emit('load');
  ctrl.update(model({ me: null }));
  assert.equal(log.markers.filter((m) => /\bmk-me\b/.test(m.element.children[0].className)).length, 0);
  assert.equal(map.sources['outrun-accuracy'].data.length, 0);
  const meBtn = host.children.find((c) => c.className === 'map-tools').children[0];
  assert.equal(meBtn.disabled, true);
  meBtn.click();
  assert.deepEqual(map.camera, []);
  ctrl.update(model()); // llega la primera lectura
  assert.equal(log.markers.filter((m) => !m.removed && /\bmk-me\b/.test(m.element.children[0].className)).length, 1, 'ahora sí hay marcador propio');
  assert.equal(meBtn.disabled, false);
  meBtn.click();
  assert.equal(map.camera[0][0], 'easeTo');
  host.children.find((c) => c.className === 'map-tools').children[1].click();
  assert.equal(map.camera[1][0], 'fitBounds');
});

test('desactualizada y sin conexión: se ve en el marcador y en el mapa', () => {
  const { ctrl, log, map, host } = setup();
  map.emit('load');
  ctrl.update(model({ dots: [{ id: 'p_beto', ...at(50), label: 'Beto · hace 40 s', kind: 'mate', team: 'runner', stale: true }] }), { offline: true });
  assert.match(markerOf(log, 'Beto').element.children[0].className, /is-stale/);
  assert.equal(host.classList.contains('is-offline'), true);
  assert.equal(host.find('map-badge').textContent, MAP_MESSAGES.offline);
  assert.equal(host.find('map-badge').hidden, false);
  ctrl.update(model(), { offline: false });
  assert.equal(host.classList.contains('is-offline'), false);
  assert.equal(host.find('map-badge').hidden, true);
});

test('los nombres se escriben como texto, nunca como HTML', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { ctrl, log, map } = setup();
  map.emit('load');
  ctrl.update(model({ dots: [{ id: 'p_x', ...at(5), label: evil, kind: 'mate', team: 'runner' }] }));
  const label = markerOf(log, evil).element.children[0].children[1];
  assert.equal(label.textContent, evil);
  assert.equal(label.innerHTML, undefined, 'no se usa innerHTML');
});

test('fallos de la cartografía: clave rechazada, estilo, tiempo de espera y sin WebGL', async () => {
  let s = setup();
  s.map.emit('error', { error: { status: 403 } });
  s.map.emit('error', { error: { status: 403 } });
  assert.deepEqual(s.failures, ['key'], 'se avisa una sola vez');
  s = setup();
  s.map.emit('error', { error: new Error('Failed to fetch') });
  assert.deepEqual(s.failures, ['style']);
  s = setup({}, { ctrl: { loadTimeoutMs: 20 } });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(s.failures, ['timeout']);
  s.ctrl.destroy();
  s = setup({}, { lib: { throwOnCreate: true } });
  await Promise.resolve();
  assert.deepEqual(s.failures, ['webgl']);
  assert.equal(s.ctrl.status, 'failed');
  // Ya cargado, un fallo de teselas (sin cobertura) es solo un aviso: la partida sigue con el mapa.
  s = setup();
  s.map.emit('load');
  s.map.emit('error', { error: { status: 0 } });
  assert.deepEqual(s.failures, []);
  assert.equal(s.host.find('map-badge').textContent, MAP_MESSAGES.degraded);
  s.ctrl.destroy();
});

test('al salir de la partida se libera todo: mapa, marcadores y listeners', () => {
  const { ctrl, log, map, host } = setup();
  map.emit('load');
  const tools = host.children.find((c) => c.className === 'map-tools');
  ctrl.destroy();
  assert.equal(map.removed, true);
  assert.ok(log.markers.every((m) => m.removed));
  assert.equal(map.handlers.load.length + map.handlers.error.length, 0);
  assert.ok(tools.children.every((b) => (b.listeners.get('click') ?? []).length === 0));
  assert.equal(host.children.length, 0);
  assert.equal(host.classList.contains('map-live'), false);
  ctrl.update(model()); // después de destruir: no hace nada
  assert.equal(ctrl.status, 'destroyed');
  ctrl.destroy(); // dos veces: sin error
});
