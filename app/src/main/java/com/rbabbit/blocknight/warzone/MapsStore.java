package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.util.Base64;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** On-demand official map catalogue and private, hash-verified map cache. */
final class MapsStore {
    static final String CATALOG_URL = "https://maps.wz2100.net/api/v1/full.json";
    private static final int MAX_CATALOG = 12 * 1024 * 1024;
    private static final int MAX_ARCHIVE = 8 * 1024 * 1024;
    private static final int MAX_EXPANDED = 24 * 1024 * 1024;
    private final File directory;

    static final class Entry {
        final String id, hash, name, author, license, tileset, downloadUrl, previewUrl, type;
        final int players, width, height, size, oilWells, scavengers;
        final JSONObject source;

        Entry(JSONObject value) throws Exception {
            source = new JSONObject(value.toString());
            JSONObject download = value.getJSONObject("download"), dimensions = value.getJSONObject("size");
            hash = download.getString("hash").toLowerCase(Locale.ROOT);
            id = "download-" + hash;
            players = value.getInt("slots"); width = dimensions.getInt("w"); height = dimensions.getInt("h");
            size = download.getInt("size"); type = download.getString("type");
            name = value.getString("name"); author = value.optString("author", "Not specified");
            license = value.optString("license", "Not specified"); tileset = value.getString("tileset");
            oilWells = value.optInt("oilWells"); scavengers = value.optInt("scavs");
            String repo = download.getString("repo"), path = download.getString("path");
            if (!hash.matches("[0-9a-f]{64}") || players < 2 || players > 10 || !repo.equals(players + "p")
                    || width < 1 || height < 1 || width > 512 || height > 512
                    || size < 1 || size > MAX_ARCHIVE || name.trim().isEmpty()
                    || !("arizona".equals(tileset) || "urban".equals(tileset) || "rockies".equals(tileset))
                    || !path.matches("v[0-9]+/[^/\\\\]+\\.wz") || path.contains(".."))
                throw new IOException("Invalid map catalogue entry");
            downloadUrl = new URI("https", "github.com", "/Warzone2100/maps-" + repo + "/releases/download/" + path, null).toASCIIString();
            previewUrl = "https://maps-assets.wz2100.net/v1/maps/" + hash + "/preview.png";
        }
        boolean supported() { return "jsonv2".equals(type) || "script".equals(type); }
    }

    MapsStore(Context context) {
        directory = new File(context.getApplicationContext().getFilesDir(), "downloaded-maps");
        directory.mkdirs();
    }

    List<Entry> cachedCatalog() {
        try { return parseCatalog(new JSONObject(new String(read(new File(directory, "catalog.json"), MAX_CATALOG), StandardCharsets.UTF_8))); }
        catch (Exception ignored) { return Collections.emptyList(); }
    }

    List<Entry> refreshCatalog() throws Exception {
        byte[] bytes = fetch(CATALOG_URL, MAX_CATALOG);
        List<Entry> result = parseCatalog(new JSONObject(new String(bytes, StandardCharsets.UTF_8)));
        write(new File(directory, "catalog.json"), bytes);
        return result;
    }

    private List<Entry> parseCatalog(JSONObject value) throws Exception {
        if (!"wz2100.mapdatabase.full.v1".equals(value.getString("type"))) throw new IOException("Unsupported map catalogue");
        JSONArray maps = value.getJSONArray("maps"); List<Entry> entries = new ArrayList<>(); Set<String> ids = new HashSet<>();
        for (int i = 0; i < maps.length(); i++) {
            Entry entry = new Entry(maps.getJSONObject(i));
            if (ids.add(entry.id)) entries.add(entry);
        }
        if (entries.isEmpty()) throw new IOException("The map catalogue is empty");
        entries.sort(Comparator.comparing((Entry e) -> e.name.toLowerCase(Locale.ROOT)).thenComparing(e -> e.hash));
        return Collections.unmodifiableList(entries);
    }

    List<Entry> installedEntries() {
        List<Entry> result = new ArrayList<>(); File[] files = directory.listFiles((dir, name) -> name.endsWith(".entry.json"));
        if (files != null) for (File file : files) {
            try {
                Entry entry = new Entry(new JSONObject(new String(read(file, 128 * 1024), StandardCharsets.UTF_8)));
                if (isInstalled(entry)) result.add(entry);
            } catch (Exception ignored) { }
        }
        result.sort(Comparator.comparing(e -> e.name.toLowerCase(Locale.ROOT)));
        return result;
    }

