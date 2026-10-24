# Plan de la prueba técnica: ubicación con el móvil bloqueado

**Versión:** 1.0 · 24/10/2026
**Estado:** diseño **[PENDIENTE de aprobación]**. **Nada de lo que sigue está medido todavía.** Las cifras son requisitos o estimaciones, nunca resultados.
**Pregunta que responde:** *¿Podemos mantener una partida geolocalizada sincronizada, fiable y razonablemente eficiente en batería cuando los jugadores bloquean sus móviles?*

Etiquetas: [V] verificado en una fuente (24/10/2026), [I] inferencia, [H] hipótesis, [P] pendiente de verificar.

---

## 1. Hallazgos que condicionan el diseño

| # | Hallazgo | Etiqueta y fuente |
|---|---|---|
| 1 | La documentación de `expo-location` (SDK 55–58) dice que, para seguir la ubicación en segundo plano con `startLocationUpdatesAsync`, **hay que pedir el permiso de primer plano y el de segundo plano en Android**, y en iOS el permiso **"Siempre"** con `requestBackgroundPermissionsAsync` | [V] docs.expo.dev/versions/v55.0.0/sdk/location y v58 (vía resultados de búsqueda; no hemos podido abrir la página directamente). Hilos de forums.expo.dev lo confirman en versiones antiguas |
| 2 | En Android, un **servicio en primer plano de tipo `location`** puede recibir ubicaciones con la app en segundo plano **sin** `ACCESS_BACKGROUND_LOCATION`, siempre que se inicie con la app visible y el usuario haya concedido la ubicación precisa o aproximada. Si la app apunta a Android 14 o superior, necesita además `FOREGROUND_SERVICE_LOCATION`. Todos los tipos de servicio en primer plano se revisan en Google Play | [V] Ayuda de Play Console (support.google.com/googleplay/android-developer/answer/16965181) y guía del SDK de HERE |
| 3 | Pedir `ACCESS_BACKGROUND_LOCATION` supone una **revisión más estricta en Google Play** y una justificación | [V] Guía de HERE y guía de Radar sobre la aprobación en Play |
| 4 | En iOS, la ubicación en segundo plano exige `UIBackgroundModes: location` y `allowsBackgroundLocationUpdates = true`. **No hemos encontrado una fuente de Apple que confirme** que basta con el permiso "Al usar la app" si las actualizaciones se inician en primer plano (fuentes secundarias dicen que sí, con el indicador azul) | [V] el requisito, [H] el comportamiento con "Al usar la app" |
| 5 | SCRAM afirma que en Android basta con "Permitir solo mientras se usa la app" para jugar con el móvil bloqueado | [V] página de soporte de SCRAM. [I] Probablemente usan un servicio en primer plano propio y no el `startLocationUpdatesAsync` estándar |
| 6 | Las capas de algunos fabricantes (Xiaomi y otros) cierran procesos en segundo plano. SCRAM recomienda poner la batería en "Sin restricciones" | [V] página de soporte de SCRAM |

**Consecuencia:** con React Native y Expo "tal cual", seguramente tendríamos que pedir "Permitir siempre". Es una fricción para el jugador y un riesgo en la revisión de las tiendas. Por eso la prueba compara **dos variantes de cliente** (§3.2).

---

## 2. Comparativa de arquitecturas

### 2.1 Cliente

