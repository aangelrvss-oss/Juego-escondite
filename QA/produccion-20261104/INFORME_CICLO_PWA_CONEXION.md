# Ciclo PWA, identidad y fiabilidad móvil (4/11/2026)

Auditoría del código real más pruebas automáticas, sin móviles físicos. **Sin commits ni push:** los cambios están en local, pendientes de revisión. **Sin cambios** en motor, reglas, capturas, roles, zona, victoria, diseño, salas ni MapTiler.

---

## 1. Diagnóstico del logo

**La web no declaraba ningún icono ni manifiesto.** `mobile/www/index.html` no tenía `<link rel="manifest">`, ni favicon, ni `apple-touch-icon`, y no existía ningún `manifest.webmanifest` ni ningún PNG de icono.

- **Chrome:** su diagnóstico de instalación (`Page.getInstallabilityErrors`) sobre producción devuelve **`no-manifest`**. Por eso el acceso directo no es una app instalada con icono: Chrome crea un atajo con una letra o una miniatura de la página.
- **iPhone:** sin `apple-touch-icon`, Safari usa una captura de la página.
- **Producción:** `/favicon.ico` y `/manifest.webmanifest` respondían **404**.
- **Servidor:** sirve `.webmanifest` y `.ico` como binario genérico. Se comprobó en el ciclo siguiente que Chrome los acepta igual, así que no hace falta cambiar el servidor.
- **Service worker:** no existe, y ya no es necesario. Chrome no lo exige para instalar desde 2023, y el servidor envía `cache-control: no-store` en todo, así que no puede quedar una versión antigua en caché. **No se ha añadido.** Uno con caché sí podría dejar versiones antiguas en los móviles.

## 2. Solución de los iconos

Generados a partir del **símbolo oficial** (`www/js/brand.generated.js`, el mismo de la cabecera de la app, sacado de la demo con `npm run brand`), sobre el fondo de la app `#0a0b0d`. **Sin logotipo nuevo.**

| Archivo | Tamaño | Uso |
|---|---|---|
| `www/icons/icon-192.png` | 192×192 | Manifiesto, `any` |
| `www/icons/icon-512.png` | 512×512 | Manifiesto, `any` (pantalla de bienvenida) |
| `www/icons/icon-maskable-512.png` | 512×512 | Manifiesto, `maskable` (Android). El símbolo queda dentro del círculo seguro: 202 px de semidiagonal, por debajo del límite de 205 px. |
| `www/apple-touch-icon.png` | 180×180 | iPhone, iPad |
| `www/favicon.ico` (PNG de 32×32 dentro) y `www/favicon.svg` | 32 / vectorial | Pestaña del navegador |
| `www/icons/favicon-32.png` | 32×32 | Fuente del `.ico` |
| `www/manifest.webmanifest` | — | Nombre «THE OUTRUN», `standalone`, vertical, colores de la app, los 3 iconos y sin URLs externas |

- **Generador:** `mobile/scripts/iconos-pwa.mjs` (usa Chrome mediante Playwright). Los PNG se guardan en Git, así que Render no necesita Chrome para desplegar.
- **Verificado en local:**
  - Chrome lee el manifiesto sin errores y dice **«instalable», sin errores de instalación**;
  - las rutas responden 200 con su tipo (`application/manifest+json`, `image/x-icon`, `image/png`, `image/svg+xml`) y `no-store`;
  - los PNG miden lo que declaran;
  - el favicon SVG contiene los trazados oficiales.
- **Pendiente** porque requiere desplegar: comprobarlo en producción y en un móvil.
- **Accesos directos ya creados:** Android e iOS guardan el icono antiguo, así que **hay que borrar el acceso actual y volver a instalar**.

## 3. Auditoría de la arquitectura de conexión

Código revisado:
- `mobile/www/js/net.js` (`GameConnection`);
- `mobile/www/js/app.js` (eventos de página, Wake Lock y textos);
- `server/hub.ts` (sesiones, `resume`, buzones de eventos, respuestas guardadas y presencia);
- `server/ws.ts` y `server/main.ts` (WebSocket propio, ping del servidor e inactividad);
- `engine` (presencia D-057 y reglas de captura).

