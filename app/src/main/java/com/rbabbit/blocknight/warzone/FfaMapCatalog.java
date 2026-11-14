package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Authored FFA map identity and setup copy, separate from the Towers catalogue. */
final class FfaMapCatalog {
    static final class MapInfo {
        final String id, name, level, mapDirectory, preview, description, tileset, sourceSHA256;
        final int players, bots, width, height;

        MapInfo(JSONObject value) throws Exception {
            id = value.getString("id");
            name = value.getString("name");
            level = value.getString("level");
            mapDirectory = value.getString("mapDirectory");
            preview = value.getString("preview");
            description = value.getString("description");
            tileset = value.getString("tileset");
            sourceSHA256 = value.getString("sourceSHA256").toLowerCase(Locale.ROOT);
            players = value.getInt("players");
            bots = value.getInt("bots");
            width = value.getInt("width");
            height = value.getInt("height");
            if (!isKnownId(id) || !level.equals(nativeLevel(id)) || name.trim().isEmpty()
                    || players != playerCount(id) || bots != players - 1
                    || width < 1 || height < 1 || width > 512 || height > 512
                    || !mapDirectory.equals("ffa-" + id)
                    || !preview.equals("ffa-previews/" + id + ".png")
                    || description.trim().isEmpty() || tileset.trim().isEmpty()
                    || !sourceSHA256.matches("[0-9a-f]{64}"))
                throw new IllegalArgumentException("Invalid FFA map: " + id);
        }
    }

    private static FfaMapCatalog instance;
    private final Map<String, MapInfo> byId = new LinkedHashMap<>();
    private final List<MapInfo> maps;

    static synchronized FfaMapCatalog get(Context context) {
        if (instance == null) {
            try (InputStream input = context.getApplicationContext().getAssets().open("ffa-maps.json")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] block = new byte[8192];
                int count;
                while ((count = input.read(block)) != -1) bytes.write(block, 0, count);
                instance = new FfaMapCatalog(new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8)));
            } catch (Exception error) {
                throw new IllegalStateException("FFA map catalogue unavailable", error);
            }
        }
        return instance;
    }

    /** Package-visible parser also permits checks against the real bundled catalogue. */
    FfaMapCatalog(JSONObject value) throws Exception {
        if (value.getInt("version") != 1) throw new IllegalArgumentException("Unsupported FFA map catalogue");
        JSONArray entries = value.getJSONArray("maps");
        for (int i = 0; i < entries.length(); i++) {
            MapInfo map = new MapInfo(entries.getJSONObject(i));
            if (byId.put(map.id, map) != null) throw new IllegalArgumentException("Duplicate FFA map: " + map.id);
        }
        if (byId.size() != 51) throw new IllegalArgumentException("Incomplete FFA map catalogue");
        maps = Collections.unmodifiableList(new ArrayList<>(byId.values()));
    }

    List<MapInfo> maps() { return maps; }

    /** Unknown identities stay unknown; save/launch callers must not silently relabel them. */
    MapInfo map(String id) { return byId.get(id); }

    static boolean isKnownId(String id) { return nativeLevel(id) != null; }

    static int playerCount(String id) {
        int generated = generatedPlayerCount(id);
        return generated != 0 ? generated : !isKnownId(id) ? 0 : "emaj-6p".equals(id) ? 6 : 4;
    }

    private static int generatedPlayerCount(String id) {
        return id != null && id.matches("ntw-[234]p-(0[1-9]|1[0-5])") ? id.charAt(4) - '0' : 0;
    }

    /** UI preference fallback only. Validate saved/explicit identities with isKnownId first. */
    static String normalizeId(String id) { return isKnownId(id) ? id : "emag"; }

    static String nativeLevel(String id) {
        if (id == null) return null;
        switch (id) {
            case "emag": return "FFA-EMAG-T1";
            case "contact": return "FFA-CONTACT-T1";
            case "templar-ffa": return "FFA-TEMPLAR-T1";
            case "rb-simple": return "FFA-RBSIMPLE-T1";
            case "rb-usefull": return "FFA-RBUSEFULL-T1";
            case "emaj-6p": return "FFA-EMAJ6-T1";
            default:
                int players = generatedPlayerCount(id);
                return players == 0 ? null : "FFA-NTW" + players + "-" + id.substring(7) + "-T1";
        }
    }
}
