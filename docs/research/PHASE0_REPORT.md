# Informe de la fase 0: propuestas preliminares

**Fecha:** 24 de octubre de 2026
**Estado:** borrador para aprobación. **La implementación no ha comenzado.**
**Base de evidencia:** [`COMPETITIVE_ANALYSIS.md`](./COMPETITIVE_ANALYSIS.md). Las etiquetas [V]/[I]/[H]/[P] significan lo mismo que allí.

> **Nota de la sesión 2 (24/10/2026):** este informe se conserva como registro histórico. Varios puntos están **superados** por decisiones posteriores. La versión vigente está en `DECISION_LOG.md` (D-008 a D-019), `docs/product/` y `docs/technical/`. En particular:
> - La edad mínima ya no está pendiente: **solo mayores de 18** (D-008).
> - El "servicio en primer plano en Android y modo en segundo plano 'mientras se usa la app' en iOS" del §2 **no está garantizado con el `expo-location` estándar**, que exige el permiso "Siempre". Ver D-013 y `TECHNICAL_SPIKE_PLAN.md` §1.
> - El "límite de jugadores gratis por definir" se sustituye por salas privadas gratuitas (D-004) y un límite técnico propuesto de 20 jugadores (D-019).
> - El servidor recomendado ya no es "servidor propio frente a Supabase+worker", sino D-014.

Este documento recoge los puntos 7, 8 y 9 de la primera tarea: tres enfoques de producto, un MVP recomendado y las decisiones técnicas y de costes que hay que investigar. **No sustituye** a los entregables de las fases 1 a 3 (`PRODUCT_STRATEGY.md`, `MVP_SCOPE.md`, `ARCHITECTURE.md`…), que se redactarán cuando se aprueben las decisiones de abajo.

---

## 1. Tres enfoques de producto

### A. "Escondite clásico, pulido y gratis para empezar"

Un único modo de cazadores contra corredores con pings, zona y ventaja, ejecutado mejor que la competencia: se organiza gratis para grupos pequeños, se entra como invitado con enlace o QR, todo está en español y funciona de forma fiable en Android.

### B. "Plataforma de modos"

Muchos modos (infección, asesino, sardinas, polis y cacos, bote-bote…) con objetos y poderes. Va de frente contra HideZone.

### C. "Juego urbano organizado"

El núcleo es el modo clásico de A más un **kit para organizadores**: árbitro con vista global, plantillas de zonas seguras, torneos por rondas, grupos grandes y packs de pago para asociaciones, scouts, colegios mayores, empresas, despedidas y cumpleaños. Las partidas públicas solo llegarían a través de **eventos con anfitrión verificado** y punto de encuentro físico, nunca por emparejamiento abierto.

### Comparativa

| Criterio | A. Clásico pulido | B. Plataforma de modos | C. Juego organizado |
|---|---|---|---|
| Diferenciación frente a SCRAM | Media (precio, activación, idioma) | Alta frente a SCRAM, **baja frente a HideZone** | **Alta**: nadie lo hace bien |
| Diferenciación frente a HideZone | Baja o media | Baja (ya tiene 9 modos) | Alta |
| Viabilidad técnica del MVP | Alta | Baja (cada modo multiplica las pruebas en campo) | Media (A más permisos de rol y vista de árbitro) |
| Riesgo de seguridad | Medio | Alto (más mecánicas de persecución) | **El más bajo por diseño** (adultos responsables y eventos con supervisión) |
| Monetización | Débil (cosméticos o pase) | Freemium con créditos, con quejas documentadas | **Más clara**: B2B y organizadores, con disposición a pagar documentada en gymkanas (10–30 €/persona en Madrid) |
| Masa crítica | Depende de grupos de amigos | Igual | Un organizador trae de 10 a 50 jugadores de golpe |
| Encaje con Madrid primero | Medio | Bajo | **Alto** (asociaciones, universidades, ocio en grupo) |

### Recomendación: A como núcleo y C como dirección

1. **MVP = A**: un ciclo de juego impecable para grupos privados, con seguridad desde el diseño. Sin esto, nada más importa.
2. **Arquitectura preparada para C desde el primer día**: roles (anfitrión, árbitro, jugador), configuraciones guardables y eventos con varias rondas. Construir el kit de organizador después de validar el núcleo con grupos reales.
3. **B se descarta como estrategia.** Se podrían añadir uno o dos modos de raíz española más adelante si las pruebas indican que mejoran la retención.

---

## 2. MVP recomendado

