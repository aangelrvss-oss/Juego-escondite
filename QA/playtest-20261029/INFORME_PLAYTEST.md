# THE OUTRUN · Preparación del primer playtest · 29/10/2026

## Veredicto: LISTO CON CONDICIONES

La partida es viable para un primer playtest entre amigos si se cumplen las condiciones del apartado 11. No queda ningún bloqueo conocido. Pero:
- la partida completa **no se ha jugado nunca en la calle con varios móviles**;
- el corte de red con modo avión sigue **sin probar**.

Este estado no significa que el juego esté terminado ni que se haya demostrado que es divertido.

---

## 1. Estado inicial del repositorio

- **Repositorio:** `C:\Users\aange\Projects\Juego-escondite-recuperacion`, rama `mapa-real` (HEAD `462016d`).
- **Cambios sin commit:** 41 entradas, todas conservadas. Al terminar hay 44: las 3 nuevas son `mobile/e2e/playtest-ui.e2e.mjs`, `mobile/test/result-and-ping.test.mjs` y `QA/playtest-20261029/`.
- **Respaldo previo:** `C:\Users\aange\Downloads\outrun-respaldo-20261029-000250-antes-playtest\`, con todos los archivos sin commit y el diff. No incluye `mapa.config.json`: la clave no se ha duplicado.
- **Sin cambios de rama, commits, push ni limpiezas.** La configuración de MapTiler y sus restricciones están intactas.

## 2. Agentes y responsabilidades

| Agente | Papel | Cómo trabajó |
|---|---|---|
| A · Reglas | Contrastar las mecánicas con DECISION_LOG, USER_FLOWS, GAME_STATE_MACHINE | Solo lectura |
| B + C · UX/UI y visual | Experiencia por rol, revisión de 9 capturas de la grabación del 28/10 y propuesta del Mission Report | Solo lectura. B y C en un único agente (el coste de dos lecturas del mismo código no compensaba) |
| D · QA, motor y multijugador | Ejecutó motor, servidor y cliente; sondeó el motor (`nextPingAt`, FINISHED); listó los contratos de los e2e | Solo lectura |
| E · Diseño del playtest | Protocolo de la sesión | Solo lectura |
| Coordinador | Consolidó, reprodujo, implementó (único editor de los archivos, sin ediciones simultáneas) y validó | — |
| Revisor independiente | Revisión del diff final sin ver mis conclusiones | Solo lectura. Encontró 1 P1, 3 P2 y 2 P3: **todos corregidos** (apartado 4) |

**Sin revisión independiente:** la dirección visual (C) no tuvo un agente separado de B. El revisor final revisó el código, no el aspecto.

## 3. Diagnóstico de UX/UI

Los tres problemas señalados por el usuario, comprobados en el código, contra las reglas y en el navegador:

| Problema | Diagnóstico | Evidencia |
|---|---|---|
| **El cazador no ve un temporizador ni información clara de las pistas** | **CONFIRMADO.** El servidor envía a todos cuándo llega la próxima pista (`nextPingAt`), y USER_FLOWS F8 pide «próxima pista en X» para los dos roles, pero la interfaz no lo mostraba. La tarjeta de la pista no decía su número ni cuándo llegó, ni aclaraba que es una posición pasada. Antes de la primera pista no había nada | `engine/src/view.ts:149`; `USER_FLOWS.md:77-78`; `app.js` antes de los cambios |
| **¿El fugitivo recibe aviso cuando su ubicación se revela?** | **Sí, pero débil.** El motor envía `ping_sent` solo a los fugitivos y el cliente mostraba un aviso de 4,5 s, sin vibración, que cualquier aviso posterior tapaba. Faltaba el aviso «Pista en 1 min» que pide USER_FLOWS F8 | `engine.ts:316`; `USER_FLOWS.md:84-85` |
| **La pantalla de resultados es pobre** | **CONFIRMADO.** Un bloque centrado con dos cifras. Repetía la misma cifra en «Persecución» y «Hasta la victoria», tenía texto con género («LUCÍA capturado»), un aviso flotaba encima de las cifras y no había resultado personal ni lista de participantes | Capturas 19/20 del 28/10 |

Otros hallazgos de UX:

| P | Hallazgo | Estado |
|---|---|---|
| P1 → descartado | **Toques perdidos por el redibujado cada 250 ms.** Reproducido con toques táctiles reales (CDP) en Chrome: con 120, 300 y 600 ms se registraron 8/8; con 30 ms, 7/8, y la causa no es el redibujado. «Sí, me ha pillado» mantenido 300 ms registró la captura. **No se confirma.** Aun así se añadió una protección barata (abajo) | Mitigado |
| P2 | La huida no decía qué pasa al llegar a 0:00. La carta del rol no decía cuánto dura la ventaja | Corregido |
| P2 | En la hoja de reclamación, a través del botón «No» se leía la acción de debajo, y el plazo iba en letra de 12 px | Corregido |
| P2 | La tarjeta de la pista quedaba al fondo de la pantalla | Corregido: ahora va justo bajo el mapa |
| P3 | Aviso genérico «Nueva pista de los fugitivos» | Corregido: «Nueva pista: posiciones de N fugitivos» |
| P3 | Etiquetas del mapa cortadas en el borde | Pendiente (P3) |
| P3 | Estilo `dataviz-v4-dark` muy apagado | Pendiente (decisión de configuración) |

## 4. Problemas funcionales

| P | Problema | Tipo | Estado |
|---|---|---|---|
| **P1** | **Una reclamación pendiente al terminar bloqueaba al cazador en la revancha.** Mostraba «Esperando a que X confirme (0:00)» toda la partida, sin botones de captura. El motor vacía las reclamaciones sin emitir el cierre | Lógica (cliente) | **Corregido:** el estado se olvida al cambiar de fase o de partida, y caduca 3 s después de su plazo. La prueba nueva comprueba que en la revancha se puede reclamar desde el principio |
| P2 | El aviso «Vuelve a la zona de salida» seguía visible en la persecución, y «Vuelve antes de 0:00» seguía tras ser capturado y en la revancha | Presentación | Corregido (`forgetStaleWarnings`) |
| P2 | La tarjeta de la pista y el mapa del cazador seguían mostrando a un fugitivo ya capturado hasta la pista siguiente | Presentación (el motor sigue enviándola) | Corregido en la interfaz. **El motor sigue enviándola:** pendiente (ver `QA/DECISIONES_PENDIENTES.md`) |
| P2 | Con 10 min de persecución y pistas cada 10 min no llega ninguna pista | Configuración | Corregido en la interfaz (no se ofrece). El motor lo sigue aceptando: pendiente |
| P3 | `runner_unexposed` no avisaba al cazador | Presentación | Corregido: «X ha vuelto a la zona: ya no se ve» |
| P3 | `ping_sent` llegaba también al fugitivo capturado (espectador) | Presentación | Corregido: el capturado ya no ve ese aviso |
| P3 | Tras recargar, el navegador no deja vibrar hasta el primer toque | Limitación del navegador | Documentado en el protocolo |

**Corregido tras la revisión independiente:**
- **P1, regresión mía:** con la caché de nombres, el Mission Report podía dejar de ser idéntico para todos cuando alguien salía. Ahora usa solo la instantánea oficial.
- **P2:** tras un comando rechazado, un desplegable podía quedarse mostrando un valor que el servidor no aceptó. Ahora se fuerza el redibujado.
- **P2:** se perdía el aviso de zona si coincidía con el paso a la huida.
- **P2:** el aviso de posición enviada podía anunciarse cada segundo a los lectores de pantalla. Ahora va a una región accesible fija y se anuncia una sola vez.
- **P3:** un texto con género, y el desplegable de pistas, que no mostraba un valor ya configurado.

**Decisiones que necesitan tu autorización** (no implementadas porque cambian reglas o el motor; detalle en `QA/DECISIONES_PENDIENTES.md`):
1. **La revancha repite los mismos equipos** (D-037 solo aprobó «sorteo nuevo» o «primeros capturados»). Por eso cada jugador sabe su rol antes de la cuenta atrás.
2. **Revelar los equipos de todos en el Mission Report:** hoy el motor los oculta también al final.
3. Guardar en el motor el nombre de cada captura, para que quien sale no aparezca como «Alguien».
4. Que el motor deje de enviar la pista de un capturado y que rechace un intervalo de pistas igual o mayor que la duración.

## 5. Mejoras visuales e interfaz (implementadas)

**Cabecera de la partida.** Bajo el reloj hay una línea según la fase y el rol:

| Fase y rol | Texto |
|---|---|
| Huida · cazador | «Al llegar a 0:00 sales a cazar» |
| Huida · fugitivo | «Al llegar a 0:00 empiezan a buscarte» |
| Persecución · cazador | «Próxima pista en 2:41», con una barra que se vacía |
| Persecución · fugitivo | «Los cazadores reciben tu posición en 2:41» |
| Persecución · sin más pistas | Lo dice expresamente |

En el último minuto la línea se pone en alerta: naranja para el cazador, rojo para el fugitivo.

**Fugitivo:**
- «Pista en 1 min: los cazadores recibirán tu posición. Muévete», una vez por pista, con vibración. No sale si al recargar ya faltaban menos de 50 s.
- Al llegar la pista a los cazadores: vibración y una franja roja fija de 30 s bajo el reloj, «Los cazadores acaban de recibir tu posición. Muévete.», anunciada una sola vez a los lectores de pantalla.

**Cazador:**
- Antes de la primera pista: «La primera pista llega sola cuando el contador de arriba llegue a 0:00».
- Después, la tarjeta «Pista nº N · llegó hace X», con la aclaración «Es dónde estaba cada fugitivo al enviarse la pista, no dónde está ahora». Va justo bajo el mapa.

**Avisos:**
- Cuando solo cabe uno se muestra el más importante (peligro, luego partida, luego informativo), no el último.
- Al terminar la partida se vacían.

**Hoja de reclamación:**
- Opaca, con el plazo en grande (48 px) y «Si no respondes a tiempo, no cuenta como captura».
- La acción de debajo no se dibuja mientras está abierta.

**Carta del rol:** «Corre: tienes 2 min de ventaja» y «Espera 2 min en la zona de salida mientras huyen», con la duración real de la sala.

**Redibujado:**
- No se reescribe la pantalla si nada ha cambiado.
- No se redibuja mientras un dedo toca la pantalla (se suelta 150 ms después de levantarlo, o a los 1,5 s).

**Mapa:** algo más bajo (`40vh` de alto, antes `46vh`) para dejar sitio a la línea nueva sin que la acción fija tape «Mi posición» ni «Ver zona». Comprobado en `map.e2e`.

**Sin cambiar:** las reglas, los tiempos, las distancias, la frecuencia y el contenido de las pistas, la visibilidad y la confirmación de captura. Todos los datos nuevos que se muestran ya los enviaba el servidor a ese jugador.

## 6. Mission Report provisional

**Qué ha mejorado:**
- **Cabecera de resultado:** franja y degradado del color del ganador (naranja para cazadores, cian para fugitivos), titular grande en cursiva de marca, «GANAN LOS CAZADORES», y la causa debajo. Es lo primero que se ve.
- **«Tu partida»,** aparte y encima del informe:
  - «Tu equipo gana» o «Tu equipo pierde»;
  - y el detalle: «Hiciste 2 capturas», «Te capturó Ana a los 4:12», «Seguías libre al final» o «Declaraste tu captura a los…».
  - Usa solo el equipo propio.
- **Cifras:** persecución y capturas. «Hasta la victoria» solo se muestra si no coincide con la duración; si coincide, se muestra «Primera captura».
- **Momentos:** los que ya calculaba el informe.
- **Cronología:** «4:12 · Captura de Caro por Ana», con «autodeclarada» si lo declaró el fugitivo. Texto neutro en género.
- **Jugadores:** cada participante con lo público («2 capturas», «Captura a los 4:12»). El propio va marcado sin cambiar el texto.
- **Acciones:** «Revancha» (anfitrión, botón grande), «Compartir resultado» y «Salir de la sala». A los demás: «Esperando a que el anfitrión proponga la revancha…».

**Qué datos muestra:** solo datos oficiales del servidor:
- ganador y causa;
- duración de la persecución;
- capturas con su minuto, autor y si fueron autodeclaradas;
- nombres;
- versión de reglas;
- número de partida.

El bloque del informe es **idéntico para todos los jugadores y tras recargar** (comprobado). Sin coordenadas.

**Qué no está disponible todavía (a propósito):**
- **Equipos de todos y fugitivos que escaparon:** el motor oculta el equipo rival también al final. Un fugitivo libre y un cazador sin capturas aparecen igual. Requiere la decisión «Equipos al final».
- **Nombre de quien sale de la sala:** aparece como «Alguien».
- **Número de pistas, recorridos, distancias, tiempo expuesto, MVP o puntuación:** no se registran, y no se han inventado.

**Qué evaluar con los jugadores:**
- ¿Se entiende al primer vistazo quién ganó y por qué?
- ¿Leen «Tu partida»?
- ¿Echan en falta ver los equipos o quién escapó?
- ¿La cronología cuenta la partida?
- ¿Pulsan «Revancha» o «Compartir» por sí solos?

## 7. Archivos modificados

| Archivo | Cambio |
|---|---|
| `mobile/www/js/app.js` | Interfaz: cabecera, pistas, avisos, hoja de reclamación, Mission Report, configuración y redibujado (+239/−40 respecto al respaldo) |
| `mobile/www/js/game-view.js` | Nuevas funciones puras: `pingCountdown`, `personalResult`, `reportParticipants`, `PING_WARNING_MS` |
| `mobile/www/css/game.css` | Estilos de lo anterior; mapa a `40vh` |
| `mobile/www/index.html` | Región accesible `#sr-live` |
| `mobile/test/result-and-ping.test.mjs` | **Nuevo:** 4 pruebas unitarias |
| `mobile/e2e/playtest-ui.e2e.mjs` | **Nuevo:** 11 comprobaciones en el navegador y las capturas de este informe |
| `mobile/e2e/web-flow.e2e.mjs`, `layout.e2e.mjs` | Ya **no cargan la `mapa.config.json` local** (antes enviaban la clave real a MapTiler desde puertos aleatorios y recibían 403) |
| `mobile/e2e/map.e2e.mjs` | Medida del zoom con la rueda: entre centros y tras estabilizarse, umbral 1,15× (antes 1,3×) y diagnóstico en el mensaje. **Motivo:** la línea base ya estaba en el límite (1,306×). Con la página más alta, un golpe de rueda acerca 1,25× en Chrome para Windows. `map-view.js` no ha cambiado |
| `QA/DECISIONES_PENDIENTES.md` | 5 decisiones nuevas. Estado de la clave de MapTiler actualizado |
| `QA/playtest-20261029/` | **Nuevo:** este informe, el protocolo, los registros y las capturas |

