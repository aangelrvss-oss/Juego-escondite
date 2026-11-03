# Registro de decisiones

Formato: ID · fecha · estado (Propuesta / Aprobada / Rechazada / Sustituida) · decisión · alternativas · motivo.

---

### D-001 · 24/10/2026 · Aprobada (por el encargo)
**Decisión:** primero investigar y no programar nada en la fase 0.
**Motivo:** instrucción explícita del encargo.

### D-002 · 24/10/2026 · **Aprobada** (por el propietario, sesión 2)
**Decisión:** enfoque de producto "A como núcleo y C como dirección": escondite clásico pulido para grupos privados en el MVP, y después un kit para organizadores y eventos.
**Alternativas:** B (plataforma de muchos modos): descartada por competir de frente con HideZone y multiplicar las pruebas en campo. C desde el primer día: descartada porque exige validar antes el núcleo.
**Motivo:** ver `docs/research/PHASE0_REPORT.md` §1.

### D-003 · 24/10/2026 · **Aprobada** (por el propietario, sesión 2: "Partidas con desconocidos: fuera del MVP")
**Decisión:** no habrá partidas públicas con desconocidos en el MVP. Más adelante, solo a través de eventos con anfitrión verificado.
**Alternativas:** emparejamiento abierto por cercanía.
**Motivo:** riesgo de seguridad (acoso, menores, confundir a terceros con jugadores). HideZone lo descartó por la misma razón.

### D-004 · 24/10/2026 · **Aprobada en parte**
**Aprobado (sesión 2):** "salas privadas gratuitas, con invitaciones sencillas".
**Sigue como propuesta:** la entrada como invitado sin cuenta obligatoria (ver `docs/product/MVP_SCOPE.md` M1).
**Decisión original:** organizar partidas pequeñas será gratis y sin cuenta obligatoria (entrada como invitado).
**Alternativas:** compra única para organizar (modelo de SCRAM) o suscripción (Hunting Game).
**Motivo:** las reseñas de SCRAM muestran rechazo al muro de pago y fallos del código por correo antes de la primera partida.

### D-005 · 24/10/2026 · Propuesta (**sigue pendiente**: el propietario indica que React Native con Expo "es una opción que investigar, no una decisión definitiva". Novedad en la sesión 2: el `expo-location` estándar exige el permiso "Siempre", ver D-013)
**Decisión:** la app de juego será nativa multiplataforma. Se descarta una PWA como cliente de juego. Primera opción a investigar: React Native con Expo (development build).
**Alternativas:** Flutter (alternativa sólida) y PWA (no fiable con la pantalla bloqueada).
**Motivo:** la ubicación con el móvil bloqueado es imprescindible. Pendiente del ADR de la fase 3.

### D-006 · 24/10/2026 · **Aprobada** (por el propietario, sesión 2: "Chat: fuera del MVP", incluida la voz)
**Decisión:** sin chat ni radio de equipo en el MVP.
**Alternativas:** chat de texto moderado.
**Motivo:** reduce las obligaciones de moderación y el riesgo. En los grupos privados la gente ya tiene WhatsApp. Se revisará tras las pruebas.

### D-007 · 24/10/2026 · **Aprobada** (por el propietario, sesión 2: "preferencia por alojamiento en la UE, previa comprobación de las condiciones reales de cada proveedor")
**Decisión:** preferir proveedores con alojamiento de datos en la UE.
**Motivo:** son datos de ubicación de personas (la mención a menores ya no aplica tras D-008). Además es una diferencia frente a SCRAM, que aloja los datos en EE. UU.

---

## Sesión 2 · 24/10/2026

### D-008 · **Aprobada** (propietario)
**Decisión:** el público es exclusivamente de mayores de 18 años. Sin funciones dirigidas a menores.
**Consecuencia:** declaración de edad al abrir la app (no es verificación) y público objetivo adulto en las tiendas. [P: asesoría legal]

### D-009 · **Aprobada** (propietario)
**Decisión:** sin pagos, suscripciones ni publicidad en el MVP.

### D-010 · **Aprobada** (propietario)
**Decisión:** presupuesto inicial de 50–200 €, con preferencia por no gastar. No se gasta en dominio ni publicidad por ahora. Cualquier gasto necesita una autorización expresa previa, con la alternativa gratuita al lado.

### D-011 · **Aprobada** (propietario)
**Decisión:** el desarrollo se hace con Claude Code, por fases, con revisión y aprobación humana. Dispositivos: el Android del propietario y un iPhone prestado más adelante.

### D-012 · Propuesta
**Decisión:** eliminar `READY` como estado de la partida. "Listo" pasa a ser una marca de cada jugador dentro de `LOBBY`.
**Alternativas:** mantener `READY` como estado.
**Motivo:** no aporta ningún comportamiento distinto. Ver `docs/technical/GAME_STATE_MACHINE.md` §2.

### D-013 · Propuesta
**Decisión:** la prueba técnica compara dos variantes de ubicación: V1 (`expo-location` con el permiso "Siempre") y V2 (módulo nativo propio con servicio en primer plano y "Mientras se usa la app").
**Motivo:** la documentación de Expo (SDK 55–58) exige el permiso de segundo plano o "Siempre" para `startLocationUpdatesAsync`. Ese permiso añade fricción y una revisión más estricta en Play.

### D-014 · Propuesta
**Decisión:** el motor del juego será un paquete TypeScript puro y determinista, independiente del proveedor. Para la prueba se alojará en Cloudflare Durable Objects si se confirman el plan gratuito y la jurisdicción UE. Si no, en un servidor Node propio.
**Alternativas:** Supabase (región UE verificada, pero con temporizadores incómodos), Convex (sin región UE confirmada) y Firebase (las Functions requieren un plan de pago).
**Motivo:** ver `docs/technical/TECHNICAL_SPIKE_PLAN.md` §2.2.

### D-015 · Propuesta
**Decisión:** mapas con MapLibre y teselas de OpenFreeMap (0 €, sin clave). Plan B: PMTiles propias o el SDK nativo de Google.
**Riesgo:** OpenFreeMap no da garantía de servicio.

