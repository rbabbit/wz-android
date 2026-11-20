package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.BitSet;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local native-result history, partitioned by the connected Play Games account. */
final class PlayGamesProgressStore {
    private static final Object LOCK = new Object();
    private static final String KEY = "history_v1";
    private static final int MAX_RUNS = 4096, MAX_ACCOUNTS = 8, MAX_HISTORY_BYTES = 8 * 1024 * 1024, MAX_WAVE = 10000;
    private static final long MAX_TIME_MS = 7L * 24 * 60 * 60 * 1000, WAVE_SCALE = 1000000000L;
    private static final Set<String> MODES = new HashSet<>(Arrays.asList("campaign", "towers", "survival", "ffa", "challenge", "maps", "multiplayer"));
    private final SharedPreferences preferences;

    PlayGamesProgressStore(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences("play_games_progress", Context.MODE_PRIVATE);
    }

    JSONArray recordEvent(String owner, JSONObject event) {
        synchronized (LOCK) {
            try {
                owner = owner(owner);
                JSONObject root = read(), state = state(root, owner, true);
                if (apply(state, event)) write(root);
                return owner.isEmpty() ? new JSONArray() : facts(owner, state);
            } catch (Exception error) { throw failure(error); }
        }
    }

    JSONArray facts(String owner) {
        synchronized (LOCK) {
            try {
                owner = owner(owner);
                if (owner.isEmpty()) return new JSONArray();
                JSONObject state = state(read(), owner, false);
                return state == null ? new JSONArray() : facts(owner, state);
            } catch (Exception error) { throw failure(error); }
        }
    }

    boolean hasUnowned() {
        synchronized (LOCK) {
            try { return read().getJSONObject("unowned").getJSONObject("runs").length() > 0; }
            catch (Exception error) { throw failure(error); }
        }
    }

    void claimUnowned(String owner) {
        synchronized (LOCK) {
            try {
                owner = owner(owner);
                if (owner.isEmpty()) throw new IllegalArgumentException("Connect a Play Games account before claiming local progress.");
                JSONObject root = read(), pending = root.getJSONObject("unowned"), target = state(root, owner, true);
                JSONObject runs = target.getJSONObject("runs"), incoming = pending.getJSONObject("runs");
                for (Iterator<String> keys = incoming.keys(); keys.hasNext();) {
                    String id = keys.next(); JSONObject run = incoming.getJSONObject(id), previous = runs.optJSONObject(id);
                    if (previous == null) {
                        if (runs.length() >= MAX_RUNS) throw new IllegalStateException("Local Play Games progress storage is full.");
                        runs.put(id, new JSONObject(run.toString()));
                    } else mergeRun(previous, run);
                }
                root.put("unowned", emptyState());
                write(root);
            } catch (Exception error) { throw failure(error); }
        }
    }

