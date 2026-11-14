package com.rbabbit.blocknight.warzone;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/** Exercises the actual Android-independent browser state; does not run Android or an engine. */
class FfaBrowserChecks {
    private static int checks;
    private static void check(boolean ok, String reason) {
        checks++;
        if (!ok) throw new AssertionError(reason);
    }
    private static void rejects(Runnable operation, String reason) {
        try { operation.run(); } catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError(reason);
    }
    public static void main(String[] args) throws Exception {
        List<String> rows = Files.readAllLines(Path.of(args[0]));
        String[] ids = new String[rows.size()];
        int[] players = new int[rows.size()];
        Map<Integer, List<String>> groups = new LinkedHashMap<>();
        for (int group : new int[] {2, 3, 4, 0}) groups.put(group, new ArrayList<>());
        for (int i = 0; i < rows.size(); i++) {
            String[] fields = rows.get(i).split("\\t");
            ids[i] = fields[0]; players[i] = Integer.parseInt(fields[1]);
            groups.get(ids[i].startsWith("ntw-") ? players[i] : 0).add(ids[i]);
        }
        check(ids.length == 51, "All 51 real catalogue identities supplied");
        for (int group : groups.keySet()) check(groups.get(group).size() == (group == 0 ? 6 : 15), "Group size " + group);
        for (String id : ids) {
            FfaMapBrowserState state = new FfaMapBrowserState(ids, players, id);
            check(state.selectedId().equals(id), "Opening retained actual map " + id);
            check(state.idAt(state.selectedIndex()).equals(id), "Visible page and selected identity agree " + id);
            check(state.size() <= 15, "Only current group's cards exist");
            check(state.selectIndex(state.selectedIndex(), state.epoch()), "Immediate Start/Saves settles current map");
            FfaMapBrowserState reopened = new FfaMapBrowserState(ids, players, state.selectedId());
            check(reopened.selectedId().equals(id) && reopened.group() == state.group(), "Saves/Back/reopen identity " + id);
        }
        FfaMapBrowserState state = new FfaMapBrowserState(ids, players, "emag");
        Map<Integer, String> expected = new LinkedHashMap<>();
        for (int group : groups.keySet()) expected.put(group, groups.get(group).get(0));
        expected.put(0, "emag");
        Random random = new Random(67051);
        int[] keys = {2, 3, 4, 0};
        for (int step = 0; step < 5000; step++) {
            int priorEpoch = state.epoch(), priorGroup = state.group();
            int group = keys[random.nextInt(keys.length)];
            boolean changed = state.selectGroup(group);
            check(changed == (group != priorGroup), "Group change status");
            check(state.selectedId().equals(expected.get(group)), "Last chosen map remembered for group");
            if (changed) {
                String current = state.selectedId();
                check(!state.selectIndex(999, priorEpoch), "Retired group's queued snap rejected");
                check(state.selectedId().equals(current), "Stale snap cannot change launch identity");
            } else check(state.epoch() == priorEpoch, "Same tab keeps current gesture epoch");
            int index = random.nextInt(state.size());
            check(state.selectIndex(index, state.epoch()), "Current swipe/arrow accepted");
            expected.put(group, groups.get(group).get(index));
            check(state.selectedId().equals(expected.get(group)), "Swipe maps local index to actual identity");
            check(state.selectedIndex() == index, "Visible index remains local to group");
        }
        check(state.selectIndex(-999, state.epoch()) && state.selectedIndex() == 0, "Previous clamps at first map");
        check(state.selectIndex(999, state.epoch()) && state.selectedIndex() == state.size() - 1, "Next clamps at last map");
        rejects(() -> state.selectGroup(5), "Unknown group rejected");
        rejects(() -> new FfaMapBrowserState(new String[] {"x", "x"}, new int[] {4,4}, "x"), "Duplicate map rejected");
        rejects(() -> new FfaMapBrowserState(new String[] {"ntw-6p-01"}, new int[] {6}, null), "Unsupported generated group rejected");
        rejects(() -> new FfaMapBrowserState(new String[0], new int[0], null), "Empty catalogue rejected");
        check(new FfaMapBrowserState(ids, players, "unknown").selectedId().equals("emag"), "Unknown UI preference safely opens original EMAG");
        check(new FfaMapBrowserState(ids, players, null).selectedId().equals("emag"), "Absent UI preference opens original EMAG");
        System.out.println("{\"passed\":true,\"assertions\":" + checks + ",\"maps\":" + ids.length
                + ",\"transitionSteps\":5000,\"emulatorUsed\":false,\"actualNativeEngineExecuted\":false}");
    }
}