### D-016 · Propuesta
**Decisión:** la captura tiene dos vías: la autodeclaración del fugitivo, o la declaración del cazador con posiciones actuales, cercanía plausible según la precisión y confirmación del fugitivo en 30 s. Sin respuesta, no hay captura.

### D-017 · Propuesta
**Decisión:** no se puede entrar en una partida ya empezada. Solo en la sala de espera o en la revancha.
**Motivo:** reduce el riesgo de que alguien se una para seguir a otro.

### D-018 · Propuesta
**Decisión:** el servidor agrupa las posiciones de los compañeros en un mensaje por destinatario y ciclo.
**Motivo:** sin agrupar, el volumen de mensajes crece con el cuadrado del tamaño del equipo (`TECHNICAL_SPIKE_PLAN.md` §5).

### D-019 · Propuesta
**Decisión:** límites del MVP: de 2 a 20 jugadores, de 10 a 120 min, y zona de 150 m a 2 km de radio.
**Motivo:** son límites técnicos para poder probar el MVP, no un muro de pago.

---

## Sesión 3 · 24/10/2026 (etapa S0)

### D-020 · Propuesta (corrección de diseño detectada en S0)
**Decisión:** el número de secuencia de los eventos es **por destinatario**, no por sala.
**Motivo:** con el filtrado por audiencia, un `seq` global produce saltos legítimos que el cliente no puede distinguir de pérdidas reales. Ver `GAME_STATE_MACHINE.md` §5.7.

### D-021 · Propuesta (corrección de diseño detectada en S0)
**Decisión:** una muestra con hora futura se marca como sospechosa y nunca es `CURRENT`. Una muestra con hora pasada conserva su antigüedad real, aunque sea de hace minutos.
**Motivo:** la regla anterior ("usar `received_at` si la diferencia supera 60 s") haría parecer actual una muestra guardada sin cobertura. Ver `GAME_STATE_MACHINE.md` §6.1.

### D-022 · Propuesta
**Decisión:** S0 se ejecuta sin dependencias de producción, con el ejecutor de TypeScript nativo de Node ≥ 22.18 y `node --test`. Solo dos dependencias de desarrollo con versión exacta (`typescript@5.9.3` y `@types/node@22.19.1`), instaladas con `--ignore-scripts`.
**Alternativas:** Vitest o Jest (más dependencias) y TypeScript 7 (versión nativa reciente; se descarta hasta que madure).
**Motivo:** mínima superficie de dependencias.

### D-023 · Propuesta
**Decisión:** aceptar las aclaraciones de reglas tomadas al implementar S0 (`GAME_STATE_MACHINE.md` §7 bis), o cambiarlas. Incluye resolver la **incoherencia** sobre quién se expone fuera de la zona (`PRODUCT_STRATEGY.md` §5 frente a `GAME_STATE_MACHINE.md` §6.4).

---

## Sesión 4 · 24/10/2026 (cierre de diseño)

Reglas completas en `docs/product/GAME_MODES_AND_RULES.md`. Las entradas "Aprobada" recogen **solo** lo que el propietario definió en esta sesión. Los parámetros, algoritmos y el alcance siguen pendientes.

### D-024 · **Aprobada** (propietario)
**Decisión:** modo Clásico con **equipos fijos**. Los fugitivos ganan si queda alguno libre al final; los cazadores, si capturan a todos antes. Puede usar zona dinámica y pistas.
**Consecuencia:** confirma que en Clásico los capturados no se unen a los cazadores.

### D-025 · **Aprobada** (propietario)
**Decisión:** modo **Infección**. Uno o varios cazadores iniciales. Cada captura confirmada convierte al fugitivo en cazador en esa partida. Termina cuando todos son cazadores o se agota el tiempo; si quedan fugitivos libres, ganan los supervivientes.
**Pendiente:** la duración de la transición y la ventaja inicial (parámetros), y si entra en el MVP (D-030).

### D-026 · **Aprobada** (propietario)
**Decisión:** al crear la sala se elige **sorteo automático o selección manual**, con una **proporción configurable de cazadores** y límites seguros según el tamaño del grupo.
**Pendiente:** los límites concretos (D-031) y si el sorteo respeta preferencias.

### D-027 · **Aprobada** (propietario)
**Decisión:** para rondas sucesivas se documentan tres opciones: sorteo nuevo, primeros capturados como cazadores iniciales y rotación equilibrada.
**Pendiente:** cuáles se ofrecen y la regla definitiva de la rotación equilibrada.

### D-028 · **Aprobada** (propietario)
**Decisión:** la zona puede **encogerse y cambiar de posición** durante la partida.
**Pendiente:** los avisos previos, límites, tiempos y condiciones de victoria (parámetros), y su alcance en el MVP (D-030).

### D-029 · **Aprobada** (propietario)
**Decisión:** las pistas muestran la antigüedad real. El escáner es limitado y no revela más de lo necesario. Las capturas requieren validación y una vía de disputa. La ubicación exacta, los avisos sonoros y el segundo plano se validan en dispositivos reales.

### D-030 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- El **primer modo jugable será Clásico**.
- **Infección** queda como **ampliación futura**: no es requisito para completar la primera versión jugable. Su diseño se conserva.
- El objetivo inmediato de **S1** es validar la ubicación en Android, no implementar todos los elementos del MVP.
**Nota:** esta aprobación **modifica** lo que yo propuse en la sesión 4 (Infección y escáner dentro del MVP). La inclusión de la zona dinámica en la *primera* versión jugable no se ha decidido expresamente: forma parte del diseño previsto (D-032), pero no es requisito de S1.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión propuesta:** incluir en el MVP la zona dinámica (opcional por sala), la asignación con proporción, las opciones de ronda A y B, las disputas, el modo **Infección** (segundo modo) y el escáner mínimo. El orden de implementación está en `MVP_SCOPE.md` §6. S1 no cambia.
**Conflicto:** la sesión 2 aprobó dejar fuera "los modos alternativos que no sean necesarios para validar el núcleo". Incluir la Infección exige que el propietario cambie esa decisión. La exclusión de la zona dinámica, en cambio, solo era una propuesta.
**Alternativa:** un MVP solo con Clásico y zona dinámica, dejando la Infección y el escáner para la primera ampliación.

