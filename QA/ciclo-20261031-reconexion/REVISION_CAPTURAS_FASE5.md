# Fase 5 · Inventario de riesgos de capturas, disputas, sesiones y GPS (solo lectura)

Fecha: 31/10/2026. Repositorio: `C:\Users\aange\Projects\Juego-escondite-recuperacion` (sin commit, trabajo vigente). No se ha modificado nada del repositorio.

## Qué he comprobado y qué he ejecutado
- **Leído:** `engine/src/engine.ts` (completo), `location.ts`, `validate.ts`, `constants.ts`, `teams.ts`, `view.ts` (visibilidad e instantánea), `server/hub.ts` (completo), `server/protocol.ts`, `server/main.ts` (`/api/loc` y `originAllowed`), `mobile/www/js/net.js` (cola de comandos, reanudación, 4001, `sendLocation`), `app.js` (envío de lecturas, botones de reclamar/responder/autodeclarar, eventos), `location.js` (cálculo de `ageMs` en navegador y nativo). También `GAME_MODES_AND_RULES.md` §9 y §11, `DECISION_LOG.md` D-035 y D-057, `INFORME_AUDITORIA_MODOS.md` §6, `INFORME_CICLO_CORRECCIONES.md` §7, `DECISIONES_PENDIENTES.md:146`, y los informes de los agentes 2 y 4 del ciclo anterior.
- **Ejecutado:** solo una prueba propia, fuera del repositorio (`scratchpad\fase5\reenvio-salto.test.ts`), con `node --test --test-concurrency=1`. Antes comprobé la memoria libre: 466 MB. Resultado: 2 de 2 pasan. Confirma dos cosas:
  1. Si se reenvía la misma lectura atípica con 40 ms más de latencia, se acepta como nueva y deja de contar como salto (R-07).
  2. `clockSuspect` nunca se activa por la vía del servidor (R-13).
- **No he ejecutado** servidores, navegadores ni suites.

## Tabla de riesgos (por gravedad y, dentro de cada gravedad, por coste)

