# THE OUTRUN: alojamiento en Render y pruebas de carga

**Agente 5 (infraestructura y rendimiento)** · 04/11/2026 · rama `mapa-real`, commit 7d8b5a9 · Node v24.12.0

## Cómo se ha medido

- **Pruebas solo en local.** No se ha enviado ninguna petición a `https://the-outrun.onrender.com`, al servidor del puerto 8787 ni al túnel. Cada escenario arranca su propio servidor (`node server/main.ts`, `HOST=127.0.0.1`, puertos 8811–8819) y lo detiene al terminar.
- **Máquina:** portátil Windows 11, AMD Ryzen 7 5700U (8 núcleos, 16 hilos), Node v24.12.0. Los clientes de carga corren en un proceso aparte en la misma máquina.
- **Clientes:** clientes reales del protocolo (`mobile/www/js/net.js`, `GameConnection`) sobre el WebSocket nativo de Node. Ritmo, el mismo que la app:
  - ubicación 1 por segundo y jugador, que es la cota alta (`app.js:449-451` envía cada lectura con un mínimo de 1 s y repite cada 5 s; el servidor acepta una lectura cada 900 ms, `hub.ts:94`);
  - ping cada 10 s (`net.js:14`);
  - en ACTIVE, cada cazador intenta una captura cada 5 s.
  - Cada escenario recorre estas fases: crear/unirse → configurar (zona de 1.000 m, zona dinámica, `safetyChecklistConfirmed`) → preferencias de equipo → listos → empezar → 2 min de HEAD_START → 60 s de ACTIVE → **cierre simultáneo de todos los sockets** → 20 s estables → (opcional) **reinicio del servidor** → `end_game`.
- **Medidas del servidor:** desde dentro del proceso, con `--import scripts/muestreo-servidor.mjs`, que no modifica el código del juego. Una muestra por segundo de `process.cpuUsage()` (como % de un núcleo), RSS, montón de V8 y retraso del bucle de eventos. Se contrastó con `Get-Process` de PowerShell, desde fuera, dos veces por fase (campo `getProcess` de cada JSON). Ejemplos: 50×10 en ACTIVE da 82 % según Get-Process y 81,7 % según el muestreo; 1×20 da 12,7 % frente a 14,2 %.
- **Medidas de los clientes:** latencias (create, join, cada comando y RTT de ping), mensajes y bytes por fase (solo la carga útil JSON, sin cabeceras WebSocket, TLS ni HTTP) y errores.
- **Retraso del bucle de eventos en Windows:** el valor base de ~16 ms es la granularidad del temporizador de Windows, no carga. Lo relevante son los picos por encima de ese valor.
- Registros en `registros/`: `NN-*.txt` (salida completa), `NN-*.json` (resumen), `NN-*.muestras.jsonl` (muestras por segundo), `tabla-resultados.md`, `09-limites.txt`, `10-peso-pagina.txt` y `fuentes-render-20261104.txt` (extractos literales de la documentación de Render).
- **Primera ejecución del escenario 05 colgada.** Se colgó en la fase final (`registros/05-5salas-10j.colgado-1a-ejecucion.*`). Se corrigió `carga.mjs` (plazo de 15 s por comando y vigilante de 15 min) y se repitió. La causa es un defecto real del cliente: ver R-5.
- **Límite de salas en las pruebas:** todos los clientes salen de 127.0.0.1, así que se usó `MAX_ROOMS_PER_IP=1000`. **Producción no define esta variable** (`render.yaml`) y usa el valor por defecto, **5 salas por dirección**.

## Resultados medidos

Fase ACTIVE salvo indicación. «Entrantes» y «salientes» se cuentan desde el punto de vista del servidor.

