# Análisis competitivo — Fase 0

**Fecha de la investigación:** 24 de octubre de 2026
**Estado:** borrador para revisión. No se ha empezado la implementación.
**Producto de referencia:** SCRAM: Hide and Seek (Moveera Pty Ltd)

## Convenciones

Cada afirmación lleva una etiqueta:

| Etiqueta | Significado |
|---|---|
| **[V]** | Hecho verificado en una fuente pública consultada en esta sesión (se cita). |
| **[I]** | Inferencia razonable a partir de hechos verificados. Puede ser incorrecta. |
| **[H]** | Hipótesis que requiere validación con usuarios, pruebas o expertos. |
| **[P]** | Decisión o investigación pendiente. |

**No hemos instalado ni probado SCRAM ni ninguna de las otras apps.** Todo lo descrito sale de fichas de tienda, webs oficiales, políticas legales, reseñas públicas, el vídeo y la captura que aportó el usuario. Lo que exige probarlo en persona se indica en §11.

### Herramientas y limitaciones de la investigación

- El contenedor no tiene salida directa a `play.google.com` ni a `scramhideandseek.com` (el proxy rechaza la conexión). Hemos accedido a través de Firecrawl (scraping y el conector estructurado de Google Play) y de una búsqueda web general.
- No hemos podido leer Reddit (Firecrawl no admite ese sitio). Solo tenemos los fragmentos que salen en los resultados de búsqueda.
- No hemos consultado la App Store de iOS para SCRAM porque todavía no está publicado en iPhone (ver §1).
- No hemos podido transcribir el audio del vídeo (no hay herramienta de voz a texto en el entorno). Se ha analizado por fotogramas.
- Las cifras de las tiendas (descargas, valoraciones) son las que muestra Google Play en la fecha indicada. El campo "installs_estimate" del conector es una estimación del proveedor, no un dato oficial de Google.

---

## 1. Qué es SCRAM

| Campo | Dato | Fuente |
|---|---|---|
| Nombre | SCRAM: Hide and Seek | [V] Ficha de Google Play |
| Paquete | `com.scram.app` | [V] Google Play |
| Desarrollador | Moveera Pty Ltd, Buderim (Queensland, Australia) | [V] Google Play, "About the developer" |
| Publicación en Google Play | 1 de octubre de 2026 | [V] Conector de Google Play (tienda ES) |
| Última actualización | 23 de octubre de 2026 | [V] Google Play (tienda US) |
| Plataformas | Android publicado. iPhone "soon", con lista de espera | [V] scramhideandseek.com |
| Descargas | "10K+" / "Más de 10 mil" | [V] Google Play y la captura del usuario |
| Valoración | 3,4★ con 44 reseñas (tienda US, 24/10/2026) | [V] Google Play |
| Clasificación | PEGI 3 en España ("Interacción de usuarios, Ubicación compartida e Incluye compras"); "Everyone" en EE. UU. | [V] Google Play ES/US |
| Modelo de negocio | Descargar y unirse es gratis. **Organizar partidas es una compra única de 5,49 €** en la tienda española. Sin anuncios ni suscripción | [V] Ficha de Google Play ES y web |
| Tamaño | 29 MB | [V] Captura del usuario |
| Idiomas | Web en 11 idiomas, español incluido (`/es/`). En la tienda española la descripción larga sigue en inglés y solo el resumen está traducido | [V] Web y conector de Google Play ES |
| Edad mínima | 13 años (o la que exija la ley local). Los menores de 18 necesitan permiso de sus padres o tutores | [V] Términos de uso |
| Ley aplicable | Queensland (Australia) | [V] Términos de uso |

**Propuesta de valor declarada** [V]: *"Runners hide. Hunters chase. The phone referees."* Es escondite y persecución en la vida real: el móvil lleva el tiempo, manda las señales de ubicación ("pings") y declara al ganador.

**Etapa del producto** [I]: lleva unas tres semanas en Android y aún no ha salido en iOS. Las reseñas recientes indican fallos de lanzamiento (ver §5). Es un competidor muy reciente, no un líder ya asentado.

---

## 2. Funcionalidades verificadas

