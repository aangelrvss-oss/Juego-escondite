# Estado del proyecto

**Última actualización:** 26/10/2026, noche (dos sesiones autónomas: 19:41-20:20 y 22:43-23:30; robustez, GPS, privacidad, reconexión, caídas del servidor y juego en el navegador; **todo en commits locales, sin push**)
**Rama:** `recuperacion-h2` (local, sobre `4c190a0`; `origin` sigue en `ccr-f1962362-hvwb9i` = `4c190a0`)
**Referencia de producto:** Plan Maestro v1.0 (PDF fuera del repositorio). Trazabilidad en `docs/product/PLAN_MAESTRO_TRAZABILIDAD.md`; sus contradicciones con este registro están en `DECISION_LOG.md` (D-043 a D-047), **sin resolver**.
**Criterio transversal:** guía de criterio y desarrollo v1.0 (`docs/product/THE_OUTRUN_Guia_de_criterio_y_desarrollo.docx`, incorporada el 26/10/2026 por la noche). Fija las prioridades del backlog (P0 a P3) y qué evidencia hace falta para dar algo por terminado. Sus discrepancias con el Plan (radio, siguiente modo y pausa) están en `DECISION_LOG.md` (D-043, D-045, D-053 y D-054), **sin resolver**.
**Evidencia real hasta hoy:** ninguna partida con dispositivos ni con jugadores reales. Solo una sesión corta de GPS de H1 en un Xiaomi 14T, con su CSV todavía sin analizar.
**Nombre del producto:** provisional. La demo y H1 usan la identidad visual THE OUTRUN; no hay ninguna decisión de nombre registrada en `DECISION_LOG.md`.

## Fase activa

**H2 (multijugador real): servidor y cliente implementados y probados en un ordenador (5 clientes reales por WebSocket y 5 navegadores). Falta la primera partida con móviles reales.** Los cambios de F1 y H2 están **sin commit**.
- **Prueba con dos móviles Android: preparada y no realizada.** Procedimiento en `mobile/PRUEBA_PARTIDA_ANDROID.md`, con la APK `0.3.0-h2-bloqueo`. En partida, el servicio nativo envía la ubicación al servidor por HTTPS, para que llegue con la pantalla bloqueada.
- Cómo jugar y arrancar el servidor: `server/README.md`. Resultados y límites: `QUALITY_STATE.md` (secciones F1, H2 y «H2: prueba real en Android»).
- H1 (diagnóstico GPS): corrección publicada y prueba física preliminar superada. Sigue disponible en la app (`diagnostic.html`).

**Antecedente, S1 (ubicación en Android con la app Java de `android/`):** su APK compila (sesión 9), pero no se ha probado en el dispositivo. H1 reutiliza su núcleo (`android/core`).
- ~~Bloqueo: la red del entorno deniega `dl.google.com` (D-040).~~ **Resuelto en la sesión 9:** el propietario habilitó el dominio y el APK debug compila. **Las pruebas en el dispositivo físico siguen pendientes.**
- S0 completada **en simulación** (103 pruebas en `f0ca70e`; 112 tras D-042). El diseño de la sesión 4 está guardado (`c846377`).
- La primera versión jugable **solo** tendrá el modo Clásico (D-030). La app del juego existe solo como diagnóstico GPS local (H1): **sin multijugador, servidor ni salas**.

**Sesión 6:** hay una **demo visual SIMULADA** (`demo/`), un HTML autocontenido para enseñar cómo se vería una partida en el móvil. No usa GPS ni red y no es la app del juego. **No se ha probado en el Xiaomi 14T.**

No hay cuentas creadas, ni servicios contratados, ni despliegues, ni conexiones externas. Gasto acumulado: **0 €**.

## Estado del repositorio al empezar la sesión 3

- Rama `ccr-f1962362-hvwb9i` en el commit `3969906`, al día con `origin` (0/0) y árbol limpio.

## Sesión 3: trabajo realizado (S0)