| Escenario | Jugadores | CPU media (% de 1 núcleo) | CPU máx. | RSS máx. (MB) | Entrantes (msg/s) | Salientes (msg/s) | Salientes (kB/s) | RTT ping p50/p95/p99 (ms) | claim_tag p50/p95/p99 (ms) | Reconexión simultánea | Reinicio del servidor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 sala × 5 | 5 | 0,2 | 4,6 | 79 | 5,5 | 1,8 | 0,5 | 1/1/2 | 3/7/7 | 5/5, misma identidad, todos en 0,74 s | — |
| 1 sala × 10 | 10 | 3,3 | 9,4 | 95 | 11,5 | 3,7 | 1,7 | 1/2/2 | 5/34/42 | 10/10 en 0,82 s | — |
| 1 sala × 15 | 15 | 8,9 | 18,7 | 145 | 17,0 | 5,5 | 4,1 | 2/24/44 | 7/36/74 | 15/15 en 0,86 s | — |
| 1 sala × 20 | 20 | 14,2 | 26,4 | 204 | 22,7 | 6,9 | 7,1 | 1/564/564 | 8/132/180 | 20/20 en 0,94 s | — |
| 5 salas × 10 | 50 | 17,9 | 35,8 | 181 | 57,2 | 17,8 | 8,1 | 1/100/130 | 7/106/181 | 50/50 en 1,0 s | **Sin estado: 0/50 recuperados** (20 `bad_session`, 30 `rate_limited`) |
| 10 salas × 10 | 100 | 35,7 | 66,8 | 181 | 112,8 | 35,6 | 16,0 | 2/260/273 | 14/283/412 | 100/100 en 1,5 s | **Con STATE_FILE: 100/100, misma identidad y fase ACTIVE, en 0,78 s** |
| 25 salas × 10 | 250 | 70,6 | 97,4 | 244 | 285,6 | 84,5 | 36,7 | 353/1181/1315 | 247/912/1485 | 250/250 en 2,2 s | **Con STATE_FILE: 250/250 en 0,94 s** |
| 50 salas × 10 | 500 | 81,7 (saturado) | 92,9 | 267 | 570,6 | 94,2 | 17,3 | 1095/2262/2478 | 1038/2197/3114 | 500/500 en 11,1 s (p50 4,3 s) | — |

Otras medidas, sacadas de los JSON:
- **Final de partida** (`end_game` hasta que todos ven FINISHED): 4 ms con 5 jugadores; 30 ms con 10×10; 45 ms con 25×10; 951 ms con 50×10. El `end_game` tardó p50 761 ms con 50×10.
- **Entrada con 50×10:** join p50/p95 173/282 ms; set_ready 263/338 ms.
- **Arranque del proceso** en local: 218–445 ms hasta que `/health` responde.
- **Reinicio con estado** (10 y 25 salas): servidor caído 385–481 ms. Recuperación de todos por debajo de 1 s gracias a la espera de reconexión de net.js (500 ms + azar).
- **No se probaron 100 salas × 10.** El servidor ya está saturado con 50×10 (CPU 82–93 % de un núcleo y RTT p50 > 1 s), así que no aporta nada nuevo. El límite de 100 salas y 1.000 conexiones se comprobó aparte (abajo).
- **El generador de carga no era el cuello de botella:** el retraso p99 de su bucle de eventos fue de 20–23 ms en todos los escenarios.

### Límites de la aplicación comprobados (`registros/09-limites.txt`)

| Límite | Código | Resultado medido |
|---|---|---|
| Salas activas por dirección: 5 | `hub.ts:222`, `main.ts` `MAX_ROOMS_PER_IP` | La 6.ª da `too_many_rooms`. Las 5 salas siguen ocupadas al cerrar las conexiones (se borran a los 30 min sin actividad, `constants.ts:41`). |
| Salas en total: 100 (fijo, sin variable de entorno) | `hub.ts:221` | 100 `welcome` y 1 `server_full` |
| Conexiones WebSocket: 1.000 (fijo, **sin límite por dirección**) | `main.ts:33`, `main.ts:266` | 1.000 abiertas y 10 rechazadas (503), todas desde la misma dirección |
| Tamaño de mensaje: 4.096 bytes | `protocol.ts:33` | 5.000 bytes: cierre 1009. Campo desconocido: `bad_message` |
| Ráfaga de 30 mensajes, 10/s sostenidos; corte tras 200 descartados | `hub.ts:91-93` | 60 pings de golpe dan 30 pongs. 400 de golpe dan 30 pongs y cierre 4008. |
| Ubicación: 1 cada 900 ms por jugador; captura: 1 cada 3 s | `hub.ts:94-95` | Visto en carga (`cmd_claim_tag_rate_limited`, 50×10) |
| create/join/resume: 10/min por conexión; **20 fallos/min por dirección** | `hub.ts:96-98`, `:400` | 22 reanudaciones inválidas dan 20 `bad_session` y 2 `rate_limited`. Justo después, **crear una sala desde esa dirección da `rate_limited`** y **la reanudación de una sesión VÁLIDA también da `rate_limited`**: 0 instantáneas en 15 s y el socket sigue abierto. |
| Búfer de salida por cliente: 1 MB; inactividad: 75 s; ping del servidor: 20 s | `main.ts:269-271` | No se ha medido |
| Sesiones guardadas para reanudar: 300 eventos; respuestas para idempotencia: 64 | `hub.ts:223-224` | No se ha medido |

