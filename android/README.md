# S1: prueba de ubicación en Android

App mínima de prueba (no es el juego). Responde a una pregunta: **¿entrega Android ubicaciones suficientemente fiables con la pantalla bloqueada y durante el uso real?**
Protocolo, pruebas y criterios: [`docs/technical/S1_ANDROID_PROTOCOL.md`](../docs/technical/S1_ANDROID_PROTOCOL.md).

## Estructura

| Módulo | Qué es | Estado |
|---|---|---|
| `core/` | Java 17 puro: formato CSV sin coordenadas, detección de huecos, clasificación de antigüedad y análisis de sesiones | Compila y sus pruebas pasan en el contenedor (`gradle -p android :core:test`) |
| `app/` | App Android en Java, sin bibliotecas de terceros: una pantalla y un servicio en primer plano de tipo ubicación | **Sin compilar como APK**: ver "Bloqueo". Su código Java se ha comprobado contra el framework de Android 14 con `javac` |

## Decisiones de diseño
- **Sin Internet:** el manifiesto no declara `INTERNET`, así que la app no puede enviar datos.
- **Sin coordenadas guardadas:** el CSV no tiene columnas de latitud ni longitud, y los números se redondean a 1 decimal. El punto de referencia opcional solo existe en memoria.
- **Variante V2:** permiso "mientras se usa la app" más un servicio en primer plano, iniciado desde la pantalla visible. No se pide `ACCESS_BACKGROUND_LOCATION`.
- **Exportación:** con el selector de archivos del sistema. Sin permisos de almacenamiento.
- **Sin copia de seguridad:** `allowBackup=false`.
- `minSdk 31` (Android 12) y `targetSdk 34` (Android 14). El dispositivo de prueba previsto es el Xiaomi 14T.

## Bloqueo actual (D-040)
La red de este entorno **deniega `dl.google.com`**. Ni el SDK de Android ni el plugin de Gradle para Android (AGP) se pueden descargar, así que **el APK no se ha compilado**. Hay dos formas de desbloquearlo, ambas sin coste:
1. Añadir `dl.google.com` a los dominios permitidos del entorno. Con eso se puede compilar el APK de depuración aquí y entregártelo como archivo.
2. Compilar en tu ordenador con Android Studio, abriendo la carpeta `android/`.

`app/build.gradle` declara AGP 8.7.3 y compileSdk 34. **Esa configuración no está verificada.**

## Comandos

```
# Pruebas del núcleo (cualquier JDK 17+ y Gradle 8.x)
gradle -p android :core:test

# Analizar un CSV exportado desde el móvil
gradle -p android :core:analyze -Pcsv=/ruta/a/s1-AAAAMMDD-HHMMSS.csv

# Con SDK de Android (sdk.dir en android/local.properties o ANDROID_HOME):
gradle -p android :app:assembleDebug
# El APK queda en android/app/build/outputs/apk/debug/app-debug.apk
```

Instalación en el móvil: copiar el APK, permitir "instalar apps desconocidas" para el gestor de archivos e instalar. La firma de depuración la genera la herramienta: no hace falta ninguna cuenta ni credencial.
