# THE OUTRUN · Cierre de correcciones y despliegue · ciclo `ciclo-ux-202611`

**Fecha:** 04–05/11/2026 (noche).
**Rama:** `mapa-real`. **Base:** `7d8b5a9`.
**Alcance:** corrige los defectos de `AUDITORIA_FINAL_PREVIA_PRUEBA_FISICA_R2.md`, que prevalece sobre la primera auditoría y sobre `INFORME_CICLO_UX.md`, y publica el ciclo UX completo en un único commit.

**Limitación general:** todo lo verificado es emulación en Chrome headless de escritorio y servidor local, más las comprobaciones HTTP y de protocolo contra producción del §10. **No se ha probado en ningún Android ni iPhone.** Nada de este informe afirma que la aplicación esté lista para una partida real: eso lo decide la prueba física.

## 1. Estado inicial (verificado antes de tocar nada)

| Comprobación | Resultado |
|---|---|
| Rama | `mapa-real` |
| `HEAD` y `origin/mapa-real` | `7d8b5a9` en los dos (`git ls-remote`) |
| Staged | Nada |
| Cambios locales | Los del ciclo UX (10 modificados y 14 entradas sin seguimiento, como en R2 §1) |
| Inventario | Hash SHA-1 de cada archivo y diff completo guardados fuera del repositorio (`scratchpad\cierre\inventario-inicio.txt`, `diff-inicio.patch`) |
| Procesos ajenos | Servidor del 8787 (PID 24080) y túnel. No se han tocado; el 8787 sigue con el mismo PID al final |
| Producción antes del push | `/health` 200 (`rooms:0`, ninguna partida en curso), arranque en frío 22,4 s. Los módulos nuevos daban 404 (el ciclo no estaba publicado) |

## 2. Defectos corregidos

| ID (R2) | Defecto | Corrección | Prueba que lo demuestra |
|---|---|---|---|
| **AF-01** | La referencia de la deriva era común a la sala. Caso de los 98 m: +49 m, alguien se marca listo, −49 m, y `start` se aceptaba | Cada «listo» guarda lo que aceptó el jugador: `readyRef` con la revisión de las reglas, los centros y el punto de encuentro. `configure` mide desde ahí y `start` lo vuelve a comprobar (D-062) | `engine/test/preparacion-referencia.test.ts`: 14 tests. La QA los ejecutó contra el motor antiguo y **5 fallan**, entre ellos el de los 98 m; con el nuevo pasan los 14 |
| **AF-02** | El aviso comparaba instantáneas consecutivas: tras dos recentrados de 45 m se perdía el «listo» sin explicación | El cliente recuerda lo que aceptó (`acceptedConfig`, que también sobrevive a una recarga) y explica el cambio desde ahí: «…desde que te marcaste listo». El aviso sale una vez y desaparece al volver a marcarse listo o al cambiar de fase | `mobile/test/preparacion-coherencia.test.mjs`: el motor real más la lógica del cliente; el aviso sale justo en el paso en que el motor quita el «listo» y no se repite |
| **AF-10** | La guía tapaba la tarjeta del rol y seguía abierta en la cuenta atrás | Se cierra sola al cambiar de fase o de partida y con la tarjeta del rol o de infección. No se abre durante la cuenta atrás ni con esa tarjeta visible (D-064) | `mobile/test/cierre-guia-revancha.test.mjs`; `e2e-guia` 52/52; `e2e-partidas` B1–B5 |
| **AF-09** | Imágenes de la guía con la interfaz antigua | Se revisaron las 16. Se rehicieron `sala-codigo.webp` y `final.webp` con capturas reales de la interfaz actual (mismas dimensiones). Las otras 14 están al día: pantallas de partida que este ciclo no ha cambiado | `cierre/guia/imagenes-cierre.mjs` e `imagenes-cierre.json`; originales en `cierre/guia/anteriores/`; revisadas visualmente por la QA |
| **AF-11** | La revancha (un toque) borraba el informe en todos los móviles | Copia local del último informe sin nada de ubicación (`last-report.js`), con «Ver el informe de la partida anterior» en la sala y en el inicio, y compartir. La revancha pide un segundo toque (D-063) | `cierre-guia-revancha.test.mjs`: el informe guardado es idéntico al original, sin coordenadas, sin duplicados en el historial y tolera un almacenamiento dañado; `e2e-partidas` P1–P4 con la revancha en dos toques |
| **AF-07** | Tras un reinicio, un grupo en la misma Wi-Fi quedaba bloqueado 1 min, incluso para reanudar o crear sala | El límite de 20 fallos por minuto solo cuenta y bloquea los códigos de sala erróneos. Las sesiones erróneas tienen un presupuesto aparte de 300/min. Una sesión válida siempre reanuda (D-065) | `server/test/limite-fallos-ip.test.mjs`: contra el `hub.ts` antiguo fallan 2 de 3; el tercero (los códigos erróneos siguen bloqueados) protege la protección anterior |
| **AF-08** | `command()` podía esperar para siempre | Plazo de 20 s con respuesta `no_response`; no se reenvía al reconectar (D-065) | Bloque AF-08 de `mobile/test/net-regresiones.test.mjs` (3 tests) |
| **AF-12** | El GPS del anfitrión no se volvía a comprobar al empezar | Se vuelve a leer si la última lectura tiene más de 2 min | Revisión de código. **Sin test automático** |
| **P4** (`e2e-partidas`) | Agotaba el tiempo | **Fallo del test**: «Abandonar» también existe en la cuenta atrás; el cazador salía en ella y el motor, correctamente, volvía a la sala (`team_empty`). El test espera ahora al fin de la cuenta atrás y admite la revancha en dos toques. No se ha ampliado ningún plazo | `p4\run3.log`, `run4.log` y la serie final: P4 completo |
| **A16** (`e2e-sala`) | Intermitente: tras 45 s sin red, el anfitrión veía al jugador «sin conexión» | **Carrera del test**: con la red emulada el anfitrión no llega a ver el corte, y la espera «no está sin conexión» pasaba al instante, antes de que el servidor cerrara el socket viejo. La sonda de 90 s (`sonda-socket-viejo`) reconecta en ~1 s en 3/3. Script corregido: espera «Conectado» y 3 s estables | Ver §5 y §7: el script corregido **no se llegó a ejecutar entero** (el sistema lo detuvo por falta de memoria) |
| T-01 (A12) | Carrera del script | Espera de 5 s al aviso | `e2e-sala` A12 PASA |

