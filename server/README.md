# THE OUTRUN · servidor de partida (H2) y guía para jugar

Servidor **autoritativo**: las reglas viven solo en el motor (`engine/`), y el servidor decide la sala, los roles, las fases, el tiempo, las capturas y el final. Los móviles solo envían acciones y lecturas de ubicación, y reciben su **vista autorizada** (`engine/src/view.ts`).

> **Estado (26/10/2026):** probado con pruebas automáticas y con cinco navegadores en un solo ordenador (detalle en `QUALITY_STATE.md`). **No se ha jugado todavía en la calle con móviles reales**, ni se ha probado el acceso desde redes distintas. La prueba con dos móviles Android está preparada paso a paso en [`../mobile/PRUEBA_PARTIDA_ANDROID.md`](../mobile/PRUEBA_PARTIDA_ANDROID.md).

## Qué hace

| Pieza | Archivo | Qué hace |
|---|---|---|
| Transporte | `ws.ts` | WebSocket mínimo (RFC 6455) sobre `node:http`, **sin dependencias**: solo mensajes de texto de hasta 4 KB; un mensaje binario, fragmentado, demasiado grande o un fallo de protocolo cierran la conexión |
| Protocolo | `protocol.ts` | Mensajes JSON validados (`create`, `join`, `resume`, `cmd`, `loc`, `ping`). Contrato común para Android, iOS y navegador |
| Autoridad | `hub.ts` | Sesiones (secreto de 32 bytes guardado como hash), códigos de sala de 6 caracteres, distribución filtrada por destinatario con `seq` propio, reanudación, idempotencia, límites de abuso y borrado de salas cerradas |
| Arranque | `main.ts` | HTTP: sirve la interfaz web (`mobile/www`) y `/health`; WebSocket en `/ws` (con ping de protocolo cada 20 s); `POST /api/loc` para el envío nativo de la ubicación; comprueba el origen |
| Registro de la prueba | `health-watch.mjs` | Cada 10 s: conexiones y lecturas recibidas por canal (WebSocket o HTTP). Solo contadores |

**Ubicación con la pantalla bloqueada (app Android):**
- En partida, el servicio nativo de la app envía cada lectura por HTTPS a `POST /api/loc`, con la sesión del jugador en el cuerpo. Así no depende de que la página siga despierta.
- Se aplican la misma validación y el **mismo límite por jugador** que por WebSocket: usar los dos canales no da más lecturas.
- Respuestas: 204 aceptada; 202 ignorada (cuenta atrás o demasiado seguida); 401 sesión no válida y 410 el jugador ya no comparte ubicación (en ambos casos el móvil deja de enviar); 400, 413, 415, 403 o 429 si la petición no es válida.
- `/health` cuenta las lecturas aceptadas por canal (`locWs`, `locHttp`), sin datos personales.
- El ping de protocolo del servidor lo contesta la pila de red del móvil aunque la página esté dormida, y evita que el túnel cierre la conexión por inactividad. **Ninguna de las dos cosas se ha comprobado en un móvil real.**

**Tiempo:**
- El móvil **no envía su hora**. Envía la antigüedad de cada lectura, medida con su reloj monótono, y el servidor calcula la hora de la medida con **su propio reloj**.
- Los temporizadores de la pantalla usan la hora del servidor, estimada con ping/pong y corregida con cada instantánea.

**Límites técnicos** (no son reglas de juego; están en `hub.ts`, `RATE`):

| Límite | Valor |
|---|---|
| Mensajes por conexión | 30 seguidos y 10/s sostenidos; tras 200 descartados, corte |
| Ubicación | 1 lectura por segundo y jugador, sumando WebSocket y HTTP |
| Reclamación de captura | 1 cada 3 s por cazador (evita sondear distancias) |
| Entrar o reanudar | 10 intentos/min por conexión y 20 fallos/min por dirección (los fallos de `POST /api/loc` también cuentan) |
| Capacidad | 100 salas y 1.000 conexiones |
| Salas por dirección | 5 salas activas creadas desde la misma dirección (`MAX_ROOMS_PER_IP`). Así nadie acapara la capacidad abriendo conexiones nuevas. **Detrás de un túnel, usa `TRUST_PROXY=1`**: sin él, todos los móviles comparten la dirección del túnel y el límite sería para todos |
| Borrado | La sala cerrada se borra a los 60 s (sesiones incluidas) |

