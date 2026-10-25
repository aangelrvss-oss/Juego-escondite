package es.escondite.s1.core;

/**
 * Registra una sesión de prueba: escribe filas CSV sin coordenadas, detecta huecos y lleva
 * contadores para la pantalla de estado. No es seguro para varios hilos: la app lo usa solo
 * desde el hilo principal del servicio.
 */
public final class SessionRecorder {

    public interface Sink {
        void write(String line);
    }

    private final Sink sink;
    private final long startElapsedMs;
    private long lastReceivedElapsedMs = -1;
    private boolean gapOpen;
    private long gapStartedAtMs = -1;
    private int fixes;
    private int gaps;
    private long lastAgeMs = -1;
    private float lastAccuracyM = Float.NaN;
    private Availability lastAvailability = Availability.UNAVAILABLE;

    public SessionRecorder(Sink sink, long startElapsedMs, long startWallClockMs, String detail, DeviceState state) {
        this.sink = sink;
        this.startElapsedMs = startElapsedMs;
        sink.write(CsvFormat.HEADER);
        event(EventType.SESSION_START, detail, startElapsedMs, startWallClockMs, state);
    }

    public void event(EventType type, String detail, long elapsedMs, long wallClockMs, DeviceState state) {
        sink.write(CsvFormat.eventRow(type, detail, elapsedMs, wallClockMs, state));
    }

    public void fix(FixSample f) {
        long gapMs = lastReceivedElapsedMs < 0 ? -1 : f.receivedElapsedMs() - lastReceivedElapsedMs;
        if (gapOpen) {
            long since = lastReceivedElapsedMs < 0 ? startElapsedMs : lastReceivedElapsedMs;
            event(EventType.GAP_END, "duration_ms=" + (f.receivedElapsedMs() - since),
                    f.receivedElapsedMs(), f.wallClockMs(), f.state());
            gapOpen = false;
        }
        sink.write(CsvFormat.fixRow(f, gapMs));
        lastReceivedElapsedMs = f.receivedElapsedMs();
        fixes++;
        lastAgeMs = f.ageMs();
        lastAccuracyM = f.accuracyM();
        lastAvailability = Availability.classify(f.ageMs(), f.accuracyM());
    }

    /** Se llama periódicamente: abre un hueco si no llegan muestras. */
    public void tick(long elapsedMs, long wallClockMs, DeviceState state) {
        long since = lastReceivedElapsedMs < 0 ? startElapsedMs : lastReceivedElapsedMs;
        if (!gapOpen && elapsedMs - since > ExperimentalParams.GAP_THRESHOLD_MS) {
            gapOpen = true;
            gapStartedAtMs = since;
            gaps++;
            event(EventType.GAP_START, "since_ms=" + (elapsedMs - since), elapsedMs, wallClockMs, state);
        }
    }

    public int fixes() {
        return fixes;
    }

    public int gaps() {
        return gaps;
    }

    public boolean gapOpen() {
        return gapOpen;
    }

    public long gapStartedAtMs() {
        return gapStartedAtMs;
    }

    /** Antigüedad de la última muestra en el momento de recibirla, o -1 si no hay. */
    public long lastAgeMs() {
        return lastAgeMs;
    }

    public float lastAccuracyM() {
        return lastAccuracyM;
    }

    public Availability lastAvailability() {
        return lastAvailability;
    }

    /** Tiempo desde la última muestra recibida, o -1 si no ha llegado ninguna. */
    public long msSinceLastFix(long elapsedMs) {
        return lastReceivedElapsedMs < 0 ? -1 : elapsedMs - lastReceivedElapsedMs;
    }
}