## 3. Decisiones técnicas

- **D-062** (completa D-058): «listo» por jugador, con revisión de reglas y referencia de zona. Se descartaron:
  - una referencia común con «congelación» al marcarse alguien, porque seguía dejando referencias incompatibles;
  - versiones en el protocolo, innecesarias: el cliente deduce el aviso.
- **D-063:** informe anterior en el móvil, y revancha en dos toques. Se descartó conservarlo en el servidor (exige cambiar el motor y el estado guardado).
- **D-064:** la guía cede ante la cuenta atrás y el rol.
- **D-065:** presupuestos de fallos por dirección separados, y plazo de 20 s para los comandos.
- **No implementado (AF-06, dos `structuredClone` por comando):**
  - Coste medido en local: ≈4 % de un núcleo con 10 jugadores y ≈15 % con 20.
  - Para una prueba de 3–10 móviles no es relevante. Optimizarlo cambia el aislamiento del estado del motor, que es la base de todas sus pruebas.
  - Recomendación para el próximo ciclo: no clonar `samples` en profundidad (son el 96 % del estado) o usar copia al escribir, con pruebas de inmutabilidad (`applyCommand` no muta su entrada) y de rendimiento.
- **No tocado:** roles, capturas y distancias, zona dinámica, condiciones de victoria, reglas de los tres modos, reconexión y WebSocket (`net.js` solo añade el plazo), identidad y sesiones (salvo el orden autenticar-antes-de-limitar de AF-07) y seguridad GPS.

## 4. Cambios por archivo (respecto a `7d8b5a9`)

**Del ciclo UX ya auditado (sin cambios de intención):** sala guiada, guía, Mission Report e historial. Archivos: `game.css`, `index.html`, partes de `app.js` y `game-view.js`, `guide.js`, `report-view.js`, `stats.js`, `guide.css`, `report.css`, `guia/*.webp`, y los tests `preparacion`, `qa-preparacion-deriva`, `sala-preparacion`, `guide`, `report-view` y `stats`.

**Corrección de esta noche:**