Fuentes: web oficial, página de soporte, política de privacidad, términos y ficha de Google Play (incluidas las notas "New in SCRAM").

### 2.1 Reglas y configuración del anfitrión [V]

| Parámetro | Rango |
|---|---|
| Duración de la ronda | De 10 min a 3 h |
| Intervalo de ping | De 1 a 30 min, o ninguno |
| Ventaja inicial | De 0 a 15 min |
| Zona de juego | Círculo de 400 m a 3 km de diámetro, que se coloca arrastrando el mapa. También se puede desactivar la zona y jugar "anywhere" |
| Zona que se reduce | Opcional, según un calendario y con aviso 1 minuto antes de cada reducción |
| Salirse de la zona | Pasados 30 s fuera, los cazadores ven al corredor en directo hasta que vuelve |
| Jugadores | Mínimo 3. Hasta 70 ("Big games") |
| Equilibrio de equipos | Al menos 1 cazador por cada 10 jugadores y nunca más cazadores que corredores. La opción "Random" rellena el equipo que va corto. No arranca con equipos descompensados |
| Unirse | Código de 6 caracteres |
| Jugadores atrapados | Pueden ver la partida con 1 minuto de retraso (el anfitrión puede ponerlo en directo o desactivarlo). Si el anfitrión lo permite, se pasan a los cazadores |
| Fin de la partida | Cuando atrapan a todos los corredores o se acaba el tiempo. El anfitrión puede terminarla para todos. Quien se va de una partida no puede volver a entrar |

### 2.2 Visibilidad de la ubicación [V]

- Cada equipo ve a sus propios jugadores en directo.
- Los cazadores solo ven a los corredores en cada ping: una "foto" de la posición, marcada con lo que hace que se tomó.
- Los corredores que siguen en juego **nunca** ven a los cazadores.
- La ubicación se comparte desde "Let's go" hasta que termina la ronda, o antes si atrapan al jugador o se va.

### 2.3 Captura [V]

- Se atrapa a alguien tocándolo en persona. El propio corredor pulsa **"I got tagged"** para confirmarlo. No hay validación por proximidad documentada.

### 2.4 Comunicación y notificaciones [V]

- "Team Radio": chat de texto por equipos. Los cazadores tienen además mensajes de voz de hasta 10 s (mantener pulsado para hablar), que el anfitrión puede desactivar.
- Los avisos llegan con el móvil bloqueado: pings, fin de la ventaja, reducción de zona, capturas y fin de la ronda.
- En Android los avisos solo vibran. En iPhone se recomienda poner el modo silencio para que el sonido no delate dónde estás escondido.

### 2.5 Progresión y contenido compartible [V]

- "Your rounds": historial de rondas con el recorrido (trail) en el mapa, guardado en la cuenta y visible solo para el propio jugador.
- Tarjetas de ronda para compartir, con nombre, resultado, cifras y recorrido. Se guardan como imagen.
- Estadísticas: equipo, resultado, si te atraparon y cuándo, duración, distancia y capturas.
- Muestra hacia dónde miras y la precisión de tu ubicación.
- "Try a demo round": ronda de demostración contra bots.

### 2.6 Cuenta y seguridad [V]

- Acceso con un código de un solo uso enviado por correo, o con Google (Android) o Apple (iOS).
- Denunciar o bloquear: manteniendo pulsado un mensaje del Radio, o tocando a un jugador en la sala de espera. Se revisan las denuncias en 24 h.
- El anfitrión puede expulsar a alguien de la sala de espera antes de empezar.
- Filtro automático de palabras ofensivas en mensajes de texto y nombres (no en los mensajes de voz).
- Partidas solo privadas, con código. Se borran a los 7 días.

### 2.7 Tecnología declarada (por la política de privacidad) [V]

| Pieza | Proveedor |
|---|---|
| Servidor de juego y base de datos | Convex (EE. UU.) |
| Notificaciones push | Expo, que las pasa a APNs/FCM |
| Correo electrónico | Resend |
| Informes de fallos | Sentry |
| Mapas | Google Maps (Android), Apple Maps (iOS) |
| Imágenes de mapa para las tarjetas | Stadia Maps (Android) |
| Pagos | App Store y Google Play |

