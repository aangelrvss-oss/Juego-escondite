# Máquina de estados del juego y modelo de ubicación

**Versión:** 1.0 · 24/10/2026
**Estado:** diseño propuesto [PENDIENTE]. Es la referencia que la prueba técnica implementará en versión reducida.
**Principio no negociable:** **el servidor es la única autoridad** sobre el estado, los temporizadores, los equipos, las capturas y el resultado. Los clientes envían *intenciones* (comandos). El servidor las valida y publica *hechos* (eventos).

---

## 1. Entidades mínimas

| Entidad | Contenido | Vida |
|---|---|---|
| `Room` | Código, anfitrión, jugadores, configuración actual, `created_at`, `expires_at` | Hasta 30 min de inactividad en la sala de espera o 6 h en total |
| `Game` | `game_id`, `room_id`, `mode="classic"`, configuración congelada, estado, `seq`, plazos y resultado | El resultado sin coordenadas dura 7 días [P] |
| `Player` | `player_id` (anónimo), nombre visible, `session_secret_hash`, equipo, `status` (activo, capturado, ha abandonado), `connected` y `last_seen_at` | Mientras dure la sala |
| `LocationSample` | Ver §6 | **Solo en memoria o almacenamiento efímero durante la partida. Se borra al terminar** |
| `GameEvent` | `seq`, tipo, datos sin coordenadas salvo los eventos de pista, `server_ts` | Los de pista se borran con la partida |
| `CaptureClaim` | `claim_id`, cazador, fugitivo, estado y plazos | Mientras dure la partida |

## 2. Estados

Hemos evaluado `LOBBY, READY, COUNTDOWN, HEAD_START, ACTIVE, FINISHED, CANCELLED`.

**`READY` se descarta como estado de sala.** "Listo" es una marca de cada jugador dentro de `LOBBY`. Un estado aparte solo añadiría una transición más sin aportar nada. Si el enfoque C lo necesita (por ejemplo, una revisión del árbitro), se añadirá entonces.

```
          start (host)                 t = countdown_end         t = head_start_end
 LOBBY ───────────────▶ COUNTDOWN ─────────────────▶ HEAD_START ─────────────────▶ ACTIVE
   │  ▲                     │                             │                            │
   │  └── abort (host) ─────┘                             │                            │
   │                                                      ▼                            ▼
   └── cancel / expire ──▶ CANCELLED ◀── equipo vacío ── (ver §3)        FINISHED (§4)
                                                                               │
                                                     rematch (host) ──▶ nuevo Game en LOBBY
```

## 3. Transiciones

| # | Desde → hasta | Quién la pide | Condiciones (las comprueba el servidor) |
|---|---|---|---|
| T1 | `LOBBY → COUNTDOWN` | Solo el anfitrión (`start`) | ≥ 2 jugadores conectados; ≥ 1 cazador y ≥ 1 fugitivo; configuración válida; punto de encuentro fijado; **lista de seguridad confirmada por el anfitrión**; todos marcados como listos *o* el anfitrión fuerza el inicio tras avisar (los no listos pasan a espectadores [P]) |
| T2 | `COUNTDOWN → LOBBY` | Anfitrión (`abort`) | Antes de que acabe la cuenta atrás (10 s) |
| T3 | `COUNTDOWN → HEAD_START` | **Temporizador del servidor** | `now ≥ countdown_end`. Se congela la configuración |
| T4 | `HEAD_START → ACTIVE` | **Temporizador del servidor** | `now ≥ head_start_end` |
| T5 | `ACTIVE → FINISHED` | **Servidor** | (a) `now ≥ game_end` o (b) no queda ningún fugitivo activo o (c) no queda ningún cazador activo (§5.3) |
| T6 | `HEAD_START/ACTIVE → FINISHED` | Anfitrión (`end_game`) | Confirmación doble en la app. Resultado: "Terminada por el anfitrión", **sin ganador** |
| T7 | `LOBBY → CANCELLED` | Anfitrión (`cancel`) o servidor | Cancelación o caducidad de la sala |
| T8 | `FINISHED → (nuevo Game) LOBBY` | Anfitrión (`rematch`) | En los 30 min siguientes al final. Se conservan los jugadores que acepten |

**Comandos siempre rechazados** (se registran como intento): cualquier transición pedida por quien no es el anfitrión; T3, T4 y T5(a) pedidas por un cliente; unirse a un `Game` que ya no está en `LOBBY` (**no se puede entrar a una partida empezada**, como medida contra el seguimiento); cambiar la configuración fuera de `LOBBY`.

