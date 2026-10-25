# Pruebas físicas de H1 en el Xiaomi 14T

Estas pruebas **no se han hecho todavía**. Hasta que se hagan, no se puede afirmar que el GPS funciona bien.

**Antes de empezar**
- Batería por encima del 80 % y sin cargar. Anota el porcentaje al empezar y al terminar cada prueba.
- Ajustes de HyperOS que conviene anotar (no cambiar sin anotarlo): Ahorro de batería de la app (Ajustes › Aplicaciones › THE OUTRUN › Ahorro de batería), «Inicio automático» y modo de ahorro de energía del sistema.
- Para cada prueba: inicia la sesión, haz la prueba, pulsa **Detener** y luego **Exportar CSV** (guárdalo con el número de la prueba en el nombre). Apunta la hora de inicio y fin.
- Los umbrales indicados son **experimentales** (D-038): sirven para comparar, no son reglas.

| # | Prueba | Cómo | Qué anotar | Referencia experimental |
|---|---|---|---|---|
| 1 | Concesión y denegación de permisos | Instala de cero. Pulsa «Conceder permisos» y elige **Denegar**. Vuelve a pulsar y elige **Solo aproximada**. Vuelve a pulsar y concede **precisa, mientras se usa la app**. Repite una denegación hasta que Android deje de preguntar. | Qué muestra «Permisos» en cada caso. Que con la ubicación denegada no se puede iniciar. Que con «denegada de forma permanente» aparece el texto para ir a Ajustes. | Los estados de pantalla coinciden con lo elegido |
| 2 | Primera posición al aire libre | Al aire libre, cielo despejado. Inicia la sesión con 5 s y no te muevas. | Segundos hasta la primera lectura «Actual» y su precisión. | ≤ 30 s y ≤ 50 m |
| 3 | Caminata y carrera | 10 min caminando y 3 min corriendo (si es seguro), con la pantalla encendida y la app delante. | Huecos, precisión típica, si alguna lectura sale «Imprecisa». | Mediana entre lecturas ≤ 5 s; ≥ 80 % de lecturas «Actual» |
| 4 | Bloqueo de pantalla | Inicia la sesión, bloquea el móvil y camina 10 min. Desbloquea. | Si la notificación «THE OUTRUN está usando tu ubicación» sigue visible; huecos en el CSV con la pantalla apagada. | Sin huecos de más de 30 s |
| 5 | Cambio a otra aplicación | Con la sesión en marcha, abre otra app (navegador, mapas) 5 min y vuelve. | Si la sesión sigue, si al volver la pantalla muestra el estado real. | Sin huecos de más de 30 s |
| 6 | Pérdida de señal | Entra en un portal, garaje o metro 2–3 min y sal. | Que la lectura pasa a «Antigua» y luego a «No disponible» (nunca «Actual»), y que se recupera al salir. | Recuperación ≤ 30 s tras salir |
| 7 | Revocación de permisos | Con la sesión en marcha, ve a Ajustes y quita el permiso de ubicación. Vuelve a la app. | Android suele cerrar la app: al reabrirla debe aparecer «La sesión anterior terminó sin detenerse». | Nunca se muestra una lectura antigua como actual |
| 8 | Consumo de batería | Sesión de 60 min caminando con la pantalla bloqueada la mayor parte del tiempo. | % de batería al inicio y al final (también está en el CSV). | Dato a medir (el umbral está por decidir) |

**Pruebas complementarias (opcionales)**
- Ubicación del sistema desactivada: debe aparecer «La ubicación del sistema está desactivada» y no se puede iniciar.
- Botón **Detener** de la notificación: la sesión debe parar y desaparecer la notificación.
- Notificaciones denegadas (Android 13+): la sesión funciona, pero la app avisa de que no verás el aviso persistente.

**Qué enviar después**
Los CSV exportados (no contienen coordenadas) y tus notas por prueba. Con ellos se calculan cobertura, huecos, precisión y batería con el analizador de S1:
`gradle -p android :core:analyze -Pcsv=/ruta/al/archivo.csv` (desde la raíz del repositorio).
