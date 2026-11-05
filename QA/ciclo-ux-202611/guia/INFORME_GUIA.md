# Guía visual y onboarding: informe (agente 3, ciclo UX 2026-11)

Fecha: 04/11/2026 · Rama `mapa-real` · Sin commit ni push. No se ha modificado ningún archivo existente.

## Archivos creados

| Archivo | Qué es |
|---|---|
| `mobile/www/js/guide.js` | Módulo puro (sin DOM): `GUIDE_VERSION`, `guideSteps(mode)`, `guideOverlay(state)`, `guideStepFor(topic)`, además de `GUIDE_RULES` y `GUIDE_IMAGES`. Importa `RULES` y `MODES` de `game-view.js` |
| `mobile/www/css/guide.css` | Estilos con prefijo `.guide-`, tokens de `tokens.generated.css`; reutiliza `.btn`, `.btn-primary` y `.btn-outline` |
| `mobile/www/guia/*.webp` | 16 recortes de capturas reales (720 px de ancho), **391 792 bytes = 382,6 KB** en total (presupuesto: 450 KB) |
| `mobile/test/guide.test.mjs` | 14 pruebas (`node:test`) |
| `QA/ciclo-ux-202611/guia/hacer-imagenes.mjs` | Recorta y convierte las imágenes a WebP con Chrome (canvas, calidad 0,78). Se puede volver a ejecutar |
| `QA/ciclo-ux-202611/guia/imagenes.json` | Salida del script anterior: origen, recorte y peso de cada imagen |
| `QA/ciclo-ux-202611/guia/preview.html` | Vista previa con la integración de referencia (manejadores, Escape, foco). No está en `mobile/www` |
| `QA/ciclo-ux-202611/guia/servidor.mjs` | Servidor estático mínimo (127.0.0.1:8822) para la vista previa |
| `QA/ciclo-ux-202611/guia/verificar.mjs` · `verificacion.json` | Verificación en Chrome sin interfaz y su resultado |
| `QA/ciclo-ux-202611/guia/capturas/*.png` | 8 capturas de la guía (320×568, 360×740, 412×915, 360×640) |

## Pasos e imágenes

Los 12 pasos son iguales en todos los modos, en el mismo orden (los índices de `guideStepFor` valen para todos). El texto y, en algunos pasos, la imagen cambian según el modo.

| # | id | Título | Imagen (webp · tamaño · peso) | Captura de origen (recorte en px del original) |
|---|---|---|---|---|
| 1 | intro | Qué es THE OUTRUN | `inicio` · 720×839 · 35,5 KB | `QA/produccion-20261104/capturas-pwa/inicio-produccion.png` (824×3232, y 0–960) |
| 2 | room | Crea una sala o únete | `sala-codigo` · 720×760 · 18,1 KB | `QA/ciclo-20261101-zona-dinamica/capturas/e2e-infeccion/01-sala-3-Ana.png` (y 120–880) |
| 3 | setup | Preparad la partida | `preparacion` · 720×815 · 31,5 KB | misma captura (y 2085–2900) |
| 4 | roles | Los roles, en secreto | `cuenta-atras` · 720×629 · 19,6 KB | `…/e2e-game/03-cuenta-Dani.png` (824 px de ancho, y 225–945; sin el aviso «Eva ha entrado») |
| 5 | hunter | Si eres cazador | `rol-cazador` · 720×463 · 14,5 KB · Caza del zorro: `zorro-cazador` · 720×680 · 20,6 KB | `…/e2e-game/04-rol-Ana.png` (y 650–1180) · `…/e2e-zorro/02-rol-Beto.png` (y 400–1080) |
| 6 | runner | Si eres fugitivo / Si eres el zorro | `rol-fugitivo` · 720×463 · 13,3 KB · zorro: `zorro-fugitivo` · 720×980 · 28,6 KB | `…/e2e-game/04-rol-Caro.png` (y 650–1180) · `…/e2e-zorro/03-zorro-ve-Zoe.png` (y 480–1460) |
| 7 | clues | Pistas y mapa | `pista` · 720×1060 · 31,5 KB · zorro: `zorro-pista` · 720×1070 · 32,0 KB | `…/e2e-playtest-ui/05-pista-Ana.png` (y 140–1200) · `…/e2e-zorro/04-pista-Ana.png` (y 140–1210) |
| 8 | capture | Captura: toque suave | `captura` · 720×419 · 14,0 KB · Infección: `infeccion-convertido` · 720×580 · 23,2 KB | `…/e2e-game/05-reclamacion-Caro.png` (y 1320–1800) · `…/e2e-infeccion/02-infectado-Beto.png` (y 440–1020) |
| 9 | zone | La zona se cierra | `zona` · 720×860 · 19,7 KB | `…/zona/z2-fase1-mitad.png` (y 440–1300) |
| 10 | end | Final y Mission Report | `final` · 720×980 · 31,2 KB | `…/e2e-playtest-ui/07-final-cazadores-Ana.png` (y 160–1140) |
| 11 | connection | Si se pierde la conexión | `conexion` · 720×880 · 30,6 KB | `…/e2e-map/4-sin-conexion.png` (y 130–1010) |
| 12 | location | Si falla la ubicación | `ubicacion` · 720×390 · 18,8 KB | `…/e2e-map/4-sin-conexion.png` (y 1400–1790): tarjeta «GPS ±6 m · Compartiendo tu ubicación…» |