| Mecanismo | Dónde | Valor |
|---|---|---|
| Ping del cliente | `net.js` `PING_EVERY_MS` | cada 10 s |
| Conexión muerta (cliente) | `DEAD_AFTER_MS` + `PROBE_MS` | 25 s sin oír nada, luego una sonda; sin respuesta en 5 s, cierra y reconecta |
| Reconexión | `BACKOFF_MS` | 0,5 → 1 → 2 → 4 → 8 s (máximo), más un azar de hasta 250 ms. Inmediata con `online`, `visibilitychange` o `pageshow`. |
| Conexión muerta (servidor) | `server/main.ts` | Ping WebSocket cada 20 s, cierre a los 75 s de inactividad |
| Presencia (reglas, D-057) | motor | 30 s sin señal: «sin conexión», visible para todos. 5 min: fuera de la partida. |
| Identidad | `localStorage` `outrun.session` | `playerId` + secreto; sobrevive a recargas y a cerrar la app instalada |
| Reanudación | `resume` con `lastSeq` | El servidor reenvía los eventos perdidos (hasta 300 por jugador) o, si no los tiene, solo la instantánea completa |
| Comandos durante un corte | `pending` + `room.replies` | Se reenvían con el mismo id. El servidor devuelve la respuesta guardada y **no los ejecuta dos veces**. |
| Acciones caducadas | `TIMELY_COMMANDS` | Reclamar, responder y «Me han pillado» pulsados sin red **no** se envían si han pasado más de 20 s |
| Sesión duplicada (dos pestañas) | cierre 4001 | Se queda una sola; la otra muestra «Jugar en esta pestaña» |
| Pantalla encendida | Wake Lock en `app.js` | Pedido durante la partida, mientras la página es visible |

### Respuestas

1. **Sin Internet 5 s:** no pasa nada visible. La conexión TCP sobrevive, los mensajes se entregan al volver y nadie aparece «sin conexión». *Medido (`registros/05`): misma conexión antes y después.*
2. **Sin Internet 30 s:**
   - a los 30 s el cliente da la conexión por muerta y muestra «Reconectando»;
   - a los 30 s los demás ven «X no da señales: sin conexión»;
   - al volver la red, se reconecta solo, con la misma identidad y el mismo rol y el estado completo.
   - *Medido (corte de 35 s): detección a los 30,0 s, «sin conexión» a los 30,0 s, reconexión 2,9 s después de volver la red.*
   - Si el corte pasa de **5 min**, queda fuera de la partida (D-057).
3. **Bloquear el móvil:**
   - la página pasa a segundo plano y el sistema suelta el Wake Lock;
   - deja de enviar el GPS (los navegadores no entregan la ubicación a páginas ocultas) y los pings;
   - a los 30 s queda «sin conexión» y a los 5 min, fuera de la partida;
   - al desbloquear, `visibilitychange` lo despierta: comprueba la conexión (≤ 5 s), reanuda, recibe la instantánea y los eventos perdidos sin repetir avisos antiguos, y la posición vuelve con la siguiente lectura.
   - *Visto en la prueba física del 31/10: bloqueo de 2 min 44 s, volvió con la misma identidad.* El comportamiento exacto depende del sistema: iOS suspende la página casi al momento.
4. **Cambiar de app:** igual que el bloqueo; la página queda oculta.
5. **El navegador suspende la PWA:** igual. **Instalarla no da permisos en segundo plano:** una PWA no mantiene ni el GPS ni el WebSocket con la pantalla apagada, ni en Android ni en iOS. Si el sistema la descarta, al abrirla se recarga y reanuda con la sesión guardada.
6. **Conexión muerta:**
   - **cliente:** sin mensajes en 25 s, envía una sonda y, si no hay respuesta en 5 s, reconecta;
   - **servidor:** cierra a los 75 s de inactividad y marca la presencia a los 30 s.
7. **Recuperación de la sesión:** `resume` con `playerId`, secreto y `lastSeq`. Le siguen `welcome`, los eventos perdidos o una instantánea, y el reenvío de comandos pendientes.
8. **Captura duplicada tras reconectar: no.**
   - las respuestas se guardan por id de comando;
   - las acciones de captura de más de 20 s se descartan;
   - el motor rechaza `already_captured` y `already_pending`;
   - solo se admite una reclamación cada 3 s.