## Los 13 puntos

1. **Tipo de instancia.** `render.yaml:8`: `plan: free`, región Frankfurt, un único servicio web Node que sirve la interfaz, `/ws`, `/health` y `/api/loc`. Según la documentación oficial ([2], [3]), el plan Free tiene **0,1 CPU y 512 MB** y una sola instancia, sin escalado ([1]).

2. **Suspensión.** A los **15 min sin tráfico entrante**, que incluye mensajes WebSocket de conexiones abiertas ([1]). Durante una partida no se suspende: cada cliente hace ping cada 10 s. Pero una pestaña abierta en la sala de espera también lo mantiene despierto y consume horas. Las 750 h/mes por espacio de trabajo alcanzan para un servicio encendido todo el mes ([1]).

3. **Arranque en frío.** Medido en producción: **22,4 s** tras 16 min sin tráfico (`QA/produccion-20261104/registros/03-arranque-en-frio.txt`). Render indica «unos 1 min» ([1]). En local el proceso arranca en 0,2–0,45 s, así que el resto es la plataforma.

4. **Memoria y CPU.** Medido en local:
   - Memoria: RSS de 79 MB (1×5) a 204 MB (1×20) y 267 MB (50×10). Todo cabe en 512 MB.
   - CPU: lo que limita es la CPU, y **no crece de forma lineal con los jugadores de una sala**: 0,2 % (5), 3,3 % (10), 8,9 % (15) y 14,2 % (20) de un núcleo. Con 20 jugadores aparecen pausas del bucle de eventos de 240–270 ms (p99) y un RTT p95 de 564 ms.
   - Causa probable (R-1): el motor clona todo el estado de la sala dos veces por comando, ubicaciones incluidas.
   - **Extrapolación, no medida en Render**, suponiendo que la «0,1 CPU» de Render equivale al 10 % de un núcleo de este portátil (no verificado): una sala de 10 (3,3 %) cabe; una de 15 (8,9 %) va al límite; **una sola sala de 20 (14,2 % de media, picos del 26 %) supera la cuota**; 5 salas de 10 (17,9 %) también. En un plan de 0,5 CPU caben unas 10–12 salas de 10 (35,7 % con 10 salas) o unas 3 de 20. Con estrangulamiento de CPU, las latencias crecerían como en los escenarios 25×10 y 50×10 de esta máquina (RTT p50 de 0,35 s y 1,1 s).

5. **Ancho de banda.** Render factura la salida, incluidos los mensajes WebSocket. El espacio Hobby incluye **5 GB/mes** y el Pro, 25 GB ([4]). Sin método de pago, al agotarlo **se suspenden los servicios Free hasta fin de mes** ([1]).
   - Partida, medido como carga útil sin cabeceras: 1,7 kB/s para una sala de 10 y 7,1 kB/s para una de 20. Eso son ~6 MB/h y ~25 MB/h por sala.
   - Página: **1,78 MiB por carga** (1,29 MiB más el worker de MapLibre), sin compresión y con `cache-control: no-store` (`main.ts:250`). Se descarga entera en cada carga o recarga (`10-peso-pagina.txt`). No he verificado si Cloudflare, delante de Render, la comprime.
   - Estimación: una partida de 1 h con 20 personas son ~25 MB de juego más ~36 MB de páginas, unos 61 MB. Con 5 GB/mes salen **~80 partidas así al mes**, menos si recargan la página.

