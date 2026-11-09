package com.rbabbit.blocknight.warzone;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** Portable phone inventory and exactly-once crystal accounting; no Android APIs. */
final class RewardLedger {
  static final int STARTER_CRYSTALS = 350;
  static final int AD_REWARD_CRYSTALS = 10;
  int balance = STARTER_CRYSTALS;
  // One native SDK presentation at a time. Clearing the token and crediting
  // the wallet share a durable store transaction, so a callback cannot pay twice.
  String pendingAdReward = "";
  final Map<String, Integer> inventory = new LinkedHashMap<>();
  final Map<String, Integer> loadout = new LinkedHashMap<>();
  final Set<String> completed = new HashSet<>();
  final LinkedHashMap<String, Run> runs = new LinkedHashMap<>();

  static final class Run {
    final String session, map;
    final Map<String, Integer> baseItems;
    final Map<String, Integer> items = new LinkedHashMap<>();
    final Map<String, Integer> remaining = new LinkedHashMap<>();
    final Map<String, Integer> refunded = new LinkedHashMap<>();
    final LinkedHashMap<String, LiveTx> transactions = new LinkedHashMap<>();
    final Set<Integer> clearedWaves = new LinkedHashSet<>();
    boolean applied, settled, suspended, pinned, winPaid, returnAllowed, awaitingResumeInventory;
    String inventoryPurchaseFloor = "";
    int wave, waveCredits, completionCredits;
    Receipt receipt;
    Run(String session, String map, Map<String, Integer> items) {
      this.session = session; this.map = map;
      this.baseItems = Collections.unmodifiableMap(new LinkedHashMap<>(items));
      this.items.putAll(items);
      remaining.putAll(items);
    }
  }

  static final class LiveTx {
    final String id, itemId;
    final int quantity, cost;
    String status = "pending";
    LiveTx(String id, String itemId, int quantity, int cost) {
      this.id = id; this.itemId = itemId; this.quantity = quantity; this.cost = cost;
    }
  }

  static final class Receipt {
    final boolean won;
    final String map, reason;
    final int wave, total, earned, balance;
    Receipt(boolean won, String map, int wave, int total, int earned, int balance, String reason) {
      this.won = won; this.map = map; this.wave = wave; this.total = total;
      this.earned = earned; this.balance = balance; this.reason = reason;
    }
  }

