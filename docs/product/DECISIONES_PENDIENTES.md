# Decisiones pendientes: análisis y recomendaciones (26/10/2026)

Análisis de las contradicciones abiertas entre el Plan Maestro v1.0 (fuera del repositorio, 22 págs.) y este repositorio, más las piezas de D-035 que siguen sin cerrar. **No modifica ninguna decisión**: cada recomendación es una propuesta y el registro (`DECISION_LOG.md`) solo cambiará cuando el propietario decida. Ninguna de estas propuestas se ha implementado.

Leyenda de la última columna del resumen: **Sí** = no se implementa nada sin aprobación expresa; **Parcial** = una parte se puede hacer sin decidir (se indica cuál).

## Resumen

| ID | Tema | Recomendación | ¿Necesita tu aprobación? |
|---|---|---|---|
| D-043 | Radio por equipos | El Plan sustituye a D-006, pero por pasos: primero un prototipo aislado de voz por WebRTC entre los miembros de cada equipo, sin grabar; mientras tanto, canal externo como plan B declarado | **Sí**: cambia D-006, pide micrófono y puede tener coste (servidor TURN) |
| D-044 | PWA | Las dos cosas: web instalable (manifest y service worker mínimo) **y** app Android para jugar con la pantalla bloqueada | **Sí**: cambia D-005 |
| D-045 | Siguiente modo · **Resuelta el 30/10/2026 (D-057): Infección y Caza del zorro en este ciclo; THE RACE y Sardines fuera** | **Revisada con la guía (26/10, noche):** ningún modo nuevo hasta cerrar HUNT, y después elegir entre THE RACE e INFECTION por valor demostrado en las pruebas (guía), no por un orden fijo (Plan) | **Sí**: el Plan y la guía no coinciden |
| D-046 | Número de jugadores | Motor en 2–20; la interfaz deja de anunciar 20 y recomienda 4–10 hasta probarlo en la calle | **Parcial**: el cambio de texto es pequeño, pero decide qué se promete |
| D-047 | Pistas y capturados | Pistas aproximadas (zona, no punto) y los capturados dejan de ver a los cazadores | **Sí**: cambia el equilibrio del juego |
| D-035 | Disputas de captura | Procedimiento de `GAME_MODES_AND_RULES.md` §9.3, con «sin captura» como regla predeterminada | **Sí**: falta aprobar la regla predeterminada y la ventana de resolución |
| (nueva) | Estados CHECKS, BRIEFING y PAUSED | Mantener CHECKS y BRIEFING como pasos de la sala, sin fases nuevas; PAUSED solo tras decidir quién pausa y qué pasa con los plazos | **Sí** para PAUSED |
| D-053 | Pausar o cancelar (guía §7) | Cancelar ya existe («Terminar partida» del anfitrión y abandono). Pausa solo del anfitrión, que congela todos los plazos y avisa a todos; nunca automática | **Sí** |
| D-055 | Proveedor de cartografía del mapa real | MapTiler para las pruebas (clave pública limitada y revocable); antes de un uso público, decidir proveedor, coste y condiciones (atribución, uso comercial), y si se autoaloja (Protomaps). Ver `mobile/MAPA.md` | **Sí**: coste, condiciones y privacidad (el proveedor ve la IP y la zona consultada) |
| D-054 | Revisar las decisiones técnicas de las sesiones autónomas | Confirmarlas, salvo que quieras otra cosa en la pantalla encendida (D-051), por su coste de batería | **Sí** |

---

## D-043 · Radio privada por equipos

**Plan Maestro:** PM-D-003 y §4.3 (pág. 7): «requisito fijo de producto». Voz en tiempo real por equipo, preferiblemente pulsar para hablar. Estados visibles (conectada, silenciada, transmitiendo, degradada). Un cambio de equipo actualiza los permisos al instante. No se graba el audio. Si el micrófono no está disponible, se explica y no se bloquea la partida cuando haya un plan B decidido. Prueba técnica temprana en la PWA real (F1, punto 10).

