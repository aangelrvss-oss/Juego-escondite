# Ciclo de la zona dinámica y los radios iniciales: 1/11/2026

- **Alcance:** zona dinámica (encoger y desplazar cada 5 min) y radios iniciales de 50 y 100 m. No se ha tocado nada más.
- **Repositorio:** rama `mapa-real`, HEAD `462016d`. Sin commits, push, despliegues ni APK. Todos los cambios locales previos se conservan.
- **MapTiler:** su configuración no se ha modificado y la clave no aparece en ningún archivo nuevo (comprobado con un script que solo cuenta coincidencias: 0 de 33 archivos).
- **Tipos de prueba.** Cada resultado indica de cuál se trata:
  - **automática:** Node con reloj simulado;
  - **navegador:** Chrome sin interfaz, GPS emulado y cartografía local;
  - **móvil real:** **ninguna en este ciclo**.

---

## 1. Diagnóstico original

Escrito antes de tocar código: [`00-DIAGNOSTICO.md`](00-DIAGNOSTICO.md).

**La zona dinámica no existía en el juego real.**
- **Motor:**
  - aceptaba una sola zona fija (`LIMITS.maxZoneVersions = 1`, con `fromOffsetMs` igual a 0);
  - su función `zoneAt` funcionaba por escalones;
  - no había plazos de fase.
- **Servidor:** enviaba la configuración tal cual.
- **Móvil:** dibujaba siempre `config.zone[0]`.
- **Demo** (`demo/src/sim.js`): tenía su propia zona que encogía con saltos bruscos, sin relación con el juego.
- **Selector:** ofrecía 200 a 1.200 m, y el motor rechazaba cualquier radio por debajo de 150 m.

## 2. Causa del fallo

No había ningún temporizador fallando ni ninguna desincronización. **La mecánica nunca se implementó**: la documentación la trataba como «diseño previsto» (D-032), con cifras en hipótesis (D-038). Por eso, en la prueba con dos móviles, el círculo no cambió nunca.

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| `engine/src/zone.ts` (**nuevo**) | `buildZonePlan`, que genera el plan determinista al empezar; `zoneInPlan`, que interpola; `currentZone`; `zonePhaseStarts`; `visibleZonePlan`, que oculta las fases futuras; `isNested`. |
| `engine/src/constants.ts` | Radio mínimo 50 m (antes 150). Constantes `DYNAMIC_ZONE` marcadas como hipótesis: 5 min, 15 %, 50 m, desplazamiento del 25–75 %, 1,2 m/s. |
| `engine/src/types.ts` | `GameConfig.dynamicZone?`, `RoomState.zonePlan?` y `RoomState.zonePhase?`. Son opcionales, así que un estado guardado antes sigue valiendo. |
| `engine/src/validate.ts` | Admite `dynamicZone` (booleano opcional). Cualquier otro campo, `zonePlan` incluido, se sigue rechazando. |
| `engine/src/engine.ts` | El plan se crea en `start` y se borra en `rematch` y al volver a la sala. Nuevo plazo `zone_phase` en `dueList`/`processDue`: emite el evento a todos y reevalúa a los fugitivos. `evaluateZone` y `claimTag` usan la zona del instante. |
| `engine/src/view.ts` | La instantánea lleva `zonePlan`, pero solo hasta el destino de la fase en curso. |
| `mobile/www/js/game-view.js` | `zoneNow`: la misma interpolación que el motor, con la hora del servidor. `zoneLine`: la línea bajo el reloj. `mapModel` dibuja la zona del instante. El texto «Zona» del briefing incluye la zona dinámica. Nuevas constantes en `RULES`. |
| `mobile/www/js/app.js` | Selector **50 / 100 / 250 / 500 / 1.000 m**, con valor por defecto de 500 m (antes 400). Se envía `dynamicZone: true`. Nueva línea de zona en la partida y aviso al empezar cada fase. El resumen de la sala indica «que se cierra cada 5 min». |
| `mobile/www/js/map-view.js` | El mapa usa la misma esfera que el servidor. Antes, el círculo salía un 0,6 % más alto de norte a sur que la frontera real. |
| `mobile/www/css/game.css` | Estilo de `.zone-line`. |
| `engine/test/transitions.test.ts` | El caso «radio fuera de rango» usaba 100 m, que ahora es válido. Pasa a usar 40 m, que sigue siendo inválido; ver §6. |
| `mobile/e2e/gameplay-capture.mjs`, `mobile/e2e/partida-visible.mjs` | Guiones de grabación (no son suites): elegían 400 y 300 m, que ya no están en el selector. Ahora eligen 500 y 250 m. |
| **Pruebas nuevas** | `engine/test/zona-dinamica.test.ts` (25), `server/test/zona-dinamica.test.mjs` (7), `mobile/test/zona-dinamica.test.mjs` (10) y `mobile/e2e/zona.e2e.mjs` (21 comprobaciones en Chrome). |

