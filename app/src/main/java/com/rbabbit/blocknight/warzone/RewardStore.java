package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** One atomic private record stores wallet, portable stock, loadout and receipts. */
final class RewardStore {
  private static final String KEY = "ledger_v1";
  private final SharedPreferences preferences;
  private RewardLedger ledger;
  private boolean readable = true;

  RewardStore(Context context) {
    preferences = context.getSharedPreferences("towers_rewards", Context.MODE_PRIVATE);
    String saved = preferences.getString(KEY, null);
    try {
      ledger = saved == null ? new RewardLedger() : decode(saved);
      if (saved == null && !preferences.edit().putString(KEY, encode(ledger)).commit()) throw new IllegalStateException("Wallet could not be saved.");
      transaction(() -> { ledger.recoverInterrupted(); return null; });
    } catch (Exception error) { readable = false; ledger = new RewardLedger(); ledger.balance = 0; }
  }

  synchronized int balance() { return ledger.balance; }
  synchronized int clearedWave(String session) {
    RewardLedger.Run run = ledger.runs.get(session);
    int highest = 0;
    if (run != null) for (int wave : run.clearedWaves) highest = Math.max(highest, wave);
    return highest;
  }
  synchronized JSONArray clearedWaves(String session) {
    JSONArray waves = new JSONArray();
    RewardLedger.Run run = ledger.runs.get(session);
    if (run != null) for (int wave : run.clearedWaves) waves.put(wave);
    return waves;
  }
  synchronized Set<String> completedMaps() {
    return Collections.unmodifiableSet(new LinkedHashSet<>(ledger.completed));
  }
  synchronized int reconcileDifficultyBonuses(Map<String, Set<String>> actualCatalogGroups) {
    if (actualCatalogGroups == null) throw new IllegalArgumentException("Missing difficulty map catalog.");
    Map<String, Set<String>> groups = new LinkedHashMap<>();
    for (Map.Entry<String, Set<String>> group : actualCatalogGroups.entrySet()) {
      if (group.getValue() == null) throw new IllegalArgumentException("Missing difficulty map identities.");
      groups.put(group.getKey(), Collections.unmodifiableSet(new LinkedHashSet<>(group.getValue())));
    }
    return transaction(() -> ledger.reconcileDifficultyBonuses(groups));
  }
  synchronized Map<String, Integer> inventory() { return RewardLedger.copy(ledger.inventory); }
  synchronized Map<String, Integer> loadout() { return loadout("towers"); }
  synchronized Map<String,Integer> loadout(String profile) { return RewardLedger.copy(ledger.loadout(profile)); }
  synchronized Map<String, Integer> active(String session) {
    RewardLedger.Run run = ledger.runs.get(session);
    if (run == null || run.settled || run.suspended) return Collections.emptyMap();
    Map<String, Integer> result = new LinkedHashMap<>();
    for (String id : run.items.keySet()) {
      int count = RewardCatalog.get(id).consumedOnApply() ? run.items.get(id) : RewardLedger.count(run.remaining, id);
      result.put(id, count);
    }
    return RewardLedger.copy(result);
  }
  synchronized void buy(String id,int quantity) { buy(id,quantity,"towers","home"); }
  synchronized void buy(String id,int quantity,String profile,String map) { transaction(() -> { ledger.buy(id,quantity,profile,map);return null; }); }
  synchronized void equip(String id,int quantity) { equip(id,quantity,"towers","home"); }
  synchronized void equip(String id,int quantity,String profile,String map) { transaction(() -> { ledger.equip(id,quantity,profile,map);return null; }); }
  synchronized void begin(String session,String map) { begin(session,map,"towers"); }
  synchronized void begin(String session,String map,String profile) { transaction(() -> { ledger.begin(session,map,profile);return null; }); }
  synchronized void pinRun(String session) { transaction(() -> { ledger.pinRun(session); return null; }); }
  synchronized void unpinRun(String session) { transaction(() -> { ledger.unpinRun(session); return null; }); }
  /** Snapshot used to recover a file deletion interrupted before its wallet unpin. */
  synchronized JSONArray pinnedRuns() {
    JSONArray result = new JSONArray();
    for (RewardLedger.Run run : ledger.runs.values()) if (run.pinned) result.put(run.session);
    return result;
  }
  synchronized void resumeRun(String session,String map) { resumeRun(session,map,"towers"); }
  synchronized void resumeRun(String session,String map,String profile) { transaction(() -> { ledger.resumeRun(session,map,profile);return null; }); }
  synchronized void applied(String session) {
    RewardLedger.Run run = ledger.runs.get(session);
    if (run != null && run.applied) return;
    transaction(() -> { ledger.applied(session); return null; });
  }

