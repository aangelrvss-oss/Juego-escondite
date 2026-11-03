# Ciclo de validación profunda de los modos · 30/10/2026

**Pregunta del ciclo:** ¿podemos confiar en que Clásico, Infección y Caza del zorro aplican sus reglas y mantienen un estado coherente durante una partida multijugador completa?

**Respuesta corta:**
- El **estado autoritativo es coherente** en los tres modos: no hay ningún P0.
  - Ningún resultado es incorrecto.
  - No hay fugas entre equipos en partidas completas de 10 jugadores.
  - Hay un solo final por cliente.
  - La revancha queda limpia.
- Las **reglas aprobadas se cumplen** en el motor, con un **P1 abierto** (V-01): un fugitivo sin GPS válido no se puede capturar y nunca queda «sin conexión». Decide la Caza del zorro, y arreglarlo exige una decisión del propietario.
- Hay 9 P2 y unos 25 P3, casi todos de interfaz, informe y casos límite de sala y conexión.

Documentos del ciclo:
- [MATRIZ_DE_PRUEBAS.md](MATRIZ_DE_PRUEBAS.md)
- [PLAN_DE_CORRECCIONES.md](PLAN_DE_CORRECCIONES.md)
- [INFORME_REVISION_ADVERSARIAL.md](INFORME_REVISION_ADVERSARIAL.md)
- [ESTADO_VALIDACION_FISICA.md](ESTADO_VALIDACION_FISICA.md)

## 0. Estado de partida (fase 0, solo lectura)
- **Repositorio:**
  - rama `mapa-real`, HEAD `462016d`;
  - remoto `origin` → `github.com/aangelrvss-oss/Juego-escondite.git`;
  - 48 archivos modificados y 35 entradas sin seguimiento (archivos o carpetas): es el trabajo vigente de los ciclos del 29 y 30/10, sin commit.
  - En este ciclo no se ha cambiado ningún archivo de código ni de pruebas del repositorio; solo se ha creado esta carpeta.