**Registro:** D-006 (aprobada, sesión 2): «sin chat ni radio de equipo en el MVP».

**Código:** no hay voz ni uso del micrófono. La sala dice «Sin chat». El servidor solo admite mensajes de texto de hasta 4 KB por WebSocket, así que no transporta audio.

**Alternativas:**

| Opción | Arquitectura | Juego | Privacidad | Mantenimiento y coste |
|---|---|---|---|---|
| A. Sin radio en el MVP (D-006) | Nada | Los jugadores usan su propio grupo de voz o mensajería | El juego no toca audio | Ninguno; contradice el Plan |
| B. WebRTC entre los miembros de cada equipo (malla), con señalización por el WebSocket actual | El servidor solo reenvía la negociación; el audio va de móvil a móvil, cifrado (DTLS-SRTP). Con datos móviles hace falta un servidor TURN | Funciona bien hasta ~5 por equipo; con más, el consumo de batería y datos crece | El servidor no recibe el audio. Un TURN ve tráfico cifrado y las IP | TURN propio (coturn) o de pago. Código de cliente moderado |
| C. Servidor de medios (SFU, p. ej. LiveKit) | Nuevo servicio con su despliegue | Escala a equipos grandes y gestiona mejor la reconexión | El SFU recibe el audio (cifrado en tránsito, descifrado en el servidor salvo E2EE) | Coste por minuto o servidor propio; dependencia nueva |
| D. Mensajes de voz cortos (mantener pulsado, enviar clip) | Subida y reenvío por el servidor | No es tiempo real | Hay que guardar el audio, aunque sea un momento: choca con «no se graba» | Simple; contradice el Plan |

**Recomendación:** que el Plan sustituya a D-006, en dos pasos:
1. **Prototipo aislado (opción B)**, fuera de la partida: dos o tres móviles en un canal, pulsar para hablar, silencio visible y reconexión. Mide latencia, batería y si sigue sonando con la pantalla bloqueada en el navegador y en la app Android. Es la prueba temprana que el Plan pide en F1.
2. Solo con el prototipo validado, integrarlo en HUNT. **Mientras tanto, plan B explícito** (el Plan lo permite): la pantalla de reglas dice que la voz se hace por otro canal.

Motivo: B no necesita servidor de medios, el audio no pasa por nuestro servidor y aprovecha la señalización que ya existe. La pregunta principal no es técnica sino del sistema operativo: si el navegador mantiene el audio con la pantalla bloqueada. Eso solo se responde con móviles reales.

**Necesita tu aprobación:** sí. Cambia una decisión aprobada (D-006), pide un permiso nuevo (micrófono) y puede requerir un servidor TURN (coste y un tercero que ve las IP).

---

## D-044 · Cliente PWA

**Plan Maestro:** PM-D-002 y §1.3 (pág. 3): «la primera experiencia debe ser una web app instalable (PWA)», compartible por enlace, código o QR. §9 pide validar la instalación, la actualización y una URL estable.

**Registro:** D-005 (propuesta, nunca aprobada): se descarta la PWA como cliente de juego porque, con la pantalla bloqueada, el navegador deja de enviar la ubicación. H1/H2 eligieron Capacitor (Android) con un servicio nativo que sí envía con la pantalla bloqueada.

**Código:** la misma interfaz (`mobile/www`) funciona como app Android y como web servida por el servidor. La web ya permite jugar (enlace, QR, comprobación de GPS, partida y Mission Report; `web-flow.e2e.mjs` 30/30), pero **no es instalable**: no hay manifest ni service worker.

**Alternativas:**
1. **Solo app nativa (D-005):** hay que instalar una APK antes de jugar; no hay iPhone. El enlace de invitación abre una web que, aun así, ya funciona.
2. **Solo PWA (Plan al pie de la letra):** cualquiera entra con un enlace, iPhone incluido. Con la pantalla bloqueada se pierde la ubicación: un fugitivo que guarda el móvil desaparece del radar. Es el mayor riesgo del juego.
3. **Las dos (recomendada):** la web se hace instalable y la app Android se mantiene para quien quiera jugar con la pantalla bloqueada. El código de juego es el mismo.

