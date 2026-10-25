package es.escondite.s1.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Locale;

/** Uso: AnalyzeCli sesion.csv. Imprime el informe de una sesión exportada desde el móvil. */
public final class AnalyzeCli {
    private AnalyzeCli() {}

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("Uso: AnalyzeCli <sesion.csv>");
            System.exit(2);
        }
        System.out.print(report(SessionAnalyzer.analyze(Files.readAllLines(Paths.get(args[0]), StandardCharsets.UTF_8))));
    }

    public static String report(SessionAnalyzer.Summary s) {
        StringBuilder sb = new StringBuilder();
        sb.append("Informe S1 (umbrales EXPERIMENTALES, D-038)\n");
        sb.append(String.format(Locale.ROOT, "Duración: %.1f min · muestras: %d%n", s.durationMs() / 60_000.0, s.fixes()));
        line(sb, "Pantalla encendida", s.screenOn());
        line(sb, "Pantalla apagada", s.screenOff());
        sb.append(String.format(Locale.ROOT, "Antigüedad al recibir: p50 %d ms · p95 %d ms · máx %d ms%n",
                s.ageP50Ms(), s.ageP95Ms(), s.ageMaxMs()));
        sb.append(String.format(Locale.ROOT, "Precisión declarada: p50 %.1f m · p95 %.1f m%n", s.accuracyP50M(), s.accuracyP95M()));
        sb.append("Disponibilidad: ").append(s.availability()).append('\n');
        sb.append("Muestras simuladas por el sistema (mock): ").append(s.mockFixes()).append('\n');
        sb.append("Batería: ").append(s.batteryDropPctPerHour() == null ? "-"
                : String.format(Locale.ROOT, "%.1f %%/h", s.batteryDropPctPerHour())).append(" (").append(s.batteryNote()).append(")\n");
        if (s.anchorP50M() != null) {
            sb.append(String.format(Locale.ROOT, "Distancia a la referencia: p50 %.1f m · p95 %.1f m%n", s.anchorP50M(), s.anchorP95M()));
        }
        sb.append("Eventos: ").append(s.events()).append('\n');
        sb.append("T05 (pantalla apagada): ").append(s.exitVerdict()).append('\n');
        return sb.toString();
    }

    private static void line(StringBuilder sb, String label, SessionAnalyzer.ScreenMetrics m) {
        sb.append(String.format(Locale.ROOT, "%s: %.1f min · %d de ~%d esperadas (%.0f %%) · hueco máx %d s · huecos > %d s: %d%n",
                label, m.timeMs() / 60_000.0, m.fixes(), m.expectedFixes(), m.coverage() * 100,
                m.maxGapMs() / 1000, ExperimentalParams.GAP_THRESHOLD_MS / 1000, m.gapsOverThreshold()));
    }
}
