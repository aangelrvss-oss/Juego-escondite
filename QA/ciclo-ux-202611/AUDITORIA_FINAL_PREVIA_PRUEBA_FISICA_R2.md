# THE OUTRUN · Auditoría final previa a pruebas físicas (segunda auditoría independiente) · `ciclo-ux-202611`

**Fecha:** 04/11/2026. **Rama:** `mapa-real`. **Base:** `7d8b5a9` más los cambios locales sin commit del ciclo.

**Por qué este archivo tiene sufijo `_R2`:** ya existía `AUDITORIA_FINAL_PREVIA_PRUEBA_FISICA.md`, de una auditoría anterior del mismo día (21:09). El encargo prohíbe sobrescribir informes anteriores. Este informe no parte de las conclusiones de aquel. Sus hallazgos se han obtenido de nuevo sobre el código, las pruebas y la ejecución, y al final (§11) se comparan con los suyos.

**Método:**
- Revisión propia del motor y escenarios de prueba nuevos.
- Ejecución de todas las suites y de las cinco E2E de la QA contra un servidor propio.
- Dos revisores independientes, uno de cliente (sala, guía y Mission Report) y otro de infraestructura. Recibieron el código y los informes que debían verificar, no mis conclusiones.
- Verificación propia en el código de los hallazgos clave de ambos revisores.

**Restricciones cumplidas:**
- Ningún archivo del proyecto modificado, salvo la creación de este informe.
- Sin commits, push, despliegues ni cambios de rama.
- No se ha tocado el servidor del 8787 (mismo PID, 24080, al inicio y al final), ni el túnel, ni Render.
- Huella SHA-1 de todos los archivos modificados y sin seguimiento: idéntica al principio y al final (`diff` vacío).