**Consecuencias de la opción 3:**
- Arquitectura: un manifest y un service worker pequeño. Hay que gestionar las versiones del service worker para que nadie se quede con una interfaz antigua incompatible con el servidor.
- Juego: el jugador de navegador debe mantener la pantalla encendida, y hay que decírselo antes de empezar. Ya se le avisa en el README; faltaría avisarle en la propia pantalla.
- Privacidad: sin cambios. El service worker no guardaría datos de la partida.
- Mantenimiento: dos formas de entrar, un solo código.

**Necesita tu aprobación:** sí, porque cambia el sentido de D-005. El manifest es técnicamente pequeño, pero instalar una PWA es una promesa de producto («instálala y juega») que hoy no se cumple con la pantalla bloqueada.

---

## D-045 · INFECTION

**Plan Maestro:** PM-D-004 y §5.2 (pág. 9): modo completo, «prioridad alta». En el roadmap va en la Fase 4, después de HUNT (F2) y THE RACE (F3). Anexo A: P1.

**Registro:** D-030 (aprobada): el primer modo jugable es Clásico; Infección es una ampliación futura con el diseño conservado.

**Código:** nada de INFECTION. El motor solo tiene Clásico. El diseño está en `GAME_MODES_AND_RULES.md`.

**Alternativas:** (1) seguir el orden del Plan, HUNT → THE RACE → INFECTION; (2) adelantar INFECTION a THE RACE, ya que reutiliza casi todo HUNT (equipos, capturas, GPS) y THE RACE necesita sistemas nuevos (destino, llegada, transporte); (3) esperar.

**Consecuencias:** INFECTION toca el motor (cambio de equipo durante la partida), la vista autorizada (el infectado pasa a ver lo que ven los cazadores al instante) y, si hay radio, los permisos de voz. Adelantarla es más barato que THE RACE, pero el Plan (§1.4) prohíbe añadir modos antes de una partida completa en dispositivos reales.

**Recomendación (revisada el 26/10 por la noche, con la guía de criterio):** no empezar ningún modo hasta cerrar HUNT con dispositivos y jugadores reales (Plan §1.4 y guía §3). Después, elegir entre THE RACE e INFECTION por valor demostrado, coste y riesgo (guía §4, P2), con las pruebas de HUNT como evidencia. Esto contradice el orden fijo del Plan (PM-D-007), así que tienes que decidir cuál manda. Antes recomendaba confirmar el orden del Plan.

**Necesita tu aprobación:** solo que confirmes el orden. No se implementa nada ahora.

---

## D-046 · Número de jugadores

**Plan Maestro:** §2.2 (pág. 4): «4-10 jugadores al inicio; no presentar cifras superiores como soportadas hasta probarlas». §12.1 y §9: partidas completas con 4–10 antes de afirmar esa capacidad.

**Registro:** D-019 (propuesta): de 2 a 20.

**Código:** `engine/src/constants.ts` (`minPlayers: 2`, `maxPlayers: 20`). La sala muestra «x/20» (`mobile/www/js/app.js`). Las simulaciones cubren hasta 20; las pruebas con navegadores reales, hasta 5. **Nunca se ha jugado en la calle.**

**Alternativas:**
1. Dejarlo como está: la interfaz promete 20 sin evidencia, contra el Plan.
2. Cambiar solo el mensaje: el motor sigue en 2–20 y la sala dice «recomendado 4–10». No promete una capacidad que no se ha probado.
3. Cambiar también el motor a 4–10: impide la prueba de campo con 2 móviles, que es la siguiente prueba posible.

**Recomendación:** opción 2. Un mínimo de 4 bloquearía la primera prueba real, y bajar el máximo a 10 no aporta seguridad: solo la promesa importa.

