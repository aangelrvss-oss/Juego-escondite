# Plan de correcciones · validación de modos (30/10/2026)

> **Nada de esto se ha aplicado.** El código del repositorio está igual que al empezar el ciclo, y las correcciones esperan la autorización expresa del propietario.
>
> Ninguna corrección de la parte A cambia una regla aprobada. La parte B necesita una decisión, porque cualquier arreglo interpretaría o cambiaría una regla.

Las referencias V-xx remiten a `INFORME_AUDITORIA_MODOS.md` §6, donde están la evidencia y la reproducción.

## A. Correcciones técnicas (no cambian reglas)

Orden propuesto. Cada bloque toca archivos distintos, o se hace en serie si comparte archivos.

### A1 · Sala, conexión y servidor (P2)
| Corrección | Por qué es un error | Archivos | Prueba de regresión | Afecta a |
|---|---|---|---|---|
| **C1 · V-04.** Quien sale durante la cuenta atrás que se aborta deja la sala de verdad (`leftRoom=true`), o se le quita el número de partida. Así no figura en el informe siguiente ni queda invitado | Hoy aparece un participante fantasma, y en el zorro, un segundo «Zorro» | `engine/src/engine.ts` (`backToLobby`, `leave`) | Motor: salir en la cuenta atrás, volver a la sala, jugar y comprobar que el informe y la revancha no lo incluyen. Con el zorro y con 3–4 jugadores | Los tres modos |
| **C2 · V-05 a/b.** Volver a entrar con el mismo dispositivo cuando el jugador anterior está fuera (`left`) o invitado tras abandonar devuelve esa misma plaza con un secreto nuevo, en lugar de `already_joined`. **No cambia** el veto tras una expulsión | Tras «Abandonar» no se puede jugar la revancha, y un `welcome` perdido deja un fantasma | `engine/src/engine.ts` (`join`) y, si hace falta, `server/hub.ts` | Servidor: abandonar → revancha → volver a entrar → jugar; `welcome` perdido → reintento → una sola plaza | Los tres. **Riesgo:** `installId` lo envía el cliente; antes de aplicarlo se revisa que no permita suplantar a un jugador activo (solo plazas `left` o invitadas, nunca `active`) |
| **C3 · V-06.** No dejar empezar una partida si a la sala no le queda vida para la cuenta atrás, la huida, la duración y un margen (error claro en la interfaz) | Hoy la partida puede terminar `CANCELLED` sin informe | `engine.ts` (`start`), `game-view.js` (texto del error) | Motor: sala con 5 h 50 min y partida de 20 min → rechazo; con 5 h → empieza | Los tres |
| **C4 · V-07.** En `/api/loc`, validar primero la sesión. El contador de fallos por IP solo frena las sesiones inválidas | Errores ajenos bloquean la ubicación del grupo | `server/hub.ts` (`uploadLocation`) | Servidor: 20 fallos desde la misma IP y una sesión válida que sigue recibiendo 200 | Los tres |
| **C5 · V-16.** Descartar (rechazar) los comandos pendientes al perder la sesión | Un `leave` antiguo se aplica en la sala nueva | `mobile/www/js/net.js` | Cliente: `bad_session` con un comando pendiente → rechazado y no reenviado | Los tres |
| **C6 · V-17.** Anotar siempre la hora de la última señal y limitar solo la frecuencia con la que se avisa al motor | «Sin conexión» llega hasta 5 s antes de lo que dice D-057 | `server/hub.ts` (`seen`) | Servidor: pings reales cada 10 s, sin `keepAliveConnected`, nunca dan «sin conexión»; con 31 s de silencio, sí | Los tres |
| **C7 · V-18.** Validar que `cmd` sea un objeto | `TypeError` y cierre 1011 | `server/protocol.ts` | Servidor: `cmd:null` → `invalid_command` y la conexión sigue | — |
| **C8 · V-19.** Al quedar fuera por el periodo de gracia, quitar las coordenadas de sus eventos de pista guardados para reanudar | Recibe posiciones de la partida que ya no le corresponden | `server/hub.ts` | Servidor: fuera a los 5 min → reanuda → ninguna pista con coordenadas | Los tres |
| **C9 · V-22.** Que la reconexión (`connection`) no cuente como actividad para la caducidad de la sala de espera | La sala no caduca | `engine.ts` | Motor: sala inactiva con reconexiones → caduca | — |
| **C10 · V-25.** Causa determinista cuando todos quedan fuera a la vez (siempre la misma) | El texto del informe depende del orden de los identificadores | `engine.ts:226` | Motor: los dos órdenes → la misma causa | Los tres |

