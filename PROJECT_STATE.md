# Estado del proyecto

**Última actualización:** 26/10/2026 (cierre documental de H1)
**Rama:** `ccr-f1962362-hvwb9i`
**Nombre del producto:** provisional. La demo y H1 usan la identidad visual THE OUTRUN; no hay ninguna decisión de nombre registrada en `DECISION_LOG.md`.

## Fase activa

**H1 (app Android de diagnóstico GPS con Capacitor): corrección publicada y prueba física preliminar superada en el Xiaomi 14T.** Falta una segunda prueba física caminando. **H2 (multijugador real) está en pausa:** no se ha empezado a implementar.
- Detalle en la sección «H1» de este archivo y en `QUALITY_STATE.md`.

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

## Decisiones

- **Aprobadas por el propietario:** D-002, D-003, D-004 (en parte), D-006, D-007, D-008, D-009, D-010, D-011, D-024 a D-029 (sesión 4), D-030 a D-038 (sesión 5) y D-042 (sesión 13: secuencia de inicio de partida).
- **Pendientes:** D-004 (invitado), D-005 (cliente final), D-012 a D-019, D-020 a D-023 y D-039 (técnica de S1). Bloqueo: D-040.
- **Técnica de la demo:** D-041 (formato de la demo visual), tomada dentro de la autorización de la sesión 6. No afecta al cliente final (D-005).
- **Abiertas tras la sesión 5:** si la zona dinámica entra en la *primera* versión jugable, la regla predeterminada de las disputas (`GAME_MODES_AND_RULES.md` §9.3) y todos los parámetros numéricos (D-038).

## Riesgos y bloqueos

- ~~El trabajo de las sesiones 5 y 6 está sin confirmar.~~ **Todo el trabajo está guardado en Git:** HEAD `7ac972e`, publicado y sincronizado con `origin` (26/10/2026). Solo las APK de `mobile/apk-local/` quedan fuera de Git, a propósito.
- La demo **no se puede instalar como app** sin autorización: la PWA necesita un despliegue HTTPS y el APK necesita el SDK (D-040). Hoy se abre como archivo en Chrome.
- ~~**D-040:** sin `dl.google.com` no se puede compilar el APK en este entorno.~~ Resuelto (sesión 9). Si el contenedor se recrea, hay que volver a instalar los dos componentes del SDK.
- El riesgo crítico sigue abierto: la ubicación con el móvil bloqueado. **S0 no lo reduce.** H1 aporta una primera evidencia positiva (sesión corta en el Xiaomi 14T con la pantalla apagada), pero no lo cierra: falta una sesión larga caminando.
- El adaptador de servidor sigue sin decidir (D-014): no se ha probado ningún transporte real.
- El coste de CPU del motor (clona el estado en cada comando) no se ha medido en un adaptador real.

## Siguiente acción concreta

1. Revisar y confirmar este cierre documental de H1 (cambios sin commit hasta que se autorice).
2. **Segunda prueba física de H1:** 15–20 min caminando con la pantalla bloqueada la mayor parte del tiempo, con un paso por un portal o garaje (pruebas 3, 4 y 6 de `mobile/PRUEBAS_XIAOMI_14T.md`). Antes de empezar, anotar los ajustes de batería de HyperOS. Exportar el CSV y analizarlo.
3. **H2 sigue en pausa** hasta que el propietario lo autorice. Las decisiones pendientes para H2 están en la auditoría del 25/10/2026, que no está en el repositorio.

Acciones anteriores:
- El propietario abre `demo/dist/rastro-demo.html` en el Xiaomi 14T, la prueba (lista en `demo/README.md`) y comenta lo que vea. *Sin resultado registrado.*
- ~~El propietario revisa las sesiones 5 y 6 y autoriza (o no) su commit.~~ Hecho: ese trabajo está en Git.
- ~~Desbloquear la compilación.~~ Hecho (sesión 9).
- ~~Instalar el APK de la sesión 10 y hacer la "Prueba 0".~~ Sustituido por las pruebas de H1 (`mobile/PRUEBAS_XIAOMI_14T.md`), que usan el mismo núcleo y el mismo CSV.
- Según el resultado (criterios de §6 del protocolo de S1): aprobar V2, o decidir V1 o un cambio de técnica.