    List<JSONObject> installedMaps() {
        List<JSONObject> result = new ArrayList<>();
        for (Entry entry : installedEntries()) try { result.add(metadata(entry)); } catch (Exception ignored) { }
        return result;
    }

    boolean isInstalled(Entry entry) { return archive(entry.id).isFile() && new File(directory, entry.hash + ".entry.json").isFile(); }

    JSONObject install(Entry entry) throws Exception {
        if (!entry.supported()) throw new IOException("This map format is not supported by this game version");
        File archive = archive(entry.id);
        boolean retained = isInstalled(entry);
        byte[] bytes;
        if (retained) {
            try { bytes = read(archive, MAX_ARCHIVE); verify(entry, bytes); }
            catch (Exception damaged) { retained = false; bytes = fetch(entry.downloadUrl, MAX_ARCHIVE); }
        } else bytes = fetch(entry.downloadUrl, MAX_ARCHIVE);
        verify(entry, bytes); unpack(entry, bytes); // Validate before retaining or launching.
        if (!retained) write(archive, bytes);
        write(new File(directory, entry.hash + ".entry.json"), entry.source.toString().getBytes(StandardCharsets.UTF_8));
        return metadata(entry);
    }

    JSONObject installBundle(String id) throws Exception {
        if (id == null || !id.matches("download-[0-9a-f]{64}")) throw new IOException("Invalid installed map identity");
        String hash = id.substring(9);
        Entry entry = new Entry(new JSONObject(new String(read(new File(directory, hash + ".entry.json"), 128 * 1024), StandardCharsets.UTF_8)));
        byte[] bytes = read(archive(id), MAX_ARCHIVE); verify(entry, bytes);
        Map<String, byte[]> contents = unpack(entry, bytes); JSONArray files = new JSONArray();
        String root = "/data/mp/multiplay/maps/" + entry.id;
        for (Map.Entry<String, byte[]> file : contents.entrySet())
            files.put(new JSONObject().put("path", root + "/" + file.getKey()).put("data", Base64.encodeToString(file.getValue(), Base64.NO_WRAP)));
        files.put(new JSONObject().put("path", root + ".gam").put("data", Base64.encodeToString(contents.get("gam.json"), Base64.NO_WRAP)));
        String dataset = "urban".equals(entry.tileset) ? "2" : "rockies".equals(entry.tileset) ? "3" : "1";
        String lev = "\nlevel " + level(entry) + "\nplayers " + entry.players + "\ntype 14\ndataset MULTI_CAM_" + dataset
                + "\ngame \"multiplay/maps/" + entry.id + ".gam\"\n";
        return new JSONObject().put("map", metadata(entry)).put("files", files).put("lev", lev);
    }

    byte[] preview(Entry entry) throws Exception {
        File file = new File(directory, entry.hash + ".png");
        if (file.isFile()) return read(file, 2 * 1024 * 1024);
        byte[] bytes = fetch(entry.previewUrl, 2 * 1024 * 1024); write(file, bytes); return bytes;
    }

    private static JSONObject metadata(Entry e) throws Exception {
        return new JSONObject().put("id", e.id).put("name", e.name).put("level", level(e)).put("mapDirectory", e.id)
                .put("preview", e.previewUrl).put("players", e.players).put("bots", e.players - 1)
                .put("width", e.width).put("height", e.height).put("tileset", e.tileset).put("sourceSHA256", e.hash)
                .put("author", e.author).put("license", e.license).put("structureLimits", new JSONObject())
                .put("description", e.width + " × " + e.height + ". " + e.players + " players. " + e.oilWells + " oil wells. "
                        + (e.scavengers > 0 ? "Authored scavenger positions. " : "") + "By " + e.author + ". " + e.license + ".")
                .put("scavengers", e.scavengers > 0).put("downloaded", true);
    }
    private static String level(Entry e) { return "FFA-" + e.hash.substring(0, 12) + "-T1"; }
    private File archive(String id) { return new File(directory, id + ".wz"); }