### D-031 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- La proporción de cazadores es **configurable dentro de límites válidos** según el tamaño del grupo.
- Se mantienen las dos opciones: **sorteo automático** y **selección manual**.
- La distribución exacta para cada tamaño de grupo **está por definir y probar**.
**Nota:** las fórmulas numéricas de la propuesta original (`floor(n/2)`, `max(1, floor(n/4))`, proporciones 1/5, 1/3 y 1/2) **no están aprobadas**: son hipótesis.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** límites seguros: siempre ≥ 1 cazador y ≥ 1 fugitivo. En Clásico, cazadores ≤ `floor(n/2)`. En Infección, cazadores iniciales ≤ `max(1, floor(n/4))`. Proporciones predefinidas: 1/5, 1/3 y 1/2 (esta última solo en Clásico).

### D-032 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- Se aplican **reglas conservadoras**.
- La zona dinámica **forma parte del diseño previsto**, pero sus **parámetros numéricos siguen pendientes** de validación.
- **No se elimina automáticamente** a un jugador por cruzar el límite de la zona.
- Los avisos y las transiciones deben dar un **tiempo razonable** para reaccionar.
- Una zona circular **no garantiza** rutas transitables ni seguridad física.
**Nota:** la contención, la fórmula "nadie necesita correr" (1,2 m/s × `T_aviso`) y `R_min` quedan como **recomendación técnica**, no como regla aprobada.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** seguridad de la zona dinámica: cada zona nueva queda dentro de la anterior, nadie necesita recorrer más de `v_paso × T_aviso` (1,2 m/s), el radio mínimo es `R_min` y no se elimina a nadie por la zona.

### D-033 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- Los cazadores que estén fuera de la zona válida **no pueden confirmar capturas** mientras sigan fuera.
- **No se revela** automáticamente su posición a los fugitivos por ese motivo.
- Se implementa solo cuando corresponda al alcance técnico aprobado. **Diferencia con S0:** el motor de S0 no aplica esta regla (los cazadores fuera de la zona no tienen restricciones).

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** un **cazador** fuera de la zona recibe un aviso y no puede capturar, pero **no se expone** a los fugitivos. Solo los fugitivos se exponen.

### D-034 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- El diseño futuro contempla **pistas aproximadas**, con **usos limitados**.
- El escáner **no revela coordenadas exactas** por defecto.
- **No es requisito de S1** y no debe retrasar la prueba de Android.
**Nota:** el "recuento dentro de un radio" de la propuesta original es **una** forma posible de pista aproximada, todavía no elegida.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** el escáner devuelve **solo un recuento** de fugitivos con ubicación `CURRENT` a menos de `R_escaneo`, con cupo y enfriamiento. Queda abierto si se avisa al escaneado.

### D-035 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- Una captura disputada **queda pendiente de resolución**: no elimina automáticamente al fugitivo.
- Debe haber una **vía para resolver la disputa antes de que termine la partida**.
- **No se presupone** un anfitrión con funciones de árbitro: el procedimiento y la **autoridad de resolución** deben quedar explícitos.
- No es necesaria para validar el GPS en S1.
**Nota:** esto **modifica** la propuesta original, en la que el rechazo cerraba la reclamación con un enfriamiento. El procedimiento propuesto para cumplir el texto aprobado está en `GAME_MODES_AND_RULES.md` §9.3 y es una **propuesta**.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** vía de disputa: el rechazo deja la reclamación como "disputada", con enfriamiento por pareja, un recuento visible en el resultado y sin arbitraje del anfitrión (el árbitro queda para el enfoque C). Sin respuesta en 30 s, sigue sin haber captura (pendiente de confirmar).

### D-036 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- Se desea **vibración** y **sonido opcional**.
- **No se garantiza** que el sonido funcione con el móvil silenciado, en segundo plano o con la app suspendida.
- Hay que investigar las restricciones reales de Android y registrar qué puede demostrarse en S1.
- **No se añaden permisos innecesarios** ni se pide acceso que no se vaya a usar.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** avisos con vibración por defecto y sonido opcional, desactivado por defecto y configurable por jugador. Hay que validarlo en dispositivo.

### D-037 · **Aprobada por el propietario (sesión 5)**
**Texto aprobado (propietario, sesión 5):**
- Opciones previstas entre rondas: **sorteo nuevo** o **los primeros fugitivos capturados como cazadores iniciales** de la ronda siguiente.
- La **rotación equilibrada avanzada queda pospuesta**.
- No debe confundirse con el modo **Infección**, donde el capturado cambia de equipo *durante* la misma partida.
- No se implementa en S1.
**Diferencia con S0:** el "intercambiar roles" (`swapRoles`) de S0 **no** está entre las opciones aprobadas. Se conserva en el código de S0 hasta que se implementen las rondas.

**Propuesta original (sesión 4; vale solo en lo que no contradiga el texto aprobado):**
**Decisión:** sustituir "intercambiar roles" por las políticas de ronda (A, B, C y manual), o conservarlo solo como atajo manual.

---

## Sesión 5 · 24/10/2026 (cierre documental y S1)

### D-038 · **Aprobada** (propietario, sesión 5: "Regla general sobre parámetros")
**Decisión:** cualquier valor numérico no aprobado de forma expresa (intervalo de pistas, radios, duración de avisos, tiempo de transición, número de escaneos, límites de jugadores, umbrales de batería, tolerancias de ubicación…) se etiqueta como **hipótesis**, **parámetro experimental** o **decisión pendiente**. Nunca se convierte en regla sin aprobación.

