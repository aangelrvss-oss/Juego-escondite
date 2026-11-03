# Informe de diagnóstico · THE OUTRUN

- Origen: `diagnostico-20261030-235741.jsonl` · 176 hechos.
- Desde 30/10/2026, 23:57:43 hasta 31/10/2026, 11:00:34 (662 min 52 s).
- Arranques del servidor: 1 · paradas limpias: 0.
- Limitaciones: solo cuenta lo que llegó al servidor. Lo que pasó solo en un móvil (avisos en pantalla, errores del GPS del teléfono, qué fase mostraba) no está aquí.

## Alertas

- Al menos un cierre del servidor no fue limpio (o el registro se copió con el servidor en marcha).
- Ningún hecho registrado durante 180 min 3 s (de 0:10:49 a 3:10:52) con una partida en juego: lo más probable es que el servidor no estuviera en marcha (¿ordenador suspendido?).
- S2 · partida 1: J2 estuvo 2 min 43 s seguidos sin conexión.
- S2 · partida 1: al pasar a Persecución (0:06:55) estaban sin conexión J2 (lo verían al reconectar).
- S2 · partida 1: J1 pasó 1 min 14 s sin lecturas de GPS aceptadas.
- S2 · partida 1: J1 tuvo 2 ventana(s) de juego sin ninguna lectura aceptada (0:07:19, 0:08:19).
- S2 · partida 1: J2 pasó 2 min 52 s sin lecturas de GPS aceptadas.
- S2 · partida 1: J2 tuvo 5 ventana(s) de juego sin ninguna lectura aceptada (0:07:19, 0:07:49, 0:08:19, 0:08:49, 0:09:19).
- S2 · partida 2: J1 estuvo 649 min 50 s seguidos sin conexión.
- S2 · partida 2: J2 estuvo 649 min 50 s seguidos sin conexión.
- S2 · partida 2: al pasar a Cancelada (3:10:52) estaban sin conexión J1, J2 (lo verían al reconectar).
- S2 · partida 2: J1 tuvo 1 ventana(s) de juego sin ninguna lectura aceptada (3:10:52).
- S2 · partida 2: J2 tuvo 1 ventana(s) de juego sin ninguna lectura aceptada (3:10:52).
- Errores enviados a los móviles: removed ×2.

## Sala S1

- Jugadores: J1, J2. Partidas: 1.

### Partida 1
- Desde 0:00:12 hasta 11:00:34. Fases: Cuenta atrás (0:00:14) → Huida (0:00:19) → Final (0:00:27) → Cancelada (3:10:52).
- Configuración: persecución 20 min, huida 2 min, pistas cada 3 min, radio 400 m.
- **Resultado:** sin ganador · causa ended_by_host · 0 capturas · persecución de 0 s.

**Jugadores y conexión** (cortes según el servidor; «tiempo sin conexión» desde que el servidor lo detecta hasta que el móvil reanuda):

| Jugador | Rol | Cortes | Tiempo sin conexión (total / más largo) | Cierres de conexión (motivo) | Reanudaciones |
|---|---|---|---|---|---|
| J1 | cazador | 0 | — | — | 0 |
| J2 | fugitivo | 0 | — | — | 0 |

**GPS** (resúmenes cada 30 s y en cada cambio de fase; solo lecturas que llegaron al servidor):

| Jugador | Lecturas aceptadas | Frecuencia en juego | Mayor hueco | Ventanas vacías | Precisión típica / peor | Antigüedad peor | Ignoradas (motivo) |
|---|---|---|---|---|---|---|---|
| J1 | 1 (WebSocket 1 · app 0) | 8.6/min | — | 0 | 6 m / 6 m | 15 s | wrong_phase ×2, not_newer ×1 |
| J2 | 1 (WebSocket 1 · app 0) | 8.6/min | — | 0 | 6 m / 6 m | 16 s | wrong_phase ×2 |

**Capturas**

_Nada registrado._

<details><summary>Cronología completa</summary>