- [I] Usar Expo para las notificaciones apunta con bastante probabilidad a una app en **React Native con Expo**.
- [I] Según soporte, en Android basta el permiso "Permitir solo mientras se usa la app" para jugar con el móvil bloqueado. Eso indica que usan un **servicio en primer plano** de ubicación y no el permiso de ubicación en segundo plano ("Allow all the time"). Es relevante para nuestra arquitectura y para la revisión de Google Play.
- [V] La app deja de compartir la ubicación si se cierra deslizándola desde las apps recientes. En Android recomiendan poner la batería en "Sin restricciones" si dejan de llegar los avisos.
- [V] Los datos se alojan en EE. UU. y la transferencia desde la UE se ampara en el EU-US Data Privacy Framework o en cláusulas contractuales tipo.

---

## 3. Recorrido de usuario reconstruido

| # | Paso | Cómo funciona en SCRAM | Estado |
|---|---|---|---|
| 1 | Descubrimiento | Instagram (@scramhideandseek, reels con partidas reales), Google Play y Discord | [V] Web y vídeo |
| 2 | Instalación y primer arranque | 29 MB. Hay reseñas de que se queda colgada en el logo | [V] Captura y reseña |
| 3 | Registro | Código por correo o Google/Apple. **Varias reseñas: el código no llega** | [V] Reseñas y soporte |
| 4 | Crear partida | Requiere la compra de anfitrión (5,49 €). Se coloca la zona en el mapa y se fijan duración, ping y ventaja | [V] |
| 5 | Invitar | Código de 6 caracteres con botón "Share" | [V] Web. **No sabemos** si hay enlace profundo o QR [P] |
| 6 | Unirse | Se introduce el código | [V] |
| 7 | Reglas | Las configura solo el anfitrión | [V] |
| 8 | Equipos | Cazador, Corredor o Aleatorio, con equilibrio automático | [V] |
| 9 | Inicio | "I'm ready" y luego "Let's go" | [V] Web (simulación de la interfaz) |
| 10 | Ventaja inicial | Los corredores se dispersan y los cazadores esperan ("No peeking") | [V] |
| 11 | Localización | Pings periódicos para los cazadores. Cada equipo ve a los suyos en directo. Se ve en directo a quien sale de la zona | [V] |
| 12 | Persecución y captura | Se toca en persona y la víctima confirma | [V] |
| 13 | Final | Por tiempo, por captura total o porque lo termina el anfitrión | [V] |
| 14 | Resultados | Pantalla "Round over / You survived!", estadísticas, recorrido y tarjeta para compartir | [V] |
| 15 | Repetir | **No sabemos** si hay "revancha" con la misma sala | [P] |

---

## 4. Análisis de mecánicas: por qué funcionan

| Mecánica | Aporta | Comentario |
|---|---|---|
| Pings periódicos en lugar de rastreo en vivo | Tensión y estrategia: el cazador tiene que **predecir**. El corredor sabe cuándo "se ilumina" y se mueve justo después | Es la mecánica central. También sirve de excusa de privacidad: compartir poco |
| Asimetría de información (los corredores no ven a los cazadores) | Paranoia y miedo, que es la diversión del escondite | Hunting Game hace lo contrario: da a los corredores una brújula que apunta a los cazadores, lo que lo convierte en un juego más de huida |
| Ventaja inicial | Equilibrio y el momento de "¡corre!" | — |
| Zona que se reduce | Evita tablas y fuerza el desenlace (patrón battle royale) | Riesgo: empuja a la gente hacia los bordes, que pueden ser calles |
| Visible en directo fuera de la zona | Hace cumplir los límites sin un árbitro humano | Bien resuelto. Lo copiaríamos como principio, no como implementación |
| Los atrapados se unen a los cazadores | Mantiene ocupados a los eliminados (retención durante la ronda) | Hace más fácil la recta final |
| Espectador con retraso | Los eliminados siguen enganchados sin poder chivarse en directo | Detalle de diseño inteligente |
| Radio por equipos | Coordinación y momentos sociales | Supone moderación y obligaciones legales (contenido generado por usuarios) |
| Tarjeta de ronda con recorrido | Crecimiento: contenido para Instagram o TikTok | Riesgo de privacidad si se comparten recorridos por zonas de casa [H] |
| Demo con bots | Se entiende el juego sin tener a 3 personas a mano | Ayuda mucho a que el usuario se active |

