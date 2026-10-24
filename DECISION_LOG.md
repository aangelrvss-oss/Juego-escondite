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

### D-030 · Propuesta (requiere aprobación: **cambia una decisión aprobada en la sesión 2**)
**Decisión propuesta:** incluir en el MVP la zona dinámica (opcional por sala), la asignación con proporción, las opciones de ronda A y B, las disputas, el modo **Infección** (segundo modo) y el escáner mínimo. El orden de implementación está en `MVP_SCOPE.md` §6. S1 no cambia.
**Conflicto:** la sesión 2 aprobó dejar fuera "los modos alternativos que no sean necesarios para validar el núcleo". Incluir la Infección exige que el propietario cambie esa decisión. La exclusión de la zona dinámica, en cambio, solo era una propuesta.
**Alternativa:** un MVP solo con Clásico y zona dinámica, dejando la Infección y el escáner para la primera ampliación.

### D-031 · Propuesta
**Decisión:** límites seguros: siempre ≥ 1 cazador y ≥ 1 fugitivo. En Clásico, cazadores ≤ `floor(n/2)`. En Infección, cazadores iniciales ≤ `max(1, floor(n/4))`. Proporciones predefinidas: 1/5, 1/3 y 1/2 (esta última solo en Clásico).

### D-032 · Propuesta
**Decisión:** seguridad de la zona dinámica: cada zona nueva queda dentro de la anterior, nadie necesita recorrer más de `v_paso × T_aviso` (1,2 m/s), el radio mínimo es `R_min` y no se elimina a nadie por la zona.

### D-033 · Propuesta (resuelve la incoherencia señalada en D-023)
**Decisión:** un **cazador** fuera de la zona recibe un aviso y no puede capturar, pero **no se expone** a los fugitivos. Solo los fugitivos se exponen.

### D-034 · Propuesta
**Decisión:** el escáner devuelve **solo un recuento** de fugitivos con ubicación `CURRENT` a menos de `R_escaneo`, con cupo y enfriamiento. Queda abierto si se avisa al escaneado.

### D-035 · Propuesta
**Decisión:** vía de disputa: el rechazo deja la reclamación como "disputada", con enfriamiento por pareja, un recuento visible en el resultado y sin arbitraje del anfitrión (el árbitro queda para el enfoque C). Sin respuesta en 30 s, sigue sin haber captura (pendiente de confirmar).

### D-036 · Propuesta (contradicción con M15)
**Decisión:** avisos con vibración por defecto y sonido opcional, desactivado por defecto y configurable por jugador. Hay que validarlo en dispositivo.

### D-037 · Propuesta (contradicción con S0 y con F13)
**Decisión:** sustituir "intercambiar roles" por las políticas de ronda (A, B, C y manual), o conservarlo solo como atajo manual.
