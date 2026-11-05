# Informe QA independiente · ciclo UX 11/2026 (agente 6)

Rama `mapa-real`, base `7d8b5a9` + cambios locales sin commit (sala guiada, guía rápida, Mission Report).
Fecha: 4/11/2026. Sin commits ni pushes. No se ha modificado código de producto.

**Limitaciones.** Todo es emulación en Chrome de escritorio (headless, Playwright, `isMobile`/`hasTouch`,
geolocalización emulada): **no** son dispositivos físicos, ni GPS real, ni navegadores móviles reales (Safari
iOS sin probar). Servidor **local** (`node server/main.ts` en 127.0.0.1:8831), **no** producción. «Tiempo
agotado» se probó con un servidor local con reloj acelerado x8 (`servidor-acelerado.mjs`, usa la opción
`hub.now` de `startServer`); la interfaz de esa prueba muestra contadores de cliente desfasados (esperable).
El mapa de MapTiler responde 403 en 127.0.0.1 (clave limitada por dominio) y la app cae al radar: se
ignora ese 403 en el recuento de errores. Varios Chrome en paralelo dan `ERR_INSUFFICIENT_RESOURCES` en esta
máquina: las pruebas se ejecutaron una a una.

## Resultados de las suites

| Suite | Resultado |
|---|---|
| `npx tsc -p tsconfig.json` | 0 errores (exit 0) |
| `npm test` (motor + sim) | 297/297 pasan (47 s). Con el test QA añadido: 299 tests, 298 pasan, 0 fallan, 1 `todo` (QA-01) |
| `npm run test:server` | 136/136 pasan (22 s) |
| `npm test --prefix mobile` | 207/207 pasan (5 s) |
| `npm run test:sim-panel` | 15/15 pasan (99 s) |
| `npm run test:demo` | 62/62 pasan (0,7 s) |

Ninguna falló, así que no hubo que repetir. Registros en `registros/*.txt`.

## Revisión del diff del motor

`engine/src/engine.ts`: solo cambia `configure` (`isMaterialChange` + no quitar el «listo» al actor) y la
importación de `LatLng`. No hay cambios en `server/`, `net.js`, protocolo, capturas, zona, pistas, cuenta
atrás, roles ni reconexión. `briefing-lock.test.ts` se ajustó a la nueva política. Correcto salvo QA-01.

## Defectos (por gravedad)

### QA-01 · MEDIA · La zona puede desplazarse sin límite sin quitar el «listo» (deriva acumulada)
`isMaterialChange` compara con la configuración **anterior** (`engine/src/engine.ts:64`, llamada en `:713`),
no con la que cada jugador aceptó. N recentrados de < 50 m mueven la zona N×49 m y nadie tiene que volver a
confirmar: los jugadores pueden empezar en una zona/punto de encuentro distinto del que vieron.
Reproducción: `node --test engine/test/qa-preparacion-deriva.test.ts` (nuevo, marcado `todo`): tres
`configure` con la zona a 45, 90 y 135 m → «a» sigue `ready: true` con la zona a 135 m. Un salto único de
135 m sí lo quita (control). En e2e el resultado depende de qué lectura GPS toma `locateOnce` (no concluyente).
Sugerencia: guardar la configuración de referencia cuando se marca «listo» (o la última material) y medir
contra ella.

### QA-02 · BAJA · Tras cancelarse la cuenta atrás, al anfitrión se le pide pulsar un botón que ya no tiene
`countdownAbortText` (`mobile/www/js/game-view.js:603`) dice «Vuelve a pulsar «Estoy listo»…» y se muestra
también al anfitrión (`app.js:448` → aviso de la sala), pero en la sala guiada el anfitrión no tiene «Estoy
listo» (lo confirma en la hoja de «Empezar»). Pasos: 4 jugadores en Infección, empezar, un jugador pulsa
«Abandonar la partida» dos veces durante la cuenta atrás → el anfitrión ve el aviso. Evidencia:
`capturas/sala-412-aviso-cuenta-atras-cancelada.png`, `registros/e2e-infeccion.log` (I1).

### QA-03 · BAJA · La guía describe y muestra la sala antigua
Paso 3 «Preparad la partida» (`mobile/www/js/guide.js:132`): dice que el anfitrión «pulsa «Centrar la zona
aquí»» (ahora es automático) y que «confirma la lista de seguridad» sin decir que es en la hoja de
«Empezar partida»; la imagen `guia/preparacion.webp` es la configuración antigua (selectores siempre
visibles, botón «Volver a centrar la zona aquí» y casilla de seguridad en la configuración, que ya no existe).
Evidencia: `../guia/capturas/guia-360x640-classic-paso03.png` frente a `capturas/sala-anfitrion-412-autocentrado.png`.
(`sala-codigo.webp` también muestra «Código de la sala» sin el nuevo «Invita · …»; menor.)