**Sin cambios:**
- las capturas, la revancha (salvo el borrado del plan), las reconexiones y la presencia;
- la pantalla de inicio y los otros modos;
- el simulador del panel (`sim/`) y la demo, que siguen con su zona fija o con la suya propia;
- el radar, que se reescala con la zona (ver §7).

## 4. Reglas aplicadas al radio y al movimiento

Las cifras son **hipótesis de prueba** (constantes `DYNAMIC_ZONE`) y no reglas aprobadas: ver §10.

| Aspecto | Comportamiento |
|---|---|
| Autoridad | **El servidor (motor puro).** Al pulsar «Empezar» calcula el plan completo y lo guarda en el estado de la sala, que se persiste. El móvil no puede enviar zonas: solo la inicial y `dynamicZone`. |
| Radio inicial | Opciones de la interfaz: 50, 100, 250, 500 y 1.000 m. El servidor valida un rango de 50 a 2.000 m (ver §10, D-Z5). |
| Fases | La primera empieza a los **5 min de persecución**, y después a los 10, 15… min. La huida no cuenta. Ninguna fase empieza en el instante final. |
| Encogimiento | 15 % del radio por fase, redondeado a metros y **continuo** durante los 5 min. Nunca hay saltos. |
| Desplazamiento | Dirección aleatoria determinista (semilla de la sala y número de partida, distinta en la revancha). Distancia: entre el 25 y el 75 % de lo que encoge el radio. El centro avanza en línea recta durante la fase. |
| Límites geográficos | **Cada zona queda dentro de la anterior** y, por tanto, de la configurada; probado con 300 semillas por radio. Además, nadie necesita correr: desplazamiento + reducción ≤ 1,2 m/s × 5 min. |
| Radio mínimo | 50 m. Al alcanzarlo, la zona **queda fija hasta el final**. Con 50 m de salida no cambia nunca; con 100 m se llega a 50 m al final de la quinta fase (30 min) (100 → 85 → 72 → 61 → 52 → 50). |
| Zonas futuras | No se revelan. La instantánea solo incluye el destino de la fase en curso, que llega con el evento `zone_phase`. |
| Fuera de la zona | Mismas reglas de antes: 30 s de gracia, beneficio de la duda por la precisión y un cazador fuera no puede capturar. Al empezar cada fase se reevalúa a los fugitivos que no han enviado lecturas nuevas. |
| Tiempo | Todo depende de `activeStart` y de la hora del servidor. El plazo `zone_phase` vence a su hora exacta aunque se procese tarde (`runDue`). El móvil dibuja con la hora del servidor (`serverNow`), así que una reconexión o un navegador suspendido no reinician ni pausan nada. |
| Coordenadas | Centros guardados con 7 decimales (≈1 cm). Interpolación lineal en grados, suficiente para círculos de 2 km o menos. El mapa usa el mismo radio terrestre que el servidor. |

**Valores con el plan de una partida de 20 min:**

| Radio inicial | Radios en las fases |
|---|---|
| 1.000 m | 850 → 723 → 615 |
| 500 m | 425 → 361 → 307 |
| 250 m | 213 → 181 → 154 |
| 100 m | 85 → 72 → 61 |
| 50 m | fija |

## 5. Resultado de cada prueba nueva