**Sin tocar:** el motor (`engine/`), el servidor (`server/`), `map-view.js` y `mapa.config.json`.

## 8. Pruebas ejecutadas (todas tras el último cambio)

| Prueba | Resultado | Registro |
|---|---|---|
| TypeScript (`tsc --noEmit`) | OK | `registros/01-tsc.txt` |
| Motor | 145/145 | `02-motor.txt` |
| Servidor | 75/75 | `03-servidor.txt` |
| Cliente | **115/115** (+4 nuevas) | `04-cliente.txt` |
| Partida de 5 navegadores (captura, corte de red, final, revancha, privacidad) | 8/8 | `05-…` |
| `web-flow` (Chrome; incluye maquetación del Mission Report a 360 px) | 41/41 | `06-…` |
| Maquetación a 360 px | 6/6 | `07-…` |
| Mapa (cartografía de prueba) | 29/29 | `08-…` |
| **Interfaz del playtest (nueva)** | **11/11** | `09-…` y `capturas/01…08` |
| **Mapa real de MapTiler** en tu servidor (`127.0.0.1:8787`), Chrome visible | Mapa real, sin radar; 11 peticiones con 200; atribución visible; partida terminada | `10-…`, `capturas/mapa-real/` |
| Reproducción de toques largos (CDP táctil) | 8/8 con 120, 300 y 600 ms; 7/8 con 30 ms; captura confirmada | Solo en la conversación (guion temporal) |
| Búsqueda de la clave en registros y capturas | Ninguna aparición | — |