| Opción | Segundo plano Android | Segundo plano iOS | Pros | Contras | Valoración |
|---|---|---|---|---|---|
| **React Native con Expo y `expo-location`** (V1) | Sí, con permiso "Siempre" [V] | Sí, con permiso "Siempre" [V] | Lo más rápido de montar. Mantenido por Expo | Fricción del permiso "Siempre" y revisión estricta en Play | **Referencia en la prueba** |
| **React Native con Expo y un módulo nativo propio** (V2): servicio en primer plano en Kotlin y `CLLocationManager` en Swift | Sí, con "Mientras se usa la app" [V para la plataforma, H para nuestra implementación] | Probablemente sí, con "Al usar la app" [H] | Permiso más amigable. Control total del intervalo y la batería | Código nativo que mantener (pequeño, unas 200–400 líneas [H]) | **Candidata principal** |
| React Native con una librería comercial (Transistorsoft background-geolocation) | Sí | Sí | Muy madura | **Licencia de pago para compilaciones de producción**, al menos en Android [V]. Precio no verificado | Descartada por presupuesto |
| Flutter (`geolocator` u otras) | Hay opción de notificación en primer plano [P: sin verificar si funciona sin el permiso de segundo plano] | [P] | Buen rendimiento | No comparte código con un servidor en TypeScript. El problema de fondo es el mismo | Alternativa si fallan V1 y V2 |
| Nativo puro (Kotlin + Swift) | Sí | Sí | Máximo control | Dos aplicaciones que mantener | Solo si fallan las anteriores |
| PWA | No es fiable con la pantalla bloqueada | No es fiable | Sin tiendas | Incumple el requisito central | **Descartada** para jugar |

**Recomendación [PENDIENTE]:** React Native con Expo (development build), con un **módulo de ubicación propio (V2)**, usando V1 como referencia de comparación. No elegimos por popularidad, sino porque: (a) el problema real está en el código nativo de ubicación, que en V2 controlamos; (b) el motor y el protocolo en TypeScript se comparten con el servidor; (c) Expo Modules permite escribir el módulo nativo dentro del mismo proyecto.

### 2.2 Servidor

Requisitos: un actor autoritativo por partida, temporizadores al segundo, WebSockets, reconexión, coste cero o casi cero, datos en la UE y poca dependencia del proveedor.

**Decisión de diseño previa (independiente del proveedor):** el motor del juego será un **paquete TypeScript puro y determinista** (reloj inyectado, sin E/S), probado con tests unitarios. El proveedor solo aporta un *adaptador* fino (transporte, temporizador y almacenamiento). Así se limita la dependencia de un proveedor concreto.

| Opción | Encaje con el motor | Región UE | Coste (pruebas y MVP) | Dependencia | Valoración |
|---|---|---|---|---|---|
| **Cloudflare Workers con Durable Objects** | **Muy alto**: un objeto por partida, procesamiento en serie, `alarm()` como temporizador y WebSockets con hibernación | Opción de jurisdicción UE para Durable Objects [P: sin verificar en esta sesión] | Plan gratuito: unas 100.000 peticiones al día y 13.000 GB-s al día [V: fuentes secundarias; **hay contradicción** sobre si Durable Objects está en el plan gratuito] | Media (solo afecta al adaptador) | **Candidata principal**, sujeta a 2 verificaciones |
| **Servidor Node propio (WebSocket) en un VPS de la UE** | Muy alto (proceso propio, temporizadores en memoria y persistencia mínima) | Sí: Hetzner en Alemania (Falkenstein, Núremberg) [V: terceros] | Hetzner CX23 a unos 3,99 €/mes sin IVA, unos 4,83 € con IVA [V: terceros, precio tras la subida de abril de 2026; confirmar] | Baja | **Plan B**. Necesita autorizar el gasto |
| Supabase (Postgres, Realtime, Auth anónima) | Medio: la autoridad estaría en funciones de Postgres, pero los temporizadores al segundo necesitan `pg_cron` o un proceso aparte [P] | **Sí: Frankfurt, París e Irlanda** [V: supabase.com/regions] | Gratis: 200 conexiones Realtime simultáneas y 2 millones de mensajes al mes. Los proyectos gratuitos **se pausan tras 7 días sin actividad**. Pro: 25 $/mes [V: terceros y la página de precios] | Media | Alternativa. Útil más adelante para persistencia y cuentas |
| Convex | Alto (tareas programadas y tiempo real). [V] Es lo que usa SCRAM | **No hemos encontrado región UE** [P] | [P] | Alta | Descartada mientras no se confirme una región UE |
| Firebase (Firestore/RTDB y Functions) | Medio-bajo: los temporizadores necesitan Functions o tareas programadas | Tiene regiones europeas [P: sin verificar en esta sesión] | Las Functions requieren el plan de pago por uso (Blaze) [P] | Alta | Descartada para el motor |

