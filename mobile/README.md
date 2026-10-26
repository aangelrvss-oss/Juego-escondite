# THE OUTRUN · app móvil (H2: partida multijugador; H1: diagnóstico GPS)

App **Android** instalable (Capacitor 8) con la identidad de THE OUTRUN:
- **`index.html` (H2):** la **partida multijugador**. Sala con código, cuenta atrás, rol secreto, huida, persecución con radar, capturas validadas por el servidor, final y revancha. Se conecta al servidor de `../server/` por `wss://`.
- **`diagnostic.html` (H1):** la pantalla de **diagnóstico GPS**, sin cambios y sin red. Se abre desde el enlace del pie de la pantalla de inicio de la app.

La misma interfaz web funciona en el navegador de cualquier móvil (iPhone incluido) servida por el servidor, con la ubicación del navegador. Cómo jugar: [`../server/README.md`](../server/README.md).

> **Estado H2 (26/10/2026):** probado de extremo a extremo con cinco navegadores en un ordenador (`e2e/game.e2e.mjs`). **No se ha jugado todavía con móviles reales.**
> - Para que la ubicación llegue con la pantalla bloqueada, en partida el servicio nativo envía las lecturas al servidor por HTTPS. No depende de la página, que el sistema puede dormir.
> - Ese envío está probado con pruebas automáticas y contra el servidor real en un ordenador, pero **no en un móvil**.
> - La prueba con dos móviles está preparada paso a paso en [`PRUEBA_PARTIDA_ANDROID.md`](PRUEBA_PARTIDA_ANDROID.md). APK: `apk-local/the-outrun-h2-pantalla-bloqueada-debug.apk` (`0.3.0-h2-bloqueo`).

> **Estado (26/10/2026):** la APK corregida (commit `7ac972e`) funciona en el Xiaomi 14T y ha superado una **sesión corta** de prueba, con lecturas también con la pantalla apagada. El GPS **no está validado** para una partida real: faltan la caminata larga, la mala señal, la batería y el resto de [`PRUEBAS_XIAOMI_14T.md`](PRUEBAS_XIAOMI_14T.md). Las pruebas automatizadas no sustituyen a un móvil real.
>
> **Qué no cubre H1:** multijugador, servidor, salas, red ni iOS.

## Arquitectura

```
www/                      Interfaz (HTML/CSS/JS sin empaquetador), compartida con el futuro iOS
  index.html, js/app.js     Partida (H2): pantallas; se dibuja desde la vista autorizada del servidor
  js/net.js                 Único módulo con red: WebSocket, reanudación, seq, latido, hora del servidor
  js/location.js            Ubicación: nativa (Android hoy, iOS después) o del navegador; misma salida
  js/game-view.js, radar.js Textos, tiempos, enlace de invitación y radar SVG (puros, probados en Node; sin mapas externos)
  js/qr.js                  QR del enlace de invitación (codificador propio, sin dependencias)
  diagnostic.html           Diagnóstico GPS (H1), sin red
  js/diagnostic.js          Pantalla: solo DOM, sobre el modelo de vista
  js/view-model.js          Textos y estados de la pantalla (puro, probado en Node)
  js/reading-status.js      Clasificación de frescura, precisión y disponibilidad (igual que el motor S0)
  js/location-bridge.js     Puente JS ↔ nativo: valida y normaliza todo lo que llega del módulo nativo
  js/brand.generated.js     Marca generada desde la demo (npm run brand)
contract/location-bridge.json   Contrato del módulo nativo: métodos, eventos, tipos, estados y errores.
                                Android lo cumple hoy; iOS (Swift) deberá cumplir el mismo.
android/                  Proyecto Capacitor 8 (Gradle)
  app/.../app/theoutrun/location/
    OutrunLocationPlugin    Puente Capacitor: permisos, proveedor, sesión, estado, exportación
    LocationSessionService  Servicio en primer plano de tipo ubicación (adaptado de S1)
    Uploader, UploadConfig  Envío de las lecturas al servidor por HTTPS en partida (hilo propio)
    Payloads, SessionConfig, PermissionMapper, BridgeErrors   Java puro, probado sin dispositivo
    SessionStore, DeviceStateReader                           Adaptados/copiados de S1
  :s1core  →  ../../android/core   Núcleo de S1 compartido (no copiado): CSV sin coordenadas,
                                    clasificación, registro y análisis de sesiones
```