- **Motor de reglas** (`engine/src/`): máquina de estados, reloj inyectado, temporizadores del servidor, visibilidad por equipo, pistas, salida de zona, capturas con confirmación, abandono, anfitrión sustituto, caducidad y revancha.
- **Simulación** (`sim/`): servidor autoritativo en memoria (códigos, sesiones con secreto con hash, idempotencia, `seq` por destinatario, reanudación, envío agrupado de posiciones, purga de coordenadas) y clientes simulados (desfase de reloj, detección de duplicados y huecos). Incluye bots deterministas para partidas completas.
- **Pruebas:** 103 automatizadas, todas superadas y todas **SIMULADAS**. Verificación por mutación de 3 invariantes. Detalle en `QUALITY_STATE.md`.
- **Hallazgos de diseño:** D-020 (`seq` por destinatario), D-021 (regla de antigüedad de las muestras) y D-023 (aclaraciones y una incoherencia documental).
- **Dependencias:** solo de desarrollo: `typescript@5.9.3` y `@types/node@22.19.1` (más su dependencia `undici-types@6.21.0`), instaladas con `--ignore-scripts`. `node_modules/` está excluido por `.gitignore`.

## Sesión 4: cierre de diseño (sin código)

- **Estado al empezar:** `ccr-f1962362-hvwb9i` en `f0ca70e`, al día con `origin` (0/0) y árbol limpio.
- **Documento nuevo:** `docs/product/GAME_MODES_AND_RULES.md`, la fuente única de reglas (Clásico, Infección, equipos, rondas, zona dinámica, pistas, escáner, disputas y avisos).
- **Documentos actualizados (de forma aditiva):** `PRODUCT_STRATEGY.md`, `MVP_SCOPE.md`, `USER_FLOWS.md` (F15–F20), `ACCEPTANCE_CRITERIA.md` (secciones I–N, en borrador), `GAME_STATE_MACHINE.md` (§9), `QUALITY_STATE.md`, `DECISION_LOG.md` (D-024 a D-037), `BACKLOG.md` y este archivo.
- **Motor y pruebas de S0: sin cambios.** No se han instalado dependencias, ni creado cuentas, ni desplegado, ni gastado nada.

## Sesión 5: cierre documental y S1 (sin commit)

- **Estado al empezar:** `ccr-f1962362-hvwb9i` en `c846377`, al día con `origin` (0/0) y árbol limpio. No hay archivos de instrucciones del repositorio.
- **Decisiones:** D-030 a D-037 aprobadas por el propietario, algunas con cambios respecto a la propuesta. D-038, la regla general de parámetros, también aprobada. D-039 (técnica de S1) queda como propuesta. D-040 registra el bloqueo.
- **Documentos actualizados (de forma aditiva):** `DECISION_LOG.md`, `GAME_MODES_AND_RULES.md`, `MVP_SCOPE.md` (§6.1), `PRODUCT_STRATEGY.md`, `USER_FLOWS.md`, `ACCEPTANCE_CRITERIA.md`, `GAME_STATE_MACHINE.md` (§9.8), `TECHNICAL_SPIKE_PLAN.md` (§8), `QUALITY_STATE.md`, `BACKLOG.md`, `README.md` y este archivo.
- **Nuevo:** `docs/technical/S1_ANDROID_PROTOCOL.md` y `android/` (núcleo Java con 13 pruebas y la app sin compilar).
- **Motor y pruebas de S0: sin cambios.**

## Sesión 6: demo visual simulada (sin commit)

