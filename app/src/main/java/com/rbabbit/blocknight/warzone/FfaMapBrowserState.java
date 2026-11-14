package com.rbabbit.blocknight.warzone;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Selection state shared by the FFA pager and its player-count tabs. No Android state. */
final class FfaMapBrowserState {
    static final int ORIGINALS = 0;
    private static final int[] GROUPS = {2, 3, 4, ORIGINALS};
    private final Map<Integer, List<String>> groups = new LinkedHashMap<>();
    private final Map<Integer, String> remembered = new LinkedHashMap<>();
    private final Map<String, Integer> groupById = new LinkedHashMap<>();
    private int group, epoch = 1;
    private String selectedId;

    FfaMapBrowserState(String[] ids, int[] players, String initialId) {
        if (ids == null || players == null || ids.length == 0 || ids.length != players.length)
            throw new IllegalArgumentException("Invalid FFA browser rows");
        for (int key : GROUPS) groups.put(key, new ArrayList<>());
        for (int i = 0; i < ids.length; i++) {
            String id = ids[i];
            if (id == null || id.isEmpty() || players[i] < 2 || players[i] > 6)
                throw new IllegalArgumentException("Invalid FFA browser row");
            int key = id.startsWith("ntw-") ? players[i] : ORIGINALS;
            if (!groups.containsKey(key) || groupById.put(id, key) != null)
                throw new IllegalArgumentException("Invalid or repeated FFA browser identity: " + id);
            groups.get(key).add(id);
        }
        for (Map.Entry<Integer, List<String>> row : groups.entrySet()) {
            if (!row.getValue().isEmpty()) remembered.put(row.getKey(), row.getValue().get(0));
        }
        if (!groupById.containsKey(initialId)) {
            initialId = remembered.containsKey(ORIGINALS) ? remembered.get(ORIGINALS) : ids[0];
        }
        group = groupById.get(initialId);
        selectedId = initialId;
        remembered.put(group, selectedId);
    }

    int group() { return group; }
    int epoch() { return epoch; }
    String selectedId() { return selectedId; }
    int selectedIndex() { return ids().indexOf(selectedId); }
    int size() { return ids().size(); }
    String idAt(int index) { return ids().get(index); }
    boolean hasGroup(int key) { return groups.containsKey(key) && !groups.get(key).isEmpty(); }
    List<String> ids() { return Collections.unmodifiableList(groups.get(group)); }

    /** Each group remembers its last map, while launch always reads the selected identity. */
    boolean selectGroup(int key) {
        if (!hasGroup(key)) throw new IllegalArgumentException("Empty FFA browser group: " + key);
        if (key == group) return false;
        remembered.put(group, selectedId);
        group = key;
        selectedId = remembered.get(key);
        epoch++;
        return true;
    }

    /** A delayed snap from a retired group must never select a map in the new group. */
    boolean selectIndex(int index, int expectedEpoch) {
        if (expectedEpoch != epoch) return false;
        index = Math.max(0, Math.min(size() - 1, index));
        selectedId = idAt(index);
        remembered.put(group, selectedId);
        return true;
    }
}
