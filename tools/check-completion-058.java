package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

/** Real ledger/store with host-only JSON and simulated Android preference I/O. */
final class CompletionCheck058 {
  private static int checks;
  private static final Map<String, Set<String>> groups = new LinkedHashMap<>();
  private static final Map<String, Integer> rounds = new LinkedHashMap<>();
  private static void check(boolean value, String name) {
    if (!value) throw new AssertionError(name);
    checks++; System.out.println("PASS " + name);
  }
  private static void rejects(Runnable action, String name) {
    try { action.run(); } catch (RuntimeException expected) { checks++; System.out.println("PASS " + name); return; }
    throw new AssertionError(name);
  }
  private static Set<String> ids(String... values) {
    Set<String> result = new LinkedHashSet<>(); Collections.addAll(result, values); return result;
  }
  private static JSONObject saved(Ctx context) { return new JSONObject(context.p.memory.get("ledger_v1")); }
  private static JSONObject run(Ctx context, String session) {
    JSONArray runs = saved(context).getJSONArray("runs");
    for (int i = 0; i < runs.length(); i++) if (session.equals(runs.getJSONObject(i).getString("session"))) return runs.getJSONObject(i);
    throw new AssertionError("Missing run " + session);
  }
  private static Set<String> allMaps() {
    Set<String> result = new LinkedHashSet<>(); for (Set<String> maps : groups.values()) result.addAll(maps); return result;
  }
  private static Ctx seeded(Set<String> completed, int balance) {
    Ctx context = new Ctx(); new RewardStore(context);
    context.p.seed(saved(context).put("completed", new JSONArray(completed)).put("balance", balance).toString());
    return context;
  }
  private static void makeV3(Ctx context) {
    JSONObject data = saved(context); data.put("version", 3); data.remove("claimedDifficultyBonuses");
    JSONArray runs = data.getJSONArray("runs");
    for (int i = 0; i < runs.length(); i++) runs.getJSONObject(i).remove("difficultyCredits");
    context.p.seed(data.toString());
  }
  private static RewardLedger.Receipt win(RewardStore store, String session, String map, String difficulty) {
    store.begin(session, map); store.applied(session);
    return store.finish(session, true, difficulty, rounds.get(map), true, groups.get(difficulty));
  }

  public static void main(String[] args) throws Exception {
    RewardLedgerCheck029.main(new String[0]);
    JSONArray levels = new JSONObject(Files.readString(Path.of(args[0]))).getJSONArray("levels");
    for (String difficulty : new String[] {"easy", "medium", "hard"}) groups.put(difficulty, new LinkedHashSet<>());
    for (int i = 0; i < levels.length(); i++) {
      JSONObject level = levels.getJSONObject(i); String id = level.getString("id");
      if (!groups.get(level.getString("difficulty")).add(id) || rounds.put(id, level.getInt("rounds")) != null)
        throw new AssertionError("Duplicate actual map identity");
    }
    check(groups.get("easy").size() == 16 && groups.get("medium").size() == 15 && groups.get("hard").size() == 15
        && allMaps().size() == 46, "actual catalog supplies independent Easy16 Medium15 Hard15 map sets");
    completionJourney();
    partialAndInvalid();
    rollbackAndSavedRuns();
    migrationAndBackfill();
    concurrentFinishAndHome();
    System.out.println("RESULT " + checks + " completion checks passed; previous241 wallet/ad regressions passed; emulatorUsed=false; Android preferences I/O simulated");
  }

