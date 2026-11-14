package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Loopback coverage of the existing shared downloader used by CampaignVideoStore. */
class CampaignTransferCheck051 {
    static void require(boolean value, String detail) { if (!value) throw new AssertionError(detail); }
    static void await(CountDownLatch latch) throws Exception { require(latch.await(20, TimeUnit.SECONDS), "transfer timeout"); }
    static void success(OptionalPackStore store) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> failure = new AtomicReference<>();
        store.download(new OptionalPackStore.Listener() {
            public void progress(long bytes, boolean checking) { }
            public void ready() { done.countDown(); }
            public void failed(String message) { failure.set(message); done.countDown(); }
        });
        await(done);
        require(failure.get() == null && store.readyFile() != null, "transfer: " + failure.get());
    }
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        byte[] expected = Files.readAllBytes(Path.of(args[1]));
        String base = args[2], sha = args[3];
        Context context = new Context(root.toFile());
        OptionalPackStore corrupt = new OptionalPackStore(context, "corrupt", "pack.zip", base + "/pack", expected.length, sha);
        try {
            Files.write(root.resolve("corrupt/pack.zip.part"), new byte[expected.length]);
            CountDownLatch done = new CountDownLatch(1);
            AtomicReference<String> failure = new AtomicReference<>();
            corrupt.download(new OptionalPackStore.Listener() {
                public void progress(long bytes, boolean checking) { }
                public void ready() { failure.set("CORRUPT ACCEPTED"); done.countDown(); }
                public void failed(String message) { failure.set(message); done.countDown(); }
            });
            await(done);
            require(failure.get() != null && !failure.get().equals("CORRUPT ACCEPTED"), "corrupt SHA must be rejected");
            require(corrupt.readyFile() == null && !Files.exists(root.resolve("corrupt/pack.zip.part")), "corrupt partial discarded");
        } finally { corrupt.close(); }
        OptionalPackStore resumed = new OptionalPackStore(context, "resume", "pack.zip", base + "/pack", expected.length, sha);
        try {
            Files.write(root.resolve("resume/pack.zip.part"), Arrays.copyOf(expected, 16_384));
            success(resumed);
            require(Arrays.equals(Files.readAllBytes(resumed.readyFile().toPath()), expected), "resumed body identity");
        } finally { resumed.close(); }
        OptionalPackStore interrupted = new OptionalPackStore(context, "cancel", "pack.zip", base + "/slow", expected.length, sha);
        try {
            CountDownLatch cancelled = new CountDownLatch(1);
            interrupted.download(new OptionalPackStore.Listener() {
                public void progress(long bytes, boolean checking) {
                    if (!checking && bytes > 0) { interrupted.cancel(); cancelled.countDown(); }
                }
                public void ready() { throw new AssertionError("Cancelled transfer completed"); }
                public void failed(String message) { throw new AssertionError(message); }
            });
            await(cancelled);
            Path prefix = root.resolve("cancel/pack.zip.part");
            require(Files.size(prefix) > 0 && Files.size(prefix) < expected.length, "cancelled partial prefix retained");
            success(interrupted);
            require(Arrays.equals(Files.readAllBytes(interrupted.readyFile().toPath()), expected), "cancel/resume body identity");
        } finally { interrupted.close(); }
        System.out.println("PASS: shared downloader rejects corrupt full partial, resumes verified-prefix range, cancels active transfer and resumes retained bytes over loopback HTTP");
    }
}