### A2 · Interfaz e informe (P2 y P3)
Se hacen en serie, porque comparten `app.js` y `game-view.js`.

| Corrección | Por qué es un error | Archivos | Prueba | Afecta a |
|---|---|---|---|---|
| **C11 · V-09.** Nombrar al zorro a los cazadores desde el fin de la cuenta atrás: tarjeta de rol («El zorro es X»), línea bajo el reloj y leyenda del mapa | La regla dice que todos saben quién es; hoy no se ve en la huida | `app.js` | e2e `zorro`: el cazador ve el nombre en la huida | Zorro |
| **C12 · V-08.** Informe de Infección con **todas** las infecciones, agrupadas por quién infectó («Ana → Beto, Caro · Beto → Dani»). Hay que corregir la aserción de `infeccion.e2e.mjs:174`, que da por buena una cadena incompleta: **es la prueba la que está mal**, no la regla | Hoy se pierden ramas de la cadena aprobada | `game-view.js` (`contagionChains`), `app.js`, `mobile/test`, `infeccion.e2e.mjs` | Unitaria: árbol con dos ramas → todas las infecciones; e2e de 4 jugadores | Infección. **El formato exacto es de producto:** si el propietario prefiere otro, se cambia solo la presentación |
| **C13 · V-11.** Al cambiar el propio equipo, o al recibir la salida de un jugador, vaciar o filtrar las posiciones locales hasta el siguiente envío | Se pintan fugitivos como «Tu equipo» hasta 5 s | `app.js` | Unitaria o e2e: tras la conversión, ninguna posición de fugitivo | Infección y zorro |
| **C14 · V-12.** Deducir la tarjeta «Te han infectado» de la instantánea (captura con `converted` sobre mí, aún no vista), no solo del evento | Se pierde al reconectar o recargar | `app.js`, `game-view.js` | Unitaria: evento antiguo y una instantánea con la conversión → tarjeta | Infección |
| **C15 · V-13.** Cerrar la tarjeta de conversión al terminar la partida | Tapa el informe | `app.js` | e2e de Infección: el último infectado ve el informe | Infección |
| **C16 · V-14.** Aviso «La cuenta atrás se ha cancelado: faltan jugadores…» al recibir `countdown_aborted` | Vuelta a la sala sin explicación | `app.js`, `game-view.js` | Unitaria o e2e | Zorro e Infección |
| **C17 · V-15.** «Tu partida» para quien quedó fuera a los 5 min: «Quedaste fuera de la partida por falta de conexión» | Contradice el informe | `game-view.js` (`personalResult`) | Unitaria | Los tres |
| **C18 · V-33.** Textos menores (lista en el informe, V-33) | P3 | `app.js`, `game-view.js`, `game.css` | Unitarias de textos; 360 px | Según el texto |
| **C19 · V-27 y V-28.** Higiene del motor: `canTagFrom` solo en fases de juego, y `runner_unexposed` al convertir a un expuesto | Restos en la sala; un marcador de «fuera de zona» que puede quedar colgado | `view.ts`, `engine.ts` | Motor | Infección |

### A3 · Pruebas y herramienta (P3)
- **C20 · V-34:**
  - una prueba de presencia del servidor con la cadencia real del cliente;
  - quitar las aserciones dentro de `if` en `simulacion.test.mjs`;
  - cambiar las esperas fijas por esperas a una condición;
  - convertir el script de escenarios de 10 jugadores (`reproducciones/coordinador/escenarios-10.mjs`) en prueba del repositorio, más lenta y separada.
- **C21 · V-35:** textos del registro del simulador (`runnerId`, «ganan los supervivientes»), y revancha en el simulador.

## B. Requieren decisión del propietario (no se tocan sin autorización)