  private static void completionJourney() {
    Ctx context = new Ctx(); RewardStore store = new RewardStore(context); int expected = 350;
    Set<String> initial = store.completedMaps();
    rejects(() -> initial.add("not-a-win"), "completed-map snapshot cannot be externally mutated");
    for (String difficulty : groups.keySet()) {
      int index = 0, base = "easy".equals(difficulty) ? 60 : "medium".equals(difficulty) ? 80 : 100;
      for (String map : groups.get(difficulty)) {
        boolean last = ++index == groups.get(difficulty).size(); String session = difficulty + index;
        RewardLedger.Receipt receipt = win(store, session, map, difficulty);
        int earned = base + 50 + (last ? 1000 : 0); expected += earned;
        check(store.completedMaps().contains(map) && store.balance() == expected && receipt.earned == earned,
            difficulty + " map" + index + " marks Complete and preserves ordinary credits with only the final map adding1000");
        check(run(context, session).getInt("completionCredits") == base + 50
            && run(context, session).getInt("difficultyCredits") == (last ? 1000 : 0),
            difficulty + " map" + index + " stores separate ordinary and difficulty reward counters");
        if (last) {
          check(receipt.reason.contains("difficulty completed  +1000"), difficulty + " final receipt explains its exact1000 bonus");
          int before = store.balance();
          check(store.finish(session, true, difficulty, rounds.get(map), true, groups.get(difficulty)).earned == earned
              && store.balance() == before, difficulty + " duplicate terminal callback returns receipt without paying again");
          check(store.reconcileDifficultyBonuses(groups) == 0 && store.balance() == before,
              difficulty + " Home reconciliation cannot repay a native-finish claim");
        }
      }
      String replay = groups.get(difficulty).iterator().next(); int before = store.balance();
      check(win(store, difficulty + "Replay", replay, difficulty).earned == base && store.balance() == before + base,
          difficulty + " new replay receives ordinary win credits without another first-clear or category bonus");
      expected += base;
    }
    check(initial.isEmpty() && store.completedMaps().size() == 46, "immutable snapshots stay stable while all46 real map wins persist");
    check(saved(context).getJSONArray("claimedDifficultyBonuses").length() == 3,
        "all three category claims persist independently");
    RewardStore restarted = new RewardStore(context.restart());
    check(restarted.completedMaps().equals(allMaps()) && restarted.balance() == expected
        && restarted.reconcileDifficultyBonuses(groups) == 0, "all completion badges and once-only bonuses survive process restart");
  }

  private static void partialAndInvalid() {
    Set<String> easy = groups.get("easy"), partial = new LinkedHashSet<>(easy);
    String last = partial.iterator().next(); partial.remove(last);
    Ctx context = seeded(partial, 500); RewardStore store = new RewardStore(context);
    check(store.reconcileDifficultyBonuses(groups) == 0 && store.balance() == 500,
        "fifteen of sixteen Easy maps do not qualify for any difficulty bonus");
    store.begin("defeat", last); store.applied("defeat");
    check(store.finish("defeat", false, "easy", rounds.get(last), true, easy).earned == 0
        && !store.completedMaps().contains(last) && store.balance() == 500, "defeat neither marks Complete nor pays the missing category");
    store.begin("abandon", last); store.applied("abandon"); store.abandon("abandon", false);
    check(store.reconcileDifficultyBonuses(groups) == 0 && !store.completedMaps().contains(last),
        "abandoning the final map cannot count as a win");
    store.begin("invalid", last); store.applied("invalid");
    rejects(() -> store.finish("invalid", true, "easy", rounds.get(last), true, null), "missing finish catalog fails closed");
    rejects(() -> store.finish("invalid", true, "easy", rounds.get(last), true, ids()), "empty finish map set cannot grant a category");
    rejects(() -> store.finish("invalid", true, "easy", rounds.get(last), true, ids("notTheRunMap")), "nonmatching finish map set cannot mark the run");
    rejects(() -> store.finish("invalid", true, "unknown", rounds.get(last), true, easy), "unknown difficulty cannot create a fourth category");
    rejects(() -> store.finish("invalid", true, "easy", 0, true, easy), "zero native wave total cannot establish a completed map");
    rejects(() -> store.finish("invalid", true, "easy", rounds.get(last), true, ids(last, "")), "blank map identity fails closed");
    rejects(() -> store.finish("invalid", true, "easy", rounds.get(last), true, ids(last, null)), "null map identity fails closed");
    rejects(() -> store.finish("invalid", true, "easy", rounds.get(last), true, ids(last, "bad id")), "malformed map identity fails closed");
    check(store.balance() == 500 && store.completedMaps().equals(partial) && !run(context, "invalid").getBoolean("winPaid"),
        "invalid finish arguments leave balance Complete flags and run settlement untouched");
    store.finish("invalid", true, "easy", rounds.get(last), true);
    check(store.balance() == 610 && store.completedMaps().contains(last)
        && saved(context).getJSONArray("claimedDifficultyBonuses").length() == 0,
        "legacy finish overload preserves ordinary behavior without inventing category membership");
    check(store.reconcileDifficultyBonuses(groups) == 1000 && store.balance() == 1610,
        "Home may reconcile an actual complete category after legacy finish");

    Ctx badContext = seeded(allMaps(), 700); RewardStore bad = new RewardStore(badContext);
    rejects(() -> bad.reconcileDifficultyBonuses(null), "missing Home catalog fails closed");
    rejects(() -> bad.reconcileDifficultyBonuses(Collections.emptyMap()), "empty Home catalog cannot award anything");
    Map<String, Set<String>> malformed = new LinkedHashMap<>(groups); malformed.put("easy", ids());
    rejects(() -> bad.reconcileDifficultyBonuses(malformed), "empty category cannot be trivially completed");
    Map<String, Set<String>> nullIds = new LinkedHashMap<>(groups); nullIds.put("easy", null);
    rejects(() -> bad.reconcileDifficultyBonuses(nullIds), "null category IDs cannot be treated as complete");
    Map<String, Set<String>> duplicate = new LinkedHashMap<>(groups); duplicate.put("medium", new LinkedHashSet<>(easy));
    rejects(() -> bad.reconcileDifficultyBonuses(duplicate), "one map cannot belong to two claimed categories");
    Map<String, Set<String>> unknown = new LinkedHashMap<>(groups); unknown.put("extreme", ids("extra"));
    rejects(() -> bad.reconcileDifficultyBonuses(unknown), "invalid later category is checked before any eligible earlier category pays");
    check(bad.balance() == 700 && saved(badContext).getJSONArray("claimedDifficultyBonuses").length() == 0,
        "invalid Home catalogs atomically preserve all money and claim flags");
  }