### QA-04 · BAJA · «Reglas de la partida» (summary) mide 22 px de alto en la sala
Ahora la tarjeta de reglas sale plegada en la sala (`rulesCard(snap, false)`, `app.js:954-957`), así que el
`<summary>` es la única forma de verlas y su objetivo táctil es de 256–348 × 22 px (< 44 px) a 320/360/412.
Único objetivo < 44 px encontrado en las pantallas nuevas. Evidencia: `registros/e2e-sala.log` (D2).

### Observaciones (no bloqueantes)
- O-1 Hoja «Antes de empezar» (`app.js:1018`): `role="dialog" aria-modal="true"` pero no recibe el foco al
  abrirse ni se cierra con Escape (la guía sí). Accesibilidad básica mejorable.
- O-2 En una revancha la casilla «La he revisado con el grupo» sale premarcada (`app.js:1623`, porque
  `safetyChecklistConfirmed` persiste en la sala). No elimina la comprobación, pero el anfitrión puede
  empezar la revancha sin volver a mirarla. Decisión de producto.
- O-3 El historial local («Tu historial en este móvil») va dentro de la tarjeta común `aria-label="Mission
  Report"`; plegado no cambia el texto visible, pero conceptualmente es personal.
- O-4 Tras terminar en la huida, el informe dice «Libres al final 2/2» / «Superviviente»: correcto según
  los datos, algo raro de leer cuando no hubo persecución.
- O-5 (preexistente, no del ciclo) `RATE.claimMinIntervalMs = 3 s` (`server/hub.ts:94`): un cazador que
  captura a dos fugitivos seguidos en < 3 s recibe «Demasiados intentos seguidos». Registro: `registros/sonda-captura.log`.
- O-6 (emulación, intermitente 1/2) En `e2e-sala` A16, tras `context.setOffline` 45 s el anfitrión siguió
  viendo al jugador «Sin conexión» 45 s después de restaurar la red; en la repetición (`sonda-offline`) volvió
  en 0,5 s y siguió listo. `net.js`/`hub.ts` no han cambiado en este ciclo.

## Escenarios e2e

Scripts en esta carpeta (`e2e-sala.mjs`, `e2e-partidas.mjs`, `e2e-infeccion.mjs`, `e2e-tiempo.mjs`,
`e2e-guia.mjs`, sondas `sonda-*.mjs`), utilidades en `lib.mjs`. Resultados detallados en `registros/*.log|json`.