### D-039 · Propuesta (recomendación técnica para S1)
**Decisión:** S1 se hace con una **app Android nativa mínima en Java**, sin dependencias de terceros en tiempo de ejecución. Usa `LocationManager` de la plataforma (`FUSED_PROVIDER`, Android 12+) dentro de un **servicio en primer plano de tipo `location`**, con el permiso "mientras se usa la app" (variante V2 del plan). **Sin transporte de red**: la app no declara el permiso `INTERNET`. Los datos se exportan a un CSV **sin coordenadas** mediante el selector de archivos del sistema.
**Alternativas:** React Native con Expo (requiere cuenta de Expo para compilar en la nube, o el SDK de Android en local, y añade cientos de dependencias de npm) y Kotlin (añade el compilador de Kotlin y su biblioteca estándar).
**Motivo:** la pregunta de S1 es sobre el comportamiento del sistema Android, no sobre la pila final. Cualquier pila (RN o nativa) acabará dependiendo de este mismo mecanismo. D-005 (cliente final) **sigue pendiente**.

### D-040 · Bloqueo (no es una decisión)
**Hecho:** la política de red del entorno **deniega `dl.google.com`**, de donde se descargan el SDK de Android y las herramientas de compilación. Sin el SDK no se puede compilar el APK en este contenedor.
**Opciones (requieren acción del propietario):**
1. Añadir `dl.google.com` a los dominios permitidos del entorno (sin coste).
2. Compilar en el ordenador del propietario con Android Studio (gratuito).

---

## Sesión 6 · 24/10/2026 (demo visual)

### D-041 · Decisión técnica reversible (tomada en la sesión 6, dentro de la autorización del propietario)
**Decisión:** la demo visual es una **web en un solo archivo HTML**, sin dependencias ni red, con un mapa esquemático propio en SVG y una lógica simulada propia (`demo/src/sim.js`), separada del motor de S0.
**Alternativas:** PWA (instalable, pero necesita servirse por HTTPS: sería un despliegue público, no autorizado) y APK con WebView (bloqueado por D-040).
**Motivo:** es la única vía que se abre en el móvil sin coste, sin cuentas y sin desplegar nada. La demo no reutiliza `engine/` porque sus reglas aún no incluyen D-031, D-033, D-034 ni D-035, y el motor no se toca en esta sesión.
**No decide:** el cliente final (D-005), los parámetros (D-038) ni la regla por defecto de las disputas. La demo aplica como **propuesta** "sin resolver = no hay captura" y "sin respuesta en 30 s = no hay captura", y lo dice en pantalla.

---

## Sesión 13 · 25/10/2026 (secuencia de inicio de partida)

### D-042 · **Aprobada** (propietario, sesión 13: "Secuencia de inicio de partida")
**Texto aprobado (resumen fiel):**
1. **Cuenta atrás inicial:** cuando todos están listos y se inicia la partida, cuenta atrás visual de **5 s**, sincronizada entre todos los dispositivos. Durante ella **nadie conoce su rol**.
2. **Revelación de roles:** al terminar la cuenta atrás, cada jugador descubre su rol **individualmente** (FUGITIVO o CAZADOR). Los fugitivos pueden desplazarse inmediatamente; los cazadores permanecen en la zona de salida hasta que termina el tiempo de huida.
3. **Tiempo de huida configurable:** lo elige el creador de la sala antes de iniciar. **Mínimo 2 min; valor por defecto 2 min.** Temporizador visible para ambos equipos; los cazadores ven el tiempo restante y una indicación clara de que deben esperar.
4. **Inicio de la persecución:** cuando el temporizador llega a cero, el **servidor** habilita la persecución para todos los cazadores a la vez. Todos los dispositivos siguen la hora oficial del servidor. Quien se desconecta y vuelve recupera la fase y el tiempo restante, sin reiniciar la partida.
5. **Control del movimiento:** la app puede **advertir** a los cazadores que se alejan de la zona de salida durante el tiempo de huida, teniendo en cuenta la precisión y la antigüedad de las lecturas para no sancionar errores de localización. **No se modifican otras reglas.**

**Implementación (sesión 13):**
- **Motor S0:** cuenta atrás de 5 s (`TIMING.countdownMs`); `countdown_started` ya no lleva los equipos y la instantánea no muestra ningún equipo en `COUNTDOWN`; al terminar, un evento `role_revealed` **por jugador** (solo su rol); `LIMITS.headStartMs.min` = 2 min y `DEFAULTS.headStartMs` = 2 min si el anfitrión no lo indica; aviso `start_zone_warning` / `start_zone_returned` **solo al cazador**, sin coordenadas y **sin sanción**, únicamente con lecturas fiables (recientes, reloj no sospechoso, precisión ≤ `LOCATION.currentMaxAccuracyM`) que queden fuera incluso en el mejor caso (distancia − precisión > radio).
- **Demo:** cuenta atrás de 5 s en tiempo real (no se acelera); rol oculto durante ella (HUD, mapa, panel y textos); tarjeta de revelación «Tu rol: CAZADOR/FUGITIVO» al terminar; tiempo de huida elegible al configurar la sala (2, 3 o 5 min); con el **sorteo automático**, los equipos se sortean **en secreto al empezar** y no se muestran en la sala.

**Interpretaciones y parámetros pendientes (D-038):**
- El **radio de la zona de salida** (50 m) y las opciones de 3 y 5 min de la demo son **experimentales**. El máximo de 10 min sigue siendo una propuesta.
- **Modo manual (D-031):** el anfitrión que asigna los equipos los conoce necesariamente; el resto los descubre al terminar la cuenta atrás. Con preferencias de equipo explícitas en el motor (`set_team_pref`), un jugador puede intuir su rol.
- Tras la revelación, la instantánea del motor sigue mostrando el equipo de todos los jugadores, como antes: D-042 no cambia esa regla.
- En la **demo** el reloj se para mientras se lee la tarjeta (fase 2E). En la partida real manda la hora del servidor: la tarjeta no puede parar el tiempo de huida.
- La demo no puede mostrar el aviso de zona de salida: allí el cazador no se mueve durante la huida.

---

## Plan Maestro v1.0 · 26/10/2026 (contradicciones registradas, sin resolver)

El propietario aportó `THE_OUTRUN_Plan_Maestro_de_Producto_y_Desarrollo.pdf` (v1.0, 26/10/2026; 22 páginas; fuera del repositorio), que se declara «fuente de verdad del diseño» (pág. 2). Contradice varias decisiones de este registro. **Ninguna decisión anterior se modifica ni se borra aquí**: cada contradicción queda abierta hasta que el propietario decida. Lo que sigue son propuestas.