  private static void rollbackAndSavedRuns() {
    Set<String> partial = new LinkedHashSet<>(groups.get("easy")); String last = partial.iterator().next(); partial.remove(last);
    Ctx context = seeded(partial, 400); RewardStore store = new RewardStore(context);
    store.buy("ripple", 1); String ad = store.prepareAdReward();
    store.begin("lastSaved", last); store.applied("lastSaved"); store.pinRun("lastSaved");
    int before = store.balance(); context.p.failNext = 1;
    rejects(() -> store.finish("lastSaved", true, "easy", rounds.get(last), true, groups.get("easy")),
        "failed final-win commit cannot claim success for either ordinary or difficulty credits");
    check(store.balance() == before && !store.completedMaps().contains(last)
        && saved(context).getJSONArray("claimedDifficultyBonuses").length() == 0
        && run(context, "lastSaved").getInt("difficultyCredits") == 0 && !run(context, "lastSaved").getBoolean("winPaid"),
        "failed finish rolls back wallet map badge category flag and run reward together");
    Ctx restartedContext = context.restart(); RewardStore restarted = new RewardStore(restartedContext);
    restarted.resumeRun("lastSaved", last);
    RewardLedger.Receipt receipt = restarted.finish("lastSaved", true, "easy", rounds.get(last), true, groups.get("easy"));
    check(restarted.balance() == before + 1110 && receipt.earned == 1110 && receipt.reason.contains("+1000"),
        "same saved winning run retries after disk failure and receives one correct1110 receipt");
    check(ad.equals(restarted.pendingAdReward()) && restarted.active("lastSaved").isEmpty()
        && run(restartedContext, "lastSaved").getJSONObject("remaining").getInt("ripple") == 1,
        "difficulty payout preserves pending ad identity and pinned unused building inventory");
    RewardStore loaded = new RewardStore(restartedContext.restart()); int paid = loaded.balance();
    loaded.resumeRun("lastSaved", last);
    check(loaded.finish("lastSaved", true, "easy", rounds.get(last), true, groups.get("easy")).earned == 1110
        && loaded.balance() == paid && loaded.reconcileDifficultyBonuses(groups) == 0,
        "loading older paid winning save cannot repeat ordinary category or Home bonuses");
    check(loaded.creditAdReward(ad) == 10 && loaded.balance() == paid + 10,
        "previously pending earned ad remains independently creditable once after the difficulty reward");
  }