(`…` = `QA/ciclo-20261101-zona-dinamica/capturas`. Pesos exactos en `imagenes.json`.)

Todos los pasos tienen imagen; ninguna es genérica ni inventada. **Limitación del paso 12:** no hay ninguna captura del aviso «Falta el permiso de ubicación» ni del error de GPS al pulsar «Estoy listo». Se usa un recorte real relacionado (estado del GPS y aviso de mantener la pantalla encendida), y el texto explica qué hacer cuando falla. Si más adelante alguien captura esos avisos, basta con añadir el recorte a `CROPS` y cambiar el archivo en `guide.js`.

### Qué es simulación y qué no

- **Ninguna imagen es de una partida física real.** Las 15 imágenes de partida salen de las pruebas E2E automatizadas del 01/11/2026 (`ciclo-20261101-zona-dinamica`): Chrome emula un móvil contra el servidor real en memoria, con jugadores ficticios (Ana, Beto, Caro, Dani, Eva, Zoe), coordenadas inventadas y un mapa de prueba. Ese mapa es el radar de reserva («Mapa sin configurar») o un estilo sin calles con «© Atribución de prueba». Los alt lo dicen cuando se ve el mapa («mapa de prueba»).
- `inicio.webp` es la pantalla de inicio servida en producción (`capturas-pwa`, 04/11/2026). No hay datos de nadie.
- **No se ha usado `gameplay-auditoria.webm`:** no está en el repositorio (Glob y `find` sin resultados). Sus fotogramas ya extraídos (`QA/capturas/partida-grabada`, con el rótulo «SIMULACIÓN · mapa de prueba con calles sintéticas») son de la interfaz del 28/10. Se descartaron porque la del 01/11 es más reciente y coincide con el código actual (zona dinámica, pista en la barra, etc.).
- Las capturas de `partida-fisica-20261031` y de `grabaciones/*mapa-real*` se descartaron a propósito, porque pueden mostrar cartografía o lugares reales.
- **Privacidad (revisada en cada recorte):** solo aparecen nombres ficticios de prueba, el código de una sala de prueba ya caducada (`C65BRA`), ninguna coordenada, ninguna URL y ninguna clave de MapTiler (no hay `key=` en ninguna imagen).

## Fuente de cada regla citada

Ninguna cifra está escrita a mano en los textos: se calculan con `RULES` y `MODES` (`mobile/www/js/game-view.js`, que `briefing.test.mjs` ya compara con el motor) o con `GUIDE_RULES` (comparadas con el motor en `guide.test.mjs`).