| ID | Riesgo | Evidencia (archivo:línea) | Explotación: entre amigos sin herramientas / con cliente modificado | Grav. | Coste | ¿Decisión de producto? | ¿Ya identificado? |
|---|---|---|---|---|---|---|---|
| R-01 | **Fugitivo sin lectura válida = incapturable por reclamación**, y sigue «conectado». Sin GPS, sin permiso, con precisión de más de 30 m o con la lectura de hace más de 15 s, toda reclamación falla. Cualquier mensaje (ping de la app, comando) cuenta como señal de vida, así que no llega ni el «sin conexión» ni el fuera a los 5 min. Si sale de la zona sin enviar lecturas, nunca queda expuesto | `engine.ts:889-891`, `533-538`; `hub.ts:424`, `697-719` | **Sin herramientas:** quitar el permiso de ubicación o activar el modo avión del GPS y seguir con datos. **Con cliente modificado:** declarar `acc` entre 31 y 50: en las pistas sale como «CURRENT» (≤ 50 m), pero no se le puede reclamar (> 30 m) | **Alta** | Medio | Sí (B1) | **V-01 confirmado.** Matiz: con `acc` de 31 a 50 la posición se ve normal y aun así no se puede capturar |
| R-02 | **La captura depende por completo del fugitivo** (D-035 sin implementar). «No» cierra la reclamación en el acto. No hay estado «disputada» ni forma de resolverla antes del final. Ignorarla 30 s o cortar la conexión tiene el mismo efecto, sin ninguna consecuencia. El cazador puede reclamar otra vez a los 3 s | `engine.ts:708-729`, `276-284`; `hub.ts:93`, `582-585`; D-035 (`DECISION_LOG.md:194-200`) | **Sin herramientas:** pulsar «No» siempre, o no contestar. **Con cliente modificado:** responder `accept:false` automáticamente a todo `tag_claimed`. Que la prueba con dos móviles funcionara solo confirma el flujo técnico, no que la regla aprobada se cumpla | **Alta** (incumple una regla aprobada) | Alto | Sí (no se rediseña en este ciclo) | V-24, B7 y `DECISIONES_PENDIENTES.md:146`. **Confirmado** |
| R-03 | **Ubicación falsificada sin ninguna verificación en el servidor.** `lat`, `lng`, `acc` y `age` los declara el cliente. El servidor solo comprueba que sean números finitos, que la precisión esté entre 0 y 10 km y que `age` esté entre 0 y 10 min. `isMock` es opcional, lo declara el propio cliente y el navegador nunca lo envía. Dos lecturas falsas seguidas y coherentes «confirman» un salto. `/api/loc` acepta peticiones sin cabecera `Origin` (curl), solo con `playerId` y el secreto | `location.ts:5-13`, `18-30`, `69-78`, `85`; `hub.ts:663-686`; `protocol.ts:70-81`; `main.ts:106-107`, `221-236`; `location.js:127-133` | **Sin herramientas avanzadas:** una app de ubicación simulada en Android (opciones de desarrollador) funciona con Chrome sin dejar marca. Un fugitivo así: no se le puede reclamar (`not_close_enough`), las pistas despistan a los cazadores y no queda expuesto aunque salga de la zona. Un cazador así: se «teletransporta» al punto de la pista y reclama desde lejos (el fugitivo puede decir «No»), o escanea (R-05). **Con cliente modificado:** un script con el secreto (sacado de `localStorage`) envía posiciones con `age:0` y mantiene la presencia | **Alta** | Alto (no hay solución técnica completa en web) | Sí: modelo de confianza | En parte: V-01 («precisión falsa») y la nota del agente 4 («posición falsa», sin `isMock` en el navegador). **No tenía ID propio** |
| R-04 | **Las marcas antitrampas van al revés y no se ven.** `repeated_tag_rejections` (a partir de 3 rechazos) recae en el fugitivo que rechaza, también si las reclamaciones eran falsas o en bucle. Al cazador que reclama sin razón no se le cuenta nada. Dejar caducar una reclamación no cuenta, así que ignorar sale más barato que rechazar. Las marcas van a todos en `game_finished`, pero el cliente no las usa en ninguna parte (ningún `flags` en `mobile/www/js`). `mock_location` solo existe en la app nativa. `implausible_speed` no descuenta la precisión (posibles falsos positivos con 1 lectura por segundo) y un duplicado de R-07 reinicia la racha | `engine.ts:719-722`, `377-389`; `location.ts:85-94` | **Sin herramientas:** un cazador insistente «mancha» al fugitivo honrado; el fugitivo aprende que no contestar no deja rastro. Hoy no tiene efecto visible para nadie | Media | Bajo (mostrar o quitar) / medio (rediseñar) | Sí | En parte: la nota del agente 4 (marcas invisibles) y V-24. **La inversión del incentivo es nueva** |
| R-05 | **«Reclamar» sirve para sondear la cercanía**, y con GPS falso se puede hacer a distancia. La respuesta distingue cerca o lejos (umbral de hasta 40 m) y además revela el estado del GPS del fugitivo: `target_location_stale`, `target_location_unstable` o `accuracy_too_low`. Hay un límite de 1 reclamación cada 3 s por jugador, guardado en memoria: dos cazadores sondean el doble. El fugitivo no se entera hasta que una reclamación prospera | `engine.ts:886-903`; `hub.ts:93`, `582-585` | **Sin herramientas:** pulsar el nombre una y otra vez mientras se camina («frío o caliente»). **Con GPS falso:** recorrer una cuadrícula alrededor de la última pista sin moverse (unas 180 celdas de 40 m para 300 m de radio, ≈ 9 min) | Media | Bajo | Sí (B2) | **V-02 confirmado.** La versión con GPS falso, a distancia, es un agravante nuevo |
| R-06 | **Reclamaciones en bucle o como acoso.** Tras un «No», el mismo cazador puede reclamar otra vez a los 3 s, sin enfriamiento por pareja (la propuesta original de D-035 era de 60 s). Cada reclamación hace vibrar el móvil del fugitivo y le abre la hoja. Con 3 rechazos, la marca de R-04 cae sobre él | `engine.ts:884` (solo bloquea mientras está pendiente), `708-729`; `app.js:378-379` | **Sin herramientas:** si el GPS dice que está a menos de 40 m, se le puede reclamar cada 3 s; con GPS falso, desde cualquier sitio | Media | Bajo | Sí (D-035: mientras siga abierta, no se vuelve a reclamar) | En parte: `DECISIONES_PENDIENTES.md:146` («3 s después») |
| R-07 | **El reenvío de la misma lectura confirma saltos de GPS.** `app.js` vuelve a enviar `ui.reading` cada 5 s con la antigüedad recalculada. El servidor calcula `effectiveAt = now − age`, que incluye la latencia de cada envío: si el reenvío tarda más que el original, se acepta como lectura «más nueva». Como coincide con la lectura atípica, `isJump` la da por alcanzable y quita el salto. Con eso, una lectura atípica aislada puede validar una captura (contradice el Plan Maestro §10) y la racha de velocidad se reinicia | `app.js:432-444`; `hub.ts:673-683`; `location.ts:57-78`, `83`, `87-91`. **Confirmado con la prueba propia** | **Sin mala intención:** en interiores o con el GPS parado (sin lectura nueva en 5 s), la mitad de los reenvíos aproximadamente se cuelan, según la latencia. Resultado: reclamaciones aceptadas a partir de un pico del GPS, que el fugitivo tiene que rechazar. **Con cliente modificado:** lo mismo, a propósito | Media | Bajo (no reenviar la misma lectura, o que el servidor descarte una repetida) | No | **Nuevo** |
| R-08 | **Reclamación pendiente al final de la partida.** `finish` y `close` vacían las reclamaciones sin evento ni registro. En los últimos 30 s, no contestar salva al fugitivo, y su «Sí» tardío da `claim_not_found`. Que el anfitrión termine la partida tiene el mismo efecto | `engine.ts:369-375`, `396`, `686-690` | **Sin herramientas:** no contestar al final; el anfitrión que es fugitivo pulsa «Terminar» | Media | Medio | Sí (B7, B4) | B7, V-10/B4, D3 del agente 4. **Confirmado** |
| R-09 | **Los comandos encolados durante un corte se ejecutan al reconectar, sin límite de antigüedad.** Los botones no se desactivan sin conexión. Un `claim_tag` pulsado sin cobertura se ejecuta minutos después con las posiciones de ese momento, y un `respond_tag` «Sí» puede llegar con la reclamación ya caducada: se pierde una captura reconocida y hay que recurrir a «Me han pillado» | `net.js:431-439`, `349`; `app.js:1293-1301`, `1002` | **Sin mala intención:** cobertura irregular en la calle | Baja | Bajo (descartar comandos de captura con más de N s, o desactivar los botones sin conexión) | No | **Nuevo** (V-16 era otro caso de la misma cola) |
| R-10 | **Reloj del móvil y antigüedad de la lectura.** En el navegador, `ageMs = Date.now() − pos.timestamp`, con 0 como mínimo. Si la marca de tiempo del navegador va por delante del reloj del móvil, una lectura vieja parece reciente; si va por detrás, todas parecen antiguas (no se puede reclamar ni ser reclamado). `clockSuspect` no se activa nunca por la vía del servidor, así que esa protección del motor no actúa en producción. La latencia de red no se descuenta | `location.js:132`; `net.js:443`; `hub.ts:680`; `location.ts:19`; `engine.ts:889-890` | **Sin herramientas:** un móvil con la hora cambiada a mano. El efecto depende de cómo genere `timestamp` cada navegador: **verificar en un dispositivo** | Baja | Bajo | No | En parte: V-30 y A2-6 (latencia). **Lo de `clockSuspect` inalcanzable es nuevo** |
| R-11 | **«Me han pillado» atribuye la captura a cualquier cazador sin comprobar la distancia** | `engine.ts:745-750` | Regalar la captura a un amigo del equipo contrario | Baja | Bajo | Sí | **V-29 confirmado** |
| R-12 | **Cualquiera puede fijar su propio equipo con `set_team_pref`**, aunque la interfaz no lo ofrece, y eso pisa la asignación del anfitrión | `engine.ts:614-622`; `teams.ts:17-27` | **Con cliente modificado:** garantizarse ser el zorro o cazador | Baja (P2 en el zorro) | Bajo | Sí (B3) | **V-03 confirmado** |
| R-13 | **Identidad del dispositivo declarada por el cliente.** `installId` lo genera el propio cliente: el veto por expulsión se salta borrando los datos o con una ventana de incógnito. Con el `installId` de otro se podría ocupar su plaza en la sala de espera mientras está desconectado, pero ese dato no se envía a nadie | `engine.ts:666`, `777-812`; `net.js:111-114` | **Sin herramientas:** volver a entrar tras una expulsión desde una ventana de incógnito | Baja | Medio | Sí | **Nuevo** (V-05 trataba otros efectos) |
| R-14 | **Una reclamación pendiente bloquea las demás contra ese fugitivo** (`already_pending`) durante 30 s. Un aliado en el equipo cazador (convertido en Infección) podría «escudarlo» reclamando una y otra vez | `engine.ts:884` | Colusión. Poco incentivo: el convertido gana con los cazadores | Baja | Bajo | Sí | **Nuevo** |
| R-15 | **El capturado (espectador) ve a todos los activos, con 60 s de retraso**, y puede chivarlo por teléfono | `view.ts:93-99` | Colusión fuera de la app | Baja | — (no es técnico) | Sí | No en esta forma |

