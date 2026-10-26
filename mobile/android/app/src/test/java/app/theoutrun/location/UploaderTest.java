package app.theoutrun.location;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.After;
import org.junit.Test;

// El emisor real (HttpURLConnection en su propio hilo) contra un servidor HTTP local del JDK.
// SIMULADO: el servidor (no es el de la partida) y el reloj monótono. Sin TLS ni dispositivo.
public class UploaderTest {

    private ServerSocket server;
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final AtomicInteger status = new AtomicInteger(204);
    private volatile CountDownLatch gate = new CountDownLatch(0);

    /** Servidor HTTP/1.1 mínimo (una petición por conexión) que guarda «MÉTODO tipo cuerpo». */
    private String start() throws Exception {
        server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        ServerSocket listening = server;
        Thread t = new Thread(() -> {
            while (!listening.isClosed()) {
                try (Socket s = listening.accept()) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                    String method = in.readLine().split(" ")[0];
                    String type = null;
                    int length = 0;
                    for (String line = in.readLine(); line != null && !line.isEmpty(); line = in.readLine()) {
                        String lower = line.toLowerCase(Locale.ROOT);
                        if (lower.startsWith("content-type:")) type = line.substring(13).trim();
                        if (lower.startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
                    }
                    char[] body = new char[length];
                    for (int read = 0; read < length; ) read += in.read(body, read, length - read);
                    gate.await(5, TimeUnit.SECONDS); // permite simular un servidor lento
                    bodies.add(method + " " + type + " " + new String(body));
                    OutputStream out = s.getOutputStream();
                    out.write(("HTTP/1.1 " + status.get() + " X\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                } catch (Exception e) {
                    // servidor cerrado o petición incompleta
                }
            }
        });
        t.setDaemon(true);
        t.start();
        return "http://127.0.0.1:" + server.getLocalPort() + "/api/loc";
    }

    @After
    public void stop() throws Exception {
        if (server != null) server.close();
    }

    @Test
    public void sendsJsonPostWithAgeMeasuredAtSendTime() throws Exception {
        AtomicLong clock = new AtomicLong(10_000);
        BlockingQueue<Integer> results = new LinkedBlockingQueue<>();
        Uploader u = new Uploader(UploadConfig.unchecked(start(), "p_1", "secreto"), clock::get, results::add);
        clock.set(12_500);
        u.offer(40.4153, -3.6845, 6.0, 10_000, false);
        assertEquals(Integer.valueOf(204), results.poll(5, TimeUnit.SECONDS));
        assertEquals(1, bodies.size());
        String b = bodies.get(0);
        assertTrue(b, b.startsWith("POST application/json {\"playerId\":\"p_1\",\"secret\":\"secreto\""));
        assertTrue(b, b.contains("\"age\":2500"));
        u.close();
    }

    @Test
    public void onlyTheLatestPendingReadingIsSent() throws Exception {
        BlockingQueue<Integer> results = new LinkedBlockingQueue<>();
        String url = start();
        gate = new CountDownLatch(1); // el servidor no responde hasta abrir la puerta
        Uploader u = new Uploader(UploadConfig.unchecked(url, "p", "s"), () -> 0L, results::add);
        u.offer(1, 1, 5, 0, false); // en vuelo
        Thread.sleep(200);
        u.offer(2, 2, 5, 0, false); // se descarta: llega otra más nueva antes de poder enviarla
        u.offer(3, 3, 5, 0, false);
        gate.countDown();
        assertEquals(Integer.valueOf(204), results.poll(5, TimeUnit.SECONDS));
        assertEquals(Integer.valueOf(204), results.poll(5, TimeUnit.SECONDS));
        assertEquals(null, results.poll(300, TimeUnit.MILLISECONDS));
        assertEquals(2, bodies.size());
        assertTrue(bodies.get(0).contains("\"lat\":1.0"));
        assertTrue(bodies.get(1).contains("\"lat\":3.0"));
        u.close();
    }

    @Test
    public void reportsServerCodesAndNetworkFailures() throws Exception {
        BlockingQueue<Integer> results = new LinkedBlockingQueue<>();
        String url = start();
        Uploader u = new Uploader(UploadConfig.unchecked(url, "p", "s"), () -> 0L, results::add);
        status.set(410);
        u.offer(1, 1, 5, 0, false);
        assertEquals(Integer.valueOf(410), results.poll(5, TimeUnit.SECONDS));
        server.close();
        server = null;
        u.offer(1, 1, 5, 0, false);
        assertEquals(Integer.valueOf(-1), results.poll(15, TimeUnit.SECONDS));
        u.close();
    }

    @Test
    public void nothingIsSentAfterClose() throws Exception {
        BlockingQueue<Integer> results = new LinkedBlockingQueue<>();
        Uploader u = new Uploader(UploadConfig.unchecked(start(), "p", "s"), () -> 0L, results::add);
        u.close();
        u.offer(1, 1, 5, 0, false);
        assertEquals(null, results.poll(300, TimeUnit.MILLISECONDS));
        assertFalse(bodies.size() > 0);
    }
}
