# Pruebas mínimas con dos teléfonos (manuales)

Ninguna de estas pruebas se ha hecho. Procedimiento completo: `mobile/PRUEBA_REAL_EN_CALLE.md`.

**Antes de salir:**
- servidor con `.\server\iniciar-servidor.ps1` (registro de diagnóstico activado);
- túnel con `cloudflared tunnel --url http://127.0.0.1:8787`;
- si queréis el mapa real, la clave configurada (`riesgos-tecnicos.md` §1, situación B).

**Mínimo para decidir el siguiente paso:**

| # | Prueba | Cómo | Qué anotar |
|---|---|---|---|
| 1 | Mapa real | Con la clave, abrid una partida en el ordenador antes de salir | ¿Calles, nombres y edificios? ¿Atribución «© MapTiler © OpenStreetMap contributors» visible? |
| 2 | Conexión por datos móviles | Los dos móviles con el wifi apagado abren la dirección del túnel | ¿Carga? ¿Pasa a «Conectado»? |
| 3 | Permiso y GPS | «Estoy listo» en cada móvil | ¿Se pide el permiso? Precisión «GPS ±N m» en la zona |
| 4 | Fases sincronizadas | Empezad una partida corta (10 min, huida de 2) | ¿Cuenta atrás y fases a la vez (±1 s) en los dos? ¿Cada uno ve solo su rol? |
| 5 | **Corte de cobertura** (riesgo R-03) | Un móvil en modo avión 30–60 s en plena persecución, y luego volver | ¿Vuelve solo? ¿La barra de GPS pasa de «Lectura antigua» a «GPS ±N m» en menos de 1 min? ¿El otro ve su posición renovada? Anota la hora si no |
| 6 | Pantalla bloqueada (R-01) | Bloquead un móvil 30 s y volved | ¿Avisa? ¿Se reanuda el envío al desbloquear? |
| 7 | Captura real | Toque suave y reclamación del cazador; el fugitivo confirma | ¿Hace falta desplazarse para reclamar (UX-01)? ¿Mensajes de rechazo («No estáis lo bastante cerca», «precisión insuficiente»)? Distancia real |
| 8 | Batería y datos | Batería al empezar y al terminar; uso de datos si el móvil lo muestra | % gastado en N min, con mapa o con radar |
| 9 | Resultado y revancha | Mission Report en los dos y «Revancha» sin reiniciar el servidor | ¿Mismo resultado? ¿Empieza la segunda partida? |

**Al terminar:**
1. Detened el túnel y el servidor (Ctrl+C). El informe de diagnóstico aparece en `%USERPROFILE%\OutrunDiagnostico\`; adjuntad el `.md`.
2. Apuntad qué persona era cada J1, J2…
3. No guardéis capturas del mapa con lugares reconocibles.
