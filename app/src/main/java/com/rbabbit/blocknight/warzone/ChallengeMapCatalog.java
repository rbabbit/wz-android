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

/** Authored Challenge map identity and setup copy, separate from the Towers catalogue. */
final class ChallengeMapCatalog {
    static final class MapInfo {
        final String id, name, level, mapDirectory, preview, description, tileset, sourceSHA256;
        final int players, bots, width, height;
        final boolean scavengers;

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
            scavengers = value.getBoolean("scavengers");
            bots = value.getInt("bots");
            width = value.getInt("width");
            height = value.getInt("height");
            if (!isKnownId(id) || !level.equals(nativeLevel(id)) || name.trim().isEmpty()
                    || players != 2 || bots != 1
                    || width < 1 || height < 1 || width > 512 || height > 512
                    || !mapDirectory.equals("challenge-" + id)
                    || !preview.equals("challenge-previews/" + id + ".png")
                    || description.trim().isEmpty() || tileset.trim().isEmpty()
                    || !sourceSHA256.matches("[0-9a-f]{64}"))
                throw new IllegalArgumentException("Invalid Challenge map: " + id);
        }
    }

    private static ChallengeMapCatalog instance;
    private final Map<String, MapInfo> byId = new LinkedHashMap<>();
    private final List<MapInfo> maps;

    static synchronized ChallengeMapCatalog get(Context context) {
        if (instance == null) {
            try (InputStream input = context.getApplicationContext().getAssets().open("challenge-maps.json")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] block = new byte[8192];
                int count;
                while ((count = input.read(block)) != -1) bytes.write(block, 0, count);
                instance = new ChallengeMapCatalog(new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8)));
            } catch (Exception error) {
                throw new IllegalStateException("Challenge map catalogue unavailable", error);
            }
        }
        return instance;
    }

    /** Package-visible parser also permits checks against the real bundled catalogue. */
    ChallengeMapCatalog(JSONObject value) throws Exception {
        if (value.getInt("version") != 1) throw new IllegalArgumentException("Unsupported Challenge map catalogue");
        JSONArray entries = value.getJSONArray("maps");
        for (int i = 0; i < entries.length(); i++) {
            MapInfo map = new MapInfo(entries.getJSONObject(i));
            if (byId.put(map.id, map) != null) throw new IllegalArgumentException("Duplicate Challenge map: " + map.id);
        }
        if (byId.size() != 10) throw new IllegalArgumentException("Incomplete Challenge map catalogue");
        maps = Collections.unmodifiableList(new ArrayList<>(byId.values()));
    }

    List<MapInfo> maps() { return maps; }

    /** Unknown identities stay unknown; save/launch callers must not silently relabel them. */
    MapInfo map(String id) { return byId.get(id); }

    static boolean isKnownId(String id) { return nativeLevel(id) != null; }

    static int playerCount(String id) { return isKnownId(id) ? 2 : 0; }
    static String normalizeId(String id) { return isKnownId(id) ? id : "firefight"; }
    static String nativeLevel(String id) {
        if (id == null) return null;
        switch (id) {
            case "firefight": return "FFA-CHFFIGHT-T1";
            case "towers2": return "FFA-CHTOWERS-T1";
            case "hells-pass": return "FFA-CHHELLS-T1";
            case "fort-scav": return "FFA-CHFORTSCAV-T1";
            case "dramatic-scavs": return "FFA-CHDRAMATIC-T1";
            case "earthsea": return "FFA-CHEARTHSEA-T1";
            case "cross-flair": return "FFA-CHCROSS-T1";
            case "no-hill": return "FFA-CHNOHILL-T1";
            case "face-to-face": return "FFA-CHFACE-T1";
            case "startup2": return "FFA-CHSTARTUP-T1";
            default: return null;
        }
    }
}
