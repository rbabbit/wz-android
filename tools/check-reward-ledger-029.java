package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual wallet policy; simulated Android I/O is explicit, no SDK events fabricated. */
final class RewardLedgerCheck029 {
  private static int checks;
  private static void check(boolean value, String name) {
    if (!value) throw new AssertionError(name);
    checks++; System.out.println("PASS " + name);
  }
  private static void rejects(Runnable action, String name) {
    try { action.run(); } catch (RuntimeException expected) {
      checks++; System.out.println("PASS " + name); return;
    }
    throw new AssertionError(name);
  }
  private static JSONObject saved(Ctx context) { return new JSONObject(context.p.memory.get("ledger_v1")); }
  private static String quote(String session, String transaction) {
    return new JSONObject().put("session", session).put("applied", true)
        .put("remaining", new JSONObject().put("ripple", 5))
        .put("transactions", new JSONArray().put(transaction))
        .put("pendingTransactions", new JSONArray()).toString();
  }
  private static String wave(String session) {
    return new JSONObject().put("wave", 1).put("completedWaves", new JSONArray().put(1))
        .put("rewards", new JSONObject().put("session", session).put("applied", true)
            .put("remaining", new JSONObject())).toString();
  }

  public static void main(String[] args) throws Exception {
    // Retain the accepted wallet regression checks alongside the focused additions.
    RewardLedgerCheck028.main(args);
    ordinaryCredits();
    persistenceAndRollback();
    purchasesAndWaves();
    simultaneousCallbacks();
    System.out.println("RESULT " + checks + " ad-wallet checks passed; earlier200 wallet checks also passed; emulatorUsed=false; host preferences I/O simulated");
  }

  private static void ordinaryCredits() {
    Ctx context = new Ctx(); RewardStore store = new RewardStore(context);
    check(store.pendingAdReward().isEmpty() && store.balance() == 350, "new wallet has no inferred earned ad");
    int commits = context.p.commits;
    check(store.creditAdReward(null) == 0 && store.creditAdReward("") == 0
        && store.creditAdReward("unknown") == 0 && store.balance() == 350, "missing or unknown callback cannot mint crystals");
    store.cancelAdReward(null); store.cancelAdReward(""); store.cancelAdReward("unknown");
    check(context.p.commits == commits, "unknown callback and cancellation do not write wallet");
    String token = store.prepareAdReward();
    check(RewardLedger.validAdRewardToken(token) && token.equals(store.pendingAdReward())
        && token.equals(saved(context).getString("pendingAdReward")), "single SDK presentation identity persists before show");
    check(store.balance() == 350, "preparing or showing an ad does not award anything");
    rejects(store::prepareAdReward, "a second presentation cannot replace unresolved earned or showing identity");
    store.cancelAdReward("old-identity");
    check(token.equals(store.pendingAdReward()) && store.creditAdReward("old-identity") == 0,
        "old cancellation and callback cannot alter newer pending presentation");
    check(store.creditAdReward(token) == 10 && store.balance() == 360 && store.pendingAdReward().isEmpty(),
        "one earned native callback credits fixed ten and clears identity atomically");
    commits = context.p.commits;
    check(store.creditAdReward(token) == 0 && context.p.commits == commits && store.balance() == 360,
        "duplicate callback is a durable no-op without another commit");
    String next = store.prepareAdReward();
    check(!token.equals(next) && store.creditAdReward(token) == 0 && next.equals(store.pendingAdReward()),
        "late prior callback cannot credit or consume later presentation");
    store.cancelAdReward(token);
    check(next.equals(store.pendingAdReward()), "late prior dismissal cannot cancel later presentation");
    store.cancelAdReward(next);
    check(store.pendingAdReward().isEmpty() && store.balance() == 360,
        "confirmed unearned dismissal cancels exact identity without payment");
    check(store.creditAdReward(next) == 0 && store.balance() == 360,
        "callback for cancelled presentation cannot pay after dismissal");
    String third = store.prepareAdReward();
    check(store.creditAdReward(third) == 10 && store.balance() == 370, "subsequent separately earned ad pays exactly another ten");
  }

