# Criterios de aceptación del MVP

**Versión:** 1.0 · 24/10/2026 · **Estado:** propuesta [PENDIENTE]
Formato: **Dado** (contexto) / **Cuando** (acción) / **Entonces** (resultado comprobable). Cada criterio indica cómo se verifica:
- **[U]** prueba unitaria del motor
- **[I]** prueba de integración con clientes simulados
- **[D]** prueba en dispositivo real
- **[M]** revisión manual

Los umbrales marcados con [H] se recalibrarán tras la prueba técnica. **Ningún criterio está cumplido todavía.**

> **Estado en la sesión 5:** varios criterios se han **superado solo en simulación** en S0 (103 pruebas automatizadas; ver la trazabilidad en `QUALITY_STATE.md`). Superar un criterio en simulación **no** equivale a cumplirlo en el producto. Ningún criterio que dependa de un dispositivo (D8, D9, H1–H4, etc.) está cumplido. Todos los umbrales numéricos son **hipótesis** (D-038).

---

## A. Acceso y salas

| ID | Criterio | Verif. |
|---|---|---|
| AC-A1 | **Dado** un usuario nuevo, **cuando** abre la app, **entonces** no puede continuar sin declarar que tiene 18 años o más ni sin un nombre visible válido (2–20 caracteres) | D, M |
| AC-A2 | **Cuando** se crea una sala, **entonces** el servidor devuelve un código de 6 caracteres de un alfabeto sin caracteres ambiguos, único entre las salas activas, y la sala caduca a los 30 min sin actividad en la sala de espera | U, I |
| AC-A3 | **Dado** un código inexistente o caducado, **cuando** alguien intenta entrar, **entonces** recibe el error correspondiente y el intento cuenta para el límite de 10 intentos por minuto por dispositivo [H] | I |
| AC-A4 | **Dada** una partida fuera de `LOBBY`, **cuando** alguien intenta entrar con el código, **entonces** se rechaza y no recibe ningún dato de la partida ni de ubicaciones | U, I |
| AC-A5 | **Dado** un enlace de invitación, **cuando** se abre en un móvil con la app instalada, **entonces** la app se abre en la pantalla de unirse con el código ya puesto | D |
| AC-A6 | **Cuando** el anfitrión pulsa [Mostrar QR], **entonces** el QR contiene el mismo enlace y se puede escanear con la cámara del sistema | D |
| AC-A7 | **Cuando** el anfitrión expulsa a un jugador en la sala de espera, **entonces** ese jugador sale y no puede volver a entrar en esa sala | I |

## B. Configuración y seguridad previa

| ID | Criterio | Verif. |
|---|---|---|
| AC-B1 | El servidor rechaza cualquier configuración fuera de los rangos de `MVP_SCOPE.md` §2, aunque el cliente la envíe | U |
| AC-B2 | El servidor no permite `start` sin punto de encuentro ni sin la lista de seguridad confirmada | U |
| AC-B3 | Entre las 21:00 y las 7:00 (hora local del anfitrión) [P], se muestra el aviso de juego nocturno antes de empezar | M |
| AC-B4 | Las normas de captura (toque suave, nada de calzada) aparecen en la pantalla de rol de F6 | M |

## C. Motor y autoridad del servidor