    private boolean apply(JSONObject state, JSONObject event) throws Exception {
        if (event == null) throw new IllegalArgumentException("Missing gameplay result.");
        identity(event.getString("eventId"), 300); String runId = identity(event.getString("runId"), 200);
        String kind = event.getString("kind"), mode = event.getString("mode"), map = identity(event.getString("map"), 160);
        if (!MODES.contains(mode) || !Arrays.asList("wave_cleared", "match_finished", "mission_completed", "campaign_completed").contains(kind))
            throw new IllegalArgumentException("Unsupported gameplay result.");
        if (event.optBoolean("spectator")) return false;
        if ("multiplayer".equals(mode) && (!event.optBoolean("verifiedResult") || !event.optBoolean("nativeCompleted"))) return false;
        if ("wave_cleared".equals(kind)) {
            if (!("towers".equals(mode) || "survival".equals(mode))
                    || !(event.optBoolean("verifiedResult") || event.optBoolean("nativeCompleted"))) return false;
        } else if (!event.optBoolean("nativeCompleted")) return false;
        if (("mission_completed".equals(kind) || "campaign_completed".equals(kind)) && !"campaign".equals(mode)) return false;
        String difficulty = event.optString("difficulty", "normal");
        if (!Arrays.asList("easy", "medium", "hard", "normal", "insane", "online").contains(difficulty)) throw new IllegalArgumentException("Invalid gameplay difficulty.");
        int players = event.optInt("players", "campaign".equals(mode) ? 1 : 0);
        if (players < 1 || players > 10 || (Arrays.asList("ffa", "challenge", "maps", "multiplayer").contains(mode) && players < 2))
            throw new IllegalArgumentException("Invalid gameplay player count.");
        String botValue = event.optString("botType", "");
        String bot = token(botValue.isEmpty() ? "scripted" : botValue, 80), type = event.optString("gameType", "ffa");
        if (!("ffa".equals(type) || "teams".equals(type))) throw new IllegalArgumentException("Invalid gameplay team rules.");
        JSONArray teams = teams(event.optJSONArray("teams"), type, players);
        String strategy = token(event.optString("strategy", event.optString("weapon", "native")), 80);
        String rules = token(event.optString("classification", "native-v1"), 100);
        String classification = "bot=" + bot + ";players=" + players + ";type=" + type + ";teams=" + teams.toString() + ";strategy=" + strategy + ";rules=" + rules;
        long elapsed = event.has("elapsedMs") ? integer(event.get("elapsedMs"), -1, MAX_TIME_MS) : -1;
        String missionIdentity = "campaign".equals(mode) ? identity(event.optString("missionId", map), 160) : "";
        String id = hash(mode + "\n" + runId + (missionIdentity.isEmpty() ? "" : "\n" + missionIdentity));
        JSONObject runs = state.getJSONObject("runs"), run = runs.optJSONObject(id);
        if (run == null) {
            if (runs.length() >= MAX_RUNS) throw new IllegalStateException("Local Play Games progress storage is full.");
            run = new JSONObject().put("mode", mode).put("map", map).put("difficulty", difficulty).put("classification", classification)
                    .put("botType", bot).put("gameType", type).put("players", players).put("teams", teams)
                    .put("waves", "").put("missions", new JSONArray()).put("finished", false).put("won", false)
                    .put("campaignComplete", false).put("waveScore", 0L).put("finishElapsedMs", -1L).put("serverVerified", false);
            runs.put(id, run);
        } else if (!mode.equals(run.getString("mode")) || !map.equals(run.getString("map")) || !difficulty.equals(run.getString("difficulty"))
                || !classification.equals(run.getString("classification"))) throw new IllegalArgumentException("The gameplay result changed its match identity.");
        String before = run.toString();
        if ("wave_cleared".equals(kind)) {
            BitSet cleared = waves(run); JSONArray completed = event.optJSONArray("completedWaves");
            if (completed == null) completed = new JSONArray().put(event.get("wave"));
            if (completed.length() > MAX_WAVE) throw new IllegalArgumentException("Too many cleared waves.");
            for (int i = 0; i < completed.length(); i++) cleared.set((int)integer(completed.get(i), 1, MAX_WAVE));
            run.put("waves", Base64.getEncoder().encodeToString(cleared.toByteArray()));
            if (elapsed >= 0 && !cleared.isEmpty()) run.put("waveScore", Math.max(run.getLong("waveScore"), (cleared.length() - 1) * WAVE_SCALE + WAVE_SCALE - 1 - elapsed));
        } else if ("mission_completed".equals(kind)) {
            JSONArray missions = run.getJSONArray("missions");
            if (!strings(missions).contains(missionIdentity)) missions.put(missionIdentity);
            run.put("finished", true).put("won", true);
            if (elapsed > 0) {
                long previous = run.optLong("finishElapsedMs", -1);
                run.put("finishElapsedMs", previous < 0 ? elapsed : Math.min(previous, elapsed));
            }
        } else if ("campaign_completed".equals(kind)) run.put("campaignComplete", true);
        else {
            boolean won = event.optBoolean("won");
            if (run.optBoolean("finished") && run.optBoolean("won") != won) throw new IllegalArgumentException("Conflicting terminal gameplay result.");
            run.put("finished", true).put("won", won);
            if (elapsed > 0) {
                long previous = run.optLong("finishElapsedMs", -1);
                run.put("finishElapsedMs", previous < 0 ? elapsed : Math.min(previous, elapsed));
            }
            if (event.optBoolean("serverVerified")) run.put("serverVerified", true);
        }
        return !before.equals(run.toString());
    }

