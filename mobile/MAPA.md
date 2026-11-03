# Mapa real de la partida (MapLibre + proveedor de cartografía)

> **Estado (27/10/2026, rama `mapa-real`, sin commit):**
> - **Ciclo de vida del mapa comprobado en Chrome real** (`e2e/map.e2e.mjs`: 26/26 desde la validación de la noche del 27/10), con una cartografía **simulada** (fondo liso, sin calles), porque no hay clave del proveedor.
> - **Las calles y los edificios de MapTiler NO se han visto todavía:** hace falta tu clave. Tampoco se ha probado en un móvil.

## Qué hace

Durante la huida y la persecución, el radar SVG se sustituye por un mapa con zoom y desplazamiento táctil. Muestra:
- la zona (círculo naranja) y el punto de encuentro;
- tu posición con su círculo de precisión;
- **solo** los jugadores que el servidor te deja ver (compañeros, fugitivos expuestos, o todos con 60 s de retraso si te han capturado);
- la última pista para los cazadores;
- las posiciones antiguas, en gris punteado.

Botones: «Mi posición» (solo con una lectura válida) y «Ver zona».

- **Sin clave, sin red, sin WebGL o con la clave rechazada**, la partida sigue con el **radar de siempre** y un mensaje que explica por qué. El botón «Reintentar el mapa» lo vuelve a intentar.
- **Sin conexión con el servidor**, el mapa lo indica y deja las posiciones de los demás en gris («congeladas»).
- Las reglas, la visibilidad, el protocolo y el servidor **no cambian**: el mapa dibuja lo mismo que el radar.

**Cómo está hecho** (`www/js/map-view.js`):
- el mapa se crea **una sola vez** por partida, en `#map-host`, un contenedor que el redibujado de la interfaz (4 veces por segundo, con `innerHTML`) nunca toca;
- con cada redibujado solo se actualizan las capas y se mueven los marcadores existentes. **Nunca se mueve la cámara** por su cuenta, así que el zoom y el desplazamiento se conservan;
- al terminar la partida se destruye (`map.remove()`, marcadores y listeners).

## Configurarlo (una vez)

1. **Biblioteca** (en `mobile/`):
   ```powershell
   npm install        # instala maplibre-gl 6.14.0 (y Capacitor)
   npm run vendor     # copia MapLibre a www/vendor/maplibre-gl (fuera de Git)
   ```
2. **Clave de MapTiler:**
   1. Crea una cuenta en <https://www.maptiler.com/> y una clave en *API keys*.
   2. Es una clave **pública**: viaja al móvil y cualquiera con la dirección del juego puede verla. Limítala en MapTiler a los orígenes permitidos («Allowed HTTP origins»).
   3. Con el túnel rápido la dirección cambia cada vez (`*.trycloudflare.com`). Si el proveedor no admite comodines, usa una clave solo para las pruebas y **revócala después**.
3. **Archivo de configuración:** copia el ejemplo y pon tu clave.
   ```powershell
   Copy-Item mobile\mapa.config.ejemplo.json mobile\www\mapa.config.json
   notepad mobile\www\mapa.config.json
   ```
   ```json
   { "proveedor": "maptiler", "clave": "<tu clave>", "estilo": "dataviz-v4-dark" }
   ```
   - `www/mapa.config.json` está en `.gitignore`: **nunca se sube al repositorio**. La clave de ejemplo (`TU_CLAVE_PUBLICA`) se rechaza a propósito.
   - Otro proveedor compatible con MapLibre: `{ "estiloUrl": "https://…/style.json" }` (solo `https://`).
4. **Estilo:**
   - `dataviz-v4-dark` es el estilo oscuro que muestra la documentación de MapTiler (comprobado el 27/10/2026). Es sobrio, para que destaquen las capas naranjas del juego.
   - **No he podido comprobar si incluye edificios.** Si no los muestra, prueba otro estilo oscuro de MapTiler cambiando `"estilo"` (el nombre exacto, en su web).
5. **Comprobar:** arranca el servidor, abre una partida y mira el mapa en la huida.
   - «Mapa sin configurar…» → falta el archivo o la clave.
   - «…ha rechazado la clave…» → clave mal copiada, o el origen no está permitido.

**App Android:** `npm run sync` copia `www/` (con `mapa.config.json` y `vendor/`) a la app. No se ha probado.

## Licencias y condiciones

- **MapLibre GL JS 6.14.0:** licencia BSD-3-Clause, que exige conservar el aviso de copyright. `npm run vendor` copia su `LICENSE.txt` junto a la biblioteca; si se distribuye la app, hay que incluir ese aviso.
  - Se eligió la 6.x porque `npm audit` marca la serie 5 entera con un aviso **crítico**: GHSA-jrc7-96c5-q579, un XSS en el sanitizador HTML, corregido en la 6.5.0.
  - El juego no usa ventanas emergentes con HTML: los nombres se escriben siempre como texto.
- **MapTiler:** sus condiciones (límites del plan gratuito, uso comercial, atribución y logotipo) **revísalas tú en su web** antes de un uso público; no las he verificado.
  - La atribución «© MapTiler © OpenStreetMap contributors» la añade el propio estilo en el control de atribución del mapa (abajo a la derecha). No se ha podido ver sin clave.
