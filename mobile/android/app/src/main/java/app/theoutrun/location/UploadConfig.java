package app.theoutrun.location;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Destino del envío nativo de ubicación al servidor de la partida (contrato:
 * mobile/contract/location-bridge.json, «upload»; protocolo: server/protocol.ts, POST /api/loc).
 * Java puro: se prueba sin dispositivo. El secreto de la sesión solo vive en memoria.
 */
public final class UploadConfig {
    public static final String SCHEME = "https";
    public static final int MAX_URL_LENGTH = 512;
    public static final int MAX_PLAYER_ID_LENGTH = 64;
    public static final int MAX_SECRET_LENGTH = 128;
    /** Precisión desconocida: valor que nunca pasa el umbral de captura (igual que la interfaz). */
    static final double UNKNOWN_ACCURACY_M = 9_999;

    public final String url;
    public final String playerId;
    final String secret;

    private UploadConfig(String url, String playerId, String secret) {
        this.url = url;
        this.playerId = playerId;
        this.secret = secret;
    }

    private static boolean textUpTo(String v, int max) {
        return v != null && !v.isEmpty() && v.length() <= max;
    }

    /** Solo para las pruebas locales (servidor HTTP del JDK, sin TLS). */
    static UploadConfig unchecked(String url, String playerId, String secret) {
        return new UploadConfig(url, playerId, secret);
    }

    /** Destino válido (solo HTTPS, con host y sin credenciales en la URL) o null. */
    public static UploadConfig parse(String url, String playerId, String secret) {
        if (!textUpTo(url, MAX_URL_LENGTH) || !textUpTo(playerId, MAX_PLAYER_ID_LENGTH) || !textUpTo(secret, MAX_SECRET_LENGTH)) {
            return null;
        }
        try {
            URI uri = new URI(url);
            if (!SCHEME.equals(uri.getScheme()) || uri.getHost() == null || uri.getHost().isEmpty() || uri.getRawUserInfo() != null) {
                return null;
            }
        } catch (URISyntaxException e) {
            return null;
        }
        return new UploadConfig(url, playerId, secret);
    }

    /**
     * Cuerpo JSON de una lectura, con exactamente los campos del protocolo. `ageMs` se mide al enviar
     * con el reloj monótono del sistema; el servidor la convierte a su propia hora.
     */
    public String body(double lat, double lng, double accuracyM, long ageMs, boolean mock) {
        double acc = Double.isNaN(accuracyM) || Double.isInfinite(accuracyM) || accuracyM < 0 ? UNKNOWN_ACCURACY_M : accuracyM;
        return "{\"playerId\":" + quote(playerId)
                + ",\"secret\":" + quote(secret)
                + ",\"lat\":" + number(lat)
                + ",\"lng\":" + number(lng)
                + ",\"acc\":" + number(acc)
                + ",\"age\":" + Math.max(0, ageMs)
                + ",\"mock\":" + mock + "}";
    }

    private static String number(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) throw new IllegalArgumentException("no finito");
        return Double.toString(v);
    }

    static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    /** Error del contrato («uploadErrors») para una respuesta HTTP, o null si fue bien (2xx). */
    public static String errorFor(int httpCode) {
        if (httpCode >= 200 && httpCode < 300) return null;
        if (httpCode == 401) return "unauthorized";
        if (httpCode == 410) return "ended";
        if (httpCode >= 400 && httpCode < 500) return "rejected";
        return "network";
    }

    /** 401 (sesión no válida) y 410 (ya no comparte ubicación): el servicio deja de enviar y termina. */
    public static boolean endsSession(int httpCode) {
        return httpCode == 401 || httpCode == 410;
    }

    /** No se registra nunca el secreto. */
    @Override
    public String toString() {
        return "UploadConfig(" + url + ")";
    }
}
