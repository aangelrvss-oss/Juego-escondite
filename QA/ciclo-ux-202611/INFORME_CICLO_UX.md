# THE OUTRUN · Ciclo de mejora integral (UX, guía, Mission Report y capacidad) · 04/11/2026

Cambios **locales, sin commit ni push**. No se ha desplegado nada ni se ha tocado la infraestructura de producción.

Todo lo probado es **emulación en Chrome de escritorio contra un servidor local**: no hay pruebas con dispositivos físicos ni contra producción en este ciclo. La única excepción es la auditoría de Render, que se basa en la documentación oficial y en las medidas de producción del 04/11.

Informes de cada área, con el detalle y la evidencia:

| Área | Informe |
|---|---|
| A · Render y capacidad | `infra/INFORME_RENDER_CARGA.md` (scripts y registros en `infra/`) |
| B · Sala y «Estoy listo» | `sala/INFORME_SALA.md` |
| C · Guía visual | `guia/INFORME_GUIA.md` |
| D · Mission Report y estadísticas | `mission-report/INFORME_MISSION_REPORT.md` |
| E · QA independiente | `qa/INFORME_QA.md` |

---

## 1. Resumen ejecutivo

**Sala y «Estoy listo» (prioritario): resuelto en el motor y en la interfaz.**
- **Causa:** el motor quitaba el «listo» a todos con cualquier cambio de configuración, y el cliente enviaba la configuración entera al marcar la lista de seguridad o al recentrar.
- **Ahora:**
  - solo un cambio material quita el «listo», y solo a los demás (D-058);
  - la sala es un asistente en pasos: la zona se centra sola, hay estado y motivo por jugador, una barra de progreso y un único «Empezar partida», con la lista de seguridad confirmada en la hoja de resumen (D-059).
- No se ha quitado ninguna comprobación de seguridad.

**Guía rápida visual: hecha.** 12 pasos adaptados a cada modo, con 16 capturas reales de la interfaz en WebP (373 KB en total). Se abre desde el inicio, la sala y la partida; nunca sola (D-060).

**Mission Report: mejorado.** Tiene cabecera de resultado, cuatro cifras, rendimiento por jugador, supervivencia, captura decisiva y una cronología con hitos. Además, un historial personal guardado solo en el móvil (D-061). Los datos son correctos en los 3 modos y en las 5 causas de final del motor.

**Render y capacidad: auditado y medido en local.**
- **El cuello de botella real es la CPU del servidor:** el motor clona la sala dos veces por cada comando, también con cada ubicación.
- **Plan gratuito (0,1 CPU):** en local, una sala de 20 jugadores ya usa el 14 % de un núcleo, con picos del 26 %. Por extrapolación, no medido en Render, el plan gratuito sostiene como mucho una sala de 10–15 jugadores, y las salas se pierden al suspenderse o desplegar.
- **Recomendación:** corregir tres defectos de servidor y cliente y, para eventos, usar Starter siempre activo con disco y `STATE_FILE` (unos 7,25 $/mes). Requiere autorización: no se ha contratado nada.

**Pruebas:** todas las suites pasan:
- tsc correcto;
- motor y simulador 299/299;
- servidor 136/136;
- cliente 208/208;
- sim-panel 15/15;
- demo 62/62.

La QA independiente encontró 1 defecto medio y 3 bajos en el trabajo nuevo. Están corregidos y probados (§9).

## 2. Estado inicial

- Rama `mapa-real`, commit `7d8b5a9`, igual que `origin/mapa-real` (0/0).
- Árbol limpio, salvo una captura de trabajo sin versionar del ciclo anterior (`QA/produccion-20261104/capturas-pwa/inicio-local-con-pwa.png`), que se ha conservado.
- Seguían en marcha el servidor local del puerto 8787 y el túnel. No se han tocado: todas las pruebas usaron servidores propios en los puertos 8811–8842, que se pararon al terminar.
- `PROJECT_STATE.md` estaba desactualizado (26/10): se le añade el estado actual al principio.

## 3. Arquitectura relevante

