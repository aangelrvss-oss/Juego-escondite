package es.escondite.s1.core;

/**
 * Una posición recibida, SIN coordenadas. Las coordenadas solo existen de forma transitoria
 * en la app (para calcular {@code anchorDistanceM}) y nunca se guardan.
 *
 * @param receivedElapsedMs  reloj monotónico del sistema al recibirla
 * @param fixElapsedMs       reloj monotónico en el que se midió (Location#getElapsedRealtimeNanos)
 * @param wallClockMs        hora de pared al recibirla (solo para leer el informe)
 * @param accuracyM          precisión horizontal declarada, o NaN si no hay
 * @param speedMps           velocidad declarada, o NaN si no hay
 * @param anchorDistanceM    distancia al punto de referencia, o null si no hay referencia
 */
public record FixSample(
        long receivedElapsedMs,
        long fixElapsedMs,
        long wallClockMs,
        String provider,
        float accuracyM,
        float speedMps,
        boolean mock,
        Double anchorDistanceM,
        DeviceState state) {

    public long ageMs() {
        return Math.max(0, receivedElapsedMs - fixElapsedMs);
    }
}