  private static void persistenceAndRollback() {
    Ctx context = new Ctx(); RewardStore store = new RewardStore(context);
    store.buy("ripple", 5);
    JSONObject legacy = saved(context); legacy.remove("pendingAdReward"); legacy.put("balance", 123);
    context.p.seed(legacy.toString());
    RewardStore upgraded = new RewardStore(context.restart());
    check(upgraded.balance() == 123 && upgraded.inventory().get("ripple") == 5
        && upgraded.loadout().get("ripple") == 5 && upgraded.pendingAdReward().isEmpty(),
        "v0.28 schema3 wallet upgrades without resetting balance stock or loadout");

    Ctx pendingContext = new Ctx(); RewardStore pending = new RewardStore(pendingContext);
    String pendingToken = pending.prepareAdReward();
    Ctx restartedContext = pendingContext.restart(); RewardStore restarted = new RewardStore(restartedContext);
    check(restarted.balance() == 350 && pendingToken.equals(restarted.pendingAdReward()),
        "process restart preserves unproven attempt but never assumes it earned crystals");
    restarted.cancelAdReward(restarted.pendingAdReward()); String fresh = restarted.prepareAdReward();
    check(restarted.creditAdReward(pendingToken) == 0 && fresh.equals(restarted.pendingAdReward()),
        "controller can abandon unproven old-process attempt before next ad without late grant");
    restarted.creditAdReward(fresh);
    RewardStore creditedRestart = new RewardStore(restartedContext.restart());
    check(creditedRestart.balance() == 360 && creditedRestart.pendingAdReward().isEmpty()
        && creditedRestart.creditAdReward(fresh) == 0, "credited balance and duplicate suppression survive process restart");

    Ctx disk = new Ctx(); RewardStore rollback = new RewardStore(disk);
    disk.p.failNext = 1;
    rejects(rollback::prepareAdReward, "failed attempt persistence prevents ad presentation identity from escaping");
    check(rollback.balance() == 350 && rollback.pendingAdReward().isEmpty()
        && saved(disk).getString("pendingAdReward").isEmpty(), "failed preparation rolls back durable wallet and token");
    String token = rollback.prepareAdReward(); disk.p.failNext = 1;
    rejects(() -> rollback.creditAdReward(token), "failed earned credit persistence reports failure instead of claiming reward saved");
    check(rollback.balance() == 350 && token.equals(rollback.pendingAdReward())
        && new JSONObject(disk.p.durable.get("ledger_v1")).getInt("balance") == 350,
        "failed earned credit restores original balance and retryable token in memory and durable record");
    check(rollback.creditAdReward(token) == 10 && rollback.balance() == 360 && rollback.creditAdReward(token) == 0,
        "same retained earned proof retries once after transient write failure");
    RewardStore durable = new RewardStore(disk.restart());
    check(durable.balance() == 360 && durable.creditAdReward(token) == 0, "successful retry stays paid once after restart");
    String cancel = rollback.prepareAdReward(); disk.p.failNext = 1;
    rejects(() -> rollback.cancelAdReward(cancel), "failed cancellation retains unresolved attempt instead of allowing overlapping ad");
    check(cancel.equals(rollback.pendingAdReward()) && rollback.balance() == 360,
        "failed cancellation cannot alter earned balance or lose presentation identity");
    rollback.cancelAdReward(cancel);
    check(rollback.pendingAdReward().isEmpty() && rollback.balance() == 360,
        "retry confirmed-unearned cancellation releases identity without crystals");

    Ctx malformed = new Ctx(); new RewardStore(malformed);
    JSONObject bad = saved(malformed).put("pendingAdReward", 10); malformed.p.seed(bad.toString());
    RewardStore broken = new RewardStore(malformed);
    rejects(broken::prepareAdReward, "malformed stored ad identity cannot reset or overwrite protected wallet");
    check(broken.balance() == 0 && bad.toString().equals(malformed.p.memory.get("ledger_v1")),
        "unreadable record remains intact for recovery and cannot mint a new starter gift");
    Ctx overflow = new Ctx(); RewardStore full = new RewardStore(overflow); String fullToken = full.prepareAdReward();
    overflow.p.seed(saved(overflow).put("balance", Integer.MAX_VALUE - 5).toString());
    RewardStore fullRestart = new RewardStore(overflow);
    rejects(() -> fullRestart.creditAdReward(fullToken), "overflow cannot wrap crystal balance negative");
    check(fullRestart.balance() == Integer.MAX_VALUE - 5 && fullToken.equals(fullRestart.pendingAdReward()),
        "overflow leaves unchanged wallet and unresolved earned proof for recovery");
  }