| Hora | Hecho |
|---|---|
| 0:00:12 | J1 crea la sala |
| 0:00:13 | J2 entra |
| 0:00:14 | J1: configure |
| 0:00:14 | J1: configure |
| 0:00:14 | Fase: **Cuenta atrás** (online: J1, J2) |
| 0:00:14 | J1: start |
| 0:00:19 | Fase: **Huida** (online: J1, J2) |
| 0:00:27 | **Fin: sin ganador** (ended_by_host, 0 capturas) |
| 0:00:27 | Fase: **Final** (online: J1, J2) |
| 0:00:27 | J1: end_game |
| 0:00:27 | J2 sale |
| 0:00:27 | J2: leave |
| 0:00:28 | J1 sale |
| 0:00:28 | J1: leave |
| 3:10:52 | Sala cerrada (closed) |
| 3:10:52 | Fase: **Cancelada** (online: nadie) |

</details>

## Sala S2

- Jugadores: J1, J2. Partidas: 1, 2.

### Partida 1
- Desde 0:02:35 hasta 0:10:12. Fases: Cuenta atrás (0:04:50) → Huida (0:04:55) → Persecución (0:06:55) → Final (0:10:12).
- Configuración: persecución 20 min, huida 2 min, pistas cada 3 min, radio 400 m.
- **Resultado:** ganan los cazadores · causa all_captured · 1 capturas · persecución de 3 min 17 s.

**Jugadores y conexión** (cortes según el servidor; «tiempo sin conexión» desde que el servidor lo detecta hasta que el móvil reanuda):

| Jugador | Rol | Cortes | Tiempo sin conexión (total / más largo) | Cierres de conexión (motivo) | Reanudaciones |
|---|---|---|---|---|---|
| J1 | cazador | 2 | 3 s / 2 s | client_1001 ×2 | 2 |
| J2 | fugitivo | 1 | 2 min 43 s / 2 min 43 s | socket_error ×1 | 1 |

**GPS** (resúmenes cada 30 s y en cada cambio de fase; solo lecturas que llegaron al servidor):

| Jugador | Lecturas aceptadas | Frecuencia en juego | Mayor hueco | Ventanas vacías | Precisión típica / peor | Antigüedad peor | Ignoradas (motivo) |
|---|---|---|---|---|---|---|---|
| J1 | 74 (WebSocket 74 · app 0) | 14.1/min | 1 min 14 s | 2 | 7 m / 32 m | 40 s | wrong_phase ×3, not_newer ×24, too_soon ×1 |
| J2 | 85 (WebSocket 85 · app 0) | 16.1/min | 2 min 52 s | 5 | 13 m / 28 m | 3 s | wrong_phase ×1, too_soon ×6 |

**Capturas**

| Hora | Hecho | Resultado |
|---|---|---|
| 0:09:37 | J1 reclama a J2 (R1) | rejected a los 2 s |
| 0:10:10 | J1 reclama a J2 (R2) | confirmed a los 2 s |
| 0:10:12 | J2 capturado (claim) | por J1 |

<details><summary>Cronología completa</summary>

| Hora | Hecho |
|---|---|
| 0:02:35 | J1 crea la sala |
| 0:04:10 | J2 entra |
| 0:04:25 | J1: configure |
| 0:04:37 | J1: configure |
| 0:04:46 | J1: configure |
| 0:04:50 | Fase: **Cuenta atrás** (online: J1, J2) |
| 0:04:50 | J1: start |
| 0:04:55 | Fase: **Huida** (online: J1, J2) |
| 0:06:50 | J2: conexión cerrada (socket_error, duró 2 min 40 s) |
| 0:06:50 | J2 **pierde la conexión** |
| 0:06:55 | Fase: **Persecución** (online: J1; **sin conexión: J2**) |
| 0:07:32 | J1: conexión cerrada (client_1001, duró 4 min 57 s) |
| 0:07:32 | J1 **pierde la conexión** |
| 0:07:33 | J1 reanuda la sesión (6 eventos reenviados) |
| 0:07:33 | J1 vuelve a estar conectado |
| 0:08:44 | J1: conexión cerrada (client_1001, duró 1 min 11 s) |
| 0:08:44 | J1 **pierde la conexión** |
| 0:08:45 | J1 reanuda la sesión (1 eventos reenviados) |
| 0:08:45 | J1 vuelve a estar conectado |
| 0:09:34 | J2 reanuda la sesión (23 eventos reenviados) |
| 0:09:34 | J2 vuelve a estar conectado |
| 0:09:37 | J1 reclama la captura de J2 (R1) |
| 0:09:39 | Reclamación R1: **rejected** |
| 0:09:55 | Pista nº 1 |
| 0:10:10 | J1 reclama la captura de J2 (R2) |
| 0:10:12 | Reclamación R2: **confirmed** |
| 0:10:12 | **J2 capturado** por J1 (claim, 3 min 17 s de persecución) |
| 0:10:12 | **Fin: ganan los cazadores** (all_captured, 1 capturas) |
| 0:10:12 | Fase: **Final** (online: J1, J2) |

