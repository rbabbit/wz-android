package com.rbabbit.blocknight.warzone;

import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;

/** Runs production policy/streaming/geometry on the host; does not simulate Android installation. */
final class AppUpdateCheck086 {
    static int assertions;
    interface Checked { void run() throws Exception; }
    static void yes(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    static void rejects(Checked action, String message) throws Exception {
        assertions++;
        try { action.run(); } catch (IllegalArgumentException | IOException expected) { return; }
        throw new AssertionError(message);
    }
    static AppUpdatePolicy policy(int schema, String id, long code, String name,
            String url, long size, String hash, String notes) {
        return new AppUpdatePolicy(schema, id, code, name, url, size, hash, notes);
    }
    public static void main(String[] args) throws Exception {
        String hash = "0123456789abcdef".repeat(4), id = AppUpdatePolicy.APP_ID, url = AppUpdatePolicy.APK_URL;
        AppUpdatePolicy feed = policy(1, id, 86, "0.86", url, 616050844, hash.toUpperCase(), "Scoped fixes");
        yes(feed.newerThan(85), "New version not offered");
        yes(!feed.newerThan(86) && !feed.newerThan(87), "Same/older version offered");
        yes(feed.sha256.equals(hash), "Hash not normalized");
        for (String badUrl : new String[]{url.replace("https:", "http:"), url + "?file=other", url + "#x",
                url.replace("wz2100.uk", "wz2100.uk.attacker.test"), url.replace("/warzone/", "/other/"),
                url.replace("andriod", "android"), url.replace("wz2100.uk", "user@wz2100.uk"),
                url.replace("wz2100.uk", "wz2100.uk:443")}) {
            rejects(() -> policy(1, id, 86, "0.86", badUrl, 10, hash, ""), "Unsafe/non-contract URL accepted");
        }
        rejects(() -> policy(2, id, 86, "0.86", url, 10, hash, ""), "Unsupported schema");
        rejects(() -> policy(1, id + ".other", 86, "0.86", url, 10, hash, ""), "Other app ID");
        for (long code : new long[]{-1, 0, 2100000001L, Long.MAX_VALUE})
            rejects(() -> policy(1, id, code, "0.86", url, 10, hash, ""), "Invalid version code");
        for (String name : new String[]{"", "\n0.86", "a".repeat(49), "<b>0.86</b>"})
            rejects(() -> policy(1, id, 86, name, url, 10, hash, ""), "Invalid version name");
        for (long size : new long[]{-1, 0, AppUpdatePolicy.MAX_APK_BYTES + 1})
            rejects(() -> policy(1, id, 86, "0.86", url, size, hash, ""), "Invalid download size");
        for (String sha : new String[]{"", hash.substring(1), "g".repeat(64), hash + "0"})
            rejects(() -> policy(1, id, 86, "0.86", url, 10, sha, ""), "Invalid checksum");
        rejects(() -> policy(1, id, 86, "0.86", url, 10, hash, "a".repeat(2001)), "Oversize notes");
        yes(policy(1, id, 86, "0.86", url, 10, hash, "ok\u0000\nline").notes.equals("ok\nline"), "Control characters retained");
        byte[] one = {1, 2, 3}, two = {4, 5, 6};
        yes(AppUpdatePolicy.sameSigners(new byte[][]{one}, new byte[][]{one.clone()}), "Same signer rejected");
        yes(AppUpdatePolicy.sameSigners(new byte[][]{one,two}, new byte[][]{two,one}), "Signer order matters");
        yes(!AppUpdatePolicy.sameSigners(null, new byte[][]{one}), "Missing installed signer accepted");
        yes(!AppUpdatePolicy.sameSigners(new byte[][]{one}, new byte[][]{two}), "Wrong signer accepted");
        yes(!AppUpdatePolicy.sameSigners(new byte[][]{one,two}, new byte[][]{one,one}), "Duplicate signer accepted");
        yes(!AppUpdatePolicy.sameSigners(new byte[0][], new byte[0][]), "Empty signer set accepted");

        byte[] bytes = new byte[700123]; new java.util.Random(86).nextBytes(bytes);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        long[] observed = {0}; AtomicInteger chunks = new AtomicInteger();
        AppUpdateTransfer.copy(new ByteArrayInputStream(bytes), output, bytes.length, () -> {}, count -> {
            yes(count > observed[0] && count <= bytes.length, "Nonmonotonic/over-limit progress");
            observed[0] = count; chunks.incrementAndGet();
        });
        yes(Arrays.equals(bytes, output.toByteArray()) && observed[0] == bytes.length && chunks.get() > 1,
                "Full download/progress incorrect");
        rejects(() -> AppUpdateTransfer.copy(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(),
                bytes.length + 1, () -> {}, count -> {}), "Truncated transfer accepted");
        rejects(() -> AppUpdateTransfer.copy(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(),
                bytes.length - 1, () -> {}, count -> {}), "Oversize transfer accepted");
        ByteArrayOutputStream cancelled = new ByteArrayOutputStream();
        rejects(() -> AppUpdateTransfer.copy(new ByteArrayInputStream(bytes), cancelled, bytes.length,
                () -> { throw new IOException("Cancelled"); }, count -> {}), "Cancelled transfer continued");
        yes(cancelled.size() == 0, "Cancelled data committed");
        File file = Files.createTempFile("wz-update-086-", ".apk").toFile();
        try {
            Files.write(file.toPath(), bytes);
            String digest = AppUpdatePolicy.hex(MessageDigest.getInstance("SHA-256").digest(bytes));
            yes(AppUpdateTransfer.matches(file, bytes.length, digest, () -> {}), "Valid checksum rejected");
            yes(!AppUpdateTransfer.matches(file, bytes.length, hash, () -> {}), "Corrupt checksum accepted");
            yes(!AppUpdateTransfer.matches(file, bytes.length + 1, digest, () -> {}), "Wrong length accepted");
            rejects(() -> AppUpdateTransfer.matches(file, bytes.length, digest,
                    () -> { throw new IOException("Cancelled"); }), "Checksum cancellation ignored");
        } finally { Files.deleteIfExists(file.toPath()); }

        Font face = Font.createFont(Font.TRUETYPE_FONT, new File(args[0]));
        FontRenderContext frc = new FontRenderContext(null, true, true);
        String[] labels = {"CAMPAIGN", "TOWERS", "FFA", "MULTIPLAYER", "GUIDE", "HUB"};
        int geometries = 0;
        for (int[] size : new int[][]{{600,300},{640,320},{800,360},{1200,540}})
            for (float density : new float[]{1,2,3}) for (float scale : new float[]{1,1.3f,1.6f}) {
                int[] widths = new int[6]; int fontHeight = 0;
                for (int i=0;i<6;i++) {
                    Font f = face.deriveFont((i>=4?14:16)*density*scale);
                    widths[i]=(int)Math.ceil(f.getStringBounds(labels[i],frc).getWidth());
                    fontHeight=Math.max(fontHeight,(int)Math.ceil(f.getLineMetrics(labels[i],frc).getHeight()));
                }
                int footer = Math.max(Math.round(48*density),
                        (int)Math.ceil(face.deriveFont(12*density*scale).getLineMetrics("Check for updates",frc).getHeight())*2);
                HomeMenuLayout.Result result = HomeMenuLayout.measure(Math.round(size[0]*density),Math.round(size[1]*density),
                        density,0,0,0,0,widths,fontHeight,footer);
                int footerTop = result.footerBottom-footer;
                for (HomeMenuLayout.Box box : result.buttons) {
                    yes(box.bottom() <= footerTop, "Update footer overlaps mode navigation");
                    yes(box.top>=0 && box.bottom()<=size[1]*density, "Mode button outside viewport");
                }
                geometries++;
            }
        System.out.println("{\"passed\":true,\"assertions\":"+assertions+",\"homeScenarios\":"+geometries
                +",\"androidRuntime\":false}");
    }
}