**Objetivo:** que un grupo de 3 a 15 personas en Madrid pueda **instalar, crear una sala, entrar y terminar una partida real** en menos de 5 minutos de preparación [H: el umbral exacto se validará], y quiera repetir.

### Dentro del alcance

| Área | Funcionalidad |
|---|---|
| Acceso | Entrar como invitado (nombre más un identificador anónimo del dispositivo). Cuenta opcional y posterior (Apple o Google) para guardar el historial |
| Salas | Crear sala gratis (límite de jugadores gratis por definir [P]). Código corto, **enlace profundo y QR**. Sala de espera con jugadores conectados. Expulsar antes de empezar. Caducidad automática |
| Configuración | Duración, ventaja, intervalo de ping, zona circular y modo de equipos (aleatorio equilibrado o elegido). **Ajustes predefinidos** ("Parque 30 min", "Barrio 60 min") |
| Seguridad de la zona | Avisos al dibujar la zona si cruza vías principales o agua (datos de OpenStreetMap [H: viabilidad por validar]). Punto de encuentro obligatorio. Recordatorio de normas antes de empezar. Aviso si se juega de noche |
| Juego | Máquina de estados en servidor (Lobby → Countdown → HeadStart → Active → Finished/Cancelled). Pings generados en el servidor. Cada equipo ve a los suyos en directo. Visible en directo fuera de la zona (con periodo de gracia) |
| Captura | **Doble confirmación**: el atrapado confirma, o el cazador la declara y el atrapado tiene X segundos para disputarla, y además debe haber **proximidad GPS compatible** según la precisión. Evita forcejeos y trampas [H: diseño por validar en campo] |
| Ubicación | Solo durante la ronda. Servicio en primer plano en Android y modo en segundo plano "mientras se usa la app" en iOS. Estados: actual, antigua y no disponible. Precisión visible |
| Avisos | Notificaciones push que solo vibran: ping, fin de la ventaja, captura y fin de la ronda |
| Final | Pantalla de resultados, **revancha con la misma sala** y salida voluntaria. Reconexión tras perder cobertura |
| Privacidad | Datos en la UE [P: confirmar con el proveedor]. Ubicaciones borradas al terminar la partida (plazo exacto por definir [P]). Sin recorridos guardados en el MVP |
| Moderación mínima | Expulsar en la sala de espera. Bloquear y denunciar a un jugador. **Sin chat en el MVP** (reduce obligaciones y riesgo; se juega con amigos que ya tienen WhatsApp) [H] |

### Fuera del MVP (más adelante)

Chat o radio de equipo · partidas públicas y descubrimiento · eventos y kit de organizador (fase siguiente) · zona que se reduce [P: valorar si entra, porque es barata y aporta mucho al desenlace] · historial y recorridos · tarjetas para compartir · rangos y logros · modos alternativos · Apple Watch · pagos.

### Criterio de éxito del MVP [H: umbrales a fijar en la fase 1]

- Porcentaje de salas creadas que llegan a terminar una partida.
- Tiempo desde la instalación hasta el inicio de la primera partida.
- Porcentaje de grupos que juegan una segunda ronda (revancha) el mismo día.
- Incidencias técnicas por partida (pings que no llegan, desconexiones).

---

## 3. Arquitectura técnica: recomendación preliminar

> Se trata de una recomendación para orientar la investigación de la fase 3, **no de una decisión**. Cada punto tendrá su ADR.

### Cliente

| Opción | A favor | En contra | Valoración |
|---|---|---|---|
| **React Native con Expo (development build)** | Un solo código para Android e iOS. `expo-location` con TaskManager, notificaciones y OTA. Ecosistema TypeScript compartido con el servidor. [I] SCRAM parece usarlo y es la categoría que nos interesa | Hay que usar una development build (no Expo Go) para la ubicación en segundo plano. Hay que probar a fondo las capas Android de los fabricantes | **Recomendada para investigar primero** |
| Flutter | Buen rendimiento y una interfaz muy controlable | Otro lenguaje (Dart) y menos código compartido con el servidor | Alternativa sólida |
| PWA | Sin tienda y entrada instantánea por enlace | **No es fiable para la ubicación con el móvil bloqueado** (el navegador suspende la geolocalización en segundo plano, sobre todo en iOS) [V: comportamiento conocido de las plataformas; volver a comprobarlo en la fase 3] | **Descartada como app de juego.** Útil como página de invitación o espectador |

### Servidor

