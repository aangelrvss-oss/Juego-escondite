# Auditoría de producción: https://the-outrun.onrender.com (4/11/2026)

Pruebas automáticas contra el **servidor público de Render**, hechas desde este ordenador. Los clientes usan el protocolo real del juego (`net.js`), tres a la vez; el GPS es sintético y el tiempo es **real**, sin acelerar. **No incluye móviles reales.** No se han hecho commits ni cambios de configuración.

## Resultado

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Render responde y termina el arranque | ✔ | `/health` 200 en 0,1–0,3 s. Cabeceras `x-render-origin-server: Render`, Cloudflare. |
| 2 | Página principal | ✔ | HTTP 200. En Chrome carga sin errores de JavaScript. |
| 3 | `/health` | ✔ | `{"ok":true,…}` |
| 4 | Archivos de la interfaz | ✔ | `app.js` es el de este ciclo (zona dinámica, radios de 50 a 1.000 m); MapLibre (módulo y worker) y Capacitor responden 200. |
| 5 | Configuración del mapa | ✔ (tras corregir MapTiler) | `proveedor: maptiler`, clave de 20 caracteres, idéntica a la local. Ver «Errores». |
| 6 | Tres clientes WebSocket: crear sala y unirse | ✔ | `wss://…/ws`, código de 6 caracteres |
| 7 | Roles y posiciones sincronizados | ✔ | Roles privados (la cazadora no ve el equipo de los fugitivos); un fugitivo recibe la posición de su compañero y nunca la de la cazadora |
| 8a | Reglas de zona | ✔ | Configuración de 250 m aceptada y de 30 m rechazada. **Fase 1 a los 300 s exactos** para los tres, con destino 213 m. Mismo plan de zona y mismo círculo calculado en los tres (249,7 m). |
| 8b | Capturas | ✔ | A ~95 m, el servidor la rechaza (`not_close_enough`). A 8 m, la valida, el fugitivo la confirma y queda capturado para todos. Tras acercarse andando unos 95 m a 1,5 m/s, segunda captura válida. |
| 9 | Reconexión | ✔ | Corte y vuelta con la misma identidad y el mismo rol |
| 10 | Final de partida | ✔ | Por la anfitriona (prueba de humo) y por captura de todos (`hunter`/`all_captured`), con un único aviso de final por cliente |

- **Prueba de humo** (`node server/humo-despliegue.mjs https://the-outrun.onrender.com`): **19/19** (`registros/01-humo.txt`).
- **Partida completa en tiempo real** (`scripts/partida-completa.mjs`, 498 s): **15/15** (`registros/02-partida-completa.txt`).

## Errores encontrados y su causa

| Error | Tipo | Causa | Estado |
|---|---|---|---|
| MapTiler respondía **403** desde `the-outrun.onrender.com`; la página mostraba el radar | **Configuración de MapTiler** | La clave desplegada era correcta (con un origen ya autorizado daba 200), pero faltaba el origen de Render en *Allowed HTTP origins* | **Resuelto por el propietario.** Ahora estilo, TileJSON, teselas, tipografías e iconos dan 200 desde Render, y una web ajena sigue recibiendo 403. |
| `rate_limited` en la segunda reclamación (primer intento de la partida completa, `registros/02a-…`) | **Error del script de prueba** | El servidor admite una reclamación cada 3 s por jugador (`RATE.claimMinIntervalMs`, contra el sondeo de distancias) y el script reclamó dos veces en el mismo segundo. Es la regla prevista, y la interfaz la explica («Demasiados intentos seguidos»). | Script corregido (3,5 s entre reclamaciones). Sin cambios en el juego. |
| Tipografías 403 en una comprobación | **Error de la comprobación** | Se pidió una fuente que no existe en el estilo | Con la fuente real del estilo: 200 |

No se ha encontrado **ningún error de Render** ni **ningún error del juego**.

## Suspensión del servicio (plan gratuito)

- Durante la auditoría el servicio estaba **despierto**: primera respuesta en 0,2 s. **No se ha medido** un arranque en frío, porque habría que dejarlo 15 min sin tráfico y no se ha hecho.
- Según Render, se duerme tras 15 min sin tráfico y tarda **alrededor de 1 min** en despertar. Conviene abrir la URL un minuto antes de jugar.
- Durante la partida, de 8 min, no se durmió: los mensajes de WebSocket cuentan como tráfico.
- Tras las pruebas, `/health` mostraba `rooms: 3`. Son las salas terminadas de estas pruebas, que el servidor conserva 30 min por si alguien pide la revancha, y después se borran solas.

## Pendiente

- **Prueba con móviles reales** contra la URL pública: mapa real, GPS real, pantalla bloqueada y cambios de red.
- **Medir el arranque en frío** tras 15 min sin uso.
- Actualizar `docs/DEPLOYMENT.md` con estos resultados. Para el repositorio hace falta un commit, y no se ha hecho por indicación del propietario.