  synchronized int progress(String session, String packet, int total) {
    RewardLedger.Run run = ledger.runs.get(session);
    if (run == null || run.settled || run.suspended) return 0;
    // Initial packets from an older save must not shrink current phone caps
    // before resume-rewards has reconciled the native world with those caps.
    if (run.awaitingResumeInventory) return 0;
    try {
      JSONObject data = new JSONObject(packet);
      JSONObject nativeRewards = data.optJSONObject("rewards");
      if (nativeRewards == null || !session.equals(nativeRewards.optString("session")) || !nativeRewards.optBoolean("applied")) return 0;
      requireCurrentInventory(run, nativeRewards);
      Set<Integer> cleared = new LinkedHashSet<>();
      JSONArray waves = data.optJSONArray("completedWaves");
      if (waves != null) for (int i = 0; i < waves.length(); i++) cleared.add(waves.getInt(i));
      JSONObject remainingObject = nativeRewards.optJSONObject("remaining");
      if (remainingObject == null) throw new IllegalArgumentException("Missing native reward inventory.");
      Map<String, Integer> remaining = readCounts(remainingObject);
      int wave = data.optInt("wave", run.wave);
      boolean reconciliation = false;
      for (RewardLedger.LiveTx tx : run.transactions.values())
        if ("pending".equals(tx.status) && journalHas(nativeRewards.opt("transactions"), tx.id)) reconciliation = true;
      if (!reconciliation) validateRemaining(run, remaining);
      boolean changed = wave > run.wave || !run.clearedWaves.containsAll(cleared);
      for (String id : remaining.keySet()) if (remaining.get(id) < RewardLedger.count(run.remaining, id)) changed = true;
      if (!changed && !reconciliation) return 0;
      return transaction(() -> {
        reconcileApplied(run, nativeRewards, remaining);
        validateRemaining(run, remaining);
        return ledger.progress(session, wave, total, cleared, remaining);
      });
    } catch (Exception error) { throw new IllegalStateException("Reward progress could not be saved.", error); }
  }
  synchronized RewardLedger.Receipt finish(String session, boolean won, String difficulty, int total) {
    return finish(session, won, difficulty, total, false);
  }
  synchronized RewardLedger.Receipt finish(String session, boolean won, String difficulty, int total, boolean authoritativeRemaining) {
    return transaction(() -> ledger.finish(session, won, difficulty, total, authoritativeRemaining));
  }
  synchronized RewardLedger.Receipt finishChallenge(String session, boolean won, String difficulty, boolean authoritativeRemaining) {
    return transaction(() -> ledger.finishChallenge(session, won, difficulty, authoritativeRemaining));
  }
  synchronized RewardLedger.Receipt finishCrystalSkirmish(String session, boolean won) {
    return transaction(() -> ledger.finishCrystalSkirmish(session, won, LocalDate.now().toString()));
  }
  synchronized boolean wonCrystalSkirmishToday() {
    return ledger.crystalWinDays.contains(LocalDate.now().toString());
  }
  synchronized RewardLedger.Receipt finish(String session, boolean won, String difficulty, int total,
      boolean authoritativeRemaining, Set<String> requiredDifficultyMapIds) {
    if (requiredDifficultyMapIds == null) throw new IllegalArgumentException("Missing difficulty map catalog.");
    Set<String> required = Collections.unmodifiableSet(new LinkedHashSet<>(requiredDifficultyMapIds));
    return transaction(() -> ledger.finish(session, won, difficulty, total, authoritativeRemaining, required));
  }
  synchronized void abandon(String session, boolean authoritative) {
    RewardLedger.Run run = ledger.runs.get(session);
    if (run != null && !run.settled && !run.suspended) transaction(() -> { ledger.abandon(session, authoritative); return null; });
  }
  synchronized String config(String session) {
    JSONObject result = new JSONObject();
    try {
      RewardLedger.Run run = ledger.runs.get(session);
      if (run == null || run.settled || run.suspended) return "{}";
      JSONObject items = new JSONObject();
      for (String id : run.baseItems.keySet()) if (RewardCatalog.get(id).inNativeItems()) items.put(id, run.baseItems.get(id));
      result.put("session", session).put("profile",run.profile).put("map",run.map).put("items", items).put("research", RewardLedger.count(run.baseItems, "research") > 0)
          .put("supply", RewardLedger.count(run.baseItems, "supply") > 0).put("balance", balance())
          .put("pendingTransactions", pendingLive(session));
      return result.toString();
    } catch (Exception error) { throw new IllegalStateException(error); }
  }

