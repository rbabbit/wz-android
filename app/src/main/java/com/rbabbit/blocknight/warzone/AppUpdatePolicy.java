package com.rbabbit.blocknight.warzone;

import java.net.URI;
import java.util.Arrays;
import java.util.Locale;

/** Strict download contract. APK contents and signers are checked separately by Android. */
final class AppUpdatePolicy {
    static final String FEED_URL = "https://wz2100.uk/downloads/warzone/latest.json";
    static final String APK_URL = "https://wz2100.uk/downloads/warzone/warzone2100-andriod.apk";
    static final String APK_NAME = "warzone2100-andriod.apk";
    static final String APP_ID = "com.rbabbit.warzonetowers.lab";
    static final long MAX_APK_BYTES = 2L * 1024 * 1024 * 1024;
    final long versionCode, sizeBytes;
    final String versionName, apkUrl, sha256, notes;

    AppUpdatePolicy(int schemaVersion, String appId, long versionCode, String versionName,
            String apkUrl, long sizeBytes, String sha256, String notes) {
        if (schemaVersion != 1 || !APP_ID.equals(appId) || versionCode < 1
                || versionCode > 2100000000L || versionName == null
                || !versionName.matches("[A-Za-z0-9][A-Za-z0-9._+\\-]{0,47}")
                || sizeBytes < 1 || sizeBytes > MAX_APK_BYTES || sha256 == null
                || !sha256.matches("[a-fA-F0-9]{64}") || !APK_URL.equals(apkUrl)) {
            throw new IllegalArgumentException("The update information is invalid.");
        }
        URI uri = URI.create(apkUrl);
        if (!"https".equals(uri.getScheme()) || !"wz2100.uk".equals(uri.getHost())
                || uri.getPort() != -1 || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("The update download address is invalid.");
        }
        this.versionCode = versionCode;
        this.versionName = versionName;
        this.apkUrl = apkUrl;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256.toLowerCase(Locale.ROOT);
        this.notes = notes == null ? "" : notes.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim();
        if (this.notes.length() > 2000) throw new IllegalArgumentException("The update notes are too long.");
    }

    boolean newerThan(long installedVersion) { return versionCode > installedVersion; }

    static boolean sameSigners(byte[][] installed, byte[][] candidate) {
        if (installed == null || candidate == null || installed.length == 0
                || installed.length != candidate.length) return false;
        boolean[] matched = new boolean[candidate.length];
        for (byte[] signer : installed) {
            boolean found = false;
            if (signer == null || signer.length == 0) return false;
            for (int i = 0; i < candidate.length; i++) {
                if (!matched[i] && Arrays.equals(signer, candidate[i])) {
                    matched[i] = true; found = true; break;
                }
            }
            if (!found) return false;
        }
        return true;
    }

    static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) value.append(String.format(Locale.ROOT, "%02x", b & 255));
        return value.toString();
    }
}
