# S1: protocolo de validación de ubicación en Android

**Versión:** 1.0 · 24/10/2026 (sesión 5)
**Estado:** prototipo escrito, **APK sin compilar** (bloqueo D-040) y **ninguna prueba en dispositivo ejecutada**.
**Dispositivo previsto:** Xiaomi 14T del propietario (modelo, versión de Android y de HyperOS por anotar en la primera prueba).
**Pregunta única:** ¿puede un cliente Android obtener y registrar ubicaciones suficientemente fiables con la pantalla bloqueada y durante el uso real?

Todos los umbrales de este documento son **EXPERIMENTALES** (D-038). No son objetivos aprobados.

---

## 1. Alcance

**Dentro:** permisos y consentimiento; estado del permiso y de la ubicación; registro de hora, antigüedad, precisión y huecos; pantalla encendida y bloqueada; pérdida de señal y de permiso; reapertura y cierre forzado; batería (aproximada); avisos locales (D-036).

**Fuera (decisión del propietario, sesión 5):** salas, cuentas, chat, pagos, Infección, capturas, escáner, zona dinámica, transporte de red e infraestructura. **No se transmite nada:** la app no tiene permiso de Internet. Por eso S1 **no** valida la latencia de red, la reconexión con un servidor ni las notificaciones *push* remotas. Eso queda para una fase posterior, cuando se resuelva D-014.

## 2. Arquitectura del prototipo (D-039, propuesta)

- **Variante V2:** `LocationManager.FUSED_PROVIDER` (Android 12+) con `QUALITY_HIGH_ACCURACY` y un intervalo **experimental** de 5 s, dentro de un **servicio en primer plano de tipo `location`** que se inicia desde la pantalla visible. El permiso es "mientras se usa la app".
- **Registro local:** CSV en el almacenamiento privado de la app, sin coordenadas, con una fila por posición y una por evento (pantalla, ahorro de energía, reposo, proveedor, huecos, latido, avisos y finales anómalos).
- **Análisis:** `AnalyzeCli` (módulo `core`) calcula las métricas de esta tabla a partir del CSV exportado.

## 3. Qué puede y qué no puede demostrar S1 sobre los avisos (D-036)

| Pregunta | ¿S1 lo demuestra? |
|---|---|
| ¿Se publica un aviso **local** desde el servicio con la pantalla bloqueada? | **Sí**: la app registra cuándo lo publica (`TEST_NOTIFICATION_POSTED`) |
| ¿Lo **percibe** la persona (vibración o sonido) en modo normal, silencio o "no molestar"? | Solo por **observación humana** anotada en la hoja de pruebas. La app no puede medir si sonó |
| ¿Llegan avisos **remotos** (*push*) con la app suspendida? | **No**: S1 no tiene red |
| Garantía de sonido con el móvil en silencio | **No se garantiza nunca** (D-036). En Android, el modo silencio y "no molestar" mandan sobre la app |

Restricciones de Android que conviene tener en cuenta (por verificar en el dispositivo):
- El usuario puede cambiar el sonido y la vibración de cada canal de notificación en los ajustes del sistema.
- Las capas como HyperOS pueden limitar las notificaciones y los procesos en segundo plano. La app muestra si tiene la batería "sin restricciones", pero no puede cambiarlo: lo hace el usuario en los ajustes.
- Para la vibración se usa la del canal de notificación. **No se ha añadido el permiso `VIBRATE`**. Si en el dispositivo no vibra, se valorará añadirlo, porque es un permiso normal que no requiere confirmación del usuario.

## 4. Preparación (una vez)

1. Instalar el APK (cuando exista; ver `android/README.md`).
2. Anotar el modelo, la versión de Android y HyperOS y la versión de Servicios de Google Play.
3. En la app: marcar el consentimiento → botón 1 (ubicación **precisa**, "mientras se usa la app") → botón 2 (notificaciones).
4. **No** cambiar los ajustes de batería de Xiaomi en la primera ronda: se mide primero el comportamiento por defecto.

## 5. Pruebas (todas PENDIENTES de ejecución física)

