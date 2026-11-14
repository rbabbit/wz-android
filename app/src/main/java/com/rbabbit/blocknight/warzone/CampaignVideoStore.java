package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Original campaign movies only. The owner's older web engine in this ZIP is never installed. */
final class CampaignVideoStore {
    static final String DOWNLOAD_URL = "https://krishna.org.uk/game/warzone-mobile-v1.zip";
    static final long ARCHIVE_BYTES = 215_283_360L;
    static final String ARCHIVE_SHA256 = "23f74895fa7f03cb86a79b857bad6977ce18d20b8a944d51449e68517e80bc47";
    static final long INSTALLED_BYTES = 170_920_623L;
    private static final long SPACE_MARGIN = 32L * 1024 * 1024;
    private static final String INVENTORY_NAME = ".complete-v1";
    private final File root, installed, previous, archive, partial;
    private final OptionalPackStore pack;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile int generation;
    private volatile boolean verified, busy, closed;
    private volatile String state = "idle";
    private volatile long received;

    CampaignVideoStore(Context context) {
        root = new File(context.getFilesDir(), "campaign-videos");
        installed = new File(root, "sequences-v1");
        previous = new File(root, "sequences-v1.previous");
        archive = new File(root, "download-v1/warzone-mobile-v1.zip");
        partial = new File(root, "download-v1/warzone-mobile-v1.zip.part");
        root.mkdirs();
        pack = new OptionalPackStore(context, "campaign-videos/download-v1", "warzone-mobile-v1.zip",
                DOWNLOAD_URL, ARCHIVE_BYTES, ARCHIVE_SHA256);
        received = Math.min(ARCHIVE_BYTES, Math.max(archive.length(), partial.length()));
    }

    boolean ready() { return verified && installed.isDirectory(); }
    boolean downloading() { return busy; }
    String phase() { return state; }
    long downloadedBytes() { return received; }

    void inspect(Consumer<Boolean> callback) {
        final int token;
        synchronized (this) {
            if (closed) return;
            token = generation;
            if (busy) { deliver(token, () -> callback.accept(ready())); return; }
            state = "checking";
        }
        worker.execute(() -> {
            boolean valid = false;
            try {
                recoverPrevious(token);
                valid = validInstallation(installed, token);
            } catch (IOException ignored) { /* A missing/incomplete install is downloadable again. */ }
            final boolean result = valid;
            synchronized (this) {
                if (!current(token)) return;
                verified = result;
                state = result ? "ready" : "idle";
            }
            deliver(token, () -> callback.accept(result));
        });
    }

    void download(OptionalPackStore.Listener listener) {
        final int token;
        synchronized (this) {
            if (closed || busy) return;
            token = ++generation;
            busy = true;
            state = "checking";
        }
        worker.execute(() -> {
            try {
                recoverPrevious(token);
                if (validInstallation(installed, token)) { complete(token, listener); return; }
                check(token);
                verified = false;
                // Discover a previously verified archive after cancellation/restart, before networking.
                state = "verifying";
                deliver(token, () -> listener.progress(received, true));
                pack.inspect(valid -> {
                    if (!current(token)) return;
                    if (valid) installAsync(token, listener);
                    else worker.execute(() -> startTransfer(token, listener));
                });
            } catch (Exception error) { fail(token, listener, error); }
        });
    }

    private void startTransfer(int token, OptionalPackStore.Listener listener) {
        try {
            check(token);
            long prefix = partial.isFile() ? partial.length() : 0;
            if (prefix > ARCHIVE_BYTES) prefix = 0;
            requireSpace(ARCHIVE_BYTES - prefix + INSTALLED_BYTES + SPACE_MARGIN);
            state = "downloading";
            pack.download(new OptionalPackStore.Listener() {
                @Override public void progress(long bytes, boolean verifying) {
                    if (!current(token)) return;
                    received = bytes;
                    state = verifying ? "verifying" : "downloading";
                    deliver(token, () -> listener.progress(bytes, verifying));
                }
                @Override public void ready() { if (current(token)) installAsync(token, listener); }
                @Override public void failed(String message) {
                    fail(token, listener, new IOException(message));
                }
            });
        } catch (Exception error) { fail(token, listener, error); }
    }

    private void installAsync(int token, OptionalPackStore.Listener listener) {
        worker.execute(() -> {
            File stage = new File(root, ".install-" + token + "-" + Long.toHexString(System.nanoTime()));
            try {
                check(token);
                if (pack.readyFile() == null) throw new IOException("The campaign download needs to be verified again.");
                state = "installing";
                received = ARCHIVE_BYTES;
                deliver(token, () -> listener.progress(ARCHIVE_BYTES, true));
                cleanAbandonedStages(stage, token);
                requireSpace(INSTALLED_BYTES + SPACE_MARGIN);
                createDirectory(stage);
                extractVideos(pack.readyFile(), stage, token);
                writeSynced(new File(stage, INVENTORY_NAME), INVENTORY.getBytes(StandardCharsets.UTF_8));
                syncDirectory(stage);
                // Serialize the final promotion with cancel: incomplete content never becomes ready.
                synchronized (this) {
                    check(token);
                    removeOwned(previous);
                    if (installed.exists()) move(installed, previous);
                    try {
                        move(stage, installed);
                        syncDirectory(root);
                    } catch (IOException error) {
                        if (!installed.exists() && previous.exists()) move(previous, installed);
                        throw error;
                    }
                    verified = true;
                }
                // Promotion already succeeded: failure to reclaim the backup must not report an install failure.
                try { removeOwned(previous); } catch (IOException ignored) { }
                // Keep only the movies, notices and durable inventory, not the old full web bundle.
                if (current(token)) { archive.delete(); partial.delete(); }
                complete(token, listener);
            } catch (Exception error) { fail(token, listener, error); }
            finally { try { removeOwned(stage); } catch (IOException ignored) { } }
        });
    }

    void cancel() {
        synchronized (this) {
            generation++;
            busy = false;
            state = ready() ? "ready" : "idle";
        }
        pack.cancel();
    }

    void close() {
        synchronized (this) { closed = true; }
        cancel();
        pack.close();
        worker.shutdownNow();
    }