**Necesita tu aprobación:** parcialmente. El cambio de texto es pequeño y va en la línea del Plan, pero decide qué se promete al jugador. Lo dejo sin hacer hasta que lo confirmes.

---

## D-047 · Pistas exactas y espectadores

**Plan Maestro:** §5.1 (pág. 9): «la geolocalización no debe revelar automáticamente escondites con precisión falsa». §3.1 (pág. 5): el observador «no es obligatorio en MVP» y «no debe revelar ubicación… a los jugadores activos». §4.1: los rivales solo se muestran si el modo lo permite.

**Registro:** D-034 (aprobada): el diseño futuro contempla **pistas aproximadas** con usos limitados, y el escáner no revela coordenadas exactas por defecto.

**Código:**
- **Pista periódica:** cada `pingIntervalMs`, los cazadores reciben la última posición medida de cada fugitivo activo, con su precisión y antigüedad (`engine/src/engine.ts`, `doPing`). Es la posición tal cual, no una zona.
- **Capturados:** un fugitivo capturado ve a **todos** los jugadores activos, cazadores incluidos, con 60 s de retraso (`engine/src/view.ts`, `spectator_delayed`).
- Lo que ya se protege (comprobado en esta revisión): los fugitivos nunca reciben posiciones de cazadores; la última pista solo la recibe un cazador activo; al terminar la partida se borran las lecturas y se purgan las coordenadas de los eventos guardados para reanudar; el archivo de persistencia no guarda coordenadas.

**El riesgo concreto:** un capturado sigue en la calle y suele hablar con sus amigos fugitivos. Con 60 s de retraso puede decirles dónde están los cazadores, justo lo que el Plan prohíbe.

**Alternativas para la pista:**
1. Posición medida (actual): sencilla y legible, pero «precisión falsa» si la lectura es mala, y revela el escondite exacto.
2. **Zona aproximada:** un círculo de radio fijo (p. ej. 100 m, hipótesis D-038) que contiene al fugitivo, con el centro desplazado al azar. No revela el escondite y se calcula en el motor sin cambiar el protocolo.
3. Solo dirección y distancia aproximada desde cada cazador.

**Alternativas para los capturados:**
1. Igual que ahora.
2. **Solo ven a su propio equipo** (los fugitivos que siguen libres), con retraso. Siguen enganchados al juego sin poder delatar a los cazadores.
3. No ven a nadie hasta el final.

**Recomendación:** pista como zona aproximada (2) y capturados que solo ven a su equipo (2). Las dos reducen datos personales enviados y se implementan en el motor y la vista, que tienen pruebas de privacidad.

**Necesita tu aprobación:** sí. Cambia cómo se juega (los cazadores pierden precisión y los capturados información), y el radio de la zona es un parámetro que hay que calibrar en la calle.

---

## D-035 · Disputas de captura (aprobada en principio, procedimiento pendiente)

**Aprobado (sesión 5):** una captura disputada queda pendiente, sin eliminar al fugitivo; debe poder resolverse antes del final; no se presupone un anfitrión árbitro; la autoridad tiene que ser explícita.

**Plan Maestro:** §3.3: «no hay capturas ambiguas: el briefing explica el criterio de captura y el sistema indica cuándo se ha validado».

**Código: no cumple todavía lo aprobado.** Si el fugitivo responde «No», la reclamación se cierra en el acto como `rejected`, sin captura. El fugitivo acumula un contador, y a la tercera recibe la marca `repeated_tag_rejections`, que solo aparece en el final. El cazador puede volver a reclamar 3 s después. Si nadie responde en 30 s, la reclamación caduca sin captura. No hay estado «disputada», ni forma de resolverla después, ni aparece en el Mission Report.

