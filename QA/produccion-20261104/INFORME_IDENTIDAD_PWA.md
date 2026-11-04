# Identidad PWA: implementación (4/11/2026)

Cambios **preparados en local, sin commit ni push**. No cambian ni la mecánica ni las conexiones.

## 1. Archivos creados y modificados

| Archivo | Estado | Contenido |
|---|---|---|
| `mobile/www/index.html` | **Modificado** (+6 líneas en `<head>`) | `<link rel="manifest">`, dos favicons (`.ico` y `.svg`), `apple-touch-icon` y `apple-mobile-web-app-title`, todos con `?v=20261104`. **Nada más del HTML cambia.** |
| `mobile/www/manifest.webmanifest` | Nuevo | `name` «THE OUTRUN», `short_name` «OUTRUN», `start_url` y `scope` `./`, `display: standalone`, `orientation: portrait`, `theme_color` y `background_color` `#0a0b0d`, `lang: es`, 3 iconos (`any` 192 y 512, `maskable` 512) |
| `mobile/www/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon-32.png` | Nuevos | PNG generados |
| `mobile/www/apple-touch-icon.png` | Nuevo | 180×180 |
| `mobile/www/favicon.ico`, `mobile/www/favicon.svg` | Nuevos | `.ico` con un PNG de 32×32 dentro; SVG vectorial |
| `mobile/scripts/iconos-pwa.mjs` | Nuevo | Generador reproducible de iconos y manifiesto, con la versión de los iconos (`ICON_VERSION`) |
| `mobile/test/pwa.test.mjs`, `server/test/pwa.test.mjs` | Nuevos | 4 pruebas (ver §4) |
| `server/arranque-frio.mjs` | Nuevo (ciclo anterior) | Medición del arranque en frío |
| `QA/produccion-20261104/…` | Nuevos | Informes, capturas y registros |

**Sin cambios:**
- `engine/`;
- `server/main.ts`, `server/hub.ts`, `server/ws.ts` (el cambio de MIME del ciclo anterior se deshizo);
- `mobile/www/js/*`, incluidos `net.js` y `app.js`, y `mobile/www/css/*`;
- `render.yaml` y la configuración de MapTiler;
- `mobile/android/` (icono adaptativo nativo).

Según `git status`, el único archivo versionado que cambia es `mobile/www/index.html`.

## 2. Logo utilizado y procedencia

- **Símbolo oficial de THE OUTRUN**: trazados `SYMBOL_PATHS` de `demo/src/ui.js`, la única fuente de la marca. `npm run brand` los copia a `mobile/www/js/brand.generated.js`.
- Es el mismo símbolo de la cabecera de la app (`app.js`, `viewBox 18.6 20.5 112 112`) y del icono Android nativo (`ic_launcher_foreground.xml`).
- Colores: blanco y naranja de marca `#ff6b1f`, sobre el fondo de la app `--bg #0a0b0d`.
- **No hay otras versiones del logo en el proyecto** (ni clara ni oscura). El logotipo de texto «THE OUTRUN» es apaisado y no sirve como icono cuadrado: el símbolo se lee a 16 px.
- No se ha dibujado ni modificado nada de la marca; solo se ha colocado el símbolo sobre un fondo cuadrado.

## 3. Cómo quedará el icono

`capturas-pwa/vista-previa-iconos.png` es una **simulación con CSS** de los recortes, no un móvil real. Incluye:
- Android `maskable` con máscara circular, *squircle* y el círculo seguro del 80 %;
- el `apple-touch-icon` con esquinas redondeadas;
- los iconos 192 y 512;
- el favicon en una pestaña clara y en una oscura.

El símbolo **no queda cortado** en ninguno. En el `maskable` ocupa el 56 %: su semidiagonal (202 px) queda dentro del radio seguro (205 px).

## 4. Validaciones (ordenador)