- **Servidor:** un único proceso Node 24 (`server/main.ts`) sirve los archivos estáticos de `mobile/www`, `/ws`, `/health` y `/api/loc`.
- **Salas en memoria** (`server/hub.ts`). El motor de reglas es puro (`engine/src/engine.ts`): `applyCommand` devuelve el estado nuevo y los eventos.
- **Persistencia opcional:** `STATE_FILE` (D-050) está implementado y funciona en local, pero no está activado en Render, cuyo disco es efímero.
- **Cliente:** módulos ES sin framework. `app.js` dibuja las pantallas como cadenas HTML; `game-view.js` tiene la lógica pura de presentación; `net.js` la conexión, con reanudación y reenvío.
- **Contratos nuevos del ciclo:**
  - `guide.js`: `guideSteps(mode)`, `guideOverlay(state)` y `guideStepFor(topic)`;
  - `report-view.js`: `missionReportScreen(snap, {myId, nameOf, stats})`;
  - `stats.js`: `recordGame(storage, snap, myId)`, idempotente, y `readStats(storage)`.

## 4. Problemas encontrados (matriz)

Tipo: **D** = defecto confirmado · **UX** = mejora de experiencia · **R** = riesgo · **H** = hipótesis sin validar.

| # | Problema | T | Evidencia | Impacto | Solución | Archivos |
|---|---|---|---|---|---|---|
| 1 | Cualquier `configure` quita el «listo» a todos, también marcar la lista de seguridad o recentrar | D | `engine.ts` (7d8b5a9, caso `configure`: `for (const lp of lobbyPlayers(s)) lp.ready = false`) y `app.js` (`configure()` envía la config entera en cada cambio) | Todos repiten «Estoy listo» varias veces | Política material/no material (D-058) | `engine.ts`, `types.ts` |
| 2 | Recentrados pequeños seguidos movían la zona sin límite sin invalidar (introducido por la primera versión de la corrección, detectado por QA) | D | `engine/test/qa-preparacion-deriva.test.ts` | La zona aceptada podía moverse cientos de metros | Comparar con `readyBase`, la configuración del último cambio material | `engine.ts`, `types.ts` |
| 3 | Flujo de anfitrión confuso: centrar a mano, casilla de seguridad suelta, «Estoy listo» también para el anfitrión, sin motivo por jugador | UX | Capturas `QA/capturas/sala/`, encargo | Fricción y errores | Sala guiada (D-059) | `app.js`, `game-view.js`, `game.css` |
| 4 | Los jugadores podían marcarse listos antes de que hubiera zona y lo perdían después | UX | `start()` exige config; la primera config es material | Repetir el paso | Botón deshabilitado hasta que hay zona | `game-view.js` (`readyButton`) |
| 5 | Mission Report: «Primera captura» y «Decisiva» duplicadas con una sola captura; faltaban supervivencia, quién llegó al final y la duración total | D/UX | `mission-report/INFORME_MISSION_REPORT.md` §1 | Informe pobre o repetido | Informe ampliado | `game-view.js`, `report-view.js`, `report.css` |
| 6 | No había guía visual dentro de la app | UX | Encargo | Hacen falta instrucciones externas | Guía de 12 pasos | `guide.js`, `guide.css`, `guia/` |
| 7 | El motor clona la sala dos veces por comando, también con cada ubicación | R (rendimiento) | `engine.ts` `applyCommand` (`structuredClone(state)` y `structuredClone(ctx.s)`); `infra/registros/01`–`08` | La CPU crece más que lineal: 20 jugadores = 14 % de un núcleo | **No corregido** (motor protegido; backlog P0) | `engine.ts` |
| 8 | Tras un reinicio, el límite de 20 fallos por minuto y dirección bloquea también las reanudaciones válidas y crear sala nueva | D (servidor) | `server/hub.ts` (`failuresPerMinutePerIp`, `countAttempt`); `infra/registros/09-limites.txt` §6 | Un grupo en la misma Wi-Fi queda bloqueado 1 min justo tras un reinicio | **No corregido** (servidor protegido; backlog P0) | `hub.ts` |
| 9 | `net.js` `command()` no se resuelve si el servidor responde con un error en lugar de un resultado; un `rate_limited` al reanudar deja el socket sin sesión y sin aviso | D (cliente, reconexión) | `infra/INFORME_RENDER_CARGA.md`; fue lo que colgó el escenario 05 | Botones que se quedan esperando, sesión perdida sin aviso | **No corregido** (reconexión protegida; backlog P0) | `net.js` |
| 10 | No hay límite de conexiones por dirección; la dirección se toma de `CF-Connecting-IP`/`X-Forwarded-For` | R (abuso) | `main.ts` (conexiones y `clientIp`) | Una dirección puede ocupar las 1.000 conexiones o las 100 salas | Backlog; verificar cómo trata Render las cabeceras | `main.ts` |
| 11 | Cada push a `mapa-real` despliega y borra las salas en curso | R | `render.yaml` (`branch: mapa-real`, auto-deploy) | Una partida se corta si alguien publica durante ella | Rama de publicación aparte o auto-deploy desactivado (decisión del propietario) | `render.yaml` (no tocado) |
| 12 | El informe desaparece cuando el anfitrión propone la revancha (el motor reinicia capturas y resultado) | UX | `INFORME_MISSION_REPORT.md` §1, defecto 5 | Quien seguía leyendo lo pierde | Backlog: guardar el último informe en el cliente | `app.js` |
| 13 | En Infección, «Tu partida» y la lista dicen «captura(s)» mientras la cifra dice «Infectados» | UX | `INFORME_MISSION_REPORT.md` defecto 4; lo fija `modes.test.mjs` | Inconsistencia de texto | Backlog (decisión de texto) | `game-view.js` |
| 14 | En `e2e-sala`, tras 45 s sin red, el anfitrión siguió viendo al jugador «sin conexión» después de restaurarla (2 de 2 ejecuciones en ese script) | H | `qa/registros-antes-de-correcciones/e2e-sala.log` y `qa/registros/e2e-sala.log` (A16) | Posible reconexión lenta | La sonda aislada pasa 3/3, con reconexión en 0,5–1 s y sin nuevas «sin conexión» en 90 s (`qa/sonda-offline`, `qa/sonda-socket-viejo`). Probablemente artefacto del script (varias pestañas en segundo plano). **Validar en el paso 8 del protocolo físico.** | — |