**Automáticas: motor (`engine/test/zona-dinamica.test.ts`), 25/25.**
- **Radios:**
  - 50, 100, 250, 500 y 1.000 m se admiten, y también los antiguos;
  - por debajo de 50 m, por encima de 2.000 m, `NaN` o negativos se rechazan;
  - el cliente no puede enviar varias zonas;
  - `dynamicZone` tiene que ser booleano.
- **Plan:**
  - con cada radio empieza con la zona configurada y la mantiene los primeros 5 min;
  - radios por fase, con el mínimo de 50 m;
  - fases a los 5, 10 y 15 min, y ninguna al final;
  - contención y «nadie necesita correr» con 300 semillas por radio;
  - el centro se mueve dentro de los límites;
  - es determinista;
  - coordenadas con 7 decimales.
- **Interpolación:**
  - el radio baja de forma continua;
  - el centro avanza en línea recta;
  - el borde nunca se mueve más de 1,2 m en 1 s, en todo el recorrido;
  - cada círculo queda dentro del de cualquier instante anterior.
- **Partida:**
  - primera fase exactamente a los 5 min, con el evento para todos;
  - fases 2 y 3 a su hora;
  - procesada con 4 min de retraso, la fase conserva su hora exacta y la zona es la del instante real;
  - la instantánea solo revela el destino actual, igual para todos;
  - un fugitivo quieto sin lecturas nuevas queda fuera cuando la zona le alcanza (aviso a los 10 min exactos);
  - un cazador fuera de la zona reducida no puede capturar;
  - sin `dynamicZone` no hay ningún plazo ni evento de zona (compatibilidad);
  - con 50 m la zona es fija;
  - Infección y Caza del zorro funcionan igual;
  - la revancha trae un plan nuevo y empieza desde la fase 0.

**Automáticas: servidor real con WebSocket y `net.js` (`server/test/zona-dinamica.test.mjs`), 7/7.**
- **Fase 1 simultánea:** 3 móviles reciben la fase 1 a la vez, con el mismo plan, y dibujan el mismo círculo (462,5 m a mitad de la fase).
- **Reconexión durante una fase:**
  - el móvil recupera el mismo plan;
  - el destino sigue siendo a los 10 min;
  - el aviso no se repite.
- **Sin conexión durante un cambio de fase:**
  - mientras tanto, el móvil mantiene el último destino conocido y no se inventa la zona;
  - al volver recibe el aviso perdido y el mismo círculo que los demás.
- **Servidor suspendido 11 min:** cada fase se aplica a su hora (5 y 10 min) y el círculo es el de la hora real.
- **Validación en el servidor:**
  - los 5 radios llegan a todos los clientes;
  - 30 m se rechaza;
  - dos zonas se rechazan;
  - `zonePlan` enviado por el cliente se rechaza;
  - `dynamicZone: 'sí'` se rechaza.
- **Revancha:** la sala vuelve sin plan, y la partida nueva tiene su propia fase 1 y otro destino.
- **Infección y Caza del zorro:** todos ven lo mismo.

**Automáticas: cliente (`mobile/test/zona-dinamica.test.mjs`), 10/10.**
- Las reglas que explica el móvil coinciden con las del motor.
- `zoneNow` del móvil coincide con `zoneInPlan` del motor con cada radio, cada 13 s durante 63 min.
- Dos móviles con la misma instantánea ven lo mismo.
- **Reconexión o navegador suspendido:** la zona sale de la hora, sin reinicio ni pausa.
- **Sin el aviso de la fase siguiente:** el móvil mantiene el último destino, y al llegar el aviso continúa sin salto.
- Sin zona dinámica, o durante la huida, se dibuja la zona fija.
- El mapa dibuja una sola zona, la del instante.
- **Zonas pequeñas:** el círculo del mapa tiene el radio del servidor (±0,1 %) con 50, 100, 250 y 1.000 m, también a 60° de latitud.
- La línea de zona muestra los tres casos, sin coordenadas.
- El briefing solo explica la zona dinámica si la sala la tiene.