**Qué cubre cada prueba:**
- **Simulado:** GPS emulado, reloj del servidor adelantado y todo en un ordenador. Tras cada salto de reloj se recarga la página para que el móvil se resincronice, como al volver a abrir la app. Por eso en las capturas hay cifras artificiales («Primera captura 0:00», «posición de hace 3 min»).
- **Validado de verdad:** solo el mapa real sobre MapTiler, y únicamente desde `localhost`.

## 9. Pruebas pendientes

- **Partida física completa** con 5–6 móviles y GPS real.
- **Modo avión y reconexión** en un móvil (F-17/F-18). Playwright no corta el WebSocket a `localhost`.
- **Mapa real desde el dominio del túnel.**
- **Vibración, pantalla bloqueada y lectores de pantalla** en móviles reales.
- **iPhone / Safari.**
- **Revancha jugada hasta el final con jugadores reales.** Automatizada sí: dos partidas seguidas en `playtest-ui`.

## 10. Limitaciones que hay que explicar a los participantes

1. **Pantalla encendida y la app abierta:** con la pantalla apagada, el navegador no envía la posición.
2. **Capturar necesita** GPS de ±30 m o mejor en los dos jugadores y lecturas recientes. Entre edificios puede fallar.
3. **Sin confirmación del fugitivo no hay captura** (D-035). «Me han pillado» es la alternativa.
4. **La pista es dónde estaba el fugitivo, no dónde está.**
5. **La revancha repite los equipos.** Para cambiar de rol, sala nueva o asignación a mano.
6. **No hay chat ni voz:** hace falta una llamada de grupo.
7. **Tras recargar, tocar la pantalla una vez** para que funcione la vibración.
8. **Es una prueba:** si algo falla, se apunta y se sigue.

