# Diagnóstico previo: zona dinámica (1/11/2026)

Escrito antes de modificar código. Rama `mapa-real`, HEAD `462016d`; 94 entradas sin confirmar en `git status`, que se conservan.

## Qué hay hoy

| Capa | Archivo | Estado |
|---|---|---|
| Motor: configuración | `engine/src/config.ts`, `engine/src/constants.ts` | `LIMITS.maxZoneVersions = 1` y `fromOffsetMs` tiene que ser 0. El radio va de 150 a 2.000 m. |
| Motor: geometría | `engine/src/geo.ts` (`zoneAt`) | Elige la versión vigente **por escalones**, sin interpolar. Con una sola versión, siempre devuelve la zona inicial. |
| Motor: evaluación | `engine/src/engine.ts` (`evaluateZone`, `claimTag`) | Evalúa la zona solo al llegar una muestra. No hay plazos de fase en `dueList`. |
| Vista | `engine/src/view.ts` | Envía `config.zone` tal cual. No existe ningún estado de zona calculado. |
| Cliente | `mobile/www/js/game-view.js` (`mapModel`), `map-view.js`, `radar.js` | Dibujan siempre `config.zone[0]`: círculo fijo. |
| Selector | `mobile/www/js/app.js` (`RADII`) | 200, 300, 400, 600, 800 y 1.200 m. 50 y 100 m no se pueden elegir, y además el motor los rechaza (mínimo 150). |
| Demo | `demo/src/sim.js` | Tiene una zona que encoge (a 0,7 al 40 % y al 70 %) con **saltos bruscos**. Es solo la demo: no está conectada al juego real. |
| Documentación | `GAME_MODES_AND_RULES.md` §6, `GAME_STATE_MACHINE.md` §9.4 | La zona dinámica es «diseño previsto» (D-032): cifras en hipótesis y sin calendario aprobado. |

## Causa

No es un fallo de temporizadores ni de sincronización: **la zona dinámica nunca se implementó en el juego real**. El motor la limita expresamente a una versión fija y el cliente dibuja siempre la zona inicial. Las fases de 5 minutos no existen en ningún sitio del código del juego. Solo la demo tiene una aproximación, distinta y con saltos.

## Solución mínima propuesta

1. **Autoridad en el servidor (motor puro).**
   - Al empezar, el motor genera un **plan de zona** determinista a partir del radio inicial, la duración y la semilla de la sala. Se guarda en el estado y se persiste con él.
   - El plan es una lista de puntos clave `{fromOffsetMs, center, radiusM}`, contados desde el inicio de la persecución.
   - Se reutilizan el tipo `ZoneVersion` y `isOutsideZone`. El nuevo `zoneInPlan` interpola linealmente entre puntos clave, así que no hay saltos.
2. **Fases cada 5 min desde el inicio de la persecución.**
   - Durante los primeros 5 min, la zona es la configurada.
   - En cada fase, el círculo se mueve y encoge de forma continua hacia su destino, que alcanza al final de la fase.
3. **Plazo `zone_phase` en `dueList`.**
   - Usa `activeStart + k × 5 min`, no `setInterval`. Si el servidor procesa tarde, `runDue` lo aplica a su hora.
   - Al vencer, emite `zone_phase` a todos, lo que hace que el servidor reenvíe la instantánea a cada móvil, y reevalúa a los fugitivos con su última muestra.
4. **Instantánea.**
   - Incluye `zonePlan`, pero solo hasta el destino de la fase en curso: las zonas futuras no se revelan.
   - El cliente calcula el círculo con la hora del servidor, de modo que todos los móviles ven lo mismo. Una reconexión o un navegador suspendido no reinician nada.
5. **Radios.**
   - El motor admite desde 50 m.
   - El selector ofrece 50, 100, 250, 500 y 1.000 m.
6. **Compatibilidad.**
   - Lo activa un campo opcional `config.dynamicZone`, que envía el cliente móvil.
   - Sin el campo (salas, pruebas y simulador anteriores) la zona sigue fija como hasta ahora.

## Valores propuestos (hipótesis, no reglas definitivas)

- **Fase:** 5 min, según la intención del producto.
- **Reducción:** 15 % del radio por fase, la hipótesis del enunciado. La propuesta anterior de la documentación era ×0,7 en 2–4 cambios.
- **Radio mínimo:** 50 m. La documentación proponía 100 m, pero eso es incompatible con las opciones de 50 y 100 m. Al llegar al mínimo, la zona se queda fija hasta el final.
- **Destino:**
  - dirección aleatoria determinista;
  - desplazamiento entre el 25 % y el 75 % de la reducción del radio, de modo que cada zona queda **dentro** de la anterior y, por tanto, dentro de la inicial;
  - límite de «nadie necesita correr»: desplazamiento + reducción ≤ 1,2 m/s × 5 min = 360 m por fase.