## 5. Decisiones tomadas

Registradas en `DECISION_LOG.md`:

- **D-058 · Política de «Estoy listo».** Solo un cambio material quita el «listo», y solo a los demás.
  - **Material:** la primera configuración; modo, persecución, huida o pistas; radio, versiones de zona o zona dinámica; mover el centro o el punto de encuentro 50 m o más respecto a la configuración aceptada.
  - **No material:** la lista de seguridad, reenviar la misma configuración y recentrar menos de 50 m.
  - Nombres, roles, enlace, QR, entradas, salidas y desconexiones nunca tocaban el «listo».
  - **Por qué en el motor:** el «listo» lo guarda y lo resetea el motor.
- **D-059 · Sala guiada.** La lista de seguridad se confirma en la hoja «Antes de empezar», en cada partida, también en la revancha. El anfitrión no pulsa «Estoy listo» aparte: su GPS se comprueba al empezar.
- **D-060 · Guía a petición.** Nunca se abre sola. El agente de la guía propuso abrirla en la primera visita; **se descartó** porque el encargo pide no interrumpir.
- **D-061 · Historial solo en el móvil.** `localStorage`, sin nombres, identificadores ni ubicaciones. El historial en servidor se descartó por el coste (base de datos persistente) y por la privacidad (el identificador del dispositivo pasaría a ser un dato personal).
- **Defectos de servidor y red (§4: 7–10) no corregidos.** Están en zonas protegidas (motor, servidor y reconexión) y no hacen falta para los bloques B, C y D. Se documentan con evidencia para que el propietario decida.

## 6. Cambios implementados

### B · Sala y «Estoy listo»

- **Motor (`engine/src/engine.ts`, `types.ts`):**
  - `isMaterialChange` y `readyBase`;
  - el resto de `configure` y `start` sin cambios;
  - mismo evento `config_updated` y mismo protocolo.