## Arrancar

Requisito: **Node 22.18 o superior**. El servidor no necesita `npm install`.

```bash
node server/main.ts              # escucha en http://127.0.0.1:8787 (solo este ordenador)
LOG=1 node server/main.ts        # con registro de operaciones
curl http://127.0.0.1:8787/health
node server/health-watch.mjs     # registro de contadores cada 10 s (para la prueba física)
```

| Variable | Uso |
|---|---|
| `PORT` | Puerto (por defecto, 8787) |
| `HOST` | Dirección. Por defecto `127.0.0.1`: **no se abre a la red**. `HOST=0.0.0.0` lo abre a la red local, y es decisión tuya |
| `TRUST_PROXY=1` | Usar la IP real del cliente que indica el túnel (`CF-Connecting-IP`), para los límites por dirección. Solo detrás de un túnel de confianza |
| `ALLOWED_ORIGINS` | Orígenes web extra admitidos en `/ws`, separados por comas |
| `LOG=1` | Registro **sin nombres, coordenadas ni secretos**: solo tipos de comando, resultados y número de salas |
| `STATE_FILE` | *(Opcional.)* Archivo donde se guardan las salas cada 2 s (si hay cambios) y al apagar con Ctrl+C. Al arrancar, se restauran y los móviles se reconectan solos con su sesión. **No guarda coordenadas de jugadores** (ni lecturas ni pistas) **ni secretos** (solo sus hashes). **Sí guarda** nombres, identificadores de instalación, equipos, capturas y la zona de la partida. Una sala borrada desaparece del archivo en el siguiente guardado. Sin esta variable, todo vive solo en memoria |

## Acceso desde los móviles (redes distintas)

Los jugadores están en la calle con datos móviles, así que el servidor tiene que ser accesible desde Internet y con **HTTPS**. Por dos motivos:
- Los navegadores solo dan la ubicación a páginas seguras.
- La app Android solo se conecta por `wss://`.

Una red local con `http://` **no sirve para jugar**.

**Camino más barato (0 €), sin probar todavía:** dejar el servidor en tu ordenador y abrir un túnel HTTPS gratuito. Por ejemplo, el túnel rápido de Cloudflare, que no requiere cuenta:

```bash
node server/main.ts                                   # terminal 1
TRUST_PROXY=1 node server/main.ts                     # (o así, si usas el túnel)
cloudflared tunnel --url http://localhost:8787        # terminal 2 → muestra https://algo.trycloudflare.com
```

Pendiente de verificar antes de jugar:
- las condiciones y límites del túnel elegido;
- que mantenga los WebSocket abiertos durante una partida entera.

Instalar `cloudflared` y abrir el túnel publica tu servidor en Internet mientras esté abierto. **No se ha hecho en esta sesión.**

Alternativas, no evaluadas en detalle: Durable Objects o un VPS (`DECISION_LOG.md`, D-014). Si contratas un servicio, el servidor es el mismo: `node server/main.ts` detrás de HTTPS.

## Organizar una partida

1. **Antes:** alguien arranca el servidor y el túnel, y comparte la dirección `https://…`.
2. **Instalar:**
   - Android: la APK de depuración (`mobile/README.md`), y en la app se escribe la dirección del servidor;
   - o cualquier móvil, iPhone incluido: abrir la dirección en el navegador. En el navegador la pantalla tiene que **seguir encendida**; ver «Limitaciones».
