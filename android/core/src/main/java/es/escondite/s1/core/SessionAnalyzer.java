package es.escondite.s1.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Calcula las métricas de S1 a partir del CSV exportado por la app. Las mismas cuentas sirven
 * para el informe del dispositivo y para las pruebas automatizadas con datos SIMULADOS.
 */
public final class SessionAnalyzer {

    /** Métricas de un estado de pantalla (encendida o apagada). */
    public record ScreenMetrics(
            long timeMs, int fixes, long expectedFixes, double coverage, long maxGapMs, int gapsOverThreshold) {}

    public record Summary(
            long durationMs,
            int fixes,
            ScreenMetrics screenOn,
            ScreenMetrics screenOff,
            long ageP50Ms,
            long ageP95Ms,
            long ageMaxMs,
            double accuracyP50M,
            double accuracyP95M,
            Map<Availability, Integer> availability,
            int mockFixes,
            Double batteryDropPctPerHour,
            String batteryNote,
            Double anchorP50M,
            Double anchorP95M,
            Map<String, Integer> events,
            String exitVerdict) {}

    private record Row(boolean fix, long elapsedMs, long ageMs, long gapMs, double accuracyM, Availability availability,
                       boolean mock, Double anchorM, boolean screenOn, int batteryPct, boolean charging, String event) {}

    public static Summary analyze(List<String> lines) {
        if (lines.isEmpty() || !lines.get(0).equals(CsvFormat.HEADER)) {
            throw new IllegalArgumentException("El CSV no tiene la cabecera esperada de S1");
        }
        List<Row> rows = new ArrayList<>();
        for (String line : lines.subList(1, lines.size())) {
            if (line.trim().isEmpty()) continue;
            rows.add(parse(CsvFormat.parseLine(line)));
        }
        if (rows.isEmpty()) throw new IllegalArgumentException("El CSV no contiene filas");

        long duration = rows.get(rows.size() - 1).elapsedMs() - rows.get(0).elapsedMs();

        // Tiempo en cada estado de pantalla: cada tramo entre filas se atribuye al estado de la fila inicial.
        long timeOn = 0;
        long timeOff = 0;
        for (int i = 0; i + 1 < rows.size(); i++) {
            long dt = Math.max(0, rows.get(i + 1).elapsedMs() - rows.get(i).elapsedMs());
            if (rows.get(i).screenOn()) timeOn += dt; else timeOff += dt;
        }

        List<Row> fixes = rows.stream().filter(Row::fix).collect(Collectors.toList());
        int fixesOn = 0;
        int fixesOff = 0;
        long maxGapOn = 0;
        long maxGapOff = 0;
        int gapsOn = 0;
        int gapsOff = 0;
        for (int i = 0; i < fixes.size(); i++) {
            Row f = fixes.get(i);
            if (f.screenOn()) fixesOn++; else fixesOff++;
            if (i == 0) continue;
            // El hueco se atribuye al estado de pantalla al empezar (la muestra anterior).
            Row prev = fixes.get(i - 1);
            long gap = f.elapsedMs() - prev.elapsedMs();
            boolean over = gap > ExperimentalParams.GAP_THRESHOLD_MS;
            if (prev.screenOn()) {
                maxGapOn = Math.max(maxGapOn, gap);
                if (over) gapsOn++;
            } else {
                maxGapOff = Math.max(maxGapOff, gap);
                if (over) gapsOff++;
            }
        }

        List<Long> ages = new ArrayList<>();
        List<Double> accuracies = new ArrayList<>();
        List<Double> anchors = new ArrayList<>();
        Map<Availability, Integer> availability = new EnumMap<>(Availability.class);
        for (Availability a : Availability.values()) availability.put(a, 0);
        int mock = 0;
        for (Row f : fixes) {
            ages.add(f.ageMs());
            if (!Double.isNaN(f.accuracyM())) accuracies.add(f.accuracyM());
            if (f.anchorM() != null) anchors.add(f.anchorM());
            availability.merge(f.availability(), 1, Integer::sum);
            if (f.mock()) mock++;
        }

        Map<String, Integer> events = new java.util.TreeMap<>();
        for (Row r : rows) if (!r.fix()) events.merge(r.event(), 1, Integer::sum);

        Double batteryDrop = null;
        String batteryNote;
        boolean anyCharging = rows.stream().anyMatch(Row::charging);
        List<Row> withBattery = rows.stream().filter(r -> r.batteryPct() >= 0).collect(Collectors.toList());
        if (anyCharging) {
            batteryNote = "no válido: el móvil estuvo cargando";
        } else if (withBattery.size() < 2 || duration < 30 * 60_000L) {
            batteryNote = "no válido: menos de 30 min de datos";
        } else {
            Row first = withBattery.get(0);
            Row last = withBattery.get(withBattery.size() - 1);
            double hours = (last.elapsedMs() - first.elapsedMs()) / 3_600_000.0;
            batteryDrop = (first.batteryPct() - last.batteryPct()) / hours;
            batteryNote = "resolución de 1 %; incluye todo el consumo del móvil, no solo esta app";
        }

        ScreenMetrics on = metrics(timeOn, fixesOn, maxGapOn, gapsOn);
        ScreenMetrics off = metrics(timeOff, fixesOff, maxGapOff, gapsOff);
        return new Summary(
                duration, fixes.size(), on, off,
                percentileLong(ages, 50), percentileLong(ages, 95), ages.isEmpty() ? -1 : Collections.max(ages),
                percentile(accuracies, 50), percentile(accuracies, 95),
                availability, mock, batteryDrop, batteryNote,
                anchors.isEmpty() ? null : percentile(anchors, 50),
                anchors.isEmpty() ? null : percentile(anchors, 95),
                events, verdict(off));
    }

