# Estrategia de producto

**Versión:** 1.0 · 24/10/2026
**Estado:** las decisiones marcadas como **[APROBADA]** las aprobó expresamente el propietario. El resto son propuestas **[PENDIENTE]**.
**Fuentes:** [`docs/research/COMPETITIVE_ANALYSIS.md`](../research/COMPETITIVE_ANALYSIS.md) y [`docs/research/PHASE0_REPORT.md`](../research/PHASE0_REPORT.md). Etiquetas: [V] verificado, [I] inferencia, [H] hipótesis, [P] pendiente.

---

## 1. Propuesta de valor

> **Un grupo de adultos monta en pocos minutos una partida de escondite real por su barrio o parque, gratis y sin registrarse. El móvil arbitra y la calle es el tablero.**

Para el jugador, en concreto:

1. **Entrar es inmediato.** Se entra con un enlace, un QR o un código, sin crear cuenta ni recibir correos.
2. **Organizar es gratis.** Crear salas privadas no tiene coste. [APROBADA]
3. **El móvil hace de árbitro.** Lleva el tiempo, manda las pistas y decide quién gana. Las reglas no se discuten porque las aplica el servidor.
4. **La seguridad viene de serie.** Normas visibles, un punto de encuentro, una captura sin forcejeos y ubicación compartida solo cuando hace falta.
5. **Está hecho para España.** Textos en español de España, datos en la UE cuando sea viable y fiabilidad en los Android habituales.

### Por qué alguien la instalaría en vez de SCRAM

| Freno en SCRAM | Nuestra respuesta | Evidencia |
|---|---|---|
| Hay que pagar 5,49 € para organizar | Organizar salas privadas es gratis | [V] 8 de 20 reseñas recientes se quejan del pago |
| El código por correo no llega | Acceso como invitado, sin correo | [V] 6 de 20 reseñas recientes |
| Aún no está en iPhone | Android e iOS desde el MVP (iOS sujeto a la prueba técnica) | [V] Web de SCRAM |
| Ficha a medias en inglés y datos en EE. UU. | Todo en español de España y datos preferentemente en la UE | [V] Ficha de Play ES y política de privacidad |
| Seguridad limitada a un aviso legal | Seguridad integrada en el flujo y en las reglas | [V] Términos de SCRAM |

**Matiz importante** [I]: HideZone ya es gratis para empezar, no pide cuenta y tiene 9 modos. Frente a HideZone no ganamos por precio ni por variedad, sino por **fiabilidad, seguridad, idioma y, más adelante, el modo para organizadores** (enfoque C).

## 2. Público prioritario

- **Solo adultos de 18 años o más.** [APROBADA] La app no se dirige a menores ni tiene funciones pensadas para ellos.
- Segmento inicial **[H]**: grupos de amigos de 18 a 35 años en Madrid (universitarios, recién titulados, grupos de piso, deportivos o de ocio) que ya quedan para planes al aire libre.
- Segmento siguiente (enfoque C, fuera del MVP): organizadores adultos, como asociaciones, colegios mayores, empresas de ocio y team building, despedidas y cumpleaños de adultos.

**Implicaciones de que sea solo para adultos:**
- Al abrir la app se pide declarar que se tiene 18 años o más. **No es una verificación de edad**, sino una declaración. Las tiendas se configurarán con un público objetivo adulto. [P: revisar en la asesoría legal si hace falta algo más]
- Desaparece buena parte del riesgo regulatorio ligado a menores, aunque no por completo: un menor puede mentir. Las normas de uso lo prohíben y, si se detecta, se actúa. [P]

## 3. Problema principal

Jugar al escondite o a la persecución entre adultos en una ciudad **no escala sin un árbitro**: no se sabe dónde termina la zona, cuándo acaba el tiempo ni si una captura vale, y alguien tiene que sacrificarse para controlarlo todo. Las apps genéricas de compartir ubicación lo resuelven a medias: muestran a todos todo el tiempo, sin reglas, y eso mata la tensión del juego.

## 4. Diferenciación (resumen)

1. Gratis y sin registro en todo el ciclo de un grupo privado.
2. Partidas fiables con el móvil bloqueado en Android e iOS. Es el mayor riesgo técnico y el motivo de la prueba técnica.
3. Captura **verificable**: interacción explícita y cercanía GPS plausible, sin contacto físico brusco.
4. Seguridad integrada: lista de comprobación del anfitrión, punto de encuentro, aviso nocturno y el mínimo de datos.
5. Base técnica preparada para eventos y organizadores (C) sin construirlos ahora.

## 5. Modo de juego del MVP

**Un solo modo, "Clásico".** Los modos alternativos quedan fuera hasta validar el núcleo. [APROBADA: los modos no necesarios quedan fuera]

> ⚠ **En revisión (sesión 4):** el propietario ha definido el modo **Infección** y la **zona dinámica** (§5 bis). Si la Infección entra en el MVP, cambia la decisión aprobada en la sesión 2. Está pendiente de aprobación en D-030.

- Dos equipos: **cazadores** y **fugitivos**.
- Los fugitivos tienen una **ventaja inicial**. Durante ese tiempo los cazadores esperan y no reciben ninguna ubicación de los fugitivos.
- **Pistas** periódicas: cada N minutos, los cazadores reciben la última posición conocida de cada fugitivo libre, con su antigüedad.
- Cada equipo ve a sus compañeros en directo. Los fugitivos no ven a los cazadores.
- **Zona circular**. Quien pasa más de 30 s fuera (con margen por la precisión) es visible en directo para el otro equipo mientras siga fuera.
- **Captura** confirmada (ver `GAME_STATE_MACHINE.md`). Los capturados quedan fuera y pasan a espectadores con retraso. En el MVP no se unen a los cazadores [P].
- **Victoria**: cazadores si capturan a todos los fugitivos; fugitivos si queda al menos uno libre al acabar el tiempo.

