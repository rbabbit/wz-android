package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.json.JSONObject;

/** Explicit single-player snapshots. No account credentials or device settings enter this archive. */
final class PlayGamesBackupStore {
    private static final int CLOUD_LIMIT = 3 * 1024 * 1024;
    private static final int EXPANDED_LIMIT = 64 * 1024 * 1024;
    private static final int ENTRY_LIMIT = 34 * 1024 * 1024, ENTRY_COUNT = 512;
    private static final String FORMAT = "warzone-single-player-backup", WALLET = "prefs/towers_rewards.json";
    private static final String BLUEPRINTS = "prefs/tank_blueprints.json";
    private static final int BLUEPRINT_BYTES = BlueprintStore.MAX_DOCUMENT * 3;
    private static final List<String> MODES = Arrays.asList("towers", "campaign", "ffa", "survival", "challenge");
    private final Context context;
    private final File root, backups, journal;
    private final SharedPreferences rewards;
    private final BlueprintStore blueprints;

    PlayGamesBackupStore(Context context) {
        this.context = context.getApplicationContext();
        root = this.context.getFilesDir();
        backups = new File(root, "play-games-backups");
        journal = new File(backups, "restore-pending.json");
        rewards = this.context.getSharedPreferences("towers_rewards", Context.MODE_PRIVATE);
        blueprints = new BlueprintStore(this.context);
    }

    synchronized byte[] exportBackup() throws Exception {
        recoverPendingRestore();
        Map<String, byte[]> entries = collect();
        File stage = stage(entries);
        try { validate(entries, stage); return encode(entries, true); }
        finally { discardStage(stage); }
    }

    /** Call only after the user confirms replacement while no battle is running. */
    synchronized void importBackup(byte[] archive) throws Exception {
        importBackup(archive, () -> true);
    }

    synchronized void importBackup(byte[] archive, java.util.function.BooleanSupplier stillAllowed) throws Exception {
        requireAllowed(stillAllowed);
        recoverPendingRestore();
        Map<String, byte[]> incoming = decode(archive, true);
        File stage = stage(incoming, stillAllowed), previousStage = null;
        try {
            validate(incoming, stage, stillAllowed);
            requireAllowed(stillAllowed);
            Map<String, byte[]> previous = collect();
            previousStage = stage(previous, stillAllowed);
            File retained = new File(backups, "before-restore-" + System.currentTimeMillis() + "-" + UUID.randomUUID() + ".zip");
            write(retained, encode(previous, false));
            requireAllowed(stillAllowed);
            File pending = new File(backups, "restore-pending.tmp");
            write(pending, new JSONObject().put("backup", retained.getName()).toString().getBytes(StandardCharsets.UTF_8));
            move(pending, journal);
            try {
                requireAllowed(stillAllowed);
                apply(incoming, stage, stillAllowed);
                requireAllowed(stillAllowed);
                Files.delete(journal.toPath());
            } catch (Exception error) {
                try { apply(previous, previousStage); Files.deleteIfExists(journal.toPath()); }
                catch (Exception rollback) { error.addSuppressed(rollback); }
                throw new IOException("Cloud restore failed. The original device backup is retained for recovery.", error);
            }
        } finally { discardStage(stage); if (previousStage != null) discardStage(previousStage); }
    }

    synchronized String describeBackup(byte[] archive) throws Exception {
        Map<String, byte[]> entries = decode(archive, true);
        int saves = 0, maps = 0;
        for (String path : entries.keySet()) {
            if (path.contains("-saved-games/")) saves++;
            if (path.endsWith(".entry.json")) maps++;
        }
        byte[] designs = entries.get(BLUEPRINTS);
        String library = designs == null ? "" :
            " · " + BlueprintStore.parse(new String(designs, StandardCharsets.UTF_8)).length() + " blueprints";
        return saves + " saved games · " + maps + " downloaded maps" + library + " · Crystals and progress";
    }

