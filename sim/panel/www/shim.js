// Guion del SIMULADOR para la interfaz real del juego (solo lo sirve sim/panel/servidor.mjs, nunca el
// servidor del juego ni la app). Antes de que arranque la app:
//   1. Carga la sesión del participante que juegas desde la interfaz (o la borra si no juegas ninguno).
//   2. Sustituye el GPS del navegador por el GPS SIMULADO de ese participante (nunca tu ubicación real).
//   3. Hace que Date.now siga el reloj de la simulación (pausa, tiempo acelerado, avances).
//   4. Pone un rótulo fijo que dice que es una simulación (salvo en la grabación promocional, sim/grabacion).
(() => {
  'use strict';
  const get = (path) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', path, false); // síncrono a propósito: la app no debe arrancar sin sesión ni reloj
    xhr.send();
    return xhr.status === 200 ? JSON.parse(xhr.responseText) : null;
  };
  let info = null;
  try {
    info = get('/sim/api/jugador');
  } catch {}

  // --- reloj de la simulación
  const realNow = Date.now.bind(Date);
  let clock = { v: realNow(), p: performance.now(), speed: 1, paused: false };
  const sync = (c) => {
    if (c) clock = { v: c.now, p: performance.now(), speed: c.speed, paused: c.paused };
  };
  sync(info?.clock);
  Date.now = () => Math.round(clock.paused ? clock.v : clock.v + (performance.now() - clock.p) * clock.speed);

  // --- sesión
  try {
    if (info?.session) {
      const current = JSON.parse(localStorage.getItem('outrun.session') ?? 'null');
      if (current?.playerId !== info.session.playerId) localStorage.setItem('outrun.session', JSON.stringify(info.session));
      localStorage.setItem('outrun.name', info.name);
      localStorage.setItem('outrun.adult', '1');
    } else localStorage.removeItem('outrun.session');
  } catch {}

  // --- GPS simulado
  let pos = info?.pos ?? null;
  const watchers = new Map();
  let nextId = 1;
  const position = () => ({
    coords: { latitude: pos.lat, longitude: pos.lng, accuracy: pos.acc, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  });
  const fake = {
    getCurrentPosition(ok, fail) {
      setTimeout(() => (pos ? ok(position()) : fail?.({ code: 2, message: 'simulación sin posición' })), 50);
    },
    watchPosition(ok) {
      const id = nextId++;
      watchers.set(id, ok);
      if (pos) setTimeout(() => watchers.get(id)?.(position()), 50);
      return id;
    },
    clearWatch(id) {
      watchers.delete(id);
    },
  };
  try {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => fake });
  } catch {}

  const poll = async () => {
    try {
      const r = await fetch('/sim/api/jugador', { cache: 'no-store' });
      const next = await r.json();
      sync(next.clock);
      if (next.name === info?.name && next.run === info?.run && next.pos) {
        pos = next.pos;
        for (const fn of watchers.values()) fn(position());
      }
    } catch {}
  };
  setInterval(poll, 1_000);

  // --- rótulo
  addEventListener('DOMContentLoaded', () => {
    if (info?.banner === false) return; // grabación promocional (sim/grabacion): sin rótulo
    const b = document.createElement('div');
    b.textContent = info?.name ? `SIMULACIÓN · ${info.name} · GPS y reloj simulados` : 'SIMULACIÓN · ningún participante asignado a esta interfaz';
    b.setAttribute('aria-hidden', 'true');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:2px 6px;font:700 11px system-ui;color:#0a0b0d;background:rgba(255,214,0,.92);text-align:center;pointer-events:none';
    document.body.append(b);
  });
})();