---

## 5. Reseñas: problemas con evidencia

**Muestra:** las 20 reseñas más recientes de SCRAM en Google Play (US, todos los dispositivos), del 15 al 23 de octubre de 2026, más las 3 destacadas en la ficha. También 30 de *Manhunt: Hide & Seek* y 22 de *HideZone*. Es una muestra pequeña, así que sirve para detectar señales cualitativas, no para medir proporciones de forma fiable.

### SCRAM (20 reseñas recientes)

| Problema | Nº de reseñas | Ejemplo literal |
|---|---|---|
| Hay que pagar para organizar ("no es gratis") | 8 | "Requires $5 to play. Should mention that on the store page" · "I loved the concept, but unwilling to spend $5 every time I want to host a game" |
| No llega el código de verificación por correo | 6 | "a code is never sent to my email no matter how many times I try, so I can't even create an account" |
| Fallos de juego o de arranque | 2 | "the game was broken and pings didnt show" · "stuck on the logo" |
| Positivas | 6 | "this game was so fun… free and had no ads" · "ARE YOU WANTING CONNECTION WITH REAL PEOPLE!" |

- [V] Un usuario prefiere usar una app de localización genérica antes que pagar: *"im just gonna play this with a tracker app"*. Los **sustitutos gratuitos** (Life360, Google Maps compartiendo ubicación, WhatsApp) son una competencia real.
- [I] La queja de "pagar cada vez" contradice la compra única declarada. Puede ser un malentendido. En cualquier caso, la comunicación del precio genera rechazo.
- [I] Tanto el muro de pago como el código por correo pasan **antes de la primera partida**. SCRAM está perdiendo usuarios justo en la activación.

### Manhunt: Hide & Seek (Lackin LLC), 2,3★

- [V] La gran mayoría de las 30 reseñas más relevantes dicen que **no funciona en Android** ("doesn't work on android, works on iphone", "can't start or join a game"). Una app de este tipo que no es fiable en Android pierde por completo. En España Android tiene mucho peso [H: cuota exacta pendiente de verificar].

### HideZone, 4,6★ (171 valoraciones)

- [V] Muy buena acogida. Elogian la variedad de modos y el poder jugar sin pagar.
- [V] Quejas sobre el equilibrio de los "créditos" (modelo freemium) y una limitación de pago (tamaño mínimo de zona) que el desarrollador acabó liberando.
- [V] Un usuario pidió **partidas públicas con desconocidos** ("put what you are wearing so you know who it is and not finding some guy that's not playing"). El desarrollador lo **descartó**: *"public matches with strangers would be too hard to organize… the app stays for private matches with friends and family only"*.
- [V] Testimonio en su web de un monitor scout: sesión de 15 jugadores de 14 a 18 años. Hay un **caso de uso de organizador** real.

### Problemas que el prompt pedía comprobar

| Problema sospechado | ¿Hay evidencia? |
|---|---|
| Restricciones de pago | **Sí, fuerte** (SCRAM) |
| Mala experiencia de incorporación | **Sí** (código por correo en SCRAM) |
| Problemas de conexión o fallos | **Sí** (Manhunt en Android, algunos en SCRAM y HideZone) |
| Notificaciones | Indirecta: la página de soporte de SCRAM dedica una sección a "Alerts aren't arriving" y a la batería en Android |
| Consumo de batería | Indirecta: Manhunt advierte en su ficha de que la ubicación en segundo plano "can excessively drain battery". No encontramos quejas explícitas en la muestra |
| GPS impreciso | No encontrado en la muestra. SCRAM añadió un indicador de precisión, lo que sugiere que surgió [I] |
| Dificultad para reunir jugadores | Indirecta: HideZone menciona grupos de 3 a 20 y piden partidas públicas. Sin evidencia directa en SCRAM |
| Falta de modos | No en SCRAM (aún es pronto). HideZone se diferencia justo por tener 9 modos |
| Descubrir partidas | La petición de partidas públicas en HideZone |
| Interfaz confusa | Solo en Manhunt ("no indication of what I am supposed to do") |