- **Respaldo del ciclo anterior:** `Downloads\outrun-respaldo-20261030-165421-antes-ciclo-simulacion\` existe, con `.git`.
- **Procesos:**
  - el servidor del propietario en 127.0.0.1:8787 (PID 31160) y `cloudflared` siguen activos y sin tocar;
  - el simulador de :8790 estaba detenido y no se ha arrancado en modo panel;
  - las simulaciones de este ciclo usan servidores propios en puertos efímeros dentro del proceso de prueba.
- **Memoria:**
  - entre 250 y 1 000 MB libres de 6 GB (Chrome del usuario, unos 1,3 GB);
  - por eso las suites se ejecutaron de una en una con `--test-concurrency=1`, y los agentes auditaron sin ejecutar nada.

## 1. Organización
Seis agentes de auditoría en paralelo, solo lectura y sin ejecutar nada:
1. motor y reglas;
2. servidor y multijugador;
3. QA de Infección;
4. QA de Caza del zorro;
5. QA de interfaz;
6. revisor adversarial, que además hizo una segunda pasada sobre los hallazgos de los demás.

El coordinador:
- ejecutó todas las pruebas y todos los scripts de reproducción;
- escribió y ejecutó los escenarios completos de 10 jugadores;
- consolidó los hallazgos.

Material:
- informes íntegros: `informes-agentes/`;
- scripts: `reproducciones/`;
- salidas: `registros/`.

## 2. Pruebas ejecutadas en este ciclo (resultados reales)
| Registro | Qué | Resultado |
|---|---|---|
| 00 | `tsc` | OK |
| 01 | Motor + simulación S0 | 209/209 |
| 02 | Servidor (WebSocket reales) | 93/93 |
| 03 | Cliente (`mobile/test`) | 127/127 |
| 04 | Simulador sin navegador | 14/14 |
| 05 | Demo | 62/62 |
| 10 | Reproducciones del agente 1 (motor) | A1-1, A1-2, A1-4 y A1-5 reproducidos; espera de 59 999 / 60 000 ms y reparto de 4 a 20 correctos |
| 11 | Casos de Infección del agente 3 (motor y funciones del cliente) | 36/36; confirman A3-2, A3-3, A3-5 y A3-7 |
| 12 | Escenarios de Infección con 10 jugadores (agente 3) | 9/10. SIM-INF-04 falla por un artefacto del escenario (ver §4) |
| 13 | Diagnóstico de SIM-INF-04 | Ver §4 |
| 14 | Reproducciones del agente 4 (zorro) | A4-1 (A–D), A4-2, A4-3 y A4-4 reproducidos |
| 15 | Reproducciones del agente 2 (servidor) | A2-1, A2-2, A2-3 y A2-4 reproducidos; **A2-5 no reproducido** |
| 16 | Reproducciones del agente 6 | A6-1 a A6-13 reproducidos |
| 20, 21 | **Escenarios A, B y C: partida completa de 10 jugadores con revancha** en cada modo (semillas 7 y 11) | Sin problemas (ver §3) |
| 30 | e2e Caza del zorro en Chromium | 6/6, con capturas |
| 31 | e2e Infección en Chromium | 8/8, con capturas |

**No ejecutadas en este ciclo**, por falta de memoria y porque no entran en el alcance de esta auditoría:
- e2e `web-flow`, `game`, `layout`, `map`, `playtest-ui`, `conexion`, `inicio` y `simulador`;
- el panel del simulador en el navegador.

Sus últimos resultados son del ciclo anterior (`QA/ciclo-20261030-simulacion/`) y aquí se citan solo como antecedente.

## 3. Escenarios completos de 10 jugadores (registros 20 y 21)
El script `reproducciones/coordinador/escenarios-10.mjs` usa el servidor, el motor y `net.js` reales, con bots y el reloj simulado. Juega una partida completa, ofrece revancha, la juega y comprueba **lo que recibe cada cliente por la red**:
- ninguna posición fuera de la regla:
  - compañeros;
  - fugitivos expuestos para los cazadores;
  - cazadores para el zorro;
  - todo, con retraso, para el espectador;
- las pistas, solo para cazadores; en el zorro, una sola entrada y siempre el zorro;
- en las instantáneas, ningún equipo ajeno visible salvo la regla del modo;
- `game_finished`, exactamente una vez por cliente;
- el resultado, coherente con el estado:
  - `all_captured` sin fugitivos libres;
  - `time_up` con supervivientes;
  - en el zorro, una sola captura;
  - en Infección, todo infectado es cazador y nadie captura durante su espera;
- la revancha empieza sin reclamaciones, capturas ni esperas heredadas;
- una captura inválida queda rechazada por el motor.

| Escenario | Partida 1 | Revancha | Elementos de posición revisados | Problemas |
|---|---|---|---|---|
| A · Infección (s11) | 2 cazadores iniciales, `infeccion/2026-10-30`, todos infectados (8 capturas) | 2 cazadores, ídem | 15 408 | 0 |
| B · Zorro (s7 y s11) | 1 zorro y 9 cazadores, `zorro/2026-10-30`, zorro atrapado (1 captura) | Ídem | 10 773 y 6 723 | 0 |
| C · Clásico (s11) | 3 cazadores, `clasico/2026-10-30`, todos capturados (7 capturas) | Ídem | 12 510 | 0 |

Límites de estas simulaciones:
- **Reloj:** el tiempo es simulado, en pasos de 5 s. El simulador da señal de vida por los bots conectados (`keepAliveConnected`), así que la cadencia real del ping (10 s) no se ejerce aquí.
- **Plazos de presencia:** los 30 s y los 5 min se probaron aparte con bots desconectados o congelados (registros 04 y 12: SIM-INF-05, 06 y 08).
- **Gracia en Clásico:** queda cubierta por la prueba del simulador «desconexión forzada… a los 5 min queda fuera» (registro 04) y por `presence.test`.
- **Victoria por tiempo en Clásico:** estas semillas no la dieron. Está cubierta en el motor y se vio en el ciclo anterior.
- **Comprobante de la captura inválida:** es el último rechazo que consta en el registro del simulador, y puede ser el de un bot. Siempre es un rechazo real del motor.
- **Validez:** los bots no son personas ni móviles: nada de esto vale como validación física.

## 4. Discrepancias resueltas con evidencia
- **SIM-INF-04** («dos cazadores reclaman a la vez»): falla en el simulador, pero no es un fallo del juego.
  - Con el reloj en pausa, la lectura nueva tiene la misma hora efectiva que la anterior y el motor la descarta (`engine/src/location.ts:83`).
  - Con el reloj avanzado, el motor marca el teletransporte como salto (`your_location_unstable`). Las dos respuestas son correctas.
  - El caso real está cubierto y pasa en `engine/test/capture.test.ts:116` y en `server/test/capture-race.test.mjs:48`, con WebSocket reales en paralelo: un `already_pending` y una sola captura.
- **A2-5** (una suspensión del servidor de 30–60 s pone a todos «sin conexión»): no se ha reproducido; el script agotó el tiempo esperando el efecto. Queda como no confirmado.
- **A5-1** (nadie ve quién es el zorro): solo es cierto **en la cuenta atrás y en la huida**.
  - En la persecución, el cazador lo ve en la pista, en el mapa y en el botón de reclamar (`capturas/zorro/04-pista-Ana.png`).
  - Se rebaja de P1 a P2.
- **A1-11** (no puede volver a entrar): según la segunda pasada adversarial, tras volver a la sala sí puede. El `already_joined` aparece en la revancha (V-05).

## 5. Conclusiones por regla aprobada
**Verificado**, con pruebas ejecutadas y lectura del código:
- **Mínimos de jugadores:** 2, 4 y 3.
- **Cazadores iniciales:**
  - Clásico `ceil(n/4)`;
  - Infección `max(1, floor(n/4))` exactos, de n=4 a 20;
  - zorro n−1.
- **Infección:**
  - conversión en el mismo paso, sin doble rol;
  - espera de 60 s, con el límite exacto (59 999 ms se rechaza, 60 000 ms se acepta) y sin cambios al reconectar;
  - sin la pista anterior a la conversión;
  - los convertidos cuentan como cazadores;
  - finales: todos infectados, tiempo, y sin ganador por abandono o por el periodo de gracia.
- **Caza del zorro:**
  - un único zorro;
  - roles públicos tras la cuenta atrás;
  - el zorro ve a los cazadores;
  - las pistas son solo del zorro;
  - la captura termina la partida una sola vez;
  - si se acaba el tiempo, gana el zorro;
  - si el zorro abandona o queda fuera, sin ganador;
  - con menos de 3 en la cuenta atrás, se vuelve a la sala.
- **Común:**
  - versión de reglas por modo;
  - periodo de gracia de 30 s y 5 min;
  - revancha con sorteo nuevo;
  - un comando rechazado no deja rastro.

**Verificado parcialmente:**
- **Informe de Infección:** la cadena de contagio pierde ramas (V-08).
- **Identidad del zorro en la interfaz:** falta en la huida (V-09).
- **Presencia:** el motor la marca hasta 5 s antes (V-17).

**Hueco no cubierto por las reglas:** el fugitivo sin GPS (V-01). Requiere decisión.

## 6. Matriz única de incidencias
Severidad final tras la segunda pasada adversarial:
- **P0:** corrompe la partida, permite trampas graves o produce un resultado incorrecto.
- **P1:** impide jugar o rompe una regla importante.
- **P2:** comportamiento inconsistente que afecta a la experiencia o a escenarios concretos.
- **P3:** defecto menor de interfaz o documentación.

En la columna **Reproducción**:
- «Ejecutado» significa que el coordinador lo ejecutó en este ciclo.
- «Lectura» significa que se ha comprobado leyendo el código.
- «Lectura + prueba» significa que una prueba del registro 11 fija el comportamiento actual.

| ID | Modo | Problema | Evidencia | Sev. | Reproducción | Agentes |
|---|---|---|---|---|---|---|
| V-01 | Todos; decisivo en el zorro | Un fugitivo sin lectura válida no se puede capturar y nunca queda «sin conexión». Pasa sin GPS o sin permiso, con precisión de más de 30 m, o con una precisión falsa. Además, la zona solo se evalúa al llegar una lectura, así que gana por tiempo | `engine.ts:836-838`, `677`; `hub.ts:410-412`, `657-665`; `net.js:284-302` | **P1**; P0 si se juega con desconocidos | Ejecutado (registros 14 y 16) | A4-1, A6-1, A1-3 |
| V-02 | Todos; P1 en el zorro | «Reclamar» funciona como un sondeo de cercanía ilimitado y silencioso: el error distingue cerca, lejos, GPS antiguo y salto; hay un intento cada 3 s y el fugitivo no se entera. Contradice §8.1 | `engine.ts:836-850`; `hub.ts:83`, `549` | P2 | Ejecutado (registro 16, a6-02) | A6-2, A2-9 |
| V-03 | Zorro e Infección (Clásico P3) | Cualquier jugador puede fijar su propio rol con `set_team_pref`, que la interfaz no ofrece: se garantiza ser el zorro o bloquea el inicio sin causa visible. Las preferencias ocultas también vienen de `swapRoles` y de un cambio de anfitrión | `engine.ts:591-599`; `teams.ts:17-27`; `view.ts:192` | P2 | Ejecutado (registros 10, 14 y 16) | A4-3, A1-1, A1-2, A6-7 |
| V-04 | Todos; visible en el zorro | Quien sale en una cuenta atrás que se aborta aparece en el informe de la partida siguiente («Abandonó»; en el zorro, dos «Zorro») y queda invitado a la revancha | `engine.ts:412-425`, `909`; `view.ts:150`, `186` | P2 | Ejecutado (registros 14 y 16) | A4-2, A6-4, A1-11 |
| V-05 | Todos | La deduplicación por dispositivo tiene tres efectos: (a) tras «Abandonar», no se puede volver a la revancha (`already_joined`); (b) si se pierde el `welcome` al entrar, queda un jugador fantasma que bloquea el inicio; (c) expulsar al fantasma veta el dispositivo (`not_found`) | `engine.ts:643`, `754-757`, `950-971`; `app.js:1369-1385` | P2 | Ejecutado (registros 15 y 16) | A6-3, A2-1 |
| V-06 | Todos | Una partida que cruza las 6 h de vida de la sala termina sin informe ni revancha (`CANCELLED/expired`) | `engine.ts:184-213` | P2 | Ejecutado (a6-05) | A6-5 |
| V-07 | Todos (servidor) | El contador de fallos por dirección se comprueba antes que la sesión en `/api/loc`: 20 códigos falsos desde la misma IP (Wi-Fi compartida, CGNAT) bloquean el envío de ubicación de todo el grupo durante un minuto | `hub.ts:613-615` | P2 | Ejecutado (a6-06) | A6-6 |
| V-08 | Infección | La cadena de contagio del informe solo sigue la primera rama: se pierden infecciones. La e2e da por buena una cadena incompleta | `game-view.js:248-263`; `infeccion.e2e.mjs:174` | P2 | Ejecutado (registro 11) | A3-3, A5-5 |
| V-09 | Zorro | Durante la cuenta atrás y la huida, la interfaz no nombra al zorro a los cazadores; en la persecución solo se deduce. La regla dice «todos saben quién es el zorro» | `app.js:887`, `912`, `1096`, `1099`; `view.ts:166` | P2 | Lectura + captura `zorro/04` | A5-1 |
| V-10 | Zorro (y Clásico) | El anfitrión que es fugitivo o zorro puede terminar sin ganador cuando lo van a atrapar, y abandonar con una reclamación pendiente también deja la partida sin ganador | `engine.ts:663-667` | P2 (riesgo de diseño) | Ejecutado (a4-4 b) | A4-5 |
| V-11 | Infección y zorro | Durante unos 5 s tras un cambio de rol o una salida, el mapa conserva posiciones del equipo anterior, pintadas como «Tu equipo». El servidor ya no las envía; es la lista vieja del cliente | `app.js:278-286`; `hub.ts:783-805`; `game-view.js:446-462` | P3 | Ejecutado (a6-10) | A3-1, A5-7, A6-10, A4-8 |
| V-12 | Infección | La tarjeta «Te han infectado» no aparece si el evento llega reenviado con más de 15 s, al reconectar o recargar | `game-view.js:394-399`; `app.js:280` | P3 | Ejecutado (registro 11) | A3-2, A5-6 |
| V-13 | Infección | La tarjeta de conversión del último infectado tapa el informe final hasta 15 s | `app.js:366-370`, `1088` | P3 | Lectura | A5-2 |
| V-14 | Zorro e Infección | La vuelta a la sala desde la cuenta atrás (`countdown_aborted`) no se explica y los jugadores pierden su «Listo» sin saber por qué | `app.js:273-374` | P3 | Lectura | A5-3 |
| V-15 | Todos | «Tu partida» dice «Tu equipo gana · Seguías libre» a quien quedó fuera por los 5 min | `game-view.js:305-329` | P3 | Lectura | A5-4 |
| V-16 | Todos (cliente de red) | Tras `bad_session` o `removed`, los comandos pendientes se reenvían en la sala siguiente | `net.js:338`, `383-390` | P3 | Ejecutado (registro 15) | A2-2 |
| V-17 | Todos | La presencia solo anota una señal cada 5 s: «sin conexión» y «fuera» pueden llegar hasta 5 s antes | `hub.ts:657-665` | P3 | Ejecutado (registro 15) | A2-3 |
| V-18 | Servidor | `{t:'cmd', cmd:null}` provoca un `TypeError` y cierra la conexión con 1011, en lugar de responder `invalid_command` | `protocol.ts:69`; `hub.ts:676` | P3 | Ejecutado (registro 15) | A2-4 |
| V-19 | Todos | Quien queda fuera por el periodo de gracia recibe, al reconectar, pistas con coordenadas emitidas cuando aún jugaba | `hub.ts:504-509`, `719-730` | P3 | Ejecutado (a6-09) | A6-9, A4-7 |
| V-20 | Infección | Los cazadores «exactos» solo se garantizan al empezar: si alguien sale en la cuenta atrás, con 7 jugadores quedan 2 cazadores donde la regla da 1. Con menos de 4 se vuelve a la sala, aunque §11.2 no lo dice | `engine.ts:889-893` | P3 (requiere decisión) | Ejecutado (a6-08 y registro 11) | A6-8, A3-7, A1-9 |
| V-21 | Zorro | Un jugador «sin conexión» sigue apareciendo con su última posición, marcada como antigua, en el directo del zorro y en las pistas. D-057 §1 dice «sin posición»; §3 dice «cazadores activos» | `view.ts:73`; `engine.ts:303-309` | P3 (ambigüedad) | Ejecutado (a4-4 a) | A4-4 |
| V-22 | Todos | La sala de espera no caduca si una pestaña reconecta (`connection` cuenta como actividad) | `engine.ts:556-559` | P3 | Ejecutado (a6-10) | A6-11 |
| V-23 | Clásico e Infección | «Roles ocultos» significa solo «no mostrados»: cada uno ve el equipo de sus compañeros y `null` en los demás, así que deduce el resto; `captures` y `runner_captured` dan el cazador a todos | `view.ts:150-160` | P3 (documentación) | Ejecutado (a6-10) | A6-12, A2-10 |
| V-24 | Todos | Ignorar una reclamación no deja rastro ni marca, y la disputa de D-035 no está implementada | `engine.ts:276-284` | P3 (requiere decisión) | Ejecutado (a4-1 C, a6-10) | A6-13, A1-4 |
| V-25 | Todos | Si todos quedan fuera a la vez, la causa del final depende del orden de los identificadores; en los dos casos no hay ganador | `engine.ts:226` | P3 | Ejecutado (registro 10) | A1-5 |
| V-26 | Infección | Los nombres de eventos y errores de la documentación en borrador (§3.2, §3.4, AC-I) no coinciden con el código; §11 sí coincide | — | P3 (documentación) | Lectura | A1-6, A3-6 |
| V-27 | Infección | `canTagFrom` y `convertedAt` siguen en el final y en la sala de la revancha (se limpian al empezar) | `view.ts:208`; `engine.ts:931-975` | P3 | Ejecutado (registros 11 y 21) | A1-7, A3-5 |
| V-28 | Infección | Al convertir a un fugitivo expuesto no se emite `runner_unexposed` | `engine.ts:476` | P3 | Lectura | A1-8 |
| V-29 | Infección y Clásico | «Me han pillado» atribuye la captura a cualquier cazador sin comprobar la distancia | `engine.ts:722-727` | P3 | Lectura | A1-10, A4-6 |
| V-30 | Servidor | El reloj de pared no es monótono, y no se descuenta la latencia de las lecturas por WebSocket | `hub.ts` (`Date.now`), `643` | P3 (entorno) | Lectura | A6-14, A2-7, A2-6 |
| V-31 | Servidor | Una suspensión de 30–60 s no se perdona | `hub.ts:60`, `837-855` | P3 | **No reproducido** | A2-5 |
| V-32 | Servidor | Tras reiniciar con STATE_FILE después de una parada larga, salen seguidas pistas sin posición | — | P3 | Lectura (probable) | A2-11 |
| V-33 | Interfaz | Textos menores (detalle en el informe del agente 5 §P3 y del agente 3): <br>• «La primera pista llega sola…» al convertido; <br>• «en secreto» en el zorro; <br>• «Tu equipo gana» al zorro; <br>• «SUPERVIVIENT/ES» partido a 360 px; <br>• `forbidden` siempre dice «Solo el anfitrión»; <br>• `busy` sin texto; <br>• la tarjeta no se anuncia a lectores de pantalla; <br>• compartir el resultado no dice el modo; <br>• el último superviviente solo aparece si caen todos | `app.js`, `game-view.js` | P3 | Lectura | A5, A3-4, A3-9 a A3-11 |
| V-34 | Pruebas | Pruebas débiles: <br>• `server/test/helpers.mjs:30-38` da señal de vida a todos; <br>• el título de `presence.test.mjs:176` promete más de lo que verifica; <br>• aserciones dentro de `if` en `simulacion.test.mjs:73`, y `:43-47` acepta cualquier resultado; <br>• esperas fijas de 30 ms a 5 s; <br>• la e2e de Infección valida una cadena incompleta | Ver el informe del agente 6 | P3 | Lectura | A6, A3-12 |
| V-35 | Simulador (herramienta) | Su registro dice «— expuesto», «infectado por —» y «ganan los fugitivos» en Infección. No tiene revancha, autodeclaración ni otros tamaños | `simulacion.mjs:516-560` | P3 | Lectura | A3-8 |

**Cuestiones de diseño del zorro sin regla** (agente 4, D1–D9):
- **D1:** ¿se juega 1 contra 1 tras abandonos?
- **D2:** ¿gana el zorro si se van todos los cazadores?
- **D3:** ¿qué pasa con una reclamación pendiente al llegar el final?
- **D9:** ¿basta «en directo» = cada 5 s?

Las demás coinciden con V-01, V-02, V-03, V-10 y V-21. Todas están en `PLAN_DE_CORRECCIONES.md` §B.