**Recomendación [PENDIENTE]:**
1. Motor en TypeScript puro (sin dependencia de proveedor).
2. Alojamiento para la prueba en **Cloudflare Durable Objects**, si al crear la cuenta gratuita se confirma que (a) Durable Objects con SQLite está en el plan gratuito y (b) existe la jurisdicción UE. Se puede probar en local con `wrangler dev` y Miniflare sin desplegar.
3. Si alguna de las dos verificaciones falla: **servidor Node propio** con el mismo motor. Para la prueba podría correr en el ordenador del propietario con un túnel gratuito, o en Hetzner (unos 4,83 €/mes, con autorización).

### 2.3 Mapas

| Opción | Coste | Condiciones | Valoración |
|---|---|---|---|
| **MapLibre con teselas de OpenFreeMap** | 0 €, sin clave, sin límite de vistas, uso comercial permitido [V: openfreemap.org] | **Sin garantía de servicio** ("as-is"). Hay que mostrar la atribución de OpenStreetMap. No incluye búsqueda de direcciones | **Recomendada para la prueba y el MVP** |
| MapLibre con PMTiles propias (Protomaps) en almacenamiento de objetos | Casi 0 € [P] | Más trabajo inicial y control total | Plan B si OpenFreeMap falla |
| SDK nativo de Google Maps (Android) y Apple Maps (iOS) | 0 $ por carga de mapa (Mobile Native Dynamic Maps) y uso ilimitado [V: developers.google.com] | Requiere una cuenta de facturación de Google Cloud. Street View se cobra aparte | Alternativa válida. Más dependencia de Google |
| MapTiler o Stadia | Con planes gratuitos limitados [P] | Condiciones de uso comercial por verificar | No se necesitan por ahora |

**En la prueba el mapa no es imprescindible:** se medirá con y sin mapa en pantalla.

### 2.4 Otros componentes

| Componente | Opción | Coste | Estado |
|---|---|---|---|
| Compilar la app Android | EAS Build (plan gratuito: 15 compilaciones Android y 15 iOS al mes) o compilación local | 0 € | [V: expo.dev/pricing vía búsqueda] |
| Instalar en Android | APK instalado directamente, sin Play Store | 0 € | — |
| Instalar en iPhone | Requiere el **Apple Developer Program (99 $/año)** o un **Mac con Xcode** y aprovisionamiento gratuito (perfiles de corta duración) | 0–99 $ | [V] precio de 99 $/año. [P] condiciones del aprovisionamiento gratuito |
| Notificaciones push | FCM/APNs (más el servicio de Expo, opcional) | 0 € sin coste directo [P: límites] | — |
| Publicar en tiendas | Google Play: 25 $ una vez. Apple: 99 $/año | **No hace falta para la prueba** | [V: terceros] |

---

## 3. Diseño de la prueba

### 3.1 Alcance mínimo

**Se construye:**
- `engine/`: máquina de estados reducida (LOBBY → COUNTDOWN → HEAD_START → ACTIVE → FINISHED), comandos `join`, `ready`, `start`, `location`, `claim_tag`, `self_tag` y `end_game`, con sus eventos.
- `server/`: adaptador (Durable Objects o Node) con WebSocket, sincronización de reloj, `resume` y un contador de mensajes.
- `app/`: una sola pantalla de diagnóstico (sin pulir) con estado de conexión, estado de la partida, última muestra (precisión y antigüedad), cola sin enviar, batería y un interruptor V1/V2. Exporta un CSV con sus propias muestras.
- `bot/`: cliente simulado en Node, **marcado siempre como SIMULADO** en los resultados.

**No se construye:** diseño visual, cuentas, QR, revancha, avisos completos ni ningún otro elemento de interfaz. Es código desechable; solo se conservarán el motor y el módulo de ubicación si pasan la revisión.

