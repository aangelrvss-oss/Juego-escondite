package es.escondite.s1.core;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Formato del CSV de sesión. Por diseño NO tiene columnas de latitud ni longitud, y los
 * números se redondean a 1 decimal para que ningún campo pueda contener una coordenada.
 */
public final class CsvFormat {
    private CsvFormat() {}

    public static final String[] COLUMNS = {
        "kind", "wall_clock", "elapsed_ms", "fix_age_ms", "gap_ms", "provider", "accuracy_m", "speed_mps",
        "mock", "availability", "anchor_dist_m", "screen_on", "app_visible", "battery_pct", "charging",
        "power_save", "device_idle", "event", "detail"
    };

    public static final String HEADER = String.join(",", COLUMNS);

    // Cualquier número con 4 o más decimales podría ser una coordenada: se elimina del detalle.
    private static final Pattern COORDINATE_LIKE = Pattern.compile("-?\\d+\\.\\d{4,}");
    private static final int MAX_DETAIL_LENGTH = 120;

    public static String sanitizeDetail(String detail) {
        if (detail == null) return "";
        String clean = COORDINATE_LIKE.matcher(detail).replaceAll("[redacted]");
        clean = clean.replaceAll("[\\r\\n]", " ");
        return clean.length() > MAX_DETAIL_LENGTH ? clean.substring(0, MAX_DETAIL_LENGTH) : clean;
    }

    public static String fixRow(FixSample f, long gapMs) {
        Availability availability = Availability.classify(f.ageMs(), f.accuracyM());
        return join(f.state(),
                "fix",
                Instant.ofEpochMilli(f.wallClockMs()).toString(),
                Long.toString(f.receivedElapsedMs()),
                Long.toString(f.ageMs()),
                gapMs < 0 ? "" : Long.toString(gapMs),
                f.provider(),
                oneDecimal(f.accuracyM()),
                oneDecimal(f.speedMps()),
                Boolean.toString(f.mock()),
                availability.name(),
                f.anchorDistanceM() == null ? "" : oneDecimal(f.anchorDistanceM()));
    }

    public static String eventRow(EventType type, String detail, long elapsedMs, long wallClockMs, DeviceState s) {
        List<String> fields = new ArrayList<>(List.of(
                "event",
                Instant.ofEpochMilli(wallClockMs).toString(),
                Long.toString(elapsedMs),
                "", "", "", "", "", "", "", ""));
        appendState(fields, s);
        fields.add(type.name());
        fields.add(sanitizeDetail(detail));
        return join(fields);
    }

    private static void appendState(List<String> fields, DeviceState s) {
        fields.add(Boolean.toString(s.screenOn()));
        fields.add(Boolean.toString(s.appVisible()));
        fields.add(Integer.toString(s.batteryPct()));
        fields.add(Boolean.toString(s.charging()));
        fields.add(Boolean.toString(s.powerSave()));
        fields.add(Boolean.toString(s.deviceIdle()));
    }

    static String oneDecimal(double value) {
        if (Double.isNaN(value)) return "";
        return String.format(Locale.ROOT, "%.1f", value);
    }

    // Fila de muestra: campos propios, después el estado del dispositivo y dos campos de evento vacíos.
    private static String join(DeviceState s, String... fixFields) {
        List<String> fields = new ArrayList<>(List.of(fixFields));
        appendState(fields, s);
        fields.add("");
        fields.add("");
        return join(fields);
    }

    private static String join(List<String> fields) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < fields.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(quote(fields.get(i)));
        }
        return sb.toString();
    }

    private static String quote(String field) {
        if (field.contains(",") || field.contains("\"")) return '"' + field.replace("\"", "\"\"") + '"';
        return field;
    }

    /** Analiza una línea CSV respetando las comillas. */
    public static List<String> parseLine(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else if (c == '"') {
                    inQuotes = false;
                } else {
                    cur.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                out.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(c);
            }
        }
        out.add(cur.toString());
        return out;
    }
}