| Regla en la guía | Valor | Fuente |
|---|---|---|
| Jugadores por modo | 2–20 / 4–20 / 3–20 | `MODES[*].minPlayers` (game-view.js = `engine/src/modes.ts`) · `LIMITS.maxPlayers` (constants.ts) |
| Mayores de 18 | — | `homeScreen()` y `briefing()` Seguridad (app.js / game-view.js) |
| Código de 6 letras o números; enlace y QR | 6 | `CODE_LENGTH` (game-view.js); textos de `homeScreen()` y `lobbyScreen()` (app.js) |
| «Centrar la zona aquí», zona = punto de encuentro = zona de salida | — | `hostConfig()` (app.js) |
| «Estoy listo» comprueba el GPS | — | `lobbyScreen()` y `gpsCheckError()` |
| Lista de seguridad y «Empezar partida» | — | `hostConfig()` y `startBlockers()` |
| Cuenta atrás | 5 s | `RULES.countdownMs` = `TIMING.countdownMs` |
| Roles secretos (el anfitrión los conoce si los asigna); en el zorro, públicos | — | `briefing()` Roles y `lobbyRolesHint()` |
| Infección: 1 cazador por cada 4 jugadores (al menos 1) | — | `INFECTION.hunters` (modes.ts) y `briefing()` |
| Cazador espera en la zona de salida durante la huida | — | `gameScreen()` callout y `revealText()` (app.js) |
| Fugitivos visibles para los cazadores solo en pistas o fuera de la zona | — | `mapLegend()` (app.js) y `briefing()` Zona |
| El zorro ve a los cazadores en directo; ellos reciben su posición exacta en cada pista | — | `FOX_HUNT.runnersSeeHunters` y `MODES.fox_hunt.line` |
| Pistas: última posición conocida con su antigüedad; «es dónde estaba, no dónde está» | — | `briefing()` Pistas y `pingList()` |
| Captura: ±30 m o mejor; confirmación en 30 s; sin respuesta no cuenta | 30 m / 30 s | `RULES.tagMaxAccuracyM` = `TAG.maxAccuracyM`; `RULES.tagConfirmMs` = `TIMING.tagConfirmMs` |
| Capturado: espectador con retraso | 60 s | `RULES.spectatorDelayMs` = `TIMING.spectatorDelayMs` |
| Infección: el convertido captura pasados | 60 s | `RULES.convertTagDelayMs` = `MODES.infection.convertTagDelayMs` |
| Zorro atrapado: la partida termina | — | `briefing()` «Captura del zorro» |
| Zona: cada 5 min, −15 % del radio, mínimo 50 m; «ve hacia el centro sin correr» | 5 min / 15 % / 50 m | `RULES.zonePhaseMs/zoneShrink/zoneMinRadiusM` = `DYNAMIC_ZONE`; aviso `zone_phase` (app.js). La app siempre configura `dynamicZone: true` (`configure()` en app.js) |
| Fuera de la zona: visible a los 30 s; cazador fuera no captura | 30 s | `RULES.outOfZoneGraceMs` = `TIMING.outOfZoneGraceMs`; error `hunter_outside_zone` |
| Mission Report: solo datos oficiales; ubicaciones borradas; revancha del anfitrión | — | `finishedScreen()` (app.js) |
| Conexión: la partida sigue, el servidor manda | — | `connectionNotice()` (game-view.js) |
| Sin señal → «sin conexión» / fuera de la partida | 30 s / 5 min | `PRESENCE.awayAfterMs` / `PRESENCE.absenceTimeoutMs` (constants.ts, D-057) vía `GUIDE_RULES` |
| Ubicación: permiso, «Reintentar», aire libre, pantalla encendida en el navegador | — | `locationDeniedNotice()`, `gpsCheckError('timeout')` y `screenNotice()` (game-view.js) |

## Pruebas y resultados reales