    private JSONArray facts(String owner, JSONObject state) throws Exception {
        Map<String, Long> values = new LinkedHashMap<>(); Set<String> missions = new HashSet<>(), bots = new HashSet<>();
        Map<String, JSONObject> boards = new LinkedHashMap<>(); long totalSurvival = 0, bestSurvival = 0;
        JSONObject runs = state.getJSONObject("runs");
        for (Iterator<String> keys = runs.keys(); keys.hasNext();) {
            JSONObject run = runs.getJSONObject(keys.next()); String mode = run.getString("mode");
            boolean finished = run.optBoolean("finished"), won = finished && run.optBoolean("won"), hard = "hard".equals(run.getString("difficulty"));
            BitSet waves = waves(run);
            if ("campaign".equals(mode)) {
                missions.addAll(strings(run.getJSONArray("missions")));
                if (run.optBoolean("campaignComplete")) achieve(values, "campaign_complete", 1);
            } else if ("towers".equals(mode)) {
                if (!waves.isEmpty()) achieve(values, "towers_first_wave", 1);
                if (won) { achieve(values, "towers_victory", 1); if (hard) achieve(values, "towers_hard_victory", 1); }
            } else if ("survival".equals(mode)) {
                totalSurvival += waves.cardinality(); bestSurvival = Math.max(bestSurvival, waves.cardinality());
            } else if ("ffa".equals(mode) || "challenge".equals(mode)) {
                if (won) { achieve(values, mode + "_victory", 1); if (hard) achieve(values, mode + "_hard_victory", 1); }
            } else if ("maps".equals(mode) && FfaMapCatalog.isDownloaded(run.getString("map"))) {
                if (finished) achieve(values, "maps_completed", 1);
                if (won) {
                    String bot = run.getString("botType"); if (MapsBotCatalog.isKnownId(bot)) bots.add(bot);
                    if ("teams".equals(run.getString("gameType"))) achieve(values, "maps_team_victory", 1);
                }
            } else if ("multiplayer".equals(mode)) {
                if (finished) achieve(values, "mp_completed", 1);
                if (won) achieve(values, "mp_victory", 1);
            }
            if (!"multiplayer".equals(mode) || run.optBoolean("serverVerified")) {
                if (run.optLong("waveScore") > 0) board(boards, owner, "waves_reached", run, run.getLong("waveScore"), false);
                if (won && run.optLong("finishElapsedMs", -1) > 0) board(boards, owner, "fastest_victory_ms", run, run.getLong("finishElapsedMs"), true);
            }
        }
        if (!missions.isEmpty()) achieve(values, "campaign_first_mission", 1);
        achieve(values, "campaign_missions_5", Math.min(5, missions.size()));
        if (totalSurvival > 0) achieve(values, "survival_first_wave", 1);
        achieve(values, "survival_run_5", Math.min(5, bestSurvival));
        achieve(values, "survival_total_25", Math.min(25, totalSurvival));
        achieve(values, "maps_bots_3", Math.min(3, bots.size()));
        JSONArray result = new JSONArray();
        for (Map.Entry<String, Long> value : values.entrySet()) if (value.getValue() > 0) result.put(new JSONObject()
                .put("owner", owner).put("kind", "achievement").put("key", value.getKey()).put("value", value.getValue())
                .put("mode", value.getKey().startsWith("mp_") ? "multiplayer" : value.getKey().substring(0, value.getKey().indexOf('_')))
                .put("map", "*").put("difficulty", "*").put("classification", "native-verified"));
        for (JSONObject board : boards.values()) result.put(board);
        return result;
    }

    private static void board(Map<String, JSONObject> boards, String owner, String key, JSONObject run, long value, boolean smaller) throws Exception {
        String identity = key + "\n" + run.getString("mode") + "\n" + run.getString("map") + "\n" + run.getString("difficulty") + "\n" + run.getString("classification");
        JSONObject previous = boards.get(identity);
        if (previous != null && (smaller ? previous.getLong("value") <= value : previous.getLong("value") >= value)) return;
        boards.put(identity, new JSONObject().put("owner", owner).put("kind", "leaderboard").put("key", key)
                .put("mode", run.getString("mode")).put("map", run.getString("map")).put("difficulty", run.getString("difficulty"))
                .put("classification", run.getString("classification")).put("value", value));
    }

    private static void mergeRun(JSONObject target, JSONObject source) throws Exception {
        for (String key : Arrays.asList("mode", "map", "difficulty", "classification"))
            if (!target.getString(key).equals(source.getString(key))) throw new IllegalArgumentException("Pending progress belongs to a different match identity.");
        if (target.optBoolean("finished") && source.optBoolean("finished") && target.optBoolean("won") != source.optBoolean("won"))
            throw new IllegalArgumentException("Pending progress has a conflicting match result.");
        BitSet waves = waves(target); waves.or(waves(source)); target.put("waves", Base64.getEncoder().encodeToString(waves.toByteArray()));
        JSONArray missions = target.getJSONArray("missions"); Set<String> known = strings(missions);
        for (String mission : strings(source.getJSONArray("missions"))) if (known.add(mission)) missions.put(mission);
        for (String key : Arrays.asList("finished", "won", "campaignComplete", "serverVerified")) target.put(key, target.optBoolean(key) || source.optBoolean(key));
        target.put("waveScore", Math.max(target.optLong("waveScore"), source.optLong("waveScore")));
        long first = target.optLong("finishElapsedMs", -1), second = source.optLong("finishElapsedMs", -1);
        if (second > 0 && (first < 0 || second < first)) target.put("finishElapsedMs", second);
    }