    // Veredicto EXPERIMENTAL (D-038) de T05: solo con al menos 10 min de pantalla apagada.
    static String verdict(ScreenMetrics off) {
        if (off.timeMs() < 10 * 60_000L) return "INSUFICIENTE (menos de 10 min con la pantalla apagada)";
        boolean ok = off.coverage() >= ExperimentalParams.EXIT_MIN_LOCKED_COVERAGE
                && off.maxGapMs() <= ExperimentalParams.EXIT_MAX_LOCKED_GAP_MS;
        return ok ? "SUPERA el umbral experimental" : "NO SUPERA el umbral experimental";
    }

    private static ScreenMetrics metrics(long timeMs, int fixes, long maxGapMs, int gaps) {
        long expected = timeMs / ExperimentalParams.REQUEST_INTERVAL_MS;
        double coverage = expected == 0 ? 0 : (double) fixes / expected;
        return new ScreenMetrics(timeMs, fixes, expected, coverage, maxGapMs, gaps);
    }

    private static Row parse(List<String> f) {
        if (f.size() != CsvFormat.COLUMNS.length) {
            throw new IllegalArgumentException("Fila con " + f.size() + " columnas; se esperaban " + CsvFormat.COLUMNS.length);
        }
        boolean fix = f.get(0).equals("fix");
        return new Row(
                fix,
                Long.parseLong(f.get(2)),
                fix ? Long.parseLong(f.get(3)) : -1,
                f.get(4).isEmpty() ? -1 : Long.parseLong(f.get(4)),
                f.get(6).isEmpty() ? Double.NaN : Double.parseDouble(f.get(6)),
                fix ? Availability.valueOf(f.get(9)) : null,
                Boolean.parseBoolean(f.get(8)),
                f.get(10).isEmpty() ? null : Double.parseDouble(f.get(10)),
                Boolean.parseBoolean(f.get(11)),
                Integer.parseInt(f.get(13)),
                Boolean.parseBoolean(f.get(14)),
                f.get(17));
    }

    static double percentile(List<Double> values, int p) {
        if (values.isEmpty()) return Double.NaN;
        List<Double> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int idx = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, idx)));
    }

    static long percentileLong(List<Long> values, int p) {
        if (values.isEmpty()) return -1;
        List<Long> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int idx = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, idx)));
    }
}
