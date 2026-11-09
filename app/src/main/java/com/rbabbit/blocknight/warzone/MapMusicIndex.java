package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Immutable assignments and byte bounds in the existing verified optional pack. */
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

    MapMusicIndex(Context context, MusicTrackCatalog catalog) {
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
            if (assignments.size() != 46) throw new IllegalArgumentException("Incomplete map music assignments");
        } catch (Exception error) {
            throw new IllegalStateException("Map music catalog unavailable", error);
        }
    }

    Slice slice(String id) { return tracks.get(id); }
    String track(String mapId) { return assignments.get(MapLevelCatalog.normalizeId(mapId)); }

    private static String asset(Context context, String path) throws Exception {
        try (InputStream input = context.getAssets().open(path)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] block = new byte[8192]; int count;
            while ((count = input.read(block)) != -1) bytes.write(block, 0, count);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