**Alternativas:**
1. **Procedimiento §9.3 (recomendado):** el «No» deja la reclamación **disputada** y el fugitivo sigue jugando. Hasta el final, el fugitivo puede aceptarla o el cazador retirarla. Si al terminar sigue abierta, hay una ventana corta de resolución (hipótesis: 2 min) y después se aplica la **regla predeterminada «sin captura»**. El Mission Report lista las disputas y cómo se resolvieron.
2. Decidir por la cercanía GPS registrada en la reclamación: exige guardar posiciones hasta el final, contra la minimización de datos y contra la desconfianza en el GPS que pide el Plan.
3. Arbitraje del anfitrión: el propietario lo descartó como supuesto por defecto.

**Consecuencias de la opción 1:**
- Arquitectura: un estado nuevo en el motor y un final en dos pasos (FINISHED espera a la ventana). Hay que actualizar el protocolo y la persistencia.
- Juego: el fugitivo no pierde por una lectura dudosa, y el cazador ve que su reclamación no se ha olvidado.
- Privacidad: no guarda posiciones.
- Mantenimiento: es la parte más delicada del motor (plazos y final). Tiene que llevar pruebas de los casos límite: final con disputas abiertas, abandono o desconexión durante la disputa y reinicio del servidor.

**Necesita tu aprobación:** sí, para la regla predeterminada (§9.3, [PREGUNTA]), la duración de la ventana y si el final espera a la ventana. Sin eso no implemento nada, porque cambiar cuándo termina una partida altera el resultado.

---

## Estados CHECKS, BRIEFING y PAUSED (Plan §2.3)

**Plan Maestro:** LOBBY → CHECKS (permisos, GPS, conexión y radio) → BRIEFING (roles y reglas fijados) → COUNTDOWN → ACTIVE → PAUSED/DEGRADED (incidencias del sistema, con la misma explicación para todos) → FINISHED o CANCELLED.

**Código:** las fases son `LOBBY`, `COUNTDOWN`, `HEAD_START`, `ACTIVE`, `FINISHED` y `CANCELLED`. Lo que el Plan pide en CHECKS y BRIEFING ya existe **dentro de la sala**:

| Plan | Equivalente actual | Comprobado |
|---|---|---|
| CHECKS | Al pulsar «Estoy listo», cada móvil comprueba que da una posición GPS. Nadie queda listo sin ella. La sala muestra quién está sin conexión | `gps-check.test.mjs`, `lobby-status.test.mjs`, `web-flow.e2e.mjs` |
| BRIEFING | Tarjeta de reglas con los valores de la partida. Cambiar la configuración quita el «listo» a todos (vuelven a aceptar las reglas nuevas). Configurar, asignar equipos y expulsar solo se puede en `LOBBY`; la versión de reglas queda fijada al empezar | `briefing.test.mjs`, pruebas del motor y `rules-version.test.ts` |
| COUNTDOWN y huida | `COUNTDOWN` (5 s, sin roles) y `HEAD_START` (D-042) | Motor y E2E |
| PAUSED/DEGRADED | **No existe.** Si el servidor cae y se reinicia con `STATE_FILE`, la partida sigue con el reloj del servidor: el tiempo de la caída cuenta como jugado | `persistence.test.mjs` y `crash.test.mjs` |

**Recomendación:** no crear fases CHECKS y BRIEFING en el motor. Añadirían estados y transiciones sin una regla nueva que proteger, y el criterio del Plan ya se cumple en la sala. PAUSED sí cambia reglas, y necesita respuestas tuyas: quién pausa (¿solo el sistema, o también el anfitrión?), si se congelan los plazos de huida, la persecución y las reclamaciones, y si un reinicio del servidor debe pausar automáticamente.

**Necesita tu aprobación:** sí para PAUSED. Mantener CHECKS y BRIEFING como pasos de la sala es una lectura del Plan que te pido confirmar, pero no requiere cambiar código.

---

## Contraste con la Guía de criterio v1.0 (26/10/2026, noche)