- **Proveedor:** `LocationManager.FUSED_PROVIDER` de la plataforma (Android 12+, sin Google Play Services). Si el dispositivo no lo tiene, `GPS_PROVIDER`. Calidad `HIGH_ACCURACY`.
- **Intervalo:** parámetro **experimental** (D-038), elegible en pantalla (1, 2, 5, 10 o 30 s; por defecto 5 s, el de S1). Android puede entregar lecturas más espaciadas; el registro mide lo que llega.
- **Permisos:** ubicación precisa y aproximada **solo mientras se usa la app**, servicio en primer plano de tipo ubicación, notificaciones (Android 13+, para el aviso persistente) e **Internet (desde H2)**, solo para el servidor de la partida. Sin `ACCESS_NETWORK_STATE` ni `ACCESS_BACKGROUND_LOCATION` (se eliminan del manifiesto aunque una biblioteca los declare).
- **Ubicación en partida:** se activa al empezar la cuenta atrás, o cuando el anfitrión centra la zona, y se detiene al terminar o al ser capturado. El servidor solo reenvía a cada jugador lo que puede ver: compañeros, fugitivos expuestos y pistas. Nunca hay coordenadas en los registros.
- **Envío nativo (solo en partida y solo a un servidor `https://`):**
  - `startSession({ intervalMs, upload })` hace que el servicio envíe cada lectura nueva a `POST /api/loc`, también con la pantalla bloqueada.
  - Solo se envía la última lectura pendiente. La antigüedad se mide con el reloj monótono al enviar.
  - El secreto de la sesión solo vive en la memoria del servicio.
  - Si el servidor responde 401 o 410 (sesión no válida, jugador capturado o partida terminada), el servicio termina solo, aunque la interfaz esté dormida.
  - Mientras el envío nativo funciona, la página no envía por el WebSocket. Si falla, vuelve a hacerlo como mucho a los 5 s.
  - La notificación dice si se está enviando.
  - Sin `upload` (pantalla de diagnóstico, centrar la zona), no se envía nada.
- **Privacidad:**
  - Las coordenadas viajan del servicio a la pantalla, en memoria, y en partida al servidor de la partida por HTTPS.
  - Nunca se guardan: el CSV no tiene columnas de latitud ni longitud, y los detalles con números de 4 o más decimales se eliminan (núcleo de S1).
  - Capacitor no escribe las llamadas en el registro del sistema (`loggingBehavior: none`).
  - Sin copia de seguridad (`allowBackup=false`).
- **Sin reglas del juego:** el módulo nativo no decide nada del juego; la disponibilidad usa los mismos umbrales experimentales que el motor S0 (una prueba lo comprueba).

## Comandos