| ID | Criterio | Verif. |
|---|---|---|
| AC-C1 | Solo el anfitrión puede `start`, `abort`, `end_game`, `cancel`, `rematch` y cambiar la configuración. Cualquier otro jugador recibe `forbidden` y el estado no cambia | U, I |
| AC-C2 | Ningún cliente puede provocar `COUNTDOWN→HEAD_START`, `HEAD_START→ACTIVE` ni el fin por tiempo. Solo el temporizador del servidor | U |
| AC-C3 | **Dado** un cliente con el reloj adelantado o atrasado 10 min, **entonces** las transiciones y la cuenta atrás que muestra siguen la hora del servidor (error de visualización ≤ 1 s tras sincronizar) [H] | I, D |
| AC-C4 | El mismo comando con el mismo `command_id` aplicado dos veces produce un único efecto y la misma respuesta | U |
| AC-C5 | Los eventos llevan un `seq` que crece de forma estricta. El cliente ignora los `seq` ya aplicados | U, I |
| AC-C6 | El resultado final lo calcula solo el servidor según la tabla de `GAME_STATE_MACHINE.md` §4. Hay una prueba por cada fila | U |
| AC-C7 | **Dado** que el anfitrión lleva desconectado más de 120 s, **entonces** sus privilegios pasan al jugador conectado más antiguo y todos reciben `host_changed` | U, I |
| AC-C8 | **Dado** que se desconectan todos los clientes, **entonces** la partida sigue en el servidor y termina por tiempo a su hora | I |

## D. Ubicación y visibilidad

| ID | Criterio | Verif. |
|---|---|---|
| AC-D1 | Durante `HEAD_START`, ningún cazador recibe ningún dato de ubicación de ningún fugitivo (comprobado leyendo el tráfico recibido por el cliente cazador) | I |
| AC-D2 | Durante `ACTIVE`, un fugitivo nunca recibe la ubicación de un cazador | I |
| AC-D3 | Los cazadores reciben las posiciones de los fugitivos **solo** en eventos de pista o mientras el fugitivo lleva más de 30 s fuera de la zona | U, I |
| AC-D4 | Toda posición mostrada a otro jugador incluye su antigüedad. Con `age > 15 s` se muestra como no actual | U, D |
| AC-D5 | Una posición enviada tarde (guardada sin red) no sustituye a una más reciente y no se muestra como actual | U |
| AC-D6 | Cuando la partida pasa a `FINISHED` o el jugador abandona, el cliente deja de enviar posiciones en ≤ 10 s y el servidor borra sus muestras [H] | I, D |
| AC-D7 | Los logs del servidor no contienen coordenadas (revisión automática de los logs de prueba buscando patrones de latitud y longitud) | I, M |
| AC-D8 | **Dado** el móvil bloqueado durante 30 min en `ACTIVE`, **entonces** el servidor recibe ≥ 80 % de las muestras esperadas, sin huecos de más de 30 s [H] | **D (Android e iOS por separado)** |
| AC-D9 | Si el permiso de ubicación se revoca durante la partida, el estado del jugador pasa a `UNAVAILABLE` y se le avisa | D |

## E. Captura

| ID | Criterio | Verif. |
|---|---|---|
| AC-E1 | La autodeclaración del fugitivo en `ACTIVE` se acepta y produce `runner_captured` | U |
| AC-E2 | La declaración de un cazador se rechaza si alguna de las dos posiciones tiene `age > 15 s` | U |
| AC-E3 | La declaración de un cazador se rechaza si `distancia > 5 m + acc_c + acc_f` (tope 40 m) o si alguna precisión es > 30 m [H] | U |
| AC-E4 | Una declaración plausible solo se convierte en captura si el fugitivo confirma en 30 s. Si rechaza o no responde, no hay captura | U, I |
| AC-E5 | Si hay dos declaraciones simultáneas sobre el mismo fugitivo, solo se procesa una y la otra recibe `already_pending` o `already_captured` | U, I |
| AC-E6 | Una captura fuera de `ACTIVE`, o sobre un fugitivo ya capturado o que ha abandonado, se rechaza | U |
| AC-E7 | El mensaje de captura rechazada no revela la posición ni la distancia del fugitivo | I, M |

## F. Resiliencia

| ID | Criterio | Verif. |
|---|---|---|
| AC-F1 | Tras 60 s en modo avión, al recuperar la red el cliente se resincroniza en ≤ 10 s, sin eventos duplicados ni perdidos [H] | D |
| AC-F2 | Tras cerrar la app a la fuerza y volver a abrirla durante la partida, el jugador vuelve a su partida con el estado correcto | D |
| AC-F3 | Un jugador que abandona no puede volver a entrar en esa partida y su equipo sigue jugando | I |

