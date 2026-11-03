# Ciclo de correcciones y regresión · 30/10/2026

**Fuente de trabajo:** la auditoría `QA/ciclo-20261030-validacion-modos/`, en concreto `INFORME_AUDITORIA_MODOS.md` §6 (V-xx) y `PLAN_DE_CORRECCIONES.md`.

**Alcance:**
- Se ha aplicado la parte A del plan: correcciones técnicas que no cambian reglas aprobadas.
- No se ha implementado ninguna decisión de producto de la parte B: `DECISION_LOG.md` no tiene ninguna entrada posterior a D-057.

**Resultado:**
- Todas las correcciones de la parte A están aplicadas y cada una tiene su prueba de regresión.
- Todas las suites y todas las e2e pasan con el código final.
- La revisión adversarial no encontró regresiones críticas. Sus hallazgos menores R-1, R-2, R-3 y el estético de R-7 se han corregido.

## 0. Estado y seguridad
- **Rama y commit:** `mapa-real`, HEAD `462016d`, sin cambios de rama, commits, push ni despliegues.
- **Trabajo previo:** se conservan los cambios locales de los ciclos anteriores.
- **Respaldo previo al ciclo:** `Downloads\outrun-respaldo-20261030-203452-antes-ciclo-correcciones\`, con `.git` y sin `mapa.config.json`. Es la referencia de todos los diffs de este informe.
- **Procesos sin tocar:** el servidor de 127.0.0.1:8787 (PID 31160) y `cloudflared` (PID 31528), ambos activos. No se ha tocado la configuración de MapTiler.
- **Pruebas:** usaron servidores propios en puertos efímeros.
- **Memoria:** entre 350 y 1 300 MB libres. Todo se ejecutó con `--test-concurrency=1` y las e2e de una en una.

## 1. Organización
| Agente | Ronda | Archivos exclusivos |
|---|---|---|
| 1 · Motor y reglas | 1 | `engine/src/*`, `engine/test/regresiones-ciclo.test.ts` |
| 2 · Servidor y protocolo | 1 | `server/hub.ts`, `mobile/www/js/net.js`, pruebas nuevas del servidor y de `net.js` |
| 5 · Interfaz | 1 | `app.js`, `game-view.js`, `game.css`, pruebas del cliente, aserciones de las e2e de Infección y zorro |
| 3 · Infección | 2 | `sim/panel/simulacion.mjs` (herramienta) y su prueba, `server/test/presencia-real.test.mjs`, `engine/test/infeccion-ciclo.test.ts` |
| 4 · Caza del zorro | 2 | `sim/panel/test/escenarios-completos.test.mjs`, `server/test/zorro-ciclo.test.mjs`, `engine/test/zorro-ciclo.test.ts`, `package.json` (scripts) |
| 6 · Revisor adversarial (no escribió correcciones) | 3 | Solo lectura; reprodujo con copias fuera del repositorio |
| Coordinador | Todas | F-1 (`server/main.ts`), ajuste de `upload.test.mjs`, regresión de `.callout` en `app.js`, R-1, R-2, R-3, R-7; todas las suites y e2e |

Informes íntegros en `informes-agentes/`.

## 2. Correcciones aplicadas
Las secciones de la tabla:
- **«Antes / después»:** salida real de la reproducción o de la prueba, con el código anterior y con el corregido.
- **«Prueba»:** la prueba de regresión.
  - El agente 6 comprobó, revirtiendo cada corrección en una copia, que las pruebas del motor, del servidor y de `net.js` fallan sin ella.
  - En el motor fallan 16 de 23 y en el servidor 12 de 13. La que sigue pasando en el motor es la de seguridad de C2, que ya se cumplía antes.

| ID | Defecto (auditoría) | Causa | Corrección | Antes → después | Prueba |
|---|---|---|---|---|---|
| C1 | V-04: jugador fantasma en el informe siguiente (en el zorro, dos «Zorro») e invitado a la revancha | `backToLobby` solo limpiaba a los `active` | Quien salió en una cuenta atrás que se aborta sale de la sala (`leftRoom`, sin equipo ni número de partida) | «Zorro»: `f (Abandonó), b (Escapó)` → `b (Escapó)` | `engine/test/regresiones-ciclo` (3 modos), `zorro-ciclo` del motor y del servidor (3 jugadores) |
| C2 | V-05 a/b: tras «Abandonar» no se puede volver (`already_joined`); un `welcome` perdido deja un fantasma | Deduplicación por dispositivo sin recuperación | En la sala de espera, el mismo dispositivo recupera su plaza `lobby` o `invited` si está **desconectada**. Nunca en partida, nunca una plaza conectada, y el veto por expulsión se mantiene | `already_joined` → `{ok:true}` | `regresiones-ciclo` del motor (4, incluida la de seguridad) |
| C3 | V-06: una partida que cruza las 6 h de la sala termina sin informe | La caducidad cancela la sala en el mismo paso que el final | `start` responde `room_expiring` si no caben la partida y 30 min de revancha; hay texto en la interfaz | `CANCELLED/expired` → rechazo claro al empezar | `regresiones-ciclo` del motor (4, con el límite exacto) |
| C4 | V-07: fallos ajenos desde la misma IP bloquean `/api/loc` a todo el grupo | El límite por IP se comprobaba antes que la sesión | Se autentica primero; el límite solo frena sesiones inválidas | `rate_limited` → aceptada | `server/test/regresiones-ciclo` (3 modos); `upload.test.mjs` corregida (§4) |
| C5 | V-16: comandos pendientes reenviados en la sala siguiente | `net.js` no los descartaba al perder la sesión | `#dropPending` con `bad_session`, `removed` y cierre 4000. El hub envía el resultado antes de `removed`, para que el `leave` propio responda bien | 3 pruebas en rojo → 5/5 | `mobile/test/net-regresiones` |
| C6 | V-17: «sin conexión» hasta 5 s antes de lo debido | `seen()` descartaba la hora de las señales intermedias | Se anota siempre la última señal real; los 30 s y los 5 min no cambian | Antes de 30 s → exactamente a 30 000 ms | `server/test/regresiones-ciclo` (C6). `presencia-real` no lo detecta (R-4), pero cubre la cadencia real |
| C7 | V-18: `cmd:null` cierra la conexión con 1011 | `TypeError` en `Hub.run` | Responde `invalid_command` y la conexión sigue | 1011 → `invalid_command` | `server/test/regresiones-ciclo` |
| C8 | V-19: quien queda fuera recibe pistas antiguas con coordenadas | El buzón solo se purgaba al terminar | Se purgan sus eventos con coordenadas al quedar fuera (`purgeLocations`) | Con coordenadas → sin ellas | `server/test/regresiones-ciclo` (3 modos) |
| C9 | V-22: la sala de espera no caduca si alguien reconecta | `connection` contaba como actividad | Ya no cuenta | En LOBBY tras 3 h 20 min → caduca a los 30 min | `regresiones-ciclo` del motor |
| C10 | V-25: si todos quedan fuera a la vez, la causa depende del orden de los ids | Plazos simultáneos procesados uno a uno | Se procesan juntos, con un único traspaso y una única comprobación del final | `a` → `runners_abandoned`, `z` → `hunters_abandoned`; ahora siempre `runners_abandoned`, sin ganador | `regresiones-ciclo` del motor; `timing.test.ts` ajustada (§4) |
| C11 | V-09: la interfaz no nombra al zorro en la huida | — | «El zorro es X» para los cazadores, tras la cuenta atrás: bajo el reloj, en la tarjeta de rol y en la leyenda | — → visible (captura `capturas/zorro/02-rol-Beto.png`) | e2e `zorro` (7/7), `mobile/test/regresiones-ciclo` |
| C12 | V-08: la cadena de contagio pierde ramas | `contagionChains` solo seguía a la primera víctima | `contagionGroups`: todas las infecciones, agrupadas por quién infectó, también las que no tienen autor | `Ana → Beto → Caro` → `Ana → Beto · Beto → Caro, Dani` (captura `capturas/infeccion/05-informe-Beto.png`) | `modes.test`, `infeccion-ciclo`, e2e `infeccion` (§4) |
| C13 | V-11: posiciones del equipo anterior durante 5 s | Lista local sin vaciar | Se vacía en `role_changed`, se quita a quien sale y `mapModel` filtra por el equipo actual | — | `mobile/test/regresiones-ciclo` |
| C14 | V-12: la tarjeta «Te han infectado» se pierde al reconectar | Solo salía del evento | También se deduce de la instantánea, una vez por partida | — | `mobile/test/regresiones-ciclo` |
| C15 | V-13: la tarjeta tapa el informe | Se dibujaba en cualquier fase | Solo en la huida y la persecución; `game_finished` la cierra | — | `mobile/test/regresiones-ciclo`, e2e `infeccion` |
| C16 | V-14: la vuelta a la sala desde la cuenta atrás no se explicaba | `countdown_aborted` no se trataba | Aviso con el motivo y recordatorio en la sala | — | `mobile/test/regresiones-ciclo` |
| C17 | V-15: «Tu partida» contradecía el informe a quien quedó fuera | `personalResult` no tenía ese caso | «Quedaste fuera · Pasaste más de 5 min sin conexión…» | `Seguías libre al final` → correcto | `mobile/test/regresiones-ciclo` |
| C18 | V-33: textos | — | Pista del convertido, «en secreto» en el zorro, «Ganas/Pierdes» para el zorro, «SUPERVIVIENTES» a 360 px, `forbidden` según la acción, textos de `busy` y `room_expiring`, anuncio de la tarjeta a lectores de pantalla, modo en «Compartir» | — | `mobile/test/regresiones-ciclo`, `report.test` |
| C19 | V-27 y V-28: restos de la espera en la sala; convertir a un expuesto sin `runner_unexposed` | — | `canTagFrom` solo en fases de juego; `runner_unexposed` al convertir | 0 eventos → 1 | `regresiones-ciclo` del motor |
| C20 | V-34: pruebas débiles | — | Aserciones del simulador sin `if` y con coherencia entre resultado y estado; presencia con pings reales; escenarios completos de 10 jugadores en el repositorio | — | `simulacion.test`, `presencia-real`, `escenarios-completos` |
| C21 | V-35: textos del registro del simulador; sin revancha | — | Lee `runnerId`, «sin autor conocido», textos de victoria por modo; `Simulation.rematch()` y botón en el panel | — | `simulacion.test` |
| Punto 4 | Reclamaciones pendientes al terminar | El motor ya las borraba; en el cliente, la hoja «¿Quién te ha pillado?» **reaparecía en la revancha** | `sheetAfterSnapshot`, más limpieza en `game_finished` | Reaparecía → no | `regresiones-ciclo` del motor (6) y del cliente |
| F-1 | **Nuevo** (agente 4): el servidor procesaba plazos ~1 s después de `close()` | `ws.onClose` llamaba a `schedule()` | Marca `closing` en `server/main.ts` | `pump() tras close(): 2` → `0` | `server/test/regresiones-ciclo` (F-1) |
| R-1 | **Nuevo** (revisor): dos pruebas del zorro no podían fallar (`leaver.id` era null tras `forget()`) | Error de la prueba | Se guarda el id antes de olvidar la sesión | Con el motor anterior pasaban → ahora fallan («Ana: Caro en el informe») | `server/test/zorro-ciclo` |
| R-2 | **Nuevo** (revisor): al infectar a un expuesto, los cazadores leían «X ha vuelto a la zona» | Lo causaba C19 | `runner_unexposed` lleva `reason:'converted'` y el cliente no lo anuncia | — | `regresiones-ciclo` del motor (V-28) |
| R-3 | **Nuevo** (revisor): un `countdown_aborted` antiguo, repetido al recargar, fijaba el aviso en la sala de la revancha | Lo causaba C16 | Solo se fija si el evento no es antiguo | — | Solo por lectura del código (ver §5) |
| R-7 | Al recuperar la plaza se anunciaba «X ha entrado» | Lo causaba C2 | «X ha vuelto» si llega `replaces` | — | Solo por lectura del código |

## 3. Regresión introducida en este ciclo y corregida
- **Qué pasó:** C11 partió la cadena `if/else` del texto bajo el reloj (`app.js`).
  - El capturado dejaba de leer «Estás capturado: ahora eres espectador».
  - El zorro perdía su indicación propia («ves a los cazadores en directo»).
- **Cómo se detectó:** la e2e `map` falló (27/28, registro `11-e2e-map.txt`).
- **Corrección:** se restauró la cadena original y el nombre del zorro se añade después.
- **Prueba nueva:** dos aserciones en la e2e `zorro`. Con el código defectuoso, en una copia temporal, fallan; con el corregido pasan 7/7.
- **Comprobación final:** el revisor confirmó que la cadena es idéntica a la del respaldo, más el prefijo del zorro.

## 4. Cambios en pruebas existentes (todos revisados)
| Prueba | Cambio | Por qué |
|---|---|---|
| `server/test/upload.test.mjs:87` | Ya no espera 429 «incluso con la sesión buena». Ahora espera 429 para una sesión falsa y 202 para la buena | Fijaba el fallo V-07. La protección contra fuerza bruta se sigue comprobando |
| `engine/test/timing.test.ts` | `player_left, host_changed` → `player_left, player_left`, más una aserción del resultado | Fijaba el resultado que dependía del orden de los ids (V-25). Es más estricta |
| `mobile/e2e/infeccion.e2e.mjs:174` | Exige el contagio completo | Daba por buena una cadena incompleta (V-08) |
| `mobile/test/modes.test.mjs` | `contagionChains` → `contagionGroups`, con las dos ramas | Mismo motivo |
| `mobile/test/report.test.mjs` | La cabecera del texto compartido termina en «· Clásico» | C18: compartir incluye el modo |
| `mobile/test/map-view.test.mjs` | La vista de la prueba lista a los jugadores que tienen posición | El servidor nunca envía posiciones de quien no está en la vista; C13 filtra ese caso |
| `sim/panel/test/simulacion.test.mjs` | Más estricta (C20) | — |

No se ha borrado ninguna prueba ni hay ninguna `.skip`.

**Aviso sobre la auditoría anterior:** el script `reproducciones/coordinador/escenarios-10.mjs` comprobaba «nadie captura en su espera» con un campo inexistente (`c.at`), así que esa comprobación del registro 21 no podía fallar. La prueba del repositorio que lo sustituye (`escenarios-completos`) usa `atOffsetMs` y sí la verifica. La regla ya estaba verificada por otras pruebas, por ejemplo SIM-INF-01.

## 5. Resultados reales (registros en `registros/`)
| Tipo | Suite | Resultado |
|---|---|---|
| Tipos | `tsc` | OK (`20-tsc-final`) |
| Unitarias + integración | Motor + S0 | **252/252** (`21-motor-final`) |
| Integración (WebSocket reales) | Servidor | **119/119** (`22-servidor-final`) |
| Unitarias | Cliente | **148/148** (`23-cliente-final`) |
| Unitarias | Demo | 62/62 (`05-demo`) |
| Simulación | Simulador | 15/15 (`04`, `25-simulador-final`); el agente 3 lo ejecutó otras 3 veces: 15/15 en cada una |
| Partidas completas simuladas (10 bots + revancha, 3 modos) | `escenarios-completos` | 3/3 en 2 ejecuciones del coordinador (`06-…-1`, `06-…-2`) y 2 del agente 4 |
| Navegador (Chromium o Chrome, viewport de móvil) | `zorro` | 7/7 (`12`, `24`). Antes de la corrección de `.callout`, 7/7 sin las aserciones nuevas |
| Navegador | `infeccion` | 8/8 (`10`, `14`, `24`) |
| Navegador | `map` | 27/28 con la regresión de `.callout` → **29/29** corregida (`11`, `12`) |
| Navegador | `web-flow` | La 1.ª llamada falló por un error mío de argumentos, no del juego (`11-e2e-web-flow`). Después, **42/42 en tres ejecuciones** (`13-…-1..3`) |
| Navegador | `conexion` 10/10, `inicio` 13/13, `playtest-ui` 13/13, `game` 8/8, `layout` 6/6, `simulador` 9/9 | Con el código final (`14-…-final`) |
| Pruebas físicas con personas y móviles | — | **No realizadas** |

**Sin prueba automática:** R-3 y R-7 (texto del cliente en `app.js`, que no tiene pruebas unitarias). Se comprobaron leyendo el código y con las e2e generales, que pasan.

**Intermitencias:** ninguna en este ciclo. `web-flow`, intermitente en ciclos anteriores, pasó 3 de 3. No basta para darla por resuelta, solo para no haberla reproducido.

## 6. Revisión adversarial (agente 6)
- **Veredicto:** no hay regresiones P0 ni P1 nuevas.
- **Reglas:** ninguna regla aprobada ha cambiado.
- **Información entre roles:** no se filtra nada. «El zorro es X» solo lo ven los cazadores y solo tras la cuenta atrás.
- **Servidor y resultados:** las capturas siguen validadas por el servidor, los resultados coinciden con el estado y la revancha empieza limpia.
- **Hallazgos:**

| ID | Sev. | Estado |
|---|---|---|
| R-1 | P2 | Corregido (§2) |
| R-2 | P3 | Corregido |
| R-3 | P3 | Corregido |
| R-4 | P3 | `presencia-real` no detecta V-17 (lo detecta `regresiones-ciclo` C6). Se queda como cobertura de la cadencia real, no como regresión de C6 |
| R-5 | P3, diseño | Quien sale en una cuenta atrás que **sigue** figura como «Abandonó» y queda invitado a la revancha. Es la semántica de abandono vigente, y ahora puede volver gracias a C2. Sin cambios |
| R-6 | P3 | C3: con la duración máxima de la app (60 + 5 min) no se puede empezar pasadas 4 h 25 min desde que se creó la sala. C9: una sala solo con reconexiones caduca a los 30 min. Consejo: crear la sala en el lugar de juego |
| R-7 | P3 | C2: quien conozca el `installId` de otro, que no se expone, puede quedarse su plaza desconectada de la sala de espera. C4: el límite por IP ya no frena un secreto acertado (32 bytes aleatorios). El texto «ha entrado» está corregido |
| R-8 | P3 | C6 anota `lastSeenAt` sin marcar cambios, igual que `forgiveAbsence`. Efecto despreciable |

## 7. Decisiones de producto que siguen bloqueando trabajo (parte B, sin implementar)
Comprobado: `DECISION_LOG.md` no tiene entradas posteriores a D-057, y ni `GAME_MODES_AND_RULES.md` ni D-057 resuelven estos puntos.

| # | Asunto | Implementación necesaria | Alternativas y consecuencias |
|---|---|---|---|
| B1 | **Jugador sin GPS válido** (V-01, **P1**; decide la Caza del zorro) | En el motor, un plazo «sin lectura válida» distinto de la presencia; en la interfaz, un aviso público | a) «Sin señal GPS» visible y fuera a los 5 min, como la presencia: justo, pero expulsa a quien está en un interior o en el metro. <br>b) Exponer su última posición: castiga sin expulsar, pero la posición puede ser antigua. <br>c) Mantener y avisar en las reglas: sin coste, y el zorro sigue siendo incapturable si no tiene GPS |
| B2 | **Límites de «Reclamar»** (V-02) | Motor: el código de error, un contador por cazador y objetivo, o un aviso al fugitivo | a) Un solo texto de rechazo: acaba con el sondeo, pero los rechazos legítimos dejan de explicarse. <br>b) Límite de fallos: frena el abuso, pero penaliza el GPS impreciso. <br>c) Avisar al fugitivo: disuade, pero revela que lo buscan cerca |
| B3 | **Asignación de roles** (V-03, §4.3) | Motor: ignorar `set_team_pref` de quien no es anfitrión en Infección y el zorro, o hacerlo visible | a) Solo el anfitrión: coherente con §11.3, pero quita las preferencias de S0. <br>b) Preferencias visibles: transparentes, pero permiten elegirse zorro |
| B4 | **Cancelación por el anfitrión que juega** (V-10) | Motor: `end_game` con condiciones | a) Prohibirla con una reclamación pendiente contra él. <br>b) Confirmación de otro jugador. <br>c) Mantener: el anfitrión zorro puede anular la derrota |
| B5 | **Infección: recalcular cazadores en la cuenta atrás** (V-20) | Motor: recalcular el reparto o volver a la sala | a) Recalcular: cumple «exactos», pero cambia roles ya revelados. <br>b) Volver a la sala: más lento. <br>c) Mantener y documentar |
| B6 | **Posición antigua de quien está «sin conexión»** (V-21; D-057 §1 frente a §3) | `view.ts` y pistas | a) Ocultarla: coherente con §1, pero los cazadores pierden la pista de un zorro que se desconecta. <br>b) Mantenerla marcada como antigua (lo actual) |
| B7 | **Reclamaciones pendientes al terminar o ignoradas** (V-24, D-035) | Motor: resolver al terminar, o marcas antitrampas | a) Contar como captura una reclamación válida pendiente al final: castiga no responder, pero da capturas sin confirmar. <br>b) Contar las caducidades como rechazos (marcas). <br>c) Mantener: no responder los últimos 30 s salva al fugitivo |
| B8 | **Caza del zorro sin cazadores activos** (D2) y 1 contra 1 tras abandonos (D1) | `checkEnd` por modo | a) Gana el zorro: premia aguantar. <br>b) Sin ganador (lo actual, `hunters_abandoned`). <br>c) Volver a la sala |
| B9 | **Frecuencia de actualización de posiciones** (D9: «en directo» = cada 5 s, con lecturas de hasta 15 s) | `positionsIntervalMs` en el hub | Menos de 5 s: más «directo», más batería y datos. Más de 5 s: menos coste, y el zorro reacciona tarde |
| B10 | **Documentación:** «roles ocultos» = «no mostrados» (V-23); nombres de eventos §3.2/§3.4/AC-I frente a §11 (V-26) | Solo texto | Corregir la documentación, o pedir que el código siga el borrador |

## 8. Pendientes técnicos (P3, fuera de lo autorizado o no prioritarios)
- **V-29:** «Me han pillado» atribuye la captura sin comprobar la distancia. Depende de B7.
- **V-30:** reloj del servidor no monótono y latencia de WebSocket.
- **V-31:** suspensión de 30–60 s, no reproducida.
- **V-32:** pistas vacías tras reiniciar con STATE_FILE.
- **A2-1 con `create`:** un `welcome` perdido al crear deja una sala huérfana.
- **Textos (agente 5):**
  - A3-10: autor de una autodeclaración en espera descartado sin avisar.
  - A5-11: mínimos de jugadores en la sala.
  - A5-12: «Hiciste N capturas» al cazador de Infección.
  - A5-13: texto de la expulsión.
- **«Último superviviente» solo si caen todos (A3-9):** es una decisión de presentación; no se ha cambiado.

## 9. Archivos modificados en este ciclo (respecto al respaldo)
- **Código del juego:**
  - `engine/src/engine.ts`, `engine/src/types.ts`, `engine/src/view.ts`;
  - `server/hub.ts`, `server/main.ts`;
  - `mobile/www/js/net.js`, `mobile/www/js/app.js`, `mobile/www/js/game-view.js`, `mobile/www/css/game.css`.
- **Herramienta (simulador):** `sim/panel/simulacion.mjs`, `sim/panel/servidor.mjs`, `sim/panel/www/index.html`, `sim/panel/www/panel.js`.
- **Scripts:** `package.json`:
  - `test:sim-panel` apunta a `simulacion.test.mjs`;
  - nuevo `test:sim-escenarios`.
- **Pruebas nuevas:**
  - `engine/test/regresiones-ciclo.test.ts`, `engine/test/infeccion-ciclo.test.ts`, `engine/test/zorro-ciclo.test.ts`;
  - `server/test/regresiones-ciclo.test.mjs`, `server/test/presencia-real.test.mjs`, `server/test/zorro-ciclo.test.mjs`;
  - `mobile/test/regresiones-ciclo.test.mjs`, `mobile/test/net-regresiones.test.mjs`;
  - `sim/panel/test/escenarios-completos.test.mjs`.
- **Pruebas ajustadas (§4):**
  - `engine/test/timing.test.ts`, `server/test/upload.test.mjs`;
  - `mobile/test/modes.test.mjs`, `mobile/test/report.test.mjs`, `mobile/test/map-view.test.mjs`;
  - `mobile/e2e/infeccion.e2e.mjs`, `mobile/e2e/zorro.e2e.mjs`;
  - `sim/panel/test/simulacion.test.mjs`.
- **Sin cambios:**
  - las reglas (`docs/product/GAME_MODES_AND_RULES.md`) y `DECISION_LOG.md`;
  - la configuración de MapTiler y el túnel;
  - las evidencias anteriores, incluidos los scripts de la auditoría. Dos de ellos importan `contagionChains`, que ya no existe: quedan como evidencia histórica.

## 10. Estado de los modos
Estados posibles: verificado; verificado parcialmente; pendiente; no probado.

| Modo | Motor | Servidor | Interfaz | Partida completa simulada | Validación física |
|---|---|---|---|---|---|
| Clásico | Verificado; hueco V-01 pendiente de B1 | Verificado | Verificado (e2e `game`, `web-flow`, `map`, `playtest-ui`) | Verificado (10 bots + revancha) | Pendiente (sin registro verificable) |
| Infección | Verificado; V-01 pendiente de B1 y V-20 de B5 | Verificado (presencia real, convertido fuera) | Verificado: contagio completo, tarjeta, espera (e2e `infeccion`) | Verificado | No probado |
| Caza del zorro | Verificado parcialmente: **V-01 (P1) y V-02 deciden la partida** (B1, B2) | Verificado | Verificado: nombre del zorro, textos (e2e `zorro`) | Verificado | No probado |

«Verificado» quiere decir: con pruebas automatizadas ejecutadas en este ciclo y bots. **Ninguna de estas pruebas sustituye a la validación física.**

## 11. Recomendaciones para la validación física
Ver `QA/ciclo-20261030-validacion-modos/ESTADO_VALIDACION_FISICA.md`, que sigue vigente. Además:
- **Organización:**
  - crear la sala ya en el lugar de juego (C3, C9);
  - arrancar con el script oficial (`TRUST_PROXY=1`, `STATE_FILE`).
- **Clásico:**
  - «Abandonar» y volver a entrar con el código para la revancha (C2);
  - un cazador sale en la cuenta atrás.
- **Infección:**
  - convertir a un fugitivo expuesto: los cazadores no deben leer «ha vuelto a la zona» (R-2);
  - recargar tras la conversión: la tarjeta sale una vez;
  - el informe agrupa todo el contagio.
- **Caza del zorro:**
  - «El zorro es X» solo para los cazadores tras la cuenta atrás;
  - «Ganas» / «Pierdes»;
  - prueba de funcionamiento, **no de equilibrio**, hasta decidir B1 y B2;
  - el zorro se compromete a mantener el GPS activo.
