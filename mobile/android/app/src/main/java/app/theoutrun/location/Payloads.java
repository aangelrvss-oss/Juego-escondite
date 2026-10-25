package app.theoutrun.location;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Datos que el módulo nativo entrega a la interfaz, con los nombres y tipos del contrato
 * (mobile/contract/location-bridge.json). Java puro: se prueba sin dispositivo.
 * Las coordenadas solo viajan en la lectura hacia la pantalla; nunca se guardan.
 */
public final class Payloads {
    private Payloads() {}

    private static Object finiteOrNull(double v) {
        return Double.isNaN(v) || Double.isInfinite(v) ? null : v;
    }

    public static Map<String, Object> reading(String sessionId, double lat, double lng, float accuracyM, long ageMs,
                                              long receivedAt, long measuredAt, String provider, boolean isMock,
                                              float speedMps) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sessionId", sessionId);
        m.put("lat", lat);
        m.put("lng", lng);
        // Precisión desconocida o negativa: null, nunca 0 (que parecería exacta).
        m.put("accuracyM", Float.isNaN(accuracyM) || accuracyM < 0 ? null : finiteOrNull(accuracyM));
        m.put("ageMs", Math.max(0, ageMs));
        m.put("receivedAt", receivedAt);
        m.put("measuredAt", measuredAt);
        m.put("provider", provider == null ? "desconocido" : provider);
        m.put("isMock", isMock);
        m.put("speedMps", finiteOrNull(speedMps));
        return m;
    }

    public static Map<String, Object> status(boolean running, String sessionId, long intervalMs, int fixes, int gaps,
                                             boolean gapOpen, String provider, String lastError, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("running", running);
        m.put("sessionId", sessionId);
        m.put("intervalMs", intervalMs);
        m.put("fixes", fixes);
        m.put("gaps", gaps);
        m.put("gapOpen", gapOpen);
        m.put("provider", provider);
        m.put("lastError", lastError);
        m.put("message", message);
        return m;
    }

    public static Map<String, Object> provider(boolean locationEnabled, String provider, boolean fusedAvailable, boolean gpsEnabled) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("locationEnabled", locationEnabled);
        m.put("provider", provider);
        m.put("fusedAvailable", fusedAvailable);
        m.put("gpsEnabled", gpsEnabled);
        return m;
    }

    public static Map<String, Object> permissions(String location, String notifications) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("location", location);
        m.put("notifications", notifications);
        return m;
    }
}