  private static void migrationAndBackfill() {
    Ctx legacyContext = seeded(allMaps(), 900); RewardStore old = new RewardStore(legacyContext);
    old.buy("ripple", 3); old.prepareAdReward(); makeV3(legacyContext);
    int priorBalance = saved(legacyContext).getInt("balance"); String ad = saved(legacyContext).getString("pendingAdReward");
    Ctx upgradedContext = legacyContext.restart(); RewardStore upgraded = new RewardStore(upgradedContext);
    check(upgraded.completedMaps().equals(allMaps()) && upgraded.balance() == priorBalance
        && upgraded.inventory().get("ripple") == 3 && ad.equals(upgraded.pendingAdReward())
        && saved(upgradedContext).getInt("version") == 4, "v3 migration preserves all46 wins wallet stock ad identity and writes schema4 without a fresh gift");
    check(upgraded.reconcileDifficultyBonuses(groups) == 3000 && upgraded.balance() == priorBalance + 3000,
        "Home fairly backfills all three already-complete legacy categories in one transaction");
    check(upgraded.reconcileDifficultyBonuses(groups) == 0 && upgraded.balance() == priorBalance + 3000,
        "reopening Home cannot repeat the three legacy completion bonuses");
    RewardStore rebooted = new RewardStore(upgradedContext.restart());
    check(rebooted.reconcileDifficultyBonuses(groups) == 0 && rebooted.balance() == priorBalance + 3000
        && rebooted.completedMaps().equals(allMaps()), "backfill claims survive process restart without losing Complete badges");

    Ctx failed = seeded(allMaps(), 321); makeV3(failed); RewardStore rollback = new RewardStore(failed); failed.p.failNext = 1;
    rejects(() -> rollback.reconcileDifficultyBonuses(groups), "failed Home backfill commit reports failure and remains retryable");
    check(rollback.balance() == 321 && saved(failed).getJSONArray("claimedDifficultyBonuses").length() == 0,
        "failed multi-category write rolls back all3000 and all three claim flags");
    Ctx retryContext = failed.restart(); RewardStore retry = new RewardStore(retryContext);
    check(retry.reconcileDifficultyBonuses(groups) == 3000 && retry.balance() == 3321,
        "restart after failed backfill can credit each complete category exactly once");
    check(new RewardStore(retryContext.restart()).reconcileDifficultyBonuses(groups) == 0,
        "successful retry remains paid once across a later restart");

    Ctx malformed = seeded(groups.get("easy"), 500);
    JSONObject bad = saved(malformed).put("claimedDifficultyBonuses", new JSONArray().put("extreme")); malformed.p.seed(bad.toString());
    RewardStore protectedStore = new RewardStore(malformed);
    rejects(() -> protectedStore.reconcileDifficultyBonuses(groups), "unsupported persisted category cannot silently reset the protected wallet");
    check(bad.toString().equals(malformed.p.memory.get("ledger_v1")), "invalid saved history is retained byte-for-byte for recovery");
    Ctx overflow = seeded(allMaps(), Integer.MAX_VALUE - 2000); RewardStore full = new RewardStore(overflow);
    rejects(() -> full.reconcileDifficultyBonuses(groups), "backfill overflow cannot wrap crystal balance");
    check(full.balance() == Integer.MAX_VALUE - 2000 && saved(overflow).getJSONArray("claimedDifficultyBonuses").length() == 0,
        "overflow restores every unclaimed category and original balance atomically");
  }

  private static void concurrentFinishAndHome() throws Exception {
    Set<String> partial = new LinkedHashSet<>(groups.get("easy")); String last = partial.iterator().next(); partial.remove(last);
    Ctx context = seeded(partial, 500); RewardStore store = new RewardStore(context);
    store.begin("racing", last); store.applied("racing");
    CountDownLatch gate = new CountDownLatch(1); AtomicReference<Throwable> error = new AtomicReference<>();
    Thread finish = new Thread(() -> { try { gate.await(); store.finish("racing", true, "easy", rounds.get(last), true, groups.get("easy")); }
      catch (Throwable failure) { error.compareAndSet(null, failure); } });
    Thread home = new Thread(() -> { try { gate.await(); for (int i = 0; i < 20; i++) store.reconcileDifficultyBonuses(groups); }
      catch (Throwable failure) { error.compareAndSet(null, failure); } });
    finish.start(); home.start(); gate.countDown(); finish.join(); home.join();
    check(error.get() == null && store.balance() == 1610 && store.completedMaps().contains(last)
        && saved(context).getJSONArray("claimedDifficultyBonuses").length() == 1,
        "racing final-win and repeated Home reconciliation persist exactly one1000 category bonus");
  }

  private static final class Ctx extends Context {
    final MemoryPreferences p = new MemoryPreferences();
    public SharedPreferences getSharedPreferences(String name, int mode) { return p; }
    Ctx restart() { Ctx c = new Ctx(); c.p.memory.putAll(p.durable); c.p.durable.putAll(p.durable); return c; }
  }
  private static final class MemoryPreferences implements SharedPreferences {
    final Map<String, String> memory = new LinkedHashMap<>(), durable = new LinkedHashMap<>(); int failNext;
    void seed(String value) { memory.put("ledger_v1", value); durable.put("ledger_v1", value); }
    public String getString(String key, String fallback) { return memory.getOrDefault(key, fallback); }
    public Editor edit() { return new Editor() {
      final Map<String, String> changes = new LinkedHashMap<>();
      public Editor putString(String key, String value) { changes.put(key, value); return this; }
      public boolean commit() { memory.putAll(changes); if (failNext > 0) { failNext--; return false; }
        durable.clear(); durable.putAll(memory); return true; }
    }; }
  }
}
