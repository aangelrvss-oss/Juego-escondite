# Paquete de auditoría · THE OUTRUN · 27/10/2026

Revisión externa y crítica del estado real del proyecto. Rama `mapa-real` (commit `462016d` más cambios sin confirmar). **No hay commits ni push**, y no se han cambiado reglas, arquitectura ni funcionalidades.

## Cómo leerlo

1. **`informe-ejecutivo.md`:** estado, qué está demostrado y qué no, los 5 problemas principales y la recomendación. Empezad por aquí.
2. **`resultados-pruebas.md`:** cada prueba, su comando, su tipo (automatizada o simulación de navegador), su resultado y su registro; los fallos encontrados; los cambios hechos en las herramientas de prueba.
3. **`auditoria-ux.md`:** experiencia de un jugador nuevo, dónde se confunde o se aburre, y problemas P0–P3 con evidencia, consecuencia y propuesta (no implementada).
4. **`riesgos-tecnicos.md`:** verificación del mapa en tres situaciones (A simulada, hecha; B cartografía real, no hecha; C teléfono, no hecha) y riesgos para la calle, marcados como **[DEMOSTRADO-SIM]**, **[INSPECCIÓN]** o **[REQUIERE FÍSICO]**.
5. **`pendiente-prueba-fisica.md`:** las 9 pruebas mínimas con dos teléfonos.
6. **`capturas/`:** pantallas clave, con su descripción en `capturas/INDICE.md`.
7. **`registros/`:** la salida completa de cada prueba (numeradas como en `resultados-pruebas.md`).

## Vídeos (fuera del proyecto, para no meterlos en Git)

En `C:\Users\aange\Downloads\outrun-auditoria-20261027-videos\`:
- **`gameplay-auditoria.webm`** (3:04, 720×1480, sin cortes): partida completa vista por la cazadora, desde la pantalla inicial hasta el Mission Report y la revancha disponible. **Es una simulación:** tres jugadores son clientes simulados que usan el protocolo real, el GPS está emulado, el tiempo del servidor va acelerado en algunos tramos y el mapa tiene **calles sintéticas**. Un rótulo amarillo lo indica todo el tiempo.
- **`gameplay-resumen.webm`** (0:44): 9 tramos de esa misma grabación, reproducidos y grabados en Chromium, sin efectos.
- `HITOS.md` / `hitos.json`: minuto de cada momento. `resumen-tramos.json`: tramos del resumen.
- `intento-1-fallido\`: el primer intento, cortado a los 77 s por un fallo del script de grabación. Se conserva como evidencia.

Comprobado: los dos vídeos se decodifican enteros (ffmpeg) y se reproducen en Chromium (`registros/13-verificacion-videos.txt`).

## Cómo interpretar los resultados

- «Pasa» en una prueba de navegador significa **en un navegador de ordenador que emula un móvil**, con GPS, reloj y cartografía simulados. **No** significa que funcione en un teléfono en la calle.
- La cartografía real (MapTiler) **no se ha visto**: no hay clave.
- Lo marcado **[INSPECCIÓN]** sale de leer el código, no de una prueba.

## Reproducir

Desde la raíz del repositorio, con Node ≥ 22.18. En `mobile/`: `npm install`, `npx playwright install chromium` y `npm run vendor`. Los comandos exactos están en `resultados-pruebas.md`. Para el vídeo:

```
cd mobile
node e2e/gameplay-capture.mjs <carpeta>
```

## Relacionado

- Evidencias de la validación anterior del mapa: `C:\Users\aange\Downloads\outrun-evidencias-mapa-20261027\`.
- Documentación del proyecto: `PROJECT_STATE.md`, `QUALITY_STATE.md`, `mobile/MAPA.md`, `mobile/PRUEBA_REAL_EN_CALLE.md` y `docs/product/DECISIONES_PENDIENTES.md`.
