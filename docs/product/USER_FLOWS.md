# Flujos de usuario del MVP

**Versión:** 1.0 · 24/10/2026 · **Estado:** propuesta [PENDIENTE de revisión]
Reglas del motor: [`docs/technical/GAME_STATE_MACHINE.md`](../technical/GAME_STATE_MACHINE.md). Los textos de interfaz son provisionales.

Principio de diseño: **mirar la pantalla lo mínimo mientras se camina.** Lo importante llega por vibración y pantallas completas de un vistazo; el mapa se consulta solo en momentos concretos.

---

## F1. Primera apertura
1. Pantalla de bienvenida: qué es la app en una frase.
2. **"Tengo 18 años o más"** (casilla obligatoria) y enlaces a las normas y a la privacidad.
3. Nombre visible (2–20 caracteres, filtro básico de palabras ofensivas).
4. Pantalla principal: **[Crear partida]** **[Unirme]**.

*Los permisos de ubicación y notificaciones **no** se piden aquí, sino en el momento en que hacen falta (F4).*

**Estados de error:** no hay conexión → "Sin conexión. Necesitas internet para jugar" con [Reintentar].

## F2. Crear sala (anfitrión)
1. [Crear partida] → el servidor crea la sala y devuelve el código.
2. La pantalla de sala de espera muestra: **código grande**, botón [Compartir enlace] (menú del sistema, para WhatsApp, por ejemplo) y botón [Mostrar QR] (pantalla completa).

## F3. Unirse
- **Por enlace**: si la app está instalada, se abre la sala directamente. Si no, la página de invitación muestra el código y los enlaces de descarga, y al instalar se introduce el código.
- **Por QR**: la cámara del sistema o el lector de la app abre el enlace.
- **Por código**: [Unirme] → 6 casillas → [Entrar].

**Errores (cada uno con su mensaje):**

| Caso | Mensaje |
|---|---|
| El código no existe | "No encontramos esa partida. Revisa el código." |
| Sala caducada | "Esta partida ha caducado. Pide un código nuevo." |
| La partida ya ha empezado | "La partida ya ha empezado. Podrás entrar en la revancha." |
| Sala llena (20) | "La partida está completa." |
| Bloqueado por el anfitrión | Mismo mensaje que "no existe" (no se revela el bloqueo) |
| Demasiados intentos | "Demasiados intentos. Espera un minuto." |

## F4. Sala de espera
1. Lista de jugadores: nombre, equipo, ✓ listo y conectado o desconectado.
2. Cada jugador elige **Cazador, Fugitivo o Aleatorio**.
3. **Comprobación de permisos** al pulsar "Estoy listo":
   - Explicación previa: "Durante la partida tu ubicación se comparte solo con tu equipo y según las reglas. Al terminar, se deja de compartir y se borra."
   - Petición de permiso del sistema (la variante concreta depende de la prueba técnica).
   - Notificaciones: "Te avisaremos con una vibración de las pistas y las capturas."
   - En Android: aviso sobre la optimización de batería si el fabricante la aplica [H].
4. El anfitrión ve [Configurar] y [Empezar] (desactivado hasta cumplir las condiciones de T1, con el motivo visible).
5. El anfitrión puede **expulsar** (mantener pulsado sobre un jugador).

**Permiso denegado:** el jugador no puede marcarse como listo. Pantalla "Sin ubicación no se puede jugar", con [Abrir ajustes] y una explicación. **Ubicación aproximada** (Android 12+ e iOS): aviso de que la precisión es insuficiente y petición de la precisa.

## F5. Configurar (anfitrión)
1. Ajustes predefinidos: **"Parque · 30 min"**, **"Barrio · 60 min"** y **"Personalizado"**.
2. **Zona**: el anfitrión arrastra el mapa y ajusta el radio con una barra. La zona se ve sombreada.
3. **Punto de encuentro**: obligatorio, por defecto el centro de la zona. Se puede mover.
4. Ajustes avanzados: duración, ventaja e intervalo de pistas.
5. **Lista de seguridad** (obligatoria antes de empezar), que el anfitrión marca:
   - [ ] La zona no incluye vías rápidas, vías del tren ni agua.
   - [ ] No hace falta entrar en propiedades privadas ni en recintos cerrados.
   - [ ] Todos saben dónde está el punto de encuentro.
   - Texto fijo: "La app no puede comprobar si una zona es segura. Elegidla vosotros con sentido común."