### 3.2 Variantes del cliente

| Variante | Permisos que pide | Mecanismo |
|---|---|---|
| **V1** | Android: preciso + segundo plano ("Permitir siempre"). iOS: "Siempre" | `expo-location` `startLocationUpdatesAsync` con `foregroundService` |
| **V2** | Android: preciso, "Mientras se usa la app". iOS: "Al usar la app" | Módulo propio: servicio en primer plano de tipo `location`, iniciado desde la app visible, con FusedLocationProvider en Android. `CLLocationManager` con `allowsBackgroundLocationUpdates` en iOS |

Política de envío en ambas: **un fix cada 5 s por tiempo** (sin filtro de distancia durante la prueba, para poder medir), con prioridad de alta precisión. Envío inmediato si hay conexión y cola local si no la hay.

### 3.3 Etapas y requisitos

| Etapa | Qué | Necesita | Coste |
|---|---|---|---|
| **S0** | Motor, servidor local y bots en este contenedor. Pruebas de autoridad, idempotencia, visibilidad, tiempos y seguridad | Instalar dependencias de npm (requiere autorización al empezar la sesión) | 0 € |
| **S1** | Android real del propietario + 1 bot (SIMULADO) contra el servidor publicado | Cuenta gratuita de Expo, cuenta gratuita del proveedor de servidor y el Android | 0 € |
| **S2** | 2 Android reales (si se consigue un segundo móvil) en una partida por la calle | Segundo dispositivo y 2 personas | 0 € |
| **S3** | iPhone prestado | Mac o Apple Developer Program (decisión del propietario) | 0–99 $ |

**No se declarará validado iOS sin S3.**

---

## 4. Pruebas y criterios definidos antes de ejecutar

Los umbrales son **[H]**: se fijan ahora para no ajustarlos a posteriori. En la columna "Tipo", D = dispositivo real, S = simulado.

| ID | Prueba | Procedimiento | Métrica | Aprueba si | Falla si |
|---|---|---|---|---|---|
| T01 | Dos clientes en la misma sala | Crear la sala y unirse (D+S en S1, D+D en S2) | Éxito y tiempo | Ambos ven la lista en ≤ 2 s | Errores o > 5 s |
| T02 | Sincronización de estado | 20 transiciones, registrando `server_ts` y la hora de llegada al cliente (con reloj corregido) | Latencia p50 y p95 | p95 ≤ 1 s con 4G | p95 > 3 s |
| T03 | Visibilidad autorizada | Bot cazador durante `HEAD_START` y `ACTIVE`. Registrar todo lo que recibe | Mensajes no autorizados | 0 | ≥ 1 (**bloqueante**) |
| T04 | Actual / antigua / no disponible | Cortar el GPS (interior o modo avión) 3 min y observar el estado en el otro cliente | Tiempo hasta STALE y UNAVAILABLE | Cambia en ≤ 20 s y ≤ 125 s | No cambia, o una posición antigua se muestra como actual |
| T05 | **Pantalla bloqueada, Android** | V1 y V2 por separado: bloquear 30 min caminando. Ajustes de batería por defecto del fabricante | % de muestras recibidas sobre las esperadas (360) y hueco máximo | ≥ 80 % y hueco ≤ 30 s | < 50 % o el proceso muere |
| T05b | Igual con el ahorro de batería activado | Igual | Igual | Documentar (informativo) | — |
| T06 | **Pantalla bloqueada, iOS** (S3) | Igual que T05 | Igual | Igual | Igual |
| T07 | Pérdida y recuperación de cobertura | Modo avión 60 s durante `ACTIVE` | Tiempo hasta resincronizar, eventos perdidos o duplicados, muestras en cola marcadas como antiguas | ≤ 10 s, 0 perdidos, 0 duplicados | > 30 s o se pierden o duplican eventos |
| T08 | Cierre forzado y reapertura | Forzar el cierre y reabrir | Vuelve a la partida con el estado correcto | Sí, ≤ 10 s | No |
| T09 | Autoridad del tiempo | Cambiar el reloj del móvil ±10 min | Transiciones a su hora en el servidor | Sí | No (**bloqueante**) |
| T10 | Comandos maliciosos | Bot: `end_game` sin ser anfitrión, transición anticipada, `claim_tag` lejos, con posición antigua, repetido, contra un fugitivo ya capturado o fuera de `ACTIVE` | Comandos aceptados | 0 | ≥ 1 (**bloqueante**) |
| T11 | Batería | 60 min con la pantalla apagada en V2 (y V1 si V2 falla). Base: 60 min con la app cerrada, en condiciones parecidas | %/h atribuible (diferencia con la base) | ≤ 10 %/h | > 20 %/h |
| T12 | Precisión | Quedarse 2 min parado en 3 puntos de referencia identificables en el mapa | Error observado (mediana) frente a la precisión declarada | Se documenta. Aceptable si la mediana ≤ 15 m al aire libre | — (informativo) |
| T13 | Volumen de mensajes | Contadores del servidor por jugador y hora | Mensajes subidos y bajados | Se documenta (alimenta el §5) | — |

