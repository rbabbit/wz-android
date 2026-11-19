package com.rbabbit.blocknight.warzone;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Immutable slot/team identities shared by Maps launch and native saves. */
final class MapsTeamSetup {
    static int[] validate(int[] teams, int players) {
        if (players < 2 || players > 10) throw new IllegalArgumentException("Invalid map player count.");
        if (teams == null) return null;
        if (teams.length != players) throw new IllegalArgumentException("Choose a team for every player slot.");
        int[] copy = teams.clone(); Set<Integer> distinct = new HashSet<>();
        for (int team : copy) {
            if (team < 0 || team >= players) throw new IllegalArgumentException("Invalid map team.");
            distinct.add(team);
        }
        if (distinct.size() < 2) throw new IllegalArgumentException("Choose at least two opposing teams.");
        return copy;
    }

    static int[] fromMetadata(JSONObject value, int players) throws Exception {
        String type = value.optString("gameType", "ffa");
        if (!"ffa".equals(type) && !"teams".equals(type)) throw new IllegalArgumentException("Invalid map game type.");
        JSONArray entries = value.optJSONArray("teams");
        if (entries == null) {
            if ("teams".equals(type) || value.has("teams")) throw new IllegalArgumentException("The saved team setup is missing.");
            return null;
        }
        if (entries.length() != players) throw new IllegalArgumentException("The saved team slots do not match the map.");
        int[] teams = new int[players];
        for (int i = 0; i < players; i++) {
            Object raw = entries.get(i);
            if (!(raw instanceof Number) || ((Number) raw).doubleValue() != ((Number) raw).intValue())
                throw new IllegalArgumentException("Invalid saved team slot.");
            teams[i] = ((Number) raw).intValue();
            if ("ffa".equals(type) && teams[i] != i) throw new IllegalArgumentException("The saved FFA slots are not independent.");
        }
        return "teams".equals(type) ? validate(teams, players) : null;
    }

    static JSONArray toJson(int[] teams, int players) {
        int[] checked = validate(teams, players); JSONArray result = new JSONArray();
        for (int i = 0; i < players; i++) result.put(checked == null ? i : checked[i]);
        return result;
    }

    static String gameType(int[] teams) { return teams == null ? "ffa" : "teams"; }

    static boolean matches(JSONObject metadata, int[] teams, int players) throws Exception {
        return Arrays.equals(fromMetadata(metadata, players), validate(teams, players));
    }

    private MapsTeamSetup() { }
}