    private void complete(int token, OptionalPackStore.Listener listener) {
        synchronized (this) {
            if (!current(token)) return;
            verified = true;
            busy = false;
            received = ARCHIVE_BYTES;
            state = "ready";
        }
        deliver(token, listener::ready);
    }

    private void fail(int token, OptionalPackStore.Listener listener, Exception error) {
        synchronized (this) {
            if (!current(token)) return;
            busy = false;
            state = ready() ? "ready" : "idle";
        }
        String message = error.getMessage();
        String detail = message == null ? "Campaign movies could not be installed. Please retry." : message;
        deliver(token, () -> listener.failed(detail));
    }

    private boolean current(int token) { return !closed && token == generation; }
    private void check(int token) throws InterruptedIOException {
        if (!current(token) || Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Cancelled");
    }
    private void deliver(int token, Runnable callback) {
        main.post(() -> { if (current(token)) callback.run(); });
    }
    private void requireSpace(long required) throws IOException {
        if (root.getUsableSpace() < required)
            throw new IOException("Not enough free space. Free at least " + ((required + 1_048_575) / 1_048_576) + " MiB and retry.");
    }

    private void recoverPrevious(int token) throws IOException {
        check(token);
        if (!installed.exists() && previous.exists() && validInstallation(previous, token)) {
            synchronized (this) { check(token); move(previous, installed); syncDirectory(root); }
        }
    }

    private void cleanAbandonedStages(File active, int token) throws IOException {
        check(token);
        File[] entries = root.listFiles();
        if (entries == null) throw new IOException("Campaign storage is unavailable.");
        for (File entry : entries) {
            check(token);
            if (entry.getName().startsWith(".install-") && !entry.equals(active)) removeOwned(entry);
        }
    }

    private boolean validInstallation(File directory, int token) throws IOException {
        check(token);
        if (!Files.isDirectory(directory.toPath(), LinkOption.NOFOLLOW_LINKS)) return false;
        File marker = new File(directory, INVENTORY_NAME);
        if (!Files.isRegularFile(marker.toPath(), LinkOption.NOFOLLOW_LINKS)
                || marker.length() != INVENTORY.getBytes(StandardCharsets.UTF_8).length) return false;
        if (!INVENTORY.equals(new String(Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8))) return false;
        Set<String> actual = new HashSet<>();
        collectFiles(directory, directory, actual, token);
        if (actual.size() != FILES.size() + 1 || !actual.contains(INVENTORY_NAME)) return false;
        for (Map.Entry<String, VideoFile> item : FILES.entrySet()) {
            check(token);
            if (!actual.contains(item.getKey())) return false;
            File file = confined(directory, item.getKey());
            if (file.length() != item.getValue().bytes || !item.getValue().sha.equals(hash(file, token))) return false;
        }
        return true;
    }

    private void collectFiles(File base, File directory, Set<String> actual, int token) throws IOException {
        File[] children = directory.listFiles();
        if (children == null) throw new IOException("Campaign storage is unavailable.");
        for (File file : children) {
            check(token);
            if (Files.isSymbolicLink(file.toPath())) throw new IOException("Invalid campaign storage path.");
            if (file.isDirectory()) collectFiles(base, file, actual, token);
            else {
                String path = base.toPath().relativize(file.toPath()).toString().replace(File.separatorChar, '/');
                if ((!path.equals(INVENTORY_NAME) && !FILES.containsKey(path)) || !actual.add(path))
                    throw new IOException("Unexpected campaign storage file.");
            }
        }
    }

    private void extractVideos(File zip, File stage, int token) throws IOException {
        Set<String> extracted = new HashSet<>();
        long total = 0;
        try (ZipFile input = new ZipFile(zip)) {
            Enumeration<? extends ZipEntry> entries = input.entries();
            while (entries.hasMoreElements()) {
                check(token);
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (!name.startsWith("sequences/")) continue;
                if (entry.isDirectory()) {
                    String directory = name.substring(0, name.length() - 1);
                    if (!safePath(directory)) throw new IOException("Invalid campaign archive path.");
                    continue;
                }
                VideoFile expected = FILES.get(name);
                if (!safePath(name) || expected == null || !extracted.add(name)
                        || entry.getSize() != expected.bytes) throw new IOException("Unexpected campaign movie entry.");
                File destination = confined(stage, name);
                createDirectory(destination.getParentFile());
                MessageDigest digest = sha256();
                long written = 0;
                try (InputStream stream = input.getInputStream(entry); FileOutputStream output = new FileOutputStream(destination)) {
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while ((count = stream.read(buffer)) != -1) {
                        check(token);
                        written += count;
                        total += count;
                        if (written > expected.bytes || total > INSTALLED_BYTES) throw new IOException("Unexpected campaign movie size.");
                        digest.update(buffer, 0, count);
                        output.write(buffer, 0, count);
                    }
                    output.getFD().sync();
                }
                if (written != expected.bytes || !expected.sha.equals(hex(digest.digest())))
                    throw new IOException("A campaign movie failed its integrity check. Please retry.");
            }
        }
        if (extracted.size() != FILES.size() || total != INSTALLED_BYTES)
            throw new IOException("The campaign movie pack is incomplete.");
        syncTreeDirectories(stage);
    }

    private String hash(File file, int token) throws IOException {
        MessageDigest digest = sha256();
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[128 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) { check(token); digest.update(buffer, 0, count); }
        }
        return hex(digest.digest());
    }

    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }

    private static boolean safePath(String path) {
        if (path == null || path.length() > 240 || path.startsWith("/") || path.indexOf('\\') >= 0) return false;
        String[] components = path.split("/", -1);
        for (String component : components)
            if (component.isEmpty() || component.equals(".") || component.equals("..") || !component.matches("[A-Za-z0-9_.-]+")) return false;
        return components.length <= 8;
    }

    private static File confined(File base, String relative) throws IOException {
        if (!safePath(relative)) throw new IOException("Invalid campaign storage path.");
        File file = new File(base, relative);
        String prefix = base.getCanonicalPath() + File.separator;
        if (!file.getCanonicalPath().startsWith(prefix)) throw new IOException("Invalid campaign storage path.");
        File cursor = file;
        while (cursor != null && !cursor.equals(base)) {
            if (Files.isSymbolicLink(cursor.toPath())) throw new IOException("Invalid campaign storage path.");
            cursor = cursor.getParentFile();
        }
        return file;
    }

    private static void createDirectory(File directory) throws IOException {
        if (Files.isSymbolicLink(directory.toPath()) || (!directory.mkdirs() && !directory.isDirectory()))
            throw new IOException("Campaign storage is unavailable.");
    }

    private void removeOwned(File target) throws IOException {
        if (!target.toPath().toAbsolutePath().normalize().startsWith(root.toPath().toAbsolutePath().normalize()) || target.equals(root))
            throw new IOException("Invalid campaign cleanup path.");
        if (Files.isDirectory(target.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            File[] entries = target.listFiles();
            if (entries == null) throw new IOException("Campaign storage is unavailable.");
            for (File entry : entries) removeOwned(entry);
        }
        Files.deleteIfExists(target.toPath());
    }

    private static void writeSynced(File file, byte[] bytes) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
    }
    private static void move(File source, File target) throws IOException {
        try { Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException unsupported) { Files.move(source.toPath(), target.toPath()); }
    }
    private static void syncTreeDirectories(File directory) throws IOException {
        File[] children = directory.listFiles();
        if (children == null) throw new IOException("Campaign storage is unavailable.");
        for (File child : children) if (child.isDirectory()) syncTreeDirectories(child);
        syncDirectory(directory);
    }
    private static void syncDirectory(File directory) throws IOException {
        FileDescriptor descriptor = null;
        try {
            descriptor = Os.open(directory.getAbsolutePath(), OsConstants.O_RDONLY, 0);
            Os.fsync(descriptor);
        } catch (ErrnoException error) { throw new IOException("Campaign storage could not be committed.", error); }
        finally { if (descriptor != null) try { Os.close(descriptor); } catch (ErrnoException ignored) { } }
    }

    /** Serve verified private files to the existing same-origin WebView route, including byte ranges. */
    WebResourceResponse response(String relativePath, String method, String range, Map<String, String> responseHeaders) {
        Map<String, String> headers = new HashMap<>(responseHeaders);
        headers.put("Accept-Ranges", "bytes");
        headers.put("Cache-Control", "private, max-age=31536000, immutable");
        String path = "sequences/" + relativePath;
        VideoFile expected = FILES.get(path);
        if (!ready() || !safePath(path) || expected == null) return empty(404, "Not Found", headers);
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            headers.put("Allow", "GET, HEAD");
            return empty(405, "Method Not Allowed", headers);
        }
        try {
            File file = confined(installed, path);
            if (!file.isFile() || file.length() != expected.bytes) { verified = false; return empty(404, "Not Found", headers); }
            long start = 0, end = expected.bytes - 1;
            int code = 200;
            if (range != null && !range.isEmpty()) {
                long[] limits = byteRange(range, expected.bytes);
                if (limits == null) {
                    headers.put("Content-Range", "bytes */" + expected.bytes);
                    return empty(416, "Range Not Satisfiable", headers);
                }
                start = limits[0]; end = limits[1]; code = 206;
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + expected.bytes);
            }
            long length = end - start + 1;
            headers.put("Content-Length", Long.toString(length));
            InputStream body = "HEAD".equals(method) ? new ByteArrayInputStream(new byte[0]) : new SliceInputStream(file, start, length);
            return new WebResourceResponse(path.endsWith(".ogg") ? "video/ogg" : "text/plain", null,
                    code, code == 206 ? "Partial Content" : "OK", headers, body);
        } catch (IOException error) { return empty(404, "Not Found", headers); }
    }

    private static WebResourceResponse empty(int code, String reason, Map<String, String> headers) {
        headers.put("Content-Length", "0");
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, headers, new ByteArrayInputStream(new byte[0]));
    }
    private static long[] byteRange(String range, long length) {
        if (!range.matches("bytes=(?:[0-9]+-[0-9]*|-[0-9]+)")) return null;
        try {
            String[] bounds = range.substring(6).split("-", -1);
            long start, end;
            if (bounds[0].isEmpty()) {
                long suffix = Long.parseLong(bounds[1]);
                if (suffix <= 0) return null;
                start = Math.max(0, length - suffix); end = length - 1;
            } else {
                start = Long.parseLong(bounds[0]);
                end = bounds[1].isEmpty() ? length - 1 : Math.min(Long.parseLong(bounds[1]), length - 1);
            }
            return start < 0 || start >= length || end < start ? null : new long[] { start, end };
        } catch (NumberFormatException invalid) { return null; }
    }
    private static final class SliceInputStream extends InputStream {
        private final RandomAccessFile file;
        private long remaining;
        SliceInputStream(File source, long start, long length) throws IOException {
            file = new RandomAccessFile(source, "r"); file.seek(start); remaining = length;
        }
        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = file.read();
            if (value < 0) throw new IOException("Campaign movie ended unexpectedly.");
            remaining--; return value;
        }
        @Override public int read(byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining == 0) return -1;
            int count = file.read(buffer, offset, (int) Math.min(remaining, length));
            if (count < 0) throw new IOException("Campaign movie ended unexpectedly.");
            remaining -= count; return count;
        }
        @Override public long skip(long count) throws IOException {
            long skipped = Math.min(remaining, Math.max(0, count));
            file.seek(file.getFilePointer() + skipped); remaining -= skipped; return skipped;
        }
        @Override public int available() { return (int) Math.min(Integer.MAX_VALUE, remaining); }
        @Override public void close() throws IOException { file.close(); }
    }

    private static final class VideoFile {
        final long bytes;
        final String sha;
        VideoFile(long bytes, String sha) { this.bytes = bytes; this.sha = sha; }
    }
    // Generated from the pinned, SHA-256 verified owner archive; movie names are case-sensitive.
    private static final String[] PINNED_FILES = {
        "sequences/COPYING|18011|e6d6a009505e345fe949e1310334fcb0747f28dae2856759de102ab66b722cb4",
        "sequences/VERSION|4|5d43fc4b98938fad12641b4620e757b00d80de17a0715bf7ed816b33ac41df47",
        "sequences/brfcom.ogg|194106|12ef05b5bc0d553a920035582f7f6c625e4eba9b3e390845ee65118ad7778c4d",
        "sequences/brfcom4s.ogg|321617|5b645607569d7666e732743ad85d0ce5088d2a877768e3d52855c97a6eb41132",
        "sequences/c001.ogg|3453173|ba8bf17bdfa5f069976a774ae714ba7f5bbccc5b37c4b83df3e44c05ada6ad28",
        "sequences/cam1/c001.ogg|3679685|8a06c9347733f9702a061606b0f369bb01f75d6b37ae59768bb457131953556e",
        "sequences/cam1/c001end.ogg|4348612|26612f7b88aa2102ff675d491434854bdafc8dfaec9bcac4dc3ac074d27e78bd",
        "sequences/cam1/c001pl.ogg|367302|52360ad87f275b00cf1c71c9f4f8f36b4362655beb7aadc1bfbb716d117b1276",
        "sequences/cam1/cam1.ogg|1041710|e04d41b633145cf7958e1e1611735f0bd74ce062ad0a8d4b67d116e1f9d95160",
        "sequences/cam1/cam1ac.ogg|465106|f4f02647a80809ee57fbecfa621451b07762bf65fb89286822c2414cb0d59cda",
        "sequences/cam1/cam1acp.ogg|731913|f029fba91645e69064cb145cfec638247ff98d3fa8b350656af16c038a872a49",
        "sequences/cam1/cam1ascv.ogg|360354|06f6efb97101ce142be3e410f32ee9a469478d6480813f289cc1a9c29dec1c35",
        "sequences/cam1/cam1b.ogg|871387|4b531d1eef7192c6c37a4041e171a46a4722812188ae31ded5674b3ade06ee5e",
        "sequences/cam1/cam1b_p.ogg|807967|bc27050e9caf88113cf9666fc18c719f04a8b92f4e3ba3568f2f849127c61946",
        "sequences/cam1/cam1bpow.ogg|460708|8a0d06d3cb80d87951d6a96bc543795020348866af2805693f7195332d03adfd",
        "sequences/cam1/cam1ca.ogg|1557281|5b68b7c5005409f46c3d9460eb6a4de767de07b2582bb06eefaeb1d005986469",
        "sequences/cam1/cam1capl.ogg|1049317|5a529fee43f314f62dccdebc5a6ba1c4925cea5c5454deccb9f08ea007bbd742",
        "sequences/cam1/cam1ccf.ogg|530653|4d0d18c1de244fc50a01717774b9f3571b72958962a21cba14a627348c283fd6",
        "sequences/cam1/cam1ccom.ogg|435186|dc20b0ed810523989a8073dc9058e0b6ea92e319a0bddab9465be2241c8ee157",
        "sequences/cam1/cam1clz.ogg|423371|f2d328f9f61db3f1f6b7b6855e1653d46629c8352c38f3cb20e905926baaef25",
        "sequences/cam1/cam1cnp.ogg|349122|9971484fa0cd797c5cf6348628a1dbdd49cd79f7750b1f3f7c74c68fe2f7eb79",
        "sequences/cam1/cam1d.ogg|495261|e3ca864806cfc6b8a37b794b202cf789827f54d5d2a8f44782115419220df7e3",
        "sequences/cam1/cam1dnp.ogg|359955|91150c9d8097168dacb2121ebc90d8bbad7a18b9decbd823dccc2f071ec9c232",
        "sequences/cam1/cam1dp1.ogg|607537|f693cd5f970525dce4c22cc7175ec3d86202a0789305fb31a5115633bd7caa30",
        "sequences/cam1/cam1dp2.ogg|583175|3822ab61e329d3f1ededa106d5e1fc90e9aed5b3ddf7baff418c6b2851cc0412",
        "sequences/cam1/cam1out1.ogg|1280751|746e5882fe286b6e6622187dd18f8455d7d3b3fd00efbd3fb719462aa62d7184",
        "sequences/cam1/cam1out2.ogg|1847243|388be552052962910af17935cace261608348b1dee584512c6134cea13c02930",
        "sequences/cam1/cam1out3.ogg|195909|3fad4253e9ffb12c8a0b7ebe7481b8a6fbd0b90739d5500eba1f61a0bb360ada",
        "sequences/cam1/cam1out4.ogg|1154778|8febdf51f9c398d4d2da6cc3f622fa4f3abb894316b779a56385c4a215c6ec3a",
        "sequences/cam1/cam1out5.ogg|2696875|0e4539813b5175beb355e016135535bf381bf71b5a27cc36cc5ad57175ca0989",
        "sequences/cam1/cam1out6.ogg|332761|7fc30c9b9e529ae9be79d27ecf196acfbb39de57a7cccf270cfe3747ed171363",
        "sequences/cam1/map1a_c.ogg|2006903|8b52aa97b3a3737b2a52e58509006be1646bacd1114c6572c9b371f064ae7bcc",
        "sequences/cam1/map1c.ogg|482794|698c2a4cc9a6baf11ce17eb2855a54d7590b5e047880302685af8c797f00975c",
        "sequences/cam1/map1cexp.ogg|1531533|7b08d017a3592f875107041ae97c3bdffc4dd59d88c1b59c13b166163dd44728",
        "sequences/cam1/sub12pt2.ogg|332874|c6e083faea5e0e08b01be891fcdc1893f0a043baad36659a9b2f74ba78a87514",
        "sequences/cam1/sub13bet.ogg|1754711|8513db0d7e75b280aeaf76070a18f30de85df411da0d836b7162e77d8a223fdf",
        "sequences/cam1/sub13gam.ogg|1197886|03cb46a9b5b6a79b4b156797c2e21005f585755522e1be465e5838d9fee118d1",
        "sequences/cam1/sub13np1.ogg|378654|621ac896937f0ffd2ed0f026b4cc7f777053f168b57de1140c67371fade240f0",
        "sequences/cam1/sub13np2.ogg|344017|c15ee4d1e4f876fc06964c625288ec574adcae97b8104af2c8041382dbf8851b",
        "sequences/cam1/sub14anp.ogg|339651|3decdc7bd093890f55e5b1dd19bb3e736f42d99d70d8c7fca2babe0c146359a2",
        "sequences/cam1/sub14bpl.ogg|497946|429cfc0e9f7210be10b1a5b7ef8233895ccf1b3387b3cc7c1ea7fefe9825c7b1",
        "sequences/cam1/sub17fmv.ogg|3722130|7b13c99e6e2ddeb45bb6c216e95289e07edc8830beb1985c606cb75750abb7b7",
        "sequences/cam1/sub1_1.ogg|734014|5aba2cfee09e358b670ab804f237686c76cc0c21d92b7712c66ff89ff9c2ed6d",
        "sequences/cam1/sub1_1p.ogg|371590|25a83f12d80d5267bbe57e3908eee1fa9a2e49a97642130aade4c754a5c40b89",
        "sequences/cam1/sub1_2.ogg|1141655|66851731ab89ee51d4ad79ce5012611f7b3dac592de8fdd122628acd00de37cb",
        "sequences/cam1/sub1_3.ogg|744091|e99c43d8f42ad2e771e22ff8a3d821ffe574a6567a8ecf3386935e9ed92ff868",
        "sequences/cam1/sub1_3p1.ogg|488568|19597b3c2078785206b32e544e52212313cf6029da9276dd043393d25fe57017",
        "sequences/cam1/sub1_4.ogg|559626|6c0c341003128339ef9568e7f877d19a7b81e90ddcf2a3e54786c75573073b93",
        "sequences/cam1/sub1_4b.ogg|396390|9143771c5e49e835a1d74319f27ff29114edce4c440ec9216661d82fcdff404f",
        "sequences/cam1/sub1_4bn.ogg|476001|f43611c061e8178afa927f4959943cc0db404946f87fa9de98910d0e3dcde138",
        "sequences/cam1/sub1_4pl.ogg|535314|ee77a5a0da88bfd27c01099df6e8d67e21ace47b7ed6c70ee4998f754084d0e8",
        "sequences/cam1/sub1_5.ogg|685931|e14dbc402a56e6b5894e7576af2dfbe393348ceb35672f17f8a1fcbd5d2302fc",
        "sequences/cam1/sub1_5pl.ogg|391757|016f203c1c983c29052463a8ffb8982e1db9bd7c9f3b56a504ff4c524e2b5e04",
        "sequences/cam1/sub1_7.ogg|397083|18db61c14e4a7881fb682d1f312b068aa261ce6a8a5e0cca934b49c0b6dad93b",
        "sequences/cam1/sub1_7b.ogg|364444|581cabb816504651366baf3f9eebf70b6d53edb993f80d78ff944447f625847b",
        "sequences/cam1/sub1_7pl.ogg|1940856|ce6d5b6665126a8f35feb3fb9789090d62b579563eebba8969d3935cc8a673bc",
        "sequences/cam2/c002.ogg|2776369|3f5d799927ef375d80e23c166351259978c98b08016be6f93d43d25e71c1640a",
        "sequences/cam2/c2diif2.ogg|1337770|7abedf97c8e321b1969c9ce93073079dc1a2bab01b8dd99b114bac1ca2d07c6f",
        "sequences/cam2/cam22fmv.ogg|2808117|010284b49d6057772cd0fc44dba55b97608c56edc0dad7301c9ef4c4f00ebd35",
        "sequences/cam2/cam22pl1.ogg|1289742|207f98262d98572b6d353c4353de51a805968c877e6adb1e7508aed61df656ac",
        "sequences/cam2/cam22pl2.ogg|307805|6262635e29485d0b82003ff6ba3f01325e15e311214c852739a2973114fc0fa8",
        "sequences/cam2/cam22pl3.ogg|386063|0c6e58b8aa832bf1d5880b24ecdb4c1b23d53db858b38b0e889cc855d4e64887",
        "sequences/cam2/cam26afm.ogg|2692780|bb83a4d3ec4b31308bd2a723184419f7e210cdfa735b3db696c7048f7ffd06ff",
        "sequences/cam2/cam26bfm.ogg|1304785|625aec7b6a345207e0ee5b910dcabbe9d1c00428ab30022cea0f3c69a440f239",
        "sequences/cam2/cam26pl1.ogg|1103647|793cce28609a256a43cb94a5210d984470338afad51b7f8032aa1e825addac96",
        "sequences/cam2/cam26pl2.ogg|677687|b483343517468e73d2ecc12de011d2cab2892dd4d40f8f0fe80bffda3cbca4eb",
        "sequences/cam2/cam27fmv.ogg|558166|3c93a1db492f0ec657e5a1ae63c201ee33c7709221ce7b33f82aa2dce2da2d53",
        "sequences/cam2/cam28apl.ogg|646539|3dc19d48a292b85e92fae12def34108e8cc28e3810dea206d951a6e8f898606c",
        "sequences/cam2/cam2_1.ogg|673030|7805c11deb3ba436ea5aeebd5682a6468fb0ac31d4bbd0dadac8be84e25f8a12",
        "sequences/cam2/cam2_2.ogg|653011|65089d4558ec1ff00c87aecbcc6877d2171db5c247552aa8cfa8d02d41fa8979",
        "sequences/cam2/cam2_2n.ogg|832259|95f5bb657d4b190fc48886b615869342e35366569858b65bc2753d04d6289724",
        "sequences/cam2/cam2_2n2.ogg|278552|26814bd2f3a6723458ad9a2467505f5f3f6c052713f86153dfe268ab72e92c3e",
        "sequences/cam2/cam2_5.ogg|389548|5cafcdc182076d4c5f9da6c56c9e37c02ead211d601ab0050c6a62302c46cdac",
        "sequences/cam2/cam2_5pl.ogg|999158|89af7a0ef09c8e3d685e26ec7079484d82b093765cff1713665e6e31f4d8356a",
        "sequences/cam2/cam2_6a.ogg|431063|bf225c573121f4f23abafed0cc077e44637d5af3a1a00203b262fb5156cd27a4",
        "sequences/cam2/cam2_6b.ogg|371782|d0d70e4e692c4ef47e42135b286b9cd67ce164a7a33b05cca01ea8242c851c0d",
        "sequences/cam2/cam2_7.ogg|725593|9b70681401c95e7719466d86b26531ff7e7a3de2d580bd3ed4d2d34a53d2e3f0",
        "sequences/cam2/cam2_8a.ogg|362928|52dadf631975fba068abb7d2433151775678123a09876775288ecb7c7fcffe5a",
        "sequences/cam2/cam2_di.ogg|415299|9943538c8b1b956bfa3162754681b7f85286fb06142e807d3e0c6d82d9eabf01",
        "sequences/cam2/cam2_diib.ogg|1028347|726aad16d79d7c3bf3337ae3f45e3d617c7420d3cb1ec6f6ad0b2689171ebf7e",
        "sequences/cam2/cam2acol.ogg|753253|0a038de31e90e290fa8c9e515a377c13f14ba825d490daef59c83316e1402344",
        "sequences/cam2/cam2ap.ogg|553768|4b141bede1450603a0cb0b27ad615c5a43ce5e5cdf3baff4680ae11ae4bfc73e",
        "sequences/cam2/cam2ap1.ogg|562734|2b08e11c1ae5bbf5103db785addc275a5fc3e6e5798e5fee960b05034518e2db",
        "sequences/cam2/cam2b.ogg|306186|c1d09a55caa1ae0d77da607dce667541f81b38fb8a7b3e4072badb532e4bfbbb",
        "sequences/cam2/cam2bcol.ogg|1072088|bdd5687ebd5c8f29bea10085dda6afe0f4d2e5bc870d4a239285a2673b950738",
        "sequences/cam2/cam2bpl.ogg|641699|a803f7a7c4f34ba0dcb4456deba72e2e14a2f716ea58db76c6ff53ea7aef6257",
        "sequences/cam2/cam2ca.ogg|395687|9c30d6744ecf7cbcb0d3391aa3ea57b783eb1d24a1ca9a978d2e9104f4ecfaf0",
        "sequences/cam2/cam2capl.ogg|636489|888c0afcfe2bbf358be02e390a03ba5f4c390dc50d842fbdb500aa8d30acb139",
        "sequences/cam2/cam2cb.ogg|374365|ff81454bfeaaef50f543cf0f5c8d2491291b06d4bb40f8962f6df4f63012f800",
        "sequences/cam2/cam2cbpl.ogg|738014|e2f1098de816555700479b8400d3207520c33f4319c6696cff8c21be657d1165",
        "sequences/cam2/cam2dico.ogg|751642|faf3841fc4824c075a6ef9609d36ee5d8686649263498d56c795b1221b460dfa",
        "sequences/cam2/cam2diib.ogg|640514|873be856f2ae391bd6012ad22de38d3e32ccf4b9e8d9c109b7c050d630a16d4e",
        "sequences/cam2/cam2diif.ogg|191032|f6c4bd971afaa9741b0b461999ba4c5a5705c5714d217e8d3c4f79c3b29badc2",
        "sequences/cam2/cam2diin.ogg|682450|a5bd5422bb008adbea6bb76f9bee6afb323ea5af5bea0f186583693277f3579c",
        "sequences/cam2/cam2diip.ogg|526345|51aa4c8a70ea169aa7a33d90db6d73dd64c6b829bc597f4a3aeb2f7682c35523",
        "sequences/cam2/cam2dipl.ogg|329558|5b3f9fe46fa4a2cbfe4134e54040edf8fd6b32cd0b9cff447e6f3789fdc84421",
        "sequences/cam2/cam2int1.ogg|5121111|a8b6a3cf729c15d0a334ad546273c968e36ee9d98357345817cdcdafdecb745a",
        "sequences/cam2/cam2int2.ogg|2804602|0f2314cd58c32b36d796956277977e4bfad51124b30f742b22a9727d7a8ee2f5",
        "sequences/cam2/cam2inta.ogg|1068023|4fe79a82f49fb6cbcadf71e13f6dde2918c8aba0830042f4be13589405143843",
        "sequences/cam2/cam2intb.ogg|433950|1cb1fae626e46519bc967c703f0f9d6cfb4c5fca04c764e17b6bc89e3e094ca2",
        "sequences/cam2/cam2out.ogg|1216825|492dc620fcb1edf66561049544e9646260a5bf284243882d7740373411a6efb5",
        "sequences/cam3/c003.ogg|2869761|6a2c360453fb233f60785ae29c0627099cb1607cbfe86fc4313f21c6eede2440",
        "sequences/cam3/c3_d1_a.ogg|1084981|8e6ad9af0addbdc84177b154397dfb3d6323cf1dc01548c56df42baf56625d2a",
        "sequences/cam3/c3_d1_b.ogg|759535|d44add330fb3d042ffbba3c82c959576338d76a0eac82f21b26a6a647daecb7a",
        "sequences/cam3/c3ad1pl1.ogg|1277772|953962388b5677e780759e6f6efc5a04f6bae9436b59e897c66becc7aefe3f2d",
        "sequences/cam3/c3ad1pl2.ogg|1574285|b78394c0cee9e20359f4e27a985c1f4c5b0a0844d87c0cc957c7c361a60c4742",
        "sequences/cam3/c3ad1pl3.ogg|222638|a1eea0f49560b35c3a3e060bcc91cee47fb763ce240d1480904408d0db4f3207",
        "sequences/cam3/c3ad2_09.ogg|485608|2a278744aad2da100aef064a465f4bc5bdeaa141b98cb0ed95579f1b1a18af8d",
        "sequences/cam3/c3ad2_12.ogg|172351|61c7feaaed6f4956192a2540887d41268be0752c3772c28887f928e2551a97dc",
        "sequences/cam3/c3ad2_14.ogg|216616|d1ddc17c35bffa8455b032047178749af692a370b03dc452726f38a93fc64eda",
        "sequences/cam3/c3ad2_16.ogg|1784046|10e1462ce82b97d2f86ec9ffe9a1c11ee35bf4d3e76476847dca7f7b53ae8f6c",
        "sequences/cam3/c3ad2_17.ogg|1447639|fa16ff1fec2f5f7f1f81104eee56c3f037d7655d47f7f3533da1f29dbd6cccfd",
        "sequences/cam3/c3ad2n2.ogg|435343|ce059ea72b0a823178e2320161e9384f3a7c40575be468da8d7e550779617130",
        "sequences/cam3/c3ad2pl1.ogg|2252517|40c5681e11b0fdbe86054c65efd2faedf903f9039565bc0568522b1b0c0f0140",
        "sequences/cam3/c3ad2pl2.ogg|1268829|dab620f1592f899284f0fef1dd315b21ed9f9836a8a095a4dc5fd70fc1db3118",
        "sequences/cam3/c3ad2pl3.ogg|603459|fc396f85f627f60bbbc5d6dbd4b65878109643f6e54d0846861dd582e3a4e319",
        "sequences/cam3/c3ad2pl4.ogg|938228|cfadd75db77d5981b59f32b4d080eeecc25e397b0607f4becfbaa39a2514523a",
        "sequences/cam3/c3c.ogg|500124|87656cd6b8f378dd867b7a2238c20f1815ea91f138adc4315ae72ad7dbd8dda2",
        "sequences/cam3/cam31bpl.ogg|797751|af73164a2cc2f1b3dd00ed64ca2a2b898ae9d148bd50b6eac4b90eafd7b9de66",
        "sequences/cam3/cam31g2.ogg|799573|cdd1c15ab058553ef2e34e5850b726c4615b74d69bc2bd24fd45b5f749c4fa8b",
        "sequences/cam3/cam31gam.ogg|1136290|799a987894bcf5323a322bed9bbe37e8f5f5d6497d34affa8943f6b45c9dc2c8",
        "sequences/cam3/cam32a2.ogg|1269066|df9659aa648c28178206c06acf19205ece9ba3ca3b76ee9f96259df99c3373d4",
        "sequences/cam3/cam32alp.ogg|1378708|77c93869a0312e8e3c986e08dd4fa506bfc3b1604b7fb9e1501b787d58c668d3",
        "sequences/cam3/cam32pl.ogg|1711269|13e716a92dd50d855011e77e6d5513cba992aadc717ad9b53482ffab30ee7f61",
        "sequences/cam3/cam32pl2.ogg|1250557|1002b279045b1e4b299775b411b42962cc6a4c2165dcf90169429c3c3fd02bbb",
        "sequences/cam3/cam32pl3.ogg|629412|93fd930075416b38ea994f85f8a07683b7e9b38609cbf9c592682c59dacd2e9a",
        "sequences/cam3/cam34fmv.ogg|294131|5175e5db0528a0eabb74484e2d41ec733675f58cb106baa5da57e4e69ed1e8a0",
        "sequences/cam3/cam34mu1.ogg|744030|24251e359a8d095ddfe05e244f83f922ea47bd99d7ccdd83601993175241f5b6",
        "sequences/cam3/cam34mu2.ogg|459360|726a1751aca2a913b37fb733e1d7db40348f8fd9623448318577a29abd4e8233",
        "sequences/cam3/cam3_1.ogg|391078|f162c2c71de02825711c1c820c9fa6891efd4a8847a052e28f253bd9f1409a5b",
        "sequences/cam3/cam3_1b.ogg|354633|fc44e983099ec54a19450f556c70a6ade34de79585b9eaff3089f3e1da0648f8",
        "sequences/cam3/cam3_1bn.ogg|858302|0a7e986a2ea7e033f5982cddb9bc0ef48d1c8cae4a79e56761f37e028d9f36e2",
        "sequences/cam3/cam3_2b.ogg|455819|bdd18c5170b405b5fe1ce6995b6a783bd594b95020b49298fca7521e9f627a03",
        "sequences/cam3/cam3_4a.ogg|333757|7b80fc32884f557be4d3bc08ff94a9e6f1af1b47959433953b6e340599cf4f93",
        "sequences/cam3/cam3_4b.ogg|379892|c0f9cbd8c234143bce508fdb41373d6a805058370ad4170ef48d75a47d185613",
        "sequences/cam3/cam3_bn.ogg|1256345|c807b96d5d52c995cae01a8441b7993ce131bfe1de9a09bc5585ead6fa4f8208",
        "sequences/cam3/cam3_cb.ogg|718320|ebebcf6666d7f1494746f0ef068ac0e7d7a3364b0bc42796a574f15c5732014b",
        "sequences/cam3/cam3_cg.ogg|1325426|a5e6827bb887cad234602912652e9302c5b219b2e63c5612c05860bb5545ac91",
        "sequences/cam3/cam3_cn.ogg|2050371|a132eb30d5f748049f734b319bbb28e31dd6dbf1bc4967da380498cc4114b67f",
        "sequences/cam3/cam3ab.ogg|477428|464853059a6ff9f98ce62d628642bae6946b7f99ad2e122994bc1950ed116ab1",
        "sequences/cam3/cam3aba.ogg|974925|b4d26f7264c412f12d4d2b7566b2229bc8774f5fed494ff399d3f27907556609",
        "sequences/cam3/cam3abf.ogg|2073358|91d8eb1b676a1b0648d24f99ef8d46a9b426cd9b190895e2f3aa93bb3a6c967c",
        "sequences/cam3/cam3abpl.ogg|1757390|13e77821c89e1011d8da82de6817912a28c5c1c20c2ff099ac213c66b31d1d23",
        "sequences/cam3/cam3ad1b.ogg|1172395|dfa05aeb4dc549658b2172435e5e9d74cacb5f6ec085e94e2d1794231e04e658",
        "sequences/cam3/cam3ad2n.ogg|1139068|7ff62530d82f73bfe357573efbdfdf9eb6d916cdd6d03e9195cad4701d1049a0",
        "sequences/cam3/cam3b.ogg|247123|fab3eb4e46d8188e6afe59f32b7335bb4c8c5314efad40a4319e3cfdb054872c",
        "sequences/cam3/cam3bg.ogg|5750374|b6a9147db8df4270ca1542f8b2a3a40da32b1f50b1839cdf741ad5d8758148f8",
        "sequences/cam3/cam3bpl.ogg|700801|0cc30b01e81ea75bc4a17bc4b421dc41a995dd1d73d6ac864d981def88555dd0",
        "sequences/cam3/cam3cbet.ogg|1899126|aaad0c9d89d7566d0ca1fb32711db094970428141b17f5de7278442d4b7e2523",
        "sequences/cam3/cam3cpl1.ogg|867136|c5f983a9f8d87e8e3b8aeb6719eb60a339bab5864db93bbb9e3aa6034e8adf0c",
        "sequences/cam3/cam3cpl2.ogg|288407|5aa43eeb268b0b64c1453159b41b47e42a1970ddf4433cb82b0e29995f2c0f5a",
        "sequences/cam3/cam3cpl3.ogg|293803|62f7342ea00d1149e7e2b4bec876b5d5bb790ef51266ced7ceeb1e5836fe509b",
        "sequences/cam3/cam3int.ogg|1496729|b753b88f6eaf330a669fbfee49080c1cc6a3a5570e97736ec1f1955fa12ca247",
        "sequences/cam3/cam3intb.ogg|589120|e46fd1ac0b276a9c7965e5dbfea7fb026316f68cd41fc3a01a7f51666c3cb14d",
        "sequences/cam3/cam3intp.ogg|1144732|e0145020f1a303e557daae004f143f14c94a70edca0c4f9dc50e27d91750eae5",
        "sequences/cam_start.ogg|254439|f04f9ae2ee426fc806b5d56c170746096683708cd989c1bfeebbda1a7b2602dc",
        "sequences/devastation.ogg|5807493|3889e0b068d6032cc2167c1cdf1548e9b7f2fa0d8280b5d974a26a8782a6899f",
        "sequences/eidos-logo.ogg|403045|7f1a54bbd54bb033e8d547b61f655d387a77aab57132f005b697832fce528de1",
        "sequences/end.ogg|245480|e9493dcdd6c61a50e34952370ce3ad0bd4418bf1587594bac61d95d5cda89e98",
        "sequences/factory.ogg|2720849|cf9ec62f8aa253b4b6db44dc8a3f45740f0399a6917de7eb324b3ffba674b0f0",
        "sequences/fastplay.ogg|587114|5444f0665886b9b1cc0d07692ca08797a1645db178cc044dc99c3bb28d7a4ff1",
        "sequences/incomint.ogg|265930|3096430da658d31d178d833fedcec1cfa9b07f0c724986c69f0d821989c4529d",
        "sequences/incomtns.ogg|259426|45010bbb8810e64eee6051208e556242bdd067d7c0ef71691efcfb710b73ff53",
        "sequences/inflight.ogg|240089|bdd0e0e0924e38d6fc396506828a93864844c925bc81e931b85be25bc81ff0de",
        "sequences/nexend.ogg|170716|71cfed13900bd265690296148b3bc59c281c6031ead232529d93c71ebfbfe16f",
        "sequences/npend.ogg|177154|34cf5a4059530a4420567c41fd87b406b205155b43ea636a4a44f41e74549bea",
        "sequences/npstart.ogg|243615|3d4824808bf383011bb3b38fce99c0513028001c184150663dd1fc64ee84a54b",
        "sequences/outro.ogg|3042919|682eb06ca4b02deec506bf5f2216946a0b5a4d474d6a85cdfa617138ec813aa8",
        "sequences/player.ogg|152326|ba07d3eaf0c5dd6d5413679c96a5c6be312c5dede769f80611a277abd2af0a64",
        "sequences/plyr4sec.ogg|317670|74fccd23dca4f4754b20357d7aa081da5f9ec91986adf036ee619145564c37a2",
        "sequences/prjupdat.ogg|247692|304d2e18dd904f580ba8055244038ebd44e0393fdf33bb9e3db6b9e21e49a0db",
        "sequences/pumpkin.ogg|323628|e6d284310b3e51cd4c3592099411ecc1073c03ea0d593a4d758707d13050d2aa",
        "sequences/res_com.ogg|203139|574379c05950f73c83693109fc17fb27bdfdc16ad4a24c3d4010b7cb7ea3a2b3",
        "sequences/res_droid.ogg|194719|b3a001c9f18eb04c110347215c873b1d35f9647e5abb321f305b153869f9243e",
        "sequences/res_pow.ogg|176763|47819b12d10cc2ab52fbde1fed7589860a88f234d37091a92b3f25f3c4e504be",
        "sequences/res_struttech.ogg|117985|d366d1ea80434a4c6532e654bca3973d89d4b37353e3960041a96119009ed4a6",
        "sequences/res_systech.ogg|173655|4d6db7f686f79f48dc0aea19883700e07da6e9eb3be67c0e128e81ace9be16e7",
        "sequences/res_weapons.ogg|181685|342441907fc0cff3794308b52be10b0639025c9e72c6324a2b740bbcc91b3363",
        "sequences/titles.ogg|825791|4879748b3f00a514e3de4e3f260c94695f6875c31e4b47eb24a1f945fdfc070e",
        "sequences/transport.ogg|439920|aff1dd5abc9dd94944f421b9ae6f89aa7c7931db270a11769a700f553f01e03a",
        "sequences/victory.ogg|100020|c0e634aa5f28aa87c34f89af6f2b208678e21b6b21b06ab4b0a393104f4e0474",
    };
    private static final Map<String, VideoFile> FILES;
    private static final String INVENTORY;
    static {
        Map<String, VideoFile> files = new LinkedHashMap<>();
        StringBuilder inventory = new StringBuilder("campaign-sequences-v1\n" + ARCHIVE_SHA256 + "\n");
        for (String row : PINNED_FILES) {
            String[] parts = row.split("\\|", -1);
            files.put(parts[0], new VideoFile(Long.parseLong(parts[1]), parts[2]));
            inventory.append(row).append('\n');
        }
        FILES = Collections.unmodifiableMap(files);
        INVENTORY = inventory.toString();
    }
}