## 4. Resultado final

| Causa | Resultado |
|---|---|
| Tiempo agotado con ≥ 1 fugitivo activo | Ganan los **fugitivos** |
| Todos los fugitivos capturados | Ganan los **cazadores** |
| Ningún fugitivo activo porque todos se han ido (sin capturas pendientes) | **Sin ganador**: "Los fugitivos abandonaron" |
| Ningún cazador activo (todos se han ido) | **Sin ganador**: "Los cazadores abandonaron" [P: podría darse la victoria a los fugitivos] |
| El anfitrión la termina | **Sin ganador** |

El resultado lo calcula y publica **solo el servidor**, en el evento `game_finished`, con la causa y la lista de capturas (quién, a quién y en qué minuto, **sin coordenadas**).

## 5. Casos límite

### 5.1 El anfitrión se desconecta
- La partida **sigue en el servidor**, porque no depende de ningún móvil.
- Si está desconectado más de 120 s, los privilegios de anfitrión pasan al jugador conectado que más tiempo lleve en la sala. Se emite el evento `host_changed`.
- Si vuelve, recupera la condición de jugador, no la de anfitrión. [P]

### 5.2 Un jugador se desconecta (sin abandonar)
- Sigue en juego. Su ubicación pasa a `STALE` y después a `UNAVAILABLE` (§6.3).
- Si es un fugitivo y llega una pista, los cazadores reciben su **última posición conocida con su antigüedad** ("hace 4 min"). Esto evita que desconectar el GPS sea una forma de esconderse. [P: valorar una penalización por desconexión prolongada]

### 5.3 Un jugador abandona (`leave`)
- Pasa a `status = left`, **deja de compartir su ubicación al instante** y sus muestras se borran.
- Si era el último de su equipo, se aplica T5(b) o T5(c) con el resultado "sin ganador" correspondiente.
- No puede volver a entrar en esa partida (sí en la revancha).

### 5.4 Capturas simultáneas
- Cada comando lleva un `command_id` (UUID). El servidor procesa los comandos **en serie por partida**, como un actor de un solo hilo.
- Un fugitivo solo puede tener **una** captura pendiente. La segunda se rechaza con `already_pending`.
- Un cazador solo puede tener **una** captura pendiente a la vez.
- Si un fugitivo se autodeclara capturado mientras hay una captura pendiente de un cazador, la captura se atribuye a ese cazador.
- Si dos cazadores reclaman al mismo fugitivo, gana el primero que el servidor procesa.

### 5.5 El temporizador vence durante una desconexión
- Los temporizadores son del servidor (plazos absolutos `*_end` en hora del servidor). Un cliente desconectado **no afecta** a las transiciones.
- Al reconectar, el cliente recibe la instantánea con la hora del servidor y corrige su desfase de reloj. La interfaz nunca calcula el estado oficial con su reloj local.

### 5.6 Reanudar
- El cliente guarda `room_id`, `player_id` y `session_secret` en el almacenamiento seguro del móvil.
- Al reconectar envía `resume { last_seq }`. El servidor responde con los eventos posteriores a `last_seq` si los conserva, o con una instantánea completa si no.
- Las posiciones guardadas mientras no había red se envían marcadas con su `measured_at`. **El servidor nunca las presenta como actuales** (§6.2).

### 5.7 Eventos duplicados
- Comandos idempotentes por `command_id`: si llega uno repetido, se devuelve la misma respuesta.
- Eventos con un `seq` que crece de forma estricta. El cliente descarta los `seq` que ya ha aplicado.

> **Corrección tras S0 (D-020):** un único `seq` por sala no sirve, porque con el filtrado por audiencia cada cliente vería saltos legítimos y no podría distinguirlos de pérdidas reales. El `seq` es **por destinatario**: cada jugador tiene su propio flujo contiguo, y la reanudación (`resume { last_seq }`) usa ese flujo. La sala mantiene aparte un registro de auditoría con numeración global.

### 5.8 Pausas
- No hay pausa en el MVP. [P]

## 6. Ubicación: modelo de datos y semántica

### 6.1 Campos de cada muestra