    private JSONObject read() throws Exception {
        String encoded = preferences.getString(KEY, null);
        if (encoded == null) return new JSONObject().put("version", 1).put("accounts", new JSONObject()).put("unowned", emptyState());
        if (encoded.length() > MAX_HISTORY_BYTES) throw new IllegalStateException("Local Play Games progress storage is full.");
        JSONObject root = new JSONObject(encoded);
        if (root.getInt("version") != 1) throw new IllegalStateException("Unsupported Play Games progress version.");
        root.getJSONObject("accounts"); root.getJSONObject("unowned").getJSONObject("runs"); return root;
    }
    private void write(JSONObject root) throws Exception {
        String encoded = root.toString();
        if (encoded.getBytes(StandardCharsets.UTF_8).length > MAX_HISTORY_BYTES) throw new IllegalStateException("Local Play Games progress storage is full.");
        if (!preferences.edit().putString(KEY, encoded).commit()) throw new IllegalStateException("Play Games progress could not be saved.");
    }
    private static JSONObject emptyState() throws Exception { return new JSONObject().put("runs", new JSONObject()); }
    private static JSONObject state(JSONObject root, String owner, boolean create) throws Exception {
        if (owner.isEmpty()) return root.getJSONObject("unowned");
        JSONObject accounts = root.getJSONObject("accounts"); String key = hash(owner); JSONObject value = accounts.optJSONObject(key);
        if (value == null && create) {
            if (accounts.length() >= MAX_ACCOUNTS) throw new IllegalStateException("Too many Play Games accounts have local progress on this device.");
            value = emptyState(); accounts.put(key, value);
        }
        return value;
    }
    private static JSONArray teams(JSONArray supplied, String type, int players) throws Exception {
        JSONArray result = new JSONArray(); Set<Integer> distinct = new HashSet<>();
        if (supplied != null && supplied.length() != players || "teams".equals(type) && supplied == null)
            throw new IllegalArgumentException("Missing native team assignments.");
        for (int i = 0; i < players; i++) {
            int team = supplied == null ? i : (int)integer(supplied.get(i), 0, players - 1);
            if ("ffa".equals(type) && team != i) throw new IllegalArgumentException("Invalid independent player assignments.");
            result.put(team); distinct.add(team);
        }
        if ("teams".equals(type) && distinct.size() < 2) throw new IllegalArgumentException("A team result needs opposing teams.");
        return result;
    }
    private static BitSet waves(JSONObject run) throws Exception {
        BitSet value = BitSet.valueOf(Base64.getDecoder().decode(run.getString("waves")));
        if (value.get(0) || value.length() > MAX_WAVE + 1) throw new IllegalArgumentException("Invalid saved wave history."); return value;
    }
    private static Set<String> strings(JSONArray array) throws Exception {
        Set<String> values = new HashSet<>(); for (int i = 0; i < array.length(); i++) values.add(array.getString(i)); return values;
    }
    private static void achieve(Map<String, Long> values, String key, long value) { values.put(key, Math.max(values.getOrDefault(key, 0L), value)); }
    private static long integer(Object raw, long min, long max) {
        if (!(raw instanceof Number)) throw new IllegalArgumentException("Invalid numeric gameplay result.");
        Number value = (Number)raw; long number = value.longValue();
        if (value.doubleValue() != (double)number || number < min || number > max) throw new IllegalArgumentException("Invalid numeric gameplay result."); return number;
    }
    private static String token(String value, int limit) {
        if (value == null || value.length() > limit || !value.matches("[A-Za-z0-9_.:/-]+")) throw new IllegalArgumentException("Invalid stable gameplay identity."); return value;
    }
    private static String identity(String value, int limit) {
        if (value == null || value.isEmpty() || value.length() > limit) throw new IllegalArgumentException("Invalid stable gameplay identity.");
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i))) throw new IllegalArgumentException("Invalid stable gameplay identity.");
        return value;
    }
    private static String owner(String value) {
        if (value == null || value.isEmpty()) return "";
        if (value.length() > 256 || !value.matches("[A-Za-z0-9_.:@-]+")) throw new IllegalArgumentException("Invalid Play Games account identity."); return value;
    }
    private static String hash(String value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte part : MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))) result.append(String.format(Locale.ROOT, "%02x", part & 255)); return result.toString();
    }
    private static IllegalStateException failure(Exception error) {
        return error instanceof IllegalStateException ? (IllegalStateException)error : new IllegalStateException("Gameplay progress could not be recorded: " + error.getMessage(), error);
    }
}