---

## 6. Vídeo aportado por el usuario

Archivo `VID_20261024_055101_144.mp4` (30,8 s, 1080×1920). Lo hemos analizado a partir de fotogramas extraídos cada 2 s.

- [V] Es un reel de Instagram de **@scramhideandseek** (marca de agua) con subtítulos palabra a palabra ("Manhunt", "everyone", "hunters", "shrinks", "get"…).
- [V] Partida **de noche** en una zona comercial: pasillo cubierto, terraza de cafetería con mesas, viandantes ajenos al juego.
- [V] Un grupo de unas 5 personas con los móviles juntos, todos con la pantalla roja **"Ping!"**. Mapa con una zona circular y temporizadores (59:56, 30:18).
- [V] Una persona corre entre las mesas de una terraza perseguida por otra.
- [I] Lectura de seguridad: el propio marketing de la referencia muestra **carreras de noche entre terceros y mobiliario**. Es justo el tipo de situación que nuestro diseño debería desincentivar (ver §9).
- [P] No hemos podido transcribir el audio.

**Captura de pantalla aportada** [V]: ficha de Google Play en España vista desde un móvil Android. Los iconos de la barra de estado son compatibles con un dispositivo de capa Xiaomi/HyperOS [I]. Es relevante: estas capas cierran de forma agresiva los procesos en segundo plano (ver riesgos técnicos).

---

## 7. Competencia

### 7.1 Tabla comparativa de competidores directos

Datos de Google Play (US) a 24/10/2026 salvo que se indique otra cosa. Las cifras que da cada empresa sobre sí misma se marcan como tales.

| | **SCRAM** | **HideZone** | **Hunting Game: GPS Manhunt** | **Manhunt: Hide & Seek** |
|---|---|---|---|---|
| Desarrollador | Moveera Pty Ltd (AU) | "dramiley" (desarrollador individual [I]) | Jasper Aelvoet | Lackin LLC |
| Lanzamiento | 1 oct 2026 | 7 feb 2026 | 19 ago 2024 | 5 sep 2025 |
| Plataformas | Android (iOS con lista de espera) | Android + iOS | Android + iOS + Apple Watch | Android + iOS |
| Descargas en Play | 10K+ | 10K+ | 100K+ | 10K+ |
| Lo que dice de sí misma | — | "70,000+ Players", 4,8★ | "250K+ downloads, 1M+ games played" | — |
| Valoración en Play | 3,4★ (44) | 4,6★ (171) | 5,0★ (451, **todas de 5★**, anómalo: tomar con cautela) | 2,3★ (158) |
| Modelo | Compra única de 5,49 € para organizar | Freemium: créditos y compras de 2,49 a 29,99 USD | Suscripción Pro. Gratis para 2–4 jugadores, Pro hasta 20 | Compras de 3,99 a 39,99 USD |
| Cuenta | Obligatoria (correo o Google/Apple) | **No hace falta** | [P] | [P] |
| Mecánica central | Pings, sin ver a los cazadores | Zona que se reduce, GPS en vivo, objetos | Mapa con actualizaciones periódicas para cazadores y brújula para corredores, poderes | Rastreo con zonas personalizadas |
| Modos | 1 (clásico) | 9 (escondite, zombis, persecución, asesino, pilla-pilla congelado, Mr. X, sardinas, asesinato misterioso, meteoritos) | Manhunt, Familia (árbitro) y Escondite (Pro) | Manhunt y "Senior Assassin & Battle Royale" |
| Captura | El atrapado lo confirma | Por PIN o radio de captura [V: "tag range"] | [P] | [P] |
| Organizador o árbitro | No | No | **Sí, modo Familia** con un supervisor que ve a todos | Gestión de permisos de grupo |
| Partidas públicas | No | No (descartado a propósito) | Espectador web con el código [V] | [P] |
| Retención de ubicación | Partida borrada a los 7 días. Recorrido guardado en la cuenta | Se borra al terminar la partida | Unos 5 minutos tras terminar | [P] |
| Español | Web sí. Ficha de tienda a medias | [P] | [P] | [P] |