- `node --test test/guide.test.mjs`: **14/14 correctas**. Cubren:
  - versión de la guía y cifras de `GUIDE_RULES` iguales a las del motor;
  - los cuatro modos (classic, infection, fox_hunt y general) dan 12 pasos con `id`, `title`, `text`, `img` y `alt` no vacíos;
  - cada `img` existe en disco y su tamaño WebP real coincide con `width` y `height`;
  - ningún texto pasa de 3 frases;
  - el texto cambia según el modo;
  - `guideStepFor` da índices válidos en todos los modos;
  - el overlay tiene `role=dialog`, `aria-modal`, el indicador «Paso 3 de 12», el cierre con `aria-label`, 12 puntos y `aria-current`;
  - «Anterior» está deshabilitado en el paso 0 y la primera imagen se carga sin `lazy`;
  - el último paso muestra «Entendido» con `data-act="guide-close"`;
  - el paso se ajusta si viene fuera de rango y la nota «La partida sigue» sale solo en `context: 'game'`;
  - todo el texto se escapa (también un modo o contexto malicioso);
  - `guia/` pesa ≤ 450 KB.
- `npm test --prefix mobile`: **207/207 correctas** en la última ejecución. En una ejecución anterior falló 1 prueba ajena, `gps-check.test.mjs` («cualquier otro fallo da un mensaje útil»), por cambios de otro agente en `game-view.js`. En la última ya pasaba. No se ha tocado.
- `verificar.mjs` (Chrome sin interfaz, `isMobile`, DPR 2): 4 tamaños (320×568, 360×740, 412×915, 360×640) × 4 modos × 12 pasos = **192 comprobaciones de paso, 0 errores de consola, 0 problemas**. En cada paso se comprueba que:
  - la imagen ha cargado;
  - el indicador es correcto;
  - no hay desbordamiento horizontal;
  - cerrar, Anterior y Siguiente están dentro de la pantalla;
  - todos los botones visibles miden ≥ 44 px;
  - el overlay tiene `role=dialog`.

  Además comprueba que «Entendido» cierra y devuelve el foco al botón de apertura, que Escape cierra, que los puntos llevan al paso pedido y que `topic=connection` abre en el paso 11. Con `prefers-reduced-motion` no hay animación ni transiciones.
- Contraste medido (AA ≥ 4,5:1):

  | Elemento | Contraste |
  |---|---|
  | Etiqueta «Guía · modo» | 7,52 |
  | «Paso N de 12» | 6,30 |
  | Título y texto | 16,16 |
  | Botón cerrar | 14,54 |
  | Anterior | 16,16 |
  | Siguiente/Entendido | 6,81 |
- Incidencias de la propia verificación, ya corregidas:
  - medidas de 43,99 px por redondeo: se dejó un margen de 43,5 y el cierre pasó a 48 px;
  - `ERR_INSUFFICIENT_RESOURCES` en Chrome con `cache-control: no-store` y cientos de recargas seguidas: el servidor de pruebas ahora usa `max-age=60`;
  - una animación de entrada que se repetía en cada repintado: eliminada;
  - un 404 de `favicon`: añadido el icono a la vista previa.
- El servidor de la vista previa (puerto 8822) se arrancó y se detuvo dentro de esta tarea. No se ha tocado el proceso del puerto 8787 ni el túnel.

## Cómo integrarlo (para el arquitecto)

1. **`index.html`:** añadir `<link rel="stylesheet" href="css/guide.css">` después de `game.css`. Si hay service worker o lista de precarga, incluir `js/guide.js`, `css/guide.css` y, de forma opcional, `guia/*.webp`.
2. **`app.js`:** importar y añadir el estado.
   ```js
   import { GUIDE_VERSION, guideOverlay, guideStepFor, guideSteps } from './guide.js';
   // en ui:
   guide: null, // { step, mode, context } mientras la guía está abierta
   ```
3. **Pintado:** en `overlays()`, al final (encima de todo salvo la reclamación de captura, que debe seguir siendo lo último):
   ```js
   if (ui.guide) out += guideOverlay(ui.guide);
   ```
   El overlay usa `z-index: 30` (más que `.overlay`, que usa 10). Si la reclamación de captura llega con la guía abierta durante la partida, cerrar la guía (`ui.guide = null`) para que la reclamación no quede tapada (tiene 30 s para responder).
