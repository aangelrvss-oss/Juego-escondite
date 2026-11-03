# Checklist de la prueba física controlada (2 teléfonos como mínimo)

**Estado inicial de todos los casos: PENDIENTE. No se ha hecho ninguna prueba física.**

- **Estados:** PENDIENTE · APROBADO · FALLIDO · BLOQUEADO.
- **Móviles:** A = anfitrión y cazador; B = fugitivo (intercambiad en la revancha).
- **Arranque:** `QA/ARRANQUE_PRUEBA.md`.
- **Anotad antes de empezar:** modelo, sistema y navegador de cada móvil, batería, hora y zona (un nombre genérico, no la dirección).

| ID | Área | Procedimiento | Resultado esperado | Resultado observado | Estado | Observaciones |
|---|---|---|---|---|---|---|
| F-01 | Preparación | `.\server\iniciar-servidor.ps1 -SoloComprobar` y después el arranque y el túnel | `SERVIDOR LISTO` y una dirección `https://….trycloudflare.com` | | PENDIENTE | |
| F-02 | Conexión | A y B, con datos móviles, abren `/health` | `{"ok":true,…}` | | PENDIENTE | |
| F-03 | Conexión | A crea la sala; B entra con el código y luego por el QR | Los dos ven la misma lista y el mismo código | | PENDIENTE | |
| F-04 | Permisos | B pulsa «Estoy listo» por primera vez | Pide el permiso de ubicación; tras aceptarlo, «Listo» | | PENDIENTE | |
| F-05 | Permisos | Con el permiso **denegado** (B), y luego concedido en los ajustes del navegador | Aviso claro; «Reintentar» funciona tras concederlo | | PENDIENTE | |
| F-06 | Cartografía | Con la clave configurada, empezad la partida | Calles con nombres y atribución «© MapTiler © OpenStreetMap contributors» visible | | PENDIENTE | Si sale el radar, anotad el mensaje |
| F-07 | Cartografía | Zoom con dos dedos, arrastrar, «Mi posición», «Ver zona» | Responden; el zoom se mantiene al llegar posiciones | | PENDIENTE | |
| F-08 | Inicio | A configura (zona de 200–300 m, 10 min, pistas cada 2 min) y empieza | Cuenta atrás y tarjeta del rol en los dos (cada uno solo el suyo) | | PENDIENTE | |
| F-09 | Sincronización | Comparad los relojes de A y B en la huida y en la persecución | Misma fase; diferencia de 1 s o menos | | PENDIENTE | Diferencia en s: |
| F-10 | Precisión GPS | Anotad «GPS ±N m» de cada uno, quietos y andando | N anotado; para capturar hace falta 30 m o mejor | | PENDIENTE | N(A)=  N(B)= |
| F-11 | Movimiento | B anda 100 m; A mira el mapa en la siguiente pista | La pista aparece hueca con «hace N s», en la calle correcta | | PENDIENTE | ¿Coincide con el sitio real? |
| F-12 | Movimiento | Con más de un cazador o fugitivo: el compañero se mueve | Su marcador se mueve cada ~5 s; los de más de 15 s, atenuados | | PENDIENTE | |
| F-13 | Captura fuera de distancia | A reclama a B estando a más de 40 m | «No estáis lo bastante cerca para validar la captura.»; B no recibe nada | | PENDIENTE | Distancia real: |
| F-14 | Captura dentro de distancia | Toque suave; A pulsa el nombre de B en la tarjeta de abajo | B recibe «¿Te ha pillado A?» con 30 s | | PENDIENTE | ¿Hizo falta desplazarse? |
| F-15 | Rechazo | B pulsa «No» | A ve «Captura rechazada»; B sigue jugando | | PENDIENTE | |
| F-16 | Confirmación | Nueva reclamación; B pulsa «Sí, me ha pillado» | Un solo aviso «Captura: B» en A; B pasa a espectador | | PENDIENTE | |
| F-17 | Pérdida de cobertura | B en modo avión 60 s en plena persecución, y luego vuelve | Aviso «Sin conexión…»; al volver reconecta solo y la barra pasa a «GPS ±N m» en menos de 1 min | | PENDIENTE | **Riesgo R-03: anotad la hora si el GPS no se renueva** |
| F-18 | Reconexión con reclamación | A reclama; B activa el modo avión antes de responder y vuelve antes de 30 s | Al volver, B ve la reclamación y puede responder | | PENDIENTE | |
| F-19 | Bloqueo de pantalla | B bloquea la pantalla 30 s (navegador) | Durante el bloqueo no se envía la ubicación (es lo esperado); al desbloquear se reanuda | | PENDIENTE | La app Android con la pantalla bloqueada: sin probar |
| F-20 | Otra aplicación | B cambia a otra app 30 s y vuelve | Vuelve a la partida; posición renovada | | PENDIENTE | |
| F-21 | Resultados | Termina la partida (por tiempo o captura) | El mismo Mission Report en A y B | | PENDIENTE | |
| F-22 | Revancha | A pulsa «Revancha»; B, «Unirme a la revancha» | Nueva sala de espera sin reiniciar el servidor | | PENDIENTE | |
| F-23 | Finalización | Ctrl+C en el túnel y en el servidor; comprobaciones de cierre | La dirección deja de responder; nada escuchando | | PENDIENTE | |
| F-24 | Batería y datos | % de batería y datos al empezar y al terminar | Anotados | | PENDIENTE | A: % → %   B: % → % |
| F-25 | Incidencias | Cualquier comportamiento extraño | Anotado con la hora y el móvil | | PENDIENTE | Adjuntad el informe `%USERPROFILE%\OutrunDiagnostico\*.md` |

**Criterio mínimo de éxito:** F-03, F-08, F-09, F-14, F-16, F-17 y F-21 en APROBADO. Si F-17 falla, es el problema prioritario.