- **Estado al empezar:** `ccr-f1962362-hvwb9i` en `c846377`, con los 35 archivos de la sesión 5 sin confirmar (se conservan intactos).
- **Formato elegido** (decisión técnica reversible, D-041): una web en **un solo HTML** sin dependencias, frente a una PWA (necesita HTTPS y, por tanto, un despliegue) o un APK (bloqueado por D-040).
- **Nuevo:** `demo/` (lógica simulada, interfaz, estilos, compilación, pruebas unitarias y e2e) y `demo/dist/rastro-demo.html`. Detalle en `demo/README.md`.
- **Cambiado:** `package.json` (scripts `build:demo` y `test:demo`, sin tocar los existentes) y los documentos de estado. **Motor y pruebas de S0: sin cambios.**
- **Pruebas:** 21 unitarias y un recorrido e2e en Chromium con emulación móvil; ver `QUALITY_STATE.md`. **Ninguna en el dispositivo real.**
- **Sin dependencias nuevas:** Playwright y Chromium ya venían instalados en el entorno y no se añaden al proyecto.

## Sesión 7: mejora visual y UX de la demo (sin commit)

- **Estado al empezar:** igual que al cerrar la sesión 6 (`c846377` y cambios de las sesiones 5 y 6 sin confirmar). El HTML generado coincidía con sus fuentes.
- **Alcance:** pasada visual selectiva **sin mecánicas nuevas ni cambios de reglas**. Solo se tocaron `demo/src/styles.css`, `demo/src/ui.js` (marcado y presentación), `demo/index.html` (color del tema), `demo/e2e/flow.e2e.cjs` (un texto renombrado y la comprobación de que no hay peticiones de red) y estos documentos. `demo/src/sim.js` y sus pruebas no cambian.
- **Pruebas:** ver `QUALITY_STATE.md`. **Sigue sin probarse en el Xiaomi 14T.**

## Sesiones 9 y 10: compilación Android y panel "Lectura actual" (sin commit)

- **Sesión 9:** `dl.google.com` ya es accesible. Con autorización expresa del propietario se aceptó la licencia `android-sdk-license` solo para `platforms;android-34` y `build-tools;34.0.0`, instalados en `/home/user/android-sdk` (fuera del repositorio; el contenedor es efímero). El APK debug compiló con la configuración existente, sin cambios.
- **Sesión 10:** panel "Lectura actual" en la pantalla de S1: coordenadas con 5 decimales **solo en pantalla** (se borran al salir de la app o al detener la sesión), precisión estimada por el sistema, antigüedad, proveedor, frescura (Actualizada ≤ 15 s, Antigua, Sin lectura) **independiente** de la precisión (Suficiente ≤ 50 m, Insuficiente, Desconocida), estado del permiso (precisa, solo aproximada, denegada, denegada permanentemente con acceso a los ajustes) y aviso de ubicación del sistema desactivada. Umbrales experimentales (D-038).
- **Archivos:** nuevos `android/core/.../LiveReading.java`, `PermissionState.java` y `LiveReadingTest.java`; modificados `MainActivity.java` y `LocationTestService.java`. El CSV sigue sin coordenadas. Sin permisos nuevos.
- **Compilar:** `ANDROID_HOME=/home/user/android-sdk gradle -p android :app:assembleDebug`. Resultados en `QUALITY_STATE.md`.

## Sesión 13: secuencia de inicio de partida (D-042)

- **Motor S0:** cuenta atrás de 5 s sin revelar equipos; revelación individual (`role_revealed`) al terminar; tiempo de huida con mínimo y valor por defecto de 2 min; aviso sin sanción al cazador que se aleja de la zona de salida, solo con lecturas fiables (radio experimental de 50 m). 112 pruebas (9 nuevas).
- **Demo:** cuenta atrás de 5 s en tiempo real, rol oculto hasta la revelación, tiempo de huida elegible (2, 3 o 5 min) y sorteo automático secreto al empezar. 62 pruebas y E2E en 412×915 y 360×740.
- Detalles, interpretaciones y parámetros pendientes en `DECISION_LOG.md` (D-042).

## H1: app Android de diagnóstico GPS (Capacitor)