- **OpenStreetMap:** los datos son ODbL y exigen atribución, que va incluida en la de MapTiler.
  - **No se usan los servidores públicos de teselas de OSM:** su política no permite usarlos como servicio gratuito para una aplicación.

## Privacidad

- El mapa **no envía posiciones ni nada del juego** al proveedor: solo pide las teselas de la zona que se está viendo.
- El proveedor sí ve la **IP del móvil** y **qué zona** se consulta, es decir, más o menos dónde se juega.
- Una prueba automática obliga a que `map-view.js` solo conozca la dirección de MapTiler y lea solo su configuración local; el resto de la interfaz solo habla con el servidor propio (`test/brand-and-privacy.test.mjs`).

## Pruebas

| Prueba | Qué cubre | Tipo |
|---|---|---|
| `test/map-view.test.mjs` (14) | Geometría de la zona y la precisión, configuración y claves de ejemplo, **solo lo autorizado** (un fugitivo nunca ve a los cazadores ni las pistas), un solo mapa con 50 actualizaciones, marcadores reutilizados, cámara intacta, sin GPS sin errores, desactualizado y sin conexión, nombres como texto, fallos (clave, estilo, tiempo de espera, WebGL), limpieza | Automática, Node, con MapLibre y DOM simulados |
| `test/brand-and-privacy.test.mjs` | La única red nueva es la del mapa, y cerrada | Automática |
| `e2e/map.e2e.mjs` (22) | Partida real (servidor y clientes del juego) con Chrome a 360×740: radar de reserva sin configuración, mapa con WebGL tras reintentar, compañero sí y cazadora no, zoom con la rueda **conservado** tras 4 envíos de posiciones y muchos redibujados, **el mismo mapa y el mismo marcador** (no se recrean), marcador que se mueve, nada desborda, botones de 44 px o más, sin conexión y reconexión, captura desde el navegador, mapa destruido al terminar, **ninguna petición a Internet** y sin errores de JavaScript | Navegador real, cartografía **simulada** |
| **Pendiente** | Calles y edificios reales con tu clave; gestos táctiles reales (pellizcar, arrastrar); rendimiento en un móvil modesto; app Android | **Necesita un móvil y la clave** |

Ejecutar: `npm test` y `node e2e/map.e2e.mjs [carpeta-de-capturas]`. Usa el Chrome o el Edge instalado; no hace falta Playwright.

## Limitaciones conocidas

- **Sin cartografía real comprobada:** ver el estado de arriba.
- **Etiquetas que se solapan** si varios jugadores están muy juntos (no hay agrupación). Tu marcador tapa el punto de encuentro si estás encima.
- **Sin cobertura, el mapa no carga** al empezar (se queda el radar); si se pierde después, faltan zonas por cargar y aparece un aviso pasajero. No hay mapas sin conexión.
- **Batería y datos:** el mapa consume más que el radar (WebGL y descarga de teselas). Sin medir.
- **El norte siempre arriba** (rotación desactivada, a propósito); sin brújula ni rumbo.
- **La sala de espera** sigue eligiendo la zona con «Centrar la zona aquí», sin mapa.

## Validación (27/10/2026, noche)

Evidencias completas: `C:\Users\aange\Downloads\outrun-evidencias-mapa-20261027\`, con el informe de validación, la auditoría visual, los vídeos, las capturas y los registros.

- **Atribución siempre visible** (desde el 28/10, **arriba a la derecha** del mapa: abajo la taparía la acción fija de la partida). MapTiler exige mostrar «© MapTiler © OpenStreetMap contributors» de forma siempre visible ([maptiler.com/copyright](https://www.maptiler.com/copyright/)). El control ya no se pliega (`compact: false`), va a 12 px y los botones del mapa quedan por encima. Lo comprueba `map.e2e`.
- **Sin clave, sin 404.** `npm run vendor` crea `www/mapa.config.json` **sin clave** (`{"proveedor": "ninguno"}`) si no existe y nunca lo sobrescribe. Así la página no pide un archivo inexistente. Para usar el mapa, sustitúyelo por el ejemplo con tu clave.
- **`map.e2e.mjs`** suma la clave rechazada (403), el arrastre con un dedo, el pellizco con dos dedos (eventos táctiles reales del navegador), la atribución visible y, si falla, el diagnóstico del servidor y del navegador.
- **`e2e/layout.e2e.mjs`** (Playwright, emulación móvil): sin desbordamiento horizontal a 360 px. Detectó un desbordamiento de la sala de espera **que ya existía antes del mapa**, ya corregido.
- **`e2e/gameplay-capture.mjs`** graba una partida simulada (vídeo de auditoría y resumen) con un mapa de **calles sintéticas** rotulado como simulación.
- **Problema abierto:** en 2 de 18 ejecuciones de `map.e2e`, el GPS del navegador no se renovó tras un corte y una reconexión simulados. Causa no confirmada; es lo primero que hay que mirar con móviles.
- **Playwright 1.64.0** es ahora dependencia **de desarrollo** de `mobile/`: no va a la app.