  synchronized String reserveLive(String session, String id, int quantity) {
    return transaction(() -> liveConfig(ledger.runs.get(session),
        ledger.reserveLive(session, "live-" + java.util.UUID.randomUUID(), id, quantity)).toString());
  }

  /** A native applied transaction journal is proof; timeout/generic errors are not refunds. */
  synchronized boolean completeLive(String session, String transactionId, String replyJSON) {
    try {
      RewardLedger.Run run = ledger.runs.get(session);
      RewardLedger.LiveTx tx = run == null ? null : run.transactions.get(transactionId);
      if (tx == null) throw new IllegalArgumentException("Unknown purchase.");
      if ("applied".equals(tx.status)) return true;
      if ("rejected".equals(tx.status)) return false;
      JSONObject quote = new JSONObject(replyJSON);
      if (!session.equals(quote.optString("session"))) return false;
      requireQuoteContext(run,quote);
      if (journalHas(quote.opt("transactions"), transactionId)) {
        requireCurrentInventory(run, quote);
        Map<String, Integer> remaining = readCounts(quote.getJSONObject("remaining"));
        return transaction(() -> {
          reconcileApplied(run, quote, remaining);
          if (run.awaitingResumeInventory) validatePartialRemaining(run, remaining);
          else validateRemaining(run, remaining);
          return "applied".equals(tx.status);
        });
      }
      if (journalHas(quote.opt("pendingTransactions"), transactionId)) return false;
      if (quote.optBoolean("rejected") && quote.has("transactionApplied") && !quote.optBoolean("transactionApplied")
          && quote.has("transactionPending") && !quote.optBoolean("transactionPending")
          && transactionId.equals(quote.optString("transactionId")))
        transaction(() -> { ledger.rejectLive(session, transactionId); return null; });
      return false;
    } catch (RuntimeException error) { throw error; }
    catch (Exception error) { throw new IllegalArgumentException("The native purchase reply could not be verified.", error); }
  }

  synchronized JSONArray pendingLive(String session) {
    JSONArray result = new JSONArray();
    RewardLedger.Run run = ledger.runs.get(session);
    if (run != null) for (RewardLedger.LiveTx tx : run.transactions.values())
      if ("pending".equals(tx.status)) result.put(liveConfig(run, tx));
    return result;
  }

  synchronized JSONObject resumeCaps(String session) {
    RewardLedger.Run run = ledger.runs.get(session);
    if (run == null) throw new IllegalArgumentException("This saved match's wallet record is no longer available.");
    try {
      JSONObject items = new JSONObject(), remaining = new JSONObject();
      for (String id : run.items.keySet()) if (RewardCatalog.get(id).inNativeItems()) {
        items.put(id, run.items.get(id)); remaining.put(id, RewardLedger.count(run.remaining, id));
      }
      return new JSONObject().put("session", session).put("profile",run.profile).put("map",run.map).put("items", items).put("remaining", remaining)
          .put("research", RewardLedger.count(run.items, "research") > 0)
          .put("supply", RewardLedger.count(run.items, "supply") > 0)
          .put("pendingTransactions", pendingLive(session));
    } catch (Exception error) { throw new IllegalStateException(error); }
  }