- **Qué es:** app Capacitor 8.5.3 en `mobile/`, con el plugin nativo `OutrunLocation`, un servicio en primer plano de tipo ubicación y una pantalla de diagnóstico. **Sin permiso de Internet.** El CSV que exporta no tiene coordenadas. Commit `dc05d46` (25/10/2026).
- **Defecto de arranque:** en la primera APK ningún botón respondía. La causa era que `nativePlugin()` devolvía el proxy de `registerPlugin(...)` desde una función `async`. JavaScript lo trataba como una promesa (el proxy responde a «then») y el arranque se quedaba esperando sin fin, antes de registrar los botones.
- **Corrección:** commit `7ac972e` (`fix(mobile): repair Capacitor diagnostic startup`, 26/10/2026), **publicado**. El plugin se entrega envuelto en `{ plugin }`, el arranque tiene un tiempo límite de 5 s y los errores se muestran en «Incidencias». Incluye pruebas de regresión. Rama sincronizada con `origin/ccr-f1962362-hvwb9i`.
- **Prueba física (Xiaomi 14T):** con la APK corregida, los botones responden. En una sesión corta (unos 5 min) se registraron 58 lecturas del proveedor `fused`, también con la pantalla apagada y la app en segundo plano, con 0 huecos de más de 30 s. Detalle y límites en `QUALITY_STATE.md` y `mobile/PRUEBAS_XIAOMI_14T.md`.
- **APK:** no está versionada. Se conserva solo en `mobile/apk-local/` (carpeta excluida en local con `.git/info/exclude`) en este contenedor efímero, junto a la APK anterior como respaldo.
- **Sin validar todavía:** caminata larga, interiores o mala señal, batería en sesión larga, ajustes de ahorro de HyperOS, red y varios jugadores, e iPhone.

## F1 y H2: motor seguro y partida multijugador (26/10/2026, sin commit)

- **F1 (motor):**
  - Privacidad de roles y preferencias: solo las ve quien las fijó, y en la asignación manual solo el anfitrión.
  - Validación estricta de comandos.
  - D-033: un cazador fuera de la zona no puede reclamar capturas.
  - **D-035 sin implementar:** su procedimiento solo existe como propuesta.
- **Servidor (`server/`):** Node 22 sin dependencias nuevas. Incluye:
  - WebSocket propio y protocolo JSON validado;
  - sesiones con secreto, códigos de 6 caracteres, reanudación con `seq` e idempotencia;
  - hora de las lecturas calculada con el reloj del servidor;
  - límites de abuso, limpieza de salas y comprobación de origen;
  - la interfaz web servida por el mismo servidor.
- **Cliente (`mobile/www/`):**
  - inicio, sala, configuración del anfitrión, cuenta atrás, rol privado, huida, persecución con radar, capturas, avisos de zona, reconexión, final y revancha;
  - ubicación nativa en Android, del navegador en web e iPhone, y el mismo contrato para el futuro iOS;
  - APK `0.2.0-h2` con permiso de Internet.
- **Decisiones técnicas** (reversibles; no cambian reglas):
  - WebSocket escrito a mano, para no añadir dependencias;
  - interfaz sin mapas externos (radar SVG);
  - la preferencia de equipo propia no aparece en la interfaz, porque si el sorteo respeta preferencias sigue abierto;
  - el servidor solo escucha en este ordenador salvo que se indique `HOST`;
  - límites técnicos de frecuencia, incluida una reclamación cada 3 s por cazador.

**Preparación de la prueba real en Android (26/10/2026, sin commit):**
- **Envío nativo:** en partida, el servicio en primer plano envía la ubicación por HTTPS (`POST /api/loc`), con el mismo límite por jugador que el WebSocket.
- **Conexión:**
  - ping de protocolo del servidor cada 20 s;
  - el latido del cliente envía una sonda antes de dar la conexión por muerta.
- **Correcciones:**
  - el anfitrión que centraba la zona no enviaba su ubicación en la app;
  - la notificación decía que no se enviaban coordenadas;
  - el servicio no se paraba solo al ser capturado o al terminar la partida.