## 11. Condiciones para jugar

- [ ] **Añadir la dirección del túnel a los orígenes permitidos de la clave de MapTiler** y comprobar el mapa desde un móvil con datos. Sin esto, se juega con el radar.
- [ ] Seguir `PROTOCOLO_PRIMER_PLAYTEST.md`:
  - zona peatonal de día y mayores de 18;
  - observador y palabra de parada;
  - configuración de 300 m, 3 min de huida, 15 min de persecución y pistas cada 2 min.
- [ ] Portátil enchufado y `.\server\iniciar-servidor.ps1 -SoloComprobar` en «Todo correcto».
- [ ] Aceptar las limitaciones del apartado 10.

## 12. Siguiente acción recomendada

1. **Decide** sobre la revancha (equipos) y sobre revelar los equipos al final. Son dos cambios pequeños en el motor que mejoran mucho el resumen; puedo hacerlos con sus pruebas en cuanto los autorices.
2. **Una partida corta de ensayo con dos móviles** por el túnel, antes de quedar con el grupo. Así se comprueban el origen de MapTiler, la vibración y la línea de la próxima pista en un móvil real.
3. **El playtest** con el protocolo. Después, revisar las notas y decidir D-035 y D-047.

## Reproducir

Desde `mobile/`:
- `npm test`
- `node e2e/playtest-ui.e2e.mjs <carpeta-capturas>`
- `node e2e/game.e2e.mjs`
- `node e2e/layout.e2e.mjs`
- `node e2e/map.e2e.mjs`
- `CHROME_PATH=… node e2e/web-flow.e2e.mjs`

Desde la raíz:
- `npm test`
- `npm run test:server`