| Archivo | Cambio |
|---|---|
| `engine/src/types.ts` | `ReadyRef`, `Player.readyRef`, `RoomState.configRev`; se elimina `readyBase` (no publicado) |
| `engine/src/engine.ts` | `rulesChanged`, `readyRefOf`, `readyRefValid`, `readyForCurrent`; `configure`, `set_ready` y `start`; `readyRef = null` donde se quita el «listo» |
| `engine/test/preparacion-referencia.test.ts` (nuevo) | 14 tests de AF-01 |
| `engine/test/qa-preparacion-deriva.test.ts` | Comentario actualizado |
| `mobile/www/js/game-view.js` | `configChanges` (todas las versiones de zona), `acceptedConfig`, `readyResetNotice(…, accepted)`, `guideStaysOpen` |
| `mobile/www/js/app.js` | Lo aceptado por el jugador (también guardado en el móvil); cierre de la guía; informe anterior y revancha en dos toques; GPS del anfitrión al empezar; textos de ayuda del recentrado |
| `mobile/www/js/last-report.js` (nuevo) | Copia local del último informe |
| `mobile/www/js/report-view.js` | Modos `archived` y `confirmRematch` |
| `mobile/www/js/net.js` | `commandTimeoutMs` (20 s) → `no_response` |
| `mobile/www/guia/sala-codigo.webp`, `final.webp` | Capturas nuevas |
| `server/hub.ts` | Presupuesto por dirección solo para códigos; presupuesto de sesiones aparte; reanudar autentica antes de limitar |
| `server/test/limite-fallos-ip.test.mjs` (nuevo) y `hostile`, `regresiones-ciclo`, `upload` | Tests de AF-07; los tres existentes codificaban el defecto (presupuesto compartido) |
| `mobile/test/preparacion-coherencia.test.mjs`, `cierre-guia-revancha.test.mjs` (nuevos); `net-regresiones.test.mjs` y `sala-preparacion.test.mjs` | Tests de AF-02, AF-10, AF-11 y AF-08; texto nuevo del aviso |
| `QA/ciclo-ux-202611/qa/e2e-partidas.mjs`, `e2e-sala.mjs` | P4, revancha en dos toques, A12 y A16 (solo tests) |
| `QA/ciclo-ux-202611/cierre/` (nuevo) | Script e imágenes de la guía, originales sustituidas y capturas de trabajo |
| `DECISION_LOG.md`, `BACKLOG.md`, `PROJECT_STATE.md` | D-062 a D-065 y estado de cierre (sin borrar el histórico) |

**Fuera del commit, deliberadamente:** `QA/produccion-20261104/capturas-pwa/inicio-local-con-pwa.png`, una captura de trabajo anterior al ciclo. Se queda en local, sin borrar.

## 5. Pruebas ejecutadas (resultados exactos, Node v24.12.0)

| Suite | Antes del ciclo (QA) | Ahora |
|---|---|---|
| Motor y simulador (`npm test`) | 297 | **313/313** |
| TypeScript (`npm run typecheck`) | 0 errores | **0 errores** |
| Servidor (`npm run test:server`) | 136 | **139/139** |
| Cliente (`npm test --prefix mobile`) | 207 | **221/221** |
| Demo | 62 | **62/62** |
| Panel (`test:sim-panel`) | 15 | **15/15** |
| Escenarios (`test:sim-escenarios`) | 3 | **3/3** |

**E2E** (copias de los scripts del repositorio fuera de él, para no sobrescribir evidencias; servidores propios en 8874 y 8875; un Chrome cada vez):

| Escenario | Resultado | FALLA y su explicación |
|---|---|---|
| `e2e-sala` | 27 PASA / 2 FALLA | A16: carrera del test (§2). D3 p3: `ERR_INTERNET_DISCONNECTED` del corte provocado |
| `e2e-sala` (repetición) | 28 PASA / 1 FALLA | D3 p3 (ruido del corte). A16 PASA |
| `e2e-guia` | **52/52** | — |
| `e2e-infeccion` | **9/9** | — |
| `e2e-partidas` | 39 PASA / 4 FALLA | Las 4 son D3: 403 de MapTiler en 127.0.0.1 y `navigator.vibrate` sin gesto. Entorno, comprobado entrada por entrada: 0 entradas sin explicar. P1–P4 completos |
| `e2e-tiempo` (reloj ×8) | **7/7** | — |
| `sonda-socket-viejo` ×3 | **3/3** | Reconexión en ~1 s; el anfitrión no vuelve a verlo «sin conexión» |
| `e2e-sala` con A16 corregido | **No completado** | El sistema detuvo la serie por falta de memoria (6 GB de RAM y ~860 MB libres). No se relanzó, por indicación del sistema |

Registros: `scratchpad\cierre\final-*.txt` y `scratchpad\cierre\e2e\out-*.txt` (fuera del repositorio).

## 6. QA y revisión independientes

- **Revisión del diff (agente revisor): APROBADO CON DETALLES.** Sin bloqueos.
  - Ejecutó una prueba aleatoria propia: 400 semillas de hasta 60 pasos (configurar, listo, salir, volver, cambio de anfitrión, empezar) con un modelo aparte de lo aceptado. En 62 partidas empezadas, nadie empezó con otras reglas ni con la zona a ≥ 50 m de lo suyo, y `readyRef` nunca sale en la vista.
  - Detalles corregidos después: el temporizador de la revancha, `dropGuide` en la reclamación, lo aceptado sobrevive a una recarga y el comentario de privacidad de `last-report.js`.