- **Ayudas para la prueba:** contadores por canal en `/health`, `server/health-watch.mjs` y la antigüedad de los compañeros en el radar.
- **APK:** `the-outrun-h2-pantalla-bloqueada-debug.apk`. Las APK anteriores se conservan.
- **Detalle y pruebas:** `QUALITY_STATE.md`.

## Decisiones

- **Aprobadas por el propietario:** D-002, D-003, D-004 (en parte), D-006, D-007, D-008, D-009, D-010, D-011, D-024 a D-029 (sesión 4), D-030 a D-038 (sesión 5) y D-042 (sesión 13: secuencia de inicio de partida).
- **Pendientes:** D-004 (invitado), D-005 (cliente final), D-012 a D-019, D-020 a D-023 y D-039 (técnica de S1). Bloqueo: D-040.
- **Técnica de la demo:** D-041 (formato de la demo visual), tomada dentro de la autorización de la sesión 6. No afecta al cliente final (D-005).
- **Abiertas tras la sesión 5:** si la zona dinámica entra en la *primera* versión jugable, la regla predeterminada de las disputas (`GAME_MODES_AND_RULES.md` §9.3) y todos los parámetros numéricos (D-038).

## Riesgos y bloqueos

- ~~El trabajo de las sesiones 5 y 6 está sin confirmar.~~ **Todo el trabajo está guardado en Git:** HEAD `7ac972e`, publicado y sincronizado con `origin` (26/10/2026). Solo las APK de `mobile/apk-local/` quedan fuera de Git, a propósito.
- La demo **no se puede instalar como app** sin autorización: la PWA necesita un despliegue HTTPS y el APK necesita el SDK (D-040). Hoy se abre como archivo en Chrome.
- ~~**D-040:** sin `dl.google.com` no se puede compilar el APK en este entorno.~~ Resuelto (sesión 9). Si el contenedor se recrea, hay que volver a instalar los dos componentes del SDK.
- El riesgo crítico sigue abierto: la ubicación con el móvil bloqueado. **S0 no lo reduce.**
  - H1 aporta una primera evidencia positiva (sesión corta en el Xiaomi 14T con la pantalla apagada), pero no lo cierra: falta una sesión larga caminando.
  - En la partida, el envío nativo por HTTPS está implementado y probado sin dispositivo. **Que HyperOS lo deje enviar con la pantalla bloqueada está sin comprobar.**
- El adaptador de servidor sigue sin decidir (D-014): no se ha probado ningún transporte real.
- El coste de CPU del motor (clona el estado en cada comando) no se ha medido en un adaptador real.

## Recuperación en Windows y enlace/QR (26/10/2026, tarde)

- **Recuperación:** F1/H2/H2.1 venían en un parche del entorno original. Se aplicó en una copia nueva (`C:\Users\aange\Projects\Juego-escondite-recuperacion`, rama `recuperacion-h2`) y se verificó contra el árbol esperado. La única diferencia es una corrección de portabilidad a Windows en `server/test/hostile.test.mjs`. Detalle en `QUALITY_STATE.md`.
- **Commits locales (26/10/2026, sin push):** con la identidad local del repositorio (`aangelrvss-oss`):
  - `664cf53`: la recuperación exacta (árbol `e0e2bcb1…`);
  - `5611274`: el ajuste de Windows de `hostile.test.mjs` (árbol `53bc009b…`, igual que el primer respaldo).

  El trabajo posterior (invitación por enlace/QR, renovación del código, Mission Report y documentación) sigue **sin commit**. Respaldos verificados en `C:\Users\aange\Downloads\outrun-respaldo-*`.
- **Nuevo (D-048):**
  - enlace de invitación `https://<servidor>/?sala=<CÓDIGO>`, que precarga el código;
  - QR generado en el móvil sin dependencias (`mobile/www/js/qr.js`);
  - «Cambiar el código» del anfitrión (`new_code` en `server/hub.ts`): el anterior deja de servir.

  Probado con pruebas automáticas y en Chrome real contra el servidor real (`mobile/e2e/web-flow.e2e.mjs`). **No probado en un móvil.**
