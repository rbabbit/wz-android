package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Immutable map assignments and byte bounds in the verified bundled soundtrack. */
final class MapMusicIndex {
    static final class Slice {
        final String id;
        final long start, length;
        Slice(String id, long start, long end) {
            this.id = id; this.start = start; this.length = end - start;
        }
    }

    private final Map<String, Slice> tracks = new HashMap<>();
    private final Map<String, String> assignments = new HashMap<>();
    private final Map<String, List<String>> playlists = new HashMap<>();
    private final MusicTrackCatalog catalog;

    MapMusicIndex(Context context, MusicTrackCatalog catalog) {
        this.catalog = catalog;
        try {
            // This generated file is one JSON literal after an assignment. Parse
            // that literal as data; no JavaScript evaluation or copied offsets.
            String script = asset(context, "warzone/music-catalog.js");
            JSONObject pack = new JSONObject(script.substring(script.indexOf('{'), script.lastIndexOf('}') + 1));
            if (pack.getLong("bytes") != MusicPackStore.BYTES
                    || !MusicPackStore.SHA256.equals(pack.getString("sha256")))
                throw new IllegalArgumentException("Music pack identity differs");
            JSONArray files = pack.getJSONArray("files");
            for (int i = 0; i < files.length(); i++) {
                JSONObject file = files.getJSONObject(i);
                String path = file.getString("filename"), prefix = "/data/music/albums/";
                if (!path.startsWith(prefix)) continue;
                String id = path.substring(prefix.length());
                if (catalog.find(id) == null) continue;
                long start = file.getLong("start"), end = file.getLong("end");
                if (start < 0 || end <= start || end > MusicPackStore.BYTES
                        || tracks.put(id, new Slice(id, start, end)) != null)
                    throw new IllegalArgumentException("Invalid music file bounds");
            }
            if (!tracks.keySet().equals(catalog.allIds()))
                throw new IllegalArgumentException("Music file inventory differs");
            JSONObject policies = pack.getJSONObject("playlists");
            for (String mode : new String[] {"ffa", "campaign"}) {
                JSONArray ids = policies.getJSONObject(mode).getJSONArray("tracks");
                List<String> selected = new ArrayList<>();
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.getString(i);
                    if (!tracks.containsKey(id) || selected.contains(id))
                        throw new IllegalArgumentException("Invalid music playlist");
                    selected.add(id);
                }
                if (selected.size() != ("campaign".equals(mode) ? 3 : 39))
                    throw new IllegalArgumentException("Incomplete music playlist");
                playlists.put(mode, selected);
            }
            JSONObject mapping = new JSONObject(asset(context, "warzone/map-music.json"));
            if (mapping.getInt("schemaVersion") != 1) throw new IllegalArgumentException("Music map schema differs");
            JSONObject maps = mapping.getJSONObject("maps");
            Iterator<String> keys = maps.keys();
            while (keys.hasNext()) {
                String id = keys.next(), track = maps.getString(id);
                if (!MapLevelCatalog.isKnownId(id) || !tracks.containsKey(track))
                    throw new IllegalArgumentException("Unknown map music assignment");
                assignments.put(id, track);
            }
            if (assignments.size() != 96) throw new IllegalArgumentException("Incomplete map music assignments");
        } catch (Exception error) {
            throw new IllegalStateException("Map music catalog unavailable", error);
        }
    }

    Slice slice(String id) { return tracks.get(id); }
    String track(String mapId) { return assignments.get(MapLevelCatalog.normalizeId(mapId)); }

    /** A playlist policy, never a fabricated mission-to-song assignment. */
    String stateJson(String mode, String mapId, String missionId, boolean cached,
            boolean enabled, boolean suspended, String origin) throws Exception {
        boolean playlist = "ffa".equals(mode) || "challenge".equals(mode) || "campaign".equals(mode);
        boolean survival = "survival".equals(mode);
        if (!playlist && !survival && !"towers".equals(mode) && !"tower-defense".equals(mode) && !"map".equals(mode))
            throw new IllegalArgumentException("Unknown music mode");
        String normalizedMap = survival ? SurvivalMapCatalog.get(mapId).id : playlist ? (mapId == null ? "" : mapId) : MapLevelCatalog.normalizeId(mapId);
        // Survival reuses the existing Iron Valley soundtrack without changing Waves assignments.
        List<String> ids = playlist ? playlists.get("challenge".equals(mode) ? "ffa" : mode) : java.util.Collections.singletonList(track(survival ? "td2" : normalizedMap));
        JSONObject value = new JSONObject();
        value.put("cached", cached);
        value.put("enabled", cached && enabled);
        value.put("suspended", suspended);
        value.put("mode", playlist ? mode : "map");
        value.put("mapId", normalizedMap);
        value.put("missionId", "campaign".equals(mode) && missionId != null ? missionId : "");
        JSONArray selections = new JSONArray();
        for (String id : ids) {
            MusicTrackCatalog.Track song = catalog.find(id);
            if (song == null) throw new IllegalStateException("Unknown music track");
            JSONObject item = new JSONObject();
            item.put("id", id); item.put("title", song.title); item.put("author", song.author);
            item.put("url", origin + "/warzone/optional/map-music/" + id);
            selections.put(item);
            if (selections.length() == 1) {
                value.put("trackId", id); value.put("title", song.title); value.put("author", song.author);
                value.put("url", item.getString("url"));
            }
        }
        if (playlist) value.put("tracks", selections);
        return value.toString();
    }

    private static String asset(Context context, String path) throws Exception {
        try (InputStream input = context.getAssets().open(path)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] block = new byte[8192]; int count;
            while ((count = input.read(block)) != -1) bytes.write(block, 0, count);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