**Navegador (`mobile/e2e/zona.e2e.mjs`, Chrome, 360×740), 21/21.** Registro en `registros/13-e2e-zona.txt` y capturas en `capturas/zona/`.

| Momento | Círculo dibujado por MapLibre | Zona del servidor | Distancia entre centros |
|---|---|---|---|
| Inicio, 100 m | 100,0 m | 100,0 m | 0,00 m |
| Mitad de la fase 1 (7:30) | 92,4 m | 92,5 m | 0,05 m |
| Final de la fase 1 (10:00) | 84,9 m (centro desplazado 6,7–7,1 m) | 85,0 m | 0,04–0,06 m |
| Fase 2, tras cortar la conexión y recargar (12:30) | 78,4 m, un solo mapa y una sola zona | 78,5 m | 0,04–0,06 m |
| 19:59 | 61,0 m | 61,0 m | 0,01 m |
| Revancha con 50 m, al empezar y a los 12 min | 50,0 m | 50,0 m | 0,00 m |

Además:
- el selector muestra «50 m | 100 m | 250 m | 500 m | 1.000 m»;
- el servidor y los demás jugadores reciben 100 m y la zona dinámica;
- las reglas de la sala lo explican;
- el aviso «La zona se cierra» llega al empezar la fase 1;
- la línea bajo el reloj dice:
  - «Zona 100 m · empieza a cerrarse en 4:59»;
  - «Zona 92 m · se cierra hasta 85 m 2:28»;
  - «Zona 50 m · ya no cambia»;
- con 50 m no hay ningún aviso de fase;
- a 360×740 nada desborda;
- no hay peticiones a Internet ni errores de JavaScript.

(Las diferencias de 0,1 m se deben a que la página va unos segundos por delante del reloj congelado de la prueba.)

**Pruebas sin la corrección.** Las pruebas nuevas no pueden pasar con el código anterior: `engine/src/zone.ts`, `zoneNow` y `dynamicZone` no existían, y el motor rechazaba 50 y 100 m.

## 6. Pruebas anteriores ejecutadas

Registros en `registros/`.

| Suite | Resultado | Antes de este ciclo |
|---|---|---|
| `tsc` | OK (`01-tsc.txt`) | OK |
| Motor + simulador (`engine/test`, `sim/test`) | **277/277** (`02`) | 252/252 (+25 nuevas) |
| Servidor | **135/135** (`03`) | 128/128 (+7) |
| Cliente | **162/162** (`04`) | 152/152 (+10) |
| Panel del simulador | 15/15 (`05`) | 15/15 |
| Partidas completas de 10 jugadores | 3/3 (`06`) | 3/3 |
| Demo | 62/62 (`07`) | 62/62 |
| e2e web-flow | 42/42 (`10`) | 42/42 |
| e2e mapa | 29/29 (`11-e2e-map`) | — |
| e2e layout / partida / Infección / zorro / playtest / inicio | 6/6 · 8/8 · 8/8 · 7/7 · 13/13 · 13/13 (`14-*`) | — |
| e2e conexion | **1 de 5 ejecuciones pasa (10/10); 4 fallan** en la condición previa «lecturas recientes y estables» (línea 128, antes de cualquier desconexión) (`11-e2e-conexion*`) | 2 de 3 en el ciclo anterior |

**Discrepancia documentada en `engine/test/transitions.test.ts`.** El caso «rechaza zone fuera de rango» usaba 100 m. Con la regla nueva (50 m mínimo, pedido por el propietario) es un radio válido, así que el caso pasa a usar 40 m. La expectativa, que el servidor rechace un radio inferior al mínimo, se mantiene.

**El fallo de `conexion` no lo causa la zona dinámica.**
- **Control:** ejecuté la misma prueba sobre una copia fuera del repositorio con `dynamicZone: false`. Falló 3 de 3 veces en el mismo punto (`12-control-conexion-sin-zona-dinamica-*.txt`). La copia ya se ha borrado.
- **Antecedente:** el mismo fallo apareció en el ciclo anterior, antes de estos cambios.
- **Hipótesis:** el GPS emulado de Playwright, con poca memoria libre (≈790 MB).
- **Estado:** sigue sin resolver.

