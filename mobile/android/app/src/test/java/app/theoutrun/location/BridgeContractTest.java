package app.theoutrun.location;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.getcapacitor.annotation.CapacitorPlugin;
import es.escondite.s1.core.PermissionState;
import java.util.Map;
import org.junit.Test;

// El lado Android del puente cumple el contrato (mobile/contract/location-bridge.json), el mismo
// que comprueban las pruebas JS. Sin dispositivo: solo Java puro.
public class BridgeContractTest {

    private static Map<String, Object> sampleReading(float accuracy, float speed) {
        return Payloads.reading("s-1", 40.415296, -3.684512, accuracy, 420, 1_700_000_000_000L, 1_699_999_999_580L,
                "fused", false, speed);
    }

    @Test
    public void pluginNameMatchesContract() throws Exception {
        assertEquals(Contract.pluginName(), OutrunLocationPlugin.class.getAnnotation(CapacitorPlugin.class).name());
    }

    @Test
    public void payloadsHaveExactlyTheContractFields() throws Exception {
        assertEquals(Contract.typeKeys("Reading"), sampleReading(5f, 1f).keySet());
        assertEquals(Contract.typeKeys("Status"), Payloads.status(false, null, 5000, 0, 0, false, null, null, null).keySet());
        assertEquals(Contract.typeKeys("ProviderStatus"), Payloads.provider(true, "fused", true, true).keySet());
        assertEquals(Contract.typeKeys("Permissions"), Payloads.permissions("prompt", "prompt").keySet());
    }

    @Test
    public void unknownAccuracyAndSpeedAreNullNeverZero() {
        Map<String, Object> r = sampleReading(Float.NaN, Float.NaN);
        assertNull(r.get("accuracyM"));
        assertNull(r.get("speedMps"));
        assertNull(sampleReading(-1f, 1f).get("accuracyM"));
        assertEquals(7.5, (double) sampleReading(7.5f, 1f).get("accuracyM"), 1e-6);
    }

    @Test
    public void ageIsNeverNegativeAndMockIsKept() {
        Map<String, Object> r = Payloads.reading("s", 1, 2, 3f, -50, 0, 0, null, true, 0f);
        assertEquals(0L, r.get("ageMs"));
        assertEquals(true, r.get("isMock"));
        assertEquals("desconocido", r.get("provider"));
    }

    @Test
    public void errorCodesMatchContract() throws Exception {
        assertEquals(Contract.enumValues("errors"), BridgeErrors.ALL);
    }

    @Test
    public void intervalBoundsMatchContract() throws Exception {
        assertEquals(Contract.intervalField("minMs"), SessionConfig.MIN_INTERVAL_MS);
        assertEquals(Contract.intervalField("maxMs"), SessionConfig.MAX_INTERVAL_MS);
        assertEquals(Contract.intervalField("defaultMs"), SessionConfig.DEFAULT_INTERVAL_MS);
        assertTrue(SessionConfig.isValidInterval(1_000));
        assertTrue(SessionConfig.isValidInterval(60_000));
        assertFalse(SessionConfig.isValidInterval(999));
        assertFalse(SessionConfig.isValidInterval(60_001));
    }

    @Test
    public void permissionStatesMapToContractValues() throws Exception {
        var allowed = Contract.enumValues("permissionLocation");
        assertEquals("precise", PermissionMapper.location(PermissionState.PRECISE, true));
        assertEquals("approximate", PermissionMapper.location(PermissionState.APPROXIMATE_ONLY, true));
        assertEquals("prompt", PermissionMapper.location(PermissionState.DENIED, false));
        assertEquals("denied", PermissionMapper.location(PermissionState.DENIED, true));
        assertEquals("denied_permanently", PermissionMapper.location(PermissionState.DENIED_PERMANENTLY, true));
        for (PermissionState s : PermissionState.values()) {
            assertTrue(allowed.contains(PermissionMapper.location(s, true)));
            assertTrue(allowed.contains(PermissionMapper.location(s, false)));
        }
        var notif = Contract.enumValues("permissionNotifications");
        assertEquals("not_required", PermissionMapper.notifications(32, false, false));
        assertEquals("granted", PermissionMapper.notifications(34, true, true));
        assertEquals("prompt", PermissionMapper.notifications(34, false, false));
        assertEquals("denied", PermissionMapper.notifications(34, false, true));
        for (String v : new String[] {"not_required", "granted", "prompt", "denied"}) assertTrue(notif.contains(v));
    }
}
