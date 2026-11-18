package com.rbabbit.blocknight.warzone;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.json.JSONObject;

/** The two supplied Survival maps have identities separate from Waves and FFA. */
final class SurvivalMapCatalog {
    private static final List<MapLevelCatalog.Level> LEVELS = Collections.unmodifiableList(Arrays.asList(
        level("tdn2", "TDN2", "Survival-TDN2-T1"),
        level("wave", "Wave", "Survival-Wave-T1")));

    static boolean isKnownId(String id) { return "tdn2".equals(id) || "wave".equals(id); }
    static String normalizeId(String id) { return isKnownId(id) ? id : "tdn2"; }
    static List<MapLevelCatalog.Level> levels() { return LEVELS; }
    static MapLevelCatalog.Level get(String id) {
        for (MapLevelCatalog.Level level : LEVELS) if (level.id.equals(id)) return level;
        throw new IllegalArgumentException("Unknown Survival map.");
    }
    private static MapLevelCatalog.Level level(String id, String name, String nativeLevel) {
        try {
            return new MapLevelCatalog.Level(new JSONObject().put("id", id).put("name", name)
                .put("difficulty", "hard").put("rounds", 60).put("preparationSeconds", 240)
                .put("description", "Protect your command centre through 60 waves. Earn Power from destroyed attackers and rebuild between attacks.")
                .put("mapName", nativeLevel).put("nativeFolder", "survival-" + id)
                .put("tileset", "arizona").put("preview", "warzone/survival/previews/" + id + ".png")
                .put("humanPosition", 0).put("northFacing", true).put("legacy", false), true);
        } catch (Exception error) { throw new IllegalStateException("Survival map catalog unavailable", error); }
    }
    private SurvivalMapCatalog() { }
}