**Lectura** [I]:

- La categoría tiene **muchas apps pequeñas, recientes y hechas por uno o pocos desarrolladores**. Ninguna domina. La barrera técnica de entrada es moderada, la de la calidad es alta.
- HideZone es el rival más fuerte en amplitud de producto y en experiencia sin fricción (sin cuenta, gratis para empezar). SCRAM destaca por tener la marca y el diseño más cuidados y un relato de privacidad claro, pero falla en la activación.
- Ninguna ofrece un **modo organizador y eventos** sólido más allá del modo Familia de Hunting Game.
- Ninguna está enfocada al mercado español ni tiene identidad local.

### 7.2 Competidores indirectos y sustitutos

| Tipo | Ejemplos verificados | Relevancia |
|---|---|---|
| Formato "Jet Lag: The Game — Hide + Seek" (Wendover/Nebula) | Juego de mesa oficial "Home Game". Herramientas no oficiales: generador de mapas, "Near: Hide + Seek for Jet Lag" (50+ descargas), "Jet Lag: Hide & Seek Mapper" (500+) [V] | Comunidad internacional muy entusiasta. Partidas a escala de ciudad con transporte público. Sus fans ya buscan apps (un hilo de r/JetLagTheGame en español menciona HideZone [V: fragmento de búsqueda]) |
| Gymkanas urbanas en Madrid | 10–30 €/persona (Street SKP, Espectáculos Ruiz, despedidas), 29 €/persona (Gymkana Misterio), apps de gymkana desde 3,75 €/persona (Emotion Players) [V: resultados de búsqueda] | **Compiten por el mismo tiempo de ocio en grupo**. Demuestran que hay **disposición a pagar por experiencias urbanas organizadas** en Madrid |
| Escape rooms y experiencias de escondite | "Escondite en la Oscuridad" (Aventurico, Madrid): 60 min, de 4 a 12 jugadores, en interior [V] | Hay un formato de "escondite" comercializado con entradas en Madrid |
| Apps de localización genéricas | Life360, iSharing, compartir ubicación en Google Maps o WhatsApp [V: mencionado en una reseña de SCRAM] | Sustituto gratuito "suficiente" para algunos usuarios |
| Juegos tradicionales sin app | Escondite, pilla-pilla, polis y cacos, bote-bote [conocimiento general, no investigado] | Base cultural: reglas que todo el mundo ya conoce |
| TV y cultura | "El Escondite", programa de TVE presentado por Grison (El Economista, septiembre de 2026) [V: solo titular, contenido no verificado] | Posible señal cultural del formato en España [H] |
| Juegos de geolocalización | Pokémon GO, Ingress, Geocaching [no investigado en esta fase] | Educan al público en el juego en la calle con el móvil |

### 7.3 Demanda en España y Madrid

**Evidencia encontrada: débil.**

- [V] No hemos encontrado eventos multitudinarios de escondite o "manhunt" en Madrid, ni reseñas en español de estas apps.
- [V] Sí hay un mercado activo de gymkanas urbanas y despedidas en Madrid con precios publicados, y experiencias de escondite comercializadas.
- [V] Hay interés hispanohablante en la comunidad de Jet Lag.
- **[H] Que exista demanda en España de un juego de persecución con GPS es todavía una hipótesis.** No hemos encontrado ni nos inventamos cifras de mercado, descargas por país ni usuarios activos. La validación tiene que ser experimental (ver la propuesta en `PHASE0_REPORT.md`).

---

## 8. Oportunidades detectadas