  static int price(String id) { return RewardCatalog.get(id).price; }
  static boolean validAdRewardToken(String token) {
    return token != null && token.matches("ad-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
  }
  void prepareAdReward(String token) {
    if (!pendingAdReward.isEmpty()) throw new IllegalStateException("Your previous ad reward is still being saved. Please try again.");
    if (!validAdRewardToken(token)) throw new IllegalArgumentException("Invalid ad reward identity.");
    pendingAdReward = token;
  }
  int creditAdReward(String token) {
    if (token == null || token.isEmpty() || !pendingAdReward.equals(token)) return 0;
    balance = Math.addExact(balance, AD_REWARD_CRYSTALS);
    pendingAdReward = "";
    return AD_REWARD_CRYSTALS;
  }
  void cancelAdReward(String token) {
    if (token != null && !token.isEmpty() && pendingAdReward.equals(token)) pendingAdReward = "";
  }
  static int count(Map<String, Integer> values, String id) { return values.getOrDefault(id, 0); }
  static Map<String, Integer> copy(Map<String, Integer> values) {
    return Collections.unmodifiableMap(new LinkedHashMap<>(values));
  }
  static int fortressCount(Map<String, Integer> values) {
    int result = 0;
    for (String id : values.keySet()) if (RewardCatalog.get(id).fortress) result += count(values, id);
    return result;
  }
  private void requireHome() {
    for (Run run : runs.values()) if (!run.settled && !run.suspended)
      throw new IllegalArgumentException("Return Home before changing your inventory.");
  }

  void buy(String id, int quantity) {
    requireHome();
    RewardCatalog.Item item = RewardCatalog.get(id);
    if (quantity < 1 || quantity > 999 || owned(id) + quantity > 999)
      throw new IllegalArgumentException("Choose a quantity from 1 to 999.");
    if (item.fortress && ownedFortresses(null) + quantity > 3)
      throw new IllegalArgumentException("You can store at most three fortresses in total.");
    if ("laser_sat".equals(id) && owned(id) + quantity > 1)
      throw new IllegalArgumentException("You can store one Laser Satellite Command Post.");
    int cost = Math.multiplyExact(item.price, quantity);
    if (cost > balance) throw new IllegalArgumentException("Not enough crystals.");
    balance -= cost;
    inventory.put(id, count(inventory, id) + quantity);
    int take = Math.min(count(loadout, id) + quantity, item.maxPerMatch);
    if (item.fortress) take = Math.min(take, count(loadout, id) + 3 - fortressCount(loadout));
    if (take > 0) loadout.put(id, take);
  }

  void equip(String id, int quantity) {
    requireHome();
    RewardCatalog.Item item = RewardCatalog.get(id);
    if (quantity < 0 || quantity > count(inventory, id) || quantity > item.maxPerMatch)
      throw new IllegalArgumentException("That quantity is not available in your inventory.");
    if (item.fortress && fortressCount(loadout) - count(loadout, id) + quantity > 3)
      throw new IllegalArgumentException("Take at most three fortresses into one match.");
    if (quantity == 0) loadout.remove(id); else loadout.put(id, quantity);
  }

  Run begin(String session, String map) {
    if (session == null || session.isEmpty()) throw new IllegalArgumentException("Missing match identity.");
    Run previous = runs.get(session);
    if (previous != null) {
      if (!previous.map.equals(map) || previous.settled || previous.suspended) throw new IllegalArgumentException("This match has already ended.");
      return previous;
    }
    requireHome();
    for (String id : loadout.keySet()) {
      int quantity = count(loadout, id);
      if (quantity < 1 || quantity > count(inventory, id) || quantity > RewardCatalog.get(id).maxPerMatch)
        throw new IllegalArgumentException("Please check your next-match quantities.");
    }
    if (fortressCount(loadout) > 3) throw new IllegalArgumentException("Take at most three fortresses.");
    Run run = new Run(session, map, loadout);
    for (String id : loadout.keySet()) {
      int left = count(inventory, id) - count(loadout, id);
      if (left == 0) inventory.remove(id); else inventory.put(id, left);
    }
    loadout.clear();
    runs.put(session, run);
    if (runs.size() > 128) {
      java.util.Iterator<Run> it = runs.values().iterator();
      while (runs.size() > 128 && it.hasNext()) {
        Run old = it.next();
        if (old.settled && !old.pinned && pending(old) == null) it.remove();
      }
    }
    return run;
  }

  void applied(String session) {
    Run run = active(session); run.applied = true;
    for (String id : run.items.keySet()) if (RewardCatalog.get(id).nativeId.isEmpty()) run.remaining.put(id, 0);
  }

  /** Only native cleared-wave IDs pay; the started-wave number is informational. */
  int progress(String session, int wave, int total, Set<Integer> cleared, Map<String, Integer> remaining) {
    Run run = active(session);
    for (Integer number : cleared) if (number == null || number < 1 || number > total)
      throw new IllegalArgumentException("Invalid cleared wave.");
    if (remaining != null) for (String id : remaining.keySet()) {
      int quantity = remaining.get(id);
      if (!run.items.containsKey(id) || RewardCatalog.get(id).nativeId.isEmpty()
          || quantity < 0 || quantity > count(run.items, id)) throw new IllegalArgumentException("Invalid remaining reward quantity.");
    }
    run.wave = Math.max(run.wave, Math.min(Math.max(0, wave), total));
    int added = 0;
    for (Integer number : cleared) if (run.clearedWaves.add(number)) added++;
    if (remaining != null) for (String id : remaining.keySet()) run.remaining.put(id, Math.min(count(run.remaining, id), remaining.get(id)));
    int credited = added * 5;
    run.waveCredits = Math.addExact(run.waveCredits, credited);
    balance = Math.addExact(balance, credited);
    return credited;
  }

  /** The resumed engine has reconciled an older world with current phone caps. */
  void confirmResumeInventory(String session, Map<String, Integer> remaining) {
    Run run = active(session);
    if (!run.awaitingResumeInventory) return;
    // No wave IDs are credited here. Native resume already clamps old-world
    // allowances to these phone caps; observing its result can only reduce them.
    progress(session, run.wave, Math.max(1, run.wave), Collections.emptySet(), remaining);
    run.awaitingResumeInventory = false;
  }

  Receipt finish(String session, boolean won, String difficulty, int total) {
    return finish(session, won, difficulty, total, false);
  }

  /** Only a terminal native inventory snapshot authorizes building returns. */
  Receipt finish(String session, boolean won, String difficulty, int total, boolean authoritativeRemaining) {
    Run run = runs.get(session);
    if (run == null) throw new IllegalArgumentException("Unknown match.");
    if (run.settled) return run.receipt;
    int bonus = 0;
    String reason = run.clearedWaves.size() + " completed waves × 5  +" + run.waveCredits;
    if (won && !run.winPaid) {
      run.wave = total;
      int base = "hard".equals(difficulty) ? 100 : "medium".equals(difficulty) ? 80 : 60;
      boolean first = completed.add(run.map);
      bonus = base + (first ? 50 : 0);
      run.winPaid = true; run.completionCredits = bonus;
      reason += "\nMap completed  +" + base + (first ? "\nFirst completion  +50" : "");
    } else if (won) reason += "\nCompletion reward already saved";
    else if (run.clearedWaves.isEmpty()) reason = "No completed waves this match";
    balance = Math.addExact(balance, bonus);
    run.returnAllowed = !run.applied || authoritativeRemaining;
    if (!run.pinned && run.returnAllowed) restoreUnused(run, !run.applied);
    else if (!run.pinned) discardUnknownRemaining(run);
    run.settled = true;
    run.suspended = run.pinned;
    run.receipt = new Receipt(won, run.map, run.wave, total, run.waveCredits + run.completionCredits, balance, reason);
    return run.receipt;
  }

  private void restoreUnused(Run run, boolean all) {
    for (String id : run.items.keySet()) {
      int quantity = all ? count(run.items, id) : RewardCatalog.get(id).nativeId.isEmpty() ? 0 : count(run.remaining, id);
      quantity = Math.max(0, quantity - count(run.refunded, id));
      if (quantity <= 0) continue;
      inventory.put(id, Math.addExact(count(inventory, id), quantity));
      run.refunded.put(id, Math.addExact(count(run.refunded, id), quantity));
      int take = Math.min(count(loadout, id) + quantity, RewardCatalog.get(id).maxPerMatch);
      if (RewardCatalog.get(id).fortress) take = Math.min(take, count(loadout, id) + 3 - fortressCount(loadout));
      if (take > 0) loadout.put(id, take);
    }
  }

  void abandon(String session, boolean authoritativeRemaining) {
    Run run = runs.get(session);
    if (run == null || run.settled || run.suspended) return;
    // A crash cannot refund a building from a potentially stale snapshot.
    run.returnAllowed = !run.applied || authoritativeRemaining;
    if (run.pinned) run.suspended = true;
    else {
      if (run.returnAllowed) restoreUnused(run, !run.applied);
      else discardUnknownRemaining(run);
      run.settled = true;
    }
  }

  void recoverInterrupted() {
    for (String session : new HashSet<>(runs.keySet())) abandon(session, false);
  }

  private Run active(String session) {
    Run run = runs.get(session);
    if (run == null || run.settled || run.suspended) throw new IllegalArgumentException("This match is no longer active.");
    return run;
  }

  private void discardUnknownRemaining(Run run) {
    for (String id : run.items.keySet()) if (!RewardCatalog.get(id).nativeId.isEmpty()) run.remaining.put(id, 0);
  }

  LiveTx reserveLive(String session, String transactionId, String itemId, int quantity) {
    Run run = active(session);
    if (!run.applied) throw new IllegalArgumentException("Wait for the match to finish loading.");
    LiveTx previous = pending(run);
    if (previous != null) {
      if (previous.itemId.equals(itemId) && previous.quantity == quantity) return previous;
      throw new IllegalArgumentException("Your previous purchase is still being confirmed. Retry that item and quantity first.");
    }
    RewardCatalog.Item item = RewardCatalog.get(itemId);
    if (quantity < 1 || quantity > 999 || count(run.items, itemId) + quantity > item.maxPerMatch)
      throw new IllegalArgumentException("That quantity exceeds this match's purchase limit.");
    if (item.fortress && (fortressCount(run.items) + quantity > 3 || ownedFortresses(run) + quantity > 3))
      throw new IllegalArgumentException("You can own and use at most three fortresses in total for this match.");
    if ("laser_sat".equals(itemId) && owned(itemId) + quantity > 1)
      throw new IllegalArgumentException("You can own one Laser Satellite Command Post.");
    int cost = Math.multiplyExact(item.price, quantity);
    if (cost > balance) throw new IllegalArgumentException("Not enough crystals.");
    if (transactionId == null || transactionId.isEmpty() || run.transactions.containsKey(transactionId))
      throw new IllegalArgumentException("Invalid purchase identity.");
    LiveTx tx = new LiveTx(transactionId, itemId, quantity, cost);
    balance -= cost; run.transactions.put(tx.id, tx);
    return tx;
  }

  void commitLive(String session, String transactionId, Map<String, Integer> nativeRemaining) {
    Run run = runs.get(session);
    if (run == null) throw new IllegalArgumentException("Unknown match.");
    LiveTx tx = run.transactions.get(transactionId);
    if (tx == null) throw new IllegalArgumentException("Unknown purchase.");
    if ("applied".equals(tx.status)) return;
    if (!"pending".equals(tx.status)) throw new IllegalArgumentException("This purchase was rejected.");
    RewardCatalog.Item item = RewardCatalog.get(tx.itemId);
    int cumulative = Math.addExact(count(run.items, tx.itemId), tx.quantity);
    if (cumulative > item.maxPerMatch) throw new IllegalArgumentException("Invalid applied purchase quantity.");
    Map<String, Integer> projected = new LinkedHashMap<>(run.items);
    projected.put(tx.itemId, cumulative);
    Set<String> expected = new LinkedHashSet<>();
    for (String id : projected.keySet()) if (!RewardCatalog.get(id).nativeId.isEmpty()) expected.add(id);
    if (nativeRemaining == null || !nativeRemaining.keySet().equals(expected))
      throw new IllegalArgumentException("Incomplete applied purchase inventory.");
    for (String id : nativeRemaining.keySet()) {
      Integer left = nativeRemaining.get(id);
      if (left == null || left < 0 || left > count(projected, id))
        throw new IllegalArgumentException("Invalid applied purchase inventory.");
    }
    run.items.put(tx.itemId, cumulative);
    if (item.nativeId.isEmpty()) run.remaining.put(tx.itemId, 0);
    else run.remaining.put(tx.itemId, Math.addExact(count(run.remaining, tx.itemId), tx.quantity));
    for (String id : nativeRemaining.keySet()) {
      Integer left = nativeRemaining.get(id);
      run.remaining.put(id, Math.min(count(run.remaining, id), left));
    }
    tx.status = "applied";
    // Native transaction journals are append-only within one loaded world.
    // Presence of its newest applied ID distinguishes a current inventory from
    // a delayed wave packet captured before this purchase increased the quota.
    run.inventoryPurchaseFloor = tx.id;
  }

  void rejectLive(String session, String transactionId) {
    Run run = runs.get(session);
    if (run == null) throw new IllegalArgumentException("Unknown match.");
    LiveTx tx = run.transactions.get(transactionId);
    if (tx == null) throw new IllegalArgumentException("Unknown purchase.");
    if (!"pending".equals(tx.status)) return;
    balance = Math.addExact(balance, tx.cost); tx.status = "rejected";
  }

  static LiveTx pending(Run run) {
    for (LiveTx tx : run.transactions.values()) if ("pending".equals(tx.status)) return tx;
    return null;
  }

  void pinRun(String session) {
    Run run = runs.get(session);
    if (run == null) throw new IllegalArgumentException("This match's wallet record is no longer available.");
    run.pinned = true;
  }

  void unpinRun(String session) {
    Run run = runs.get(session);
    if (run == null || !run.pinned) return;
    run.pinned = false;
    if (run.settled || run.suspended) {
      if (run.returnAllowed || !run.applied) restoreUnused(run, !run.applied);
      else discardUnknownRemaining(run);
      run.settled = true; run.suspended = false;
    }
  }

  Run resumeRun(String session, String map) {
    Run run = runs.get(session);
    if (run == null || !run.map.equals(map))
      throw new IllegalArgumentException("This saved match's wallet record is no longer available.");
    if (!run.settled && !run.suspended) return run;
    requireHome();
    for (String id : new LinkedHashSet<>(run.refunded.keySet())) {
      int amount = Math.min(count(run.refunded, id), count(inventory, id));
      int left = count(inventory, id) - amount;
      if (left == 0) inventory.remove(id); else inventory.put(id, left);
      if (count(loadout, id) > left) { if (left == 0) loadout.remove(id); else loadout.put(id, left); }
      if (!RewardCatalog.get(id).nativeId.isEmpty()) run.remaining.put(id, Math.min(count(run.remaining, id), amount));
      run.refunded.remove(id);
    }
    run.pinned = true; run.suspended = false; run.settled = false; run.returnAllowed = false; run.receipt = null;
    run.inventoryPurchaseFloor = "";
    run.awaitingResumeInventory = true;
    return run;
  }

  private int owned(String id) {
    int result = count(inventory, id);
    for (Run run : runs.values()) {
      if (run.pinned || !run.settled && !run.suspended) result += Math.max(0, count(run.remaining, id) - count(run.refunded, id));
      for (LiveTx tx : run.transactions.values()) if ("pending".equals(tx.status) && tx.itemId.equals(id)) result += tx.quantity;
    }
    return result;
  }

  private int ownedFortresses(Run current) {
    int result = fortressCount(inventory);
    for (Run run : runs.values()) {
      if (run == current) result += fortressCount(run.items);
      else if (run.pinned || !run.settled && !run.suspended) {
        for (String id : run.items.keySet()) if (RewardCatalog.get(id).fortress)
          result += Math.max(0, count(run.remaining, id) - count(run.refunded, id));
      }
      for (LiveTx tx : run.transactions.values()) if ("pending".equals(tx.status) && RewardCatalog.get(tx.itemId).fortress) result += tx.quantity;
    }
    return result;
  }
}
