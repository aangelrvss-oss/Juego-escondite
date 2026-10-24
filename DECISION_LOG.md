# Registro de decisiones

Formato: ID · fecha · estado (Propuesta / Aprobada / Rechazada / Sustituida) · decisión · alternativas · motivo.

---

### D-001 · 24/10/2026 · Aprobada (por el encargo)
**Decisión:** primero investigar y no programar nada en la fase 0.
**Motivo:** instrucción explícita del encargo.

### D-002 · 24/10/2026 · Propuesta
**Decisión:** enfoque de producto "A como núcleo y C como dirección": escondite clásico pulido para grupos privados en el MVP, y después un kit para organizadores y eventos.
**Alternativas:** B (plataforma de muchos modos): descartada por competir de frente con HideZone y multiplicar las pruebas en campo. C desde el primer día: descartada porque exige validar antes el núcleo.
**Motivo:** ver `docs/research/PHASE0_REPORT.md` §1.

### D-003 · 24/10/2026 · Propuesta
**Decisión:** no habrá partidas públicas con desconocidos en el MVP. Más adelante, solo a través de eventos con anfitrión verificado.
**Alternativas:** emparejamiento abierto por cercanía.
**Motivo:** riesgo de seguridad (acoso, menores, confundir a terceros con jugadores). HideZone lo descartó por la misma razón.

### D-004 · 24/10/2026 · Propuesta
**Decisión:** organizar partidas pequeñas será gratis y sin cuenta obligatoria (entrada como invitado).
**Alternativas:** compra única para organizar (modelo de SCRAM) o suscripción (Hunting Game).
**Motivo:** las reseñas de SCRAM muestran rechazo al muro de pago y fallos del código por correo antes de la primera partida.

### D-005 · 24/10/2026 · Propuesta
**Decisión:** la app de juego será nativa multiplataforma. Se descarta una PWA como cliente de juego. Primera opción a investigar: React Native con Expo (development build).
**Alternativas:** Flutter (alternativa sólida) y PWA (no fiable con la pantalla bloqueada).
**Motivo:** la ubicación con el móvil bloqueado es imprescindible. Pendiente del ADR de la fase 3.

### D-006 · 24/10/2026 · Propuesta
**Decisión:** sin chat ni radio de equipo en el MVP.
**Alternativas:** chat de texto moderado.
**Motivo:** reduce las obligaciones de moderación y el riesgo. En los grupos privados la gente ya tiene WhatsApp. Se revisará tras las pruebas.

### D-007 · 24/10/2026 · Propuesta
**Decisión:** preferir proveedores con alojamiento de datos en la UE.
**Motivo:** son datos de ubicación de personas que pueden ser menores. Además es una diferencia frente a SCRAM, que aloja los datos en EE. UU.
