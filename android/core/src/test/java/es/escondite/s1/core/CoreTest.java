package es.escondite.s1.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

// Todas las sesiones de estas pruebas son SIMULADAS: validan el cálculo, no el dispositivo.
class CoreTest {

    private static final long T0 = 1_000_000L;
    private static final long WALL0 = 1_792_850_000_000L;
    private static final DeviceState ON = new DeviceState(true, true, 90, false, false, false);
    private static final Pattern COORDINATE_LIKE = Pattern.compile("-?\\d+\\.\\d{4,}");

    private static FixSample fix(long elapsed, long ageMs, float accuracy, DeviceState state, Double anchor) {
        return new FixSample(elapsed, elapsed - ageMs, WALL0 + elapsed, "fused", accuracy, 1.2f, false, anchor, state);
    }

    private static DeviceState off(int battery) {
        return new DeviceState(false, false, battery, false, false, false);
    }

    @Test
    void csvHasNoCoordinateColumns() {
        for (String c : CsvFormat.COLUMNS) {
            assertFalse(c.contains("lat") || c.contains("lon") || c.contains("lng"), c);
        }
    }

    @Test
    void detailRedactsAnythingThatLooksLikeACoordinate() {
        assertEquals("pos=[redacted],[redacted] ok", CsvFormat.sanitizeDetail("pos=40.41530,-3.684512 ok"));
        assertEquals("duration_ms=45000", CsvFormat.sanitizeDetail("duration_ms=45000"));
        assertEquals("a b", CsvFormat.sanitizeDetail("a\nb"));
    }

    @Test
    void rowsRoundTripAndKeepColumnCount() {
        String row = CsvFormat.eventRow(EventType.ERROR, "texto, con \"comillas\"", T0, WALL0, ON);
        List<String> parsed = CsvFormat.parseLine(row);
        assertEquals(CsvFormat.COLUMNS.length, parsed.size());
        assertEquals("texto, con \"comillas\"", parsed.get(18));
        assertEquals(CsvFormat.COLUMNS.length, CsvFormat.parseLine(CsvFormat.fixRow(fix(T0, 800, 6.24f, ON, 3.456), 5000)).size());
    }

    @Test
    void numbersAreRoundedSoNoFieldCanCarryACoordinate() {
        String row = CsvFormat.fixRow(fix(T0, 800, 6.23456f, ON, 12.987654), 5000);
        assertFalse(COORDINATE_LIKE.matcher(row).find(), row);
        assertTrue(row.contains(",6.2,"));
        assertTrue(row.contains(",13.0,"));
    }

    @Test
    void availabilityMatchesS0Hypotheses() {
        assertEquals(Availability.CURRENT, Availability.classify(15_000, 50f));
        assertEquals(Availability.STALE, Availability.classify(15_001, 5f));
        assertEquals(Availability.STALE, Availability.classify(1_000, 51f));
        assertEquals(Availability.STALE, Availability.classify(1_000, Float.NaN));
        assertEquals(Availability.STALE, Availability.classify(120_000, 5f));
        assertEquals(Availability.UNAVAILABLE, Availability.classify(120_001, 5f));
    }

    @Test
    void geoDistanceIsSane() {
        // 0,001° de latitud son unos 111 m.
        double d = Geo.distanceM(40.0, -3.0, 40.001, -3.0);
        assertTrue(Math.abs(d - 111.2) < 0.5, Double.toString(d));
    }

    @Test
    void recorderDetectsGapsAndClosesThemOnNextFix() {
        List<String> out = new ArrayList<>();
        SessionRecorder r = new SessionRecorder(out::add, T0, WALL0, "interval_ms=5000", ON);
        r.fix(fix(T0 + 5_000, 300, 5f, ON, null));
        r.tick(T0 + 30_000, WALL0, ON);
        assertFalse(r.gapOpen());
        r.tick(T0 + 35_001, WALL0, ON);
        assertTrue(r.gapOpen());
        r.tick(T0 + 50_000, WALL0, ON); // no abre un segundo hueco
        r.fix(fix(T0 + 65_000, 300, 5f, ON, null));
        assertFalse(r.gapOpen());
        assertEquals(1, r.gaps());
        assertEquals(2, r.fixes());
        assertEquals(1, out.stream().filter(l -> l.contains("GAP_START")).count());
        assertTrue(out.stream().anyMatch(l -> l.contains("GAP_END") && l.contains("duration_ms=60000")));
        assertEquals(CsvFormat.HEADER, out.get(0));
    }

    @Test
    void recorderOpensGapWhenNoFixEverArrives() {
        List<String> out = new ArrayList<>();
        SessionRecorder r = new SessionRecorder(out::add, T0, WALL0, "", ON);
        r.tick(T0 + ExperimentalParams.GAP_THRESHOLD_MS + 1, WALL0, ON);
        assertTrue(r.gapOpen());
        assertEquals(-1, r.msSinceLastFix(T0 + 40_000));
    }

    /** Sesión SIMULADA: 10 min con pantalla encendida y 20 min apagada, con un hueco de 60 s. */
    private static List<String> simulatedSession(boolean charging, boolean dropFixesWhileLocked) {
        List<String> out = new ArrayList<>();
        SessionRecorder r = new SessionRecorder(out::add, T0, WALL0, "simulated", ON);
        long t = T0;
        for (int i = 0; i < 120; i++) { // 10 min, pantalla encendida
            t += 5_000;
            r.fix(fix(t, 400, 6f, new DeviceState(true, true, 90, charging, false, false), 4.0 + (i % 5)));
        }
        r.event(EventType.SCREEN_OFF, "", t, WALL0 + t, off(90));
        for (int i = 0; i < 240; i++) { // 20 min, pantalla apagada
            t += 5_000;
            boolean inGap = i >= 100 && i < 112; // 60 s sin muestras
            if (inGap || (dropFixesWhileLocked && i % 2 == 0)) {
                r.tick(t, WALL0 + t, off(90 - i / 60));
                continue;
            }
            r.fix(fix(t, 900, 9f, new DeviceState(false, false, 90 - i / 60, charging, false, false), null));
        }
        return out;
    }

    @Test
    void analyzerComputesCoverageGapsAndBatteryFromASimulatedSession() {
        SessionAnalyzer.Summary s = SessionAnalyzer.analyze(simulatedSession(false, false));
        assertEquals(120, s.screenOn().fixes());
        assertEquals(228, s.screenOff().fixes());
        assertEquals(65_000, s.screenOff().maxGapMs()); // 13 intervalos de 5 s
        assertEquals(1, s.screenOff().gapsOverThreshold());
        assertTrue(s.screenOff().coverage() > 0.94 && s.screenOff().coverage() < 0.96, Double.toString(s.screenOff().coverage()));
        assertEquals(900, s.ageP95Ms());
        assertEquals(1, s.events().get("GAP_START"));
        assertEquals(1, s.events().get("SCREEN_OFF"));
        assertEquals(6.0, s.batteryDropPctPerHour(), 0.01); // 90 % → 87 % en 30 min
        assertEquals(6.0, s.anchorP50M(), 0.01); // valores 4–8 m repartidos por igual
        assertEquals("NO SUPERA el umbral experimental", s.exitVerdict()); // el hueco de 65 s supera 30 s
    }

    @Test
    void analyzerFlagsLowLockedCoverage() {
        SessionAnalyzer.Summary s = SessionAnalyzer.analyze(simulatedSession(false, true));
        assertTrue(s.screenOff().coverage() < ExperimentalParams.EXIT_MIN_LOCKED_COVERAGE);
        assertEquals("NO SUPERA el umbral experimental", s.exitVerdict());
    }

    @Test
    void batteryIsNotReportedWhileCharging() {
        SessionAnalyzer.Summary s = SessionAnalyzer.analyze(simulatedSession(true, false));
        assertNull(s.batteryDropPctPerHour());
        assertTrue(s.batteryNote().contains("cargando"));
    }

    @Test
    void analyzerRejectsForeignFiles() {
        assertThrows(IllegalArgumentException.class, () -> SessionAnalyzer.analyze(List.of("lat,lng", "1,2")));
    }

    @Test
    void reportNeverContainsCoordinateLikeNumbers() {
        String report = AnalyzeCli.report(SessionAnalyzer.analyze(simulatedSession(false, false)));
        assertFalse(COORDINATE_LIKE.matcher(report).find(), report);
        assertTrue(report.contains("EXPERIMENTALES"));
    }
}
