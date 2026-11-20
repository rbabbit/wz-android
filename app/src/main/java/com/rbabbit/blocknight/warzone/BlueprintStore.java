package com.rbabbit.blocknight.warzone;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Device-wide blueprint library shared by both battle activities. */
final class BlueprintStore {
    static final int MAX_DESIGNS = 200;
    static final int MAX_DOCUMENT = 512 * 1024;
    private static final String KEY = "saved_designs_v1";
    private static final String IMPORTED = "saved_designs_web_imported";
    private static final String EMPTY = "{\"version\":1,\"designs\":[]}";
    private static final Object LOCK = new Object();
    private final SharedPreferences preferences;

    BlueprintStore(Context context) {
        // Match MainActivity.getPreferences() so existing Android designs
        // remain the canonical library and never need to be copied.
        String name = new ComponentName(context, MainActivity.class).getShortClassName();
        if (name.startsWith(".")) name = name.substring(1);
        preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE);
    }

    String load() {
        return preferences.getString(KEY, EMPTY);
    }

    boolean importedLegacy() {
        return preferences.getBoolean(IMPORTED, false);
    }

    boolean importLegacy(String legacy) {
        synchronized (LOCK) {
            if (importedLegacy()) return true;
            try {
                JSONArray incoming = parse(legacy == null || legacy.isEmpty() ? EMPTY : legacy);
                JSONArray current = parse(load());
                Map<String, JSONObject> byId = new HashMap<>();
                for (int i = 0; i < current.length(); i++) {
                    JSONObject design = current.getJSONObject(i);
                    byId.put(design.getString("id"), design);
                }
                for (int i = 0; i < incoming.length(); i++) {
                    JSONObject design = incoming.getJSONObject(i);
                    JSONObject existing = byId.get(design.getString("id"));
                    if (existing != null) {
                        if (existing.toString().equals(design.toString())) continue;
                        design.put("id", "design-" + UUID.randomUUID());
                    }
                    current.put(design);
                    byId.put(design.getString("id"), design);
                }
                // Commit the merged library and migration flag together. The
                // legacy copy stays untouched and cannot resurrect deletions.
                return preferences.edit().putString(KEY, encode(current)).putBoolean(IMPORTED, true).commit();
            } catch (JSONException invalid) {
                return false;
            }
        }
    }

    String write(String json) {
        synchronized (LOCK) {
            try {
                if (json == null || json.length() > MAX_DOCUMENT) return null;
                JSONObject design = new JSONObject(json);
                validateDesign(design);
                JSONArray current = parse(load());
                int index = indexOf(current, design.getString("id"));
                current.put(index < 0 ? current.length() : index, design);
                return commit(current);
            } catch (JSONException invalid) {
                return null;
            }
        }
    }

    String delete(String id) {
        synchronized (LOCK) {
            try {
                JSONArray current = parse(load());
                int index = indexOf(current, id);
                if (index < 0) return load();
                current.remove(index);
                return commit(current);
            } catch (JSONException invalid) {
                return null;
            }
        }
    }

    void restore(String document) throws JSONException, IOException {
        synchronized (LOCK) {
            if (commit(parse(document)) == null) throw new IOException("The restored blueprints could not be saved.");
        }
    }

    static JSONArray parse(String document) throws JSONException {
        if (document == null || document.length() > MAX_DOCUMENT) throw new JSONException("Blueprint library is too large.");
        JSONObject value = new JSONObject(document);
        JSONArray designs = value.getJSONArray("designs");
        if (value.optInt("version") != 1 || designs.length() > MAX_DESIGNS)
            throw new JSONException("Unsupported blueprint library.");
        for (int i = 0; i < designs.length(); i++) validateDesign(designs.getJSONObject(i));
        return designs;
    }

    private static void validateDesign(JSONObject design) throws JSONException {
        for (String key : new String[] {"id", "name", "body", "propulsion"})
            requirePart(design.get(key));
        JSONArray turrets = design.getJSONArray("turrets");
        if (turrets.length() < 1 || turrets.length() > 3) throw new JSONException("Invalid blueprint equipment.");
        for (int i = 0; i < turrets.length(); i++) requirePart(turrets.get(i));
    }

    private static void requirePart(Object value) throws JSONException {
        if (!(value instanceof String) || ((String) value).isEmpty() || ((String) value).length() > 128)
            throw new JSONException("Invalid blueprint field.");
    }

    private static int indexOf(JSONArray designs, String id) throws JSONException {
        for (int i = 0; i < designs.length(); i++)
            if (designs.getJSONObject(i).getString("id").equals(id)) return i;
        return -1;
    }

    private static String encode(JSONArray designs) throws JSONException {
        String data = new JSONObject().put("version", 1).put("designs", designs).toString();
        if (designs.length() > MAX_DESIGNS || data.length() > MAX_DOCUMENT)
            throw new JSONException("Blueprint library is full.");
        return data;
    }

    private String commit(JSONArray designs) throws JSONException {
        String data = encode(designs);
        return preferences.edit().putString(KEY, data).commit() ? data : null;
    }
}