</details>

### Partida 2
- Desde 0:10:13 hasta 11:00:34. Fases: Sala de espera (0:10:13) → Cuenta atrás (0:10:23) → Huida (0:10:28) → Cancelada (3:10:52).
- **Resultado:** ganan los fugitivos · causa time_up · 0 capturas · persecución de 20 min 0 s.

**Jugadores y conexión** (cortes según el servidor; «tiempo sin conexión» desde que el servidor lo detecta hasta que el móvil reanuda):

| Jugador | Rol | Cortes | Tiempo sin conexión (total / más largo) | Cierres de conexión (motivo) | Reanudaciones |
|---|---|---|---|---|---|
| J1 | fugitivo | 1 | 649 min 50 s / 649 min 50 s (sin volver) | socket_error ×1 | 0 |
| J2 | cazador | 1 | 649 min 50 s / 649 min 50 s (sin volver) | socket_error ×1 | 0 |

**GPS** (resúmenes cada 30 s y en cada cambio de fase; solo lecturas que llegaron al servidor):

| Jugador | Lecturas aceptadas | Frecuencia en juego | Mayor hueco | Ventanas vacías | Precisión típica / peor | Antigüedad peor | Ignoradas (motivo) |
|---|---|---|---|---|---|---|---|
| J1 | 5 (WebSocket 5 · app 0) | 0.0/min | 18 s | 1 | 3 m / 3 m | 3 s | wrong_phase ×3 |
| J2 | 3 (WebSocket 3 · app 0) | 0.0/min | 18 s | 1 | 13 m / 14 m | 3 s | wrong_phase ×4 |

**Capturas**

_Nada registrado._

<details><summary>Cronología completa</summary>

| Hora | Hecho |
|---|---|
| 0:10:13 | Revancha propuesta (partida 2) |
| 0:10:13 | Fase: **Sala de espera** (online: J1, J2) |
| 0:10:13 | J1: rematch |
| 0:10:15 | J2: join_rematch |
| 0:10:23 | Fase: **Cuenta atrás** (online: J1, J2) |
| 0:10:23 | J1: start |
| 0:10:28 | Fase: **Huida** (online: J1, J2) |
| 0:10:44 | J1: conexión cerrada (socket_error, duró 1 min 59 s) |
| 0:10:44 | J1 **pierde la conexión** |
| 0:10:44 | J2: conexión cerrada (socket_error, duró 1 min 10 s) |
| 0:10:44 | J2 **pierde la conexión** |
| 3:10:52 | Pista nº 1 |
| 3:10:52 | Pista nº 2 |
| 3:10:52 | Pista nº 3 |
| 3:10:52 | Pista nº 4 |
| 3:10:52 | Pista nº 5 |
| 3:10:52 | Pista nº 6 |
| 3:10:52 | **Fin: ganan los fugitivos** (time_up, 0 capturas) |
| 3:10:52 | Sala cerrada (closed) |
| 3:10:52 | Fase: **Cancelada** (online: nadie; **sin conexión: J1, J2**) |

</details>

## Errores y conexiones

- Errores internos del servidor: ninguno.
- Errores enviados a los móviles: removed ×2.
- Conexiones abiertas: 7 · cerradas por motivo: client_1000 ×2, socket_error ×3, client_1001 ×2.
- Conexiones rechazadas al abrir: —.
- Envíos de ubicación de la app rechazados: —.

Motivos de cierre: `client_1000/1001` el móvil cerró (salir, recargar, pasar a segundo plano); `network_closed` o `socket_error` la conexión se cortó (cobertura, túnel, ordenador del servidor suspendido); `idle_timeout` el servidor dejó de recibir del móvil 75 s; `server_4001` la sesión se abrió en otra conexión; `server_4000` sala borrada.

