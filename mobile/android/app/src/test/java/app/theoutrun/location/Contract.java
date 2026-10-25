package app.theoutrun.location;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Lectura mínima del contrato JSON para las pruebas (sin org.json, que en las pruebas locales es un stub). */
final class Contract {
    private Contract() {}

    static String text() throws IOException {
        // Las pruebas locales se ejecutan desde el directorio del módulo (mobile/android/app).
        return new String(Files.readAllBytes(Path.of("../../contract/location-bridge.json")), StandardCharsets.UTF_8);
    }

    /** Claves del objeto de tipo `name` dentro de "types". */
    static Set<String> typeKeys(String name) throws IOException {
        Matcher m = Pattern.compile("\"" + name + "\"\\s*:\\s*\\{([^}]*)\\}").matcher(text());
        if (!m.find()) throw new AssertionError("tipo no encontrado: " + name);
        Set<String> keys = new LinkedHashSet<>();
        Matcher k = Pattern.compile("\"(\\w+)\"\\s*:").matcher(m.group(1));
        while (k.find()) keys.add(k.group(1));
        return keys;
    }

    /** Valores del array `name` dentro de "enums". */
    static List<String> enumValues(String name) throws IOException {
        Matcher m = Pattern.compile("\"" + name + "\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(text());
        if (!m.find()) throw new AssertionError("enum no encontrado: " + name);
        List<String> values = new ArrayList<>();
        Matcher v = Pattern.compile("\"([^\"]+)\"").matcher(m.group(1));
        while (v.find()) values.add(v.group(1));
        return values;
    }

    static long intervalField(String name) throws IOException {
        Matcher m = Pattern.compile("\"" + name + "\"\\s*:\\s*(\\d+)").matcher(text());
        if (!m.find()) throw new AssertionError("campo no encontrado: " + name);
        return Long.parseLong(m.group(1));
    }

    static String pluginName() throws IOException {
        Matcher m = Pattern.compile("\"plugin\"\\s*:\\s*\"(\\w+)\"").matcher(text());
        if (!m.find()) throw new AssertionError("plugin no encontrado");
        return m.group(1);
    }
}
