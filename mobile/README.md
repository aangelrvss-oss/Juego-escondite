# THE OUTRUN · app móvil (H1: diagnóstico GPS en Android)

Primer hito de la app real: una app **Android** instalable, con la identidad de THE OUTRUN, un **módulo nativo de ubicación** propio y una pantalla de **diagnóstico GPS**. No hay multijugador, servidor, cuentas ni mapas, y la app **no tiene permiso de Internet**.

> El GPS **no está validado** hasta hacer las pruebas físicas de [`PRUEBAS_XIAOMI_14T.md`](PRUEBAS_XIAOMI_14T.md). Las pruebas automatizadas no sustituyen a un móvil real.

## Arquitectura

```
www/                      Interfaz (HTML/CSS/JS sin empaquetador), compartida con el futuro iOS
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
    Payloads, SessionConfig, PermissionMapper, BridgeErrors   Java puro, probado sin dispositivo
    SessionStore, DeviceStateReader                           Adaptados/copiados de S1
  :s1core  →  ../../android/core   Núcleo de S1 compartido (no copiado): CSV sin coordenadas,
                                    clasificación, registro y análisis de sesiones
```

- **Proveedor:** `LocationManager.FUSED_PROVIDER` de la plataforma (Android 12+, sin Google Play Services). Si el dispositivo no lo tiene, `GPS_PROVIDER`. Calidad `HIGH_ACCURACY`.
- **Intervalo:** parámetro **experimental** (D-038), elegible en pantalla (1, 2, 5, 10 o 30 s; por defecto 5 s, el de S1). Android puede entregar lecturas más espaciadas; el registro mide lo que llega.
- **Permisos:** ubicación precisa y aproximada **solo mientras se usa la app**, servicio en primer plano de tipo ubicación y notificaciones (Android 13+, para el aviso persistente). Sin `INTERNET` ni `ACCESS_BACKGROUND_LOCATION` (se eliminan del manifiesto aunque una biblioteca los declare).
- **Privacidad:** las coordenadas solo viajan del servicio a la pantalla, en memoria; se muestran solo si se activa la casilla. El CSV no tiene columnas de latitud ni longitud, y los detalles con números de 4 o más decimales se eliminan (núcleo de S1). Sin copia de seguridad (`allowBackup=false`).
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

## Instalar en el Xiaomi 14T

1. Copia `app-debug.apk` al móvil (cable USB, o tu nube).
2. Ábrelo desde **Archivos** y permite «instalar apps desconocidas» para esa app cuando lo pida.
3. Si HyperOS muestra un aviso de seguridad, revisa que el origen sea el archivo que copiaste y continúa.
4. La firma es la **de depuración** (no sirve para publicar). Para actualizar, instala el nuevo APK encima.

## Para iOS (más adelante)

La interfaz (`www/`) y el contrato se reutilizan tal cual. Falta un plugin Swift `OutrunLocation` con `CLLocationManager` («mientras se usa», modo de segundo plano `location`, indicador azul) que cumpla `contract/location-bridge.json`. Requiere un Mac con Xcode 26 o posterior.