**Análisis de alternativas y recomendaciones (26/10/2026, sin decidir):** `docs/product/DECISIONES_PENDIENTES.md` (D-043 a D-047, el procedimiento pendiente de D-035 y los estados CHECKS, BRIEFING y PAUSED).

### Identificadores del Plan Maestro (`PM-D-xxx`)
El Plan numera sus decisiones D-001 a D-008 (§12.2, pág. 20), igual que este registro pero con otro contenido. Para no confundirlas, en el repositorio se citan con el prefijo **`PM-`**:

| Plan Maestro | Contenido (resumen) | Estado en el Plan | Mismo número aquí |
|---|---|---|---|
| PM-D-001 | Identidad THE OUTRUN, estética oscura/naranja, lema | Fija | D-001: investigar antes de programar |
| PM-D-002 | PWA instalable, salas por código/enlace/QR | Fija; «verificar implementación actual» | D-002: enfoque de producto A/C |
| PM-D-003 | Radio privada por equipos y Mission Report en el producto base | Fija | D-003: sin partidas con desconocidos |
| PM-D-004 | INFECTION, modo completo y prioritario | Fija | D-004: salas privadas gratuitas |
| PM-D-005 | THE RACE, modo independiente | Concepto confirmado; parámetros por validar | D-005: cliente nativo, PWA descartada |
| PM-D-006 | URBAN HUNT es el núcleo; STREET LEGENDS después | Dirección aprobada | D-006: sin chat ni radio en el MVP |
| PM-D-007 | Orden: auditoría, fundamentos, HUNT, RACE, INFECTION… | Plan propuesto base | D-007: alojamiento en la UE |
| PM-D-008 | Proveedor/backend tras auditar el repositorio | Pendiente de evidencia | D-008: solo mayores de 18 |

**Propuesta:** las decisiones nuevas de este registro siguen la numeración propia (D-043…), y las del Plan siempre con `PM-`.

### D-043 · Contradicción pendiente · Radio de equipo
- **Plan:** PM-D-003 y §4.3 (pág. 7): radio privada por equipos, «requisito fijo», P0 (Anexo A); prueba técnica temprana en la PWA real (§9, F1 punto 10).
- **Registro:** D-006 (aprobada en la sesión 2): «sin chat ni radio de equipo en el MVP».
- **Código:** no hay radio ni uso del micrófono. La interfaz dice «Sin chat» (`mobile/www/js/app.js`).
- **Propuesta:** que el propietario confirme si el Plan sustituye a D-006. Si es así, el primer paso es un prototipo técnico aislado (voz por equipo, pulsar para hablar, silencio) en Android y navegador, con su coste por partida, antes de integrarlo. Consecuencias: un servicio de voz (WebRTC con o sin servidor de medios) puede tener coste y exige revisar privacidad (D-007, D-009, D-010).

### D-044 · Contradicción pendiente · Cliente PWA
- **Plan:** PM-D-002 y §1.3 (pág. 3): «la primera experiencia debe ser una web app instalable (PWA)».
- **Registro:** D-005 (propuesta, pendiente): «se descarta una PWA como cliente de juego» porque la ubicación con el móvil bloqueado es imprescindible. H1/H2 eligieron Capacitor (Android) con un servicio nativo que envía la ubicación con la pantalla bloqueada; el navegador deja de enviar con la pantalla apagada (`server/README.md`).
- **Código:** la misma interfaz `mobile/www/` sirve como app Android y como web desde el servidor, pero **no es instalable**: no hay manifest ni service worker.
- **Propuesta:** las dos cosas a la vez, sin reescribir nada: (1) hacer instalable la web servida por el servidor (manifest + service worker mínimo), para entrar por enlace o QR sin instalar nada; (2) mantener la app Android para jugar con la pantalla bloqueada. Hay que decir al jugador de navegador que debe mantener la pantalla encendida. Pendiente de que el propietario lo acepte, porque cambia D-005.

### D-045 · Contradicción pendiente · INFECTION
- **Plan:** PM-D-004 y §5.2 (pág. 9): modo completo, «prioridad alta»; roadmap: Fase 4, después de HUNT (F2) y THE RACE (F3); P1 en el Anexo A.
- **Registro:** D-030 (aprobada en la sesión 5): el primer modo jugable es Clásico; Infección queda como «ampliación futura».
- **Lectura:** son compatibles si «prioritario» significa «el siguiente tras HUNT y RACE» y no «en la primera versión». No hay código de INFECTION; el diseño está en `docs/product/GAME_MODES_AND_RULES.md`.
- **Propuesta:** confirmar el orden HUNT → THE RACE → INFECTION del Plan. No se implementa nada hasta cerrar HUNT (Plan §1.4: no añadir modos antes de una partida completa en dispositivos reales).

### D-046 · Contradicción pendiente · Número de jugadores
- **Plan:** §2.2 (pág. 4): «4-10 jugadores al inicio; no presentar cifras superiores como soportadas hasta probarlas»; §12.1.
- **Registro:** D-019 (propuesta): de 2 a 20 jugadores.
- **Código:** `engine/src/constants.ts` (`minPlayers: 2`, `maxPlayers: 20`); la interfaz muestra «x/20» y el texto «máximo 20».
- **Propuesta:** dejar el motor en 2–20 (las pruebas simuladas cubren hasta 20) y que la interfaz deje de anunciar 20 como capacidad soportada mientras no haya una partida real con 4–10. Decisión del propietario: si el mínimo jugable pasa a 4 (cambia las reglas de inicio) o solo cambia el mensaje.

### D-047 · Contradicción pendiente · Pistas exactas y espectadores
- **Plan:** §5.1 (pág. 9): «la geolocalización no debe revelar automáticamente escondites con precisión falsa»; §3.1 (pág. 5): el observador «no es obligatorio en MVP» y «no debe revelar ubicación… a los jugadores activos».
- **Código:** la pista periódica envía a los cazadores la última posición de cada fugitivo con su precisión y antigüedad (`engine/src/engine.ts`, `doPing`); un capturado ve a todos los activos con 60 s de retraso (`engine/src/view.ts`).
- **Propuesta:** decidir si la pista sigue siendo la posición medida (con su precisión visible, como ahora) o pasa a ser aproximada (D-034), y si los capturados siguen viendo posiciones.