Requisitos: estado autoritativo, temporizadores precisos (pings, fin de la ventaja), tiempo real, autenticación anónima, alojamiento en la UE y coste bajo con pocos usuarios.

| Opción | A favor | En contra |
|---|---|---|
| Servidor propio en TypeScript (WebSockets) con PostgreSQL y Redis, en un proveedor de la UE | Control total de la máquina de estados y los temporizadores. Datos en la UE. Coste predecible | Más operación (despliegue, escalado, observabilidad) |
| Supabase (Postgres, Realtime, Auth y Edge Functions, región UE) | Rápido de montar. Postgres estándar. Región UE disponible [P: confirmar] | Los temporizadores de juego a nivel de segundo no encajan con naturalidad. Habría que añadir un proceso propio |
| Convex | Programación de tareas y tiempo real integrados. [V] Lo usa SCRAM | [P] Disponibilidad de región UE y dependencia del proveedor |
| Firebase | Muy maduro y con buen SDK móvil | Lógica autoritativa más incómoda. Más dependencia de Google |

**Propuesta para la fase 3:** hacer una *prueba técnica corta* (spike) que compare un servidor propio con Supabase+worker usando la misma máquina de estados en un paquete TypeScript compartido, y medir latencia, complejidad y coste.

### Mapas

| Opción | Nota |
|---|---|
| Mapas nativos (Google Maps SDK en Android y Apple Maps en iOS) con `react-native-maps` | [V] Lo que usa SCRAM. Coste del SDK móvil de Google por confirmar [P] |
| MapLibre con teselas de un proveedor (MapTiler, Stadia) o propias (Protomaps) | Más control del estilo (identidad visual) y menos dependencia. Coste por cargas de mapa [P] |

Con cualquiera de los dos hay que respetar la atribución (OpenStreetMap, Google o Apple).

---

## 4. Costes y decisiones que hay que investigar antes de elegir proveedor

**No se ha contratado ni gastado nada.** No damos cifras inventadas. Lo que sigue es lo que hay que presupuestar.

| Partida | Dato conocido | Pendiente |
|---|---|---|
| Cuenta de Apple Developer | Cuota anual (precio público, a confirmar) | Necesaria para TestFlight y para publicar en iOS |
| Cuenta de Google Play Console | Pago único de alta (a confirmar) | Formulario de ubicación y servicio en primer plano. Ficha de seguridad de datos |
| Comisión de las tiendas | Comisión reducida para desarrolladores pequeños (a confirmar en las condiciones actuales) | Solo si hay pagos dentro de la app |
| Servidor y base de datos | — | Coste por partida: mensajes por jugador y minuto según el intervalo de envío de la ubicación |
| Mapas | — | Precio por carga o por usuario activo mensual en el volumen previsto |
| Notificaciones push | Normalmente sin coste directo (APNs/FCM) | Servicio intermedio (Expo u otro) y sus límites |
| Correo electrónico | Solo si hay cuentas con correo | Evitarlo en el MVP |
| Informes de fallos | — | Plan gratuito o de pago (Sentry u otro) |
| Asesoría legal | — | Privacidad, términos, menores y Reglamento de Servicios Digitales. Imprescindible antes del lanzamiento público |
| Seguro de responsabilidad civil | — | Para eventos organizados por nosotros |
| Marca y dominio | — | Búsqueda en EUIPO/OEPM y registro |
| Dispositivos de prueba | — | Al menos un Android de gama media con capa agresiva (Xiaomi o Samsung) y un iPhone |

---

## 5. Experimentos baratos de validación (antes o en paralelo al desarrollo)

| # | Experimento | Coste | Qué valida |
|---|---|---|---|
| E1 | 2 o 3 partidas "en analógico" en Madrid con amigos, usando SCRAM y HideZone (o ubicación compartida de WhatsApp como sustituto) | Bajo | Si se divierten, qué falla y si repiten. Duración y tamaño de zona ideales en Madrid |
| E2 | Entrevistas a 5–8 organizadores (asociaciones juveniles, scouts, colegios mayores, empresas de gymkanas) | Bajo | Si el kit de organizador interesa y cuánto pagarían |
| E3 | Página de aterrizaje en español con lista de espera y 2 vídeos cortos | Bajo (requiere aprobar el gasto en dominio) | Interés y qué segmento responde |
| E4 | Prueba técnica de ubicación con la pantalla bloqueada en un Xiaomi o Samsung y un iPhone | Bajo | El mayor riesgo técnico, antes de comprometer la arquitectura |
