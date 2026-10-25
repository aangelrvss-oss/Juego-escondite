# Demo visual (sesión 6)

**Qué es:** una demo **interactiva y simulada** de una partida del modo Clásico, pensada para verla en el móvil (Xiaomi 14T).
**Qué no es:** no es la app real, no usa GPS, no se conecta a ningún servidor, no tiene multijugador y no sustituye al motor validado de S0 (`engine/`).

> Nombre **provisional**: "Rastro" (`APP_NAME` en `src/sim.js`). Se cambia en una línea. No se ha hecho búsqueda de marcas.

## Cómo abrirla

El resultado es **un único archivo HTML autocontenido**: `demo/dist/rastro-demo.html` (≈ 110 KB). No carga nada de internet: ni fuentes, ni mapas, ni scripts externos.

### En el ordenador
Doble clic en `demo/dist/rastro-demo.html` (Chrome, Edge o Firefox).

### En el Xiaomi 14T (sin cuentas ni coste)
1. Copia `rastro-demo.html` al móvil: por cable USB, con tu propia nube o descargándolo desde el chat de Claude.
2. Abre la app **Archivos** (Gestor de archivos) → Descargas (o la carpeta donde lo copiaste).
3. Toca el archivo y elige **Chrome** (si se abre un visor interno, usa "Abrir con…" → Chrome).

**Sin verificar en el dispositivo:** no se ha probado en el Xiaomi 14T. Puede que el gestor de archivos de HyperOS lo abra en un visor sin JavaScript; en ese caso usa Chrome. Chrome no suele permitir "Añadir a pantalla de inicio" para archivos locales.

### Instalarla como app (requiere autorización expresa, no hecho)
| Vía | Qué hace falta | Bloqueo actual |
|---|---|---|
| **PWA** ("Instalar aplicación" en Chrome) | Servirla por HTTPS (p. ej., GitHub Pages) con manifiesto y *service worker* | Sería un **despliegue público**: no autorizado |
| **APK** (envoltorio WebView) | Android SDK y Gradle para compilar | `dl.google.com` está denegado en este entorno (D-040). Se podría compilar con Android Studio en tu ordenador |

## Qué probar en el móvil
1. **Inicio** → "Cómo se juega" → volver con el botón atrás de Android.
2. **Unirse con código:** prueba un código erróneo (`AB01`) y luego "Usar un código de ejemplo". Marca "Estoy listo": el anfitrión simulado empieza solo.
3. **Crear sala:** cambia jugadores, reparto (automático o manual), proporción y, en "Duración y zona", la zona dinámica.
4. **Sala de espera:** copia el código, sortea (el número de sorteo es reproducible), cambia equipos a mano, mira los errores de validación y empieza.
5. **Partida:** toca el mapa para caminar; abre el panel (Pistas, Capturas, Equipos, Demo); sube la velocidad a ×30; usa el escáner; "Ir allí" lleva a la última pista.
6. **Capturas:** como cazador, acércate a menos de 15 m de un fugitivo (las pistas y el escáner ayudan). Como fugitivo, responde a una reclamación o dispútala.
7. **Final:** resultado, supervivientes, capturas y disputas; "Nueva ronda" con sorteo nuevo o "Cazan los primeros capturados".
8. Fíjate en: legibilidad al sol, tamaño de los botones con una mano, vibración en los avisos y si algo se corta con la barra de gestos o la cámara frontal.

## Lenguaje visual (sesión 7, provisional)
- **Colores con significado fijo:** lima = acción principal y "tú"; naranja = cazadores; cian = fugitivos; rojo = peligro y disputas; ámbar = simulado, pendiente o experimental. Superficies oscuras escalonadas en vez de bordes.
- **Fase de juego** en el reloj: ámbar (cuenta atrás y ventaja), lima (caza), rojo (resolución de disputas).
- **Mapa:** zona en lima con el exterior oscurecido, próxima zona en blanco discontinuo, tu posición con halo y anillo del color de tu equipo, pistas como círculos discontinuos con su antigüedad. Rótulo fijo "Plano esquemático · no es un mapa real".
- Tokens en `:root` de `src/styles.css`.