Guía: `docs/product/THE_OUTRUN_Guia_de_criterio_y_desarrollo.docx` (copia idéntica al original). Es transversal: no sustituye al Plan, a las reglas ni al registro (guía §1). Aquí se registra lo que no coincide y lo que la guía obliga a revisar. **No se ha resuelto nada.**

### Funciones de cada documento (guía §10, adaptada a lo que ya existe)
| Función | Documento | Nota |
|---|---|---|
| Qué producto se construye | Plan Maestro (PDF fuera del repositorio) | Trazabilidad: `PLAN_MAESTRO_TRAZABILIDAD.md` |
| Cómo se prioriza y se evalúa | La guía | Nuevo |
| Cómo funciona cada modo | `GAME_MODES_AND_RULES.md` | Fuente única de reglas |
| Contrato técnico | `docs/technical/GAME_STATE_MACHINE.md` y `server/protocol.ts` | **Sin revisar** frente a H2 en esta sesión |
| Qué se ha decidido y qué falta | `DECISION_LOG.md` y este documento | |
| Qué existe y con qué evidencia | `PROJECT_STATE.md` y `QUALITY_STATE.md` | |
| Cómo se verifica | `ACCEPTANCE_CRITERIA.md` y los procedimientos de prueba (`mobile/PRUEBA_*.md`, `S1_ANDROID_PROTOCOL.md`) | |
| Qué queda y en qué orden | `BACKLOG.md` | Reordenado con las prioridades de la guía |

### Contradicciones y tensiones
| Tema | Plan Maestro | Guía | Registro y código | Dónde |
|---|---|---|---|---|
| Radio | Requisito fijo (PM-D-003) | Pregunta abierta: ¿compensa su complejidad? (§13) | D-006: sin radio en el MVP; no hay código | D-043 |
| Siguiente modo | Orden fijo: THE RACE y después INFECTION (PM-D-007), INFECTION «prioridad alta» | Elegir por valor demostrado (P2) | D-030: Clásico primero | D-045 |
| Pausa | Solo por incidencias del sistema (§2.3) | «Forma clara de pausar o cancelar» (§7) | Se puede terminar o abandonar; no hay pausa | D-053 |
| Criterio de salida de HUNT | «Dos partidas consecutivas completas… sin reiniciar el backend» (F2) | «Partidas consecutivas… el protocolo debe fijar cuántas» (§5) | **No hay contradicción**: el número lo da el Plan. Los procedimientos de prueba deben adoptarlo | `PRUEBA_REAL_EN_CALLE.md`, actualizado |
| Proceso | — | Proponer → autorizar → implementar (§11) | Las sesiones autónomas implementaron decisiones técnicas reversibles | D-054 |
| Objetivos numéricos | — | «No fijar objetivos cuantitativos arbitrarios antes de obtener una primera línea base» (§9) | `PRODUCT_STRATEGY.md` §9 fija umbrales: ≤ 5 min hasta empezar, ≥ 90 % de partidas sin fallo, ≥ 40 % con revancha. Están marcados como hipótesis | Recomendación: tratarlos como referencias que se fijarán tras la primera línea base, no como criterios de éxito. Lo decides tú |