- **Sala guiada (`app.js`):**
  - **Barra de pasos:** Configurar · Invitar · Listos · Empezar.
  - **Anfitrión:**
    - la zona se centra sola al entrar; si el GPS falla, se muestra el error y «Centrar la zona aquí»;
    - resumen legible de la configuración, con «Cambiar», que muestra los selectores con explicaciones y avisa de quién perderá el «listo», y «Volver a centrar»;
    - lista de bloqueos en lenguaje claro y un único «Empezar partida»;
    - la hoja «Antes de empezar» muestra el resumen y la lista de seguridad, y su botón «Empezar ya» hace: configurar con seguridad → GPS y «listo» del anfitrión → empezar. Si algo falla, el motivo sale en la hoja.
  - **Jugadores:**
    - «Estoy listo» deshabilitado hasta que hay zona;
    - errores de GPS visibles bajo el botón;
    - aviso de qué cambió si un cambio material les quitó el «listo».
  - **Lista de jugadores:** estado y motivo de cada uno, barra «N de M listos», y asignar rol y expulsar dentro de «Gestionar jugadores».
- **Funciones puras nuevas (`game-view.js`):** `configSummary`, `playerReadiness`, `readyProgress`, `lobbySteps`, `readyButton`, `configChanges`, `readyResetNotice`, `startSummary`, `SAFETY_CHECKLIST` y `startBlockers({atStart})`.
- **Correcciones tras la QA:**
  - deriva de la zona (`readyBase`);
  - el aviso de cuenta atrás cancelada ya no pide al anfitrión «Estoy listo» (`countdownAbortText(reason, {host})`);
  - la lista de seguridad no sale premarcada en la revancha;
  - la hoja de empezar recibe el foco y se cierra con Escape;
  - «Reglas de la partida» con un objetivo táctil de 44 px.

### C · Guía visual

- `guide.js`, `guide.css` y `mobile/www/guia/*.webp`: 16 imágenes, 373 KB en total.
- **Cifras:** ninguna escrita a mano. Salen de `game-view.js` y `GUIDE_RULES`, que un test contrasta con `engine/src/constants.ts`.
- **Integración en `app.js`:**
  - botones «Guía rápida» en el inicio y la sala, y «Ayuda: cómo se juega» en la partida;
  - la ayuda de la partida abre en el paso útil: ubicación si falla el permiso, conexión si no hay conexión, roles en la huida y captura en la persecución;
  - Escape y trampa de Tab, foco al título al abrirla y vuelta del foco al botón al cerrarla;
  - se cierra sola si llega una reclamación de captura.
- **Paso 3 (preparación) reescrito para la sala guiada**, con una captura nueva de la sala real de este ciclo (`guia/imagen-preparacion.mjs`).

### D · Mission Report y estadísticas

- **Datos (`game-view.js`, `missionReport`):** añade `modeId`, `winnerTeam`, `causeId`, `totalMs`, `firstCaptureMs`, `decisive`, `survival`, `survivors` y `moments`, y conserva los campos anteriores.
- **Pantalla (`report-view.js`, `report.css`):**
  - cabecera de resultado y 4 cifras;
  - «Rendimiento» con barras;
  - cronología con las etiquetas Primera, Decisiva y Última, y el momento del final;
  - «Tu partida» y «Tu historial» (plegado).
  - Mantiene los mismos botones (`rematch`, `share-report`, `leave`) y las mismas clases y `aria-label`.
- **Historial (`stats.js`):** registra cada partida una sola vez (clave sala + partida) y no lanza errores aunque `localStorage` esté vacío o corrupto.
- **Integración en `app.js`:** `finishedScreen` llama a `missionReportScreen` y `recordGame` se llama con cada instantánea FINISHED.

### Otros

- `index.html` enlaza `report.css` y `guide.css` (2 líneas).
- `DECISION_LOG.md`: D-058 a D-061.

## 7. Archivos

**Modificados (8):**
- `DECISION_LOG.md`
- `engine/src/engine.ts`, `engine/src/types.ts`
- `engine/test/briefing-lock.test.ts`: esperaba que el anfitrión también perdiera el «listo», que era el comportamiento defectuoso.
- `mobile/www/css/game.css`, `mobile/www/index.html`
- `mobile/www/js/app.js`, `mobile/www/js/game-view.js`