## G. Final y revancha

| ID | Criterio | Verif. |
|---|---|---|
| AC-G1 | La pantalla de resultados no muestra mapas, coordenadas ni recorridos | M |
| AC-G2 | La revancha crea una partida nueva en `LOBBY` con la misma sala y la configuración anterior. Solo entran los jugadores que aceptan | I |
| AC-G3 | Los datos de ubicación de la partida anterior ya no existen en el servidor al empezar la revancha | I |

## H. Requisitos no funcionales [H: umbrales a calibrar en la prueba técnica]

| ID | Criterio | Verif. |
|---|---|---|
| AC-H1 | Latencia de propagación de eventos de estado (p95) ≤ 1 s con 4G y buena cobertura | D |
| AC-H2 | Consumo de batería con la pantalla apagada, en una partida de 60 min con envío cada 5 s: ≤ 10 %/h en el Android de referencia | D |
| AC-H3 | La app funciona en el Android del propietario y en un iPhone (versiones mínimas por fijar tras la prueba técnica) | D |
| AC-H4 | Toda la comunicación va cifrada (TLS) y el secreto de sesión se guarda en el almacenamiento seguro del sistema | M |

---

## Criterios añadidos en la sesión 4 [BORRADOR]

Dependen de D-030 (alcance) y de los parámetros de `GAME_MODES_AND_RULES.md`. Los valores van en forma simbólica (`T_transición`, `K`…) hasta que se aprueben. **Ninguno está implementado ni probado.**

## I. Modo Infección [AMPLIACIÓN FUTURA: no aplica a la primera versión jugable (D-030)]

| ID | Criterio | Verif. |
|---|---|---|
| AC-I1 | **Dada** una captura confirmada en Infección, **entonces** en el mismo paso el fugitivo pasa a `team = hunter` y se emite un único `runner_infected` con un `captureId` único | U |
| AC-I2 | **Desde** la conversión, el convertido no recibe ninguna posición de fugitivos ni ningún evento con audiencia de fugitivos. Los fugitivos no reciben ninguna posición suya | U, I |
| AC-I3 | El convertido no puede declarar capturas antes de `canTagFrom` (`forbidden` o `transition_active`) | U |
| AC-I4 | Dos confirmaciones simultáneas sobre el mismo fugitivo producen una conversión y un rechazo. Repetir el `commandId` no produce una segunda conversión | U, I |
| AC-I5 | Si no queda ningún fugitivo activo por conversiones: FINISHED con victoria de los cazadores. Si se agota el tiempo con ≥ 1 fugitivo libre: victoria de los supervivientes | U |
| AC-I6 | Al reconectar, el convertido no recibe mensajes de cazador anteriores a su conversión ni posiciones antiguas de fugitivos | I |
| AC-I7 | Las muestras de ubicación que tenía como fugitivo se borran en la conversión | U |

## J. Asignación de equipos y rondas

| ID | Criterio | Verif. |
|---|---|---|
| AC-J1 | El servidor rechaza cualquier configuración con 0 cazadores o 0 fugitivos, o fuera de los límites seguros aprobados para el modo y el tamaño `n` | U |
| AC-J2 | Sorteo automático: con la misma semilla, sala y ronda, el reparto es idéntico. El número de cazadores es `clamp(round(n × proporción), mín, máx)` | U |
| AC-J3 | Selección manual: solo el anfitrión asigna equipos. [Empezar] se rechaza si un equipo está vacío | U |
| AC-J4 | Opción B: los `K` primeros capturados por orden del servidor son los cazadores iniciales. Se aplican los casos límite aprobados (menos de `K` capturas, ausentes, sin capturas) | U |
| AC-J5 | Opción C (cuando se apruebe la regla): a lo largo de `m` rondas con `n` constante, la diferencia entre el jugador con más y el de menos rondas de cazador es ≤ 1 | U |

