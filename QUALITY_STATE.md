# Estado de calidad

**Última actualización:** 24/10/2026 (sesión 3, etapa S0)

## Resumen

| Tipo de prueba | Estado |
|---|---|
| Pruebas automatizadas del motor y de la simulación | **103 de 103 superadas** (2 ejecuciones idénticas). Todas son **SIMULADAS** |
| Verificación por mutación (3 invariantes de seguridad) | Las 3 mutaciones las detecta al menos una prueba |
| Pruebas en dispositivos reales | **No realizadas** (S1–S3) |
| Transporte de red real (WebSocket), latencia y cobertura móvil | **No probado**: el adaptador depende de D-014, que sigue pendiente |
| Ubicación en segundo plano, GPS real, notificaciones y batería | **No validados** en ninguna plataforma |

**Qué demuestra S0:** que las reglas del modo Clásico, la autoridad del servidor, el filtrado de datos por equipo, la validación de capturas, la reanudación y la idempotencia funcionan según lo documentado **en un entorno simulado y determinista**.
**Qué no demuestra:** nada sobre GPS real, móviles bloqueados, redes móviles, latencias reales, consumo de batería ni el rendimiento del servidor en producción.

## Cómo reproducirlo

Requisitos: Node ≥ 22.18 (probado con 22.22.0) y npm 10.

```
npm install --ignore-scripts      # 2 dependencias de desarrollo: typescript 5.9.3 y @types/node 22.19.1
npm run typecheck                 # tsc -p tsconfig.json (sin emitir)
npm test                          # node --test "engine/test/*.test.ts" "sim/test/*.test.ts"
```

**Resultado registrado (24/10/2026, contenedor Linux):**
- `npm run typecheck`: código de salida 0, sin errores.
- `npm test`, ejecución 1: `tests 103 · suites 26 · pass 103 · fail 0 · cancelled 0 · skipped 0`, 40,6 s.
- `npm test`, ejecución 2: mismo resultado, 40,2 s.

**Fallos durante el desarrollo, y su causa.** Ninguno fue un fallo del motor:
1. La prueba del "tick tardío" saltaba 60 min y la ventana de revancha (30 min) cerraba la sala, que es lo correcto. Se ajustó el salto a 15 min.
2. La prueba de reordenación ignoraba que el cliente arranca con una instantánea que ya cubre el evento 1. Se corrigió la expectativa.
3. En el escenario, el bot que debía salir de la zona no llegaba a hacerlo (recorría 180 m con el borde a más de 300 m). Se corrigió el bot: la prueba no estaba probando nada.
4. La medición de volumen dividía entre todos los jugadores, aunque los capturados dejan de enviar. Ahora se divide por tiempo de jugador activo.

Además, antes de ejecutar las pruebas se detectó y corrigió un **fallo de diseño**: el `seq` único por sala era incompatible con el filtrado por destinatario (D-020).

## Trazabilidad con los criterios de aceptación

Leyenda: ✅ superado en simulación · ◐ parcialmente (la parte del servidor sí; falta la del dispositivo o la interfaz) · ⬜ no probado

| Criterio | Estado | Prueba o motivo |
|---|---|---|
| AC-A1 (18+ y nombre) | ◐ | Validación del nombre (2–20) probada. La declaración de edad es de interfaz |
| AC-A2 (código y caducidad) | ✅ | `host.test` (formato, alfabeto, no reutilización) y `transitions.test` (30 min) |
| AC-A3 (límite de intentos) | ✅ | `host.test` |
| AC-A4 (no entrar a una partida empezada) | ✅ | `transitions.test` |
| AC-A5, AC-A6 (enlace y QR) | ⬜ | Requieren app y dispositivo |
| AC-A7 (expulsión) | ✅ | `transitions.test` |
| AC-B1, AC-B2 (configuración y seguridad previa) | ✅ | `transitions.test` |
| AC-B3, AC-B4 (avisos de interfaz) | ⬜ | Interfaz |
| AC-C1 a AC-C8 (autoridad, tiempo, idempotencia, `seq`, resultado, anfitrión, todos desconectados) | ✅ | `transitions.test`, `timing.test`, `host.test` y `resilience.test`. **AC-C3 solo con latencia simulada 0** |
| AC-D1, AC-D2, AC-D3 (aislamiento por equipo) | ✅ | `visibility.test` y `simulation.test` (invariantes en 15 partidas completas de 2, 10 y 20 jugadores) |
| AC-D4, AC-D5 (antigüedad, muestras tardías) | ✅ | `visibility.test` y `timing.test` |
| AC-D6 (dejar de compartir al terminar) | ◐ | El servidor borra las muestras y deja de enviar. Que el cliente deje de enviar en 10 s o menos requiere dispositivo |
| AC-D7 (logs sin coordenadas) | ✅ | `host.test` (partida completa) |
| AC-D8, AC-D9 (móvil bloqueado, permiso revocado) | ⬜ | **Requieren dispositivos reales (S1–S3)** |
| AC-E1 a AC-E7 (capturas) | ✅ | `capture.test` |
| AC-F1 (resincronizar tras 60 s) | ◐ | Lógica de reanudación probada en simulación. El objetivo de 10 s o menos requiere red real |
| AC-F2 (cierre forzado) | ◐ | Reanudación por instantánea probada. El cierre real de la app requiere dispositivo |
| AC-F3 (abandono) | ✅ | `transitions.test` |
| AC-G1 (resultados sin coordenadas) | ◐ | Los datos de `game_finished` no llevan coordenadas. La pantalla es de interfaz |
| AC-G2, AC-G3 (revancha sin datos previos) | ✅ | `transitions.test` y `host.test` |
| AC-H1 a AC-H4 (no funcionales) | ⬜ | Requieren dispositivo y red real |

