package es.escondite.s1;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import es.escondite.s1.core.CsvFormat;
import es.escondite.s1.core.EventType;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;

/**
 * Archivos de sesión (almacenamiento privado de la app, sin copia de seguridad) y marcas para
 * detectar si una sesión terminó de forma anómala (proceso matado, permiso revocado, reinicio).
 */
final class SessionStore {
    private SessionStore() {}

    private static final String PREFS = "s1";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static File sessionsDir(Context c) {
        File dir = new File(c.getFilesDir(), "sessions");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("No se pudo crear " + dir);
        return dir;
    }

    static File newSessionFile(Context c) {
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date());
        return new File(sessionsDir(c), "s1-" + stamp + ".csv");
    }

    static File[] sessions(Context c) {
        File[] files = sessionsDir(c).listFiles((dir, name) -> name.endsWith(".csv"));
        if (files == null) return new File[0];
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        return files;
    }

    static File latest(Context c) {
        File[] files = sessions(c);
        return files.length == 0 ? null : files[files.length - 1];
    }

    static int deleteAll(Context c) {
        int deleted = 0;
        for (File f : sessions(c)) if (f.delete()) deleted++;
        return deleted;
    }

    static void markRunning(Context c, File file) {
        prefs(c).edit()
                .putBoolean("running", true)
                .putString("file", file.getAbsolutePath())
                .putLong("heartbeat_wall", System.currentTimeMillis())
                .putLong("heartbeat_elapsed", SystemClock.elapsedRealtime())
                .apply();
    }

    static void heartbeat(Context c) {
        prefs(c).edit()
                .putLong("heartbeat_wall", System.currentTimeMillis())
                .putLong("heartbeat_elapsed", SystemClock.elapsedRealtime())
                .apply();
    }

    static void markStopped(Context c) {
        prefs(c).edit().putBoolean("running", false).apply();
    }

    /**
     * Si la última sesión no se detuvo limpiamente y el servicio ya no existe, lo anota en su
     * archivo y devuelve un mensaje para la pantalla. Si no, devuelve null.
     */
    static String detectAbnormalEnd(Context c, boolean serviceRunning) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("running", false) || serviceRunning) return null;
        long lastWall = p.getLong("heartbeat_wall", 0);
        long lastElapsed = p.getLong("heartbeat_elapsed", 0);
        long nowElapsed = SystemClock.elapsedRealtime();
        boolean rebootSuspected = nowElapsed < lastElapsed;
        long silentS = (System.currentTimeMillis() - lastWall) / 1000;
        String detail = "silent_s=" + silentS + " reboot_suspected=" + rebootSuspected;
        String path = p.getString("file", null);
        if (path != null) {
            try (FileWriter w = new FileWriter(path, true)) {
                w.write(CsvFormat.eventRow(EventType.ABNORMAL_END_DETECTED, detail, nowElapsed,
                        System.currentTimeMillis(), DeviceStateReader.read(c, true)));
                w.write('\n');
            } catch (IOException ignored) {
                // El archivo pudo borrarse; el aviso en pantalla basta.
            }
        }
        markStopped(c);
        return "La sesión anterior terminó sin detenerse (silencio de " + silentS + " s"
                + (rebootSuspected ? ", posible reinicio" : "") + ").";
    }
}