  /** Accept only the fresh, full native quote validated by the load bridge. */
  synchronized boolean confirmResumeInventory(String session, String quoteJSON) {
    try {
      RewardLedger.Run run = ledger.runs.get(session);
      if (run == null || run.settled || run.suspended) return false;
      JSONObject quote = new JSONObject(quoteJSON);
      if (!session.equals(quote.optString("session")) || !quote.optBoolean("applied")) return false;
      requireCurrentInventory(run, quote);
      Map<String, Integer> remaining = readCounts(quote.getJSONObject("remaining"));
      validateRemaining(run, remaining);
      if (!run.awaitingResumeInventory) return true;
      return transaction(() -> { ledger.confirmResumeInventory(session, remaining); return true; });
    } catch (RuntimeException error) { throw error; }
    catch (Exception error) { throw new IllegalArgumentException("The resumed purchase inventory could not be verified.", error); }
  }

  private static JSONObject liveConfig(RewardLedger.Run run, RewardLedger.LiveTx tx) {
    try {
      JSONObject items = new JSONObject();
      if (RewardCatalog.get(tx.itemId).inNativeItems()) items.put(tx.itemId, tx.quantity);
      return new JSONObject().put("session", run.session).put("profile",run.profile).put("map",run.map).put("transactionId", tx.id).put("items", items)
          .put("research", "research".equals(tx.itemId)).put("supply", "supply".equals(tx.itemId));
    } catch (Exception error) { throw new IllegalStateException(error); }
  }

  private void reconcileApplied(RewardLedger.Run run, JSONObject quote, Map<String, Integer> remaining) {
    for (RewardLedger.LiveTx tx : run.transactions.values())
      if ("pending".equals(tx.status) && journalHas(quote.opt("transactions"), tx.id)) {
        Map<String, Integer> observation = remaining;
        if (run.awaitingResumeInventory) {
          // An old saved world can omit confirmed purchases made after it.
          // Settle only this proven transaction now; full native allowances
          // become authoritative after resume-rewards and its verified quote.
          Map<String, Integer> projected = new LinkedHashMap<>(run.items);
          projected.put(tx.itemId, RewardLedger.count(projected, tx.itemId) + tx.quantity);
          validatePartialRemaining(projected, remaining);
          if (RewardCatalog.get(tx.itemId).inNativeItems() && !remaining.containsKey(tx.itemId))
            throw new IllegalArgumentException("Missing resumed purchase inventory.");
          observation = new LinkedHashMap<>();
          for (String id : projected.keySet()) if (RewardCatalog.get(id).inNativeItems())
            observation.put(id, RewardLedger.count(run.remaining, id) + (id.equals(tx.itemId) ? tx.quantity : 0));
        }
        ledger.commitLive(run.session, tx.id, observation);
      }
  }

  private static void validateRemaining(RewardLedger.Run run, Map<String, Integer> remaining) {
    Set<String> expected = new LinkedHashSet<>();
    for (String id : run.items.keySet()) if (RewardCatalog.get(id).inNativeItems()) expected.add(id);
    if (!remaining.keySet().equals(expected)) throw new IllegalArgumentException("Incomplete native reward inventory.");
    for (String id : remaining.keySet()) if (remaining.get(id) > RewardLedger.count(run.items, id))
      throw new IllegalArgumentException("Invalid native reward quantity.");
  }

  private static void validatePartialRemaining(RewardLedger.Run run, Map<String, Integer> remaining) {
    validatePartialRemaining(run.items, remaining);
  }

  private static void validatePartialRemaining(Map<String, Integer> items, Map<String, Integer> remaining) {
    for (String id : remaining.keySet())
      if (!items.containsKey(id) || !RewardCatalog.get(id).inNativeItems()
          || remaining.get(id) > RewardLedger.count(items, id))
        throw new IllegalArgumentException("Invalid partial resumed purchase inventory.");
  }

