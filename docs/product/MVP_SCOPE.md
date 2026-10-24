# Alcance del MVP

**Versión:** 1.0 · 24/10/2026
**Estado:** el alcance funcional se deriva de decisiones **aprobadas**. Los valores concretos (límites, intervalos) son **propuestas** que la prueba técnica tiene que confirmar.

## 1. Objetivo

Que un grupo de 2 a 20 adultos pueda **instalar, crear una sala privada gratis, entrar por enlace, QR o código, jugar una partida completa del modo Clásico con los móviles bloqueados, ver el resultado y jugar la revancha**.

## 2. Dentro del alcance

| # | Funcionalidad | Notas | Prioridad |
|---|---|---|---|
| M1 | Acceso como invitado | Nombre visible y declaración de 18 años o más. El servidor emite un identificador anónimo y un secreto de sesión | Imprescindible |
| M2 | Crear sala gratis | Sin límite de salas. Un anfitrión puede tener 1 sala activa a la vez | Imprescindible |
| M3 | Invitar por código | 6 caracteres de un alfabeto sin caracteres ambiguos | Imprescindible |
| M4 | Invitar por enlace | Enlace https a una página de invitación en un subdominio gratuito [H: viabilidad de App Links/Universal Links sin dominio propio por verificar] y, si no, esquema propio de la app | Imprescindible |
| M5 | QR | Generado en el móvil con el mismo enlace. Se incluye porque es barato de hacer y útil cuando el grupo está junto | Imprescindible |
| M6 | Sala de espera | Lista de jugadores conectados, estado "listo" y expulsión por el anfitrión | Imprescindible |
| M7 | Equipos y roles | Cazador, fugitivo o aleatorio. Equilibrio automático; el anfitrión puede ajustarlo | Imprescindible |
| M8 | Configuración sencilla | Ajustes predefinidos más ajustes avanzados: duración, ventaja, intervalo de pistas, zona y punto de encuentro | Imprescindible |
| M9 | Seguridad previa | Normas, lista de comprobación del anfitrión, punto de encuentro obligatorio y aviso si es de noche | Imprescindible |
| M10 | Inicio sincronizado | Cuenta atrás controlada por el servidor | Imprescindible |
| M11 | Ventaja inicial | Los cazadores no reciben la ubicación de los fugitivos | Imprescindible |
| M12 | Ubicación por reglas | Compañeros en directo, pistas para los cazadores y visibilidad al salir de la zona. Estados actual, antigua y no disponible | Imprescindible |
| M13 | Pistas | Instantánea generada en el servidor con la antigüedad de cada posición | Imprescindible |
| M14 | Captura confirmada | Autodeclaración del fugitivo, o declaración del cazador con cercanía plausible y confirmación del fugitivo | Imprescindible |
| M15 | Avisos con el móvil bloqueado | Notificaciones push solo con vibración: pista, fin de la ventaja, captura, fuera de zona y fin | Imprescindible |
| M16 | Final y resultados | Ganador, capturas y duración. **Sin coordenadas** | Imprescindible |
| M17 | Revancha | Misma sala y mismos jugadores (quien acepte), con opción de intercambiar roles | Imprescindible |
| M18 | Desconexiones | Reconexión automática, estado recuperado desde el servidor y anfitrión sustituto | Imprescindible |
| M19 | Abandonar | Salida voluntaria. Deja de compartir la ubicación al instante | Imprescindible |
| M20 | Bloquear y denunciar | Bloquear a un jugador (no podrá entrar en tus salas) y denunciar por correo de contacto | Recomendable [P] |
| M21 | Diagnóstico | Pantalla de estado: GPS, precisión, conexión y última sincronización | Recomendable |

### Valores propuestos [P: se confirman tras la prueba técnica]

| Parámetro | Propuesta | Motivo |
|---|---|---|
| Jugadores por sala | 2–20 | Límite técnico del MVP para poder probarlo, no un muro de pago. 70 queda para más adelante |
| Duración | 10–120 min | Rango razonable para el MVP. Por encima, el consumo de batería es dudoso |
| Ventaja | 1–10 min | |
| Intervalo de pistas | 2–15 min | |
| Zona | Círculo de 150 m a 2 km de radio | Por debajo de 150 m el error del GPS pesa demasiado [H] |
| Envío de ubicación | Cada 5 s, ajustable en la prueba técnica | Ver `TECHNICAL_SPIKE_PLAN.md` |
| Caducidad de la sala | 30 min sin actividad en la sala de espera. Vida máxima de 6 h | Reduce la exposición de los códigos |