1. **Organizar partidas gratis a pequeña escala.** La principal queja de SCRAM es el muro de pago. Monetizar por otras vías (eventos, organizadores, cosméticos) en lugar de cobrar por organizar. Evidencia: §5.
2. **Incorporación sin fricción.** Unirse como invitado con enlace o QR, sin correo. Evidencia: los fallos del código por correo en SCRAM y que HideZone presume de no pedir cuenta.
3. **Seguridad desde el diseño en ciudades españolas.** Constructor de zonas que excluye vías principales, agua y recintos privados, más un punto de encuentro, avisos de horario nocturno y una captura que no obligue a forcejear. Evidencia: la competencia solo se protege con un descargo legal ("play somewhere safe") y el propio marketing muestra persecuciones nocturnas entre terceros.
4. **Modo organizador y eventos.** Árbitro con vista global, grupos grandes, QR imprimible, torneos y packs para asociaciones, scouts, colegios mayores, empresas y despedidas. Evidencia: testimonio scout en HideZone, modo Familia en Hunting Game y el mercado de gymkanas en Madrid a 10–30 €/persona.
5. **Producto nativo español y europeo.** Identidad, textos y modos con raíces locales (polis y cacos, bote-bote), datos alojados en la UE y fiabilidad probada en Android con capas agresivas de fabricantes (Xiaomi, Samsung, etc.). Evidencia: la ficha de SCRAM sigue en inglés, sus datos están en EE. UU. y Manhunt fracasa en Android.

---

## 9. Riesgos específicos de un juego de persecución con GPS

| Riesgo | Por qué importa | Fuente o razonamiento |
|---|---|---|
| Atropellos y cruces peligrosos | Las persecuciones en la calle incentivan cruzar sin mirar. Las zonas que se reducen empujan hacia los bordes | [I] Mecánica + vídeo |
| Propiedad privada y recintos restringidos | Esconderse en portales, garajes o centros comerciales | [V] Los términos de SCRAM lo prohíben, pero no lo evitan |
| Confusión con terceros | Perseguir o tocar a alguien que no juega | [V] Reseña de HideZone ("finding some guy that's not playing") |
| Conflictos físicos al capturar | "Te toqué / no me tocaste" degenera en forcejeos | [I] |
| Seguimiento y acoso | Usar una partida para localizar a alguien. Códigos filtrados. Espectador web con código (Hunting Game) | [V] Los términos de SCRAM lo prohíben explícitamente ("use a game to follow, find or meet someone who hasn't agreed to it") |
| Menores | Público natural adolescente. Ubicación en tiempo real de menores | [V] La edad mínima de la competencia es 13 años. En España la edad de consentimiento digital es 14 años (art. 7 de la LOPDGDD) y hay un proyecto de ley para subirla a 16 (estado a octubre de 2026: **pendiente de verificar** [P]) |
| Juego nocturno | Menos visibilidad y más riesgo | [V] Vídeo |
| Mirar el móvil mientras se corre | Caídas y atropellos | [I] |
| Manipulación del GPS (fake GPS) | Hacer trampas y romper la diversión | [I] Las apps de ubicación simulada son habituales en Android |
| Cierre en segundo plano en Android | Pings que no llegan y partidas rotas | [V] La página de soporte de SCRAM y una reseña ("pings didnt show") |
| Contenido generado por usuarios (chat y voz) | Moderación y obligaciones del Reglamento de Servicios Digitales (DSA) | [V] SCRAM modera en 24 h y filtra palabras |

---

## 10. Conclusiones estratégicas

1. **La categoría está viva pero sin consolidar.** Hay al menos cuatro apps activas en 2026, todas pequeñas. No llegamos tarde, pero tampoco somos los primeros. Ganar exige ejecutar mejor, no solo tener la idea.
2. **El momento crítico es la activación**: llegar a la primera partida. La competencia pierde ahí a los usuarios (muro de pago, código por correo, fallos en Android). Nuestro MVP debería medirse por el *tiempo desde la instalación hasta que empieza la primera partida*.
3. **La seguridad es un hueco competitivo y además una obligación.** Nadie hace más que poner un aviso legal.
4. **Abrir partidas a desconocidos es arriesgado y hasta un competidor lo ha descartado.** La vía razonable hacia la masa crítica pasa por grupos privados, eventos y organizadores, no por el emparejamiento abierto.
5. **La demanda en España no está probada.** Antes de invertir en desarrollo completo conviene validar con experimentos baratos (ver el informe de la fase 0).

---

## 11. Incertidumbres y lo que habría que probar en persona

