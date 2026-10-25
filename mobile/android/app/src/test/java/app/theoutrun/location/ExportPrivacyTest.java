package app.theoutrun.location;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import es.escondite.s1.core.CsvFormat;
import es.escondite.s1.core.DeviceState;
import es.escondite.s1.core.EventType;
import es.escondite.s1.core.FixSample;
import es.escondite.s1.core.SessionRecorder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.junit.Test;

// El registro exportado no contiene coordenadas exactas: se graba una sesión con lecturas reales
// en Madrid (como hace el servicio) y se busca cualquier rastro de latitud o longitud en el CSV.
public class ExportPrivacyTest {

    private static final double LAT = 40.4152961;
    private static final double LNG = -3.6845123;
    private static final Pattern FOUR_DECIMALS = Pattern.compile("-?\\d+\\.\\d{4,}");

    @Test
    public void sessionCsvHasNoCoordinates() {
        List<String> lines = new ArrayList<>();
        DeviceState state = new DeviceState(true, true, 80, false, false, false);
        SessionRecorder rec = new SessionRecorder(lines::add, 0, 1_700_000_000_000L,
                "app=outrun-h1;provider=fused;interval_ms=5000", state);
        for (int i = 1; i <= 50; i++) {
            long t = i * 5_000L;
            // Las coordenadas solo llegan al servicio; el registro recibe calidad y tiempos.
            rec.fix(new FixSample(t, t - 300, 1_700_000_000_000L + t, "fused", 6.25f + i / 10f, 1.4f, false, null, state));
            rec.tick(t, 1_700_000_000_000L + t, state);
        }
        rec.event(EventType.ERROR, String.format(Locale.ROOT, "lat=%.7f lng=%.7f", LAT, LNG), 300_000, 1_700_000_300_000L, state);
        String csv = String.join("\n", lines);

        assertTrue("la sesión registra lecturas", rec.fixes() == 50);
        String header = CsvFormat.HEADER.toLowerCase(Locale.ROOT);
        assertFalse(header.contains("lat") || header.contains("lon") || header.contains("lng"));
        assertFalse(csv.contains("40.41"));
        assertFalse(csv.contains("-3.68"));
        assertFalse("ningún número con 4 o más decimales", FOUR_DECIMALS.matcher(csv).find());
        assertEquals(CsvFormat.COLUMNS.length, lines.get(0).split(",", -1).length);
    }
}