  private static void purchasesAndWaves() {
    Ctx context = new Ctx(); RewardStore store = new RewardStore(context);
    store.begin("live", "map"); store.applied("live");
    String token = store.prepareAdReward();
    String purchase = new JSONObject(store.reserveLive("live", "ripple", 5)).getString("transactionId");
    check(store.balance() == 300 && token.equals(store.pendingAdReward()), "live purchase reservation does not discard pending ad identity");
    check(store.progress("live", wave("live"), 15) == 5 && store.balance() == 305,
        "genuine wave credits remain independent while an ad attempt is pending");
    check(store.creditAdReward(token) == 10 && store.balance() == 315 && store.pendingLive("live").length() == 1,
        "earned ad adds ten without settling uncertain native purchase");
    check(store.completeLive("live", purchase, quote("live", purchase)) && store.balance() == 315
        && store.active("live").get("ripple") == 5, "native purchase acknowledgement retains ad credits and ordinary building allowance");
    check(new JSONObject(store.config("live")).getInt("balance") == 315, "normal native header config immediately exposes updated crystal balance");
    check(store.creditAdReward(token) == 0 && store.completeLive("live", purchase, quote("live", purchase))
        && store.balance() == 315, "duplicate ad and native purchase callbacks cannot change either charge or grant");
    String next = store.prepareAdReward();
    store.finish("live", false, "easy", 15, true);
    check(next.equals(store.pendingAdReward()) && store.creditAdReward(next) == 10 && store.balance() == 325,
        "global earned ad remains payable after match finish independently of map and drawer lifetime");
    check(store.inventory().get("ripple") == 5 && store.loadout().get("ripple") == 5,
        "ad credits do not modify unused building returns or next-match loadout");
  }

  private static void simultaneousCallbacks() throws Exception {
    Ctx context = new Ctx(); RewardStore store = new RewardStore(context); String token = store.prepareAdReward();
    CountDownLatch start = new CountDownLatch(1); AtomicInteger credited = new AtomicInteger();
    AtomicReference<Throwable> failure = new AtomicReference<>();
    Runnable callback = () -> { try {
      start.await(); for (int i = 0; i < 100; i++) credited.addAndGet(store.creditAdReward(token));
    } catch (Throwable error) { failure.compareAndSet(null, error); } };
    Thread one = new Thread(callback), two = new Thread(callback); one.start(); two.start(); start.countDown(); one.join(); two.join();
    check(failure.get() == null && credited.get() == 10 && store.balance() == 360 && store.pendingAdReward().isEmpty(),
        "two racing callback threads repeated one hundred times still persist exactly one ten-crystal grant");
    check(new RewardStore(context.restart()).balance() == 360, "racing duplicate callback result is durable after restart");
  }

  private static final class Ctx extends Context {
    final MemoryPreferences p = new MemoryPreferences();
    public SharedPreferences getSharedPreferences(String name, int mode) { return p; }
    Ctx restart() { Ctx c = new Ctx(); c.p.memory.putAll(p.durable); c.p.durable.putAll(p.durable); return c; }
  }
  private static final class MemoryPreferences implements SharedPreferences {
    final Map<String, String> memory = new LinkedHashMap<>(), durable = new LinkedHashMap<>(); int failNext, commits;
    void seed(String value) { memory.put("ledger_v1", value); durable.put("ledger_v1", value); }
    public String getString(String key, String fallback) { return memory.getOrDefault(key, fallback); }
    public Editor edit() { return new Editor() {
      final Map<String, String> changes = new LinkedHashMap<>();
      public Editor putString(String key, String value) { changes.put(key, value); return this; }
      public boolean commit() { commits++; memory.putAll(changes); if (failNext > 0) { failNext--; return false; }
        durable.clear(); durable.putAll(memory); return true; }
    }; }
  }
}