| Campo | Origen | Uso |
|---|---|---|
| `lat`, `lng` | Dispositivo | Coordenada recibida |
| `accuracy_m` | Dispositivo (radio horizontal declarado) | Validar la cercanía en capturas y la salida de zona |
| `measured_at` | Dispositivo (hora del fix GPS) | Antigüedad real de la medida |
| `received_at` | Servidor | Cuándo llegó |
| `clock_offset_ms` | Calculado en la sincronización de reloj | Corregir `measured_at` |
| `age_ms` | Servidor: `now − measured_at_corregido`. Si la hora corregida es posterior a `received_at` o la diferencia supera 60 s, se usa `received_at` y se marca `clock_suspect` | Clasificar el estado |
| `is_mock` | Dispositivo (bandera de ubicación simulada de Android o `isSimulatedBySoftware` de iOS, si está disponible) | Indicio de trampa; **no es una prueba** |
| `speed_mps`, `heading` | Dispositivo (opcional) | Detectar velocidades implausibles |
| `availability` | Servidor | `CURRENT`, `STALE` o `UNAVAILABLE` |

> **Corrección tras S0 (D-021):** la regla de `age_ms` de la tabla anterior es peligrosa en su segunda parte. Si se usara `received_at` cuando la diferencia supera 60 s, una muestra guardada sin cobertura durante minutos parecería actual. La regla implementada es:
> - Si `measured_at` (ya convertido a la hora del servidor) es **posterior** a `received_at` + 2 s: se usa `received_at`, se marca `clock_suspect` y la muestra **nunca** es `CURRENT` ni sirve para capturas.
> - En cualquier otro caso se respeta `measured_at`, aunque sea muy antiguo: la muestra se clasifica como `STALE` o `UNAVAILABLE` según su antigüedad real.

### 6.2 Reglas
1. Una muestra con `age_ms > 15 s` **nunca se muestra como actual**.
2. Las muestras que llegan tarde (guardadas sin red) solo actualizan la última posición conocida si son más recientes que la que ya hay.
3. Las pistas incluyen siempre la antigüedad ("hace 12 s", "hace 3 min").
4. Nunca se registran coordenadas en los logs de diagnóstico. En los logs solo aparecen identificadores, tiempos, precisión y contadores.

### 6.3 Estados de disponibilidad [umbrales a calibrar en la prueba técnica]

| Estado | Condición | Lo que ve el resto |
|---|---|---|
| `CURRENT` | `age ≤ 15 s` y precisión ≤ 50 m | Punto normal |
| `STALE` | 15 s < `age` ≤ 120 s, o precisión > 50 m | Punto atenuado con "hace X" |
| `UNAVAILABLE` | `age > 120 s`, sin muestras o permiso revocado | "Sin señal desde hace X", con la última posición en gris si existe |

### 6.4 Visibilidad (quién recibe qué)

| Fase | Cazador recibe | Fugitivo recibe |
|---|---|---|
| `HEAD_START` | A sus compañeros cazadores en directo. **Nada de los fugitivos** | A sus compañeros fugitivos en directo |
| `ACTIVE` | A sus compañeros en directo + **pistas** + fugitivos fuera de zona en directo | A sus compañeros en directo. **Nunca a los cazadores** |
| Capturado | — | Espectador: todos con 60 s de retraso [P] |
| `FINISHED` | Nada. Se corta el reparto de ubicaciones y se borran las muestras | Igual |

El filtrado se hace **en el servidor, antes de enviar**. Nunca se envían datos que luego el cliente oculta.

### 6.5 Salida de la zona
- Se considera fuera si `distancia_al_centro − accuracy_m > radio` (ante la duda, a favor del jugador).
- Si sigue fuera durante 30 s, es visible en directo para el otro equipo hasta que vuelve. Se avisa al jugador al salir y a los 15 s.

## 7. Captura

Dos vías, ambas con **interacción explícita**:

**A. Autodeclaración del fugitivo** (`self_tag`). El fugitivo pulsa "Me han pillado" y elige al cazador (o "no lo sé"). Se acepta sin comprobar el GPS, porque reconoce algo que le perjudica.

**B. Declaración del cazador** (`claim_tag {runner_id}`). El servidor comprueba:
1. Que la partida está en `ACTIVE` y el fugitivo está activo y sin capturas pendientes.
2. Que las posiciones de ambos son `CURRENT` (`age ≤ 15 s`). **Nunca se acepta con posiciones antiguas.**
3. Que la precisión de cada uno es ≤ 30 m [H].
4. Cercanía plausible: `distancia ≤ 5 m + accuracy_cazador + accuracy_fugitivo`, con un tope de 40 m [H: calibrar].