6. Si la hora local está entre la puesta y la salida del sol (o, más simple, entre las 21:00 y las 7:00 [P]): aviso de juego nocturno con recomendaciones.

## F6. Inicio
1. [Empezar] → cuenta atrás de 10 s en todos los móviles (sincronizada por el servidor).
2. Pantalla completa del rol: **"Eres CAZADOR. Espera 3 min"** / **"Eres FUGITIVO. ¡Corre a esconderte!"**, con las normas clave (3 líneas como mucho).
3. Vibración y recordatorio: "Puedes bloquear el móvil. Te avisaremos."

## F7. Ventaja inicial
- **Fugitivo**: mapa con la zona, sus compañeros, la cuenta atrás y el aviso "Quedan 30 s de ventaja".
- **Cazador**: pantalla de espera con la cuenta atrás. No recibe ubicaciones de los fugitivos.
- Al terminar: vibración en todos y "¡Empieza la caza!".

## F8. Partida activa
**Fugitivo:** barra superior con el tiempo restante, la **próxima pista en X** y los fugitivos libres. Mapa con la zona, él mismo y sus compañeros. Botón grande [Me han pillado]. Estado de su señal ("GPS bien / impreciso / sin señal").
**Cazador:** igual, pero el mapa muestra la **última pista** (marcadores con "hace X") y a sus compañeros. Botón [He pillado a…] → lista de fugitivos ordenada por distancia a la última pista.

Avisos con el móvil bloqueado (solo vibración y texto de notificación):

| Evento | Quién | Texto |
|---|---|---|
| Pista en 1 min | Fugitivos | "Pista en 1 min. Muévete." |
| Pista enviada | Fugitivos y cazadores | "Pista enviada" / "Nueva pista: 3 fugitivos" |
| Fuera de zona | El afectado | "Estás fuera de la zona. Vuelve en 30 s o te verán." |
| Captura | Todos | "Pablo ha sido capturado por Ana" |
| Faltan 5 min | Todos | "Quedan 5 minutos" |
| Fin | Todos | "¡Se acabó! Mirad el resultado" |

## F9. Captura
- **Vía A (fugitivo)**: [Me han pillado] → ¿quién? → confirmar → pasa a espectador.
- **Vía B (cazador)**: [He pillado a…] → elige fugitivo → el servidor comprueba →
  - Si falla, el cazador ve el motivo: "No estáis lo bastante cerca según el GPS", "Tu ubicación no está actualizada" o "Su ubicación no está actualizada". **No se revela la posición del fugitivo.**
  - Si es plausible, el fugitivo recibe un aviso prioritario a pantalla completa: "¿Te ha pillado Ana?" [Sí] [No] (30 s).
  - Resultado para ambos: confirmada, rechazada o caducada.

## F10. Pérdida de señal y reconexión
- Indicador permanente: conectado, reconectando o sin conexión.
- Sin red: "Sin conexión. Sigues en la partida; tu posición se enviará al volver." Las posiciones se guardan con su hora.
- Al volver: sincronización automática y aviso discreto "Reconectado".
- GPS impreciso (> 50 m): "Tu GPS es impreciso. Sal a un sitio más abierto."

## F11. Abandonar
Menú → [Abandonar partida] → confirmación: "Dejarás de compartir tu ubicación y no podrás volver a esta partida." → se va.

## F12. Final y resultados
1. Pantalla completa: **"¡Ganan los fugitivos!"** (o la causa correspondiente).
2. Resumen: duración, capturas (quién, a quién y en qué minuto) y fugitivos que sobrevivieron. **Sin mapas ni recorridos.**
3. Botones: [Revancha] (anfitrión), [Unirme a la revancha] (resto) y [Salir].
4. Texto: "Ya no se comparte tu ubicación."

## F13. Revancha
1. El anfitrión pulsa [Revancha] → elige "mismos equipos" o "intercambiar roles" → nueva sala de espera con el mismo código.
2. Quien acepta vuelve a la sala de espera, con la configuración anterior precargada.

## F14. Bloquear o denunciar [Recomendable]
Mantener pulsado sobre un jugador en la sala de espera o en los resultados → [Bloquear] / [Denunciar] (abre el correo de contacto con el código de la partida).