### D-048 · Decisión técnica reversible (26/10/2026) · Enlace de invitación, QR y cambio de código
**Decisión:** implementar lo que el Plan (PM-D-002, §2.2) y el propio repositorio (`MVP_SCOPE.md` M4 y M5; AC-A5 y AC-A6) piden por igual:
- **Enlace:** `https://<servidor>/?sala=<CÓDIGO>`. Solo lleva el código, nunca datos de sesión. Al abrirlo, la web precarga el código en «Unirme» y quita el parámetro de la barra de direcciones.
- **QR:** se genera en el móvil del anfitrión con un codificador propio, sin dependencias (`mobile/www/js/qr.js`), con el mismo enlace.
- **Cambiar el código:** comando del anfitrión `new_code`, solo en la sala de espera y con doble toque para confirmar. El código anterior deja de servir y los jugadores que ya están dentro conservan su sesión.
**Límites:** el enlace abre la **web** (navegador), no la app Android. Abrir la app desde un enlace (App Links) necesita dominio propio y está pendiente (M4). El QR no se ha escaneado todavía con la cámara de un móvil.

### D-049 · Decisión técnica reversible (26/10/2026) · Un salto aislado del GPS no valida una captura
**Motivo:** el Plan Maestro pide «filtrar saltos imposibles… si hay duda, pedir que espere o confirme» (§4.1, pág. 7). Además, considera **fallo** que «un salto GPS aislado valide captura o llegada» (§10, pág. 18). Hasta ahora `claim_tag` usaba solo la última lectura de cada jugador. La velocidad imposible únicamente se **marcaba** tras 3 saltos seguidos (`implausible_speed`).
**Decisión:**
- Cada lectura guardada indica si es un **salto sin confirmar**. Lo es si, desde la lectura anterior, implica una velocidad mayor que `LOCATION.maxPlausibleSpeedMps` (12 m/s). La distancia se cuenta descontando la precisión de las dos lecturas, y el intervalo mínimo es 1 s.
- **No es un salto** si es alcanzable desde la lectura anterior, porque confirma un movimiento real. Tampoco lo es si, cuando la anterior era un salto, es alcanzable desde la última lectura sana: así se descarta un valor atípico aislado.
- `claim_tag` se rechaza con `your_location_unstable` o `target_location_unstable` mientras la última lectura del cazador o del fugitivo sea un salto. El texto pide esperar a la siguiente lectura.
**Qué no cambia:**
- solo se añade un motivo de rechazo;
- no cambian las reglas aprobadas, la autodeclaración, la zona ni la exposición;
- el campo es interno y no se envía a ningún cliente.
**Parámetros:** 12 m/s y el intervalo mínimo de 1 s son **experimentales** (D-038) y hay que calibrarlos en campo. Con lecturas cada 5 s, un salto real retrasa la captura unos 5 s.
**Pruebas:** `engine/test/gps-jump.test.ts` (8, con lecturas simuladas). No se ha probado con GPS real.

### D-050 · Decisión técnica reversible (26/10/2026) · Persistencia opcional de las salas
**Motivo:**
- El Plan Maestro pide persistencia de «sala y configuración, eventos ordenados, resultado» con «retención mínima necesaria» (§8.1, pág. 15).
- Las salas vivían solo en memoria, así que un reinicio del servidor (en el ordenador del organizador, detrás de un túnel) perdía la partida.

**Decisión:**
- Variable opcional `STATE_FILE`. **Sin ella no cambia nada.**
- Con ella, el servidor guarda las salas en un archivo JSON local cada 2 s, si hay cambios, y al apagarse. La escritura es atómica: un archivo temporal y después se renombra.
- Al arrancar las restaura, marca a todos como desconectados y adelanta la numeración de eventos para que los móviles acepten la nueva instantánea.

**Datos que se guardan y que no:**
- **Nunca se guardan:**
  - coordenadas de jugadores: ni las lecturas ni la última pista, que se quitan al guardar y se recuperan con las siguientes lecturas;
  - los secretos de sesión, de los que solo se guarda su hash.
- **Sí se guardan:**
  - nombres e identificadores de instalación;
  - equipos, capturas y respuestas a comandos;
  - la configuración, incluido el centro de la zona y el punto de encuentro.
- El archivo está en el ordenador del servidor. Una sala borrada sale del archivo en el siguiente guardado: una sala terminada dura como mucho la ventana de revancha de 30 min, más 60 s.

**No decide:** el alojamiento definitivo (D-014 / PM-D-008) ni una base de datos. Es un paso mínimo y reversible.

**Pruebas:** `server/test/persistence.test.mjs` (5):
- partida en curso que sigue tras el reinicio y se termina;
- archivo sin coordenadas ni secretos;
- código y sesiones válidos, y sesión falsa rechazada;
- caída con un archivo anterior, donde una mutación del margen de numeración se detecta;
- archivo ilegible;
- sin `STATE_FILE`, nada cambia.

**Corrección (27/10/2026):** en Windows, el guardado fallaba con `EPERM` si otro programa leía el archivo, y se podía perder el guardado final al apagar. Ahora el renombrado se reintenta (`701a328`; detalle en `QUALITY_STATE.md`). **Advertencia de privacidad que faltaba:** la configuración guardada incluye el centro de la zona, que sale de la posición GPS del anfitrión.

**Ampliado (26/10/2026, noche):** `server/test/crash.test.mjs` (3), con el proceso terminado sin aviso y arrancado de nuevo, y una prueba más en `persistence.test.mjs`: un comando reenviado tras el reinicio no se aplica dos veces.