3. **El anfitrión:**
   - escribe su nombre y pulsa **Crear sala**;
   - comparte el código de 6 letras, el **enlace** («Compartir enlace»: `https://…/?sala=CÓDIGO`, que abre la web con el código ya puesto) o el **QR** («Mostrar QR», con el mismo enlace);
   - si el código ha llegado a quien no debía, **Cambiar el código** (dos toques): el anterior deja de servir y los que ya están dentro siguen en la sala;
   - se coloca en el punto de encuentro y pulsa **Centrar la zona aquí**;
   - elige el radio, la duración, la huida (2 min como mínimo) y la frecuencia de las pistas;
   - marca la lista de seguridad.
4. **Los demás:** nombre, código y **Unirme**. Todos pulsan **Estoy listo**. Antes de quedar listo, cada móvil comprueba que da una posición GPS: así el permiso se pide en la sala, con su explicación, y no en la cuenta atrás.
5. **Roles:** por defecto el servidor los sortea en secreto. El anfitrión puede asignarlos a mano, y solo él ve esas asignaciones.
6. **Empezar partida:**
   - cuenta atrás de 5 s, igual para todos;
   - cada uno ve **solo su rol**;
   - huida;
   - persecución.
7. **Capturar:**
   - el cazador toca al fugitivo y pulsa su nombre;
   - el servidor comprueba que ambas ubicaciones son **recientes (≤ 15 s)** y **precisas (≤ 30 m)**, que estáis **cerca** y que el cazador está **dentro de la zona** (D-033);
   - el fugitivo confirma en 30 s, o se declara capturado él mismo con «Me han pillado».
8. **Final:** el **Mission Report** (resultado, causa, duración, capturas y momentos destacados) se ve sin coordenadas ni equipos ocultos, y se vuelve a abrir igual tras reconectar. El anfitrión puede proponer la **revancha**.

## Pruebas

```bash
npm run test:server        # 42 pruebas: cinco clientes reales por WebSocket, clientes hostiles, envío por HTTP, ping, renovación del código, Mission Report, abandono en partida, persistencia y capacidad por dirección
npm test                   # motor y simulación (130)
cd mobile && npm test      # cliente: protocolo, vista, radar, ubicación, envío nativo, latido, enlace, QR, Mission Report, comprobación de GPS, estado de la sala y reglas (82)
cd mobile && node e2e/game.e2e.mjs [capturas]   # 5 navegadores, partida completa (Playwright del entorno)
node mobile/e2e/web-flow.e2e.mjs <ruta de chrome.exe o msedge.exe>   # enlace, QR, cambio de código y partida corta hasta el Mission Report en un navegador real (sin Playwright)
```

## Limitaciones conocidas

- **Pantalla bloqueada:**
  - En la app Android, el GPS sigue en segundo plano gracias al servicio de H1, y en partida ese mismo servicio envía las lecturas por HTTPS. **No está comprobado en un móvil real** que HyperOS deje enviar con la pantalla bloqueada. Es la próxima prueba física imprescindible (`mobile/PRUEBA_PARTIDA_ANDROID.md`).
  - Con la pantalla bloqueada, el fugitivo no ve la reclamación de captura. Si no la confirma en 30 s, la reclamación caduca sin captura (regla actual del motor). El procedimiento de disputa (D-035) sigue pendiente de decisión y no se ha implementado.
  - En el navegador (también en iPhone), la ubicación se detiene con la pantalla apagada.
- **Expulsiones:** se basan en un identificador de instalación que el móvil puede regenerar. Es una medida débil, suficiente para una sala entre amigos.
- **Salas en memoria:** sin `STATE_FILE`, si el servidor se reinicia, las partidas en curso se pierden. Con `STATE_FILE`, sobreviven: tras una caída se pierde como mucho lo de los últimos 2 s, y las posiciones se recuperan con las siguientes lecturas. Probado en un ordenador (`server/test/persistence.test.mjs`), no en una partida real.
- **Ubicación falsificada:** se marca (bandera de ubicación simulada, velocidad imposible), pero no se puede impedir.
- **Reglas pendientes de decisión:** D-035 (disputas), si los equipos se revelan al final, y los casos límite de D-033 (`QUALITY_STATE.md`).