| ID | Prueba | Procedimiento | Métricas (del CSV o de la observación) | Umbral experimental |
|---|---|---|---|---|
| S1-T01 | Pantalla encendida | 10 min con la app visible, caminando al aire libre | Cobertura, antigüedad p50/p95, precisión p50/p95 | Cobertura ≥ 90 % [H] |
| S1-T02 | **Pantalla bloqueada** | Iniciar → bloquear → 30 min caminando al aire libre → desbloquear y detener | Cobertura y hueco máximo con la pantalla apagada (veredicto T05 del informe) | Cobertura ≥ 80 % y hueco ≤ 30 s [H] |
| S1-T03 | Bloqueada con ahorro de batería | Igual que T02 con el ahorro de batería activado | Igual que T02 | Informativa |
| S1-T04 | Ajuste de batería de Xiaomi | Repetir T02 con la batería de la app en "Sin restricciones" | Diferencia con T02 | Informativa: indica si hará falta guiar al usuario |
| S1-T05 | Pérdida de señal | Durante T02, entrar 2–3 min en un sitio sin cobertura de GPS (metro, garaje) y salir; anotar la hora de salida | Eventos `GAP_START`/`GAP_END`; tiempo desde la salida hasta la primera muestra `CURRENT` | Recuperación ≤ 30 s [H] |
| S1-T06 | Ubicación del sistema apagada | Con la sesión en marcha: desactivar la ubicación 1 min y reactivarla | `PROVIDER_DISABLED`/`ENABLED`; tiempo de recuperación | Se registra y se recupera sin reiniciar la sesión |
| S1-T07 | Permiso revocado | Con la sesión en marcha: quitar el permiso de ubicación desde los ajustes | Android suele cerrar el proceso. Al reabrir: aviso y `ABNORMAL_END_DETECTED` | Se detecta al reabrir |
| S1-T08 | Reapertura de la app | Con la sesión en marcha: salir con "atrás", esperar 5 min, reabrir | Sigue en marcha sin huecos anómalos; `APP_HIDDEN`/`APP_VISIBLE` | Sin interrupción |
| S1-T09 | Deslizar fuera de recientes | Con la sesión en marcha: quitar la app de recientes | `TASK_REMOVED`; si el servicio sigue o muere | Informativa (SCRAM dice que en su caso se detiene) |
| S1-T10 | Forzar detención y reinicio | Forzar la detención desde los ajustes → reabrir → iniciar una sesión nueva | `ABNORMAL_END_DETECTED`; la sesión nueva funciona | Se detecta y se puede reanudar con una sesión nueva |
| S1-T11 | Precisión y deriva | Quieto 5 min en un punto conocido (al aire libre y en interior), con "Marcar referencia" | Distancia a la referencia p50/p95; precisión declarada | Informativa (alimenta la tolerancia de las capturas) |
| S1-T12 | Batería | 60 min bloqueada, sin cargar, con la app. Y otros 60 min de referencia sin la app, en condiciones parecidas | Caída en %/h (resolución del 1 %) | ≤ 10 %/h [H] |
| S1-T13 | Avisos (D-036) | Con "Avisos de prueba" activado y la pantalla bloqueada, 10 min en cada modo: normal, silencio y "no molestar" | Se publican (CSV) y se perciben (anotación: vibró o sonó) | Informativa |
| S1-T14 | Privacidad del archivo | Revisar el CSV exportado | Ninguna columna ni campo con coordenadas | Obligatorio: 0 coordenadas |

**T12:** la medida incluye todo el consumo del móvil y tiene una resolución del 1 %, así que **no es fiable** para diferencias pequeñas. Se informará como aproximación.

## 6. Criterios de salida de S1 (experimentales)

- **S1 superada (V2 viable):** T02 o T04 alcanzan el umbral, T05 y T06 se recuperan, T07 y T10 se detectan, y T14 tiene 0 coordenadas.
  - Si solo se alcanza con T04 (batería "Sin restricciones"), la app final tendrá que **guiar al usuario** para cambiar ese ajuste, y eso es un requisito de experiencia de usuario.
- **S1 no superada:** se documenta la causa. Las alternativas, que requieren aprobación, son: probar la variante V1 (permiso de ubicación en segundo plano, con una revisión más estricta en Google Play) o cambiar la técnica (por ejemplo, el proveedor de Google Play Services).
- **Fuera de S1:** S2 (dos móviles), iOS (S3), red y servidor.

## 7. Hoja de resultados (rellenar en el dispositivo)

| ID | Fecha | Modelo / Android / HyperOS | Ajuste de batería | Red | Duración | Resultado del informe (`AnalyzeCli`) | Observación humana | ¿Supera? |
|---|---|---|---|---|---|---|---|---|
| S1-T01 | | | | | | | | PENDIENTE |
| S1-T02 | | | | | | | | PENDIENTE |
| … | | | | | | | | PENDIENTE |

Para analizar: exportar el CSV desde la app y compartirlo. `gradle -p android :core:analyze -Pcsv=<archivo>` genera el informe. El CSV no contiene coordenadas, pero sí horas, modelo del móvil y estados: compártelo solo si estás de acuerdo.

## 8. Riesgos de S1

| Riesgo | Mitigación |
|---|---|
| HyperOS cierra el servicio con la pantalla bloqueada | T04 mide el efecto del ajuste de batería. El informe lo deja claro |
| El proveedor fusionado de la plataforma se comporta distinto del de Google Play Services, que es el que usan Expo y muchas apps | Anotar la versión de los servicios. Si el resultado es malo, probar el de Google Play Services antes de descartar V2 |
| Una sola marca de móvil | Documentar el modelo. S2 añadirá otro dispositivo |
| El APK no se puede compilar en el contenedor | D-040: habilitar `dl.google.com` o compilar con Android Studio |
| Configuración de compilación (AGP 8.7.3) sin verificar | Primera compilación real = primera verificación. Corregir lo que salga |