Además, `BACKLOG.md` y `PROJECT_STATE.md` se actualizan al cerrar el ciclo.

**Nuevos de producto:**
- `mobile/www/js/guide.js`, `report-view.js`, `stats.js`
- `mobile/www/css/guide.css`, `report.css`
- `mobile/www/guia/` (16 WebP)

**Nuevos de prueba:**
- `engine/test/preparacion.test.ts` (20), `engine/test/qa-preparacion-deriva.test.ts` (2)
- `mobile/test/sala-preparacion.test.mjs` (12), `guide.test.mjs` (14), `report-view.test.mjs` (10), `stats.test.mjs` (7)

**QA:** `QA/ciclo-ux-202611/` (este informe, los 5 informes de área, scripts, registros y capturas).

**Sin cambios:**
- `server/` (incluidos `hub.ts`, `ws.ts`, `main.ts` y `protocol.ts`);
- `mobile/www/js/net.js`, `location*.js`, `map-view.js`;
- `render.yaml`, el manifiesto y los iconos PWA;
- la configuración de MapTiler;
- `mobile/android/`.

## 8. Pruebas ejecutadas

**Suites, estado final** (después de todas las correcciones):

| Suite | Resultado |
|---|---|
| `npx tsc -p tsconfig.json` | 0 errores |
| `npm test` (motor + simulador) | **299/299** (base 277; +22 nuevos) |
| `npm run test:server` | **136/136** |
| `npm test --prefix mobile` | **208/208** (base 165; +43 nuevos) |
| `npm run test:sim-panel` | **15/15** |
| `npm run test:demo` | **62/62** |

**Pruebas de cada agente,** con servidores locales y Chrome headless:
- **Sala:** 9/9 comprobaciones a 360 y 412 px.
- **Guía:** 192 comprobaciones (4 tamaños de pantalla, 4 modos y 12 pasos), 0 errores, contraste AA.
- **Mission Report:** 7 partidas reales contra el servidor local, que cubren los 3 modos y 5 causas de final, dos de ellas con 10 min reales por tiempo agotado.
- **QA independiente:** revisión del diff, e2e de sala, guía, partidas (Clásico, Infección, Caza del zorro; terminada por el anfitrión, todos capturados, zorro atrapado, abandono del cazador, tiempo agotado con reloj ×8), privacidad al compartir, reconstrucción tras recargar e historial sin duplicados.

**Repetición tras corregir** (servidor local en el 8842):

| Script | Resultado |
|---|---|
| `e2e-guia` | 52 comprobaciones superadas, 0 fallos |
| `e2e-infeccion` | Superado, incluida la nueva comprobación I1 (el aviso al anfitrión no pide «Estoy listo») |
| `e2e-partidas` P1–P3 | Superados (34 comprobaciones) |
| `e2e-sala` | Superado salvo dos fallos que ya existían antes de corregir (ver abajo) |

- **`e2e-partidas` P4:** se corta por tiempo en este script; el mismo caso está cubierto y superado en `e2e-infeccion`.
- **`e2e-sala` A12:** falla por una carrera del propio script (la QA lo verificó aparte en `sonda-offline` S1, que pasa).
- **`e2e-sala` A16:** ver el n.º 14 de la matriz.
- **`sonda-offline`:** 2/2.
- **`sonda-socket-viejo`** (nueva): superada.
- **Errores de consola:** solo errores esperados del entorno (403 de MapTiler porque la clave no admite `127.0.0.1`, conexiones rechazadas durante un corte de red simulado y el aviso de Chrome por `navigator.vibrate` sin gesto). Ninguno de la app.
- **Registros:** los de la primera pasada están en `qa/registros-antes-de-correcciones/` y los de la repetición en `qa/registros/`.
- **No se repitió tras corregir:** `e2e-tiempo` (tiempo agotado con servidor acelerado), que pasó en la ejecución de la QA. Las correcciones posteriores no tocan esa ruta.

**Carga (A), solo en local** (Ryzen 7 5700U, CPU en % de un núcleo):

