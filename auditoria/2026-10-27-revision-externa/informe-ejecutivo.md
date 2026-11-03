# THE OUTRUN · Informe ejecutivo de auditoría · 27/10/2026

**Estado general:** un prototipo jugable de principio a fin **en simulación**, con un servidor autoritativo bien probado. **Nunca se ha jugado con teléfonos reales, nunca se ha visto el mapa con cartografía real, y la experiencia tiene varios puntos débiles conocidos.** No está demostrado que una partida en la calle funcione.

## 1. Qué está demostrado y con qué

| Afirmación | Nivel de evidencia |
|---|---|
| Las reglas cubren sala, roles, cuenta atrás, huida, persecución, pistas, zona, capturas, final y revancha | Pruebas automatizadas del motor (144) y del servidor (68) |
| El servidor es la autoridad y cada jugador recibe solo lo que puede ver | Pruebas del servidor y E2E con 5 navegadores (sin roles ni posiciones ajenas) |
| Resiste mensajes hostiles, repeticiones, acciones simultáneas y reconexiones | Pruebas del servidor (`hostile`, `capture-race`, `reconnect`, `persistence`, `crash`) |
| Una partida completa se juega en la interfaz real | E2E en navegadores emulando móviles (`web-flow` 41, `game` 8 etapas) y grabación de 3:05 |
| El mapa no se reinicia, conserva el zoom, respeta la visibilidad y vuelve al radar si falla | `map.e2e` 26/26 con **cartografía simulada** |

## 2. Solo en simulación

- **GPS** (emulado), **tiempo** (reloj del servidor controlado) y **cartografía** (estilo local o calles sintéticas).
- **Gestos táctiles:** eventos del navegador, no un dedo.
- **Conexión:** cortes simulados, no cobertura real.
- **Jugadores:** tres de los cuatro de la grabación son clientes simulados que usan el protocolo real.

## 3. Pruebas

**Todas pasan:**

| Prueba | Resultado |
|---|---|
| TypeScript | sin errores |
| Motor | 144 |
| Servidor | 68 |
| Cliente | 109 |
| Demo | 62 |
| `web-flow` | 41/41 |
| `game` | 8/8 |
| `map` | 26/26 |
| `layout` | 6/6 |
| `boot` | 4/4 |

**Fallos y matices** (detalle en `resultados-pruebas.md`):
- **La E2E de la demo** falla tal cual (Playwright no está en la raíz) y pasa con `NODE_PATH`.
- **El primer intento de grabación** falló por un error de mi script, ya corregido; el intento fallido se conserva.
- **El fallo intermitente del GPS tras reconectar** (2 de 18 en la sesión anterior) sigue sin explicar; hoy no apareció.

## 4. Sin verificar

- La cartografía real, porque no hay clave.
- **Ninguna prueba con teléfonos:** GPS real, pantalla bloqueada, cobertura, batería, latencia con datos móviles, la APK Android ni iPhone/Safari.
- Personas que juegan por primera vez.
- El espectador tras la captura.

## 5. Los cinco problemas más importantes

1. **Nunca se ha jugado en la calle.** Todo lo que importa físicamente (GPS, cobertura, pantalla, batería y latencia) está sin demostrar (R-01, R-02, R-05, R-13).
2. **El GPS puede quedarse sin renovar tras una reconexión.** Pasó en 2 de 18 ejecuciones simuladas y la causa no está confirmada (R-03).
3. **La acción de captura queda debajo del mapa** en un móvil de 360×740: hay que desplazarse en plena persecución (UX-01, P1).
4. **La captura depende de que el fugitivo la confirme**, sin regla de disputas (D-035), y **el servidor no puede verificar la posición** que envía cada móvil (R-07, R-08). Funciona entre amigos, pero es frágil con desconocidos.
5. **La cartografía real está sin validar** (situación B), y la clave del mapa es pública por diseño y difícil de restringir con un túnel cuya dirección cambia (R-11).

## 6. Riesgos principales antes de la partida física

- La pantalla debe ir encendida en el navegador.
- La precisión entre edificios puede impedir capturar (30 m o mejor exigidos).
- La recuperación tras perder cobertura (R-03).
- El portátil y el túnel son el único punto de fallo.
- Batería desconocida.
- Acordar un canal de voz externo, porque no hay radio.

## 7. Recomendación (no ejecutada)

Hacer **una sesión corta con dos teléfonos**: los 9 puntos de `pendiente-prueba-fisica.md`, unos 45 minutos, primero con la clave de MapTiler configurada. Las prioridades son el corte de cobertura (R-03) y la captura real (UX-01).

**No** empezaría el rediseño de la interfaz (UX-01, UX-03 a UX-08) ni la radio hasta tener esos datos, porque cambian qué es urgente. Lo que **sí** conviene decidir antes de jugar con más gente es D-035 (disputas de captura).