6. **Conexiones simultáneas.** Tope de 1.000 en la aplicación (`main.ts:33`), comprobado. **No hay límite por dirección**: una sola dirección abrió las 1.000. Render Free no publica un límite de conexiones que yo haya encontrado. En esta máquina el servidor ya va saturado con 500 clientes (50×10).

7. **Salas simultáneas.** Tope de 100 en la aplicación (`hub.ts:221`, sin variable de entorno), comprobado. La capacidad real la marca la CPU: en este portátil, 25 salas de 10 ya llevan el RTT p50 a 353 ms y 50 salas saturan el núcleo. En Render Free, por extrapolación, cabe aproximadamente **1 sala de 10–15 jugadores en partida**.

8. **5/10/15/20 jugadores.** Medidos los cuatro (tabla). Con 5 y 10 la latencia es de pocos milisegundos. Con 15 aparecen colas p99 de 44–74 ms. Con 20, pausas de hasta ~0,5 s (claim_tag p99 180 ms; RTT p95 564 ms). La reconexión simultánea recupera al 100 % con la misma identidad en menos de 1 s en todos los casos.

9. **Reinicios, despliegues y suspensiones.** Las salas viven en memoria (`hub.ts:199`):
   - En Free, **toda suspensión, reinicio («en cualquier momento», [1]) o despliegue borra todas las salas**, igual que el escenario 05 «sin estado»: 0/50 sesiones recuperadas.
   - `render.yaml:10` despliega la rama `mapa-real` y no desactiva `autoDeploy`, así que **cada `git push` a `mapa-real` corta todas las partidas en curso**. Hay varios agentes empujando cambios a esa rama.
   - En un despliegue sin corte, Render manda SIGTERM a la instancia antigua 60 s después y SIGKILL tras 30 s más ([6]). Los clientes reconectan a la nueva instancia, que no tiene sus salas, y reciben `bad_session`.

10. **Persistencia existente.** La variable `STATE_FILE` (`main.ts:17-19`):
    - **Qué hace:** guarda cada 2 s si hubo cambios (`main.ts:189`), escribiendo en síncrono `JSON.stringify` de todas las salas (`main.ts:74`) y renombrando de forma atómica. También guarda al recibir SIGINT o SIGTERM (`main.ts:367`) y restaura al arrancar.
    - **Qué guarda** (`hub.ts:271-286`): estado de cada sala sin `samples` ni `lastPing`; nombres, `deviceId`, código de sala, configuración con el centro de la zona y el punto de encuentro; **hash SHA-256 del secreto**, nunca el secreto, que tiene 32 bytes aleatorios; números de secuencia; y respuestas en caché. No revisé si otros campos (reclamaciones o capturas) llevan coordenadas.
    - **Seguridad:** el archivo se crea con los permisos por defecto. Contiene datos personales ligeros y la ubicación de la zona, así que conviene que el disco no sea accesible por otros servicios (en Render no lo es [5]).
    - **Medido en local:** con estado, **100 % de las sesiones recuperadas, misma identidad y fase ACTIVE, en 0,78 s (100 jugadores) y 0,94 s (250)**. En Windows el proceso se mató sin guardado final; bastó el guardado periódico.
    - **En Render Free no sirve:** el disco es efímero y se pierde al reiniciar, desplegar o suspender ([1]); el plan Free no admite disco persistente.
    - **Con plan de pago y disco funcionaría:** el SIGTERM provoca el guardado final. Pero el disco **impide el despliegue sin corte** (unos segundos de caída, que net.js absorbe reconectando) y **no permite configurar el tiempo de apagado** ([5], [6]).
    - **Coste no medido:** el guardado síncrono cada 2 s bloquea el bucle de eventos. Durante la partida casi cada lectura de ubicación cambia el estado (`hub.ts:741`), así que con muchas salas se escribe el archivo entero cada 2 s. No he aislado ese coste: los escenarios 06 y 07 lo incluyen.