**Limitaciones de la medición** (se documentarán junto a los resultados): la batería se mide con el nivel del sistema (resolución del 1 %); el error de posición frente a un punto leído en el mapa es aproximado; una sola marca de móvil Android no representa a todas.

**Datos personales en la prueba:** las coordenadas del propio probador se guardan en el CSV del dispositivo y en el almacenamiento efímero del entorno de prueba, **solo con su consentimiento**, y se borran después del análisis. No hay terceros.

### 4.1 Reglas de decisión tras la prueba

| Resultado | Decisión que se propondrá |
|---|---|
| V2 aprueba T05 (y T06) | Adoptar V2: permisos "mientras se usa la app" |
| V2 falla y V1 aprueba | Adoptar V1: se acepta el permiso "Permitir siempre" y la declaración en Play. Rediseñar la pantalla de permisos |
| Los dos fallan por cierres del fabricante | Documentar los pasos de configuración necesarios para el usuario (batería sin restricciones) y valorar si son aceptables. Si no, evaluar nativo o Flutter |
| T03, T09 o T10 fallan | **Bloqueante**: corregir el motor antes de continuar (sin encadenar correcciones automáticamente: se informa primero) |
| No se confirma la jurisdicción UE o el plan gratuito de Durable Objects | Cambiar al servidor Node (mismo motor) |

### 4.2 Plantilla de resultados

Cada resultado se registrará en `QUALITY_STATE.md` con: ID de la prueba, fecha, dispositivo (modelo y versión de Android o iOS), variante, red, si es **real o simulada**, valor medido, aprobada o fallada, y observaciones o causa.

---

## 5. Estimación de volumen y coste por escenarios

> Son **estimaciones teóricas**, no facturas. Se recalcularán con los contadores reales de T13. No se extrapolan resultados de la prueba a producción sin indicarlo.

**Supuestos:**
- Partida de 60 min.
- Cada jugador envía 1 muestra cada 5 s, es decir, **720 mensajes de subida por hora**.
- El servidor **agrupa** las posiciones de los compañeros en 1 mensaje cada 5 s por destinatario, es decir, **720 mensajes de bajada por hora**.
- Eventos y pistas: despreciables en comparación.

| Jugadores | Subida/h | Bajada/h (agrupada) | **Total/h** | Sin agrupar (comparación) |
|---|---|---|---|---|
| 2 | 1.440 | 1.440 | **~2.900** | ~1.440 |
| 10 (3 cazadores + 7 fugitivos) | 7.200 | 7.200 | **~14.400** | ~41.800 |
| 30 (8 + 22) | 21.600 | 21.600 | **~43.200** | ~395.000 |
| 70 (15 + 55) | 50.400 | 50.400 | **~100.800** | ~2.340.000 |