Si pasa la comprobación, el fugitivo recibe un aviso prioritario: **"¿Te ha pillado Ana?" — [Sí] / [No]**, con 30 s para responder.
- **Sí**: captura confirmada.
- **No**: rechazada y el cazador recibe el aviso. Si un mismo fugitivo rechaza 3 veces, el servidor lo registra [P].
- **Sin respuesta en 30 s**: **no hay captura** (ante la duda, a favor del fugitivo) y ambos reciben un aviso. [P: reconsiderar si incentiva ignorar los avisos]

**Norma física** (en las reglas del juego): una captura es **un toque suave en el hombro o el brazo y decir "¡Pillado!"**. Prohibido agarrar, empujar o perseguir por la calzada. Además, **no vale capturar en la calzada ni en pasos de peatones**.

**Lo que no prometemos:** el GPS no puede confirmar un contacto físico ni detectar todas las manipulaciones. La verificación reduce las capturas imposibles, no las elimina.

## 7 bis. Aclaraciones tomadas al implementar S0 [P: pendientes de aprobación]

La documentación no fijaba estos puntos. El motor de S0 los implementa así, y cualquiera de ellos se puede cambiar:

| Punto | Comportamiento en S0 |
|---|---|
| `duración` de la partida | Duración de la fase `ACTIVE` (no incluye la ventaja inicial) |
| Inicio forzado con jugadores no listos | **No implementado**: `start` exige que todos los jugadores de la sala de espera estén conectados y listos |
| Reparto de "Aleatorio" | Objetivo `ceil(n/4)` cazadores (mínimo 1, como mucho `floor(n/2)`), con las preferencias fijas respetadas y un sorteo determinista con semilla |
| Final mixto (unos capturados y el último fugitivo se va) | Si el último fugitivo activo **se va**: "sin ganador". Si es **capturado**: ganan los cazadores |
| Ubicación de los capturados | Dejan de compartirla y sus muestras se borran (minimización). Ven a los demás con 60 s de retraso |
| Salida de la zona | Solo se expone a **fugitivos**, según §6.4. `PRODUCT_STRATEGY.md` §5 dice "quien pasa más de 30 s fuera", sin distinguir equipo: **es una incoherencia que hay que resolver** |
| Plazo de exposición si salió durante la ventaja | La gracia de 30 s cuenta desde el inicio de `ACTIVE` |
| Límite de intentos de entrada | Cuentan todos los intentos (válidos o no): 10 por minuto y dispositivo |
| Revancha | Invitados: quienes jugaron la partida, incluidos los que se fueron *durante* ella. No se invita a los expulsados ni a quienes salieron de la sala |

## 8. Medidas contra trampas (realistas)

| Medida | Lo que consigue | Lo que no consigue |
|---|---|---|
| Autoridad del servidor más validación de comandos | Impide declarar estados o resultados arbitrarios | — |
| Bandera de ubicación simulada | Detecta la simulación más básica | Es eludible en dispositivos con root o jailbreak |
| Velocidad máxima plausible (> 12 m/s sostenidos → marcar) | Detecta saltos y vehículos | No detecta una simulación lenta |
| Registro de los marcados, visible en el resultado [P] | Presión social entre amigos | No impide la trampa |

---

## 9. Extensiones de diseño de la sesión 4 [PROPUESTA técnica: no implementada]

Las reglas están en `docs/product/GAME_MODES_AND_RULES.md`. Esta sección describe **cómo** encajarían en el motor. El motor y las pruebas de S0 **no se han modificado**.

### 9.1 Modo como estrategia de reglas
- La configuración tiene `mode: 'classic' | 'infection'`, congelada al empezar.
- Las diferencias se concentran en tres puntos del motor:
  1. `onCaptureConfirmed`: en Clásico, el capturado pasa a espectador; en Infección, se convierte (§9.2).
  2. `checkEnd`: las condiciones de victoria de cada modo.
  3. `canTag`: en Infección comprueba también `canTagFrom`.
- La máquina de estados (§2–§3) **no cambia**: los dos modos recorren las mismas fases.

### 9.2 Infección: transición en el motor
- Campos nuevos en `Player`: `convertedAt`, `infectedBy`, `canTagFrom`.
- Un solo paso: el fugitivo debe estar activo → se registra la captura con `captureId` → se borran sus muestras → `team = 'hunter'` → se emiten `runner_infected` (a todos) y `role_changed` (al convertido) → `checkEnd`.
- **Permisos:** `visiblePositions` y `canReceive` ya calculan con el equipo *actual*, así que el cambio de visibilidad es inmediato. Las bandejas por destinatario (D-020) guardan mensajes ya filtrados, de modo que una reconexión no filtra nada nuevo. Falta decidir, por parámetro, si `lastPing` se le muestra en la instantánea.
- **Plazo nuevo** (`dueList`): ninguno es estrictamente necesario, porque `canTagFrom` se comprueba al reclamar. Opcionalmente, un evento `tag_enabled` a `canTagFrom` para avisar al convertido.