## 3. Fuera del alcance (decisión aprobada)

- Partidas públicas o con desconocidos, y descubrimiento de partidas cercanas.
- Chat de texto o voz.
- Pagos, suscripciones, compras dentro de la app y publicidad.
- Clasificaciones, rangos, logros y perfiles sociales.
- Historial de recorridos, público o privado. Tarjetas para compartir con trazado.
- Cualquier función dirigida a menores.
- Modos alternativos (infección, asesino, sardinas…), zona que se reduce [P: candidata a la primera ampliación], capturados que se pasan a cazadores y objetos o poderes.
  > ⚠ **En revisión (sesión 4):** el propietario ha definido el modo **Infección** (los capturados se convierten en cazadores), la **zona dinámica** (encoge y se mueve) y un **escáner** limitado. La exclusión de la zona dinámica era solo una propuesta [P], no una decisión aprobada. La de los modos alternativos sí estaba aprobada. Ver §6 y D-030.
- Kit de organizador, eventos, árbitro con vista global y torneos (enfoque C).
- Cuentas con correo o contraseña. Sincronizar el historial entre dispositivos.
- Detección automática de zonas peligrosas con datos de mapa.
- Web app para jugar (como mucho, una página de invitación).

## 4. Preparado para ampliar (sin construirlo ahora)

| Ampliación futura | Lo que el MVP deja preparado |
|---|---|
| Eventos y organizadores (C) | `Room` separada de `Game` (una sala, varias partidas). Rol `host` con permisos en una tabla de capacidades, ampliable a `referee` |
| Más modos | Motor con reglas encapsuladas por `mode`. El protocolo incluye `mode` desde la versión 1 |
| Zona que se reduce | `Zone` versionada con un calendario de cambios (en el MVP, una sola versión). ⚠ Sesión 4: la zona dinámica se propone **dentro** del MVP (§6) |
| Cuentas | Identidad de invitado que más adelante se puede vincular a Apple o Google |
| Moderación | Registro de eventos y bloqueos por jugador |

## 5. Restricciones

- Presupuesto: 0 € en esta fase. Cualquier gasto necesita autorización expresa. [APROBADA]
- Sin dominio propio por ahora. [APROBADA]
- Datos preferentemente en la UE, comprobando las condiciones reales de cada proveedor. [APROBADA]
- Arquitectura **no aprobada**: depende de la prueba técnica.

## 6. Cambios de alcance propuestos (sesión 4) [PENDIENTES de aprobación: D-030]

Las reglas de cada elemento están en [`GAME_MODES_AND_RULES.md`](./GAME_MODES_AND_RULES.md).

| Elemento | Alcance actual | Propuesta | Orden de implementación propuesto |
|---|---|---|---|
| Modo Clásico | Dentro | Dentro (sin cambios) | Ya implementado en S0, con zona fija |
| Zona dinámica (encoger y mover) | Fuera [P] | **Dentro**, opcional por sala | 1.º, después de S1 |
| Asignación automática o manual con proporción configurable (sustituye a M7) | Parcial (preferencias más sorteo) | **Dentro** | 1.º, con la zona |
| Opciones de ronda A, B y C (sustituyen al "intercambiar roles" de M17) | "Intercambiar roles" | **Dentro**: A y B; C cuando se apruebe su regla | 2.º |
| Vía de disputa de capturas | Parcial (rechazo y caducidad) | **Dentro** | 2.º |
| Modo Infección | Fuera (**decisión aprobada** en la sesión 2) | **Dentro** como segundo modo, **solo si el propietario cambia esa decisión** | 3.º |
| Escáner limitado | No existía | **Dentro**, en su versión mínima (un recuento) | 4.º |
| Sonido opcional en avisos | Solo vibración (M15) | Vibración por defecto y sonido opcional (D-036) | Con los avisos, tras S1 |

**S1 no cambia:** valida la ubicación con el móvil bloqueado usando Clásico con zona fija. Ninguno de estos elementos altera esa pregunta. El escáner y la zona dinámica solo añaden eventos, no más envíos de ubicación.