## K. Zona dinámica [DISEÑO PREVISTO: no es requisito de S1 (D-032)]

| ID | Criterio | Verif. |
|---|---|---|
| AC-K1 | Cada cambio de zona se anuncia exactamente `T_aviso` antes, con la zona nueva incluida en el aviso | U |
| AC-K2 | Toda zona generada cumple la contención y la regla "nadie necesita correr" (`GAME_MODES_AND_RULES.md` §6.3). El generador nunca produce un calendario que las incumpla (prueba con muchas semillas) | U |
| AC-K3 | Tras un cambio, el estado dentro o fuera de cada jugador se recalcula con su última muestra, y la gracia se reinicia (`T_gracia_cambio`) | U |
| AC-K4 | Un cazador fuera de la zona no puede declarar capturas y nunca se expone a los fugitivos | U, I |
| AC-K5 | El radio nunca baja de `R_min` | U |
| AC-K6 | El aviso de cambio de zona llega con el móvil bloqueado | **D** |

## L. Pistas y escáner [el escáner es diseño futuro (D-034); L1 ya está cubierto en simulación]

| ID | Criterio | Verif. |
|---|---|---|
| AC-L1 | Toda entrada de una pista incluye una antigüedad calculada con `measured_at` (o marcada como sospechosa) y nunca se presenta como actual si `age > 15 s` | U (ya cubierto en S0) |
| AC-L2 | El escáner solo devuelve un número. La respuesta no contiene identificadores, posiciones, distancias ni direcciones | U, I |
| AC-L3 | El escáner respeta el cupo y el enfriamiento. Fuera de `ACTIVE` se rechaza | U |
| AC-L4 | El escáner solo cuenta muestras `CURRENT` de fugitivos activos | U |
| AC-L5 | La exactitud real de la ubicación de las pistas, comparada con un punto de referencia, se mide y documenta | **D** (T12) |

## M. Disputas [ajustar a D-035: la disputa queda pendiente y se resuelve antes del final; AC-M1 y AC-M2 describen la versión de la sesión 4]

| ID | Criterio | Verif. |
|---|---|---|
| AC-M1 | Un rechazo deja la reclamación como disputada, avisa a ambos y aplica el enfriamiento entre esa pareja | U |
| AC-M2 | Durante el enfriamiento, una nueva reclamación de ese cazador sobre ese fugitivo se rechaza. Pasado el enfriamiento, se evalúa con posiciones nuevas | U |
| AC-M3 | El resultado final incluye el recuento de disputas por jugador, sin coordenadas | U |

## N. Avisos

| ID | Criterio | Verif. |
|---|---|---|
| AC-N1 | Por defecto, todos los avisos solo vibran. El sonido solo suena si el jugador lo activa | **D** |
| AC-N2 | El comportamiento con el modo silencio y no molestar en Android e iOS queda documentado | **D** |

### M bis. Disputas según D-035 [BORRADOR, sesión 5]

| ID | Criterio | Verif. |
|---|---|---|
| AC-M4 | Una reclamación disputada deja al fugitivo **activo**. Ninguna captura se registra hasta que se resuelve | U |
| AC-M5 | Solo el fugitivo (aceptar) o el cazador (retirar) pueden resolver una disputa antes del final. Ningún otro jugador, tampoco el anfitrión, puede hacerlo | U |
| AC-M6 | Si quedan disputas abiertas al acabar el tiempo, el resultado final no se publica hasta resolverlas o hasta que venza la ventana de resolución. Al vencer se aplica la regla predeterminada aprobada y el resultado indica cómo se resolvió cada una | U |

### S1. Criterios de salida de S1 (Android)
Se definen en `docs/technical/S1_ANDROID_PROTOCOL.md` (pruebas S1-Txx). Todos sus umbrales son **experimentales** (D-038).