> **Sesión 4:** en Clásico los equipos son fijos [PROPIETARIO], así que queda confirmado que los capturados **no** se unen a los cazadores. La salida de zona sigue la propuesta D-033: los cazadores fuera de la zona no se exponen, pero no pueden capturar.

## 5 bis. Diseño de juego acordado (sesión 4)

Las reglas completas, con su estado (propietario, propuesta, parámetro), están en [`GAME_MODES_AND_RULES.md`](./GAME_MODES_AND_RULES.md). Resumen de lo definido por el propietario:

- **Clásico:** equipos fijos. Los fugitivos ganan si queda alguno libre al final; los cazadores, si capturan a todos antes.
- **Infección:** uno o varios cazadores iniciales. Cada captura confirmada convierte al fugitivo en cazador. Termina cuando todos son cazadores (ganan los cazadores) o cuando se agota el tiempo (ganan los supervivientes). La transición y la ventaja inicial son parámetros.
- **Equipos:** sorteo automático o selección manual al crear la sala, con una proporción de cazadores configurable y límites seguros.
- **Rondas:** tres opciones documentadas (sorteo nuevo, primeros capturados como cazadores, rotación equilibrada), sin algoritmo definitivo.
- **Zona dinámica:** puede encogerse y moverse. Avisos, límites, tiempos y victoria son parámetros.
- **Pistas** con antigüedad real, un **escáner** limitado y **capturas** validadas con una vía de disputa.

Qué parte entra en el MVP está **pendiente** (D-030).

Mecánicas que este modo comparte con la categoría (pings periódicos, ventaja inicial, zona): son mecánicas genéricas del género, no expresión protegible. Nuestra implementación, textos, identidad visual y nombres serán propios. [P: revisión legal antes del lanzamiento]

## 6. Hipótesis de crecimiento

| ID | Hipótesis | Cómo se valida | Señal |
|---|---|---|---|
| H1 | Si se puede jugar en menos de 5 minutos sin registro, más grupos completan su primera partida que en SCRAM | Pruebas con grupos (fase de lanzamiento, etapa A) | % de salas creadas que terminan una partida |
| H2 | La revancha inmediata hace que se jueguen 2 o más rondas por sesión | Telemetría mínima y anónima, más observación | % de sesiones con revancha |
| H3 | Cada partida trae jugadores nuevos, porque los invitados tienen que instalar la app | Recuento de instalaciones a través de invitaciones | Invitados por anfitrión |
| H4 | Los organizadores adultos pagarían por un kit de eventos (enfoque C) | 5–8 entrevistas antes de construirlo | Intención de pago declarada y pilotos |
| H5 | Hay demanda en Madrid de este formato entre adultos | Etapa A del lanzamiento con grupos conocidos | Repetición espontánea sin que se lo pidamos |

**H5 sigue sin demostrarse.** No hemos encontrado ni inventado cifras de demanda en España.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La ubicación con el móvil bloqueado no es fiable (Android de fabricantes, iOS) | **Crítico**: sin esto no hay juego | Prueba técnica antes de construir (`TECHNICAL_SPIKE_PLAN.md`) |
| Permisos de ubicación en segundo plano y revisión de las tiendas | Alto | La prueba técnica compara la variante "mientras se usa la app" con la de "permitir siempre" |
| Lesiones o conflictos en la calle | Alto | Reglas, captura sin contacto brusco, lista de comprobación y avisos. **La app no puede garantizar la seguridad física** |
| Seguimiento no consentido | Alto | Salas privadas, sin entrar a una partida empezada, ubicación solo durante la ronda y borrado al terminar |
| Falta de masa crítica | Medio | El MVP no depende de desconocidos: basta con un grupo de amigos |
| Monetización por definir | Medio (no bloquea el MVP) | Enfoque C más adelante. Sin pagos en el MVP [APROBADA] |
| Copiar demasiado a SCRAM | Medio | Identidad y textos propios, revisión legal [P] |

## 8. Experimentos de validación (sin gasto)

| ID | Experimento | Estado |
|---|---|---|
| E1 | 2 o 3 partidas en Madrid con SCRAM o HideZone, con un grupo de amigos adultos y observación estructurada | Pendiente (lo ejecutaría el propietario) |
| E2 | 5–8 entrevistas a organizadores adultos | Pendiente. Valida el enfoque C, no bloquea el MVP |
| E4 | Prueba técnica de ubicación con el móvil bloqueado | Diseñada en `TECHNICAL_SPIKE_PLAN.md`. Es la siguiente sesión |

E3 (página de aterrizaje con dominio) queda **aplazado**: no se gasta en dominio. [APROBADA]

## 9. Criterios de éxito del producto

Los umbrales numéricos son **hipótesis** que se recalibrarán tras la prueba técnica y las primeras partidas. No son resultados.

| Métrica | Umbral inicial [H] | Por qué |
|---|---|---|
| Tiempo desde abrir la app hasta empezar la partida (anfitrión con un grupo presente) | ≤ 5 min | Es la promesa de la propuesta de valor |
| % de partidas empezadas que terminan sin fallo técnico | ≥ 90 % | Por debajo de esto el juego no es fiable |
| % de sesiones con revancha | ≥ 40 % | Indica diversión. A calibrar |
| Incidentes de seguridad conocidos | 0 graves | Requisito, no objetivo |