### D-051 · Decisión técnica reversible (26/10/2026, noche) · En el navegador, pantalla encendida y lectura nueva con el móvil quieto
**Motivo:**
- En el navegador, con la pantalla apagada, no se da ni se envía la ubicación (`server/README.md`, «Limitaciones»). El móvil la apaga solo a los pocos segundos.
- Con el móvil quieto (un fugitivo escondido), muchos navegadores apenas entregan lecturas nuevas. La última lectura caduca a los 15 s (`TAG.maxAgeMs`) y entonces nadie puede reclamar esa captura.
- Las dos cosas pueden impedir terminar una partida en el navegador, que es la próxima prueba posible sin compilar Android.

**Decisión (solo en el navegador; la app Android no cambia):**
- Durante la cuenta atrás, la huida y la persecución, la web pide mantener la pantalla encendida (Screen Wake Lock). La suelta al terminar o al salir y la vuelve a pedir al volver a la pestaña. Si el navegador no lo permite, lo dice.
- Si pasan 8 s sin lectura, la web pide una nueva con `getCurrentPosition` (sin caché), sin duplicar peticiones.

**Coste:** más batería en el navegador (pantalla encendida y GPS activo). No está medido.

**Parámetros:** los 8 s son **experimentales** (D-038): están por debajo de los 15 s de antigüedad máxima, contando el reenvío cada 5 s.

**No decide:** el cliente final (D-005 y D-044). Si se aprueba la PWA, estas dos medidas son las que la hacen jugable con la pantalla encendida.

**Pruebas:** `mobile/test/screen.test.mjs` y `game.test.mjs`; `web-flow.e2e.mjs` en Chrome de escritorio (el bloqueo se concede durante la partida). **Sin comprobar en un móvil real.**

### D-052 · Implementación de D-008 y de dos criterios de aceptación (26/10/2026, noche)
**Qué:**
- **D-008 (aprobada):** declaración de edad («Tengo 18 años o más») antes de crear o unirse, una vez por móvil (AC-A1). No es una verificación.
- **AC-B3 (propuesto):** aviso de juego nocturno en la sala de espera, solo informativo. El horario de 21:00 a 7:00 es una **hipótesis** (D-038); la alternativa prevista es la puesta y la salida del sol (`USER_FLOWS.md` F5.6).
- **AC-B4 (propuesto):** «Captura: toque suave, nunca en la calzada» en la tarjeta del rol.

**No cambia** ninguna regla de juego.

---

## Guía de criterio y desarrollo v1.0 · 26/10/2026 (incorporada, contrastes sin resolver)

El propietario aportó `THE_OUTRUN_Guia_de_criterio_y_desarrollo.docx` (v1.0, 26/10/2026). La copia del repositorio, idéntica al original, está en `docs/product/` (SHA-256 `5ef14475…98dbd4`). Es una guía **transversal** de prioridades, riesgos y calidad. **No sustituye** al Plan Maestro, a las reglas, a este registro ni al backlog (guía §1).

Este apartado registra dónde la guía no coincide con otros documentos. **No modifica ninguna decisión.** Análisis y recomendaciones en `docs/product/DECISIONES_PENDIENTES.md`, sección «Contraste con la Guía de criterio».

### D-043 (ampliación) · La radio: requisito fijo o pregunta abierta
- **Plan:** requisito fijo (PM-D-003, §4.3).
- **Guía §13:** pregunta abierta hasta tener evidencia: «¿La radio de equipo mejora la experiencia lo suficiente para justificar su complejidad?».
- **Registro:** D-006 (aprobada): sin radio en el MVP, «se revisará tras las pruebas».
- Hay tres posiciones distintas. Decide el propietario.

### D-045 (ampliación) · El siguiente modo
- **Plan:** el orden es THE RACE (F3) y después INFECTION (F4); INFECTION tiene «prioridad alta» (PM-D-004, PM-D-007).
- **Guía §4 (P2) y §13:** elegir entre THE RACE e INFECTION «por valor demostrado, coste y riesgo», después de las pruebas reales de HUNT.
- Contradicen el orden fijo del Plan. Decide el propietario.

### D-053 · Contradicción pendiente · Pausar o cancelar una partida
- **Guía §7:** «proporcionar una forma clara de pausar o cancelar una partida».
- **Plan §2.3:** PAUSED/DEGRADED «solo para incidencias del sistema cuando sea seguro pausar».
- **Código:**
  - no hay pausa;
  - el anfitrión puede **terminar** la partida sin ganador en la huida o la persecución (`end_game`), que es una forma de cancelar;
  - cualquiera puede abandonar.
- **Pendiente:** si los jugadores (o el anfitrión) pueden pausar, y qué pasa con los tiempos.

### D-054 · Revisión pendiente · Decisiones técnicas tomadas en sesiones autónomas
La guía §11 pide «proponer → autorizar → implementar» en arquitectura, reglas, privacidad y alcance. D-011 (aprobada) exige revisión humana. En las sesiones autónomas del 26/10, con la autorización general del propietario, se implementaron como **decisiones técnicas reversibles**:
- **D-049:** un salto del GPS no valida una captura. Añade un motivo de rechazo de captura.
- **D-050:** persistencia opcional. Guarda nombres, equipos y la zona en un archivo local.
- **D-051:** pantalla encendida y lectura nueva con el móvil quieto en el navegador. Consume más batería y obliga a llevar la pantalla encendida.
- **D-052:** declaración de edad, aviso nocturno y normas en la tarjeta del rol.
- Además: un máximo de 5 salas por dirección, y que los eventos de hace más de 15 s no vuelvan a avisar.

**Pendiente:** que el propietario las confirme o pida revertirlas. Todas están en commits separados y se pueden revertir una a una.

### D-056 · Aprobada · Revancha con sorteo nuevo y equipos visibles al terminar (29/10/2026)
Aprobada por el propietario para el primer playtest. Resuelve el punto de D-037 sobre la revancha y la pregunta abierta de la trazabilidad («decidir si se revelan los equipos al final»).
- **Revancha:** cada revancha es un **sorteo nuevo**. Nadie arrastra su equipo: todas las preferencias vuelven a «Sorteo».
  - El reparto se hace al pulsar «Empezar», antes de la cuenta atrás, con las reglas de siempre (`ceil(n/4)` cazadores y las asignaciones manuales del anfitrión).
  - Solo un cambio de equipos pedido expresamente (`swapRoles`, que la interfaz no usa) fija el contrario.
  - Código: `engine/src/engine.ts` (`rematch`).