## Qué está simulado (y cómo se indica en pantalla)
- **Ubicación:** posiciones ficticias en metros sobre un **mapa esquemático propio** (SVG, sin proveedor de mapas). Indicador permanente "Simulado · sin GPS real".
- **Jugadores:** bots con nombres ficticios. Nadie más entra con el código.
- **Cercanía de captura:** simulada. El modal lo dice: en la app real la comprobaría el servidor.
- **Tiempo:** acelerable (×5, ×10, ×30) y pausable, solo en la demo.
- **Avisos:** vibración con `navigator.vibrate` si el navegador lo permite. Sonido no disponible.
- **Permisos:** la demo **no pide la ubicación** ni ningún otro permiso.

## Reglas que aplica (todas con parámetros EXPERIMENTALES, D-038)
Siguen las decisiones aprobadas D-030 a D-037. Valores en `EXPERIMENTAL` de `src/sim.js`.

| Regla | En la demo | Origen |
|---|---|---|
| Solo modo Clásico; Infección como "ampliación futura" desactivada | Sí | D-030 |
| Proporción de cazadores: `round(n × r)`, entre 1 y n/2 | Pocos 1/5, equilibrada 1/3, muchos 1/2 | D-031 (fórmula hipótesis) |
| Ventaja / pistas / margen fuera de zona | 2 min / cada 3 min / 30 s | Hipótesis |
| Zona dinámica: 2 cambios (al 40 % y 70 % de la caza), radio × 0,7, contenida en la anterior, aviso 1 min | Opcional | D-032 (parámetros pendientes) |
| Nadie se elimina por estar fuera de la zona | Sí | D-032 |
| Cazador fuera de la zona: no se expone, no puede capturar | Sí | D-033 |
| Escáner: 2 usos, recuento a < 100 m, recarga 2 min, sin coordenadas | Sí | D-034 (valores hipótesis) |
| Disputa: queda pendiente, no elimina, se resuelve antes del final | Sí | D-035 |
| Autoridad de la disputa: los implicados (el fugitivo acepta o el cazador retira) | Propuesta | D-035 (procedimiento propuesto) |
| Sin resolver al final: ventana de 2 min y, si sigue abierta, **no hay captura** | Propuesta | D-035 (regla por defecto pendiente) |
| Reclamación sin respuesta en 30 s: no hay captura | Propuesta | Sin decidir |
| Rondas: sorteo nuevo o primeros capturados cazan | Sí | D-037 |

**Diferencias con S0:** S0 no tiene escáner, ni proporción configurable, ni disputas según D-035, ni cazadores bloqueados fuera de zona (D-033). Por eso la demo usa su propia lógica (`src/sim.js`) y **no toca `engine/`**.

## Estructura
| Archivo | Contenido |
|---|---|
| `src/sim.js` | Lógica pura y determinista (semilla mulberry32). Sala, sorteo, partida, capturas, escáner, final y rondas |
| `src/ui.js` | Pantallas, navegación por `#/ruta` (funciona el botón atrás), mapa SVG, avisos |
| `src/styles.css` | Identidad visual provisional propia |
| `index.html` | Plantilla |
| `build.mjs` | Une todo en `dist/rastro-demo.html` (Node, sin dependencias) |
| `test/sim.test.mjs` | Pruebas unitarias de la lógica simulada |
| `e2e/flow.e2e.cjs` | Recorrido completo en Chromium con Playwright (del entorno, no es dependencia) |

## Comandos
```bash
npm run build:demo    # genera demo/dist/rastro-demo.html
npm run test:demo     # pruebas unitarias de la lógica simulada
node demo/e2e/flow.e2e.cjs [carpeta-capturas]   # requiere Playwright y Chromium instalados
```
Parámetros de URL solo para pruebas: `?e2e` expone el estado en `window.__rastro`; `?seed=N` fija la semilla de la sala.