**Evidencias** (fuera del repositorio, en una carpeta temporal de la sesión):
`C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange-Projects-Juego-escondite-recuperacion\b097bc45-3893-4089-9589-67f05b936bcb\scratchpad\aud\`

| Contenido | Archivos |
|---|---|
| Suites | `suite-*.txt` |
| Huella del árbol de trabajo | `huella-inicio.txt`, `huella-fin.txt` |
| Escenarios del motor | `auditoria-motor.test.ts` |
| E2E (copias de los scripts de la QA con las rutas apuntadas a esta carpeta, para no sobrescribir las capturas del repositorio) | `e2e\`, salidas `e2e\out-*.txt` |
| Revisor de cliente | `ui\probe.test.mjs` |
| Revisor de infraestructura | `infra\bench.ts` |

---

## 1. Estado real de Git

| Comprobación | Resultado |
|---|---|
| Rama | `mapa-real` |
| Último commit local | `7d8b5a9` · feat(pwa): identidad instalable con el símbolo oficial de THE OUTRUN |
| Último commit remoto | `git ls-remote origin mapa-real` → `7d8b5a9…`. 0 por delante, 0 por detrás |
| Staged | Nada |
| Modificados, sin preparar (10) | `BACKLOG.md`, `DECISION_LOG.md`, `PROJECT_STATE.md`, `engine/src/engine.ts`, `engine/src/types.ts`, `engine/test/briefing-lock.test.ts`, `mobile/www/css/game.css`, `mobile/www/index.html`, `mobile/www/js/app.js`, `mobile/www/js/game-view.js`. En total, 832 inserciones y 144 borrados |
| Sin seguimiento: producto | `mobile/www/js/{guide,report-view,stats}.js`, `mobile/www/css/{guide,report}.css`, `mobile/www/guia/` |
| Sin seguimiento: tests | `engine/test/{preparacion,qa-preparacion-deriva}.test.ts`, `mobile/test/{guide,report-view,sala-preparacion,stats}.test.mjs` |
| Sin seguimiento: evidencias | `QA/ciclo-ux-202611/`, `QA/produccion-20261104/capturas-pwa/inicio-local-con-pwa.png` |
| Sin cambios | `server/`, `net.js`, `location*.js`, `map-view.js`, `engine/src/{modes,constants,zone,validate,view,geo}.ts`, `render.yaml` |
| ¿Trabajo anterior sobrescrito? | No se ve indicio. El diff del motor se limita al caso `configure` y al campo `readyBase`. El revisor de cliente no encontró acciones ni exportaciones desaparecidas |
| ¿Cambios solo en local? | **Sí.** El remoto sigue intacto en `7d8b5a9` |

**Atención (AF-05):** el `app.js` con seguimiento importa módulos que no tienen seguimiento (`guide.js`, `report-view.js`, `stats.js`, y `index.html` enlaza `guide.css` y `report.css`). Render despliega automáticamente cada push a `mapa-real` (`docs/DEPLOYMENT.md:72`). Un commit parcial rompería la carga de la app en producción.

## 2. Resumen ejecutivo

- **Motor:** el cambio está acotado a la política de «listo» (D-058).
  - Roles, capturas, distancias, zona dinámica, condiciones de victoria, modos, reconexión y protocolo WebSocket no se han tocado: `server/` y `net.js` no tienen diff, y las 299 pruebas del motor y la simulación pasan.
  - `start()` sigue exigiendo configuración, seguridad confirmada, mínimos por modo y a todos listos y conectados.
- **QA-01 (deriva de la zona): corregido en lo esencial, pero no del todo.**
  - Una serie de recentrados pequeños ya no puede alejar la zona sin límite: en cuanto la distancia acumulada llega a 50 m, se quita el «listo».
  - La referencia es una sola para toda la sala, no por jugador. Quien pulsa «Estoy listo» a mitad de una deriva puede empezar con la zona a **98 m** de la que aceptó (AF-01, reproducido).
  - El cliente, además, no explica esa invalidación acumulada (AF-02).
- **Sala, guía y Mission Report:** las E2E ejecutadas en emulación pasan en lo funcional.
  - Sala: 28 de 29 comprobaciones; la que falla es ruido de consola del corte de red provocado a propósito.
  - Guía: 52 de 52. Infección: 9 de 9. Partidas P1–P3: todas las comprobaciones.
  - Quedan defectos medios de experiencia, ninguno bloqueante: imágenes de la guía desactualizadas, la guía tapa la revelación de rol, la revancha borra el informe a todos a la vez y «atrás» sale de la app.
- **Infraestructura:** las cifras de carga del ciclo son locales y coinciden con un benchmark independiente.
  - **No hay ninguna medida de capacidad en Render.**
  - El riesgo operativo mayor de la prueba física no está en el código del ciclo: Render Free sin disco ni `STATE_FILE`, con autodespliegue. Un push, un reinicio o una suspensión durante la prueba borra todas las salas (AF-04).
- **Reconexión:** solo está demostrado el corte de 45 s emulado, con la página en primer plano.
  - En la sala, A16 pasó 2 de 2 en esta auditoría, pero la QA había registrado fallos.
  - Sin demostrar: móvil bloqueado o en segundo plano, iOS Safari y cambio real de red.
- **Veredicto: B · APTO CON RESERVAS** (§10).

## 3. Cambios auditados

| Área | Archivos | Conclusión |
|---|---|---|
| Política de «listo» (D-058) | `engine.ts:54-78` (`MATERIAL_MOVE_M`, `isMaterialChange`), `engine.ts:706-723` (`configure`), `types.ts:173-176` (`readyBase`) | Correcta salvo AF-01 y AF-03 |
| Sala guiada (D-059) | `app.js` (autocentrado `maybeAutoCenter`, hoja «Antes de empezar» `startGame` `:1435-1478`), `game-view.js` (`startBlockers`, `readyProgress`, `readyResetNotice`…), `game.css` | Funciona; AF-02, AF-12, AF-13, AF-14 |
| Guía (D-060) | `guide.js`, `guide.css`, `guia/*.webp` (16), `app.js`, `index.html` | Funciona; AF-09, AF-10, AF-15, AF-16 |
| Mission Report e historial (D-061) | `report-view.js`, `stats.js`, `report.css`, `game-view.js` | Correcto en los escenarios probados; AF-11, AF-17, AF-19 |
| Documentación | `BACKLOG.md`, `DECISION_LOG.md` (D-058 a D-061), `PROJECT_STATE.md` | Coherente con el código |

## 4. Resultados por área

### 4.1 Motor y preparación

`isMaterialChange` se compara con `s.readyBase ?? s.config`. `readyBase` solo se actualiza cuando hay un cambio material, y entonces se quita el «listo» a todos menos al actor (`engine.ts:715-720`).

Escenarios propios (`auditoria-motor.test.ts`, **13 de 13 pasan**; los resultados son salidas reales del test):

| Escenario | Resultado observado |
|---|---|
| E1 · 10 recentrados de 10 m | Se quita el «listo» en el paso 5 (50 m acumulados). **La deriva ilimitada de QA-01 ya no existe** |
| E2 · B se marca listo con la zona a +49 m; luego el anfitrión la lleva a −49 m | **B sigue listo con la zona a 98,0 m de la que aceptó, y `start` se acepta** (AF-01) |
| E3 · Punto de encuentro a 49 m y luego a 51 m | 49 m conserva el «listo»; 51 m lo quita (referencia común, no la anterior) |
| E4 · Estado sin `readyBase` (guardado antes del cambio) y 10 pasos de 45 m (450 m) | **Sigue listo**: sin base, cada paso se compara con el anterior (AF-03) |
| E5 · Radio +1 m, persecución +1 ms, huida, pistas, modo, zona dinámica | Todos materiales: los demás pierden el «listo» y el anfitrión lo conserva |
| E6 · Lista de seguridad desmarcada | Nadie pierde el «listo»; `start` → `safety_not_confirmed` |
| E7 · Jugador desconectado | Conserva el «listo»; `start` → `players_not_ready`. Al reconectar, `start` se acepta |
| E8 · Entra un jugador nuevo | Los demás siguen listos; `start` bloqueado hasta que el nuevo esté listo |
| E9 · Sale el anfitrión | El nuevo anfitrión cambia las reglas y conserva su «listo»; los demás lo pierden |
| E10 · Revancha | `readyBase` no se reinicia (en la revancha todos pierden el «listo» de todos modos) |
| E11 · `configure` de alguien que no es anfitrión | Rechazado, sin efecto |
| E12 · Inmutabilidad | `applyCommand` no muta el estado de entrada |

Comportamiento revisado en el código:
- **Salidas:** la salida de un jugador y la reclamación de plaza quitan su propio «listo» (`engine.ts:871`, `:1027`).
- **Fases:** la vuelta a la sala, el comienzo y la revancha ponen `ready=false` (`:484`, `:911`, `:1094`).
- **Desconexión:** no toca el «listo», pero `start` exige `connected` (`:898`).
- **Lista de seguridad:** no es un cambio material. El motor sigue exigiéndola en `start` (`:888`).

**Integridad de las reglas:** sin diff en `modes.ts`, `zone.ts`, `constants.ts`, `validate.ts`, `view.ts`, `server/` ni `net.js`. El único cambio de test previo, `briefing-lock.test.ts`, se ajusta a la política nueva (el anfitrión conserva su «listo») y está justificado por D-058.

### 4.2 Sala

Verificado en el código (revisor de cliente) y en la E2E propia `e2e-sala`:
- Crear sala, autocentrado sin pulsar nada (A2) y unirse por código y por enlace (A3, A4).
- Nombre con HTML escapado (A5), QR (A6) y compartir con `?sala=` (A8).
- QR, compartir y recentrar 20 m no quitan el «listo» (A9).
- Empezar con alguien no listo da un error en la hoja (A11).
- Un cambio de radio quita el «listo» a los demás y no al anfitrión (A13, A14), y el jugador ve qué cambió (A15, A21).
- Desconexión y vuelta, cerrar y reabrir la pestaña, segundo plano emulado y recarga del anfitrión (A16 a A19).
- Infección con 3 jugadores bloquea el inicio y explica el mínimo de 4 (A20).
- La hoja de inicio arranca la partida, también con doble toque (A22).
- Sin desbordamiento a 320, 360 y 412 px y sin objetivos táctiles de menos de 44 px.

Fallos de la E2E y su análisis:
- **A12** («al editar con jugadores listos, aviso de que perderán el listo») falla en el script original, como en la QA.
  - Lo repetí con una espera de 5 s antes de comprobarlo (`e2e-sala-a12.mjs`) y **pasa**: es una carrera del script, no un defecto.
  - El aviso existe en `app.js:1009`.
- **D3 (p3):** errores de consola `ERR_INTERNET_DISCONNECTED`, provocados por el propio test al cortar la red. Es ruido del test, no un defecto.
- **A16** (corte de 45 s en la sala): pasó en mis dos ejecuciones. La QA lo había visto fallar (`qa/registros*/e2e-sala.log`), así que es **intermitente en emulación**. No queda demostrado ni descartado.

El cliente no puede saltarse la seguridad: el motor es la autoridad (`start` en `engine.ts:883-898`). Los defectos de cliente (AF-12, AF-13, AF-14) degradan la experiencia, no la seguridad del motor.

### 4.3 Guía

- **Estructura:** 12 pasos en cada modo y 16 imágenes distintas, todas presentes en disco. Las 52 comprobaciones de `e2e-guia` pasan (todos los pasos, imágenes cargadas, cierre con ✕, «Entendido» y Escape, foco y 320×568).
- **Apertura y cierre:** se abre desde la sala (B1) y desde la partida (B4). No se abre sola en la primera visita (A0). Al cerrarla, la sala sigue conectada (B2) y el foco vuelve al botón (B3). Una reclamación de captura cierra la guía (B5).
- **Textos de los modos:** coinciden con `modes.ts` (Infección: mínimo 4, un cazador por cada 4 y 60 s hasta que el infectado puede capturar; Zorro: mínimo 3 y n−1 cazadores).
- **Defectos:** imágenes antiguas (AF-09), la guía tapa la revelación de rol (AF-10), «atrás» (AF-15) y safe areas sin verificar (AF-16).

### 4.4 Mission Report y estadísticas

Pasan todas las comprobaciones de `e2e-partidas` P1–P3:
- **Final por el anfitrión:** «Sin ganador» y su causa.
- **Todos capturados:** dos capturas, captura decisiva e historial de cada jugador correcto (Beto: 2 partidas, 1 victoria, 2 capturas; Caro: 1 derrota, capturada 1 vez).
- **Caza del zorro:** «Zorro atrapado».
- **Común a los tres:** el informe es idéntico en todos los móviles y se reconstruye igual tras recargar. El historial no se duplica tras recargar. Ni el informe ni el texto de compartir contienen coordenadas, código de sala ni URL.
- **Infección con abandono del único cazador:** 9 de 9 comprobaciones en `e2e-infeccion`.

**P4 de `e2e-partidas`** (Infección en la revancha, abandona el cazador) se corta por tiempo («todos en FINISHED»), igual que en la QA. El mismo escenario pasa en `e2e-infeccion`, y por eso lo clasifico como **no reproducido como defecto de producto, sin causa raíz determinada**. Hay que observarlo en la prueba física (P-7).

Revisión de código (revisor de cliente):
- Las capturas se atribuyen por `hunterId`.
- Quien abandona tiene supervivencia `null` y resultado «otro».
- La clave del historial es un hash de `roomId`, `gameNo` y `finishedAt`, así que no mezcla partidas ni salas.
- Todo acceso a `localStorage` va en try/catch.
- Defectos: AF-11, AF-17 y AF-19.

### 4.5 Infraestructura y Render

Todas las cifras de esta tabla son **locales** (este portátil, una sola ejecución, servidor y generador en la misma máquina). Benchmark independiente del revisor: un `Hub` en proceso, 1 posición por segundo y jugador y 60 s en ACTIVE.

| Jugadores | Estado de la sala en memoria | `structuredClone` | CPU/s | p95 |
|---|---|---|---|---|
| 10 | 205 KB | 1,53 ms | 41 ms (4,1 % de un núcleo local) | 69 ms |
| 20 | 408 KB | 3,21 ms | 153 ms (15,4 %) | 253 ms |

- **Crecimiento cuadrático:** de 10 a 20 jugadores el coste se multiplica por 3,7. El 96 % del estado es el historial `samples`. Hay dos clones completos por comando (`engine.ts`, en `applyCommand`) y una posición cada ~1 s por jugador (`app.js:482-487`; el servidor acepta una cada 900 ms, `hub.ts:94`).
- **Clasificación de las afirmaciones:**
  - Medido en local: la tabla de CPU, RSS (≤ 267 MB) y latencia.
  - Medido en producción: solo el arranque en frío de 22,4 s de un registro anterior (no vuelto a medir).
  - Estimaciones: «una sala de 10–15 en Free» y «una de 20 supera la cuota». Suponen que 0,1 CPU equivale al 10 % de un núcleo de este portátil.
  - Hipótesis: la reescritura de XFF y CF-Connecting-IP por el proxy de Render, y la suspensión a mitad de partida.
- **`STATE_FILE`:** se guarda cada 2 s si hay cambios, con un archivo temporal y `rename`, y al recibir SIGTERM (`main.ts:72-85`, `:189`). Al restaurar se pierden `samples`, `lastPing`, la cola de eventos, los límites por IP y hasta 2 s de cambios. **En Render no se usa:** `render.yaml` no define `STATE_FILE` ni disco, y el plan es `free`. Un reinicio, un push o una suspensión pierde todas las salas (AF-04).
- **Salas simultáneas:** comparten un hilo y su coste se suma. En local, 25 salas de 10 llevan el p50 del ping a 353 ms.
- **Conclusión:** **no se puede afirmar ninguna capacidad de jugadores en Render** con estas pruebas.

## 5. Pruebas ejecutadas y resultados exactos

Entorno: Node v24.12.0 y Windows 11. Todas se ejecutaron en esta auditoría.

| Suite o prueba | Comando | Resultado |
|---|---|---|
| Motor + simulación | `npm test` | **299/299** pasan, 0 todo (38 s). `qa-preparacion-deriva` ya no está marcado `todo` |
| TypeScript | `npm run typecheck` | exit 0, sin errores |
| Servidor | `npm run test:server` | **136/136** (17 s) |
| Cliente | `npm test --prefix mobile` y `node --test mobile/test/*.test.mjs` | **208/208** (la QA anterior registró 207; la diferencia es el test añadido después) |
| Demo | `npm run test:demo` | **62/62** |
| Panel | `npm run test:sim-panel` | **15/15** (90 s) |
| Escenarios completos | `npm run test:sim-escenarios` | **3/3** (71 s) |
| Escenarios propios del motor | `node --test auditoria-motor.test.ts` | **13/13**; resultados en §4.1 |
| Sondas del revisor de cliente | `probe.test.mjs` | 6/6 (confirman AF-02 y AF-17) |
| E2E sala | `e2e-sala.mjs` contra 127.0.0.1:8851 | 27 PASA, 2 FALLA (A12 por carrera del script, D3 p3 por ruido del corte de red) |
| E2E sala con espera en A12 | `e2e-sala-a12.mjs` | 28 PASA, 1 FALLA (D3 p3, ruido); **A12 y A16 pasan** |
| E2E partidas | `e2e-partidas.mjs` | 34 PASA; P1–P3 completas. FALLA: excepción en P4 (tiempo agotado, como en la QA) y D3 host/beto/caro (403 de MapTiler en 127.0.0.1 y `navigator.vibrate` bloqueado sin gesto: entorno, no producto) |
| E2E Infección | `e2e-infeccion.mjs` | **9/9** |
| E2E guía | `e2e-guia.mjs` | **52/52** |

No ejecutado:
- `e2e-tiempo` (necesita el reloj acelerado).
- Las sondas `sonda-*`.
- Ninguna prueba contra producción ni contra el 8787.
- Ninguna prueba en un dispositivo real.

## 6. Tabla de defectos

Severidad: A = alta, M = media, B = baja.

| ID | Descripción | Sev. | Evidencia | Impacto | Bloquea pruebas físicas | Bloquea publicación |
|---|---|---|---|---|---|---|
| AF-04 | Render Free sin disco ni `STATE_FILE`, con autodespliegue de `mapa-real`. Un push, un reinicio o una suspensión borra todas las salas en curso | A (operativo) | `render.yaml` (`plan: free`, sin `STATE_FILE`); `docs/DEPLOYMENT.md:72` | Partida perdida para todos a mitad de prueba | **Sí, si no se controla** (congelar los push o desactivar el autodespliegue durante la prueba) | Sí |
| AF-05 | `app.js` y `index.html` (con seguimiento) dependen de 5 módulos y CSS sin seguimiento y de `guia/`. Un commit parcial rompe la app al cargar, y se despliega solo | M (proceso) | `app.js:11-13`, `index.html:17-18`, `git status` | App rota en producción | No (si se sube todo junto o se prueba en local) | Sí |
| AF-01 | La referencia de la deriva es común a toda la sala. Quien se marca listo a mitad de una deriva puede empezar con la zona a < 100 m de la que aceptó | M | E2 (98,0 m, `start` aceptado); `engine.ts:715-717` | Zona o punto de encuentro desplazado hasta ~1 manzana sin reconfirmar | No | No (recomendado antes) |
| AF-07 | Bloqueo por IP: 20 fallos por minuto en `rate_limited`, que bloquea también las reanudaciones válidas y crear sala | M | `hub.ts:391,400,436,507,656`; `infra/registros/09-limites.txt` | Grupo en la misma Wi-Fi bloqueado ~1 min tras un reinicio | No | Sí |
| AF-08 | `command()` sin timeout; un `{t:'error'}` sin `id` nunca resuelve el comando pendiente. La hoja «Antes de empezar» y «Salir» pueden quedarse esperando | M | `net.js:441-449`, `:406-418`; `app.js:1450`, `:1716` | Botones bloqueados hasta reconectar | No | Sí |
| AF-06 | Dos `structuredClone` completos de la sala por comando, con coste cuadrático | M | `engine.ts` (`applyCommand`); benchmark §4.5 | Con 15–20 jugadores o varias salas, riesgo en 0,1 CPU (estimación) | No (3–10 móviles) | Sí, si se aspira a salas de 15–20 |
| AF-09 | Imágenes de la guía desactualizadas (`sala-codigo.webp`, `final.webp` y otras anteriores al último cambio de interfaz) | M | `imagenes.json` (fuentes de un ciclo anterior); fechas de los archivos (imágenes 18:12, interfaz 19:09) | La guía enseña pantallas distintas de las reales | No | Sí (D-060 promete capturas reales) |
| AF-10 | La guía (z-index 30) tapa la revelación de rol (overlay 10), los avisos (20) y la tarjeta de conversión, y sigue abierta durante la cuenta atrás | M | `guide.css:5`, `game.css:247,274`; `app.js:223,333` | Un jugador puede perderse su rol (se cierra a los 5 s) | No (avisar en la prueba) | No (recomendado) |
| AF-11 | La revancha (un toque, sin confirmar) borra el informe en todos los móviles a la vez | M | `app.js:1699-1700`; `engine.ts:1062-1073` | No se puede consultar ni compartir el informe anterior | No | No |
| AF-18 | Reconexión no demostrada con el móvil bloqueado o en segundo plano, en iOS, con cambio de red real ni con sockets medio abiertos; A16 intermitente en emulación | M (riesgo) | §8; `server/test/reconexion-ciclo.test.mjs` (reloj virtual, cierres limpios) | Jugadores «sin conexión» o fuera de la partida a los 5 min | No: es objeto de la prueba | Sí, validar |
| AF-02 | El aviso del cliente compara instantáneas consecutivas, no `readyBase`. Tras dos recentrados de 45 m el jugador pierde el «listo» sin explicación, y la ayuda al anfitrión («recentrar < 50 m no obliga…») es inexacta | B | `game-view.js:935-962`; sonda del revisor | Confusión | No | No |
| AF-03 | Un estado restaurado sin `readyBase` vuelve a permitir una deriva ilimitada | B | E4; `engine.ts:715` | Solo con `STATE_FILE` de una versión anterior; en Render no hay `STATE_FILE` | No | No |
| AF-12 | El GPS del anfitrión no se vuelve a comprobar al empezar si el autocentrado ya lo marcó como comprobado (contradice el texto y D-059) | B | `app.js:586`, `:1461` | Lectura del anfitrión que puede tener minutos | No | No |
| AF-13 | La reconfirmación de seguridad en cada partida depende solo del cliente: `safetyChecklistConfirmed` se conserva en la revancha | B | `app.js:1454`; motor sin reinicio de la bandera | Si el cliente falla, se omite la reconfirmación (el motor exige la bandera, no la reconfirmación) | No | No |
| AF-14 | La hoja «Antes de empezar» no refleja los bloqueos que aparecen con ella abierta | B | `app.js:1416` | El error llega al pulsar | No | No |
| AF-15 | No se gestiona «atrás» (sin `popstate` ni `backButton`): con la guía o una hoja abierta se sale de la página o la app | B | `app.js:93` (única llamada a la historia) | Hay que volver a entrar (la sesión se recupera) | No | No |
| AF-16 | Safe areas: `.start-sheet` con relleno superior fijo; la guía usa `env()` sin la reserva `--safe-area-inset-*` | B (sospecha) | `game.css:420`, `guide.css:7` | Contenido bajo la muesca o la barra de estado | No | No |
| AF-17 | Las estadísticas no deduplican capturas repetidas | B (defensivo) | Sonda: 1 captura duplicada → 2 | El motor no genera duplicados | No | No |
| AF-19 | El texto de compartir incluye los apodos de los jugadores (no incluye coordenadas, código de sala ni URL) | B (privacidad) | `e2e-partidas` C P1–P2; revisor de cliente | Revela apodos al compartir fuera del grupo | No | Decisión de producto |
| T-01 | `e2e-sala` A12 falla por una carrera del script | Test | Pasa con una espera de 5 s (`e2e-sala-a12.mjs`) | Ninguno en producto | No | No |
| T-02 | `e2e-partidas` P4 agota el tiempo; el mismo escenario pasa en `e2e-infeccion` | Test o sin determinar | `e2e\out-partidas.txt` línea 86 | Sin causa raíz; observar | No | No (investigar) |

## 7. Riesgos pendientes

1. **Pérdida de salas en Render (AF-04).** Es el riesgo más probable de estropear la prueba. Control: nadie hace push a `mapa-real` durante la prueba, o se desactiva el autodespliegue. Abrir la URL un par de minutos antes (arranque en frío de ~22 s; suspensión a los 15 min de inactividad).
2. **Para probar en Render hay que desplegar** los cambios locales: commit completo (AF-05) y push, con el despliegue automático consiguiente. Esta auditoría no lo hace. La alternativa sin desplegar es el servidor local y el túnel existentes (8787), que esta auditoría no ha tocado ni verificado.
3. **Reconexión real (AF-18):** pantalla bloqueada, segundo plano, iOS, y paso de datos a Wi-Fi.
4. **Bloqueo por IP (AF-07)** si se reinicia el servidor con todos en la misma Wi-Fi y alguien escribe mal códigos.
5. **Comandos colgados (AF-08)** con mala cobertura.
6. **Sin caché controlada:** no hay service worker ni cabeceras `Cache-Control` en `server/main.ts`. Riesgo hipotético (no verificado) de que un móvil mezcle un `app.js` antiguo con módulos nuevos tras un despliegue. Control: recarga completa antes de empezar.

## 8. Limitaciones de la auditoría

- Todo el cliente se probó en **Chrome headless de escritorio** emulando un móvil (Playwright, geolocalización emulada). **Eso no demuestra que funcione en móviles reales.** Ni GPS real, ni Safari iOS, ni Android nativo (Capacitor).
- **Servidor local**, no Render. Ninguna medida de producción nueva.
- El corte de 45 s es `context.setOffline` y la página en primer plano. No se probó con el móvil bloqueado ni en segundo plano real.
- MapTiler responde 403 en 127.0.0.1, así que el mapa cae al radar de reserva y no se ha visto el mapa real.
- `e2e-tiempo` y las sondas no se ejecutaron. El final por tiempo agotado se apoya en las pruebas del motor y del servidor y en la QA anterior.
- Los revisores trabajaron sobre el código. Sus hallazgos clave (z-index, `gpsChecked`, `command()` sin timeout, revancha, imports sin seguimiento, ausencia de `STATE_FILE`) los he verificado en el código. Las sondas de cada revisor no las he vuelto a ejecutar.
- Las imágenes de la guía se compararon con la interfaz por fecha, fuentes y marcado, no píxel a píxel.

## 9. Protocolo de prueba física (3–10 móviles)

**Antes:**
- P-0. Decidir dónde se prueba: Render (requiere un commit completo y un push autorizados expresamente) o servidor local con túnel. Durante la prueba, **nadie hace push a `mapa-real`**.
- P-1. Al menos un Android (Chrome) y un iPhone (Safari), con la batería cargada y la ubicación precisa activada. Abrir la URL 2 min antes y recargar a fondo.
- P-2. Una persona apunta la hora, el móvil y lo que ve en pantalla en cada incidencia. Hacer captura si es posible.

**Sala:**
- P-3. El anfitrión crea la sala en el exterior y comprueba que la zona se centra sola y en el sitio correcto.
- P-4. Invitar por enlace, por QR y por código. Comprobar que entran todos y que los nombres son correctos.
- P-5. Cada jugador pulsa «Estoy listo» y acepta el permiso de GPS.
  - Comprobar la barra de progreso.
  - Recentrar menos de 50 m: nadie pierde el «listo».
  - Cambiar el radio: todos menos el anfitrión lo pierden y ven qué cambió.
  - Probar AF-01: alguien se marca listo y el anfitrión recentra 45 m en sentido contrario. Anotar si alguien lo nota.
- P-6. Hoja «Antes de empezar»: la casilla de seguridad, el resumen y los bloqueos. Intentarlo con un jugador sin «listo» y con uno sin conexión (modo avión).
- P-6b. Infección con menos de 4 jugadores: tiene que bloquearse y explicarse.

**Partida (los tres modos, al menos una partida corta de cada):**
- P-7. Clásico 10 min, Infección (con 4 o más) y Caza del zorro (con 3 o más). En una de ellas, abandona el cazador (observa T-02).
- P-8. Revelación de rol: un jugador tiene la guía abierta al empezar la cuenta atrás (AF-10). ¿Ve su rol?
- P-9. Capturas reales: distancia, confirmación y atribución en el informe.
- P-10. Reconexión:
  - Un jugador pone el modo avión 45 s y vuelve.
  - Otro bloquea la pantalla 2 min.
  - Otro cambia de datos a Wi-Fi.
  - Uno en iPhone deja Safari en segundo plano 1 min.
  - Anotar cuánto tarda en volver y si alguien queda «sin conexión» o fuera.
  - Hacer lo mismo una vez en la sala.
- P-11. «Atrás» de Android con la guía abierta (AF-15). Muesca o barra de estado en iPhone con la hoja de inicio y la guía abiertas (AF-16).

**Final:**
- P-12. Mission Report en todos los móviles: ganador, causa, duración, capturas por jugador, supervivencia, captura decisiva y cronología. Comparar entre móviles.
- P-13. Compartir: revisar el texto (sin ubicaciones; con apodos, AF-19).
- P-14. Recargar el informe: tiene que reconstruirse y el historial no debe duplicarse.
- P-15. Revancha: comprobar que el informe anterior desaparece para todos (AF-11) y que el historial suma bien en partidas sucesivas.
- P-16. Final por el anfitrión, por tiempo agotado y por todos capturados.

**Por dispositivo:**
- Comprobar en cada uno: legibilidad a pleno sol, botones de al menos 44 px utilizables con una mano, scroll, orientación vertical y horizontal, la PWA instalada frente al navegador, el consumo de batería en 20 min y el comportamiento con el GPS desactivado.

## 10. Recomendación final

Los cambios del ciclo están acotados y son coherentes:
- El motor solo cambia la política de «listo».
- Las reglas, el protocolo y la reconexión no se han tocado.
- Todas las suites automatizadas pasan.
- Las E2E en emulación cubren la sala, la guía, los tres modos y el Mission Report.

Ningún defecto del código del ciclo hace desaconsejable una prueba con 3–10 móviles.

El veredicto no es A porque:
- QA-01 está corregido solo en parte (AF-01).
- La reconexión real sigue sin demostrarse (AF-18).
- La infraestructura de la prueba (AF-04 y AF-05) puede arruinar la sesión si no se controla.

Antes de publicar deben resolverse AF-04, AF-05, AF-07, AF-08 y AF-09, AF-06 si se quieren salas de 15–20, y validarse AF-18.

### VEREDICTO: **B. APTO CON RESERVAS**

Se puede pasar a pruebas físicas con varios móviles, con estos controles:
1. Congelar los push o el autodespliegue de `mapa-real` durante la prueba.
2. Si se despliega, subir todos los archivos del ciclo juntos, con autorización expresa.
3. Seguir el protocolo §9, con atención a la reconexión, la guía durante la revelación de rol y la deriva de la zona.

## 11. Comparación con la auditoría anterior (`AUDITORIA_FINAL_PREVIA_PRUEBA_FISICA.md`)

- **Coincidencias:** llega al mismo veredicto (B) y sus hallazgos principales coinciden con los de esta: deriva común (su AUD-01 midió 98,9 m; aquí, 98,0 m), aviso del cliente, revancha, guía sobre los avisos, «atrás», imágenes antiguas, nombres al compartir y los tres defectos técnicos.
- **Lo que añade esta:**
  - AF-03 (estado sin `readyBase`).
  - AF-04 explícito como riesgo operativo principal, por el autodespliegue de `mapa-real` sin disco.
  - AF-05 (dependencia de archivos sin seguimiento).
  - AF-10 ampliado: la guía tapa la revelación de rol, no solo los avisos.
  - AF-12 y AF-13.
  - La confirmación de que A12 es una carrera del script, con una ejecución modificada.
  - A16 pasa 2 de 2 aquí, frente a los fallos de la QA: intermitente.
- **Discrepancias:** no hay ninguna de fondo.
