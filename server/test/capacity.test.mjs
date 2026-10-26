import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hub } from '../hub.ts';

// Seguridad de las salas: una sola dirección no puede acaparar la capacidad del servidor creando salas
// desde conexiones nuevas (cada conexión puede crear una). Hub directo con transportes de prueba para
// simular direcciones distintas (por WebSocket real, todo llega desde 127.0.0.1).

function connection(hub, ip) {
  const inbox = [];
  const handle = hub.connect({ send: (text) => inbox.push(JSON.parse(text)), close: () => {} }, ip);
  let n = 0;
  return {
    inbox,
    create() {
      handle.receive(JSON.stringify({ t: 'create', name: 'Ana', installId: `inst-${ip}-${++n}-${Math.random()}` }));
      return inbox.at(-1)?.t === 'snapshot' ? inbox.find((m) => m.t === 'welcome') : inbox.at(-1);
    },
    cmd(cmd) {
      handle.receive(JSON.stringify({ t: 'cmd', id: `c${++n}`, cmd }));
      return inbox.filter((m) => m.t === 'result').at(-1)?.result;
    },
  };
}

describe('capacidad del servidor por dirección', () => {
  it('una dirección puede tener como mucho 5 salas activas; las demás direcciones no se ven afectadas', () => {
    const hub = new Hub({ maxRooms: 100 });
    for (let i = 0; i < 5; i++) assert.equal(connection(hub, '10.0.0.1').create().t, 'welcome', `sala ${i + 1}`);
    assert.deepEqual(connection(hub, '10.0.0.1').create(), { t: 'error', error: 'too_many_rooms' });
    assert.equal(hub.stats().rooms, 5);
    assert.equal(connection(hub, '10.0.0.2').create().t, 'welcome', 'otra dirección sí puede');
  });

  it('sin este límite, una sola dirección llenaría el servidor para todos (el caso que se evita)', () => {
    const hub = new Hub({ maxRooms: 20, maxRoomsPerIp: 1_000 });
    for (let i = 0; i < 20; i++) connection(hub, '10.0.0.1').create();
    assert.deepEqual(connection(hub, '10.0.0.2').create(), { t: 'error', error: 'server_full' });
  });

  it('al cerrar una sala, esa dirección puede volver a crear', () => {
    const hub = new Hub();
    const hosts = Array.from({ length: 5 }, () => connection(hub, '10.0.0.3'));
    for (const h of hosts) assert.equal(h.create().t, 'welcome');
    assert.equal(connection(hub, '10.0.0.3').create().error, 'too_many_rooms');
    assert.equal(hosts[0].cmd({ type: 'cancel' }).ok, true); // la sala queda cerrada (se borra a los 60 s)
    assert.equal(connection(hub, '10.0.0.3').create().t, 'welcome', 'las salas cerradas no cuentan');
  });

  it('el límite es configurable', () => {
    const hub = new Hub({ maxRoomsPerIp: 1 });
    assert.equal(connection(hub, '10.0.0.4').create().t, 'welcome');
    assert.equal(connection(hub, '10.0.0.4').create().error, 'too_many_rooms');
  });
});
