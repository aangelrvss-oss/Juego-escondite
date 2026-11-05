import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE } from '../src/constants.ts';
import { distanceM, offsetM } from '../src/geo.ts';
import type { GameConfig } from '../src/types.ts';
import { CENTER, Harness, config } from './helpers.ts';

// AF-01 (segunda auditoría, 04/11/2026; D-062). La referencia para medir los recentrados era una sola para
// toda la sala (la del último cambio material). Quien se marcaba listo a mitad de una deriva podía empezar
// con la zona a 98 m de la que aceptó: +49 m, se marca listo, −49 m. Ahora cada «listo» recuerda lo que
// aceptó (revisión de las reglas, zona y punto de encuentro), cada `configure` lo mide desde ahí y `start`
// vuelve a comprobarlo con la configuración con la que se empieza.

// Zona y punto de encuentro desplazados `north` m al norte (y `east` al este) del centro de los tests.
const at = (north: number, east = 0, over: Partial<GameConfig> = {}): GameConfig => {
  const c = offsetM(CENTER, north, east);
  return config({ zone: [{ fromOffsetMs: 0, center: c, radiusM: 400 }], meetingPoint: c, ...over });
};

const ready = (g: Harness, id: string) => g.state.players[id]!.ready;
const zoneFrom = (g: Harness, north: number) => distanceM(offsetM(CENTER, north, 0), g.state.config!.zone[0]!.center);

// Sala con anfitrión «h» y los jugadores indicados, configurada en el centro y sin nadie listo.
function room(...ids: string[]): Harness {
  const g = new Harness();
  for (const id of ids) g.join(id);
  g.ok('h', { type: 'configure', config: at(0) });
  return g;
}

