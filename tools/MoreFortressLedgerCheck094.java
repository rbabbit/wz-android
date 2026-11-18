package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual ledger/store on JVM; only Android preference I/O is simulated. */
final class MoreFortressLedgerCheck094 {
  static int checks;
  static void check(boolean value,String name){if(!value)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
  static void rejects(Runnable action,String name){try{action.run();}catch(RuntimeException expected){checks++;System.out.println("PASS "+name);return;}throw new AssertionError(name);}
  static JSONObject quote(String session,String map,String... ids){
    JSONArray journal=new JSONArray();for(String id:ids)journal.put(id);
    return new JSONObject().put("session",session).put("profile","survival").put("map",map).put("applied",true)
      .put("remaining",new JSONObject().put("mf_atgm_design",0).put("mf_fortress_sensor",0)).put("transactions",journal);
  }
  public static void main(String[] args){
    check(RewardCatalog.list().size()==31,"31catalog items preserve19stock and add12MoreFortress purchases");
    check(RewardCatalog.get("fortress").price==120&&RewardCatalog.get("research").price==60&&RewardCatalog.get("supply").price==30,"existing prices preserved");
    Ctx context=new Ctx();RewardStore original=new RewardStore(context);original.buy("ripple",2);
    JSONObject legacy=new JSONObject(context.p.value);legacy.put("version",4).remove("survivalLoadout");context.p.value=legacy.toString();
    RewardStore store=new RewardStore(context);
    check(store.balance()==330&&store.inventory().get("ripple")==2&&store.loadout().get("ripple")==2&&store.loadout("survival").isEmpty(),"v4wallet stock and Waves loadout preserved without Survival leakage");
    store.buy("mf_atgm_design",1,"survival","tdn2");
    check(store.balance()==270&&store.loadout("survival").get("mf_atgm_design")==1&&!store.loadout().containsKey("mf_atgm_design"),"shared wallet with separate profile selections and exact charge");
    rejects(()->store.buy("mf_fortress_sensor",1,"multiplayer","tdn2"),"foreign profile rejected");
    rejects(()->store.buy("mf_fortress_sensor",1,"survival","easy-map"),"wrong Survival map rejected");
    store.begin("survival94","tdn2","survival");JSONObject config=new JSONObject(store.config("survival94"));
    check(config.getString("profile").equals("survival")&&config.getString("map").equals("tdn2")&&config.getJSONObject("items").getInt("mf_atgm_design")==1,"native base config bound to profile map and purchased licence");
    store.applied("survival94");check(store.active("survival94").get("mf_atgm_design")==1&&store.resumeCaps("survival94").getJSONObject("remaining").getInt("mf_atgm_design")==0,"one-shot licence remains active but is consumed and nonrefundable");
    rejects(()->store.resumeRun("survival94","tdn2","towers"),"saved run cannot move to another profile");
    JSONObject request=new JSONObject(store.reserveLive("survival94","mf_fortress_sensor",1));String transaction=request.getString("transactionId");
    check(request.getString("profile").equals("survival")&&request.getString("map").equals("tdn2")&&store.balance()==230,"live reservation binds profile map and exact crystal cost");
    JSONObject proof=quote("survival94","tdn2",transaction);
    rejects(()->store.completeLive("survival94",transaction,new JSONObject(proof.toString()).put("map","wave").toString()),"wrong-map native proof cannot commit or refund");
    check(store.pendingLive("survival94").length()==1&&store.balance()==230,"wrong proof retains same pending reservation");
    check(store.completeLive("survival94",transaction,proof.toString())&&store.active("survival94").get("mf_fortress_sensor")==1,"native journal commits the paid sensor effect");
    check(store.completeLive("survival94",transaction,proof.toString())&&store.balance()==230,"duplicate native proof never pays or grants twice");
    rejects(()->store.reserveLive("survival94","mf_fortress_sensor",1),"sensor limited to one application per run");
    store.pinRun("survival94");store.abandon("survival94",true);RewardStore restarted=new RewardStore(context);
    restarted.resumeRun("survival94","tdn2","survival");
    check(restarted.resumeCaps("survival94").getString("profile").equals("survival")&&restarted.resumeCaps("survival94").getJSONObject("items").getInt("mf_fortress_sensor")==1,"restart and save resume preserve paid effect context");
    check(restarted.confirmResumeInventory("survival94",proof.toString())&&restarted.balance()==230,"full matching resumed quote keeps consumed effects without new charge");

    RewardLedger ledger=new RewardLedger();ledger.balance=5000;
    rejects(()->ledger.buy("mf_concrete_2",1,"survival","wave"),"ConcreteII requires selected ConcreteI before charge");
    check(ledger.balance==5000&&ledger.inventory.isEmpty(),"dependency rejection is atomic");
    for(int tier=1;tier<=3;tier++)ledger.buy("mf_concrete_"+tier,1,"survival","wave");
    check(ledger.balance==4790&&ledger.survivalLoadout.size()==3,"all concrete tiers charge40plus70plus100 and select once");
    rejects(()->ledger.equip("mf_concrete_1",0,"survival","wave"),"cannot remove prerequisite while dependent tiers selected");
    RewardLedger.Run run=ledger.begin("tiers94","wave","survival");ledger.applied("tiers94");
    check(run.profile.equals("survival")&&run.remaining.values().stream().allMatch(n->n==0),"all tier tokens consumed exactly once when run applies");
    rejects(()->ledger.reserveLive("tiers94","second-tier","mf_concrete_3",1),"concrete tier cannot be applied a second time");
    RewardLedger forts=new RewardLedger();forts.balance=5000;forts.buy("fortress",1);forts.buy("mf_howitzer",1);forts.buy("mf_flamer",1);
    rejects(()->forts.buy("mf_laser",1),"new and stock fortresses share maximum3");

    Ctx sharedContext=new Ctx();RewardStore shared=new RewardStore(sharedContext);shared.buy("ripple",2);shared.equip("ripple",2,"survival","wave");
    shared.begin("shared94","wave","survival");
    check(shared.inventory().isEmpty()&&shared.loadout("towers").isEmpty(),"shared stock reserved once and other profile cannot duplicate it");
    check(new JSONObject(sharedContext.p.value).getInt("version")==5,"wallet persists explicit v5 profile model");
    Ctx rollbackContext=new Ctx();RewardStore rollback=new RewardStore(rollbackContext);rollbackContext.p.failNext=true;
    rejects(()->rollback.buy("mf_atgm_design",1,"survival","wave"),"failed preference write rejects purchase");
    check(rollback.balance()==350&&rollback.inventory().isEmpty()&&rollback.loadout("survival").isEmpty(),"failed write restores wallet stock and both loadouts");
    System.out.println("CHECKS "+checks);
  }
  static final class Ctx extends Context {
    final Prefs p=new Prefs();public SharedPreferences getSharedPreferences(String name,int mode){return p;}
  }
  static final class Prefs implements SharedPreferences {
    String value;boolean failNext;
    public String getString(String key,String fallback){return value==null?fallback:value;}
    public Editor edit(){return new Editor(){String pending;public Editor putString(String key,String data){pending=data;return this;}
      public boolean commit(){if(failNext){failNext=false;return false;}value=pending;return true;}};}
  }
}