### 9.3 Asignación de equipos y rondas
- La configuración de la sala tiene `teamAssignment: { method: 'auto' | 'manual', hunterRatio }` y `roundPolicy: 'redraw' | 'first_captured' | 'balanced' | 'manual'`.
- `resolveTeams` se sustituye por un reparto puro por política, que recibe `(jugadores, política, historial de la sesión, semilla)`. El historial de la sesión (rondas de cada jugador como cazador inicial, orden de capturas de la última ronda) vive en `RoomState` y **se borra con la sala**.
- Comandos nuevos: `assign_team` manual (ya existe, pero hoy trabaja con preferencias) y `rematch { roundPolicy }`, que sustituye a `swapRoles` (D-037).

### 9.4 Zona dinámica
- `config.zone` pasa a admitir **varias versiones** (hoy el validador de S0 las rechaza: `LIMITS.maxZoneVersions = 1`). Lo más probable es que el servidor genere el calendario al empezar a partir de los parámetros, y lo valide con las reglas de seguridad (§6.3 de las reglas).
- Plazos nuevos en `dueList`: `zone_warning` a `cambio − T_aviso` y `zone_change` en `cambio`.
- En `zone_change` se **reevalúa a todos** los jugadores activos con su última muestra (hoy solo se evalúa al llegar una muestra) y se reinicia `outsideSince` con la gracia de cambio.
- **Cazadores fuera de la zona (D-033):** se registra `outsideSince` también para ellos. Su única consecuencia es que `canTag` sea falso; nunca se exponen.

### 9.5 Escáner
- Comando `scan` (solo cazadores en `ACTIVE`). El servidor cuenta los fugitivos activos con muestra `CURRENT` a menos de `R_escaneo` y responde **solo** `{ count }`.
- Estado por cazador: `scansLeft` y `scanCooldownUntil`. Evento opcional `scanned` a los fugitivos dentro del radio, sin datos del cazador.

### 9.6 Disputas
- `TagClaim` gana el estado `disputed`, y la sala guarda los enfriamientos por pareja `(cazador, fugitivo) → hasta`.
- `claimTag` rechaza con `dispute_cooldown` durante el enfriamiento. El resultado incluye `disputes` por jugador.

### 9.7 Desfase entre S0 y el diseño de la sesión 4
| Punto | S0 | Diseño de la sesión 4 |
|---|---|---|
| Versiones de zona | Una (el validador rechaza más) | Varias |
| Reevaluación de la zona | Al llegar una muestra | También en cada cambio de zona |
| Cazadores fuera de la zona | Sin efecto | No pueden capturar (D-033) |
| Reparto | Preferencias + `ceil(n/4)` | Automático o manual con proporción y límites |
| Revancha | `swapRoles` | Políticas de ronda |
| Rechazo de captura | Termina la reclamación | Disputa con enfriamiento |
| Modos | Solo Clásico | Clásico e Infección |
| Comentarios del código | `engine/src/constants.ts` y `engine/test/zone.test.ts` dicen "fuera del MVP" | Habrá que actualizarlos cuando se apruebe D-030 (sin tocarlos en esta sesión) |

### 9.8 Actualización de la sesión 5
- **Infección (§9.2):** ampliación futura (D-030). La propuesta técnica se conserva.
- **D-033 aprobada:** los cazadores fuera de la zona no pueden confirmar capturas y no se exponen. **S0 no lo implementa.**
- **Disputas (§9.6):** D-035 exige que la disputa quede pendiente y se resuelva antes del final con una autoridad explícita. Cambio técnico propuesto: `TagClaim` con estado `disputed` que **no** caduca a "sin captura" durante la partida. Se resuelve con `accept_tag` (fugitivo) o `withdraw_tag` (cazador). Un nuevo estado de cierre, `RESOLVING`, entre `ACTIVE` y `FINISHED`, solo si hay disputas abiertas al acabar el tiempo, con el plazo `T_resolución` y la regla predeterminada. **Si se aprueba, este estado amplía la máquina de §2.**
- **Rondas (§9.3):** solo las políticas `redraw` y `first_captured` (D-037). `balanced` pospuesta. `swapRoles` de S0 no está aprobado.