9. **Estado completo: sí.** La instantánea autorizada lleva:
   - fase, relojes y roles visibles;
   - capturas, plan de zona y la última pista (los cazadores);
   - las reclamaciones pendientes en ambos sentidos, la espera tras convertirse y el resultado.
   - Las posiciones de los demás llegan con el siguiente envío (≤ 5 s). Solo se pierden avisos emergentes antiguos, y es a propósito.
10. **Render reinicia el servidor:** **las salas se pierden.** Viven en memoria, y el disco del plan gratuito se borra en cada reinicio, despliegue o suspensión. Los móviles reconectan solos, el servidor responde `bad_session` y la app vuelve al inicio con «La sesión ya no es válida. Vuelve a entrar en la sala.»: hay que crear una sala nueva.

### Cada situación es distinta

| Situación | Conexión | Servidor | Lo que ve el jugador | Lo que ven los demás |
|---|---|---|---|---|
| Pérdida de Internet | Muere en silencio; se detecta a los 30 s | Presencia: 30 s «sin conexión», 5 min fuera | «Reconectando…»; al volver, todo igual | «X no da señales: sin conexión», luego «X ha vuelto» |
| Suspensión del navegador (bloqueo o cambio de app) | Puede seguir abierta, pero la app no envía nada | Igual que sin Internet (no hay señales) | Al volver: reconexión en ≤ 5 s y estado al día | Igual |
| Desconexión real (cierre, recarga, salir) | Se cierra | `connection: false` y presencia | Al reabrir: reanuda con la sesión guardada | Igual |
| Pérdida de GPS (con datos) | **Sigue viva** | **No** queda «sin conexión»: la app da señales. Sus lecturas envejecen (`STALE` > 15 s, `UNAVAILABLE` > 120 s). | «Lectura antigua (hace…)» o «Sin señal» | Los cazadores ven su última posición con la antigüedad. Con una lectura antigua no se le puede capturar (regla actual). |
| Reinicio del servidor | Todas se cortan | **Salas perdidas** | Vuelta al inicio con aviso | Igual |

## 4. Problemas reales encontrados

| # | Problema | Gravedad | Estado |
|---|---|---|---|
| P1 | La web no tenía manifiesto ni iconos: no se instala con logo y el favicon falta | Media | **Corregido en local** (pendiente de desplegar) |
| P2 | **Un reinicio, despliegue o suspensión de Render borra las partidas en curso** | **Alta para jugar en Render gratuito** | No corregido: necesita persistencia, que el plan gratuito no ofrece (ver §5 y §7) |
| P3 | Con la pantalla bloqueada o la app en segundo plano, la web deja de enviar el GPS y las señales; a los 5 min el jugador queda fuera | Alta (limitación de plataforma) | **Comportamiento previsto** (D-057). La app ya pide pantalla encendida (Wake Lock) y lo explica. Solo una app nativa lo evita. |
| P4 | Sin *service worker*, recargar sin cobertura muestra la página de error del navegador; al volver la cobertura, la recarga funciona y reanuda | Baja | Opcional |
| P5 | Los accesos directos ya instalados conservan el icono antiguo | Baja | Hay que reinstalarlos (indicado en el protocolo) |

**No se han encontrado fallos** en la reconexión, el heartbeat, las sesiones, la deduplicación ni la recuperación del estado: están implementados, cubiertos por pruebas y verificados con cortes reales.

## 5. Mejoras recomendadas

**Críticas:**
- **Operativa en Render (P2), sin código:**
  - no desplegar (`git push` a `mapa-real`) durante una partida;
  - abrir la URL unos minutos antes;
  - avisar a los jugadores de que, si el servidor se reinicia, hay que crear una sala nueva.
- **Si se va a jugar en serio en Render**, hacer que las salas sobrevivan a un reinicio. Opciones:
  - (a) plan de pago Starter con disco persistente y `STATE_FILE` (ya implementado en el servidor), sin cambios de código;
  - (b) guardar el estado en una base externa (cambio de arquitectura; el Postgres gratuito de Render caduca a los 30 días).
  - **Decisión tuya; no se ha hecho nada.**