- **Mission Report mínimo (Plan §4.4):** resultado y causa; tiempo (persecución y tiempo hasta la victoria); capturas por cazador; momentos verificables (primera captura, captura decisiva, más capturas). Solo usa datos oficiales de la instantánea: `activeStart` y `finishedAt` se añadieron a la vista (`engine/src/view.ts`), así que se reconstruye igual tras una reconexión. No revela equipos ni coordenadas.
- **Partida web completa en un navegador real:** `mobile/e2e/web-flow.e2e.mjs`, con Chrome sin interfaz, tres jugadores, geolocalización emulada y reloj del servidor controlado. Recorrido: invitación por enlace/QR → cambio de código → configuración → cuenta atrás → rol privado → huida → persecución → captura → Mission Report igual en los tres → recarga y mismo informe. **17 de 17.** No sustituye a la prueba con móviles.
- **Revisión de la invitación (19:17-19:30):**
  - pruebas del QR con vectores publicados y un lector escrito aparte del codificador;
  - 9 pruebas de servidor de la renovación del código (autorización, códigos anteriores, colisiones, fases e idempotencia), con mutaciones detectadas;
  - casos de enlaces no válidos; `codeFromLink` acepta ahora solo enlaces http(s).

  **El QR no se ha escaneado con una cámara ni con un lector de terceros.**
- **Android en Windows:** no hay JDK 21 ni Android SDK. La compilación está bloqueada hasta que se autorice instalarlos.

## Sesión autónoma (26/10/2026, 19:41-20:20): commits locales en `recuperacion-h2`, sin push

| Commit | Contenido |
|---|---|
| `46192fb` | Invitación: enlace `?sala=`, QR propio y renovación del código (D-048) |
| `1d913d5` | Mission Report mínimo con datos oficiales; se reconstruye tras reconectar |
| `cb7f3e8` | Documentación: Plan Maestro, contradicciones D-043 a D-047, trazabilidad y criterios de aceptación |
| `952b158` | Un salto aislado del GPS ya no valida una captura (D-049; Plan §4.1 y §10) |
| `d420cc1` | Abandonar la partida desde la interfaz, dejando de compartir la ubicación (§4.5 y §10) |
| `97410fe` | Comprobación de GPS al pulsar «Estoy listo», con explicación (§2.1 paso 4 y §4.1) |
| `9d44bd8` | Persistencia opcional de las salas para sobrevivir a reinicios (`STATE_FILE`, D-050), sin coordenadas ni secretos |
| `40ffc39` | Todos ven qué impide empezar y quién está sin conexión; aviso al perder la conexión (§7) |
| `efd1235` | Límite de 5 salas activas por dirección: nadie acapara la capacidad |
| `7521f1b` | Reglas de la partida visibles para todos, sincronizadas con el motor (§2.1 paso 5, §3.3 y §7) |
| `f399f0d` | Controles de 44 px y texto de 12 px o más en 11 pantallas a 360×740 (2 defectos corregidos) |
| `6739b68` | Indicador de cuándo se comparte la ubicación (§4.5) |
| `7a6b56a` | Versión de reglas por partida (§8.3) |
| `ab2d2dd` | Compartir el Mission Report como texto (§4.4) |

Todo está probado con pruebas automáticas y en **Chrome de escritorio** (con emulación móvil y geolocalización emulada). **Nada se ha validado en un móvil real.** Detalle en `QUALITY_STATE.md`.

## Segunda sesión autónoma (26/10/2026, 22:43-23:30): commits locales, sin push

**Decisiones:** análisis de D-043 a D-047, del procedimiento pendiente de D-035 y de los estados CHECKS, BRIEFING y PAUSED en `docs/product/DECISIONES_PENDIENTES.md`. Para cada una: alternativas, consecuencias, recomendación y si necesita tu aprobación. **No se ha cambiado ninguna decisión.**