```bash
cd mobile
npm install --ignore-scripts      # Capacitor 8.5.3 (versiones exactas)
npm test                          # pruebas JS (Node)
npm run sync                      # marca + runtime de Capacitor + copia a Android

# Pruebas Java y APK de depuración (JDK 21, SDK de Android con plataforma 36 y build-tools 35)
ANDROID_HOME=/ruta/al/sdk gradle -p android :s1core:test :app:testDebugUnitTest :app:assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Requisitos de Capacitor 8.5.3 comprobados en su plantilla: AGP 8.13.0, Gradle 8.14.3, compileSdk y targetSdk 36. La app usa `minSdk 31` (Android 12) por el proveedor fusionado de la plataforma.

## Pruebas automatizadas y sus límites

| Prueba | Comando | Qué comprueba | Límite |
|---|---|---|---|
| JS (`test/*.test.mjs`, 79) | `npm test` | Puente, modelo de vista, estados de lectura, marca, red solo desde `net.js`, textos y tiempos del juego, radar sin coordenadas, adaptador de ubicación y latido. `native-plugin.test.mjs` reproduce el defecto de arranque con el runtime real de `@capacitor/core`. `lockscreen.test.mjs`: envío nativo, receptor de lecturas y latido con temporizadores retrasados | El puente Android, el WebSocket y la geolocalización están **simulados** |
| E2E del flujo web (26 comprobaciones, con revancha, abandono en partida, un jugador sin permiso de ubicación, desconexión y expulsión) | `node e2e/web-flow.e2e.mjs <chrome.exe>` (desde `mobile/` o la raíz) | Tres jugadores en contextos aislados de Chrome contra el servidor real: enlace `?sala=`, QR de la interfaz decodificado, cambio de código y enlace antiguo rechazado; partida corta (zona, cuenta atrás, rol privado, huida, captura) hasta el Mission Report, igual en los tres y de nuevo tras recargar | Chrome de escritorio, no un móvil. Geolocalización emulada y reloj del servidor controlado. El QR lo lee un lector de prueba, no una cámara. Solo decodifica QR de versión 5 o menor (URL corta) |
| E2E de la partida (8 etapas) | `node e2e/game.e2e.mjs [capturas]` | Cinco navegadores contra el servidor real: sala, asignación, cuenta atrás, revelación privada, huida, persecución, captura validada, corte de red y reconexión, final, revancha y tramas sin datos ajenos | Navegadores en un ordenador, geolocalización emulada, reloj del servidor controlado. **No** son móviles |
| E2E de arranque del diagnóstico (4 escenarios) | `npm run vendor` y después `node e2e/boot.e2e.cjs` | Que la pantalla arranca y «Comprobar de nuevo» llega al módulo nativo. Que los fallos (plugin sin registrar, Capacitor que no carga o no responde) se ven en «Incidencias» sin bloquear los botones | Usa el `native-bridge.js` real de `node_modules/@capacitor/android` (requiere `npm install`) y el Playwright y Chromium del entorno, que **no** son dependencias del proyecto. El lado nativo está **simulado** |
| Java de la app (19) | `:app:testDebugUnitTest` (comando Gradle de arriba) | Contrato del puente, exportación del CSV sin coordenadas, destino y cuerpo del envío. `UploaderTest`: el envío real (`HttpURLConnection`) contra un servidor local | Sin dispositivo; el servidor de `UploaderTest` es HTTP sin TLS |

Para comprobar el JavaScript empaquetado en una APK, la E2E acepta la carpeta web y el `native-bridge.js` extraídos: `node e2e/boot.e2e.cjs <assets/public> <assets/native-bridge.js>`.

**Defecto corregido en `7ac972e`:** `nativePlugin()` devolvía el proxy de `registerPlugin(...)` desde una función `async`. Como el proxy responde a «then», el arranque se quedaba esperando sin fin y ningún botón respondía. Ahora devuelve `{ plugin }`, el arranque tiene un tiempo límite de 5 s y los errores se muestran en «Incidencias».

## Instalar en el Xiaomi 14T

1. Copia `app-debug.apk` al móvil (cable USB, o tu nube).
2. Ábrelo desde **Archivos** y permite «instalar apps desconocidas» para esa app cuando lo pida.
3. Si HyperOS muestra un aviso de seguridad, revisa que el origen sea el archivo que copiaste y continúa.
4. La firma es la **de depuración** (no sirve para publicar). Para actualizar, instala el nuevo APK encima.

## Para iOS (cuando tengas un Mac)

La interfaz (`www/`), el protocolo (`../server/protocol.ts`) y el servidor no cambian. **Hasta entonces**, los jugadores con iPhone pueden jugar desde Safari abriendo la dirección del servidor, siempre con la pantalla encendida.

Pasos en el Mac (Xcode 26 o posterior):
1. `cd mobile && npm install --ignore-scripts && npm install --save-exact @capacitor/ios@8.5.3`, y después `npx cap add ios` y `npm run sync`.
2. Plugin Swift `OutrunLocation` que cumpla `contract/location-bridge.json`:
   - mismos métodos, eventos y errores;
   - lecturas con `ageMs` medido con un reloj monótono;
   - con `CLLocationManager`, permiso «Al usar la app», `allowsBackgroundLocationUpdates = true` y `UIBackgroundModes: location` en `Info.plist`, más el texto `NSLocationWhenInUseUsageDescription`.
3. Registrar el plugin en el proyecto iOS. `js/location.js` lo usará solo, por la misma rama que Android.
4. Firmar e instalar: con tu Apple ID (aprovisionamiento gratuito de corta duración; condiciones por verificar) o con el Apple Developer Program (99 $/año).
5. Validar en un iPhone con las pruebas de `PRUEBAS_XIAOMI_14T.md`, adaptadas. **Que «Al usar la app» basta con la pantalla bloqueada no está comprobado** (`docs/technical/TECHNICAL_SPIKE_PLAN.md`, §1).