- **QA independiente:**
  - **Validados:** AF-01, AF-02, AF-07, AF-08, AF-09 y P4.
  - **Validados con reservas:** AF-10, AF-11 y AF-12 (pruebas unitarias y de código, sin E2E específica ni móvil real), y A16 (la carrera está demostrada por los registros, pero el script corregido no se completó).
  - Sin regresiones en los recuentos.
  - Recomienda publicar para la prueba física.

## 7. Defectos y riesgos que siguen pendientes

| ID | Descripción | ¿Bloquea la prueba física? |
|---|---|---|
| AF-04 | Render gratuito sin disco: un push, un reinicio o una suspensión (15 min sin tráfico) borran las salas | No, si no se hace push durante la prueba y se abre la URL 1–2 min antes |
| AF-06 | `structuredClone` ×2 por comando (§3) | No (3–10 móviles) |
| AF-18 | Reconexión real sin demostrar: pantalla bloqueada, segundo plano, iOS, cambio de red | No: es objeto de la prueba |
| A16 | Script corregido sin ejecutar entero | No |
| R-QA-2 | En una sonda, p3 mostró «Reconectando…» otra vez a los 73 s de volver (el anfitrión lo seguía viendo conectado). Sin explicar | No; observar en la prueba |
| AF-10 y AF-12 | Sin E2E específica | No; incluidos en el protocolo |
| AF-15, AF-16, AF-17, AF-19 | «Atrás» de Android, safe areas, deduplicar capturas, apodos al compartir | No |
| Mapa real | En local MapTiler devuelve 403 y se ve el radar; el mapa real solo se ve en producción | No |

## 8. Commit y hash

Ver el anexo del §14, escrito tras el push. Por diseño, este informe va dentro del mismo commit único y no puede contener su propio hash.

## 9. Confirmación del push

Ver el §14.

## 10. Estado del despliegue de Render

Ver el §14.

## 11. URL de producción

**https://the-outrun.onrender.com**

## 12. Pruebas que quedan por hacer en móviles físicos

Protocolo completo en `AUDITORIA_FINAL_PREVIA_PRUEBA_FISICA_R2.md` §9. Además, por este cierre:
1. **AF-01 y AF-02:** alguien se marca listo y el anfitrión recentra 45 m dos veces. Ese jugador debe perder el «listo» y leer «ha cambiado la zona desde que te marcaste listo».
2. **AF-10:** un jugador con la guía abierta cuando el anfitrión empieza. La guía se cierra y se ve la cuenta atrás y luego el rol.
3. **AF-11:** al terminar, el anfitrión toca «Revancha» dos veces; en la sala, todos abren «Ver el informe de la partida anterior» y lo comparten.
4. **AF-12:** el anfitrión espera más de 2 min en la sala y empieza; se debe ver «Comprobando tu GPS…».
5. **AF-07:** si hay que reiniciar, todos en la misma Wi-Fi vuelven a entrar sin «Demasiados intentos».
6. **Reconexión:** modo avión 45 s, pantalla bloqueada 2 min, de datos a Wi-Fi, y Safari en segundo plano en iPhone.
7. **El mapa real** se carga (en producción, con la clave de MapTiler).

## 13. Instrucciones para la primera partida real

1. Al menos 3 personas (4 para Infección), con un Android y un iPhone. Batería cargada, datos móviles y ubicación precisa activada. En exteriores, en una zona sin calzadas.
2. **Nadie hace push a `mapa-real` mientras se juega.** Un push redespliega y borra la partida.
3. Abrir https://the-outrun.onrender.com 1–2 min antes (puede tardar ~25 s en despertar) y recargar del todo.
4. El anfitrión pulsa «Crear partida», espera a que la zona se centre sola y comparte el enlace o el QR.
5. Cada jugador entra, acepta el permiso de ubicación y pulsa «Estoy listo».
6. El anfitrión revisa el modo y los tiempos (para la primera, Clásico, 10 min de persecución y 2 de huida), pulsa «Empezar partida», marca la lista de seguridad en la hoja y pulsa «Empezar ya».
7. Jugar con la pantalla encendida. Si algo falla, apuntar la hora, el móvil y lo que se ve, y hacer una captura.
8. Al terminar, revisar el Mission Report en todos los móviles, compartirlo y probar la revancha.

## 14. Anexo tras el push (commit, push y verificación de Render)

_Se rellena después del push. Si este apartado está vacío en el repositorio, el resultado está en la copia local de este archivo y en el resumen final al propietario: un segundo push solo para el informe está prohibido._
