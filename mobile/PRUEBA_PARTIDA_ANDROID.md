# Prueba real de partida con dos móviles Android (H2)

> **Estado (26/10/2026): preparada, NO realizada.** No hay ningún resultado físico de esta prueba. Lo único validado es automático o en navegadores de un ordenador (`QUALITY_STATE.md`, sección «H2: prueba real en Android»).

## Qué se quiere saber

1. Si dos personas pueden jugar desde sus propios móviles, en redes distintas, contra el servidor de tu ordenador publicado con un túnel HTTPS.
2. Si el servidor **sigue recibiendo la ubicación con la pantalla bloqueada**. Este es el riesgo principal.
3. Si la partida se recupera tras perder la conexión.

## Qué necesitas

| Cosa | Detalle |
|---|---|
| Ordenador | Con Node 22.18 o superior y este repositorio. Tiene que seguir encendido, sin suspenderse y con Internet durante toda la prueba |
| Túnel HTTPS | `cloudflared` instalado por ti, desde la web oficial de Cloudflare. El túnel rápido no pide cuenta. **Mientras esté abierto, tu servidor es accesible desde Internet** |
| Móvil A | Xiaomi 14T con la APK `mobile/apk-local/the-outrun-h2-pantalla-bloqueada-debug.apk` (`0.3.0-h2-bloqueo`). Se instala encima de las anteriores porque tiene la misma firma de depuración |
| Móvil B | Otro Android 12 o superior con la misma APK. Si solo tienes un navegador en el móvil B, la prueba vale para todo salvo la pantalla bloqueada de B |
| Opcional | Un tercer jugador en el navegador del ordenador, para poner a A y B en el mismo equipo (variante 2) |

SHA-256 de la APK: `c9c2b142a9aaebcc75677a78c7f22ecbef4ade0453d23242a31288f412a2adf5`. Compruébalo antes de instalar, por ejemplo con `sha256sum`.

## Cómo llega la ubicación con la pantalla bloqueada (para interpretar lo que veas)

- **En la app Android, durante la partida,** el servicio en primer plano (el de H1) envía cada lectura al servidor por HTTPS (`POST /api/loc`), con la sesión del jugador.
  - No depende de que la página siga despierta.
  - La notificación lo dice: «Partida en curso: tu ubicación se envía al servidor de la partida».
- **Cuándo envía la página:** mientras el envío nativo funciona, la página no envía nada por el WebSocket. Si el envío nativo falla, la página vuelve a enviar por el WebSocket, como mucho a los 5 s.
- **Conexión con la página dormida:**
  - El servidor manda un ping de protocolo cada 20 s, que la pila de red del móvil contesta sin JavaScript, así que la conexión debería seguir abierta.
  - Si se corta, la app se reconecta al desbloquear.
- **En el navegador (también iPhone),** la ubicación se detiene con la pantalla apagada. Es una limitación conocida.

## Procedimiento

### 0. Antes de salir (en casa, 10 min)

1. Abre la carpeta del repositorio en una terminal y ejecuta `npm run test:server`. Tienen que pasar todas.
2. Anota en ambos móviles la batería y los ajustes de HyperOS, sin cambiarlos:
   - ahorro de batería de la app;
   - inicio automático;
   - modo de ahorro del sistema.

   Son los mismos de `PRUEBAS_XIAOMI_14T.md`.

### 1. Arrancar el servidor (terminal 1)

```bash
TRUST_PROXY=1 LOG=1 node server/main.ts
```

- `LOG=1` registra tipos de comando y resultados, sin nombres, coordenadas ni secretos.
- `TRUST_PROXY=1` hace que los límites por dirección usen la IP real de cada móvil, en vez de la del túnel, que es la misma para todos.
- **No uses `HOST=0.0.0.0`:** el servidor solo debe escuchar en tu ordenador; el túnel se conecta a él.

En Windows (PowerShell): `$env:TRUST_PROXY="1"; $env:LOG="1"; node server/main.ts`.

### 2. Abrir el túnel (terminal 2) y el registro de evidencias (terminal 3)

