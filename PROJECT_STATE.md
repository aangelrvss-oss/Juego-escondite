# Estado del proyecto

**Última actualización:** 24/10/2026 (sesión 7: mejora visual y UX de la demo)
**Rama:** `ccr-f1962362-hvwb9i`
**Nombre del producto:** provisional, sin decidir.

## Fase activa

**S1 (ubicación en Android): prototipo escrito, APK sin compilar y pruebas en el dispositivo pendientes.**
- ~~Bloqueo: la red del entorno deniega `dl.google.com` (D-040).~~ **Resuelto en la sesión 9:** el propietario habilitó el dominio y el APK debug compila. **Las pruebas en el dispositivo físico siguen pendientes.**
- S0 completada **en simulación** (103 pruebas; `f0ca70e`). El diseño de la sesión 4 está guardado (`c846377`).
- La primera versión jugable **solo** tendrá el modo Clásico (D-030). La app del juego **no ha comenzado**.

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

## Decisiones

- **Aprobadas por el propietario:** D-002, D-003, D-004 (en parte), D-006, D-007, D-008, D-009, D-010, D-011, D-024 a D-029 (sesión 4) y D-030 a D-038 (sesión 5).
- **Pendientes:** D-004 (invitado), D-005 (cliente final), D-012 a D-019, D-020 a D-023 y D-039 (técnica de S1). Bloqueo: D-040.
- **Técnica de la demo:** D-041 (formato de la demo visual), tomada dentro de la autorización de la sesión 6. No afecta al cliente final (D-005).
- **Abiertas tras la sesión 5:** si la zona dinámica entra en la *primera* versión jugable, la regla predeterminada de las disputas (`GAME_MODES_AND_RULES.md` §9.3) y todos los parámetros numéricos (D-038).

## Riesgos y bloqueos

- S0 (`f0ca70e`) y el diseño de la sesión 4 (`c846377`) están **guardados en Git**. El trabajo de las sesiones 5 y 6 está **sin confirmar** hasta que se autorice su commit.
- La demo **no se puede instalar como app** sin autorización: la PWA necesita un despliegue HTTPS y el APK necesita el SDK (D-040). Hoy se abre como archivo en Chrome.
- ~~**D-040:** sin `dl.google.com` no se puede compilar el APK en este entorno.~~ Resuelto (sesión 9). Si el contenedor se recrea, hay que volver a instalar los dos componentes del SDK.
- El riesgo crítico sigue abierto: la ubicación con el móvil bloqueado. **S0 no lo reduce.**
- El adaptador de servidor sigue sin decidir (D-014): no se ha probado ningún transporte real.
- El coste de CPU del motor (clona el estado en cada comando) no se ha medido en un adaptador real.

## Siguiente acción concreta

1. El propietario abre `demo/dist/rastro-demo.html` en el Xiaomi 14T, la prueba (lista en `demo/README.md`) y comenta lo que vea.
2. El propietario revisa las sesiones 5 y 6 y autoriza (o no) su commit.
3. ~~Desbloquear la compilación.~~ Hecho (sesión 9).
4. Instalar el APK de la sesión 10 en el Xiaomi 14T y hacer la "Prueba 0" (pantalla encendida, de día, al aire libre: 5 min quieto y 5 min caminando). Después, ejecutar S1-T01 a S1-T14 en el Xiaomi 14T, exportar los CSV y analizarlos (`AnalyzeCli`).
5. Según el resultado (criterios de §6 del protocolo): aprobar V2, o decidir V1 o un cambio de técnica.
