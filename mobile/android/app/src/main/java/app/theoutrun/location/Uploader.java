package app.theoutrun.location;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

/**
 * Envía las lecturas al servidor de la partida por HTTPS desde un hilo propio (nunca el principal).
 * Solo se envía la última lectura pendiente: si la red va lenta, las intermedias se descartan en vez
 * de acumularse. La antigüedad se calcula al enviar con el reloj monótono (`elapsedMs`).
 * Sin reintentos propios: la siguiente lectura (cada ~5 s) es el reintento.
 */
final class Uploader {
    static final int TIMEOUT_MS = 10_000;

    /** Resultado de cada envío: código HTTP, o -1 si falló la red. Se llama desde el hilo del envío. */
    interface Callback {
        void onResult(int httpCode);
    }

    private static final class Fix {
        final double lat;
        final double lng;
        final double accuracyM;
        final long fixElapsedMs;
        final boolean mock;

        Fix(double lat, double lng, double accuracyM, long fixElapsedMs, boolean mock) {
            this.lat = lat;
            this.lng = lng;
            this.accuracyM = accuracyM;
            this.fixElapsedMs = fixElapsedMs;
            this.mock = mock;
        }
    }

    private final UploadConfig config;
    private final LongSupplier elapsedMs;
    private final Callback callback;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "outrun-upload");
        t.setDaemon(true);
        return t;
    });
    private final AtomicReference<Fix> latest = new AtomicReference<>();
    private final AtomicBoolean scheduled = new AtomicBoolean(false);
    private volatile boolean closed;

    Uploader(UploadConfig config, LongSupplier elapsedMs, Callback callback) {
        this.config = config;
        this.elapsedMs = elapsedMs;
        this.callback = callback;
    }

    void offer(double lat, double lng, double accuracyM, long fixElapsedMs, boolean mock) {
        if (closed) return;
        latest.set(new Fix(lat, lng, accuracyM, fixElapsedMs, mock));
        if (scheduled.compareAndSet(false, true)) executor.execute(this::drain);
    }

    private void drain() {
        scheduled.set(false);
        Fix fix = latest.getAndSet(null);
        if (fix == null || closed) return;
        String body = config.body(fix.lat, fix.lng, fix.accuracyM, elapsedMs.getAsLong() - fix.fixElapsedMs, fix.mock);
        int code = post(body);
        if (!closed) callback.onResult(code);
    }

    private int post(String body) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(config.url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setUseCaches(false);
            conn.setInstanceFollowRedirects(false); // el secreto nunca viaja a otra dirección
            conn.setDoOutput(true);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            conn.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            // Respuesta sin cuerpo: se lee y se cierra para que la conexión TLS se reutilice en el
            // siguiente envío (sin un nuevo saludo TLS cada 5 s).
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (in != null) {
                while (in.read() != -1) {
                    // vacía el cuerpo, si lo hay
                }
                in.close();
            }
            return code;
        } catch (IOException | RuntimeException e) {
            if (conn != null) conn.disconnect();
            return -1;
        }
    }

    void close() {
        closed = true;
        latest.set(null);
        executor.shutdownNow();
    }
}