11. **Avalancha al despertar o reiniciar.**
    - *Con sesiones válidas* (cierre de red simultáneo o reinicio con STATE_FILE): de 5 a 250 clientes recuperan en 0,7–2,2 s. Con 500 clientes en un servidor saturado tardan 11 s, pero el 100 % lo logra.
    - *Sin estado*, que es el caso real en Render Free tras suspensión, reinicio o despliegue: todas las reanudaciones fallan. Además, **a partir del fallo 20 desde una misma dirección, el servidor bloquea esa dirección un minuto** (`hub.ts:98`, `hub.ts:400`). Medido: 30 de 50 clientes recibieron `rate_limited` en vez de `bad_session` y **quedaron con el socket abierto sin sesión ni aviso de sesión perdida**. Nadie desde esa dirección puede crear una sala nueva durante ~1 min. Los jugadores de un mismo grupo comparten dirección pública (misma Wi-Fi o CGNAT del operador), así que es justo el caso habitual (R-2).
    - Tras una suspensión en Free, el primer jugador espera además ~22 s de arranque en frío.

12. **Protección contra abuso.** Existe: límites por conexión (ráfaga y ritmo), tamaño de mensaje, salas por dirección, fallos por dirección, ubicación y captura por jugador, comprobación de origen, secreto de 32 bytes comparado en tiempo constante, y límite de cuerpo en `/api/loc` (1 KB). Huecos:
    - **R-3:** sin límite de conexiones por dirección. Una sola dirección puede ocupar las 1.000 plazas, y todos los demás reciben 503.
    - **R-4:** con `TRUST_PROXY=1` (producción), la dirección del cliente se toma del **primer** valor de `CF-Connecting-IP` o `X-Forwarded-For` (`main.ts:98-101`). Si el proxy de Render no sobrescribe esas cabeceras (**no verificado**: no hay documentación, ver fuentes), un atacante puede cambiar de dirección en cada petición, saltarse los límites por dirección y **llenar las 100 salas durante 30 min** (borrado por inactividad, `constants.ts:41`). Con 20 direcciones reales consigue lo mismo.
    - `/health` es público y muestra el número de salas, sesiones y clientes. Riesgo bajo.

13. **Riesgo de fallos por límites.** Ordenado por probabilidad en una prueba real:
    - (a) Despliegue automático o reinicio de Render en mitad de la partida: se pierden todas las salas.
    - (b) Tras esa pérdida, bloqueo de un minuto del grupo y clientes colgados (R-2, R-5).
    - (c) Una sola sala de 20 jugadores supera la cuota de 0,1 CPU (extrapolación): latencias de cientos de milisegundos o más.
    - (d) Agotar los 5 GB de salida: suspensión hasta fin de mes si no hay tarjeta.
    - (e) Arranque en frío de ~22 s para el primero que entra.
    - (f) Abuso (R-3, R-4).

    La memoria (≤ 267 MB medidos con 500 clientes) no es el límite.

## Defectos detectados (no corregidos, solo descritos)

- **R-1 (rendimiento).** `engine/src/engine.ts:628` y `:632`: `applyCommand` hace dos `structuredClone` del `RoomState` completo por comando, también por cada ubicación (1/s por jugador). El estado incluye el historial de muestras de 120 s de cada jugador (`constants.ts:43`). El trabajo por segundo crece aproximadamente con el cuadrado del número de jugadores. **Evidencia:** CPU de 0,2 → 3,3 → 8,9 → 14,2 % para 5 → 10 → 15 → 20 jugadores, y pausas del bucle de 240–270 ms (p99) con 20 jugadores (`04-sala-20j.json`). Es la palanca de capacidad más grande antes de pagar más CPU.
- **R-2 (disponibilidad).** `server/hub.ts:400` (`countAttempt` → `tooManyFailures(client.ip)`) junto con `hub.ts:509`: después de un reinicio sin estado, las reanudaciones fallidas de un grupo que comparte dirección agotan los 20 fallos por minuto. A partir de ahí también se rechazan las reanudaciones válidas y la creación de salas nuevas desde esa dirección. **Evidencia:** `09-limites.txt` (apartado 6) y `05-5salas-10j.json` (`motivosPerdida: {rate_limited: 30, bad_session: 20}`).
- **R-5 (cliente).** `mobile/www/js/net.js:441` (`command`) y `:405-419`: si el servidor responde a un comando con `{t:'error'}` en lugar de `{t:'result'}` (p. ej. `no_session`, `hub.ts:567`, cuando la sesión ya no existe), la promesa de `command()` **no se resuelve nunca**. **Evidencia:** la primera ejecución del escenario 05 quedó colgada 20 min esperando el `end_game` (`05-5salas-10j.colgado-1a-ejecucion.txt`; la repetición registra `cmd_end_game_sin_respuesta_15s`). Además, un `rate_limited` en `resume` deja la conexión abierta y sin sesión, sin reintento ni `session_lost` (`net.js` solo trata `bad_session` y `removed` en `:406`).
- **R-3 y R-4:** descritos en el punto 12.