| Escenario | CPU media | Notas |
|---|---|---|
| 1 sala de 5 | 0,2 % | — |
| 1 sala de 10 | 3,3 % | — |
| 1 sala de 15 | 8,9 % | — |
| 1 sala de 20 | 14,2 % (picos 26 %) | bucle de eventos p99 240–270 ms, ping p95 564 ms, RSS 204 MB |
| 5 salas de 10 | 17,9 % | — |
| 10 salas de 10 | 35,7 % | — |
| 25 salas de 10 | 70,6 % | ping p50 353 ms |
| 50 salas de 10 | 82–93 % (saturado) | ping p50 1,1 s; captura p99 3,1 s |

- **Memoria:** como mucho 267 MB con 500 clientes.
- **Reconexión simultánea:** 100 % con la misma identidad, en 0,7–2,2 s (5–250 clientes) y en 11 s con 500 (servidor saturado).
- **Reinicio con `STATE_FILE`:** 100/100 y 250/250 vuelven en menos de 1 s. **Sin estado**, como en Render gratuito: 0/50.
- **Límites comprobados:** 5 salas por dirección, 100 salas, 1.000 conexiones, mensajes de 4 KB, y ráfaga de 30 mensajes con corte tras 200 descartados.

## 9. Resultados frente a los criterios de aceptación

| Criterio | Estado | Evidencia |
|---|---|---|
| Crear sala y entender cómo empezar sin instrucciones | Hecho y probado en emulación | Barra de pasos, motivo por jugador, un único botón; `sala/capturas/`, `qa/capturas/`. **Pendiente: confirmarlo con alguien que no conozca el juego** (prueba física). |
| No repetir pasos sin motivo | Hecho y probado | `engine/test/preparacion.test.ts` (20), `qa-preparacion-deriva.test.ts`, e2e A13/A14 y A15 |
| Lista de seguridad, GPS, mínimos por modo y todos listos y conectados | Se mantienen | `start()` sin cambios; e2e A11 e I-mínimos |
| Guía desde inicio y sala, sin perder el estado, no obligatoria | Hecho y probado | `e2e-guia` 52/52 |
| Mission Report fiable, reconstruible y sin datos privados | Hecho y probado | `report-view.test.mjs`, `e2e-partidas` P2/P3, `e2e-infeccion` P4 |
| Estadísticas persistentes evaluadas | Hechas, solo en el móvil | D-061, `stats.test.mjs` |
| Mecánicas protegidas intactas | Sí | El diff del motor solo cambia la política de `ready` en `configure` (revisión de QA); sin cambios en el servidor ni en `net.js` |

**Defectos de la QA sobre el trabajo nuevo (todos corregidos y con prueba):**
- QA-01 (media): deriva de la zona;
- QA-02: aviso al anfitrión;
- QA-03: guía con la sala antigua;
- QA-04: objetivo táctil de 22 px.

## 10. Problemas pendientes

Por prioridad; también están en `BACKLOG.md`:

1. **(P0, servidor o motor protegidos, requieren tu decisión)**
   - CPU: doble `structuredClone` por comando (`engine.ts` `applyCommand`).
   - Bloqueo por dirección tras un reinicio (`hub.ts` `failuresPerMinutePerIp`).
   - `net.js`: `command()` sin resolver ante un error del servidor, y sesión perdida sin aviso tras `rate_limited`.
2. **(P1)** Validar con móviles reales: la sala guiada con alguien nuevo, el GPS real (permiso nativo en Capacitor, Safari/iOS), A16 (corte de 45 s), el autocentrado en exteriores y la guía en pantalla pequeña real.
3. **(P1, despliegue)** Separar el despliegue de `mapa-real` (rama de publicación o auto-deploy desactivado) para no cortar partidas.
4. **(P2)**
   - Límite de conexiones por dirección y verificar cómo trata Render `X-Forwarded-For`.
   - Compresión y caché de estáticos: la página pesa 1,78 MiB sin comprimir y con `no-store`.
5. **(P2, UX)**
   - Conservar el último Mission Report cuando el anfitrión propone la revancha.
   - Texto «captura» frente a «infección» en Infección.
   - La guía no tiene captura del aviso de permiso de ubicación denegado (el paso 12 usa una relacionada).
   - Los avisos de equipos desequilibrados (`teams_unbalanced`) y de sala a punto de caducar (`room_expiring`) solo aparecen al empezar, no antes.