| # | Asunto | Opciones (sin elegir) | Hallazgos |
|---|---|---|---|
| B1 | **Fugitivo sin lectura válida** (sin GPS, sin permiso o con precisión > 30 m), con la app viva. Es el **único P1** | a) Tras N s sin lectura válida, todos ven al fugitivo «sin señal GPS», y a los 5 min queda fuera, como la presencia. <br>b) Tras N s sin lectura válida, se le expone con su última posición. <br>c) Se acepta como está y se avisa en las reglas («la captura necesita GPS de los dos»). <br>¿Tope de precisión distinto para el zorro? | V-01 |
| B2 | **Sondeo con «Reclamar»** (§8.1: escáner limitado) | a) Un único texto de rechazo, sin distinguir cerca, lejos o GPS. <br>b) Límite de reclamaciones fallidas por cazador y objetivo. <br>c) Avisar al fugitivo de cada intento fallido. <br>d) Una combinación | V-02 |
| B3 | **¿Puede un jugador elegir su rol?** (§4.3 sigue abierta; §11.3 dice «sorteo o anfitrión») | a) Solo el anfitrión (se quita `set_team_pref` de los jugadores o se ignora en Infección y el zorro). <br>b) Se mantienen las preferencias, pero visibles para el anfitrión | V-03 |
| B4 | **El anfitrión que juega termina la partida sin ganador**; abandonar con una reclamación pendiente | a) Prohibir `end_game` al anfitrión fugitivo o zorro con una reclamación pendiente contra él. <br>b) «Terminar» pide la confirmación de otro jugador. <br>c) Se mantiene | V-10 |
| B5 | **Infección: ¿cazadores exactos también tras salidas en la cuenta atrás?** ¿Volver a la sala con menos de 4? | a) Recalcular el reparto al terminar la cuenta atrás. <br>b) Volver a la sala si deja de cuadrar. <br>c) Se mantiene y se documenta | V-20 |
| B6 | **«Sin conexión» y posición** (D-057 §1 frente a §3 y §11.1) | a) A quien está «sin conexión» no se le muestra posición en el directo ni en las pistas. <br>b) Se muestra marcada como antigua (lo actual) | V-21 |
| B7 | **Reclamaciones ignoradas o pendientes al final** (D-035, D3) | a) Contar las caducidades como rechazos para las marcas. <br>b) Que una reclamación válida pendiente al llegar el final cuente como captura. <br>c) Se mantiene | V-24, A4-1 C/D |
| B8 | **Zorro:** ¿1 contra 1 tras abandonos (D1)? ¿Gana el zorro si se van todos los cazadores (D2)? ¿Basta «en directo» = cada 5 s (D9)? | Las de `informes-agentes/agente4-informe.md` §3 | — |
| B9 | **Documentación:** «roles ocultos» = «no mostrados» (V-23); nombres de eventos de §3.2, §3.4 y AC-I frente a §11 (V-26) | Corregir el texto, o pedir que el código siga el borrador | V-23, V-26 |

## Dependencias
- **C1 y C2** tocan el mismo código (`leftRoom`, `join`, `rematch`): un solo cambio y una sola persona.
- **C11 a C18** comparten `app.js` y `game-view.js`: en serie.
- **B1 y B2** deciden el equilibrio del zorro. La prueba física del zorro solo valida que funciona, no su equilibrio, hasta que se decidan.
- **C12** cambia una aserción de una e2e existente. Se justifica porque esa aserción valida un resultado incompleto. Es el único cambio de prueba previsto que no añade cobertura.
- **C6** puede cambiar cuándo exacto aparece «sin conexión» en las pruebas existentes: se ajustan a D-057 (30 s), nunca al revés.

## Cómo se comprobará que no hay regresiones
Una suite cada vez, por la memoria:
1. `tsc`;
2. motor;
3. servidor;
4. cliente;
5. simulador;
6. demo;
7. los scripts de `reproducciones/` de cada hallazgo corregido, que ahora deben mostrar el comportamiento correcto;
8. el barrido de 10 jugadores en los tres modos con dos semillas;
9. las e2e afectadas (`zorro`, `infeccion`, `conexion`, `web-flow`, `inicio`), de una en una;
10. revisión adversarial final de cada corrección por un agente que no la haya escrito.