| Escenario | Cómo | Resultado | Evidencia |
|---|---|---|---|
| Crear sala, autocentrado | Anfitrión 412 px crea; zona centrada sin pulsar nada | PASA | A1–A2, `sala-anfitrion-412-autocentrado.png` |
| Unirse por código / por enlace `?sala=` | 360 px por código; 320 px por enlace (código prerrelleno) | PASA | A3–A4b |
| Nombre con HTML `<i>Zo</i>"&'x` | Se muestra escapado en la sala | PASA | A5 |
| QR | Hoja con SVG; abrir/cerrar | PASA | A6, `sala-qr-412.png` |
| Compartir enlace | Interceptado: URL `…/?sala=CÓDIGO` | PASA | A8 |
| No material no invalida | QR, compartir (anfitrión y jugador), recentrar 20 m | PASA | A9 |
| Deriva por recentrados | 3×45 m | **FALLA (QA-01)** en test de motor; e2e no concluyente | `engine/test/qa-preparacion-deriva.test.ts` |
| Empezar con alguien no listo (hoja abierta) | Beto se quita el listo con la hoja abierta | PASA: error en la hoja, sigue en sala | A11 |
| Cambio material (radio) | Quita el listo a los demás, no al anfitrión; aviso «la zona» | PASA | A13–A15, `sala-jugador-360-aviso-cambio.png` |
| Aviso al editar con jugadores listos | «Cambiar» muestra que perderán el listo | PASA (S1; A12 falló por carrera del script) | `sonda-offline.log` |
| Cambio de modo | Aviso «el modo»; Infección con 3 bloquea «mín. 4» | PASA | A20–A21 |
| Corte de red de un jugador | `setOffline` → reconecta solo, sigue listo, otros intactos | PASA (S2); 1 intermitente (O-6) | `sonda-offline.log`, A16 |
| Cerrar y reabrir pestaña | Misma plaza, sigue listo | PASA | A17 |
| Volver de segundo plano | `visibilitychange` simulado | PASA | A18 |
| Recarga del anfitrión en sala | Misma config, sin recentrar, otros listos | PASA | A19 |
| Doble toque en «Empezar ya» | Un solo inicio, 0 errores | PASA | A22 |
| Clásico: terminada por el anfitrión | 3 navegadores (412/360/320) | PASA | P1, `informe-320-terminada-anfitrion.png` |
| Clásico: todos capturados con confirmación | Captura de 2 fugitivos, confirmadas en sus pantallas | PASA | P2, `informe-360-todos-capturados.png` |
| Guía no tapa la reclamación | Fugitivo con la guía abierta recibe reclamación → guía se cierra | PASA | B5, `reclamacion-320-tras-guia.png` |
| Caza del zorro (3) | Atrapan al zorro | PASA | P3, `informe-412-zorro.png` |
| Infección (4) | Empezar; abandono en cuenta atrás (vuelve a sala); el único cazador abandona en la huida | PASA (salvo texto QA-02) | `e2e-infeccion.log`, `informe-412-infeccion-abandono.png` |
| Tiempo agotado | Servidor local acelerado x8, 2 navegadores | PASA (12:00 total, 10:00 persecución, 1/1 libres) | `e2e-tiempo.log`, `informe-360-tiempo-agotado.png` |
| Informe idéntico entre jugadores | Texto de la tarjeta común (sin la marca «Tú») | PASA en P1–P4 y tiempo | logs |
| Reconstrucción tras recargar | Recarga de un jugador en cada partida | PASA | P1–P3, tiempo |
| Compartir resultado | `navigator.share` interceptado: sin coordenadas, sin código ni URL | PASA | P1, P2 |
| Historial local sin duplicados | Recargas tras cada final; 2 y 4 partidas acumuladas correctas | PASA | `stats` en logs |
| Privacidad de equipos | Un jugador no ve el rol asignado a otro en la sala; cuenta atrás sin roles | PASA | E1–E2 |
| Guía: no se abre sola | 1.ª visita y tras recargar | PASA | A0, G0, G16 |
| Guía: 12 pasos, puntos, Anterior, ✕, Entendido, Escape, foco, Tab | 320×568, 360×640, 412×915 | PASA | `e2e-guia.log`, `guia-320x568-paso*.png` |
| Guía: imágenes | `naturalWidth > 0` y `alt` en los 12 pasos | PASA | G3 |
| Guía desde sala y partida | Sala y conexión intactas; foco vuelve al botón | PASA | B1–B4, `guia-360-en-partida.png` |
| Desbordamiento horizontal | Inicio, sala, partida, informe, guía a 320/360/412 | PASA (0 px) | D1, G4, G15 |
| Objetivos < 44 px | Sala, hoja de empezar, guía, informe, partida | 1 hallazgo (QA-04) | D2 |
| Errores de consola/página | Todas las páginas | 0 de la app; solo 403 de MapTiler (entorno) y `navigator.vibrate` bloqueado sin gesto (Chrome) | D3 |

## No probado

- Dispositivos físicos, GPS real, iOS/Safari, Android WebView (Capacitor), instalación PWA.
- Producción (Render) y el túnel: no se tocaron.
- Traspaso de anfitrión a mitad de la preparación: solo revisión de código (el nuevo anfitrión toma la
  configuración del servidor, no se autocentra si ya hay zona; si no la hay, se autocentra una vez).
- Mapa real (MapTiler rechaza la clave en 127.0.0.1); se probó con el radar de reserva.
- Infección hasta «todos infectados» (solo abandono de cazadores); la causa `runners_abandoned` solo por tests.


## Addendum del arquitecto (después de este informe)

**Corregido tras la QA, en el mismo ciclo:**
- **QA-01:** `readyBase` en `engine.ts` y `types.ts`. El test `qa-preparacion-deriva` ya no es `todo` y pasa.
- **QA-02:** `countdownAbortText(reason, {host})`. Lo comprueba la I1 de `e2e-infeccion`.
- **QA-03:** texto del paso 3 e imagen nueva `guia/preparacion.webp`, de la sala guiada real.
- **QA-04:** `.rules summary` con 44 px.
- **Observaciones:** la hoja de empezar recibe el foco y se cierra con Escape, y la lista de seguridad ya no sale premarcada en la revancha.

**Repetición contra un servidor local (puerto 8842).** Registros en `registros/`; los de antes, en `registros-antes-de-correcciones/`.
- `e2e-guia`, `e2e-infeccion` y `sonda-offline` (2/2): superados.
- `e2e-partidas` P1–P3: superados. P4 se corta por tiempo en este script, igual que antes; está cubierto en `e2e-infeccion`.
- `e2e-sala`: A12 (carrera del script) y A16 fallan igual que antes.
  - A16 se aisló con `sonda-socket-viejo.mjs`, que pasa: el jugador vuelve en 1 s y no se le vuelve a ver «sin conexión» en 90 s.
  - Queda como hipótesis para la prueba física (corte de 45 s).