- **Equipos al terminar:** en FINISHED, todos ven el equipo de todos. En el resto de fases no cambia nada: cada uno ve el suyo y el de sus compañeros, y en la cuenta atrás ninguno (D-042).
  - Código: `engine/src/view.ts` (`teamVisibleTo`).
- **Correcciones menores aprobadas junto con esta decisión:**
  - **Nombre de quien sale:** quien jugó la partida y sale sigue en la vista de FINISHED (estado `left`), así que el resultado conserva su nombre igual para todos.
  - **Pista sin capturados:** el fugitivo capturado (o que abandona) sale de la última pista guardada; las pistas nuevas ya no lo incluían (GAME_STATE_MACHINE §5.3).
  - **Intervalo de pistas:** tiene que ser menor que la duración de la persecución (`invalid_config`, campo `pingIntervalMs`), con un mensaje claro en la interfaz.
- **Pruebas:**
  - `engine/test/playtest-decisions.test.ts`;
  - `server/test/playtest-decisions.test.mjs`;
  - `mobile/e2e/playtest-ui.e2e.mjs`.

### D-057 · Aprobada · Reconexión, Infección y Fox Hunt en este ciclo (30/10/2026)
Aprobada por el propietario el 30/10/2026, tras el primer playtest físico con cinco personas y la auditoría del ciclo (`QA/ciclo-20261030/INFORME_AUDITORIA.md`). **Modifica D-030 y D-045:** el propietario pide implementar modos en este ciclo; THE RACE sigue fuera.

**1. Presencia y periodo de gracia** (cambia AC-C8 y GAME_STATE_MACHINE §5.2: antes un desconectado seguía en juego indefinidamente).
- **Señal de vida:** cualquier mensaje de la aplicación por WebSocket o una lectura nativa por `POST /api/loc`.
  - No cuentan los pong de la pila de red: el navegador los contesta aunque la página esté congelada.
- **A los 30 s sin señal**, en la huida o la persecución:
  - todos ven al jugador «sin conexión», sin equipo, posición ni hora;
  - al volver, «ha vuelto».
- **A los 5 min sin señal** queda fuera de la partida, con las mismas consecuencias que abandonar:
  - se cancelan sus reclamaciones;
  - sale de la última pista;
  - si el equipo se queda vacío, la partida termina sin ganador (`runners_abandoned` / `hunters_abandoned`).
- **Qué se ve después:**
  - el informe muestra «Sin conexión» en lugar de «Abandonó»;
  - quien vuelve tarde ve una pantalla que se lo explica, recibe el final y puede unirse a la revancha.
- **Excepciones:**
  - el capturado (espectador) no queda fuera;
  - si el final por tiempo coincide, el final va antes;
  - tras reiniciar el servidor o detectar que estuvo suspendido, el plazo empieza de cero para todos.
- **Las reglas de captura y de victoria no cambian.**

**2. Infección** (parámetros que faltaban en GAME_MODES_AND_RULES §3, propuesta completa aprobada):
- mínimo 4 jugadores;
- cazadores iniciales `max(1, floor(n/4))`;
- el convertido no puede capturar durante 60 s;
- el convertido no recibe la última pista ya emitida, solo las siguientes;
- si caen todos, ganan los cazadores, convertidos incluidos;
- el informe muestra la cadena de contagio y el último superviviente.

**3. Fox Hunt, variante «Mr. X»** (opción aprobada):
- el zorro ve a los cazadores;
- los cazadores reciben la posición exacta del zorro cada pocos minutos.
- **Lectura concreta**, documentada aquí y no elegida en silencio:
  - un único zorro (fugitivo) contra el resto (cazadores);
  - el zorro ve en directo a los cazadores activos;
  - los cazadores reciben su posición en cada pista, con el intervalo de la sala;
  - los cazadores se ven entre sí;
  - si capturan al zorro, ganan los cazadores; si se acaba el tiempo, gana el zorro;
  - zona, exposición, captura y confirmación, como en Clásico;
  - mínimo 3 jugadores.
- **Consecuencia aceptada:** rompe en este modo la norma «los fugitivos nunca ven cazadores» (GAME_MODES_AND_RULES §6.5).
- **Sardines** queda aplazado.

**4. Pantalla de inicio:**
- solo se muestran los modos jugables;
- nada de «Próximamente»;
- fuentes del sistema, sin fuente web.

**Implementación y revisión (30/10/2026, mismo día):**
- **Código:**
  - presencia y periodo de gracia: `engine.ts` (`seen`, `away`, `absence_timeout`, `withdraw`) y `server/hub.ts` (`seen()`, `checkSuspended`);
  - modos: `engine/src/modes.ts`;
  - cliente: `net.js`, `app.js` y `game-view.js`.
- **Cambios de detalle que siguen de la regla aprobada** (revisión independiente):
  - **Pista y conversión:** la pista va a los cazadores activos en ese instante, así que un convertido en el mismo paso no la recibe.
  - **Salir tras el final:** quien sale de la sala después del final no figura como «abandonó» (`leftReason: 'after_end'`).
  - **Atribución en la espera:** una autodeclaración no se atribuye a un convertido en su espera.
  - **Versión de reglas:** Clásico pasa a `clasico/2026-10-30`, porque el periodo de gracia puede cambiar el resultado.
- **Fox Hunt:**
  - con menos de 3 jugadores en la cuenta atrás, se vuelve a la sala;
  - en modos con cazadores exactos, `swapRoles` da un sorteo nuevo.
- **Pantalla de inicio:**
  - modos jugables seleccionables;
  - reglas del modo elegido;
  - error junto a su campo;
  - botones bloqueados mientras conecta;
  - con invitación, un solo botón principal;
  - se puede pegar el enlace entero en el código.
- **Informe del ciclo:** `QA/ciclo-20261030/INFORME_CICLO.md`.