### Comprobado sin hallazgo relevante (sesiones, idempotencia y forma de los comandos)
- **Secreto de sesión:**
  - es aleatorio (32 bytes), se guarda como hash y se compara en tiempo constante (`hub.ts:407-411`, `533-541`);
  - solo vale para su jugador y su sala: los `playerId` son aleatorios en cada entrada;
  - se revoca al salir en la sala de espera o en el final, al ser expulsado, al reclamarse la plaza y al borrarse la sala (`hub.ts:761-771`, `866-887`).
- **Quien abandona en plena partida** conserva la sesión hasta la revancha, pero el motor rechaza sus comandos de juego (`engine.ts:595`, `734-735`, `877`) y sus lecturas (`gone`, `hub.ts:672`).
- **Pestaña duplicada:** `resume` cierra la anterior con 4001 tras quitarle el jugador (`hub.ts:507-512`). Los comandos de la pestaña antigua reciben `no_session` y el cliente no reconecta en bucle (`net.js:227-235`).
- **Respuestas a reclamaciones caducadas o de otra partida:** dan `claim_not_found`.
  - Las reclamaciones se vacían al terminar, en la revancha y al cerrar.
  - Sus identificadores llevan el número de partida (`engine.ts:907`).
  - Solo responde el fugitivo afectado (`engine.ts:710`).
  - `respond_tag` no comprueba la fase, pero fuera de la persecución no hay reclamaciones.
