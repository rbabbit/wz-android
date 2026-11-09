package com.rbabbit.blocknight.warzone;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/** Focused policy checks against the actual Android-independent wallet ledger. */
final class RewardLedgerCheck {
  private static int checks;
  private static Set<String> ids(String... values) { return new LinkedHashSet<>(Arrays.asList(values)); }
  private static void check(boolean value, String name) {
    if (!value) throw new AssertionError(name);
    checks++;
    System.out.println("PASS " + name);
  }
  private static void rejects(Runnable operation, String name) {
    try { operation.run(); } catch (IllegalArgumentException expected) { checks++; System.out.println("PASS " + name); return; }
    throw new AssertionError(name);
  }
  private static void immutable(Runnable operation, String name) {
    try { operation.run(); } catch (UnsupportedOperationException expected) { checks++; System.out.println("PASS " + name); return; }
    throw new AssertionError(name);
  }

  public static void main(String[] args) {
    RewardLedger l = new RewardLedger();
    check(l.balance == 350, "starter balance is350");
    l.buy("mapA", ids("fortress", "research"));
    check(l.balance == 170 && l.queued("mapA").equals(ids("fortress", "research")), "two purchases deduct exact180");
    check(l.queued("mapB").isEmpty(), "purchases remain bound to selected map");
    rejects(() -> l.buy("mapA", ids("fortress")), "duplicate owned boost rejected");
    rejects(() -> l.buy("mapA", ids("supply")), "third boost rejected");
    check(l.balance == 170 && l.queued("mapA").size() == 2, "rejected duplicate and third purchase do not mutate wallet");
    immutable(() -> l.queued("mapA").clear(), "queued snapshot cannot be mutated externally");
    RewardLedger.Run run = l.begin("sessionA", "mapA");
    check(run.boosts.equals(ids("fortress", "research")) && l.queued("mapA").isEmpty(), "begin consumes selected map purchases once");
    check(l.begin("sessionA", "mapA") == run && l.balance == 170, "duplicate begin reuses run without charging");
    rejects(() -> l.begin("sessionA", "mapB"), "session cannot switch map");
    immutable(() -> run.boosts.clear(), "run boost snapshot cannot be mutated externally");
    l.applied("sessionA");
    l.progress("sessionA", 19, 25);
    l.progress("sessionA", 4, 25);
    check(run.wave == 19, "progress is monotonic");
    l.progress("sessionA", 999, 25);
    check(run.wave == 25, "progress clamps to map wave count");

    RewardLedger bad = new RewardLedger();
    rejects(() -> bad.buy("map", ids("fortress", "research", "supply")), "three-boost bundle rejected atomically");
    rejects(() -> bad.buy("map", ids("unknown")), "unknown boost rejected");
    rejects(() -> bad.buy("map", ids()), "empty selection rejected");
    check(bad.balance == 350 && bad.pending.isEmpty(), "rejected bundles leave starter wallet unchanged");
    bad.balance = 29;
    rejects(() -> bad.buy("map", ids("supply")), "insufficient funds rejected");
    check(bad.balance == 29 && bad.pending.isEmpty(), "insufficient purchase has no partial mutations");

    RewardLedger win = new RewardLedger();
    win.begin("win1", "hardMap");
    RewardLedger.Receipt r = win.finish("win1", true, "hard", 25);
    check(r.earned == 150 && win.balance == 500 && win.completed.contains("hardMap"), "first hard win grants100 plus50 once");
    check(win.finish("win1", true, "hard", 25) == r && win.balance == 500, "duplicate win finish grants nothing again");
    check(win.finish("win1", false, "hard", 25) == r && win.balance == 500, "later loss callback cannot replace settled win");
    win.begin("win2", "hardMap");
    check(win.finish("win2", true, "hard", 25).earned == 100 && win.balance == 600, "replay hard win grants base only");
    win.begin("medium1", "mediumMap");
    check(win.finish("medium1", true, "medium", 20).earned == 130, "first medium win grants80 plus50");
    win.begin("easy1", "easyMap");
    check(win.finish("easy1", true, "easy", 15).earned == 110, "first easy win grants60 plus50");

    RewardLedger loss = new RewardLedger();
    int[] waves = {9, 10, 19, 20, 25};
    int[] awards = {0, 20, 0, 20, 0};
    for (int i = 0; i < waves.length; i++) {
      String session = "loss" + i;
      loss.begin(session, "map");
      loss.progress(session, waves[i], 25);
      RewardLedger.Receipt receipt = loss.finish(session, false, "hard", 25);
      check(receipt.earned == awards[i], "loss wave" + waves[i] + " rewards only newlyreached10-wave milestones");
      int before = loss.balance;
      check(loss.finish(session, false, "hard", 25) == receipt && loss.balance == before,
          "duplicate loss" + i + " cannot grant again");
    }
    check(loss.balance == 390 && loss.milestones.get("map") == 2, "repeated loss milestones cannot farm crystals");
    loss.begin("otherMap", "other");
    loss.progress("otherMap", 10, 25);
    check(loss.finish("otherMap", false, "hard", 25).earned == 20, "milestone history belongs to each map");

    RewardLedger recovery = new RewardLedger();
    recovery.buy("mapA", ids("fortress"));
    recovery.begin("preApply", "mapA");
    recovery.buy("mapB", ids("research"));
    recovery.begin("applied", "mapB");
    recovery.applied("applied");
    recovery.recoverInterrupted();
    check(recovery.queued("mapA").equals(ids("fortress")), "interrupted pre-apply run restores purchased boosts");
    check(recovery.queued("mapB").isEmpty(), "interrupted applied run does not restore used boosts");
    check(recovery.balance == 170, "recovery does not award or charge crystals");
    recovery.recoverInterrupted();
    check(recovery.queued("mapA").equals(ids("fortress")) && recovery.balance == 170,
        "repeated recovery is idempotent");
    check(recovery.finish("preApply", false, "hard", 25) == null && recovery.balance == 170,
        "quit or abandoned run cannot earn reward");
    rejects(() -> recovery.applied("preApply"), "settled session rejects application");
    rejects(() -> recovery.begin("preApply", "mapA"), "settled session cannot be begun again");
    rejects(() -> recovery.finish("unknown", true, "hard", 25), "unknown finish session cannot create award");
    rejects(() -> recovery.applied("unknown"), "unknown application session rejected");
    rejects(() -> recovery.progress("unknown", 20, 25), "unknown progress session rejected");
    check(recovery.balance == 170 && recovery.completed.isEmpty(), "stale unknown callbacks do not mutate wallet");

    RewardLedger guarded = new RewardLedger();
    guarded.buy("mapA", ids("fortress"));
    guarded.begin("activeA", "mapA");
    rejects(() -> guarded.buy("mapA", ids("research", "supply")),
        "buying for unsettled same-map run is rejected before recovery can overflow boost count");
    check(guarded.balance == 230 && guarded.queued("mapA").isEmpty(), "active-map purchase rejection is atomic");
    guarded.buy("mapB", ids("supply"));
    check(guarded.queued("mapB").equals(ids("supply")), "active-map guard does not alter another map's queued purchase");
    guarded.abandon("activeA");
    guarded.buy("mapA", ids("research"));
    check(guarded.queued("mapA").equals(ids("fortress", "research")) && guarded.balance == 140,
        "after interruption restored boost can be combined with one new boost safely");

    System.out.println("RESULT " + checks + " checks passed; emulatorUsed=false; Android persistence not executed");
  }
}