**Conclusión de diseño** [I]: agrupar las posiciones es imprescindible. Sin agrupar, el volumen crece con el cuadrado del tamaño del equipo.

**Datos móviles por jugador** [H]: unos 720 × (0,2 KB de subida + 0,1–1,5 KB de bajada) ≈ **0,2–1,2 MB por hora**.

### Coste aproximado por proveedor

| Proveedor | Hipótesis de facturación | 2 j. | 10 j. | 30 j. | 70 j. |
|---|---|---|---|---|---|
| **Cloudflare Durable Objects (gratis)** | Un objeto despierto toda la partida: 3.600 s × 0,128 GB = **~460 GB-s por partida y hora**. Límite gratuito de 13.000 GB-s al día, es decir, **~28 partidas-hora al día**. Peticiones: los mensajes WebSocket entrantes cuentan 1/20 (70 j. = ~2.500 peticiones por hora, dentro del límite de 100.000 al día) | 0 € | 0 € | 0 € | 0 € |
| Cloudflare (plan de pago, 5 $/mes) | 400.000 GB-s incluidos (~870 partidas-hora al mes) y después 12,50 $ por millón de GB-s, unos **0,006 $ por partida-hora** | 5 $/mes fijo + ~0 | ídem | ídem | ídem |
| **Node en Hetzner CX23** | Coste fijo. Capacidad muy superior a la del MVP [H: medir] | ~4,83 €/mes con IVA para todos los escenarios | | | |
| Supabase (gratis) | 2 millones de mensajes al mes [V]. Si cuenta cada entrega [P]: | ~690 p-h/mes | ~139 p-h/mes | ~46 p-h/mes | ~20 p-h/mes |
| Mapas (MapLibre + OpenFreeMap) | Sin coste por carga | 0 € | 0 € | 0 € | 0 € |
| Mapas (SDK nativo de Google) | 0 $ por carga en móvil [V] | 0 $ | 0 $ | 0 $ | 0 $ |

"p-h" = partidas-hora gratuitas aproximadas al mes con ese tamaño de partida.

**Gastos de esta fase: 0 €.** Gastos que podrían pedirse más adelante, siempre con autorización previa:

| Gasto | Para qué | Alternativa gratuita | Límite de la alternativa | Coste |
|---|---|---|---|---|
| Apple Developer Program | Instalar en el iPhone prestado (S3) y publicar en iOS | Mac con Xcode y aprovisionamiento gratuito | Requiere un Mac. Perfiles de corta duración [P] | 99 $/año |
| Hetzner CX23 | Plan B de servidor | Ordenador propio con un túnel gratuito | Tiene que estar encendido. Menos realista | ~4,83 €/mes |
| Google Play Console | Publicar (no hace falta para la prueba) | APK instalado directamente | Sin distribución pública | 25 $ una vez |

---

## 6. Riesgos de la prueba

| Riesgo | Mitigación |
|---|---|
| Un único Android no representa al parque de móviles | Documentar el modelo. Conseguir un segundo modelo para S2 |
| Sin iPhone ni Mac no se puede validar iOS | iOS queda **pendiente** y no se declara validado |
| Mezclar resultados simulados y reales | Etiqueta obligatoria REAL o SIMULADO en cada resultado |
| Que el código de la prueba acabe convertido en producto | Solo `engine/` y el módulo de ubicación pueden pasar al MVP, y tras una revisión |
| Que se encadenen correcciones si algo falla | Ante un fallo: informe, causa y alternativas, y **se espera la aprobación** |

## 7. Pendiente de verificar al empezar la próxima sesión (sin coste)

1. Durable Objects en el plan gratuito y su jurisdicción UE (documentación oficial de Cloudflare).
2. Página oficial de `expo-location` (versión del SDK que se vaya a usar): requisitos exactos de permisos y opciones del servicio en primer plano.
3. Formulario de declaración del servicio en primer plano de tipo `location` en Play Console (requisitos para cuando se publique).
4. Condiciones actuales del aprovisionamiento gratuito de Apple (solo si hay Mac disponible).