## 7. Limitaciones pendientes

- **No se ha probado en móviles reales.** Las comprobaciones visuales se hicieron en Chrome de escritorio, con GPS emulado y cartografía local sin calles. No se ha visto la zona sobre MapTiler.
- **Radar de reserva:** siempre encuadra la zona, así que el encogimiento no se ve en el tamaño del círculo. Se ve en las posiciones relativas y en la línea «Zona X m». En el mapa real sí se ve contra las calles.
- **«Ver zona»:** reencuadra el círculo. Para ver cómo encoge hay que fijarse en las calles o no pulsar el botón.
- **Destino de la fase:** no se dibuja; solo se dice el radio final. Dibujarlo sería una ampliación (D-Z4).
- **Sin gracia extra en el cambio de fase.** Los 30 s de gracia son los de siempre; la documentación proponía 60 s tras cada cambio (§6.4). Como la zona encoge de forma continua y despacio (≤ 1 m/s en el borde), no parece imprescindible, pero queda pendiente (D-Z6).
- **Fugitivo sin lecturas nuevas:** solo se le reevalúa al llegar una lectura y al empezar cada fase. Si se queda quieto a mitad de fase con el móvil sin enviar, el aviso puede retrasarse hasta la fase siguiente.
- **Reloj del móvil:** si el desfase con el servidor es grande (> 1 s antes de corregirse), el círculo puede ir unos segundos adelantado o atrasado, lo que supone menos de 1 m de borde.
- **`RULES_VERSION` no cambia.** Las partidas con zona dinámica guardan la misma versión de reglas que antes; el campo `config.dynamicZone` las distingue (D-Z7).
- **El simulador del panel (`sim/`) y la demo** no usan la zona dinámica del juego. El panel sigue con zona fija y la demo con su propio prototipo.
- **El servidor y el túnel de anoche ya no están en marcha** (PID 2284 y 28852, ni la ventana de mantener despierto). Se cerraron fuera de esta sesión: yo no los he tocado. Para probar hay que arrancar el servidor con `server\iniciar-servidor.ps1`, que ya lleva este código, y abrir un túnel nuevo, cuya dirección hay que añadir en MapTiler.

## 8. Procedimiento para probar la zona en dos móviles reales

**Preparación**
1. Arranca el servidor con `server\iniciar-servidor.ps1`, con el portátil enchufado y la tapa abierta. El script ya impide la suspensión.
2. Abre un túnel nuevo y añade su dirección en MapTiler («Allowed HTTP origins»). Sin eso se juega con el radar, que no permite ver bien el encogimiento.
3. **Móvil A** (anfitrión, fugitivo):
   - crea la sala desde el centro de un espacio abierto;
   - elige **100 m** y **20 min**;
   - comprueba que el selector muestra 50, 100, 250, 500 y 1.000 m;
   - comprueba que el resumen dice «zona de 100 m que se cierra cada 5 min».
4. **Móvil B** (cazador) entra con el enlace. Las reglas («Zona») tienen que mencionar «Cada 5 min… 15 %… 50 m».

**Durante la partida**

5. Empieza. Durante la huida y los primeros 5 min de persecución, los dos móviles ven:
   - el mismo círculo;
   - «Zona 100 m · empieza a cerrarse en m:ss», con la misma cuenta atrás (±1 s).
6. **A los 5 min de persecución:**
   - los dos reciben el aviso «La zona se cierra: 85 m en 5 min» (vibración);
   - la línea cambia a «Zona … m · se cierra hasta 85 m».
   - Fotografía los dos móviles a la vez: el círculo tiene que coincidir sobre las calles.
7. **Entre los 5 y los 10 min:** el círculo encoge poco a poco (unos 3 m por minuto) y su centro se desplaza unos metros. **No tiene que dar saltos.**
8. **Pantalla bloqueada (fase 2):**
   - bloquea el móvil B unos 2 min durante la fase 2 y desbloquéalo;
   - tiene que mostrar enseguida el mismo círculo que el A, sin volver a empezar los 5 min.
