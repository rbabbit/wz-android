package com.rbabbit.blocknight.warzone;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Public Console identifiers only; no OAuth secrets belong in this asset. */
public final class PlayGamesConfig {
    public static final class Mapping {
        public final String key, id, kind, mode, map, difficulty, classification;
        public final int threshold;
        public final boolean incremental;
        public final boolean smallerIsBetter;
        Mapping(JSONObject value) {
            key = value.optString("key", "");
            id = value.optString("id");
            kind = value.optString("kind");
            mode = value.optString("mode", "*");
            map = value.optString("map", "*");
            difficulty = value.optString("difficulty", "*");
            classification = value.optString("classification", "");
            threshold = Math.max(1, value.optInt("threshold", 1));
            incremental = value.optBoolean("incremental", false);
            smallerIsBetter = "smaller".equals(value.optString("order", "larger"));
        }
        boolean matches(JSONObject fact) {
            return kind.equals(fact.optString("kind"))
                    && (key.isEmpty() || key.equals(fact.optString("key")))
                    && (mode.equals("*") || mode.equals(fact.optString("mode")))
                    && (map.equals("*") || map.equals(fact.optString("map")))
                    && (difficulty.equals("*") || difficulty.equals(fact.optString("difficulty")));
        }
    }
    public final String applicationId, snapshotName, error;
    public final List<Mapping> achievements, leaderboards;
    private PlayGamesConfig(String applicationId, String snapshotName, String error,
                            List<Mapping> achievements, List<Mapping> leaderboards) {
        this.applicationId=applicationId; this.snapshotName=snapshotName; this.error=error;
        this.achievements=Collections.unmodifiableList(achievements);
        this.leaderboards=Collections.unmodifiableList(leaderboards);
    }
    public boolean configured() { return error.isEmpty() && applicationId.matches("[1-9][0-9]{5,19}"); }
    public static PlayGamesConfig load(Context context) {
        try (InputStream stream=context.getAssets().open("warzone/play-games.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] chunk=new byte[4096]; int count;
            while((count=stream.read(chunk))!=-1) {
                if(bytes.size()+count>65536)throw new IllegalArgumentException("Configuration too large");
                bytes.write(chunk,0,count);
            }
            JSONObject value=new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            if (value.optInt("schemaVersion")!=1) throw new IllegalArgumentException("Unsupported configuration");
            String appId=value.optString("gamesApplicationId", "");
            String name=value.optString("snapshotName", "warzone_manual_backup_v1");
            if (!name.matches("[A-Za-z0-9_.~-]{1,100}")) throw new IllegalArgumentException("Invalid backup name");
            List<Mapping> achievements=read(value.optJSONArray("achievements"), false);
            List<Mapping> leaderboards=read(value.optJSONArray("leaderboards"), true);
            String error=appId.isEmpty()?"Google Play Games setup is pending in Play Console. Local play remains available.":"";
            if (!appId.isEmpty()&&!appId.matches("[1-9][0-9]{5,19}")) error="Invalid Play Games application ID.";
            return new PlayGamesConfig(appId, name, error, achievements, leaderboards);
        } catch (Exception failure) {
            return new PlayGamesConfig("", "warzone_manual_backup_v1", "Google Play Games configuration is unavailable.",
                    new ArrayList<>(), new ArrayList<>());
        }
    }
    private static List<Mapping> read(JSONArray values, boolean leaderboard) throws Exception {
        List<Mapping> result=new ArrayList<>();
        if (values==null) return result;
        if (values.length()>100) throw new IllegalArgumentException("Too many mappings");
        for (int i=0;i<values.length();i++) {
            Mapping mapping=new Mapping(values.getJSONObject(i));
            if (!mapping.id.matches("Cg[A-Za-z0-9_-]{5,150}")
                    || !(mapping.kind.equals("wave")||mapping.kind.equals("victory")
                        ||mapping.kind.equals("achievement")||mapping.kind.equals("leaderboard")))
                throw new IllegalArgumentException("Invalid Console mapping");
            // Boards must explicitly identify both their rules and exact map/difficulty.
            // Unclassified/modded progress cannot enter a normal board accidentally.
            if (leaderboard&&(mapping.classification.isEmpty()||mapping.classification.equals("unclassified")
                    ||mapping.map.equals("*")||mapping.difficulty.equals("*")||mapping.mode.equals("*")))
                throw new IllegalArgumentException("Leaderboard rules must be explicit");
            result.add(mapping);
        }
        return result;
    }
}
