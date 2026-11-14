package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Host checks use actual movie bytes, not emulated native playback. */
class CampaignVideoCheck051 {
    static void require(boolean value, String detail) { if (!value) throw new AssertionError(detail); }
    static void await(CountDownLatch latch, String detail) throws Exception {
        require(latch.await(90, TimeUnit.SECONDS), detail + " timed out");
    }
    static boolean inspect(CampaignVideoStore store) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<Boolean> result = new AtomicReference<>();
        store.inspect(value -> { result.set(value); complete.countDown(); });
        await(complete, "inspect");
        return Boolean.TRUE.equals(result.get());
    }
    static void seed(Path root, Path archive) throws Exception {
        Path destination = root.resolve("campaign-videos/download-v1/warzone-mobile-v1.zip");
        Files.createDirectories(destination.getParent());
        Files.copy(archive, destination, StandardCopyOption.REPLACE_EXISTING);
    }
    static void download(CampaignVideoStore store, AtomicInteger readyCount) throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<String> failure = new AtomicReference<>();
        OptionalPackStore.Listener listener = new OptionalPackStore.Listener() {
            public void progress(long bytes, boolean checking) { }
            public void ready() { readyCount.incrementAndGet(); finished.countDown(); }
            public void failed(String message) { failure.set(message); finished.countDown(); }
        };
        store.download(listener);
        store.download(listener); // A second tap during verification must not start a second job.
        await(finished, "install");
        require(failure.get() == null, "install failed: " + failure.get());
        require(store.ready() && store.phase().equals("ready"), "ready state");
    }
    static void response(CampaignVideoStore store, String path, String method, String range,
                         int code, long length, byte[] expected) throws Exception {
        WebResourceResponse response = store.response(path, method, range, Map.of("Cross-Origin-Embedder-Policy", "require-corp"));
        require(response.getStatusCode() == code, method + " " + range + " status=" + response.getStatusCode());
        require(response.getResponseHeaders().get("Cross-Origin-Embedder-Policy").equals("require-corp"), "isolation header");
        if (length >= 0) require(response.getResponseHeaders().get("Content-Length").equals(Long.toString(length)), "length");
        try (InputStream input = response.getData()) {
            if (expected != null) require(Arrays.equals(input.readAllBytes(), expected), "range response bytes");
        }
    }
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]), source = Path.of(args[1]);
        Context context = new Context(root.toFile());
        CampaignVideoStore store = new CampaignVideoStore(context);
        try {
            require(!inspect(store), "empty private directory must not be ready");
            Path orphan = root.resolve("campaign-videos/sequences-v1/sequences/cam1/orphan.ogg");
            Files.createDirectories(orphan.getParent()); Files.writeString(orphan, "incomplete");
            require(!inspect(store), "partial install must not be ready");
            seed(root, source);
            CountDownLatch cancelled = new CountDownLatch(1);
            AtomicInteger staleCallbacks = new AtomicInteger();
            final CampaignVideoStore cancellingStore = store;
            store.download(new OptionalPackStore.Listener() {
                public void progress(long bytes, boolean checking) {
                    if (cancellingStore.phase().equals("installing")) { cancellingStore.cancel(); cancelled.countDown(); }
                }
                public void ready() { staleCallbacks.incrementAndGet(); }
                public void failed(String message) { staleCallbacks.incrementAndGet(); }
            });
            await(cancelled, "cancel during extraction");
            require(!store.ready(), "cancel must not expose partial files");
            AtomicInteger ready = new AtomicInteger();
            download(store, ready);
            require(ready.get() == 1 && staleCallbacks.get() == 0, "one callback, stale cancel callbacks suppressed");
            Path installed = root.resolve("campaign-videos/sequences-v1");
            require(Files.isRegularFile(installed.resolve("sequences/COPYING")), "license retained");
            require(Files.readString(installed.resolve("sequences/VERSION")).equals("2.2\n"), "version retained");
            require(!Files.exists(installed.resolve("warzone2100.wasm")), "older native program must not install");
            try (var paths = Files.walk(installed)) {
                require(paths.filter(Files::isRegularFile).count() == 182, "181 files plus durable completion inventory");
            }
            require(!Files.exists(root.resolve("campaign-videos/download-v1/warzone-mobile-v1.zip")), "old full bundle reclaimed after commit");
            Path movie;
            try (var paths = Files.walk(installed.resolve("sequences"))) {
                movie = paths.filter(path -> path.toString().endsWith(".ogg")).findFirst().orElseThrow();
            }
            String relative = installed.resolve("sequences").relativize(movie).toString().replace(File.separatorChar, '/');
            byte[] movieBytes = Files.readAllBytes(movie);
            require(new String(Arrays.copyOf(movieBytes, 4)).equals("OggS"), "actual original Ogg content");
            response(store, relative, "GET", "bytes=0-31", 206, 32, Arrays.copyOf(movieBytes, 32));
            response(store, relative, "GET", "bytes=-20", 206, 20, Arrays.copyOfRange(movieBytes, movieBytes.length - 20, movieBytes.length));
            response(store, relative, "GET", "bytes=" + (movieBytes.length - 7) + "-", 206, 7, Arrays.copyOfRange(movieBytes, movieBytes.length - 7, movieBytes.length));
            response(store, relative, "HEAD", null, 200, movieBytes.length, new byte[0]);
            response(store, relative, "GET", null, 200, movieBytes.length, movieBytes);
            for (String range : new String[] {"bytes=0-1,3-4", "bytes=-0", "bytes=8-2", "bytes=" + movieBytes.length + "-", "bytes=999999999999999999999-"})
                response(store, relative, "GET", range, 416, 0, new byte[0]);
            response(store, relative, "POST", null, 405, 0, new byte[0]);
            response(store, "../warzone2100.wasm", "GET", null, 404, 0, new byte[0]);
            response(store, "cam1/../../sequences/COPYING", "GET", null, 404, 0, new byte[0]);
            response(store, "cam1\\invalid.ogg", "GET", null, 404, 0, new byte[0]);
            store.close();
            store = new CampaignVideoStore(context);
            require(inspect(store), "offline restart must verify and reuse installed movies without archive");
            try (RandomAccessFile file = new RandomAccessFile(movie.toFile(), "rw")) {
                file.seek(10); file.write(movieBytes[10] ^ 1);
            }
            require(!inspect(store) && !store.ready(), "same-size corrupted clip must fail full SHA verification");
            Files.write(movie, movieBytes);
            require(inspect(store), "restored original clip verifies");
            Path marker = installed.resolve(".complete-v1");
            byte[] markerBytes = Files.readAllBytes(marker);
            Files.delete(marker);
            require(!inspect(store), "crash before completion marker must not be ready");
            Files.write(marker, markerBytes);
            require(inspect(store), "durable exact marker and all SHA checks recover");
            Files.move(installed, installed.resolveSibling("sequences-v1.previous"));
            require(inspect(store) && Files.isDirectory(installed), "recover interrupted promotion backup");
            System.out.println("PASS: real pinned ZIP selective extraction, cancellation/retry, duplicate taps, complete inventory, offline SHA readiness, corruption, crash recovery, GET/HEAD/ranges and traversal rejection");
        } finally { store.close(); }
    }
}
