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
  static final int WAVE_CRYSTALS = 5;
  static final int DIFFICULTY_COMPLETION_CRYSTALS = 1000;
  int balance = STARTER_CRYSTALS;
  final Map<String, Integer> inventory = new LinkedHashMap<>();
  final Map<String, Integer> loadout = new LinkedHashMap<>();
  final Map<String, Integer> survivalLoadout = new LinkedHashMap<>();
  final Map<String, Integer> challengeLoadout = new LinkedHashMap<>();
  Map<String,Integer> loadout(String profile) {
    String checked = RewardCatalog.profile(profile);
    return "challenge".equals(checked) ? challengeLoadout : "survival".equals(checked) ? survivalLoadout : loadout;
  }
  private void trimLoadoutsToStock() {
    for (Map<String,Integer> chosen : java.util.Arrays.asList(loadout,survivalLoadout,challengeLoadout))
      for (String id : new LinkedHashSet<>(chosen.keySet())) { int n=Math.min(count(chosen,id),count(inventory,id)); if(n<1)chosen.remove(id);else chosen.put(id,n); }
    for(Map<String,Integer> chosen:java.util.Arrays.asList(loadout,survivalLoadout,challengeLoadout))
      for(RewardCatalog.Item item:RewardCatalog.list())if(!item.requires.isEmpty()&&count(chosen,item.requires)<1)chosen.remove(item.id);
  }
  final Set<String> completed = new HashSet<>();
  final Set<String> claimedDifficultyBonuses = new LinkedHashSet<>();
  final LinkedHashMap<String, Run> runs = new LinkedHashMap<>();

  static final class Run {
    final String session, map, profile;
    final Map<String, Integer> baseItems;
    final Map<String, Integer> items = new LinkedHashMap<>();
    final Map<String, Integer> remaining = new LinkedHashMap<>();
    final Map<String, Integer> refunded = new LinkedHashMap<>();
    final LinkedHashMap<String, LiveTx> transactions = new LinkedHashMap<>();
    final Set<Integer> clearedWaves = new LinkedHashSet<>();
    boolean applied, settled, suspended, pinned, winPaid, returnAllowed, awaitingResumeInventory;
    String inventoryPurchaseFloor = "";
    int wave, waveCredits, completionCredits, difficultyCredits;
    Receipt receipt;
    Run(String session, String map, Map<String, Integer> items) { this(session,map,"towers",items); }
    Run(String session, String map, String profile, Map<String, Integer> items) {
      this.session = session; this.map = map; this.profile=RewardCatalog.profile(profile);
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

  void buy(String id, int quantity) { buy(id,quantity,"towers","home"); }
  void buy(String id, int quantity, String profile, String map) {
    requireHome();
    Map<String,Integer> loadout=loadout(profile);
    RewardCatalog.Item item = RewardCatalog.get(id);
    RewardCatalog.requireEligible(item,profile,map);
    if (!item.purchasable()) throw new IllegalArgumentException("This item is no longer sold.");
    if (quantity < 1 || quantity > 999 || owned(id) + quantity > 999)
      throw new IllegalArgumentException("Choose a quantity from 1 to 999.");
    if (item.fortress && ownedFortresses(null) + quantity > 3)
      throw new IllegalArgumentException("You can store at most three fortresses in total.");
    if (item.structure() && item.maxPerMatch == 1 && owned(id) + quantity > 1)
      throw new IllegalArgumentException("You can store one " + item.name + ".");
    Map<String,Integer> selected=new LinkedHashMap<>(loadout);
    selected.put(id,Math.min(count(selected,id)+quantity,item.maxPerMatch));RewardCatalog.requireDependencies(selected);
    int cost = Math.multiplyExact(item.price, quantity);
    if (cost > balance) throw new IllegalArgumentException("Not enough crystals.");
    balance -= cost;
    inventory.put(id, count(inventory, id) + quantity);
    int take = Math.min(count(loadout, id) + quantity, item.maxPerMatch);
    if (item.fortress) take = Math.min(take, count(loadout, id) + 3 - fortressCount(loadout));
    if (take > 0) loadout.put(id, take);
  }

  void equip(String id, int quantity) { equip(id,quantity,"towers","home"); }
  void equip(String id, int quantity, String profile, String map) {
    requireHome();
    Map<String,Integer> loadout=loadout(profile);
    RewardCatalog.Item item = RewardCatalog.get(id);
    RewardCatalog.requireEligible(item,profile,map);
    if (!item.purchasable()) throw new IllegalArgumentException("This item is no longer sold.");
    if (quantity < 0 || quantity > count(inventory, id) || quantity > item.maxPerMatch)
      throw new IllegalArgumentException("That quantity is not available in your inventory.");
    if (item.fortress && fortressCount(loadout) - count(loadout, id) + quantity > 3)
      throw new IllegalArgumentException("Take at most three fortresses into one match.");
    Map<String,Integer> selected=new LinkedHashMap<>(loadout);
    if(quantity==0)selected.remove(id);else selected.put(id,quantity);RewardCatalog.requireDependencies(selected);
    if (quantity == 0) loadout.remove(id); else loadout.put(id, quantity);
  }

  Run begin(String session, String map) { return begin(session,map,"towers"); }
  Run begin(String session, String map, String profile) {
    Map<String,Integer> loadout=loadout(profile);
    if(map==null||map.isEmpty())throw new IllegalArgumentException("Missing map identity.");
    if ("challenge".equals(profile) && !ChallengeMapCatalog.isKnownId(map))
      throw new IllegalArgumentException("Unknown Challenge map.");
    if (session == null || session.isEmpty()) throw new IllegalArgumentException("Missing match identity.");
    Run previous = runs.get(session);
    if (previous != null) {
      if (!previous.map.equals(map) || !previous.profile.equals(profile) || previous.settled || previous.suspended) throw new IllegalArgumentException("This match has already ended.");
      return previous;
    }
    requireHome();
    RewardCatalog.requireDependencies(loadout);
    for (String id : loadout.keySet()) {
      RewardCatalog.requireEligible(RewardCatalog.get(id),profile,map);
      int quantity = count(loadout, id);
      if (quantity < 1 || quantity > count(inventory, id) || quantity > RewardCatalog.get(id).maxPerMatch)
        throw new IllegalArgumentException("Please check your next-match quantities.");
    }
    if (fortressCount(loadout) > 3) throw new IllegalArgumentException("Take at most three fortresses.");
    Run run = new Run(session, map, profile, loadout);
    for (String id : loadout.keySet()) {
      int left = count(inventory, id) - count(loadout, id);
      if (left == 0) inventory.remove(id); else inventory.put(id, left);
    }
    loadout.clear();
    trimLoadoutsToStock();
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
    for (String id : run.items.keySet()) if (RewardCatalog.get(id).consumedOnApply()) run.remaining.put(id, 0);
  }

  /** Only native cleared-wave IDs pay; the started-wave number is informational. */
  int progress(String session, int wave, int total, Set<Integer> cleared, Map<String, Integer> remaining) {
    Run run = active(session);
    if ("challenge".equals(run.profile) && (wave != 0 || total != 0 || !cleared.isEmpty()))
      throw new IllegalArgumentException("Challenge rewards do not have cleared waves.");
    for (Integer number : cleared) if (number == null || number < 1 || number > total)
      throw new IllegalArgumentException("Invalid cleared wave.");
    if (remaining != null) for (String id : remaining.keySet()) {
      int quantity = remaining.get(id);
      if (!run.items.containsKey(id) || !RewardCatalog.get(id).inNativeItems()
          || quantity < 0 || quantity > count(run.items, id)) throw new IllegalArgumentException("Invalid remaining reward quantity.");
    }
    run.wave = Math.max(run.wave, Math.min(Math.max(0, wave), total));
    int added = 0;
    for (Integer number : cleared) if (run.clearedWaves.add(number)) added++;
    if (remaining != null) for (String id : remaining.keySet()) run.remaining.put(id, Math.min(count(run.remaining, id), remaining.get(id)));
    int credited = Math.multiplyExact(added, WAVE_CRYSTALS);
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
    progress(session, run.wave, "challenge".equals(run.profile) ? 0 : Math.max(1, run.wave), Collections.emptySet(), remaining);
    run.awaitingResumeInventory = false;
  }

  Receipt finish(String session, boolean won, String difficulty, int total) {
    return finish(session, won, difficulty, total, false);
  }

  /** Only a terminal native inventory snapshot authorizes building returns. */
  Receipt finish(String session, boolean won, String difficulty, int total, boolean authoritativeRemaining) {
    return finish(session, won, difficulty, total, authoritativeRemaining, null);
  }

  static boolean validDifficulty(String difficulty) {
    return "easy".equals(difficulty) || "medium".equals(difficulty) || "hard".equals(difficulty);
  }

  private static void validateDifficultyMaps(String difficulty, Set<String> required) {
    if (!validDifficulty(difficulty) || required == null || required.isEmpty())
      throw new IllegalArgumentException("This map's difficulty catalog is not available.");
    for (String id : required) if (id == null || !id.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,127}"))
      throw new IllegalArgumentException("Invalid map identity in the difficulty catalog.");
  }

  private int claimDifficultyBonus(String difficulty, Set<String> required) {
    return completed.containsAll(required) && claimedDifficultyBonuses.add(difficulty)
        ? DIFFICULTY_COMPLETION_CRYSTALS : 0;
  }

  /** Backfill completed older wallets on Home without requiring another playthrough. */
  int reconcileDifficultyBonuses(Map<String, Set<String>> actualCatalogGroups) {
    if (actualCatalogGroups == null || actualCatalogGroups.isEmpty())
      throw new IllegalArgumentException("Missing difficulty map catalog.");
    Set<String> known = new HashSet<>();
    for (Map.Entry<String, Set<String>> group : actualCatalogGroups.entrySet()) {
      validateDifficultyMaps(group.getKey(), group.getValue());
      for (String id : group.getValue()) if (!known.add(id))
        throw new IllegalArgumentException("A map belongs to more than one difficulty.");
    }
    int credited = 0;
    for (Map.Entry<String, Set<String>> group : actualCatalogGroups.entrySet())
      credited = Math.addExact(credited, claimDifficultyBonus(group.getKey(), group.getValue()));
    balance = Math.addExact(balance, credited);
    return credited;
  }

  /** Catalog membership comes from the caller's actual map catalog, never a name prefix. */
  Receipt finish(String session, boolean won, String difficulty, int total, boolean authoritativeRemaining,
      Set<String> requiredDifficultyMapIds) {
    Run run = runs.get(session);
    if (run == null) throw new IllegalArgumentException("Unknown match.");
    if ("challenge".equals(run.profile)) throw new IllegalArgumentException("Use the Challenge completion record.");
    if (requiredDifficultyMapIds != null) {
      validateDifficultyMaps(difficulty, requiredDifficultyMapIds);
      if (total < 1 || !requiredDifficultyMapIds.contains(run.map))
        throw new IllegalArgumentException("This map's difficulty catalog is not available.");
    }
    if (run.settled) return run.receipt;
    int bonus = 0;
    String reason = run.clearedWaves.size() + " completed waves × " + WAVE_CRYSTALS + "  +" + run.waveCredits;
    if (won && !run.winPaid) {
      run.wave = total;
      int base = "hard".equals(difficulty) ? 100 : "medium".equals(difficulty) ? 80 : 60;
      boolean first = completed.add(run.map);
      bonus = base + (first ? 50 : 0);
      run.winPaid = true; run.completionCredits = bonus;
      reason += "\nMap completed  +" + base + (first ? "\nFirst completion  +50" : "");
      // Native victories and Home backfill share the same persistent claim.
      if (requiredDifficultyMapIds != null
          && (run.difficultyCredits = claimDifficultyBonus(difficulty, requiredDifficultyMapIds)) > 0) {
        bonus = Math.addExact(bonus, run.difficultyCredits);
        String label = "easy".equals(difficulty) ? "Easy" : "medium".equals(difficulty) ? "Medium" : "Hard";
        reason += "\n" + label + " difficulty completed  +" + run.difficultyCredits;
      }
    } else if (won) reason += "\nCompletion reward already saved";
    else if (run.clearedWaves.isEmpty()) reason = "No completed waves this match";
    balance = Math.addExact(balance, bonus);
    run.returnAllowed = !run.applied || authoritativeRemaining;
    if (!run.pinned && run.returnAllowed) restoreUnused(run, !run.applied);
    else if (!run.pinned) discardUnknownRemaining(run);
    run.settled = true;
    run.suspended = run.pinned;
    run.receipt = new Receipt(won, run.map, run.wave, total,
        Math.addExact(Math.addExact(run.waveCredits, run.completionCredits), run.difficultyCredits), balance, reason);
    return run.receipt;
  }

  /** A native 1v1 result pays once per run; restoring an older save cannot repay it. */
  Receipt finishChallenge(String session, boolean won, String difficulty, boolean authoritativeRemaining) {
    Run run = runs.get(session);
    if (run == null || !"challenge".equals(run.profile)) throw new IllegalArgumentException("Unknown Challenge match.");
    if (!validDifficulty(difficulty)) throw new IllegalArgumentException("Invalid Challenge difficulty.");
    if (run.settled) return run.receipt;
    int credited = 0;
    String reason = won ? "Victory reward already saved" : "No victory reward this match";
    if (won && !run.winPaid) {
      int base = "hard".equals(difficulty) ? 100 : "medium".equals(difficulty) ? 80 : 60;
      boolean first = completed.add("challenge:" + run.map + ":" + difficulty);
      credited = base + (first ? 50 : 0);
      run.winPaid = true;
      run.completionCredits = credited;
      reason = "Challenge won  +" + base + (first ? "\nFirst win on this map and difficulty  +50" : "");
    }
    balance = Math.addExact(balance, credited);
    run.returnAllowed = !run.applied || authoritativeRemaining;
    if (!run.pinned && run.returnAllowed) restoreUnused(run, !run.applied);
    else if (!run.pinned) discardUnknownRemaining(run);
    run.settled = true;
    run.suspended = run.pinned;
    run.receipt = new Receipt(won, run.map, 0, 0, run.completionCredits, balance, reason);
    return run.receipt;
  }

  private void restoreUnused(Run run, boolean all) {
    Map<String,Integer> loadout=loadout(run.profile);
    for (String id : run.items.keySet()) {
      int quantity = all ? count(run.items, id) : RewardCatalog.get(id).consumedOnApply() ? 0 : count(run.remaining, id);
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
    for (String id : run.items.keySet()) if (!RewardCatalog.get(id).consumedOnApply()) run.remaining.put(id, 0);
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
    RewardCatalog.requireEligible(item,run.profile,run.map);
    if (!item.purchasable()) throw new IllegalArgumentException("This item is no longer sold.");
    Map<String,Integer> selected=new LinkedHashMap<>(run.items);selected.put(itemId,count(selected,itemId)+quantity);RewardCatalog.requireDependencies(selected);
    if (quantity < 1 || quantity > 999 || count(run.items, itemId) + quantity > item.maxPerMatch)
      throw new IllegalArgumentException("That quantity exceeds this match's purchase limit.");
    if (item.fortress && (fortressCount(run.items) + quantity > 3 || ownedFortresses(run) + quantity > 3))
      throw new IllegalArgumentException("You can own and use at most three fortresses in total for this match.");
    if (item.structure() && item.maxPerMatch == 1 && owned(itemId) + quantity > 1)
      throw new IllegalArgumentException("You can own one " + item.name + ".");
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
    for (String id : projected.keySet()) if (RewardCatalog.get(id).inNativeItems()) expected.add(id);
    if (nativeRemaining == null || !nativeRemaining.keySet().equals(expected))
      throw new IllegalArgumentException("Incomplete applied purchase inventory.");
    for (String id : nativeRemaining.keySet()) {
      Integer left = nativeRemaining.get(id);
      if (left == null || left < 0 || left > count(projected, id))
        throw new IllegalArgumentException("Invalid applied purchase inventory.");
    }
    run.items.put(tx.itemId, cumulative);
    if (item.consumedOnApply()) run.remaining.put(tx.itemId, 0);
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

  Run resumeRun(String session, String map) { return resumeRun(session,map,"towers"); }
  Run resumeRun(String session, String map, String profile) {
    Map<String,Integer> loadout=loadout(profile);
    Run run = runs.get(session);
    if (run == null || !run.map.equals(map) || !run.profile.equals(profile))
      throw new IllegalArgumentException("This saved match's wallet record is no longer available.");
    if (!run.settled && !run.suspended) return run;
    requireHome();
    for (String id : new LinkedHashSet<>(run.refunded.keySet())) {
      int amount = Math.min(count(run.refunded, id), count(inventory, id));
      int left = count(inventory, id) - amount;
      if (left == 0) inventory.remove(id); else inventory.put(id, left);
      if (count(loadout, id) > left) { if (left == 0) loadout.remove(id); else loadout.put(id, left); }
      if (!RewardCatalog.get(id).consumedOnApply()) run.remaining.put(id, Math.min(count(run.remaining, id), amount));
      run.refunded.remove(id);
    }
    trimLoadoutsToStock();
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