### Riesgos que la guía obliga a mirar (seguridad, privacidad y justicia)
1. **«Una advertencia no arregla una mecánica peligrosa» (§7).** Hoy la seguridad depende de textos: la lista del anfitrión, las reglas, el aviso nocturno y las normas de captura. La mecánica de captura es un toque suave confirmado en la app, sin agarrar ni empujar, y cumple la guía. Pero nada impide una zona con calzadas: la app no puede comprobarlo (`USER_FLOWS.md` F5.5). Necesita una decisión, por ejemplo un constructor de zonas que excluya vías (`COMPETITIVE_ANALYSIS.md`).
2. **«No exigir correr mirando la pantalla» (§7).** En el navegador, la pantalla tiene que seguir encendida (D-051), lo que invita a llevar el móvil en la mano. En la app no hace falta. Hay que observarlo en la prueba con jugadores.
3. **Información por rol y necesidad (§3, §7).** Los capturados ven a los cazadores con 60 s de retraso y las pistas son posiciones exactas. Es D-047, todavía abierta.
4. **Justicia percibida (§2, §6).** El umbral de captura (≤ 30 m de precisión, lecturas de ≤ 15 s) y el filtro de saltos (12 m/s) son hipótesis (D-038). La guía pide no exigir una precisión que los móviles no garantizan: solo se puede comprobar en la calle. Y una captura disputada sigue cerrándose sin captura al instante (D-035 sin implementar).
5. **Conservación de datos (§7 y §13).** Las lecturas se borran al terminar la partida y nunca van al archivo de estado. Pero no hay una política escrita de conservación (cuánto, para qué), ni revisión legal. Es una tarea del backlog (`PRIVACY_AND_COMPLIANCE.md`).
6. **Evidencia (§3 y §8).** Los recuentos de pruebas del motor, el servidor, el cliente, la demo y H1 son de grupos distintos y no se suman. Ninguno demuestra que el juego funcione en móviles reales ni que sea divertido. `QUALITY_STATE.md` se ha corregido en ese sentido.

### Requisitos según su evidencia
| Evidencia | Requisitos |
|---|---|
| Solo simulación o pruebas automáticas | Reglas del motor (capturas, zona, pistas, final y revancha), filtrado por equipo, idempotencia, persistencia y reconexión |
| Además, en Chrome de escritorio con emulación (no en un móvil) | Flujo completo de 3–4 jugadores, enlace, QR decodificado por un lector de prueba, declaración de edad, permiso retirado, pantalla encendida, recarga y Mission Report |
| Con un dispositivo real | Solo H1: una sesión corta de GPS en un Xiaomi 14T, con la pantalla apagada. **El CSV de esa prueba no está en el repositorio ni en este ordenador: falta analizarlo (guía §6)** |
| Con jugadores reales | **Nada.** Ni una partida, ni medidas de diversión o comprensión (guía §9) |

---

## Auditoría de las decisiones técnicas de las sesiones autónomas (D-054, 27/10/2026)

Revisión de los commits locales desde `4c190a0`, contrastados con el Plan Maestro, la guía de criterio y las decisiones aprobadas. **No se ha revertido nada.** Para cada cambio: propósito, a qué afecta, riesgos, evidencia y recomendación.

