package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared native launch metadata; the map bytes and previews are authored in the assets catalog. */
final class MapLevelCatalog {
    static final class Level {
        final String id, name, difficulty, description, mapName, nativeFolder, tileset, preview;
        final int rounds, preparationSeconds, humanPosition, entryCount;
        final boolean northFacing, legacy;

        Level(JSONObject value) throws Exception { this(value, false); }

        Level(JSONObject value, boolean survival) throws Exception {
            id = value.getString("id");
            name = value.getString("name");
            difficulty = value.getString("difficulty");
            description = value.getString("description");
            rounds = value.getInt("rounds");
            preparationSeconds = value.getInt("preparationSeconds");
            mapName = value.getString("mapName");
            nativeFolder = value.getString("nativeFolder");
            tileset = value.getString("tileset");
            preview = value.getString("preview");
            humanPosition = value.getInt("humanPosition");
            northFacing = value.getBoolean("northFacing");
            legacy = value.getBoolean("legacy");
            entryCount = value.optInt("entryCount", 0);
            if (!(survival ? SurvivalMapCatalog.isKnownId(id) : isKnownId(id)) || !("easy".equals(difficulty) || "medium".equals(difficulty)
                    || "hard".equals(difficulty)) || rounds < 1 || humanPosition < 0
                    || humanPosition > 7) throw new IllegalArgumentException("Invalid map: " + id);
        }
    }

    private static MapLevelCatalog instance;
    private final Map<String, Level> byId = new LinkedHashMap<>();
    private final List<Level> levels;

    static synchronized MapLevelCatalog get(Context context) {
        if (instance == null) instance = new MapLevelCatalog(context.getApplicationContext());
        return instance;
    }

    private MapLevelCatalog(Context context) {
        try (InputStream input = context.getAssets().open("warzone/levels/catalog.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] block = new byte[8192];
            int count;
            while ((count = input.read(block)) != -1) bytes.write(block, 0, count);
            JSONObject catalog = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            if (catalog.getInt("schemaVersion") != 1)
                throw new IllegalArgumentException("Unsupported map catalog schema");
            JSONArray items = catalog.getJSONArray("levels");
            for (int i = 0; i < items.length(); i++) {
                Level level = new Level(items.getJSONObject(i));
                if (byId.put(level.id, level) != null)
                    throw new IllegalArgumentException("Duplicate map: " + level.id);
            }
            if (byId.size() != 96 || !byId.containsKey("td1") || !byId.containsKey("td2")
                    || !byId.containsKey("beginner"))
                throw new IllegalArgumentException("Incomplete map catalog");
            levels = Collections.unmodifiableList(new ArrayList<>(byId.values()));
        } catch (Exception error) {
            throw new IllegalStateException("Map catalog unavailable", error);
        }
    }

    Level level(String id) { return byId.get(normalizeId(id)); }

    List<Level> difficulty(String difficulty) {
        List<Level> result = new ArrayList<>();
        for (Level level : levels) if (level.difficulty.equals(difficulty)) result.add(level);
        return Collections.unmodifiableList(result);
    }

    /** Closed whitelist also works before an Activity or Context exists. */
    static String normalizeId(String value) { return isKnownId(value) ? value : "td2"; }

    static boolean isKnownId(String value) {
        if ("td1".equals(value) || "td2".equals(value) || "beginner".equals(value)) return true;
        if (value == null) return false;
        if (numbered(value, "simplee", 17) || numbered(value, "simplem", 17)
                || numbered(value, "simpleh", 16)) return true;
        for (String difficulty : new String[] {"easy", "medium", "hard"}) {
            int total = "hard".equals(difficulty) ? 13 : 15;
            if (numbered(value, difficulty, total)) return true;
        }
        return false;
    }

    private static boolean numbered(String value, String prefix, int total) {
        if (!value.startsWith(prefix) || value.length() != prefix.length() + 2) return false;
        char tens = value.charAt(prefix.length()), units = value.charAt(prefix.length() + 1);
        if (tens < '0' || tens > '9' || units < '0' || units > '9') return false;
        int number = (tens - '0') * 10 + units - '0';
        return number >= 1 && number <= total;
    }
}