## 11. Límites de Render

Fuentes oficiales consultadas el 04/11/2026; extractos literales en `infra/registros/fuentes-render-20261104.txt`.

| Límite | Plan gratuito (actual) |
|---|---|
| Recursos | 0,1 CPU y 512 MB |
| Suspensión | A los 15 min sin tráfico (los mensajes WebSocket cuentan como tráfico) |
| Arranque en frío | Render dice «~1 min»; en nuestra producción medimos 22,4 s |
| Horas | 750 h/mes |
| Disco | Efímero; sin disco persistente |
| Ancho de banda de salida | 5 GB/mes (plan Hobby del espacio de trabajo). Al agotarse sin tarjeta, se suspende el servicio. |

- **Lo que significa para THE OUTRUN:**
  - toda sala se pierde al suspender, reiniciar o desplegar;
  - con la CPU actual, el plan gratuito da para una sala de 10–15 jugadores (extrapolación);
  - una partida de 20 personas mueve unos 25 MB/h, unas 80 partidas así al mes.
- **Planes de pago:**
  - Starter: 0,5 CPU, 7 $/mes, siempre activo.
  - Standard: 1 CPU, 2 GB, 25 $/mes.
  - Disco persistente: unos 0,25 $/GB al mes (precio sin verificar en la fuente oficial). Con disco no hay despliegue sin corte.

## 12. Recomendación de alojamiento

Combinación de medidas, en este orden:

1. **Desarrollo:** seguir en Render gratuito, pero desplegando desde una rama de publicación aparte o con auto-deploy desactivado.
2. **Antes de pagar más CPU:** corregir los tres defectos P0. El doble clonado multiplica el coste de CPU. Requiere tu autorización, porque toca el motor, el servidor y la reconexión.
3. **Partidas físicas con grupos o eventos:** Starter siempre activo (0,5 CPU) con 1 GB de disco persistente y `STATE_FILE`, unos 7,25 $/mes.
   - Evita el arranque en frío y la pérdida de salas por suspensión.
   - Sobrevive a los reinicios: la persistencia ya existe y funciona en local.
   - Los despliegues siguen cortando la partida unos segundos, pero las salas se recuperan.
4. **Otros proveedores:** no evaluados por falta de precios oficiales verificados. Revisarlo solo si Starter no basta tras optimizar.

**No se ha contratado ni cambiado nada.**

## 13. Riesgos para la primera partida física

- **Hecho y validado:** la PWA con el icono correcto, instalada por el propietario en un Xiaomi 14T.
- **El servicio puede estar dormido:** el primero en abrir la URL espera unos 22 s. Abrirla unos minutos antes.
- **No hacer push a `mapa-real` durante la partida:** despliega y borra las salas.
- **Grupo detrás de la misma dirección** (Wi-Fi o mismo operador): si el servidor se reinicia, el bloqueo por dirección puede impedir volver durante 1 min (§4, n.º 8).
- **Sala de más de 15 jugadores en el plan gratuito:** posible lentitud (pistas, capturas y ubicaciones con retraso).
- **GPS y segundo plano:** limitación conocida de la web (pantalla bloqueada). Usar el protocolo `QA/produccion-20261104/PROTOCOLO_PRUEBA_FISICA_MOVILES.md`, que sigue vigente. Lo único que cambia con la sala guiada es cómo se empieza: ver la guía, paso 3.
- **Las mejoras de este ciclo no están desplegadas:** hasta que autorices el commit y el push, producción sigue con la sala antigua.

## 14. Próximos pasos

1. **Revisar este ciclo** y autorizar, o no, el commit y el push. Al desplegar, comprobar en producción la sala guiada, la guía y el Mission Report, igual que se hizo con la PWA.
2. **Decidir sobre los tres defectos P0** de servidor, motor y red (§10.1). Se pueden corregir con pruebas y cambios mínimos.
3. **Decidir el despliegue** (rama de publicación) y el plan (Starter con disco) antes de un evento.
4. **Primera partida física** con el protocolo, incluyendo a alguien que no haya jugado nunca para validar la sala guiada sin instrucciones.