- **Idempotencia:**
  - la respuesta se guarda por `id` (hasta 64 por jugador) y se consulta antes del límite de frecuencia;
  - el límite de reclamaciones cuenta también los intentos fallidos (`hub.ts:564-589`).
  - Si una respuesta ya se ha descartado, el comando se ejecutaría otra vez, pero `claim_tag` sigue limitado y `respond_tag` daría `claim_not_found`.
  - El límite se guarda en memoria y se reinicia si el servidor se reinicia (efecto menor).
- **Forma de los comandos:**
  - se rechazan los campos extra y los tipos incorrectos (`validate.ts:126-136`, `150-189`; `protocol.ts:97-111`);
  - `join`, `connection`, `seen` y `location` no se aceptan como comandos (`hub.ts:576-578`);
  - los comandos del anfitrión comprueban quién es el anfitrión (`engine.ts:625-690`; `hub.ts:610-613`).
- **Corte durante una reclamación:** la reclamación sigue viva 30 s y, al volver, la instantánea la trae (`view.ts:166-207`). A los 5 min sin señal se cancela (`engine.ts:963-967`).

## Opciones para decidir (cambios de regla, no correcciones)
1. **Disputas (R-02, R-06, R-08):**
   - implementar el procedimiento de §9.3: «disputada» y pendiente, solo se acepta o se retira, ventana final, regla predeterminada;
   - o la versión mínima de la sesión 4: enfriamiento por pareja y recuento visible.
   - Para una reclamación pendiente al final: no hay captura (lo actual), hay captura, o una ventana de resolución.
2. **Marcas (R-04):**
   - mostrarlas en el Mission Report o quitarlas;
   - contar también las caducidades;
   - contar las reclamaciones rechazadas del cazador, no solo los rechazos del fugitivo.
3. **Sin GPS válido (R-01):** las opciones a, b y c de B1.
4. **Sondeo (R-05):**
   - un único texto de rechazo;
   - un límite de reclamaciones fallidas por pareja;
   - avisar al fugitivo (B2).
5. **Confianza en la ubicación (R-03):**
   - aceptar que se juega entre amigos y decirlo en las reglas;
   - exigir la app nativa con `isMock` obligatorio y verificación del dispositivo;
   - mostrar «ubicación simulada» a todos.
6. **Anfitrión que juega (R-08):** B4. **Equipos (R-12):** B3. **Autodeclaración (R-11):** sin atribución, o con atribución solo a un cazador cercano.

## Correcciones que no cambian reglas (bajo coste)
- **R-07:**
  - no reenviar desde `app.js` una lectura que ya se envió;
  - o que el servidor descarte una lectura igual a la última, o con `effectiveAt` a menos de unos cientos de ms.
- **R-09:** caducidad de los comandos de captura en la cola de `net.js`, o botones desactivados sin conexión.
- **R-10:** detectar una marca de tiempo del navegador en el futuro (y no recortarla a 0) y avisar; documentar que `clockSuspect` solo sirve al simulador o a las pruebas.
