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
2. Cada jugador elige **Cazador, Fugitivo o Aleatorio**. ⚠ *Sesión 4: lo sustituye la asignación por sala (F15). Si se mantienen las preferencias en el sorteo está pendiente.*
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
1. [Empezar] → cuenta atrás visual de **5 s** en todos los móviles (sincronizada por el servidor). **Nadie conoce su rol todavía** (D-042).
2. Al terminar, cada jugador descubre **su** rol en pantalla completa: **"CAZADOR · espera en la zona de salida"** / **"FUGITIVO · aléjate caminando"**, con el tiempo de huida restante y las normas clave (3 líneas como mucho). En la partida real la revelación no para el tiempo de huida (manda la hora del servidor).
3. Vibración y recordatorio: "Puedes bloquear el móvil. Te avisaremos."

## F7. Ventaja inicial
- **Fugitivo**: mapa con la zona, sus compañeros, la cuenta atrás y el aviso "Quedan 30 s de ventaja".
- **Cazador**: pantalla de espera con la cuenta atrás. No recibe ubicaciones de los fugitivos. Si se aleja de la zona de salida con una lectura fiable, recibe un **aviso** (sin sanción, D-042).
- **Tiempo de huida:** lo elige el anfitrión al configurar la sala; mínimo y valor por defecto, 2 min (D-042). Al llegar a cero, el servidor habilita la persecución para todos a la vez.
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
1. El anfitrión pulsa [Revancha] → elige "mismos equipos" o "intercambiar roles" → nueva sala de espera con el mismo código. ⚠ *Sesión 4: lo sustituyen las opciones de ronda de F20 (D-037, pendiente).*
2. Quien acepta vuelve a la sala de espera, con la configuración anterior precargada.

## F14. Bloquear o denunciar [Recomendable]
Mantener pulsado sobre un jugador en la sala de espera o en los resultados → [Bloquear] / [Denunciar] (abre el correo de contacto con el código de la partida).

---

## Flujos añadidos en la sesión 4 [BORRADOR: dependen de D-030 y de los parámetros de `GAME_MODES_AND_RULES.md`]

## F15. Crear sala: modo y equipos
1. [Crear partida] → elegir **modo**: Clásico o Infección (si D-030 lo aprueba).
2. Elegir **asignación de equipos**: [Sorteo automático] o [Selección manual].
3. Elegir **proporción de cazadores**: Pocos, Equilibrado o Muchos (este último solo en Clásico). La app muestra el resultado con el tamaño actual ("Con 8 jugadores: 2 cazadores").
4. **Manual:** en la sala de espera, el anfitrión arrastra a cada jugador a su equipo. [Empezar] se bloquea si algún equipo queda vacío. Salirse de la proporción: aviso o bloqueo (pendiente).
5. **Automático:** el sorteo se hace al pulsar [Empezar] y cada jugador ve su rol en la pantalla de F6.

## F16. Infección: convertirse en cazador [AMPLIACIÓN FUTURA, D-030]
1. Se confirma la captura (F9) → el convertido recibe una pantalla completa con vibración: **"Te han infectado. Ahora eres CAZADOR. Podrás capturar en 60 s"** (valor de `T_transición` pendiente).
2. Su mapa cambia al instante: deja de ver a los fugitivos y ve a los cazadores (según el parámetro de §3.3).
3. Cuenta atrás visible hasta poder capturar. El botón [He pillado a…] está desactivado hasta entonces.
4. Los demás reciben "Pablo ha sido infectado por Ana".
5. Final: "¡Todos infectados! Ganan los cazadores" o "¡Tiempo! Ganan los supervivientes".

## F17. Zona dinámica: aviso y cambio [DISEÑO PREVISTO, parámetros en hipótesis, D-032]
1. `T_aviso` antes del cambio: vibración y **"La zona cambia en 3 min"**. El mapa muestra la zona nueva superpuesta.
2. Si el jugador está fuera de la zona nueva: "Muévete con calma hacia la zona marcada. Tienes 3 min." Nunca "corre".
3. En el cambio: vibración, la zona nueva pasa a ser la vigente y empieza la gracia de `T_gracia_cambio`.
4. Pasada la gracia, un fugitivo que siga fuera queda expuesto (como en F8). Un cazador fuera no puede capturar (D-033).

## F18. Escáner (cazador) [DISEÑO FUTURO: pistas aproximadas, D-034]
1. Botón [Escanear (2)] con los usos restantes. Desactivado durante el enfriamiento (cuenta atrás visible).
2. Resultado: **"2 fugitivos a menos de 100 m (según ubicaciones recientes)"**. Sin mapa, dirección ni nombres.
3. Si se aprueba avisar al escaneado: los fugitivos dentro del radio sienten una vibración y leen "Un cazador ha escaneado tu zona".

## F19. Disputa de una captura
> **Sesión 5 (D-035):** la disputa queda **pendiente** sin eliminar al fugitivo, y se resuelve antes del final: la aceptan o retiran los implicados, o, al cerrar la ventana de resolución, se aplica la regla predeterminada (propuesta: "no hay captura"). Ver `GAME_MODES_AND_RULES.md` §9.3. Los pasos siguientes son la versión de la sesión 4 y valen solo en lo que no contradigan esto.
1. El fugitivo pulsa [No] ante "¿Te ha pillado Ana?".
2. Ambos ven: **"Captura disputada. Seguid jugando."** El cazador ve la cuenta atrás del enfriamiento antes de poder volver a reclamar a ese fugitivo.
3. En el resultado final: "Capturas disputadas: Pablo (2)".
4. Recordatorio fijo en F9: la captura es un toque suave; no se discute en la calzada.

## F20. Siguiente ronda
> **Sesión 5 (D-037):** solo se ofrecen **sorteo nuevo** y **primeros capturados como cazadores**. La rotación equilibrada queda pospuesta. Que exista selección manual entre rondas se deduce de D-031 (selección manual) y está pendiente de confirmar.
1. En el resultado, el anfitrión pulsa [Otra ronda] → elige cómo formar los equipos (según lo que se apruebe):
   - **Sorteo nuevo**
   - **Los primeros capturados empiezan cazando**
   - **Rotación equilibrada**
   - **Manual**
2. La app muestra la previsión de equipos antes de confirmar. Los jugadores aceptan la invitación (como en F13).
