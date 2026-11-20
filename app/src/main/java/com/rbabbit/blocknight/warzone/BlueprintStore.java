package com.rbabbit.blocknight.warzone;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Device-wide blueprint library shared by both battle activities. */
final class BlueprintStore {
    static final int MAX_DESIGNS = 200;
    static final int MAX_DOCUMENT = 512 * 1024;
    private static final String KEY = "saved_designs_v1";
    private static final String RECOVERED = "recovered_blueprint_keys_v2";
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

    boolean importLegacy(String document) {
        return recover(document, false);
    }

    boolean importNativeTemplates(String document) {
        return recover(document, true);
    }

    private boolean recover(String document, boolean nativeTemplates) {
        if (document == null || document.isEmpty()) return true;
        if (document.length() > MAX_DOCUMENT) return false;
        synchronized (LOCK) {
            try {
                JSONObject source = new JSONObject(document);
                if (source.optInt("version") != 1) return false;
                JSONArray incoming = source.optJSONArray(nativeTemplates ? "templates" : "designs");
                if (incoming == null) return nativeTemplates && !source.has("templates");
                if (incoming.length() == 0) return true;
                JSONArray current = parse(load());
                Set<String> known = new HashSet<>();
                Set<String> recovered = new HashSet<>(preferences.getStringSet(RECOVERED, Collections.emptySet()));
                for (int i = 0; i < current.length(); i++) {
                    known.add(recoveryKey(current.getJSONObject(i)));
                }
                boolean changed = false;
                int length = encode(current).length();
                for (int i = 0; i < incoming.length(); i++) {
                    JSONObject design;
                    String key;
                    try {
                        design = incoming.getJSONObject(i);
                        if (nativeTemplates) design = fromNativeTemplate(design);
                        validateDesign(design);
                        key = recoveryKey(design);
                    } catch (JSONException invalidDesign) {
                        continue;
                    }
                    if (recovered.contains(key)) continue;
                    if (!known.contains(key)) {
                        if (nativeTemplates || indexOf(current, design.getString("id")) >= 0)
                            design.put("id", "recovered-" + key);
                        int added = design.toString().length() + (current.length() == 0 ? 0 : 1);
                        if (current.length() >= MAX_DESIGNS || length + added > MAX_DOCUMENT) continue;
                        current.put(design);
                        known.add(key);
                        length += added;
                    }
                    changed |= recovered.add(key);
                }
                // Remember recovered records even after deletion. Keep every source intact.
                return !changed || preferences.edit().putString(KEY, encode(current))
                        .putStringSet(RECOVERED, recovered).commit();
            } catch (JSONException invalid) {
                return false;
            }
        }
    }

    private static JSONObject fromNativeTemplate(JSONObject template) throws JSONException {
        String name = template.getString("name").replaceFirst("(?:\\s*·\\s*F\\d+)+$", "").trim();
        JSONArray turrets = new JSONArray();
        JSONArray weapons = template.optJSONArray("weapons");
        if (weapons != null) {
            for (int i = 0; i < weapons.length(); i++) turrets.put(weapons.get(i));
        }
        if (turrets.length() == 0) {
            for (String field : new String[]{"construct", "repair", "brain", "ecm", "sensor"}) {
                String part = template.optString(field, "");
                if (part.isEmpty() || part.startsWith("ZNULL")) continue;
                turrets.put(part);
                break;
            }
        }
        return new JSONObject().put("id", "native").put("name", name)
                .put("body", template.get("body")).put("propulsion", template.get("propulsion"))
                .put("turrets", turrets).put("factoryTemplate", true);
    }

    private static String recoveryKey(JSONObject design) throws JSONException {
        String name = design.getString("name").replaceFirst("(?:\\s*·\\s*F\\d+)+$", "").trim();
        JSONArray parts = new JSONArray().put(name).put(design.getString("body"))
                .put(design.getString("propulsion")).put(design.getJSONArray("turrets"));
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(parts.toString().getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(hash, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException(unavailable);
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
