package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual wallet/store code; only Android preference I/O and map-ID membership are host fixtures. */
final class ChallengeRewardsCheck099 {
  static int checks;
  static void check(boolean ok,String name) { if(!ok)throw new AssertionError(name);checks++;System.out.println("PASS "+name); }
  static void rejects(Runnable action,String name) { try {action.run();}catch(RuntimeException expected){checks++;System.out.println("PASS "+name);return;}throw new AssertionError(name); }
  static Map<String,Integer> counts(String id,int n) { Map<String,Integer> v=new LinkedHashMap<>();v.put(id,n);return v; }
  static JSONObject saved(Ctx c) {return new JSONObject(c.p.memory.get("ledger_v1"));}
  static JSONObject quote(String session,String tx,int n) {
    return new JSONObject().put("session",session).put("profile","challenge").put("map","firefight").put("applied",true)
      .put("remaining",new JSONObject().put("ripple",n)).put("transactions",new JSONArray().put(tx)).put("pendingTransactions",new JSONArray());
  }
  static String packet(JSONObject reward) {return new JSONObject().put("wave",0).put("completedWaves",new JSONArray()).put("rewards",reward).toString();}

  public static void main(String[] args) {
    profiles();completion();liveAndResume();persistence();ordinaryWaves();
    System.out.println("RESULT "+checks+" focused Challenge wallet checks passed; emulatorUsed=false; Android preferences and map-ID parser boundary simulated");
  }
  static void profiles() {
    int standard=0,more=0;
    for(RewardCatalog.Item item:RewardCatalog.list()) {
      if(item.moreFortress) {more++;rejects(()->RewardCatalog.requireEligible(item,"challenge","firefight"),item.id+" excluded from Challenge");}
      else {standard++;RewardCatalog.requireEligible(item,"challenge","firefight");}
    }
    check(standard==19&&more==12,"Challenge explicitly keeps19 standard items and excludes12 More Fortress items");
    rejects(()->RewardCatalog.requireEligible(RewardCatalog.get("ripple"),"challenge","unknown"),"unknown Challenge map rejected");
    RewardLedger l=new RewardLedger();l.buy("ripple",2,"challenge","firefight");
    check(l.balance==330&&l.challengeLoadout.get("ripple")==2&&l.loadout.isEmpty()&&l.survivalLoadout.isEmpty(),"Challenge purchase charges once and selects only its own loadout");
    int before=l.balance;rejects(()->l.buy("mf_concrete_1",1,"challenge","firefight"),"Challenge cannot buy global More Fortress stock");
    check(l.balance==before&&l.inventory.get("ripple")==2,"ineligible purchase changes no wallet or stock");
    rejects(()->l.begin("unknown","home","challenge"),"Home pseudo-map cannot begin an active Challenge");
    l.buy("mf_concrete_1",1,"towers","home");
    check(l.loadout.get("mf_concrete_1")==1&&!l.challengeLoadout.containsKey("mf_concrete_1"),"More Fortress remains usable in Towers without leaking into Challenge");
  }
  static void completion() {
    for(String difficulty:new String[]{"easy","medium","hard"}) {
      RewardLedger l=new RewardLedger();l.begin("win","firefight","challenge");l.applied("win");l.pinRun("win");
      int base=difficulty.equals("hard")?100:difficulty.equals("medium")?80:60;
      RewardLedger.Receipt first=l.finishChallenge("win",true,difficulty,true);
      check(first.earned==base+50&&first.wave==0&&first.total==0&&l.balance==350+base+50,"native "+difficulty+" victory pays completion plus first win, with no fake waves");
      check(l.finishChallenge("win",true,difficulty,true)==first&&l.balance==350+base+50,"duplicate "+difficulty+" terminal callback does not repay");
      l.resumeRun("win","firefight","challenge");l.confirmResumeInventory("win",Collections.emptyMap());
      l.finishChallenge("win",true,difficulty,true);
      check(l.balance==350+base+50,"restored pre-victory "+difficulty+" world cannot repay the same run");
      l.unpinRun("win");l.begin("again","firefight","challenge");l.applied("again");l.finishChallenge("again",true,difficulty,true);
      check(l.balance==350+base*2+50,"new "+difficulty+" match pays victory again but first bonus once");
      check(l.claimedDifficultyBonuses.isEmpty()&&l.completed.contains("challenge:firefight:"+difficulty),"Challenge "+difficulty+" history is separate from Towers catalog bonuses");
    }
    RewardLedger l=new RewardLedger();l.begin("loss","earthsea","challenge");l.applied("loss");
    int before=l.balance;rejects(()->l.progress("loss",1,1,Collections.singleton(1),Collections.emptyMap()),"fake wave telemetry cannot mint Challenge crystals");
    check(l.balance==before&&l.runs.get("loss").clearedWaves.isEmpty(),"fake wave rejection is atomic");
    rejects(()->l.finish("loss",true,"hard",25,true),"Challenge cannot use Towers completion route");
    check(l.finishChallenge("loss",false,"hard",true).earned==0&&l.balance==before,"defeat awards no victory or wave crystals");
  }
  static void liveAndResume() {
    Ctx c=new Ctx();RewardStore s=new RewardStore(c);s.begin("native","firefight","challenge");s.applied("native");
    JSONObject request=new JSONObject(s.reserveLive("native","ripple",5));String tx=request.getString("transactionId");
    check(request.getString("profile").equals("challenge")&&request.getString("map").equals("firefight")&&s.balance()==300,"live quote carries Challenge identity and one charge");
    check(new JSONObject(s.reserveLive("native","ripple",5)).getString("transactionId").equals(tx)&&s.balance()==300,"retry unresolved purchase preserves reservation and price");
    rejects(()->s.completeLive("native",tx,quote("native",tx,5).put("profile","towers").toString()),"cross-profile native acknowledgement rejected");
    rejects(()->s.completeLive("native",tx,quote("native",tx,5).put("map","earthsea").toString()),"cross-map native acknowledgement rejected");
    JSONObject missing=quote("native",tx,5);missing.remove("profile");
    rejects(()->s.completeLive("native",tx,missing.toString()),"context-free old quote cannot settle Challenge purchase");
    check(s.completeLive("native",tx,quote("native",tx,5).toString())&&s.active("native").get("ripple")==5,"same native journal applies purchased stock");
    check(s.completeLive("native",tx,quote("native",tx,5).toString())&&s.balance()==300,"duplicate native journal never charges again");
    check(s.progress("native",packet(quote("native",tx,2)),0)==0&&s.active("native").get("ripple")==2,"Challenge inventory progress spends quota without wave credit");
    s.pinRun("native");RewardStore restarted=new RewardStore(c.restart());restarted.resumeRun("native","firefight","challenge");
    check(restarted.resumeCaps("native").getJSONObject("remaining").getInt("ripple")==2,"save restart preserves monotonic purchased-building cap");
    check(restarted.confirmResumeInventory("native",quote("native",tx,2).toString()),"fresh native resume quote restores purchase readiness");
    RewardLedger.Receipt r=restarted.finishChallenge("native",true,"hard",true);
    check(r.earned==150&&restarted.balance()==450,"reconciled Challenge win credits exactly150 after charged purchase");
    RewardStore terminal=new RewardStore(c.restart());
    check(terminal.finishChallenge("native",true,"hard",true).earned==150&&terminal.balance()==450,"terminal credit survives restart without repayment");
  }
  static void persistence() {
    Ctx old=new Ctx();RewardStore initial=new RewardStore(old);initial.buy("ripple",3);initial.buy("supply",1,"survival","tdn2");
    JSONObject v5=saved(old).put("version",5);v5.remove("challengeLoadout");old.p.seed(v5.toString());
    RewardStore upgraded=new RewardStore(old.restart());
    check(upgraded.balance()==290&&upgraded.inventory().get("ripple")==3&&upgraded.loadout().get("ripple")==3&&upgraded.loadout("survival").get("supply")==1&&upgraded.loadout("challenge").isEmpty(),"version5 wallet upgrades preserving balance and both prior loadouts");
    Ctx history=new Ctx();RewardStore earlier=new RewardStore(history);
    earlier.buy("ripple",3);earlier.buy("supply",1,"survival","tdn2");
    earlier.begin("prior-towers","old-hard-map");earlier.applied("prior-towers");
    earlier.progress("prior-towers",new JSONObject().put("wave",1).put("completedWaves",new JSONArray().put(1)).put("rewards",new JSONObject().put("session","prior-towers").put("applied",true).put("remaining",new JSONObject().put("ripple",2))).toString(),25);
    earlier.finish("prior-towers",true,"hard",25,true,Collections.singleton("old-hard-map"));
    earlier.begin("prior-survival","tdn2","survival");earlier.applied("prior-survival");earlier.finish("prior-survival",false,"hard",60,true);
    earlier.buy("mf_concrete_1",1,"towers","home");
    JSONObject original=saved(history).put("version",5);original.remove("challengeLoadout");history.p.seed(original.toString());
    Ctx restoredContext=history.restart();RewardStore restored=new RewardStore(restoredContext);JSONObject migrated=saved(restoredContext);
    for(String key:new String[]{"balance","inventory","loadout","survivalLoadout","completed","claimedDifficultyBonuses","runs","pendingAdReward"})
      check(new JSONObject().put("value",original.get(key)).similar(new JSONObject().put("value",migrated.get(key))),"version5 migration preserves complete prior "+key+" record");
    check(migrated.getInt("version")==6&&migrated.getJSONObject("challengeLoadout").isEmpty(),"version5 migration adds only empty Challenge state and schema6");
    Ctx unreadable=new Ctx();String broken="{\"version\":5,\"balance\":-1}";unreadable.p.seed(broken);RewardStore quarantined=new RewardStore(unreadable);
    rejects(()->quarantined.buy("ripple",1),"unreadable version5 wallet refuses mutation with kept-record error");
    check(unreadable.p.memory.get("ledger_v1").equals(broken)&&unreadable.p.durable.get("ledger_v1").equals(broken),"unreadable version5 record remains byte-identical, never overwritten with zero balance");
    Ctx disk=new Ctx();RewardStore s=new RewardStore(disk);s.begin("atomic","firefight","challenge");s.applied("atomic");
    disk.p.failNext=1;rejects(()->s.finishChallenge("atomic",true,"medium",true),"failed persistence cannot claim saved Challenge win");
    check(s.balance()==350&&!saved(disk).getJSONArray("runs").getJSONObject(0).getBoolean("winPaid"),"failed credit rolls back balance and one-time flag together");
    check(s.finishChallenge("atomic",true,"medium",true).earned==130&&s.balance()==480,"retained native result retries once after failed write");
    Ctx bad=new Ctx();new RewardStore(bad);JSONObject corrupt=saved(bad);corrupt.getJSONObject("inventory").put("mf_concrete_1",1);corrupt.getJSONObject("challengeLoadout").put("mf_concrete_1",1);bad.p.seed(corrupt.toString());
    RewardStore protectedStore=new RewardStore(bad);
    check(protectedStore.balance()==0&&bad.p.memory.get("ledger_v1").equals(corrupt.toString()),"tampered Challenge More Fortress loadout preserves protected unreadable record");
  }
  static void ordinaryWaves() {
    RewardLedger l=new RewardLedger();l.begin("waves","ordinary-map");l.applied("waves");
    check(l.progress("waves",1,25,Collections.singleton(1),Collections.emptyMap())==5&&l.balance==355,"ordinary Towers cleared-wave credit remains5");
    RewardLedger.Receipt r=l.finish("waves",true,"easy",25,true);
    check(r.earned==115&&l.balance==465,"ordinary Towers completion and first bonus remain unchanged");
    check(l.finish("waves",true,"easy",25,true)==r&&l.balance==465,"ordinary duplicate completion remains idempotent");
  }
  static final class Ctx extends Context {
    final Prefs p=new Prefs();
    public SharedPreferences getSharedPreferences(String name,int mode){return p;}
    Ctx restart(){Ctx c=new Ctx();c.p.memory.putAll(p.durable);c.p.durable.putAll(p.durable);return c;}
  }
  static final class Prefs implements SharedPreferences {
    final Map<String,String> memory=new LinkedHashMap<>(),durable=new LinkedHashMap<>();int failNext;
    void seed(String s){memory.put("ledger_v1",s);durable.put("ledger_v1",s);}
    public String getString(String key,String fallback){return memory.getOrDefault(key,fallback);}
    public Editor edit(){return new Editor(){final Map<String,String> changes=new LinkedHashMap<>();public Editor putString(String k,String v){changes.put(k,v);return this;}public boolean commit(){memory.putAll(changes);if(failNext>0){failNext--;return false;}durable.clear();durable.putAll(memory);return true;}};}
  }
}