  private static void requireQuoteContext(RewardLedger.Run run,JSONObject quote) {
    boolean strict="survival".equals(run.profile) || "challenge".equals(run.profile);
    for(String id:run.items.keySet())strict|=RewardCatalog.get(id).moreFortress;
    for(RewardLedger.LiveTx tx:run.transactions.values())if("pending".equals(tx.status))strict|=RewardCatalog.get(tx.itemId).moreFortress;
    if((strict||quote.has("profile")||quote.has("map"))&&(!run.profile.equals(quote.optString("profile"))||!run.map.equals(quote.optString("map"))))
      throw new IllegalArgumentException("This purchase belongs to another match profile or map.");
  }

  private static void requireCurrentInventory(RewardLedger.Run run, JSONObject quote) {
    requireQuoteContext(run,quote);
    if (!run.inventoryPurchaseFloor.isEmpty()
        && !journalHas(quote.opt("transactions"), run.inventoryPurchaseFloor))
      throw new IllegalArgumentException("The native inventory predates the latest purchase.");
  }

  private static boolean journalHas(Object journal, String transactionId) {
    if (journal == null || journal == JSONObject.NULL) return false;
    if (!(journal instanceof JSONArray)) throw new IllegalArgumentException("Invalid native purchase journal.");
    JSONArray array = (JSONArray) journal;
    for (int i = 0; i < array.length(); i++) {
      Object value = array.opt(i);
      if (!(value instanceof String)) throw new IllegalArgumentException("Invalid native purchase identity.");
      if (transactionId.equals(value)) return true;
    }
    return false;
  }

  private <T> T transaction(Supplier<T> mutation) {
    if (!readable) throw new IllegalStateException("The wallet could not be read. Your saved wallet has been kept.");
    String before = encode(ledger);
    try {
      T result = mutation.get();
      if (!preferences.edit().putString(KEY, encode(ledger)).commit()) throw new IllegalStateException("The wallet could not be saved. Please try again.");
      return result;
    } catch (RuntimeException error) {
      ledger = decode(before);
      try { if (!preferences.edit().putString(KEY, before).commit()) readable = false; }
      catch (RuntimeException rollbackError) { readable = false; error.addSuppressed(rollbackError); }
      throw error;
    }
  }

  private static String encode(RewardLedger value) {
    try {
      JSONObject root = new JSONObject().put("version", 6).put("balance", value.balance)
          .put("crystalWinDays", new JSONArray(value.crystalWinDays))
          .put("lastCrystalMatch", value.lastCrystalMatch)
          .put("inventory", new JSONObject(value.inventory)).put("loadout", new JSONObject(value.loadout))
          .put("survivalLoadout",new JSONObject(value.survivalLoadout))
          .put("challengeLoadout",new JSONObject(value.challengeLoadout))
          .put("completed", new JSONArray(value.completed))
          .put("claimedDifficultyBonuses", new JSONArray(value.claimedDifficultyBonuses));
      JSONArray runs = new JSONArray();
      for (RewardLedger.Run run : value.runs.values()) {
        JSONObject item = new JSONObject().put("session", run.session).put("map", run.map).put("profile",run.profile)
            .put("baseItems", new JSONObject(run.baseItems)).put("items", new JSONObject(run.items))
            .put("remaining", new JSONObject(run.remaining)).put("refunded", new JSONObject(run.refunded))
            .put("clearedWaves", new JSONArray(run.clearedWaves)).put("waveCredits", run.waveCredits)
            .put("applied", run.applied).put("settled", run.settled).put("suspended", run.suspended)
            .put("pinned", run.pinned).put("winPaid", run.winPaid).put("returnAllowed", run.returnAllowed)
            .put("inventoryPurchaseFloor", run.inventoryPurchaseFloor).put("awaitingResumeInventory", run.awaitingResumeInventory)
            .put("completionCredits", run.completionCredits).put("difficultyCredits", run.difficultyCredits)
            .put("wave", run.wave);
        JSONArray transactions = new JSONArray();
        for (RewardLedger.LiveTx tx : run.transactions.values()) transactions.put(new JSONObject()
            .put("id", tx.id).put("itemId", tx.itemId).put("quantity", tx.quantity).put("cost", tx.cost).put("status", tx.status));
        item.put("transactions", transactions);
        if (run.receipt != null) {
          RewardLedger.Receipt r = run.receipt;
          item.put("receipt", new JSONObject().put("won", r.won).put("map", r.map).put("wave", r.wave)
              .put("total", r.total).put("earned", r.earned).put("balance", r.balance).put("reason", r.reason));
        }
        runs.put(item);
      }
      return root.put("runs", runs).toString();
    } catch (Exception error) { throw new IllegalStateException("Wallet encoding failed.", error); }
  }

