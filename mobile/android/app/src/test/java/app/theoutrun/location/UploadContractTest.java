package app.theoutrun.location;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Test;

// Envío nativo de la ubicación al servidor de la partida: mismo contrato que el puente JS
// (mobile/contract/location-bridge.json) y mismo cuerpo que espera el servidor (server/protocol.ts).
// Sin dispositivo ni red: solo Java puro.
public class UploadContractTest {

    private static final String URL = "https://partida.example/api/loc";
    private static final String SECRET = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd";

    private static UploadConfig config() {
        UploadConfig c = UploadConfig.parse(URL, "p_1", SECRET);
        assertNotNull(c);
        return c;
    }

    @Test
    public void limitsAndErrorsMatchContract() throws Exception {
        assertEquals(Contract.intervalField("maxUrlLength"), UploadConfig.MAX_URL_LENGTH);
        assertEquals(Contract.intervalField("maxPlayerIdLength"), UploadConfig.MAX_PLAYER_ID_LENGTH);
        assertEquals(Contract.intervalField("maxSecretLength"), UploadConfig.MAX_SECRET_LENGTH);
        assertEquals(Contract.enumValues("uploadErrors"), BridgeErrors.UPLOAD);
        assertTrue(Contract.enumValues("errors").contains(BridgeErrors.INVALID_UPLOAD));
        assertEquals(Set.of("url", "playerId", "secret"), Contract.typeKeys("Upload"));
    }

    @Test
    public void onlyHttpsWithoutCredentialsAndWithinLimits() {
        assertNotNull(UploadConfig.parse("https://h.example:8443/api/loc", "p", "s"));
        String[][] bad = {
            {"http://partida.example/api/loc", "p", "s"},
            {"wss://partida.example/ws", "p", "s"},
            {"https://user:pw@partida.example/api/loc", "p", "s"},
            {"https:///api/loc", "p", "s"},
            {"no es una url", "p", "s"},
            {URL, "", "s"},
            {URL, "p", null},
            {URL, "p", "x".repeat(129)},
            {"https://h.example/" + "a".repeat(600), "p", "s"},
        };
        for (String[] b : bad) assertNull(b[0], UploadConfig.parse(b[0], b[1], b[2]));
    }

    /** Claves de primer nivel de un objeto JSON plano. */
    private static Set<String> keys(String json) {
        Set<String> keys = new LinkedHashSet<>();
        Matcher m = Pattern.compile("[{,]\"(\\w+)\":").matcher(json);
        while (m.find()) keys.add(m.group(1));
        return keys;
    }

    @Test
    public void bodyHasExactlyTheServerFields() {
        String body = config().body(40.4153, -3.6845, 7.5, 1_234, false);
        assertEquals(Set.of("playerId", "secret", "lat", "lng", "acc", "age", "mock"), keys(body));
        assertTrue(body.contains("\"age\":1234"));
        assertTrue(body.contains("\"acc\":7.5"));
        assertTrue(body.contains("\"mock\":false"));
        assertTrue(body.startsWith("{") && body.endsWith("}"));
        assertTrue("cabe en el límite del servidor (1 KB)", body.length() < 1_024);
    }

    @Test
    public void unknownAccuracyNeverLooksExactAndAgeIsNeverNegative() {
        String body = config().body(1, 2, Double.NaN, -50, true);
        assertTrue(body.contains("\"acc\":9999.0"));
        assertTrue(body.contains("\"age\":0"));
        assertTrue(body.contains("\"mock\":true"));
        assertTrue(config().body(1, 2, -3, 0, false).contains("\"acc\":9999.0"));
    }

    @Test
    public void stringsAreEscaped() {
        UploadConfig c = UploadConfig.parse(URL, "p\"x\\y\n", SECRET);
        assertNotNull(c);
        assertTrue(c.body(0, 0, 1, 0, false).contains("\"playerId\":\"p\\\"x\\\\y\\u000a\""));
    }

    @Test
    public void httpCodesMapToContractUploadErrors() {
        assertNull(UploadConfig.errorFor(204));
        assertNull(UploadConfig.errorFor(202));
        assertEquals("unauthorized", UploadConfig.errorFor(401));
        assertEquals("ended", UploadConfig.errorFor(410));
        assertEquals("rejected", UploadConfig.errorFor(400));
        assertEquals("rejected", UploadConfig.errorFor(429));
        assertEquals("network", UploadConfig.errorFor(502));
        assertEquals("network", UploadConfig.errorFor(-1));
        for (int code : new int[] {204, 401, 410, 400, 502, -1}) {
            String e = UploadConfig.errorFor(code);
            assertTrue(e == null || BridgeErrors.UPLOAD.contains(e));
        }
        assertTrue(UploadConfig.endsSession(401));
        assertTrue(UploadConfig.endsSession(410));
        assertFalse(UploadConfig.endsSession(202));
        assertFalse(UploadConfig.endsSession(429));
        assertFalse(UploadConfig.endsSession(-1));
    }

    @Test
    public void secretNeverAppearsInTextAndNotificationTellsTheTruth() {
        assertFalse(config().toString().contains(SECRET));
        assertTrue(LocationSessionService.notificationText(true).contains("se envía al servidor"));
        assertTrue(LocationSessionService.notificationText(false).contains("no envía nada"));
    }
}