```bash
cloudflared tunnel --url http://localhost:8787     # muestra https://<algo>.trycloudflare.com
node server/health-watch.mjs                        # cada 10 s: conexiones y lecturas por canal
```

- Abre `https://<algo>.trycloudflare.com/health` en el navegador del móvil A, con datos móviles y sin wifi. Debe responder `{"ok":true,…}`.
- **Comprobación:** si no responde, el problema es el túnel o la red, no la app. Anótalo y para.

### 3. Conectar el móvil A y crear la sala

1. Instala la APK y ábrela.
2. En «Servidor», pega `https://<algo>.trycloudflare.com`.
3. Escribe tu nombre y pulsa **Crear sala**.
4. Concede la ubicación **precisa** «Mientras se usa la app» y las notificaciones. Sin las notificaciones, Android puede ocultar el aviso del servicio.
5. **Comprobación:** aparece el código de 6 letras y el indicador dice «Conectado». En el terminal 3, `conexiones` pasa a 1.

### 4. Conectar el móvil B

1. Instala la misma APK, escribe el mismo servidor, tu nombre y el código, y pulsa **Unirme**.
2. **Comprobación:**
   - A y B se ven en la sala;
   - `conexiones` = 2 (3 con el navegador de la variante 2).

### 5. Configurar y empezar

1. **En A (anfitrión):**
   - Centrar la zona aquí;
   - radio de 400 m;
   - 10 min de duración;
   - 2 min de huida;
   - pistas cada 2 min;
   - lista de seguridad.
2. **Reparto de roles:**
   - Variante 1 (dos móviles): deja el sorteo; uno será cazador y el otro fugitivo.
   - Variante 2 (con el navegador del ordenador como tercer jugador): asigna a A y B como **cazadores** y al navegador como fugitivo. Así A y B se ven en el radar como compañeros.
3. Todos pulsan **Estoy listo**. A pulsa **Empezar partida**.

### 6. Sincronización

**Comprobaciones:**
- La cuenta atrás de 5 s termina a la vez en A y B. Grábalo con un tercer móvil o cuenta en voz alta; tolerancia de 1 s.
- Cada uno ve **solo su rol**.
- La huida y la persecución empiezan a la vez, y el temporizador es igual en ambos (±1 s).
- La notificación de ambos móviles dice «Partida en curso: tu ubicación se envía al servidor de la partida».
- En el radar aparece «se envía también con la pantalla bloqueada».
- En el terminal 3:
  - `lecturas_http` sube unas 2 por móvil cada 10 s (una lectura cada ~5 s);
  - `lecturas_ws` no sube, porque la app envía por el canal nativo.

### 7. Pantalla bloqueada (lo más importante)

1. **Bloquea A durante 3 minutos,** guárdalo en el bolsillo y camina. B sigue desbloqueado.
   - **Variante 2:** en B, la etiqueta de A en el radar debe seguir diciendo «hace 0–10 s».
   - **Variante 1:**
     - si A es fugitivo, la pista que recibe B (cazador) cada 2 min debe mostrar a A con poca antigüedad;
     - si A es cazador, fíjate solo en el terminal.
   - **Terminal 3:** `lecturas_http` sigue subiendo al mismo ritmo, y `conexiones` sigue en 2.
2. **Bloquea los dos 3 minutos.**
   - **Terminal 3:**
     - `lecturas_http` sigue subiendo unas 4 cada 10 s;
     - `conexiones` debería seguir en 2. Si baja, anota a qué hora: la conexión se cortó con la página dormida, pero las lecturas pueden seguir llegando por HTTP.
3. **Desbloquea los dos.**
   - **Comprobaciones:**
     - el temporizador es correcto;
     - el estado es el mismo en ambos;
     - el indicador dice «Conectado» como mucho a los 10 s.

### 8. Pérdida de conexión y recuperación

1. **En B, activa el modo avión 60 s** durante la persecución.
   - **Comprobaciones:**
     - B muestra «Reconectando…» como mucho a los 40 s;
     - en el terminal 3, `conexiones` baja como mucho a los 75 s (antes si Android cierra el socket).
