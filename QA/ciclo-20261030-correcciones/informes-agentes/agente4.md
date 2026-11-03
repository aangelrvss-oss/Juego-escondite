# Agente 4 · Caza del zorro y escenarios completos (C20) · 30/10/2026

No he modificado código del juego (engine/src, server/*.ts, mobile/www) ni pruebas ajenas. No he hecho ninguna operación de git que escriba.

## Archivos
| Archivo | Estado | Contenido |
|---|---|---|
| `engine/test/zorro-ciclo.test.ts` | nuevo | 11 pruebas (motor puro) |
| `server/test/zorro-ciclo.test.mjs` | nuevo | 8 pruebas (servidor real + net.js sobre WebSocket) |
| `sim/panel/test/escenarios-completos.test.mjs` | nuevo | 3 escenarios de 10 participantes (uno por modo), partida + revancha |
| `package.json` | modificado (solo `scripts`) | `test:sim-panel` pasa de `sim/panel/test/*.test.mjs` a `sim/panel/test/simulacion.test.mjs`; nuevo `test:sim-escenarios` |

**package.json.** He elegido lo más simple: nombrar el archivo rápido explícitamente en `test:sim-panel` en lugar de usar un patrón de negación o mover la prueba lenta a otra carpeta (la ruta de la prueba lenta venía fijada). Así `npm run test:sim-panel` sigue siendo rápido. La contrapartida: un archivo nuevo en `sim/panel/test/` habría que añadirlo al script a mano. `npm run test:sim-escenarios` ejecuta la prueba lenta (unos 75-85 s).

## 1. Escenarios completos (C20) · `sim/panel/test/escenarios-completos.test.mjs`
Es la conversión del script del coordinador `escenarios-10.mjs`. Usa la semilla 7 para Clásico, Infección y Zorro. Cada escenario juega la partida completa, hace la revancha por comandos (rematch → join_rematch → set_ready → start, y llama a `resetForRematch?.()` de los bots si el simulador lo ofrece) y juega la revancha completa. Usa solo la API pública de `Simulation`: open, start, advance, settle, validCapture, invalidCapture, room, avatars, avatar, avatarById, nameOf y close.

### Qué comprueba, siempre con lo que recibe cada cliente
- **Posiciones.** Comprueba cada elemento de cada mensaje `positions` contra la regla del modo (teammate / exposed / hunter_seen solo en el zorro / spectator_delayed para el capturado) y con el **estado exacto con el que el servidor las calculó**. Para eso, la prueba envuelve `hub.broadcastPositions` y guarda un resumen (equipo, estado, exposición) indexado por el `at` del mensaje.
  - El script original comparaba con el estado del momento de recibir el mensaje, lo que daba falsos positivos o negativos en las conversiones y exposiciones.
- **Pistas.**
  - Solo las recibe un cazador activo.
  - Cada entrada es un fugitivo. En Infección se admite a quien se convirtió después de la pista.
  - En el zorro hay exactamente una entrada y es el zorro.
- **Equipos en las instantáneas.**
  - En la cuenta atrás, ninguno (tampoco el propio, D-042).
  - Después, el propio, los del mismo equipo, todos en el zorro y todos en FINISHED.
  - Además, el equipo mostrado tiene que coincidir con el real.
  - Identidad en el zorro: tras la cuenta atrás, los 10 clientes ven al zorro como `runner`.
- **Reparto.** Número de cazadores = `MODES[mode].hunters(10)`.
- **Final.**
  - Exactamente un `game_finished` por cliente, con 300 ms de espera para detectar duplicados.
  - El `outcome` y el número de capturas de cada instantánea son iguales al estado.
  - El resultado es coherente: all_captured sin fugitivos libres, time_up con fugitivos libres y gana el fugitivo.
  - En el zorro, como mucho una captura.
- **Infección.**
  - Todo infectado es un cazador activo.
  - Nadie captura durante su espera (`activeStart + atOffsetMs < canTagFrom`).
  - Nota: el script del coordinador usaba `c.at`, que no existe en `Capture` (es `atOffsetMs`), así que esta comprobación **nunca podía fallar**. Ahora sí compara.
- **Revancha sin restos.**
  - En las instantáneas de la sala de la revancha: sin capturas, resultado, pista, reclamaciones ni canTagFrom.
  - Al empezar, el estado no tiene reclamaciones, capturas, resultado ni canTagFrom, y `gameNo` es el anterior + 1.
- **Captura inválida, identificada exactamente.**
  - Se mira la respuesta a ESE comando (`invalidCapture().result.ok === false`).
  - Después del comando no existe ninguna reclamación nueva ni ninguna captura de esa misma pareja cazador→fugitivo.
  - Solo cuenta como «inválida» si la distancia es mayor que 2 × `TAG.maxRadiusM` (80 m). Si no, se reintenta 30 s después. Si en una partida no se ha podido probar ninguna, la prueba falla.
  - En el zorro, las capturas guiadas empiezan después de probar la inválida, para que la partida no acabe antes.
  - No se fija el código de error (V-02 pendiente).

### Ajuste respecto al script
- La comprobación «restos de conversión en la sala» sobre el **estado interno** en la sala de la revancha falló en Infección en el primer intento: 8 jugadores con `canTagFrom`/`convertedAt`.
- **No es un fallo.** El motor los borra en `start` (`engine.ts:848-849`), y lo que llega a los clientes ya está filtrado (V-27, C19). Por eso la comprobación se hace en las instantáneas y en el estado al empezar.
- El script del coordinador ya lo trataba como informativo, no como problema.

## 2. Caza del zorro · regresiones

### `engine/test/zorro-ciclo.test.ts` (Harness del motor)
1. **Sorteo con 3 jugadores, 60 semillas.** Siempre hay 1 zorro y 2 cazadores, y el zorro varía: lo es cada uno de los tres (h, b y c).
2. **4 jugadores, sale un cazador en la cuenta atrás** (10 semillas): sigue en HEAD_START con 1 zorro y 2 cazadores.
3. **3 jugadores, sale el zorro / sale un cazador en la cuenta atrás** (2 pruebas):
   - vuelve a LOBBY;
   - entra otro jugador y se juega la siguiente hasta time_up;
   - en el informe de cada jugador (`snapshotFor` en FINISHED) no aparece quien salió y hay exactamente 1 `runner` (C1);
   - en la revancha, quien salió no está `invited`.
4. **Captura rechazada por el motor (lejos):** la partida queda idéntica (fase, resultado, capturas, reclamaciones, equipos y estados) y no hay `tag_claimed`.
5. **Captura rechazada por el zorro:** la partida queda idéntica y no hay `game_finished`.
6. **Captura válida:** 1 `game_finished` (incluso tras 30 min más), hunter/all_captured.
7. **Zorro sin señal 5 min:** sin ganador (runners_abandoned), `leftReason: 'timeout'` y 1 `game_finished`.
8. **Se acaba el tiempo:** runner/time_up y 1 `game_finished`.
9. **5 revanchas seguidas con `swapRoles=false` y otras 5 con `swapRoles=true`** (4 jugadores): en cada partida, 1 zorro y 3 cazadores, 1 `runner` en el informe, y sala de revancha sin capturas ni reclamaciones.

### `server/test/zorro-ciclo.test.mjs` (WebSocket reales, `server/test/helpers.mjs`, sorteo real sin asignar a nadie)
1. **Identidad, posiciones, pistas y captura** (4 jugadores):
   - En la cuenta atrás, ninguna instantánea recibida muestra un equipo y nadie recibe `role_revealed`.
   - Tras la cuenta atrás, todos ven al zorro como `runner` y a los demás como `hunter`. Cada uno recibe un solo `role_revealed`, con su propio equipo.
   - En la huida, el zorro recibe las posiciones de los 3 cazadores (`hunter_seen`) y cada cazador solo las de sus 2 compañeros.
   - Un cazador abandona y el zorro deja de recibir su posición (solo cazadores **activos**).
   - Pista: cada cazador la recibe con una sola entrada, el zorro. El zorro recibe `ping_sent`, nunca un evento `ping`, y su `lastPing` es null.
   - Captura lejana: `ok:false`. No cambian las capturas ni la fase, no queda ninguna reclamación y el zorro no recibe `tag_claimed`.
   - Captura válida: un único `game_finished` por cliente (también tras 10 min más), hunter/all_captured, y un solo zorro en el informe.
2. **El zorro rechaza la reclamación** (3 jugadores): para todos sigue ACTIVE, sin capturas, el zorro activo y sin `game_finished`.
3. **Zorro sin red 5 min:** sin ganador, `leftReason: 'timeout'` visible para los cazadores y un `game_finished` por cliente.
4. **Se acaba el tiempo:** gana el zorro, con un `game_finished` por cliente.
5. **4 jugadores, sale un cazador en la cuenta atrás:** los 3 restantes llegan a la huida y ven `hunter, hunter, runner`.
6. **3 jugadores, sale el zorro / sale un cazador en la cuenta atrás** (2 pruebas):
   - vuelve a la sala y quien salió no aparece;
   - entra Eva y se juega hasta el final;
   - en el informe de cada cliente no está quien salió y hay 1 `runner`;
   - en la revancha no aparece ni está `invited` (C1).
7. **Revanchas** (3 jugadores): 5 sin `swapRoles` y 5 con `swapRoles` seguidas (11 partidas). En cada una, todos los clientes ven `hunter, hunter, runner`.

**Fuera a propósito** (decisiones pendientes; no se fija ningún comportamiento):
- V-01 / B1: zorro sin GPS con la app viva.
- V-02 / B2: sondeo; no se comprueba ningún código de rechazo concreto.
- V-03 / B3: preferencias; nadie elige su propio rol, solo sorteo.
- V-10 / B4: anfitrión que termina; los finales son por captura, tiempo o presencia, nunca `end_game`.
- V-21 / B6: posición de quien está «sin conexión»; no se prueba la posición de un cazador o zorro `away`.

No he añadido `it.todo`, porque esos casos ya figuran en el PLAN_DE_CORRECCIONES como decisiones B1-B6.

## 3. Ejecuciones reales
Uno a uno con `node --test --test-concurrency=1 <archivo>`. Antes de cada ejecución comprobé la memoria libre: 502-969 MB.

| Ejecución | Resultado |
|---|---|
| `engine/test/zorro-ciclo.test.ts` | **11/11** ✔ (≈0,6 s) |
| `server/test/zorro-ciclo.test.mjs` | **8/8** ✔ (≈3,9 s) |
| `escenarios-completos` · ejecución oficial 1 (run5) | **3/3** ✔, exit 0, 78,7 s |
| `escenarios-completos` · ejecución oficial 2 (run6, seguida) | **3/3** ✔, exit 0, 77,3 s |
| `npx tsc -p tsconfig.json` | sin errores |

Resultados de las dos ejecuciones oficiales:
- **Clásico:** las dos partidas acaban hunter/all_captured con 7 capturas. Unas 13 200 posiciones comprobadas y 33 pistas.
- **Infección:** las dos acaban hunter/all_captured con 8 conversiones. Unas 15 600-17 000 posiciones y 53-63 pistas.
- **Zorro:** las dos acaban hunter/all_captured con 1 captura. Unas 8 700-10 300 posiciones y 18 pistas.
- **Captura inválida:** en las 12 partidas, la reclamación lejana (150-207 m) se rechazó (`not_close_enough`), sin reclamación ni captura de esa pareja.

### Ejecuciones anteriores y diagnóstico (no las doy por buenas)
- **Servidor, primer intento: 2 fallos, los dos de la prueba.**
  1. `your_location_unstable`: mover al cazador 100 m en 5 s es un salto GPS imposible. Ahora se deja pasar 30 s.
  2. Timeout: avanzaba el reloj antes de que el servidor viera cerrado el socket del zorro (`keepAliveConnected` lo seguía contando vivo). Ahora espera a verlo desconectado, como `presence.test.mjs`. Además, tras el final avanzaba 30 min, que es todo el periodo de revancha, y la sala se cerraba. Ahora avanza 10 min.
- **Escenarios, intento 1:** Infección ✖ por la comprobación del estado interno de la sala de la revancha (ver «Ajuste» arriba). Clásico y zorro ✔.
- **Escenarios, runs 1-4:** los 3 escenarios ✔, pero el archivo ✖ por `TypeError: Cannot read properties of null (reading 'hub')` asíncrono tras cada prueba.
  - **Causa en la prueba:** mi envoltorio de `broadcastPositions` llamaba a `s.room()` cuando `s.server` ya era null. Ahora usa el hub directamente y no anota nada tras el cierre.
  - El origen es un hallazgo real del servidor (F-1, abajo).
- Salidas guardadas en `C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\correcciones\`: `ag4-engine.txt`, `ag4-server.txt`, `ag4-escenarios-intento1.txt` y `ag4-escenarios-run1.txt` a `ag4-escenarios-run6.txt`.

## 4. Fallos reales encontrados (no corregidos)
### F-1 (P3) · El servidor sigue procesando plazos después de `close()`
- **Evidencia.** `server/main.ts:286-289`: `ws.onClose` llama a `schedule()`. Durante `close()` (`main.ts:303-316`), al destruir los sockets se vuelve a armar el temporizador que `close()` acababa de cancelar en la l. 305. Por eso `hub.pump()` se ejecuta hasta ≈1 s después de que `close()` haya terminado.
- **Reproducción.** Script `C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\ag4diag\pump-tras-cierre.mjs`: 3 WebSocket abiertos y después `await server.close()`. Salida real: `pump() tras close(): 2 vez/veces`.
- **Efecto.**
  - Un `pump` tras el último `persist()` puede vencer plazos (ticks, `commit`) que ya no se guardan.
  - En pruebas y en el simulador produce actividad asíncrona tras cerrar. Así apareció aquí.
  - En producción, el cierre suele ir seguido de la salida del proceso, así que el impacto es bajo.
- **Corrección sugerida** (para el agente del servidor): una bandera `closing` que haga `schedule()` no-op.

### Ninguno en el juego en las reglas probadas
Todas las regresiones de C1, del zorro y de los escenarios pasan con el código actual.

## 5. Pendientes
- **Decisiones de producto que bloquean más pruebas:** B1/V-01 (zorro sin GPS), B2/V-02 (texto único de rechazo), B3/V-03 (rol elegido por el jugador), B4/V-10 (anfitrión zorro que termina) y B6/V-21 (posición «sin conexión»).
- **El escenario completo no ejercita time_up** con la semilla 7: los 6 finales son all_captured, porque las capturas guiadas acaban la partida. El final por tiempo del zorro está cubierto en el motor y en el servidor.
- **`test:sim-panel` ya no usa patrón:** si se añaden más pruebas rápidas en `sim/panel/test/`, hay que listarlas en el script.