| # | Incógnita | Cómo resolverla |
|---|---|---|
| 1 | Si SCRAM tiene enlace profundo o QR para invitar | Instalar SCRAM y crear o unirse a una sala (requiere pagar 5,49 € para organizar) |
| 2 | Calidad real de los pings con el móvil bloqueado en Xiaomi/HyperOS | Partida de prueba con 3 dispositivos |
| 3 | Consumo de batería por hora de partida | Medir en una partida de prueba |
| 4 | Si existe "revancha" con la misma sala | Probar |
| 5 | Si las reglas y textos de la app están traducidos al español | Instalar con el idioma en español |
| 6 | Comportamiento ante una desconexión del anfitrión | Prueba controlada |
| 7 | Precisión y latencia de los pings | Prueba controlada |
| 8 | Funcionalidades de HideZone y Hunting Game en detalle (captura, cuenta, privacidad) | Instalar las dos (ambas gratis para empezar) |
| 9 | Estado del proyecto de ley de protección de menores en entornos digitales (edad de consentimiento, 14 o 16) | Consultar el BOE o pedir asesoría legal |
| 10 | Demanda en España | Experimentos de la fase 1 |
| 11 | Si la marca "SCRAM" u otras de la categoría están registradas en la EUIPO/OEPM | Búsqueda de marcas antes de elegir nombre |

---

## 12. Fuentes consultadas (24/10/2026)

**SCRAM**
- Web: https://scramhideandseek.com/ (contenido principal, idiomas)
- Política de privacidad: https://scramhideandseek.com/privacy (actualizada el 24/10/2026)
- Términos de uso: https://scramhideandseek.com/terms (actualizados el 23/10/2026)
- Soporte: https://scramhideandseek.com/support
- Google Play (US): https://play.google.com/store/apps/details?id=com.scram.app&hl=en&gl=US
- Google Play (ES), a través del conector de Firecrawl: precio 5,49 €, PEGI 3, publicada el 1/10/2026
- Reseñas de Google Play: 20 más recientes, a través del conector de Firecrawl
- Vídeo (reel de Instagram @scramhideandseek) y captura aportados por el usuario

**Competidores**
- HideZone: https://hidezone.app/ · Google Play `com.hidezone.hidezone` (ficha y 22 reseñas)
- Hunting Game: https://www.hunting-game.com/ · Google Play `com.jasperaelvoet.HuntingGame`
- Manhunt: Hide & Seek: Google Play `com.munimtechnologies.manhuntandroid` (ficha y 30 reseñas)
- Búsquedas en Google Play (US): "manhunt GPS game", "jet lag hide and seek"
- Jet Lag: https://en.wikipedia.org/wiki/Jet_Lag:_The_Game · https://taibeled.github.io/JetLagHideAndSeek/ · https://github.com/jltg-community/awesome-jetlag-hide-and-seek

**Mercado en Madrid (fragmentos de resultados de búsqueda)**
- https://www.espectaculosruiz.com/actividad/gymkana-urbana-madrid/
- https://streetskp.com/despedida-soltera-madrid/
- https://www.despedidadesolteraenmadrid.es/packs-despedidas-soltera/gymkanas-despedidas/gymkana-misterio/
- https://emotionplayers.com/gymkhana/madrid/
- https://escapeup.es/escape-room/aventurico/madrid/escondite-en-la-oscuridad/
- https://www.eleconomista.es/noticias/fuente/el-economista/2026/septiembre/1quin (titular sobre "El Escondite" en TVE)

**Marco legal (fragmentos de resultados de búsqueda; requiere revisión profesional)**
- Proyecto de Ley Orgánica para la protección de las personas menores de edad en los entornos digitales, BOCG-15-A-52-1 (11/04/2025): https://www.congreso.es/public_oficiales/L15/CONG/BOCG/A/BOCG-15-A-52-1.PDF
- Análisis UOC: https://blogs.uoc.edu/edcp/es/proyecto-ley-organica-proteccion-menores-entornos-digitales-2/
- Nota del Ministerio de la Presidencia (10/09/2025): https://www.mpr.gob.es/prencom/notas/paginas/2025/100925-tramitacion-lo-proteccion-menores-entornos.aspx