## Recomendación de alojamiento

1. **Mantener Free solo para desarrollo y demostraciones cortas** (coste 0). Tiene arranque en frío de ~22 s, pierde las salas en cualquier reinicio o despliegue y, por extrapolación, solo cabe una sala de hasta 10–15 jugadores. Para pruebas físicas: **abrir la URL un minuto antes y no empujar a `mapa-real` mientras se juega**. Mejor aún, desplegar desde una rama de publicación aparte o poner `autoDeploy: false`.
2. **Para pruebas con grupos reales o varias salas a la vez:** plan de pago siempre activo. **Starter: 0,5 CPU, 512 MB, $7/mes** ([3]; tabla «Compute» de render.com/pricing, consultada el 04/11/2026). Elimina el arranque en frío y la suspensión. Por extrapolación da para ~3 salas de 20 o ~10 de 10.
   - Si hay que garantizar que una partida sobreviva a despliegues y reinicios, añadir **disco persistente con `STATE_FILE`**. La persistencia ya existe y funciona (recuperación del 100 % en menos de 1 s medida en local). El precio del disco, $0,25/GB al mes, sale del extractor de la página de precios y **no está verificado literalmente**.
   - Hay que aceptar unos segundos de corte en cada despliegue (con disco no hay despliegue sin corte [5]).
   - El plan Standard (1 CPU, 2 GB, $25/mes [3]) solo hace falta si se esperan más de ~10 salas a la vez.
3. **Antes de pagar más CPU:** reducir el coste de R-1 en el motor y corregir R-2 y R-5. Son baratos y cambian mucho los números (decisión del propietario y de los agentes de motor y cliente; no los he tocado).
4. **Otro proveedor:** no evaluado. No he consultado precios oficiales de alternativas, así que no hago ninguna afirmación sobre ellas.
5. **Combinación recomendada para la fase actual:**
   - Free para desarrollo, con `autoDeploy` desactivado o una rama de publicación.
   - Starter más disco de 1 GB con `STATE_FILE`, solo durante el periodo de pruebas físicas: unos $7,25/mes según las fuentes citadas, ver la advertencia sobre el precio del disco.
   - Revisar el ancho de banda (5 GB en Hobby) si se juegan más de unas 80 partidas de 20 personas al mes.

No he contratado nada ni cambiado ninguna infraestructura.

## Fuentes (consultadas el 04/11/2026; extractos en `registros/fuentes-render-20261104.txt`)

- [1] https://render.com/docs/free
- [2] https://render.com/docs/compute-plans
- [3] https://render.com/pricing
- [4] https://render.com/docs/outbound-bandwidth
- [5] https://render.com/docs/disks
- [6] https://render.com/docs/deploys
- No verificado: el tratamiento de `X-Forwarded-For` y `CF-Connecting-IP` por el proxy de Render; la equivalencia entre la «CPU» de Render y un núcleo de esta máquina; la compresión por Cloudflare; y los precios literales del disco y de los planes de espacio de trabajo.

## Archivos

- `scripts/carga.mjs`: escenario de carga parametrizable.
- `scripts/serie.sh`: serie 05–08 (la 01–04 se lanzó con la versión anterior del mismo script).
- `scripts/muestreo-servidor.mjs`: muestreo dentro del proceso del servidor.
- `scripts/limites.mjs`: comprobación de los límites de la aplicación.
- `scripts/peso-pagina.mjs`: bytes que descarga una carga de la página.
- `scripts/tabla.mjs`: genera `registros/tabla-resultados.md`.
- `registros/`: salida bruta de todo lo anterior.