  private static Map<String, Integer> readCounts(JSONObject data) throws Exception {
    Map<String, Integer> values = new LinkedHashMap<>();
    if (data == null) return values;
    for (Iterator<String> it = data.keys(); it.hasNext();) {
      String id = it.next(); RewardCatalog.get(id);
      int count = data.getInt(id);
      if (count < 0 || count > 100000) throw new IllegalArgumentException("Invalid inventory quantity.");
      values.put(id, count);
    }
    return values;
  }

  private static void migrateItems(RewardLedger value, JSONArray boosts) throws Exception {
    if (boosts == null) return;
    for (int i = 0; i < boosts.length(); i++) {
      String id = boosts.getString(i); RewardCatalog.get(id);
      value.inventory.put(id, RewardLedger.count(value.inventory, id) + 1);
    }
  }

  static void validateBackup(String saved) { decode(saved); }

  private static RewardLedger decode(String saved) {
    try {
      JSONObject root = new JSONObject(saved);
      int version = root.getInt("version");
      if (version != 1 && version != 2 && version != 3 && version != 4 && version != 5 && version != 6) throw new IllegalArgumentException("Unsupported wallet version.");
      RewardLedger value = new RewardLedger();
      value.balance = root.getInt("balance");
      if (value.balance < 0) throw new IllegalArgumentException("Invalid wallet balance.");
      JSONArray crystalWinDays = root.optJSONArray("crystalWinDays");
      if (crystalWinDays != null) {
        for (int i = 0; i < crystalWinDays.length(); i++)
          value.crystalWinDays.add(LocalDate.parse(crystalWinDays.getString(i)).toString());
      }
      value.lastCrystalMatch = root.optString("lastCrystalMatch", "");
      // Legacy ad-attempt tokens are ignored; saved balances and wave claims remain intact.
      JSONArray completed = root.getJSONArray("completed");
      for (int i = 0; i < completed.length(); i++) value.completed.add(completed.getString(i));
      if (version >= 4) {
        JSONArray claimed = root.getJSONArray("claimedDifficultyBonuses");
        for (int i = 0; i < claimed.length(); i++) {
          String difficulty = claimed.getString(i);
          if (!RewardLedger.validDifficulty(difficulty) || !value.claimedDifficultyBonuses.add(difficulty))
            throw new IllegalArgumentException("Invalid saved difficulty completion history.");
        }
      }
      if (version == 1) {
        JSONObject pending = root.getJSONObject("pending");
        for (Iterator<String> it = pending.keys(); it.hasNext();) migrateItems(value, pending.getJSONArray(it.next()));
        JSONArray oldRuns = root.getJSONArray("runs");
        for (int i = 0; i < oldRuns.length(); i++) {
          JSONObject run = oldRuns.getJSONObject(i);
          if (!run.getBoolean("settled") && !run.getBoolean("applied")) migrateItems(value, run.getJSONArray("boosts"));
        }
        // Preserve legacy stock above today's cap; only new purchases are capped.
        for (String id : value.inventory.keySet()) {
          int take = Math.min(value.inventory.get(id), RewardCatalog.get(id).maxPerMatch);
          if (RewardCatalog.get(id).fortress) take = Math.min(take, 3 - RewardLedger.fortressCount(value.loadout));
          if (take > 0) value.loadout.put(id, take);
        }
        return value;
      }
      value.inventory.putAll(readCounts(root.getJSONObject("inventory")));
      value.loadout.putAll(readCounts(root.getJSONObject("loadout")));
      value.loadout.values().removeIf(quantity -> quantity == 0);
      if(version>=5)value.survivalLoadout.putAll(readCounts(root.getJSONObject("survivalLoadout")));
      if(version>=6)value.challengeLoadout.putAll(readCounts(root.getJSONObject("challengeLoadout")));
      if(version<5)for(String id:value.inventory.keySet())if(RewardCatalog.get(id).moreFortress)throw new IllegalArgumentException("New stock requires its current wallet version.");
      for (String id : value.loadout.keySet()) if (value.loadout.get(id) > RewardLedger.count(value.inventory, id)
          || value.loadout.get(id) > RewardCatalog.get(id).maxPerMatch) throw new IllegalArgumentException("Invalid next-match quantities.");
      if (RewardLedger.fortressCount(value.loadout) > 3) throw new IllegalArgumentException("Invalid fortress loadout.");
      for(Map<String,Integer> chosen:java.util.Arrays.asList(value.loadout,value.survivalLoadout,value.challengeLoadout)){
        chosen.values().removeIf(n->n==0);
        for(String id:chosen.keySet())if(chosen.get(id)>RewardLedger.count(value.inventory,id)||chosen.get(id)>RewardCatalog.get(id).maxPerMatch)throw new IllegalArgumentException("Invalid profile loadout.");
        if(RewardLedger.fortressCount(chosen)>3)throw new IllegalArgumentException("Invalid profile fortress loadout.");RewardCatalog.requireDependencies(chosen);
      }
      for(String id:value.challengeLoadout.keySet())RewardCatalog.requireEligible(RewardCatalog.get(id),"challenge","home");
      JSONArray runs = root.getJSONArray("runs");
      for (int i = 0; i < runs.length(); i++) {
        JSONObject item = runs.getJSONObject(i);
        Map<String, Integer> purchased = readCounts(item.getJSONObject("items"));
        Map<String, Integer> initial = version >= 3 ? readCounts(item.getJSONObject("baseItems")) : purchased;
        RewardLedger.Run run = new RewardLedger.Run(item.getString("session"), item.getString("map"),version>=5?item.getString("profile"):"towers", initial);
        if ("challenge".equals(run.profile) && (version < 6 || !ChallengeMapCatalog.isKnownId(run.map)))
          throw new IllegalArgumentException("Invalid saved Challenge identity.");
        if (run.session.isEmpty() || run.map.isEmpty() || value.runs.containsKey(run.session))
          throw new IllegalArgumentException("Invalid saved match identity.");
        run.items.clear(); run.items.putAll(purchased);
        RewardCatalog.requireDependencies(run.items);
        for(String id:run.items.keySet()){RewardCatalog.requireEligible(RewardCatalog.get(id),run.profile,run.map);if(version<5&&RewardCatalog.get(id).moreFortress)throw new IllegalArgumentException("New run stock requires current wallet version.");}
        for (String id : run.items.keySet()) if (run.items.get(id) < 1 || run.items.get(id) > RewardCatalog.get(id).maxPerMatch)
          throw new IllegalArgumentException("Invalid purchased match quantity.");
        for (String id : run.baseItems.keySet()) if (run.baseItems.get(id) > RewardLedger.count(run.items, id))
          throw new IllegalArgumentException("Invalid initial match purchase.");
        if (RewardLedger.fortressCount(run.items) > 3) throw new IllegalArgumentException("Invalid saved fortress purchase count.");
        run.remaining.clear();run.remaining.putAll(readCounts(item.getJSONObject("remaining")));
        for (String id : run.remaining.keySet()) if (!run.items.containsKey(id) || run.remaining.get(id) > RewardLedger.count(run.items, id)) throw new IllegalArgumentException("Invalid remaining purchase.");
        run.applied = item.getBoolean("applied");run.settled = item.getBoolean("settled");run.wave = item.getInt("wave");
        if (run.wave < 0) throw new IllegalArgumentException("Invalid saved wave.");
        run.waveCredits = item.getInt("waveCredits");
        JSONArray waves = item.getJSONArray("clearedWaves");
        for (int j = 0; j < waves.length(); j++) {
          int wave = waves.getInt(j);
          if (wave < 1) throw new IllegalArgumentException("Invalid cleared wave history.");
          run.clearedWaves.add(wave);
        }
        if (run.waveCredits != run.clearedWaves.size() * 5) throw new IllegalArgumentException("Invalid wave credit history.");
        JSONObject r = item.optJSONObject("receipt");
        if (r != null) run.receipt = new RewardLedger.Receipt(r.getBoolean("won"), r.getString("map"), r.getInt("wave"), r.getInt("total"), r.getInt("earned"), r.getInt("balance"), r.getString("reason"));
        if (version >= 3) {
          run.suspended = item.getBoolean("suspended"); run.pinned = item.getBoolean("pinned");
          run.winPaid = item.getBoolean("winPaid"); run.returnAllowed = item.getBoolean("returnAllowed");
          run.completionCredits = item.getInt("completionCredits");
          if (run.completionCredits < 0 || run.completionCredits > 150)
            throw new IllegalArgumentException("Invalid completion reward history.");
          if (version >= 4) {
            run.difficultyCredits = item.getInt("difficultyCredits");
            if (run.difficultyCredits != 0 && run.difficultyCredits != RewardLedger.DIFFICULTY_COMPLETION_CRYSTALS
                || run.difficultyCredits > 0 && (!run.winPaid || value.claimedDifficultyBonuses.isEmpty()))
              throw new IllegalArgumentException("Invalid saved difficulty completion reward.");
          }
          run.refunded.putAll(readCounts(item.getJSONObject("refunded")));
          for (String id : run.refunded.keySet()) if (!run.items.containsKey(id) || run.refunded.get(id) > run.items.get(id))
            throw new IllegalArgumentException("Invalid returned purchase history.");
          JSONArray transactions = item.getJSONArray("transactions");
          int pending = 0;
          for (int j = 0; j < transactions.length(); j++) {
            JSONObject entry = transactions.getJSONObject(j);
            String transactionId = entry.getString("id"), id = entry.getString("itemId"), status = entry.getString("status");
            int quantity = entry.getInt("quantity"), cost = entry.getInt("cost");
            RewardCatalog.Item type = RewardCatalog.get(id);
            if (transactionId.isEmpty() || run.transactions.containsKey(transactionId) || quantity < 1 || quantity > type.maxPerMatch
                || cost != Math.multiplyExact(type.price, quantity)
                || !("pending".equals(status) || "applied".equals(status) || "rejected".equals(status)))
              throw new IllegalArgumentException("Invalid saved purchase journal.");
            RewardLedger.LiveTx tx = new RewardLedger.LiveTx(transactionId, id, quantity, cost); tx.status = status;
            run.transactions.put(tx.id, tx); if ("pending".equals(status)) pending++;
          }
          if (pending > 1) throw new IllegalArgumentException("Invalid pending purchase count.");
          run.inventoryPurchaseFloor = item.optString("inventoryPurchaseFloor", "");
          run.awaitingResumeInventory = item.optBoolean("awaitingResumeInventory", false);
          RewardLedger.LiveTx floor = run.transactions.get(run.inventoryPurchaseFloor);
          if (!run.inventoryPurchaseFloor.isEmpty() && (floor == null || !"applied".equals(floor.status)))
            throw new IllegalArgumentException("Invalid native inventory purchase floor.");
        } else {
          if (run.receipt != null && run.receipt.won) {
            run.winPaid = true;
            run.completionCredits = Math.max(0, run.receipt.earned - run.waveCredits);
          }
          // v2 did not record returned stock. Treat a terminal run's unused
          // quantities as returned, then reclaim available bank stock on resume.
          if (run.settled) for (String id : run.items.keySet()) {
            int quantity = !run.applied ? run.items.get(id)
                : RewardCatalog.get(id).consumedOnApply() ? 0 : RewardLedger.count(run.remaining, id);
            if (quantity > 0) run.refunded.put(id, quantity);
          }
        }
        if ("challenge".equals(run.profile) && (run.wave != 0 || !run.clearedWaves.isEmpty() || run.waveCredits != 0
            || run.difficultyCredits != 0 || run.receipt != null && (run.receipt.wave != 0 || run.receipt.total != 0)))
          throw new IllegalArgumentException("Invalid Challenge reward history.");
        value.runs.put(run.session, run);
      }
      return value;
    } catch (Exception error) { throw new IllegalStateException("Saved wallet is unreadable.", error); }
  }
}