| Cambio (commit) | Propósito y fuente | Tipo de cambio | Riesgos | Evidencia | Recomendación |
|---|---|---|---|---|---|
| Filtro de saltos del GPS, D-049 (`952b158`) | Plan §4.1 («filtrar saltos imposibles… si hay duda, pedir que espere») y §10 (un salto aislado no debe validar una captura) | **Afecta a las reglas:** añade un motivo para rechazar una captura. No cambia ninguna regla aprobada | Con mala señal (calles estrechas) puede rechazar reclamaciones válidas varias veces seguidas: retraso de 5–10 s por intento. El umbral de 12 m/s es una hipótesis (D-038). Quien falsifica la ubicación ya podía evitar capturas antes; el filtro no le da una vía nueva | 8 pruebas del motor con lecturas simuladas. **Nada con GPS real** | **Mantener**: lo pide el Plan. Calibrarlo en la primera prueba de calle, contando los rechazos por salto (la prueba del navegador lo pide) |
| Persistencia opcional, D-050 (`9d44bd8`; pruebas `3d9e9e8` y otras) | Plan §8.1 (persistencia con retención mínima); que la partida sobreviva a un reinicio del ordenador del organizador | **Arquitectura y privacidad.** Se activa a propósito (`STATE_FILE`) | Guarda en disco nombres, identificadores de instalación, equipos y **el centro de la zona, que sale de la posición GPS del anfitrión** al pulsar «Centrar la zona aquí». No guarda lecturas ni secretos. **Defecto encontrado y corregido el 27/10:** en Windows, el guardado fallaba (`EPERM`) si otro programa tenía el archivo abierto, y el guardado final al apagar se podía perder (ver `QUALITY_STATE.md`) | Pruebas con el servidor real, incluido el proceso terminado sin aviso. Sin uso real | **Mantener como opción**, y que la documentación diga claramente que el centro de la zona es una ubicación. Decidir cuánto se conserva y dónde (guía §7 y §13) antes de usarla con personas ajenas |
| Pantalla encendida en el navegador, D-051 (`cebf485`) | Sin pantalla encendida, el navegador no da la ubicación: un fugitivo desaparecería del radar | **Experiencia y seguridad.** Solo en el navegador; la app no cambia | Batería (sin medir). **Invita a llevar el móvil en la mano**, y la guía §7 pide no premiar mirar la pantalla al correr. Si el navegador no lo permite, solo queda un aviso | `screen.test.mjs` y Chrome de escritorio (la petición se concede). **Nada en móviles** | **Mantener mientras se juegue en el navegador**: sin ella el juego no funciona ahí. Observar en la prueba con jugadores si aumenta el uso del móvil al correr. A medio plazo, la solución es la app (D-044) |
| Lectura nueva con el móvil quieto, D-051 (`dc845c3`) | Que la posición de un fugitivo escondido no caduque (15 s) y se le pueda capturar | **Justicia del juego**, solo en el navegador | Algo más de batería. El umbral de 8 s es experimental | `game.test.mjs` (geolocalización simulada). **Nada en móviles** | **Mantener.** La prueba con móviles debe confirmar la antigüedad real (la prueba del navegador, paso 4.3) |
| Declaración de edad, D-052 (`7fa52be`) | Implementa D-008, **aprobada** | Aplica una decisión de producto ya tomada | Es una autodeclaración, sin verificación (como dice D-008). Se recuerda en el móvil | Chrome de escritorio (sin la casilla no se crea ninguna sala) | **Mantener** |
| Aviso nocturno, D-052 (`b2a3134`) | AC-B3 (propuesto) y `USER_FLOWS.md` F5.6 | **Experiencia y seguridad.** Solo un aviso | El horario de 21:00 a 7:00 es una hipótesis. La guía §7 dice que un aviso no arregla una mecánica peligrosa: es un recordatorio, no una medida de seguridad | `night.test.mjs`; en Chrome solo se ha visto de noche | **Mantener** como recordatorio. Decidir el horario o usar la puesta y la salida del sol |
| Normas de captura en la tarjeta del rol (`b2a3134`) | AC-B4 (propuesto) | Texto, sin cambiar las reglas | Ninguno relevante | Chrome de escritorio | **Mantener** |
| Límite de 5 salas por dirección (`efd1235`) | Que una sola dirección no ocupe las 100 salas del servidor | **Técnico** (abuso). Se puede configurar (`MAX_ROOMS_PER_IP`) | Detrás del túnel **sin** `TRUST_PROXY=1`, el límite es para todos. Con operadoras que comparten IP (CGNAT), dos grupos desconocidos podrían compartir el límite | 4 pruebas con el servidor real | **Mantener.** Los procedimientos de prueba ya exigen `TRUST_PROXY=1` |
| Avisos antiguos que no se repiten (`b339ae4`) | Plan, Fase 1 («una reconexión no duplica eventos») | **Experiencia** | El umbral de 15 s es arbitrario: un aviso perdido de 16 s solo actualiza el estado, sin vibrar. La reclamación pendiente y la revelación del rol durante la huida sí avisan siempre | Pruebas del cliente y del servidor, y Chrome (con mutación) | **Mantener** |

**Ninguno contradice una decisión aprobada.** Tres afectan a la experiencia o a la seguridad y necesitan validarse con personas: la pantalla encendida, el filtro de saltos y la lectura con el móvil quieto. Uno afecta a la privacidad: la persistencia guarda el centro de la zona. **Todos se pueden revertir por separado** (un commit cada uno).