| Commit | Contenido |
|---|---|
| `3d9e9e8` | Persistencia probada matando el proceso de verdad |
| `b339ae4` | Recargar en plena partida ya no repite avisos ni pierde la pista. Pruebas de reconexión en los momentos delicados |
| `6013890` | Análisis de las decisiones pendientes |
| `7fa52be` | Declaración de edad (D-008, AC-A1) |
| `1a51c97` | El registro del servidor real no tiene coordenadas (AC-D7) |
| `70cbee0` | Aviso fijo si falta el permiso de ubicación (AC-D9) |
| `b2a3134` | Aviso nocturno (AC-B3, horario hipotético) y normas de captura en la tarjeta del rol (AC-B4) |
| `cebf485` | Pantalla encendida durante la partida en el navegador (D-051) |
| `dc845c3` | En el navegador, la posición de un jugador quieto ya no caduca (D-051) |
| `b6f911a` | Reglas y roles fijados desde «Empezar» (BRIEFING del Plan) |
| `dc998b8` | La reclamación de captura queda encima de cualquier otra hoja |
| `3ad4e2d` | Un comando reenviado tras un reinicio no se aplica dos veces |
| `23f260d` | Reglas de seguridad completas (§4.5) y sin posiciones ajenas fuera de la partida |
| `5509126` | Procedimiento de la prueba real con dos móviles en el navegador |

Pruebas al cerrar: motor 144, servidor 54, cliente 95, demo 62 y E2E en Chrome 41/41; typecheck sin errores. **Nada se ha validado en un móvil real.**

## Siguiente acción concreta

0. ~~Configurar la identidad de Git y hacer los commits.~~ Hecho: hay commits locales de todo el trabajo, sin push. Decidir si se publica la rama `recuperacion-h2` en GitHub (no se ha hecho).
1. **Decidir D-043 a D-047** (radio, PWA, INFECTION, número de jugadores, pistas y espectadores), el procedimiento de D-035 (disputas) y si hace falta PAUSED. Son los bloqueos de producto que quedan para HUNT. Alternativas y recomendaciones: `docs/product/DECISIONES_PENDIENTES.md`.
1b. **Prueba con dos móviles en el navegador** (sin APK, también con iPhone): `mobile/PRUEBA_PARTIDA_NAVEGADOR.md`. Necesita tu autorización para el túnel HTTPS.
2. **Prueba con dos móviles:** seguir `mobile/PRUEBA_PARTIDA_ANDROID.md`.
   - Servidor y túnel HTTPS en tu ordenador.
   - APK `0.3.0-h2-bloqueo` en los dos Android.
   - Comprobar con `server/health-watch.mjs` que las lecturas siguen llegando con la pantalla **bloqueada**, y devolver los contadores y los CSV.
3. Si lo anterior funciona, la **primera partida con 5 personas**. Antes, decidir D-035 (disputas) y si los equipos se revelan al final.
4. La segunda prueba física de H1 (caminata de 15–20 min) sigue siendo útil para calibrar la precisión.

Acciones anteriores a H2:
- Revisar y confirmar el cierre documental de H1. *Hecho (`4c190a0`).*

Acciones anteriores:
- El propietario abre `demo/dist/rastro-demo.html` en el Xiaomi 14T, la prueba (lista en `demo/README.md`) y comenta lo que vea. *Sin resultado registrado.*
- ~~El propietario revisa las sesiones 5 y 6 y autoriza (o no) su commit.~~ Hecho: ese trabajo está en Git.
- ~~Desbloquear la compilación.~~ Hecho (sesión 9).
- ~~Instalar el APK de la sesión 10 y hacer la "Prueba 0".~~ Sustituido por las pruebas de H1 (`mobile/PRUEBAS_XIAOMI_14T.md`), que usan el mismo núcleo y el mismo CSV.
- Según el resultado (criterios de §6 del protocolo de S1): aprobar V2, o decidir V1 o un cambio de técnica.
