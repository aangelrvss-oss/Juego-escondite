# THE OUTRUN · Auditoría final previa a pruebas físicas · ciclo `ciclo-ux-202611`

**Fecha:** 04/11/2026. **Tipo:** auditoría independiente de los cambios locales del ciclo UX (sala guiada, política de «Estoy listo», guía visual, Mission Report e historial) y de las conclusiones de infraestructura.

**Método:** tres revisores independientes (motor, interfaz e infraestructura) que recibieron el código y los informes que debían verificar, pero no las conclusiones del arquitecto. Además, las suites completas y comprobaciones propias.

**Restricción cumplida:** no se ha modificado ningún archivo del proyecto salvo este informe. La huella del árbol de trabajo es idéntica al principio y al final (§8). No ha habido commits, push ni despliegues, y no se han tocado el servidor del 8787, el túnel ni producción.

Las evidencias propias de la auditoría (scripts, registros, capturas, tests extra y los tres informes parciales) están **fuera del repositorio**, en una carpeta temporal de la sesión:
`C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\auditoria-final\`

| Subcarpeta | Contenido |
|---|---|
| `agentes\motor\` | `INFORME_MOTOR.md`, `deriva-auditoria.test.ts`, `cliente-aviso.test.ts`, `bench-location.ts` |
| `agentes\infra\` | `INFORME_INFRA.md`, `scripts\`, `registros\` |
| `agentes\ui\` | `INFORME_UI.md`, `e2e\`, `e2e\registros\`, `e2e\capturas\` |
| (raíz) | `suites-1.txt`, `server-serie.txt`, `huella-inicio.txt`, `huella-ahora.txt`, `status-inicio.txt` |

Es una carpeta temporal. Si quieres conservar estas evidencias en el repositorio, hay que copiarlas, y eso necesita tu autorización.

---

## 1. Estado real de Git

| Comprobación | Resultado |
|---|---|
| Rama actual | `mapa-real` |
| Último commit local | `7d8b5a9` · feat(pwa): identidad instalable con el símbolo oficial de THE OUTRUN |
| Último commit remoto | `origin/mapa-real` = `7d8b5a9` (`git ls-remote`: `refs/heads/mapa-real 7d8b5a9…`). Diferencia: 0/0 |
| Staged | Nada |
| Unstaged (10 archivos modificados) | `BACKLOG.md`, `DECISION_LOG.md`, `PROJECT_STATE.md`, `engine/src/engine.ts`, `engine/src/types.ts`, `engine/test/briefing-lock.test.ts`, `mobile/www/css/game.css`, `mobile/www/index.html`, `mobile/www/js/app.js`, `mobile/www/js/game-view.js` (832 inserciones, 144 borrados) |
| Sin seguimiento | De producto: `mobile/www/js/{guide,report-view,stats}.js`, `mobile/www/css/{guide,report}.css` y `mobile/www/guia/` (16 WebP). Tests: `engine/test/{preparacion,qa-preparacion-deriva}.test.ts` y `mobile/test/{sala-preparacion,guide,report-view,stats}.test.mjs`. Evidencias: `QA/ciclo-ux-202611/` y la captura de trabajo anterior `QA/produccion-20261104/capturas-pwa/inicio-local-con-pwa.png` |
| ¿Se ha sobrescrito trabajo anterior? | **No.** Todas las acciones (`data-act`), los `case` del manejador y las funciones exportadas de `game-view.js` que había en `7d8b5a9` siguen existiendo. Solo desaparece el id `c-safety` (la casilla suelta, sustituida por `start-safety` en la hoja «Antes de empezar», según D-059). Sin cambios en `server/`, `net.js`, `location*.js`, `map-view.js`, `engine/src/{modes,constants,zone,validate,view}.ts`, `render.yaml`, el manifiesto ni `mobile/android` |
| ¿Cambios solo en local? | **Sí.** El remoto sigue en `7d8b5a9` y producción no se ha tocado |

## 2. Resumen ejecutivo

- **Motor:** el cambio se limita al caso `configure` (política de «listo», D-058) y al campo opcional `readyBase`. Tres revisiones lo confirman: la diferencia de archivos, el revisor del motor y la QA del ciclo. **Las reglas del juego no se han alterado.**
- **QA-01 (deriva de la zona): corregido en el motor, pero no del todo.** Ya no se puede mover la zona sin límite con pasos pequeños: el máximo es menos de 50 m respecto al último cambio material. Pero la base es una sola para toda la sala, no por jugador. Quien se marca listo a mitad de una deriva puede quedar con la zona a **menos de 100 m** de lo que él aceptó (98,9 m medidos; AUD-01). El cliente, además, no explica esa invalidación (AUD-02).
- **Sala, guía y Mission Report:** funcionan en emulación en los tres modos y en las cinco causas de final.
  - Tras recargar, el informe se reconstruye y el historial no se duplica.
  - No hay errores de consola propios, desbordamientos ni objetivos táctiles por debajo de 44 px.
  - Defectos medios y bajos de experiencia, ninguno bloqueante: el informe desaparece con la revancha, los avisos quedan bajo la guía, «atrás» sale de la app, hay imágenes de la guía antiguas y alguna incoherencia de textos.
- **Infraestructura:** las cifras de carga del ciclo están en sus registros, pero son una sola ejecución por escenario, en local, con el generador en la misma máquina (las colas de latencia están sesgadas).
  - **No hay ninguna medida de capacidad en Render.** Las cifras de jugadores soportados en Render son extrapolaciones.
  - Los tres defectos pendientes son reales y reproducidos: la CPU crece de forma cuadrática; el bloqueo por dirección tras un reinicio; y comandos sin resolver que congelan la hoja «Antes de empezar». Ninguno bloquea una prueba de 3–10 personas. Los dos últimos deben resolverse antes de producción.
- **Reconexión:** solo está demostrado el corte de red de 45 s **en la partida y con la página en primer plano**. En la sala no se pudo ejecutar por falta de memoria en la máquina. Queda para la prueba física.
- **Veredicto: B · APTO CON RESERVAS** (§10).

## 3. Cambios auditados

| Área | Archivos | Conclusión |
|---|---|---|
| Política de «listo» (D-058) | `engine.ts` (`isMaterialChange`, `configure`), `types.ts` (`readyBase`) | Correcta salvo AUD-01. Protocolo, `start`, reglas, persistencia y vistas sin cambios |
| Sala guiada (D-059) | `app.js`, `game-view.js`, `game.css` | Funciona; defectos menores (AUD-02, AUD-08, AUD-12…) |
| Guía (D-060) | `guide.js`, `guide.css`, `guia/*.webp`, integración en `app.js` e `index.html` | Funciona; 3 imágenes desactualizadas (AUD-07), avisos tapados (AUD-04), «atrás» (AUD-05) |
| Mission Report e historial (D-061) | `report-view.js`, `stats.js`, `report.css`, `game-view.js` | Correcto en 5 causas × 3 modos; revancha (AUD-03), compartir con nombres (AUD-10) |
| Documentación | `BACKLOG.md`, `DECISION_LOG.md`, `PROJECT_STATE.md`, informes del ciclo | Coherente, con las correcciones que señala esta auditoría (§7.3) |

## 4. Resultados por área

### 4.1 Motor y preparación

Revisor del motor: `agentes\motor\INFORME_MOTOR.md`, que incluye la tabla completa de invalidación con archivo y línea.

**Qué quita el «listo»** (solo a los demás jugadores; el anfitrión que hace el cambio lo conserva):
- la primera configuración;
- cambiar el modo (sin campo = clásico), `durationMs`, `headStartMs` (ausente = valor por defecto, no cuenta como cambio), `pingIntervalMs`, `dynamicZone`, el número de versiones de zona, su `fromOffsetMs` o su radio;
- mover el centro o el `meetingPoint` 50 m o más respecto a `readyBase`.

**Qué no lo quita:**
- `safetyChecklistConfirmed`: es el único campo que no se compara, y es deliberado;
- reenviar la misma configuración;
- moverla menos de 50 m respecto a `readyBase`;
- entrar o salir otro jugador, `assign_team`, `set_team_pref`, el traspaso de anfitrión y las desconexiones o reconexiones (`start` ya exige estar conectado).

**Lo ponen a `false`, como antes:** `start`, la cuenta atrás anulada, la revancha, salir y reclamar plaza en `join`.

**QA-01:** 13 tests propios (`deriva-auditoria.test.ts`, 13/13; reejecutados por el arquitecto: 14/14 junto con `cliente-aviso.test.ts`).
- Pasos de 49 m en línea recta o en zigzag invalidan en el segundo paso, también intercalando la casilla de seguridad.
- Cambiar el radio y volver al original invalida las dos veces.
- **AUD-01:** la base es única por sala. Un jugador que se marca listo con la zona en +49 m sigue listo si después se mueve a −49,9 m: queda a 98,9 m de lo que él aceptó. Lo mismo ocurre en la revancha, y con el centro y el punto de encuentro movidos en sentidos opuestos. La cota es menos de 100 m.

**Integridad:** según el diff y las suites, no cambian roles, capturas ni sus distancias, la confirmación, la zona dinámica, la victoria, los tres modos, las pistas, la cuenta atrás, la huida, la reconexión o presencia, la privacidad ni el protocolo WebSocket.
- **Persistencia:** `readyBase` se guarda (`exportState` copia el estado completo) y un estado antiguo sin él se restaura bien (comprobado en el motor y con un servidor real por el revisor de infraestructura).
- **Test existente modificado:** solo `briefing-lock.test.ts`, que pasa de «a todos» a «a los demás». Es el cambio de especificación de D-058 y sigue comprobando que `start` falla.

**Seguridad al empezar:** no se puede empezar sin la lista; el motor la exige y la interfaz no permite saltarla, ni siquiera forzando.
- Si `start` falla después de enviarla, o en una revancha, el motor la conserva confirmada. Solo la interfaz nueva obliga a marcarla otra vez (AUD-13, ya ocurría en `7d8b5a9`).

### 4.2 Nueva sala

Revisor de interfaz: `agentes\ui\INFORME_UI.md`. Emulación en Chrome con servidor local; parte de los jugadores, con bots por WebSocket por falta de memoria.
- **Creación y unión:** el autocentrado envía una sola configuración. Unirse por enlace, código y QR funciona, y el enlace no lleva la sesión.
- **GPS:** sin permiso, el motivo sale en 0,4 s con el botón de reintentar (sin bucle). Con GPS impreciso, el aviso llega a los 30 s.
- **Mínimos y máximos por modo:** bloquean «Empezar partida» con su explicación; el jugador 21 es rechazado.
- **Hoja «Antes de empezar»:** no se puede empezar sin la lista de seguridad, y no viene premarcada en la revancha.
- **Traspaso de anfitrión:** quien hereda ve el flujo de anfitrión y puede empezar.
- **Sin botones contradictorios:** solo «Empezar partida» en la sala y «Empezar ya» en la hoja.
- **Afirmación del ciclo que no se sostenía:** la prueba A9 («recentrar 20 m no invalida») reenviaba la misma posición, porque la app reutiliza la lectura de los últimos 5 s. Repetida esperando 6 s, se confirma.
- **Defectos:**
  - AUD-02: aviso que falta tras una deriva y pista falsa al anfitrión;
  - AUD-08: «Todo listo» con roles a mano imposibles;
  - AUD-11: avisos sobre la barra de pasos, y un bloque fijo que ocupa un 25 % de la altura;
  - AUD-12: aviso de cambio obsoleto;
  - AUD-14: el borrador se hereda entre salas.
- **Sin confirmar:** una vez, la zona no se centró sola en una sala creada tras una partida. En 6 intentos aislados no se repitió, y coincidió con caídas de memoria. Vigilarlo en la prueba física.

### 4.3 Guía visual

- **Lo que funciona:**
  - 12 pasos en los tres modos;
  - las 16 imágenes existen, cargan y tienen texto alternativo;
  - no se abre sola;
  - se cierra con ✕, «Entendido» y Escape sin perder el estado;
  - a 320×568 y 360×640 no hay desbordamiento;
  - los textos coinciden con las reglas del código (cazadores en Infección, zorro con n−1 cazadores, cierre del 15 %, mínimo de 50 m, 30 s, 60 s, ±30 m y 5 min);
  - una reclamación de captura cierra la guía y queda a la vista (11 ms).
- **AUD-07, confirmado visualmente por el arquitecto:**
  - `sala-codigo.webp` muestra la sala anterior (selector «Sorteo» en cada fila, anfitrión «Listo»);
  - `final.webp` muestra el informe anterior, con «Primera captura 3:00», que es precisamente el defecto corregido en el ciclo;
  - `captura.webp` deja ver al fondo el texto de desarrollo «Mapa sin configurar… (mobile/MAPA.md)».
- **Otros defectos:**
  - AUD-04: los avisos quedan debajo de la guía y caducan a los 4,5 s;
  - AUD-05: el «atrás» del navegador o de Android con la guía abierta sale de la página.
- **Comprensión:** a 320–360 px las capturas se ven a unos 270 px y su texto interior no se lee. La comprensión depende del texto, que es suficiente.

### 4.4 Mission Report y estadísticas

Probadas las 5 causas del motor (`time_up`, `all_captured`, `runners_abandoned`, `hunters_abandoned`, `ended_by_host`) en los tres modos donde aplican, incluidas Infección hasta «todos infectados» y los dos finales de Caza del zorro. El tiempo agotado se probó con un servidor de reloj ×8.

| Requisito | Resultado |
|---|---|
| Resultado, motivo y duración | Correctos |
| Atribución de capturas | Correcta (sin capturas mal atribuidas) |
| Supervivencia, captura decisiva y cronología | Correctas |
| Tras recargar | Informe idéntico |
| Historial | Sobrevive a la recarga, no se duplica, no mezcla partidas ni salas, y no guarda nombres, código ni coordenadas |
| Compartir | Sin coordenadas, código ni URL, pero **con nombres** de jugadores (AUD-10, decisión de privacidad) |
| Revancha | **Falla (AUD-03):** el informe desaparece para todos a los 42 ms de pulsar «Revancha» y no se puede recuperar. El requisito 7 de la auditoría no se cumple |
| Infección | «Infectados» frente a «captura(s)» (AUD-15) |

### 4.5 Infraestructura y Render

Revisor de infraestructura: `agentes\infra\INFORME_INFRA.md`, con la tabla de afirmaciones clasificadas.

**Medido en local, respaldado por registros:**
- todas las cifras de CPU y memoria de la tabla de carga del ciclo (diferencia menor: 80,3 % y no 82 % con 50×10);
- coste por ubicación: el benchmark propio del revisor del motor da 3,5 ms con 10 jugadores y 7,3 ms con 20, y las dos copias de la sala son el 95–100 % del tiempo;
- crecimiento casi cuadrático: unos 5 % de un núcleo con 10 jugadores y 15 % con 20, a una lectura por segundo.

**Medido en local, con sesgo:** las colas de latencia p95/p99. El generador de carga corría en la misma máquina y tuvo parones de 0,5–1 s. Por ejemplo, el p95 de 564 ms con 20 jugadores coincide con un parón de 588 ms del generador. La CPU, medida dentro del servidor, no está sesgada.

**Matizado:**
- **«Reconexión en menos de 1 s»:** corresponde a un cierre limpio del socket. Con un corte real de red, detectarlo cuesta unos 30 s (medido en producción el 04/11, `QA/produccion-20261104/registros/05`).
- **Auto-deploy:** que cada push a `mapa-real` despliegue es probable, pero el repositorio no lo demuestra. Si el campo falta en el blueprint, un servicio existente conserva lo que diga el panel.

**Medido en producción:** solo la prueba de humo, las partidas de 3 jugadores, los cortes de red, la PWA y el arranque en frío de 22,4 s (una sola medida), además de la pérdida de salas al suspenderse el servicio (de 2 a 0).

**Estimación, no capacidad demostrada:** «una sala de 10–15 en el plan gratuito» y «unas 3 de 20 en Starter». **No se puede afirmar ningún número de jugadores soportado en Render.** Para medirlo haría falta:
- un servicio de prueba del mismo plan, con el generador en otra máquina;
- perfiles de envío web (hasta 1 por segundo más un reenvío cada 5 s) y nativo (cada 5 s);
- al menos 3 repeticiones de 5 min en partida activa, con un criterio de p95 pactado.

**STATE_FILE**, reproducido con 6 clientes `net.js` en la sala y en la huida:
- tras matar y rearrancar el proceso, recuperan identidad, «listo», configuración y equipos en 0,8 s;
- el archivo ocupa 5–6 KB y no lleva muestras, la última pista ni secretos en claro;
- solo guarda coordenadas de la zona, del punto de encuentro y del plan de zona.

En Render gratuito el disco es efímero: sin disco persistente de pago, la persistencia no sirve allí.

## 5. Pruebas ejecutadas y resultados exactos

| Prueba | Quién | Resultado |
|---|---|---|
| `npx tsc -p tsconfig.json` | Arquitecto | 0 errores |
| `npm test` (motor + simulador) | Arquitecto | **299/299** |
| `npm run test:server` (paralelo, por defecto) | Arquitecto | **1.ª ejecución: 114/122, 8 fallos; 2.ª: 97/107, 10 fallos.** Ficheros enteros abortados con `el servidor terminó (3221226505)` (`0xC0000409`, cierre abrupto del proceso en Windows) |
| `node --test --test-concurrency=1 "server/test/*.test.mjs"` | Arquitecto | **136/136** |
| `npm test --prefix mobile` | Arquitecto | **208/208** |
| `npm run test:sim-panel` | Arquitecto | **15/15** |
| `npm run test:demo` | Arquitecto | **62/62** |
| Tests propios del motor: `deriva-auditoria.test.ts` (13) y `cliente-aviso.test.ts` (1) | Revisor del motor; reejecutados por el arquitecto | **14/14** |
| Tests del repositorio de preparación, deriva y briefing-lock, más `transitions.test.ts` | Revisor del motor | 26/26 y 37/37 |
| Microbenchmark de ubicación en el motor | Revisor del motor | §4.5 (valen las proporciones; máquina con 260 MB libres) |
| Reproducción de STATE_FILE, bloqueo por dirección y comando sin resolver | Revisor de infraestructura (servidores propios 8861–8864) | §6 |
| E2E de sala, guía, partidas, Mission Report y móvil | Revisor de interfaz (servidores propios 8851 y 8852 con reloj ×8; Chrome en un solo proceso, 2 contextos y bots) | §4.2–4.4; tabla completa en `INFORME_UI.md` §2 |

**Sobre el fallo de `test:server` en paralelo:** no es un fallo del código, y no se marca como falso positivo sin evidencia. La evidencia es esta:
1. El número de tests y de fallos cambia entre ejecuciones (122 y 107 tests; 8 y 10 fallos), y los ficheros abortan enteros en `crash`, `diagnostics`, `fox-hunt`, `invite`, `leave`…, cada uno arrancando sus propios servidores.
2. El proceso hijo termina con `0xC0000409`.
3. La máquina tenía **659 MB de RAM libres y 813 MB de memoria virtual libre**, ocupada por aplicaciones del usuario: Chrome (3,4 GB), Bambu Studio, ChatGPT y otras sesiones.
4. La misma suite **en serie pasa 136/136**.
5. Antes en esta misma sesión, en paralelo y con más memoria, pasaba 136/136.

**Conclusión:** son fallos del entorno, por falta de memoria al lanzar muchos servidores a la vez. Hay que repetir la suite en paralelo en una máquina con memoria suficiente antes de publicar.

**No ejecutado:**
- Por falta de memoria: la reconexión en la sala (cuatro variantes; script preparado en `agentes\ui\e2e\aud-reconexion.mjs`), la orientación horizontal y el «atrás» del navegador en la sala.
- Por las reglas de esta auditoría: las pruebas de carga contra producción y la batería de carga completa.
- **Nada se ha probado en móviles reales.**

## 6. Defectos encontrados

Severidad: C = crítica · A = alta · M = media · B = baja.

| ID | Descripción | Sev. | Evidencia | Impacto | ¿Bloquea prueba física? | ¿Bloquea publicación? |
|---|---|---|---|---|---|---|
| AUD-01 | `readyBase` único por sala: quien se marca listo durante una deriva puede seguir listo con la zona a menos de 100 m de lo que él aceptó | M-B (M con radio de 50–100 m) | `agentes\motor\deriva-auditoria.test.ts` (98,9 m) | Con 500 m (por defecto) irrelevante; con 50 m la zona puede acabar en otra calle | No | No (anotar) |
| AUD-02 | El cliente compara con la configuración anterior, no con `readyBase`: tras recentrados cortos que suman 50 m o más, el jugador pierde el «listo» sin explicación. La pista del anfitrión «Recentrar a menos de 50 m no obliga a nadie…» es falsa en ese caso | M-B | `cliente-aviso.test.ts`, `agentes\ui` G02 (`{"sentD":60,"beto":"Falta confirmar","aviso":null}`), `game-view.js` (`configChanges`/`readyResetNotice`), `app.js` (pista) | Confusión: «¿por qué ya no estoy listo?» | No | No |
| AUD-03 | «Revancha» hace desaparecer el Mission Report para todos al instante | M | `agentes\ui` C11, `engine.ts` `rematch()` | Quien lo leía lo pierde | No | Recomendable antes de un evento |
| AUD-04 | Los avisos quedan debajo de la guía (sala y partida) y caducan a los 4,5 s | M-B | `agentes\ui` P05 (`coveredBy: guide-img`) | Se pierden avisos de pista o zona mientras se lee la guía; la reclamación de captura sí se ve | No | No |
| AUD-05 | El «atrás» del navegador o de Android con la guía o una hoja abierta sale de la página | M-B | `agentes\ui` `aud-guia.log` (url → about:blank) | Sale de la app; la sesión se recupera al volver | No | No |
| AUD-06 | Ante un corte sin cierre del socket, el cliente muestra «Conectado» unos 36 s (detección por ping 25 + 5 s) y la ayuda abre en el paso equivocado. Ya existía; no es de este ciclo | M | `agentes\ui` P07/P08; `net.js` `DEAD_AFTER_MS`/`PROBE_MS` | El jugador no sabe que está desconectado | No (validar) | No |
| AUD-07 | 3 imágenes de la guía desactualizadas, una con texto de desarrollo visible | B | `mobile/www/guia/sala-codigo.webp`, `final.webp`, `captura.webp` (vistas por el arquitecto) | La guía enseña pantallas que ya no existen | No | No |
| AUD-08 | «Todo listo» en la sala con roles asignados a mano imposibles (2 zorros); el error solo aparece al pulsar «Empezar ya» | B | `agentes\ui` A12 | Un paso de más | No | No |
| AUD-09 | Tras un reinicio sin estado, el límite de 20 fallos por minuto y dirección bloquea durante unos 60 s las reanudaciones, unirse y crear sala desde esa dirección | M | `agentes\infra` (10 jugadores que reintentan con el código viejo: 20 fallos y crear sala bloqueado 60,9 s; 25 jugadores: 20 `bad_session` y 5 `rate_limited`); `hub.ts` `failuresPerMinutePerIp`/`countAttempt` | Un grupo en la misma Wi-Fi queda bloqueado justo después de un reinicio | No (con instrucción) | **Sí** |
| AUD-10 | «Compartir resultado» incluye los nombres de los jugadores | B (privacidad) | `agentes\ui` C07 | Nombres que salen del grupo | No | Decisión del propietario |
| AUD-11 | Avisos flotantes sobre la barra de pasos; bloque fijo de «Empezar partida» ≈25 % de la altura a 740 px; sin `safe-area-inset-left/right` en horizontal (hipótesis) | B | `agentes\ui` `A-anfitrion-dock-top-360.png`; búsqueda en el CSS | Lectura y estética | No | No |
| AUD-12 | El aviso de cambio se queda obsoleto si el anfitrión hace más cambios | B | `agentes\ui` `aud-sala.log` | Mensaje que no corresponde al último cambio | No | No |
| AUD-13 | La confirmación de seguridad queda guardada en el motor tras un `start` fallido y en la revancha. Solo la interfaz nueva obliga a marcarla otra vez. Ya existía | B | `agentes\motor` M-3; `engine.ts` (`start` lee `safetyChecklistConfirmed`) | Otro cliente con la interfaz antigua podría empezar sin volver a verla | No | No |
| AUD-14 | El borrador de configuración (`ui.draft`) se hereda entre salas | B | `agentes\ui` UI-13; `app.js` `resetGame` | Configuración inesperada en la segunda sala; la seguridad se pide igual | No | No |
| AUD-15 | En Infección conviven «Infectados» y «captura(s)»; los cazadores con 0 capturas salen sin texto | B | `agentes\ui` I05 | Incoherencia de textos | No | No |
| AUD-16 | «GPS comprobado» se muestra para cualquier jugador listo, pero el motor no comprueba el GPS (lo hace el cliente antes de `set_ready`) | B | `agentes\motor` M-4 | Un cliente modificado podría marcarse listo sin GPS; con la app real, la etiqueta es cierta | No | No |
| P-1 | Dos `structuredClone` de la sala completa por comando, también con cada ubicación; el coste crece casi al cuadrado | M (rendimiento) | `engine.ts` `applyCommand`; benchmarks del motor y de infraestructura | No afecta a 3–10 jugadores. Riesgo con 15–20 o con varias salas a la vez | No | Sí, para salas grandes o eventos |
| P-3 | `command()` de `net.js` no se resuelve si el servidor responde con `error` sin id (`no_session` tras `rate_limited` o `bad_session`). En la interfaz: hoja «Antes de empezar» fija en «Preparando…» con los botones deshabilitados, y «Salir» que no hace nada; solo se sale recargando | M-A cuando ocurre; probabilidad baja | `agentes\infra` (reproducido: `leave` y `set_ready` con `pending=1`) | Pantalla congelada | No (con instrucción) | **Sí** |
| ENT-1 | `test:server` en paralelo falla en esta máquina por falta de memoria (`0xC0000409`) | — (entorno) | §5 | Ninguno en producto | No | Repetir en una máquina con memoria |

**Riesgo operativo (no es un defecto del código):**
- **R-PROC:** el servidor del puerto 8787 (PID 24080) se arrancó el **01/11**, así que tiene cargado el **motor anterior**. Pero sirve `mobile/www` desde el disco en cada petición (`server/main.ts`, `createReadStream`). Si se usa con el túnel para la prueba física, los móviles recibirían **la interfaz nueva contra el motor viejo**: la política de «listo» no se aplicaría y el anfitrión vería pistas que no corresponden al motor. **No usar ese proceso para probar este ciclo sin reiniciarlo**, y reiniciarlo requiere tu autorización.

## 7. Riesgos pendientes

### 7.1 Para la prueba física

1. **Los cambios no están desplegados.** Para probarlos con móviles hace falta:
   - publicarlos (commit y push a `mapa-real`; Render despliega), o
   - servirlos desde un servidor local con el código actual y un túnel (R-PROC).

   Las dos opciones requieren tu autorización.
2. **Reconexión en la sala sin demostrar** (corte de 45 s, página en segundo plano). En la partida está probada solo en primer plano. Además, la app redibuja con `requestAnimationFrame`, que se detiene con la página oculta: un anfitrión en segundo plano no ve cambios hasta volver a ella.
3. **Si el servicio se reinicia en mitad de la prueba** (despliegue, suspensión): las salas se pierden y puede aparecer el bloqueo por dirección (AUD-09) y una pantalla congelada (P-3). Para ese caso: **crear una sala nueva** en vez de reintentar el código viejo, y **recargar** la página si se queda fija.
4. **Arranque en frío:** abrir la URL unos minutos antes (22,4 s medidos).
5. **Radio pequeño** (50–100 m) con recentrados: AUD-01 y AUD-02.

### 7.2 Para la publicación o un evento

- AUD-09 y P-3: corregirlos. Tocan el servidor y la reconexión, zonas protegidas; requieren tu decisión.
- P-1 antes de salas de 15–20 o de varias salas a la vez.
- Una medida real de capacidad en Render (§4.5).
- Persistencia con disco de pago, si se quiere sobrevivir a reinicios.
- Desplegar desde una rama de publicación aparte.
- AUD-03 antes de un evento.
- La decisión sobre AUD-10.

### 7.3 Correcciones a la documentación del ciclo

No se han aplicado, porque esta auditoría no modifica nada:
- `INFORME_CICLO_UX.md` §1 dice que el plan gratuito «sostiene como mucho una sala de 10–15 jugadores». Es una **extrapolación**, no una capacidad demostrada (lo indica §8, pero no el resumen).
- `INFORME_CICLO_UX.md` §4 n.º 2 y §9 dan QA-01 por corregido: lo está en el motor, pero queda AUD-01 (menos de 100 m por jugador) y la parte del cliente (AUD-02).
- La prueba A9 de `sala/INFORME_SALA.md` no demostraba lo que decía (§4.2).
- La reconexión «en menos de 1 s» de `infra/INFORME_RENDER_CARGA.md` se refiere a un cierre limpio del socket, no a un corte real de red.

## 8. Limitaciones de la auditoría

- **Todo es emulación en Chrome de escritorio** (Windows) con servidores locales. No hay pruebas con móviles reales, iOS/Safari, Capacitor, el GPS real ni el mapa real. MapTiler devuelve 403 en `127.0.0.1` y se usó el radar de reserva; el revisor de interfaz desactivó el mapa en la mayoría de pruebas.
- **Producción no se ha probado en esta auditoría.** Los datos de producción son del 04/11, antes de este ciclo.
- **Memoria muy limitada** (de 0,25 a 0,7 GB libres): Chrome en un solo proceso, como mucho 2 contextos y bots por WebSocket. Escenarios sin ejecutar: §5.
- Las cifras de rendimiento son de un solo equipo (Ryzen 7 5700U) y de una sola ejecución por escenario.
- **Revisores independientes, pero no externos:** son agentes de la misma sesión. Recibieron código e informes, no las conclusiones del arquitecto, y sus resultados clave se han verificado: tests del motor reejecutados, imágenes de la guía inspeccionadas y cifras de carga contrastadas con sus registros.
- **Integridad del repositorio:** huella SHA-256 del diff más todos los archivos sin seguimiento, `b457771b…56e4b`, **idéntica al principio y al final**. `git status --porcelain` también idéntico. HEAD y `origin/mapa-real` siguen en `7d8b5a9`.

## 9. Protocolo de prueba física para varios móviles

**Base:** `QA/produccion-20261104/PROTOCOLO_PRUEBA_FISICA_MOVILES.md` (15 pasos; sigue vigente), con estas condiciones y añadidos.

### 9.1 Condiciones previas

1. Los cambios del ciclo deben estar servidos por un servidor con el **mismo** código en el motor y en la interfaz: producción tras desplegar, o un servidor local reiniciado (R-PROC). Comprobarlo:
   - la sala muestra la barra de pasos y la zona se centra sola;
   - marcar la lista de seguridad no quita el «listo» a nadie.
2. Nadie hace push a `mapa-real` durante la prueba.
3. Al menos 2 Android (uno con la PWA instalada) y, si es posible, 1 iPhone con Safari, en redes distintas.
4. Una persona apunta la hora, lo que ve cada pantalla, y hace capturas o fotos.

### 9.2 Añadidos a los pasos del protocolo

**Sala guiada (antes del paso 1):**

| # | Paso | Qué debe pasar |
|---|---|---|
| S1 | Crear la sala en exteriores, en el punto de encuentro | La zona se centra sola en menos de 30 s. Probar también denegando el permiso y concediéndolo después desde los ajustes: «Centrar la zona aquí» funciona sin recargar |
| S2 | Unirse por QR (cámara nativa), por enlace (WhatsApp) y por código | En la PWA instalada, anotar si el enlace abre la app o el navegador |
| S3 | Que una persona que **nunca ha jugado** haga de anfitrión sin ayuda | Anotar dónde duda |
| S4 | Jugadores listos. El anfitrión marca y desmarca la lista en la hoja y comparte el QR | Nadie pierde el «listo» |
| S5 | El anfitrión cambia el radio | Los demás pierden el «listo» y ven qué cambió |
| S6 | Recentrar tres veces caminando unos 25 m cada vez, con otro móvil listo | Anotar si pierde el «listo» y si se le explica (AUD-02) |
| S7 | Modo avión 45 s en un jugador de la sala, con la pantalla encendida y después con la app en segundo plano | Anotar cuándo sale «Reconectando…», si al volver aparece «Conectado» y si sigue listo |

**Partida y final (después del paso 13):**

| # | Paso | Qué debe pasar |
|---|---|---|
| F1 | Abrir la guía durante la persecución mientras llega una pista o un aviso de zona | Anotar si se pierde el aviso (AUD-04) |
| F2 | Recibir una reclamación de captura con la guía abierta | La guía se cierra y la reclamación se ve |
| F3 | Gesto «atrás» con la guía abierta (AUD-05) | Anotar qué pasa; volver a abrir la app recupera la partida |
| F4 | Mission Report en todos: leerlo, compartir por WhatsApp (sin URL ni código) y recargar (el mismo informe) | Anotar si el texto compartido lleva nombres (AUD-10) |
| F5 | El anfitrión pulsa «Revancha» mientras otros leen | Confirmar AUD-03 en móvil |
| F6 | Historial | Tras dos partidas, «Tu historial» cuenta 2 y no duplica al recargar |

**Específico de iPhone (Safari y «Añadir a pantalla de inicio»):**
- permiso de ubicación «Preguntar / Una vez» y ubicación precisa desactivada;
- safe areas en vertical y horizontal (guía, hojas, bloque fijo de «Empezar partida» y «Me han pillado» sobre la barra de inicio);
- cambiar de app 45 s en la sala y en la partida;
- Wake Lock con la pantalla bloqueada;
- hoja nativa de `navigator.share`;
- gesto de deslizar para «atrás»;
- mapa real con MapTiler;
- texto grande en Accesibilidad.

**Específico de Android:**
- teclado en pantalla al escribir el nombre y el código;
- pantalla bloqueada 2 min en la persecución (aviso de pantalla y si se siguen enviando posiciones);
- horizontal en la guía, la hoja y la reclamación.

**Si el servicio se reinicia:** crear una sala nueva (no reintentar el código viejo) y recargar las pantallas congeladas. Anotar si aparece «Demasiados intentos seguidos» (AUD-09, P-3).

### 9.3 Criterio

| Resultado | Interpretación |
|---|---|
| S1–S5, F2, F4 y F6 correctos en Android | Se acepta la sala, la guía y el informe |
| S6 y S7 | Validan o refutan AUD-02 y la reconexión en la sala |
| Cualquier fallo de S4/S5 | **Detener** y revisar la política de «listo» antes de seguir |

## 10. Recomendación final

Los cambios del ciclo son coherentes y no alteran las mecánicas protegidas: lo confirman tres revisiones independientes del diff del motor, todas las suites y los tests adicionales de la auditoría. Su ejecución en emulación es correcta en los tres modos y en las cinco causas de final. No hay ningún defecto crítico ni alto.

Pero hay reservas concretas que deben conocerse y controlarse durante la prueba:
- la reconexión en la sala no está demostrada;
- la política de «listo» deja un margen de menos de 100 m por jugador (AUD-01) y el cliente no siempre explica la invalidación (AUD-02);
- un reinicio del servicio durante la prueba puede bloquear al grupo durante un minuto y congelar pantallas (AUD-09, P-3);
- el servidor del puerto 8787 no sirve una combinación coherente de interfaz y motor (R-PROC);
- nada de esto se ha visto todavía en un móvil real.

Ninguna de ellas hace desaconsejable probar con 3–10 personas si se siguen las condiciones del §9.1 y las instrucciones del §7.1.

**Antes de publicar para el público o de un evento:**
- resolver AUD-09 y P-3;
- valorar P-1 y AUD-03;
- medir la capacidad en Render;
- repetir `test:server` en paralelo con memoria suficiente.

---

### VEREDICTO

## **B. APTO CON RESERVAS**

Se puede pasar a pruebas físicas con varios móviles, con estas reservas:

| Reserva | Condición durante la prueba |
|---|---|
| R-PROC | Servir el mismo código en el motor y en la interfaz |
| AUD-09 y P-3 | No desplegar durante la prueba; ante un reinicio, sala nueva y recargar |
| AUD-01 y AUD-02 | Vigilar con radios pequeños |
| Reconexión en la sala | Validarla en S7 |