**Opcionales:**
- *Service worker* que solo guarde la «carcasa» (HTML, CSS y JS) para poder recargar sin cobertura, **sin** guardar datos del juego. Riesgo: versiones antiguas en los móviles si se hace mal. Propuesta: red primero y caché solo sin conexión.
- Aviso específico de «El servidor se ha reiniciado: crea una sala nueva» en lugar del genérico «La sesión ya no es válida».
- **Capacitor:** la app Android del proyecto ya tiene un módulo nativo de ubicación con servicio en primer plano (H1) y envío por `/api/loc`. Es la **única vía real** para mantener el GPS con la pantalla bloqueada en Android. En iOS haría falta configurar el modo de ubicación en segundo plano nativo. **No se migra en este ciclo.**

**No hacen falta** (ya existen y funcionan): reconexión con espera creciente, heartbeat, recuperación con la misma identidad, sincronización completa, no duplicar acciones, estados de conexión e indicadores de conexión y GPS.

## 6. Protocolo de pruebas con móviles

En `PROTOCOLO_PRUEBA_FISICA_MOVILES.md`: 15 pasos, cada uno separado entre lo automatizado y lo que necesita móviles.

## 7. Render gratuito

**Medido el 4/11/2026** (`registros/03-arranque-en-frio.txt`, sin ningún acceso a producción durante la espera):

| Estado | `/health` | Página | WebSocket nuevo |
|---|---|---|---|
| Despierto | 51–157 ms | 49–54 ms | ~175 ms |
| **Tras 16 min sin tráfico (dormido)** | **22,4 s** | 87 ms (ya despierto) | 385 ms |
| Justo después | 67 ms | 130 ms | 224 ms |

- **El primer acceso tras un rato sin uso tarda unos 22 s.** Render tiene la petición en espera hasta que el servicio arranca; no da error.
- **Las salas se perdieron al dormirse:** antes había 2, después 0. Queda confirmado que una suspensión borra las partidas.
- Los WebSocket nuevos funcionan con normalidad en cuanto el servicio despierta.
- Una primera medida no es válida (`registros/03a-…-INVALIDA…`): este ordenador cargó la página de producción a mitad de la espera.


- Se duerme tras **15 min sin tráfico**: los mensajes de WebSocket cuentan como tráfico, así que no se duerme durante una partida.
- Al dormirse, reiniciarse o redesplegar, **se pierden las salas** (P2).
- 750 h al mes y una sola instancia, sin coste mientras no haya tarjeta.
- Consecuencia para las partidas: aguanta grupos pequeños y pruebas, pero **no garantiza** terminar una partida si Render reinicia el servicio.

## 8. Archivos modificados o creados (sin commit)

| Archivo | Cambio |
|---|---|
| `mobile/www/index.html` | +6 líneas: manifiesto, favicons, `apple-touch-icon` y título para iOS. **Sin cambios de diseño.** |
| ~~`server/main.ts`~~ | ~~+3 líneas: tipos MIME~~. **Deshecho en el ciclo siguiente**: el servidor no cambia, y Chrome instala igual (ver `INFORME_IDENTIDAD_PWA.md`). |
| `mobile/scripts/iconos-pwa.mjs` | Nuevo: generador de iconos y manifiesto |
| `mobile/www/manifest.webmanifest`, `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icons/*.png` | Nuevos (generados) |
| `mobile/test/pwa.test.mjs` (3 pruebas), `server/test/pwa.test.mjs` (1 prueba) | Nuevos |
| `server/arranque-frio.mjs` | Nuevo: medición del arranque en frío |
| `QA/produccion-20261104/` | Este informe, el protocolo, `scripts/cortes-de-red.mjs` y los registros 03–05 |

## 9. Tests ejecutados

| Suite | Resultado |
|---|---|
| tsc | OK (salida 0) |
| Motor + simulador | 277/277 |
| Servidor | **136/136** (antes 135, más la de PWA) |
| Cliente | **165/165** (antes 162, más 3 de PWA) |
| Marca y privacidad (incluida en cliente) | OK: el manifiesto y el HTML no cargan nada externo |
| Chrome: manifiesto e instalación (local) | Sin errores de análisis; **instalable** |
| Cortes de red reales (local, servidor y `net.js` reales) | **9/9** |
| Arranque en frío (producción) | **22,4 s** dormido · 0,05–0,2 s despierto · salas perdidas al dormirse |
| Móviles físicos | **No realizado** |