describe('AF-01 · cada «listo» se mide desde lo que aceptó ese jugador', () => {
  it('el caso de los 98 m de la auditoría ya no puede ocurrir', () => {
    const g = room('a', 'b');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'configure', config: at(49) }); // a: 49 m de lo aceptado, sigue listo
    assert.equal(ready(g, 'a'), true);
    g.ok('b', { type: 'set_ready', ready: true }); // b acepta la zona a +49 m
    g.ok('h', { type: 'configure', config: at(-49) }); // 98 m de lo que aceptó b
    assert.ok(zoneFrom(g, 49) > 95);
    assert.equal(ready(g, 'b'), false, 'la zona está a 98 m de la que aceptó b');
    assert.equal(ready(g, 'a'), true, 'a aceptó el centro: −49 m sigue a menos de 50 m');
    g.ok('h', { type: 'set_ready', ready: true });
    assert.equal(g.cmd('h', { type: 'start' }).ok, false, 'no se puede empezar con b sin volver a confirmar');
  });

  it('un jugador listo y la zona movida muchas veces en pasos pequeños: lo pierde al acumular 50 m', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    let lostAt = -1;
    for (let i = 1; i <= 10 && lostAt < 0; i++) {
      g.ok('h', { type: 'configure', config: at(10 * i) });
      if (!ready(g, 'a')) lostAt = 10 * i;
    }
    assert.equal(lostAt, 50);
  });

  it('un jugador que se marca listo después de varios movimientos pequeños se mide desde ahí', () => {
    const g = room('a');
    for (const m of [20, 40, 60, 80]) g.ok('h', { type: 'configure', config: at(m) });
    g.ok('a', { type: 'set_ready', ready: true }); // acepta +80
    g.ok('h', { type: 'configure', config: at(120) }); // 40 m desde lo aceptado
    assert.equal(ready(g, 'a'), true);
    g.ok('h', { type: 'configure', config: at(130) }); // 50 m: otro sitio
    assert.equal(ready(g, 'a'), false);
  });

  it('jugadores que se preparan en momentos distintos: cada uno con su referencia; nadie empieza lejos de lo suyo', () => {
    const g = room('a', 'b', 'c');
    g.ok('a', { type: 'set_ready', ready: true }); // acepta 0
    g.ok('h', { type: 'configure', config: at(30) });
    g.ok('b', { type: 'set_ready', ready: true }); // acepta +30
    g.ok('h', { type: 'configure', config: at(60) });
    g.ok('c', { type: 'set_ready', ready: true }); // acepta +60
    assert.deepEqual([ready(g, 'a'), ready(g, 'b'), ready(g, 'c')], [false, true, true], 'a: 60 m de lo suyo');
    g.ok('h', { type: 'configure', config: at(85) });
    assert.deepEqual([ready(g, 'b'), ready(g, 'c')], [false, true], 'b: 55 m; c: 25 m');
    // Quien sigue listo está, en el momento de empezar, a menos de 50 m de lo que aceptó.
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('b', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'set_ready', ready: true });
    assert.equal(g.cmd('h', { type: 'start' }).ok, true);
  });

  it('el umbral acumulado se aplica también al punto de encuentro, por separado de la zona', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'configure', config: config({ meetingPoint: offsetM(CENTER, 0, 30) }) });
    g.ok('h', { type: 'configure', config: config({ meetingPoint: offsetM(CENTER, 0, 49) }) });
    assert.equal(ready(g, 'a'), true);
    g.ok('h', { type: 'configure', config: config({ meetingPoint: offsetM(CENTER, 0, 51) }) });
    assert.equal(ready(g, 'a'), false);
  });

  it('el anfitrión no puede empezar con preparaciones obsoletas, aunque el «listo» figure marcado', () => {
    // Estado manipulado (o de un error futuro): «listo» marcado con una referencia vieja. start lo revisa.
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'set_ready', ready: true });
    g.state.players.a!.readyRef = { ...g.state.players.a!.readyRef!, centers: [offsetM(CENTER, 200, 0)] };
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'players_not_ready' });
    g.state.players.a!.readyRef = { ...g.state.players.a!.readyRef!, centers: [CENTER], rev: 99 };
    assert.deepEqual(g.cmd('h', { type: 'start' }), { ok: false, error: 'players_not_ready' }, 'otra revisión de reglas');
  });

  it('el anfitrión que recentra acepta la configuración nueva y conserva su «listo»', () => {
    const g = room('a');
    g.ok('h', { type: 'set_ready', ready: true });
    for (const m of [45, 90, 135, 180]) g.ok('h', { type: 'configure', config: at(m) });
    assert.equal(ready(g, 'h'), true);
    g.ok('a', { type: 'set_ready', ready: true });
    assert.equal(g.cmd('h', { type: 'start' }).ok, true);
  });

  it('entra o sale un jugador durante la preparación: no cambia la referencia de nadie', () => {
    const g = room('a', 'b');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'configure', config: at(40) });
    g.join('c');
    g.ok('b', { type: 'leave' });
    g.ok('h', { type: 'configure', config: at(-10) }); // 50 m desde +40, 10 m desde lo que aceptó a
    assert.equal(ready(g, 'a'), true);
    assert.equal(g.state.players.b!.ready, false);
    g.ok('c', { type: 'set_ready', ready: true }); // acepta −10
    g.ok('h', { type: 'configure', config: at(39) }); // a: 39 m; c: 49 m
    assert.deepEqual([ready(g, 'a'), ready(g, 'c')], [true, true]);
  });

  it('salir y volver a entrar no conserva un «listo» viejo', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('a', { type: 'leave' });
    g.ok('a2', { type: 'join', name: 'Jug a', deviceId: 'dev-a' }); // misma persona, plaza nueva
    assert.equal(ready(g, 'a2'), false);
    assert.equal(g.state.players.a2!.readyRef ?? null, null);
  });

  it('marcar o desmarcar la lista de seguridad no quita el «listo» y no mueve ninguna referencia', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'configure', config: at(30, 0, { safetyChecklistConfirmed: false }) });
    g.ok('h', { type: 'configure', config: at(30, 0, { safetyChecklistConfirmed: true }) });
    g.ok('h', { type: 'configure', config: at(55) }); // 55 m de lo aceptado por a
    assert.equal(ready(g, 'a'), false);
  });

  it('cambiar el modo o la duración quita el «listo» a los demás, aunque la zona no se mueva', () => {
    for (const over of [{ mode: 'infection' as const }, { durationMs: 25 * MINUTE }]) {
      const g = room('a');
      g.ok('a', { type: 'set_ready', ready: true });
      g.ok('h', { type: 'set_ready', ready: true });
      g.ok('h', { type: 'configure', config: at(0, 0, over) });
      assert.equal(ready(g, 'a'), false, JSON.stringify(over));
      assert.equal(ready(g, 'h'), true);
      // Volver a las reglas de antes no devuelve el «listo»: es otra revisión.
      g.ok('a', { type: 'set_ready', ready: true });
      g.ok('h', { type: 'configure', config: at(0) });
      assert.equal(ready(g, 'a'), false);
    }
  });

  it('un estado guardado sin referencias (antes de D-062) no permite deriva ilimitada', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    delete g.state.players.a!.readyRef;
    delete g.state.configRev;
    for (let i = 1; i <= 10; i++) g.ok('h', { type: 'configure', config: at(45 * i) });
    assert.equal(ready(g, 'a'), false);
  });

  it('desmarcarse borra la referencia; volver a marcarse acepta la configuración vigente', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'configure', config: at(45) });
    g.ok('a', { type: 'set_ready', ready: false });
    assert.equal(g.state.players.a!.readyRef, null);
    g.ok('a', { type: 'set_ready', ready: true });
    g.ok('h', { type: 'configure', config: at(90) }); // 45 m desde lo nuevo
    assert.equal(ready(g, 'a'), true);
  });

  it('la vista no expone la referencia de nadie', () => {
    const g = room('a');
    g.ok('a', { type: 'set_ready', ready: true });
    assert.ok(!JSON.stringify(g.events.filter((e) => e.type === 'player_updated')).includes('readyRef'));
  });
});
