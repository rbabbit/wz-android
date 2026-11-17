package com.rbabbit.blocknight.warzone;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Bounded streaming and checksum checks shared by the Android downloader and host tests. */
final class AppUpdateTransfer {
    interface Active { void check() throws IOException; }
    interface Progress { void bytes(long count); }

    static void copy(InputStream input, OutputStream output, long expected,
            Active active, Progress progress) throws IOException {
        byte[] buffer = new byte[256 * 1024];
        long total = 0; int count;
        while ((count = input.read(buffer)) != -1) {
            active.check();
            total += count;
            if (total > expected) throw new IllegalArgumentException("The update download is larger than expected.");
            output.write(buffer, 0, count);
            progress.bytes(total);
        }
        active.check();
        if (total != expected) throw new IOException("The download was interrupted. Retry when connected.");
    }

    static boolean matches(File file, long size, String sha256, Active active) throws IOException {
        if (!file.isFile() || file.length() != size) return false;
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[256 * 1024]; int count;
            while ((count = input.read(buffer)) != -1) { active.check(); digest.update(buffer, 0, count); }
        }
        active.check();
        return sha256.equals(AppUpdatePolicy.hex(digest.digest()));
    }

    private AppUpdateTransfer() { }
}