2. **Quita el modo avión.**
   - **Comprobaciones:**
     - B vuelve a «Conectado» y a la persecución con el temporizador correcto, sin volver a entrar con el código;
     - `lecturas_http` vuelve a subir.
3. **Opcional:** cambia de wifi a datos en A durante la partida. Debe recuperarse solo.

### 9. Captura y final (opcional, si A y B son rivales)

1. **Junta los dos móviles a menos de 10 m, al aire libre, y espera 15 s.**
   - El cazador pulsa el nombre del fugitivo, y el fugitivo confirma.
   - **Comprobación:** el servidor la acepta, y si la rechaza, que el motivo sea razonable (precisión o antigüedad).
2. **A pulsa «Terminar partida» dos veces.**
   - **Comprobaciones:**
     - los dos ven el final;
     - la notificación del servicio desaparece en ambos como mucho a los 10 s.

### 10. Evidencias y cierre

1. **Copia la salida del terminal 3** a un archivo. Contiene solo horas y contadores.
2. **Exporta el CSV de la sesión de cada móvil:** pie de la pantalla de inicio › «Diagnóstico GPS» › «Exportar CSV».
   - Sin coordenadas.
   - Incluye los eventos de pantalla apagada y encendida, y los contadores `uploaded=` y `upload_error=` cada 30 s.
3. **Anota:**
   - batería al final;
   - cualquier aviso de HyperOS;
   - qué comprobaciones fallaron, con la hora.
4. **Cierra** el túnel (Ctrl+C en el terminal 2) y el servidor (Ctrl+C en el terminal 1). La dirección `trycloudflare.com` deja de funcionar.

**No compartas** capturas del radar con lugares reconocibles ni la dirección del túnel mientras esté abierto.

## Criterios

| # | Comprobación | Supera | Falla |
|---|---|---|---|
| 1 | Acceso por túnel con datos móviles | `/health` responde en ambos móviles | No responde |
| 2 | Sala y unión | Los dos en la sala, `conexiones` = 2 | Error al crear o unirse |
| 3 | Sincronización | Cuenta atrás y fases a la vez (±1 s); rol solo propio | Desfase mayor, o se ve el rol ajeno |
| 4 | **Pantalla bloqueada (A)** | `lecturas_http` sigue subiendo ~2 cada 10 s por móvil durante los 3 min | Se para o cae a menos de la mitad |
| 5 | Pantalla bloqueada (A y B) | Igual, ~4 cada 10 s | Igual |
| 6 | Conexión con la pantalla bloqueada | `conexiones` se mantiene | Baja: no impide jugar si el punto 4 se cumple, pero hay que anotarlo |
| 7 | Recuperación tras el modo avión | B vuelve sola a la partida correcta | Hay que volver a entrar, o el estado es incorrecto |
| 8 | Fin de partida | La notificación desaparece | El servicio sigue activo tras el final |

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| `lecturas_http` no sube nunca | ¿La dirección del servidor empieza por `https://`? El envío nativo solo funciona con HTTPS. Mira la notificación: si dice «Esta sesión no envía nada al servidor», la app no recibió el destino |
| Sube desbloqueado pero no bloqueado | Restricciones de batería de HyperOS. Anota los ajustes. El CSV dirá si el GPS siguió midiendo (lecturas) y si el envío falló (`upload_error=network`) |
| `conexiones` baja al bloquear | Esperable si Android duerme la red de la página. Comprueba que `lecturas_http` sigue subiendo y que al desbloquear vuelve a «Conectado» |
| «Demasiados intentos» al unirse | Comprueba que arrancaste con `TRUST_PROXY=1`. Si no, todos los móviles comparten la IP del túnel |

## Qué enviar después

- La salida del terminal 3.
- Los CSV exportados.
- La tabla de criterios rellenada con Supera, Falla o No probado, y la hora de cada fallo.

Nada de ello contiene coordenadas.