## Trazabilidad con el plan de la prueba técnica (T01–T13)

| ID | Estado S0 | Nota |
|---|---|---|
| T03 (visibilidad autorizada) | ✅ simulado | **Hay que repetirlo** con el adaptador real en S1 |
| T09 (autoridad del tiempo) | ✅ simulado | Desfase de ±10 min con y sin sincronizar |
| T10 (comandos maliciosos) | ✅ simulado | `end_game` sin ser anfitrión, transiciones, capturas lejanas, antiguas, repetidas, autoconfirmadas, sesión falsa, comandos de sistema |
| T13 (volumen de mensajes) | ✅ simulado | Ver la tabla siguiente |
| T01, T02, T04–T08, T11, T12 | ⬜ | Requieren dispositivo y red real |

**T13: volumen medido en simulación** (semilla 41, envío de ubicación cada 5 s, posiciones agrupadas por destinatario):

| Jugadores | Tiempo en juego | Capturas | Subida por jugador activo y hora | Bajada por jugador y hora |
|---|---|---|---|---|
| 2 | 7 min | 1 | ~761 | ~128 |
| 10 | 17 min | 7 | ~752 | ~871 |
| 20 | 22 min | 14 | ~753 | ~955 |

La subida coincide con el modelo (720 posiciones por hora más comandos). La bajada queda **por encima** de los 720 por hora supuestos en `TECHNICAL_SPIKE_PLAN.md` §5 cuando hay equipos, porque incluye los eventos de juego además de las posiciones. Son cifras **SIMULADAS**: los bots no reproducen el comportamiento real de jugadores ni de redes.

## Limitaciones conocidas de S0

- La latencia de red es 0, no hay pérdida de paquetes salvo la inyectada, y los relojes se sincronizan de forma exacta.
- No hay WebSocket ni adaptador real (Durable Objects o Node). La serialización de comandos por partida la garantiza el servidor simulado, no una plataforma real.
- Los bots siguen reglas simples (paseo aleatorio, persecución hacia la última pista) y confirman con honestidad.
- El motor clona el estado completo en cada comando (`structuredClone`). Es suficiente para el MVP en simulación, pero **su coste de CPU con 20 jugadores en un adaptador real no se ha medido**.
- La zona que se reduce o se desplaza: solo se ha probado la geometría de la estructura versionada. Sus reglas de juego no existen (fuera del MVP). ⚠ *Sesión 4: el propietario ha definido la zona dinámica y se propone incluirla en el MVP (D-030). Sus reglas están en `docs/product/GAME_MODES_AND_RULES.md` §6, todavía sin implementar ni probar.*
- El filtro de palabras ofensivas de los nombres no está implementado (pendiente).

## Calidad de la investigación (sesiones anteriores)

- **Fase 0:** ver las limitaciones en `docs/research/COMPETITIVE_ANALYSIS.md` (muestra pequeña de reseñas, sin Reddit ni audio del vídeo).
- **Sesión 2:** las verificaciones técnicas y de precios vienen de fragmentos de resultados de búsqueda (WebFetch no resuelve DNS en el contenedor). Contradicción abierta: si Durable Objects está o no en el plan gratuito de Cloudflare.

## Plantilla para resultados de S1 en adelante

| ID | Fecha | Dispositivo / SO | Variante | Red | REAL / SIMULADO | Medido | Resultado | Observaciones |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — |
