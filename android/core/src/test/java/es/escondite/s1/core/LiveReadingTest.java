package es.escondite.s1.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.RecordComponent;
import java.util.Locale;
import org.junit.jupiter.api.Test;

// Lógica de la "Lectura actual" (pantalla). Valores SIMULADOS: no prueban el GPS del dispositivo.
class LiveReadingTest {

    @Test
    void freshnessBoundaries() {
        assertEquals(LiveReading.Freshness.NONE, LiveReading.freshness(-1));
        assertEquals(LiveReading.Freshness.UPDATED, LiveReading.freshness(0));
        assertEquals(LiveReading.Freshness.UPDATED, LiveReading.freshness(15_000));
        assertEquals(LiveReading.Freshness.OLD, LiveReading.freshness(15_001));
        assertEquals(LiveReading.Freshness.OLD, LiveReading.freshness(3_600_000));
    }

    @Test
    void accuracyBoundariesAreIndependentOfFreshness() {
        assertEquals(LiveReading.Accuracy.SUFFICIENT, LiveReading.accuracy(0f));
        assertEquals(LiveReading.Accuracy.SUFFICIENT, LiveReading.accuracy(50f));
        assertEquals(LiveReading.Accuracy.INSUFFICIENT, LiveReading.accuracy(50.01f));
        assertEquals(LiveReading.Accuracy.UNKNOWN, LiveReading.accuracy(Float.NaN));
        assertEquals(LiveReading.Accuracy.UNKNOWN, LiveReading.accuracy(-1f));
    }

    @Test
    void ageFormatRoundsUpSoItNeverLooksFresherThanItIs() {
        assertEquals("—", LiveReading.formatAge(-1));
        assertEquals("0 s", LiveReading.formatAge(0));
        assertEquals("1 s", LiveReading.formatAge(1));
        assertEquals("15 s", LiveReading.formatAge(15_000));
        assertEquals("16 s", LiveReading.formatAge(15_001));
        assertEquals("59 s", LiveReading.formatAge(59_000));
        assertEquals("1 min 00 s", LiveReading.formatAge(59_001));
        assertEquals("61 min 05 s", LiveReading.formatAge(3_665_000));
    }

    @Test
    void displayedAgeAndFreshnessNeverContradictEachOther() {
        for (long ms = 0; ms <= 20_000; ms += 7) {
            long shown = Long.parseLong(LiveReading.formatAge(ms).replace(" s", ""));
            boolean updated = LiveReading.freshness(ms) == LiveReading.Freshness.UPDATED;
            assertEquals(shown <= 15, updated, "ms=" + ms);
        }
    }

    @Test
    void coordinatesUseFiveDecimalsAndADotWhateverTheLocale() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("es-ES"));
            assertEquals("40.41530", LiveReading.formatCoordinate(40.415296));
            assertEquals("-3.68451", LiveReading.formatCoordinate(-3.684512));
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    void permissionStates() {
        assertEquals(PermissionState.PRECISE, PermissionState.classify(true, true, false));
        assertEquals(PermissionState.APPROXIMATE_ONLY, PermissionState.classify(false, true, true));
        assertEquals(PermissionState.DENIED, PermissionState.classify(false, false, false));
        assertEquals(PermissionState.DENIED_PERMANENTLY, PermissionState.classify(false, false, true));
        assertTrue(PermissionState.deniedPermanentlyAfterResult(false, false, false));
        assertFalse(PermissionState.deniedPermanentlyAfterResult(false, false, true), "aún se puede volver a pedir");
        assertFalse(PermissionState.deniedPermanentlyAfterResult(false, true, false), "aproximada concedida");
    }

    @Test
    void persistedRecordsAndCsvHaveNoCoordinates() {
        for (RecordComponent c : FixSample.class.getRecordComponents()) {
            String n = c.getName().toLowerCase(Locale.ROOT);
            assertFalse(n.contains("lat") || n.contains("lon") || n.contains("lng"), c.getName());
        }
        String header = CsvFormat.HEADER.toLowerCase(Locale.ROOT);
        assertFalse(header.contains("lat") || header.contains("lon") || header.contains("lng"), header);
    }
}