    private static void verify(Entry entry, byte[] bytes) throws Exception {
        if (bytes.length != entry.size) throw new IOException("Map download was incomplete. Please retry.");
        StringBuilder hash = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) hash.append(String.format(Locale.ROOT, "%02x", b & 255));
        if (!entry.hash.equals(hash.toString())) throw new IOException("The map download did not match its published hash. Please retry.");
    }

    private static Map<String, byte[]> unpack(Entry entry, byte[] archive) throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<>(); int total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry member;
            while ((member = zip.getNextEntry()) != null) {
                String path = member.getName(); if (member.isDirectory()) continue;
                if (path.contains("/") || path.contains("\\") || path.contains("..") || path.indexOf('\0') >= 0
                        || files.containsKey(path) || files.size() >= 64) throw new IOException("Unsupported map archive layout");
                boolean data = path.matches("(level|gam|droid|struct|feature)\\.json") || path.equals("game.map")
                        || path.equals("ttypes.ttp") || path.equals("game.js");
                boolean notice = path.toLowerCase(Locale.ROOT).matches("(readme|license|copying|authors)([._-].*)?");
                if (!data && !notice) throw new IOException("This archive contains unsupported mod files");
                byte[] bytes = read(zip, MAX_EXPANDED - total); total += bytes.length;
                files.put(path, bytes);
            }
        }
        if (!files.containsKey("level.json") || !files.containsKey("gam.json") || !files.containsKey("ttypes.ttp")
                || !(files.containsKey("game.map") || files.containsKey("game.js"))) throw new IOException("The map is missing required game files");
        JSONObject level = new JSONObject(new String(files.get("level.json"), StandardCharsets.UTF_8));
        JSONObject gam = new JSONObject(new String(files.get("gam.json"), StandardCharsets.UTF_8));
        if (!"skirmish".equals(level.optString("type")) || level.getInt("players") != entry.players
                || !entry.tileset.equals(level.getString("tileset"))) throw new IOException("Map metadata does not match the catalogue");
        // Authored camera bounds may crop a border from the terrain. The map
        // header below owns its dimensions; the GAM bounds must fit within it.
        int minX = gam.getInt("ScrollMinX"), minY = gam.getInt("ScrollMinY");
        int maxX = gam.getInt("ScrollMaxX"), maxY = gam.getInt("ScrollMaxY");
        if (minX < 0 || minY < 0 || maxX <= minX || maxY <= minY
                || maxX > entry.width || maxY > entry.height) throw new IOException("The map has invalid scroll bounds");
        if (files.containsKey("game.map")) {
            byte[] map = files.get("game.map");
            if (map.length < 16 || map[0] != 'm' || map[1] != 'a' || map[2] != 'p' || map[3] != ' '
                    || littleInt(map, 8) != entry.width || littleInt(map, 12) != entry.height)
                throw new IOException("Unsupported map terrain");
        }
        return files;
    }
    private static int littleInt(byte[] b, int p) { return (b[p] & 255) | (b[p+1] & 255) << 8 | (b[p+2] & 255) << 16 | (b[p+3] & 255) << 24; }

    private static byte[] read(File file, int max) throws IOException { try (InputStream input = new FileInputStream(file)) { return read(input, max); } }
    private static byte[] read(InputStream input, int max) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] block = new byte[8192]; int count;
        while ((count = input.read(block)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new IOException("Download cancelled");
            if (output.size() + count > max) throw new IOException("Map data exceeds the supported size");
            output.write(block, 0, count);
        }
        return output.toByteArray();
    }
    private static void write(File file, byte[] bytes) throws IOException {
        File temporary = new File(file.getParentFile(), file.getName() + ".tmp");
        try {
            try (FileOutputStream output = new FileOutputStream(temporary)) { output.write(bytes); output.getFD().sync(); }
            Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } finally { if (temporary.isFile()) temporary.delete(); }
    }
    private static byte[] fetch(String supplied, int maximum) throws Exception {
        URL url = new URL(supplied);
        for (int redirects = 0; redirects < 6; redirects++) {
            String host = url.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equals(url.getProtocol()) || !(host.equals("maps.wz2100.net") || host.equals("maps-assets.wz2100.net")
                    || host.equals("github.com") || host.equals("release-assets.githubusercontent.com") || host.equals("objects.githubusercontent.com")))
                throw new IOException("Unsupported map download location");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
                connection.setConnectTimeout(15000); connection.setReadTimeout(25000); connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 Warzone2100-Android-Maps");
                connection.setRequestProperty("Accept", "application/json,image/png,application/octet-stream,*/*");
                int status = connection.getResponseCode();
                if (status >= 300 && status <= 399) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Map server returned an invalid redirect");
                    url = new URL(url, location); continue;
                }
                if (status != 200) throw new IOException("Map server returned " + status + ". Please retry.");
                if (connection.getContentLengthLong() > maximum) throw new IOException("Map download is too large");
                try (InputStream input = connection.getInputStream()) { return read(input, maximum); }
            } finally { connection.disconnect(); }
        }
        throw new IOException("Too many map download redirects");
    }
}