    /** Recover an interrupted replacement before the caller opens a battle or reads the wallet. */
    synchronized void recoverPendingRestore() throws Exception {
        ensureBackups();
        if (!Files.exists(journal.toPath(), LinkOption.NOFOLLOW_LINKS)) return;
        requireRegular(journal);
        JSONObject pending = new JSONObject(new String(read(journal, 4096), StandardCharsets.UTF_8));
        String name = pending.getString("backup");
        if (!name.matches("before-restore-[0-9]+-[a-f0-9-]{36}\\.zip")) throw new IOException("Invalid local restore recovery record.");
        File retained = new File(backups, name);
        Map<String, byte[]> previous = decode(read(retained, EXPANDED_LIMIT + 1024 * 1024), false);
        File stage = stage(previous);
        try { apply(previous, stage); Files.delete(journal.toPath()); }
        finally { discardStage(stage); }
    }

    private Map<String, byte[]> collect() throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        long size = 0;
        for (String name : ownedFiles()) {
            File file = target(name);
            if (file.length() > EXPANDED_LIMIT - size) throw tooLarge();
            byte[] data = read(file, (int)Math.min(ENTRY_LIMIT, EXPANDED_LIMIT - size));
            size += data.length; entries.put("files/" + name, data);
        }
        JSONObject wallet = new JSONObject().put("ledger_v1", rewards.contains("ledger_v1") ? rewards.getString("ledger_v1", null) : JSONObject.NULL);
        entries.put(WALLET, wallet.toString().getBytes(StandardCharsets.UTF_8));
        entries.put(BLUEPRINTS, blueprints.load().getBytes(StandardCharsets.UTF_8));
        checkBounds(entries);
        return entries;
    }

    private List<String> ownedFiles() throws Exception {
        List<String> names = new ArrayList<>();
        for (String mode : MODES) {
            File folder = target(mode + "-saved-games");
            if (!Files.exists(folder.toPath(), LinkOption.NOFOLLOW_LINKS)) continue;
            requireDirectory(folder);
            File[] files = folder.listFiles();
            if (files == null) throw new IOException("Local saved games could not be read.");
            for (File file : files) if (file.getName().matches("wt_[a-f0-9]{32}\\.zip")) {
                requireRegular(file); names.add(mode + "-saved-games/" + file.getName());
            }
        }
        File maps = target("downloaded-maps");
        if (Files.exists(maps.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            requireDirectory(maps);
            File[] files = maps.listFiles();
            if (files == null) throw new IOException("Installed maps could not be read.");
            for (File file : files) if (file.getName().matches("(?:download-[a-f0-9]{64}\\.wz|[a-f0-9]{64}\\.entry\\.json)")) {
                requireRegular(file); names.add("downloaded-maps/" + file.getName());
            }
        }
        Collections.sort(names);
        if (names.size() >= ENTRY_COUNT) throw new IOException("The local backup contains too many saved files.");
        return names;
    }

    private void validate(Map<String, byte[]> entries, File stage) throws Exception {
        validate(entries, stage, () -> true);
    }

    private void validate(Map<String, byte[]> entries, File stage, java.util.function.BooleanSupplier stillAllowed) throws Exception {
        requireAllowed(stillAllowed);
        JSONObject wallet = new JSONObject(new String(entries.get(WALLET), StandardCharsets.UTF_8));
        if (wallet.length() != 1 || !wallet.has("ledger_v1")) throw new IOException("The backup wallet is incomplete.");
        if (!wallet.isNull("ledger_v1")) RewardStore.validateBackup(wallet.getString("ledger_v1"));
        if (entries.containsKey(BLUEPRINTS))
            BlueprintStore.parse(new String(entries.get(BLUEPRINTS), StandardCharsets.UTF_8));
        Context staged = new ContextWrapper(context) {
            @Override public File getFilesDir() { return stage; }
            @Override public Context getApplicationContext() { return this; }
        };
        MapsStore maps = new MapsStore(staged);
        for (String path : entries.keySet()) if (path.startsWith("files/downloaded-maps/")) {
            requireAllowed(stillAllowed);
            String name = path.substring("files/downloaded-maps/".length());
            String hash = name.endsWith(".entry.json") ? name.substring(0, 64) : name.substring(9, 73);
            if (!entries.containsKey("files/downloaded-maps/" + hash + ".entry.json")
                    || !entries.containsKey("files/downloaded-maps/download-" + hash + ".wz"))
                throw new IOException("A downloaded map is missing its installation files. The local game has not been changed.");
            if (name.endsWith(".entry.json")) FfaMapCatalog.registerDownloaded(maps.installBundle("download-" + hash).getJSONObject("map"));
        }
        for (String path : entries.keySet()) for (String mode : MODES) {
            String prefix = "files/" + mode + "-saved-games/";
            if (!path.startsWith(prefix)) continue;
            requireAllowed(stillAllowed);
            String id = path.substring(prefix.length(), path.length() - 4);
            if ("ffa".equals(mode)) try (ZipFile zip = new ZipFile(new File(stage, path.substring(6)))) {
                ZipEntry member = zip.getEntry("metadata.json");
                if (member == null) throw new IOException("A saved map has no identity.");
                JSONObject meta;
                try (InputStream input = zip.getInputStream(member)) { meta = new JSONObject(new String(read(input, 65536), StandardCharsets.UTF_8)); }
                String mapId = meta.getString("mapId");
                if (FfaMapCatalog.isDownloaded(mapId) && !entries.containsKey("files/downloaded-maps/" + mapId + ".wz"))
                    throw new IOException("A saved game needs a downloaded map missing from this backup. The local game has not been changed.");
            }
            new SaveGameStore(staged, mode).load(id);
        }
        requireAllowed(stillAllowed);
    }

    private byte[] encode(Map<String, byte[]> entries, boolean cloud) throws Exception {
        checkBounds(entries);
        JSONObject files = new JSONObject();
        for (Map.Entry<String, byte[]> entry : entries.entrySet()) files.put(entry.getKey(), new JSONObject().put("bytes", entry.getValue().length).put("sha256", hash(entry.getValue())));
        JSONObject manifest = new JSONObject().put("format", FORMAT).put("schema", 1).put("appId", context.getPackageName())
                .put("appVersion", BuildConfig.VERSION_CODE).put("createdAt", System.currentTimeMillis()).put("files", files);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            put(zip, "manifest.json", manifest.toString().getBytes(StandardCharsets.UTF_8));
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                put(zip, entry.getKey(), entry.getValue());
                if (cloud && output.size() > CLOUD_LIMIT) throw tooLarge();
            }
        }
        if (cloud && output.size() > CLOUD_LIMIT) throw tooLarge();
        return output.toByteArray();
    }

    private Map<String, byte[]> decode(byte[] archive, boolean cloud) throws Exception {
        if (archive == null || archive.length == 0 || archive.length > (cloud ? CLOUD_LIMIT : EXPANDED_LIMIT + 1024 * 1024)) throw tooLarge();
        Map<String, byte[]> entries = new LinkedHashMap<>();
        long expanded = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory() || !("manifest.json".equals(name) || allowed(name)) || entries.containsKey(name) || entries.size() > ENTRY_COUNT)
                    throw new IOException("The cloud backup contains unsupported or repeated files.");
                int limit = "manifest.json".equals(name) ? 256 * 1024 : BLUEPRINTS.equals(name) ? BLUEPRINT_BYTES : ENTRY_LIMIT;
                int available = (int)Math.min(limit, EXPANDED_LIMIT + 256 * 1024L - expanded);
                byte[] data = read(zip, available);
                expanded += data.length;
                if (expanded > EXPANDED_LIMIT + 256 * 1024) throw tooLarge();
                entries.put(name, data);
            }
        }
        byte[] rawManifest = entries.remove("manifest.json");
        if (rawManifest == null) throw new IOException("The cloud backup manifest is missing.");
        JSONObject manifest = new JSONObject(new String(rawManifest, StandardCharsets.UTF_8));
        if (!FORMAT.equals(manifest.optString("format")) || manifest.optInt("schema") != 1
                || !context.getPackageName().equals(manifest.optString("appId")) || manifest.optLong("createdAt", -1) < 0)
            throw new IOException("This backup belongs to a different app or unsupported version.");
        JSONObject files = manifest.getJSONObject("files");
        if (files.length() != entries.size()) throw new IOException("The backup file manifest is incomplete.");
        for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
            JSONObject record = files.getJSONObject(entry.getKey());
            if (record.getLong("bytes") != entry.getValue().length || !hash(entry.getValue()).equals(record.getString("sha256")))
                throw new IOException("The cloud backup checksum does not match its files.");
        }
        checkBounds(entries);
        return entries;
    }

    private void apply(Map<String, byte[]> entries, File stage) throws Exception {
        apply(entries, stage, () -> true);
    }

    private void apply(Map<String, byte[]> entries, File stage, java.util.function.BooleanSupplier stillAllowed) throws Exception {
        requireAllowed(stillAllowed);
        Set<String> incoming = new HashSet<>();
        for (String name : entries.keySet()) if (name.startsWith("files/")) {
            requireAllowed(stillAllowed);
            String relative = name.substring(6); incoming.add(relative);
            File destination = target(relative), source = new File(stage, relative);
            File parent = destination.getParentFile();
            if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Restored game storage is unavailable.");
            target(relative);
            File temporary = new File(parent, destination.getName() + ".playrestore");
            if (Files.isSymbolicLink(temporary.toPath())) throw new IOException("Unsafe restored game path.");
            try {
                Files.copy(source.toPath(), temporary.toPath(), StandardCopyOption.REPLACE_EXISTING);
                requireAllowed(stillAllowed); move(temporary, destination);
            }
            finally { Files.deleteIfExists(temporary.toPath()); }
        }
        for (String name : ownedFiles()) if (!incoming.contains(name)) {
            requireAllowed(stillAllowed); Files.delete(target(name).toPath());
        }
        JSONObject wallet = new JSONObject(new String(entries.get(WALLET), StandardCharsets.UTF_8));
        SharedPreferences.Editor editor = rewards.edit();
        if (wallet.isNull("ledger_v1")) editor.remove("ledger_v1"); else editor.putString("ledger_v1", wallet.getString("ledger_v1"));
        requireAllowed(stillAllowed);
        if (!editor.commit()) throw new IOException("The restored wallet could not be saved.");
        requireAllowed(stillAllowed);
        // Archives made before blueprint backup leave the local library intact.
        if (entries.containsKey(BLUEPRINTS))
            blueprints.restore(new String(entries.get(BLUEPRINTS), StandardCharsets.UTF_8));
        requireAllowed(stillAllowed);
    }

    private File stage(Map<String, byte[]> entries) throws Exception {
        return stage(entries, () -> true);
    }

    private File stage(Map<String, byte[]> entries, java.util.function.BooleanSupplier stillAllowed) throws Exception {
        requireAllowed(stillAllowed);
        ensureBackups();
        File directory = Files.createTempDirectory(backups.toPath(), "stage-").toFile();
        try {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) if (entry.getKey().startsWith("files/")) {
                requireAllowed(stillAllowed);
                write(new File(directory, entry.getKey().substring(6)), entry.getValue());
            }
            requireAllowed(stillAllowed);
            return directory;
        } catch (Exception error) { discardStage(directory); throw error; }
    }

    private void ensureBackups() throws Exception {
        target("play-games-backups");
        if (!backups.isDirectory() && !backups.mkdirs()) throw new IOException("Local backup storage is unavailable.");
        requireDirectory(backups);
    }

    private File target(String relative) throws Exception {
        File file = new File(root, relative);
        File canonicalRoot = root.getCanonicalFile();
        if (!file.getCanonicalPath().startsWith(canonicalRoot.getPath() + File.separator)) throw new IOException("Unsafe backup path.");
        for (File part = file; part != null && !part.equals(root); part = part.getParentFile())
            if (Files.isSymbolicLink(part.toPath())) throw new IOException("Linked files are not supported in game backups.");
        return file;
    }

    private void discardStage(File directory) {
        try {
            if (!directory.getCanonicalPath().startsWith(backups.getCanonicalPath() + File.separator)
                    || !directory.getName().startsWith("stage-")) return;
            discardContents(directory);
        } catch (Exception ignored) { /* A leftover private stage must not turn a completed restore into an apparent failure. */ }
    }

    private static void discardContents(File file) throws Exception {
        if (Files.isDirectory(file.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            File[] children = file.listFiles();
            if (children == null) throw new IOException("Temporary backup could not be removed.");
            for (File child : children) discardContents(child);
        }
        Files.deleteIfExists(file.toPath());
    }

    private static boolean allowed(String name) {
        if (WALLET.equals(name) || BLUEPRINTS.equals(name)) return true;
        for (String mode : MODES) if (name.matches("files/" + mode + "-saved-games/wt_[a-f0-9]{32}\\.zip")) return true;
        return name.matches("files/downloaded-maps/(?:download-[a-f0-9]{64}\\.wz|[a-f0-9]{64}\\.entry\\.json)");
    }

    private static void checkBounds(Map<String, byte[]> entries) throws Exception {
        if (!entries.containsKey(WALLET) || entries.size() > ENTRY_COUNT) throw new IOException("The backup is incomplete or contains too many files.");
        long size = 0;
        for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
            int limit = BLUEPRINTS.equals(entry.getKey()) ? BLUEPRINT_BYTES : ENTRY_LIMIT;
            if (!allowed(entry.getKey()) || entry.getValue().length > limit) throw new IOException("Unsupported backup file.");
            size += entry.getValue().length;
        }
        if (size > EXPANDED_LIMIT) throw tooLarge();
    }

    private static void requireRegular(File file) throws Exception {
        if (!Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("A backup file is missing or linked.");
    }
    private static void requireDirectory(File file) throws Exception {
        if (!Files.isDirectory(file.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("A backup folder is missing or linked.");
    }
    private static byte[] read(File file, int limit) throws Exception {
        requireRegular(file);
        if (file.length() > limit) throw tooLarge();
        try (InputStream input = Files.newInputStream(file.toPath())) { return read(input, limit); }
    }
    private static byte[] read(InputStream input, int limit) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) {
            if (count > limit - output.size()) throw tooLarge();
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
    private static void write(File file, byte[] data) throws Exception {
        File parent = file.getParentFile();
        if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Backup storage is unavailable.");
        if (Files.isSymbolicLink(file.toPath()) || Files.isSymbolicLink(parent.toPath())) throw new IOException("Unsafe backup storage path.");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(data); output.getFD().sync(); }
    }
    private static void move(File source, File destination) throws Exception {
        try { Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException ignored) { Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING); }
    }
    private static void put(ZipOutputStream zip, String name, byte[] data) throws Exception {
        zip.putNextEntry(new ZipEntry(name)); zip.write(data); zip.closeEntry();
    }
    private static String hash(byte[] data) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(data)) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
    private static IOException tooLarge() {
        return new IOException("The local backup is too large for Google Play Games (3 MB maximum). All local saves and Crystals have been kept.");
    }

    private static void requireAllowed(java.util.function.BooleanSupplier stillAllowed) throws IOException {
        if (stillAllowed == null || !stillAllowed.getAsBoolean()) throw new IOException("Cloud restore was cancelled.");
    }
}