| # | Comprobación | Resultado | Cómo |
|---|---|---|---|
| 1 | Manifiesto válido | ✔ | Chrome lo lee con **0 errores de análisis** (`Page.getAppManifest`); prueba `mobile/test/pwa.test.mjs` |
| 2 | Dimensiones y formatos | ✔ | PNG 192, 512, 512 (maskable) y 180, e ICO con PNG de 32: medidos en la cabecera del archivo **y** decodificados por Chrome |
| 3 | Rutas HTTP 200 | ✔ | Local: todas, con y sin `?v=`, y sin caché (`server/test/pwa.test.mjs`). **Producción: pendiente de desplegar.** |
| 4 | Favicon visible en el navegador | ✔ | Chrome decodifica `favicon.ico` (32×32) y `favicon.svg`; vista previa de la pestaña |
| 5 | Chrome la reconoce como instalable | ✔ | `Page.getInstallabilityErrors`: **ninguno** (perfil normal, con el servidor sin cambios). En incógnito solo sale `in-incognito`, que es normal. |
| 6 | Sin errores en consola | ✔ | 0 errores o avisos y 0 peticiones fallidas |
| 7 | Rutas existentes intactas | ✔ | Servidor 136/136 y cliente 165/165 |
| 8 | Service worker | — | **No existe ni existía.** No hace falta para instalar, y sin él no hay caché que se quede antigua (ver §5). |
| 9 | Diseño intacto | ✔ | Pantalla de inicio local frente a producción: **0 píxeles distintos** (824×3232, `capturas-pwa/inicio-local.png` e `inicio-produccion.png`) |
| 10 | Icono adaptativo Android nativo sin cambios | ✔ | `git status`: nada cambiado en `mobile/android/` |

Lighthouse no está instalado (habría que descargarlo). Se ha usado el diagnóstico de instalación de Chrome DevTools, que es el criterio real de Chrome.

**Calidad (fase 5), según lo que lee Chrome:**
- nombre «THE OUTRUN» y, bajo el icono, «OUTRUN»;
- orientación vertical, `standalone` (sin barra del navegador);
- barra de estado y `theme-color` `#0a0b0d`, el mismo color que la app;
- pantalla de inicio en Android con fondo `#0a0b0d`, el icono 512 y el nombre;
- en iOS: `apple-touch-icon` y título «OUTRUN».

## 5. Caché y actualización

- **No hay *service worker*.** El servidor envía `cache-control: no-store` en todos los archivos, así que el navegador no guarda copias antiguas.
- **Versionado:** las URL de los iconos y del manifiesto llevan `?v=20261104`. Si algún día cambia la marca, se sube `ICON_VERSION` en `iconos-pwa.mjs`, se regenera, y Chrome, Android e iOS ven URL nuevas.
- No se borra ninguna caché ni ningún dato: la sesión del jugador en `localStorage` no se toca.

## 6. Pendiente en Android e iOS (sin móviles no se ha probado)

- **Instalación real en Android** (Chrome → «Instalar aplicación»): sin probar. Hay que comprobar el icono en el lanzador, el nombre «OUTRUN», la pantalla de inicio y la barra de estado.
- **Instalación real en iPhone** (Safari → «Añadir a pantalla de inicio»): sin probar. iOS usa `apple-touch-icon` y no aplica el `maskable`.
- **Accesos directos ya creados:** conservan el icono antiguo. Hay que **borrarlos y volver a instalar**.
- En Android, la app instalada (WebAPK) actualiza el icono por su cuenta, a veces días después. Reinstalar es lo más rápido.
- **Despliegue:** hasta hacer commit y push a `mapa-real`, producción sigue sin manifiesto.

## 7. Arranque en frío de Render

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

## 8. Mecánicas y conexiones

**No se ha modificado:**
- el motor, las reglas de los tres modos, las capturas, los roles, la zona dinámica ni las condiciones de victoria;
- el servidor, el WebSocket ni la reconexión;
- MapTiler ni el icono adaptativo de Android.

Las pruebas de la mecánica siguen pasando: motor 277/277, servidor 136/136 y cliente 165/165.