4. **Botones de apertura** (con `data-act="guide-open"` y `aria-haspopup="dialog"`):
   - **Inicio:** junto a «Cómo se juega», «Guía visual» con `mode: ui.draft.mode` (o `null` si hay invitación) y `context: 'home'`.
   - **Sala:** en la tarjeta «Reglas de la partida», con `mode: snap.config?.mode ?? null` y `context: 'lobby'`.
   - **Partida:** un botón «?» discreto (p. ej. en `.map-meta` o junto a «Abandonar»), con `context: 'game'`. Ayuda contextual con `guideStepFor(topic)`:
     - `'connection'` desde `connectionNotice` y `awayLine`;
     - `'location'` desde `locationDeniedNotice` y `gpsCheckError`;
     - `'zone'` desde `zoneLine` y el aviso de fuera de zona;
     - `'capture'` desde la tarjeta de acciones;
     - `'roles'` desde la cuenta atrás.
   - **Primera vez:** si `store.getItem('outrun.guide') !== String(GUIDE_VERSION)`, abrir la guía una vez en el inicio y guardar la versión al cerrarla. Si se cambia el contenido de forma importante, subir `GUIDE_VERSION`.
5. **Manejadores** (en el `switch` de `data-act` del clic):
   ```js
   case 'guide-open': ui.guideOpener = el; ui.guide = { step: Number(el.dataset.step ?? 0), mode: el.dataset.mode || null, context: el.dataset.context || 'home' }; break;
   case 'guide-prev': ui.guide.step = Math.max(0, ui.guide.step - 1); break;
   case 'guide-next': ui.guide.step = Math.min(guideSteps(ui.guide.mode).length - 1, ui.guide.step + 1); break;
   case 'guide-goto': ui.guide.step = Number(el.dataset.step); break;
   case 'guide-close': ui.guide = null; store.setItem('outrun.guide', String(GUIDE_VERSION)); /* y devolver el foco: */ queueMicrotask(() => ui.guideOpener?.isConnected ? ui.guideOpener.focus() : document.querySelector('[data-act="guide-open"]')?.focus()); break;
   ```
   (Si `render()` reconstruye el botón de apertura, `ui.guideOpener` deja de estar en el DOM: buscar de nuevo el `[data-act="guide-open"]` tras pintar, como en el código de arriba.)
6. **Teclado:** `keydown` en el documento.
   - `Escape` con `ui.guide`: cerrar igual que `guide-close`.
   - `Tab` y `Shift+Tab`: mantener el foco dentro de `.guide-overlay` (lista de `button:not([disabled])` visibles; de la última vuelta a la primera).
   - Opcional: `ArrowLeft` y `ArrowRight` para pasar de paso.

   `preview.html` contiene esta misma lógica, probada.
7. **Foco al abrir y al cambiar de paso:** tras pintar, `document.getElementById('guide-title')?.focus({ preventScroll: true })`. El título tiene `tabindex="-1"` y no muestra contorno, así que el lector anuncia el paso nuevo.
8. **Mientras la guía está abierta:** si el repintado de la partida es periódico (cada segundo), conservar `ui.guide` y volver a poner el foco solo cuando cambie el paso, no en cada repintado, para no robarle el foco al jugador. Lo más sencillo es guardar el último `step` enfocado.

## Limitaciones

- Paso 12 sin captura específica del error de ubicación (ver arriba).
- Las capturas son de pruebas automatizadas con mapa de prueba o radar, no del mapa real de MapTiler. Lo que se ve es la interfaz real, pero no la cartografía.
- Los 12 puntos de progreso van en dos filas de seis: 12 objetivos de 44 px no caben en una fila de 320 px. En pantallas de ≤ 520 px de alto se ocultan; quedan el indicador «Paso X de N» y los botones Anterior/Siguiente.
- Si el contenido de la interfaz cambia de forma visible (p. ej. otro diseño de la sala), habrá que regenerar los recortes con `hacer-imagenes.mjs` a partir de capturas nuevas y actualizar `GUIDE_IMAGES`. La prueba de tamaño WebP detecta si no coinciden.