9. **Sin datos en un cambio de fase:** activa el modo avión en el móvil B justo antes de los 15 min y desactívalo pasados los 15. Tras reconectar, B tiene que mostrar:
   - la fase 3 («se cierra hasta 61 m»);
   - el mismo círculo que A;
   - un solo círculo.
10. **Salir de la zona:** el fugitivo se queda fuera del círculo actual (por ejemplo, en el borde del lado contrario al que se mueve). Tiene que recibir el aviso de «fuera de la zona» y quedar visible para el cazador 30 s después.

**Después**

11. Revancha con **50 m**: «Zona 50 m · ya no cambia». Comprobad que el círculo es jugable con la precisión del GPS de cada móvil.
12. Anota en cada paso la hora que muestran los dos móviles, y saca fotos y capturas. El diagnóstico (`%USERPROFILE%\OutrunDiagnostico`) registra los eventos `zone_phase`.

## 9. Evidencias

- **Diagnóstico previo:** `00-DIAGNOSTICO.md`.
- **Registros de pruebas:** `registros/01` a `14`, más los controles `12-*` de `conexion` con la zona desactivada.
- **Capturas de la zona** (`capturas/zona/`):
  - `z0-sala-100m.png`
  - `z1-inicio-100m.png`
  - `z2-fase1-mitad.png`
  - `z3-fase1-final-85m.png`
  - `z4-fase2-tras-reconectar.png`
  - `z5-final-de-la-partida.png`
  - `z6-revancha-50m.png`
  - `z7-revancha-50m-12min.png`
- **Capturas de las demás pruebas en navegador:** `capturas/e2e-*`.

## 10. Decisiones de producto pendientes de aprobación

| Id | Decisión | Lo aplicado ahora (hipótesis) | Alternativa |
|---|---|---|---|
| D-Z1 | Reducción por fase | 15 % del radio cada 5 min | Documentación: ×0,7 en 2–4 cambios (§6.7) |
| D-Z2 | Radio mínimo y qué pasa al llegar | 50 m; la zona queda fija. Con 50 m de salida no cambia nunca. | 100 m (documentación), pero anularía las opciones de 50 y 100 m. Otra opción: seguir moviendo sin encoger, lo que rompería la contención. |
| D-Z3 | Política de destino | Dirección aleatoria; 25–75 % de lo que encoge; siempre dentro de la zona anterior; ≤ 1,2 m/s | Hacia el centro de los jugadores, o fijada por el anfitrión |
| D-Z4 | Mostrar el destino de la fase | Solo el radio final en texto; las zonas futuras no se revelan | Dibujar el círculo de destino (§6.2 y F17) |
| D-Z5 | Radios admitidos en el servidor | Rango 50–2.000 m, compatible con salas, pruebas y simulador que usan 400 m; la interfaz solo ofrece los 5 valores | Lista cerrada en el servidor (habría que cambiar las salas y pruebas con 400 m) |
| D-Z6 | Gracia tras cada cambio de fase | 30 s, como siempre | 60 s (§6.4) |
| D-Z7 | Versión de reglas | Sin cambios; `config.dynamicZone` lo distingue | Nueva `rulesVersion` para las partidas con zona dinámica |
| D-Z8 | Zona dinámica opcional | Siempre activada en las salas nuevas, sin interruptor | Interruptor por sala (la documentación proponía «desactivada por defecto», §6.7) |
| D-Z9 | Radio por defecto | 500 m (400 ya no está en la lista) | 250 m |

## Recomendación

**Listo para una nueva prueba física de la zona.**
- Las pruebas automáticas y las de navegador pasan.
- El servidor es la única autoridad, y todos los móviles calculan el mismo círculo con la hora del servidor.
- Una reconexión o una suspensión no reinician ni pausan las fases.
- La única prueba en rojo es `conexion`, en su condición previa de GPS emulado; con la zona desactivada falla igual.

**Condiciones:**
- arrancar el servidor con el script nuevo y abrir un túnel nuevo añadido en MapTiler;
- portátil enchufado y con la tapa abierta;
- seguir el procedimiento del §8.

La validación en móviles reales sigue **pendiente**.
