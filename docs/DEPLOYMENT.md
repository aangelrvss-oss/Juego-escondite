# Despliegue de THE OUTRUN

> **Estado (4/11/2026):** código en GitHub y despliegue en Render **preparado** (`render.yaml`). El build y el arranque se han validado en local con un clon limpio del repositorio. El servicio de Render todavía no existe: **hace falta que el propietario conecte su cuenta de Render con GitHub** (ver «Primer despliegue»). Hasta entonces no hay URL pública definitiva ni pruebas contra ella.

## Arquitectura

| Pieza | Qué es | Dónde está |
|---|---|---|
| Interfaz web | HTML, CSS y módulos ES **sin empaquetador**. MapLibre y Capacitor se copian a `mobile/www/vendor/` en el build. | `mobile/www/` |
| Servidor del juego | Un único proceso Node (Node 24 ejecuta TypeScript directamente). Sirve la interfaz, el WebSocket del juego en `/ws`, el estado en `/health` y `/api/loc`, que solo usa la app Android. | `server/main.ts`, `server/hub.ts`, `server/ws.ts` |
| Motor de reglas | Puro y determinista. Todo lo autoriza el servidor: fases, roles, capturas, zona dinámica y visibilidad. | `engine/src/` |
| Salas | **En memoria.** El código es de 6 caracteres. Opcionalmente se guardan en `STATE_FILE`, pero no en el plan gratuito, cuyo disco es efímero. | `server/hub.ts` |
| Sincronización | WebSocket propio (RFC 6455) con instantánea autorizada por jugador tras cada cambio, eventos numerados y reanudación con `lastSeq`. Las posiciones se envían cada 5 s, filtradas por el servidor. | `server/ws.ts`, `mobile/www/js/net.js` |
| Servicio externo | **MapTiler** (cartografía). Usa una clave **pública**, restringida por origen en MapTiler. Sin clave, el juego usa el radar de reserva. | `mobile/www/js/map-view.js` |
| Persistencia | Ninguna obligatoria. | — |

La interfaz y el servidor van en el **mismo origen**: el cliente construye `wss://<host>/ws` a partir de su propia URL y el servidor solo acepta WebSockets de su propio host. Por eso no hace falta CORS ni configurar URLs, y por eso **no se usa un Static Site aparte**: separarlos obligaría a orígenes cruzados sin ninguna ventaja.

**No se despliega** (herramientas de desarrollo):
- `sim/panel/`, el simulador de 10 participantes, que arranca su propio servidor;
- `sim/grabacion/`, la grabación promocional, que no está en Git;
- `mobile/e2e/`;
- la app Android (`mobile/android/`).

El servicio desplegado es el juego real: **partidas reales entre personas reales**.

## Servicios utilizados

| Servicio | Plan | Para qué |
|---|---|---|
| GitHub (`aangelrvss-oss/Juego-escondite`, rama `mapa-real`) | Gratuito | Código fuente y origen del despliegue |
| Render, Web Service (`render.yaml`) | **Free** | Servidor del juego e interfaz |
| MapTiler | El de la cuenta del propietario | Cartografía (opcional) |

No hay ningún servicio de pago ni ninguna dependencia nueva.

## Variables de entorno

| Variable | Valor en Render | Qué hace |
|---|---|---|
| `PORT` | La pone Render (10000) | Puerto de escucha |
| `HOST` | `0.0.0.0` (en `render.yaml`) | Escuchar fuera del contenedor |
| `TRUST_PROXY` | `1` (en `render.yaml`) | IP real del cliente desde `X-Forwarded-For`, para los límites por IP |
| `MAPTILER_KEY` | **Secreta: se introduce en el panel de Render**, nunca en Git | Clave pública de MapTiler. El build la escribe en `mobile/www/mapa.config.json` (`mobile/scripts/mapa-desde-entorno.mjs`) sin mostrarla en el registro. |
| `MAPTILER_STYLE` | Opcional | Estilo de MapTiler (por defecto, `dataviz-v4-dark`) |
| `ALLOWED_ORIGINS`, `MAX_ROOMS_PER_IP`, `LOG`, `DIAG_FILE`, `STATE_FILE` | Sin definir | Opcionales (ver la cabecera de `server/main.ts`). `DIAG_FILE` es solo para pruebas físicas. |

La versión de Node se fija en `.node-version` (24).

> **La clave de MapTiler es pública por diseño:** el navegador la necesita para pedir el mapa, igual que en local. Lo que la protege es la lista de orígenes permitidos en MapTiler, que debe incluir la URL de Render. No va en el repositorio, sino en una variable de entorno.

## Build y arranque (`render.yaml`)

```
build: npm ci --prefix mobile --omit=dev && npm run vendor --prefix mobile && node mobile/scripts/mapa-desde-entorno.mjs
start: node server/main.ts
health check: /health
```

## Primer despliegue (pasos del propietario)

1. Entrar en <https://dashboard.render.com>. Para crear el servicio gratuito no hace falta tarjeta.
2. **New → Blueprint**. Conectar GitHub y dar acceso al repositorio `aangelrvss-oss/Juego-escondite`.
3. Elegir la rama **`mapa-real`**. Render lee `render.yaml` y propone el servicio `the-outrun`, plan Free y región Frankfurt.
4. Cuando pida **`MAPTILER_KEY`**, pegar la clave de MapTiler. También se puede dejar vacía: entonces se juega con el radar.
5. **Deploy Blueprint.** El primer build tarda unos minutos.
6. Copiar la URL del servicio (`https://<nombre>.onrender.com`) y añadirla en MapTiler → la clave → **Allowed HTTP origins**.
7. Comprobarlo con: `node server/humo-despliegue.mjs https://<nombre>.onrender.com`

## Volver a desplegar

- **Automático:** cada `git push` a `mapa-real` vuelve a desplegar.
- **Manual:** en Render, *Manual Deploy → Deploy latest commit*.
- **Cambiar la clave del mapa:** en Render, *Environment → MAPTILER_KEY*, y después *Manual Deploy*. La clave se escribe en el build.

## Limitaciones del plan gratuito (documentación de Render, consultada el 4/11/2026)

- **Suspensión por inactividad:** tras 15 min sin tráfico (HTTP o mensajes de WebSocket) el servicio se duerme. **Al despertar tarda alrededor de 1 minuto**, y Render muestra una página de carga. Durante una partida no se duerme, porque cada móvil manda una señal cada 10 s.
- **Las salas se pierden** al dormirse, al redesplegar o si Render reinicia el servicio, cosa que puede hacer en cualquier momento. Una partida en curso se perdería, con el mismo efecto que reiniciar el servidor local sin `STATE_FILE`. El plan gratuito no admite disco persistente.
- **750 horas de instancia al mes** por espacio de trabajo. Un único servicio que se duerme no las agota.
- **Una sola instancia:** no escala, aunque basta para grupos pequeños.
- **Ancho de banda y minutos de build** incluidos. Si se agotan sin tarjeta, Render suspende el servicio; no cobra.
- **Sin acceso por SSH ni tareas puntuales.**

## Pruebas realizadas

| Prueba | Dónde | Resultado |
|---|---|---|
| tsc, motor + simulador, servidor, cliente, panel | Local, antes del commit | OK · 277/277 · 135/135 · 162/162 · 15/15 |
| Build de Render desde un **clon limpio** del repositorio (`npm ci --omit=dev`, vendor, configuración del mapa con y sin clave, clave con formato inválido) | Local | OK. Con clave mal formada, el build falla a propósito. |
| Arranque como en Render (`node server/main.ts`, `TRUST_PROXY=1`) + `server/humo-despliegue.mjs` | Local (127.0.0.1:8899) | **19/19**: página, `/health`, vendor, mapa, 3 clientes WebSocket, crear y unirse, configuración de 250 m con zona dinámica, rechazo de 30 m, inicio, roles privados, sincronización de posiciones, privacidad, reconexión con la misma identidad y final |
| Página del build en Chrome | Local (localhost:8899) | Carga sin errores de JavaScript, MapLibre carga y MapTiler responde 200 |
| **Despliegue en Render y pruebas contra la URL pública** | — | **Pendiente**: requiere conectar la cuenta de Render |
| Varios móviles reales contra la URL pública | — | Pendiente |

## Problemas pendientes

- Crear el servicio en Render (paso del propietario) y validar contra la URL pública.
- Añadir la URL de Render a los orígenes permitidos de MapTiler.
- Arranque en frío de ~1 min tras 15 min sin uso: conviene abrir la URL un minuto antes de jugar.
- Las salas no sobreviven a reinicios en el plan gratuito. Si hiciera falta, la alternativa sería un plan de pago con disco y `STATE_FILE`.
- La prueba e2e `conexion` (navegador, GPS emulado) sigue siendo intermitente en local. No afecta al despliegue (ver `QA/ciclo-20261101-zona-dinamica/`).
