package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual ledger/store policy on the JVM; only Android preferences I/O is simulated. */
final class RewardLedgerCheck027 {
  private static int checks;
  private static void check(boolean value, String name) {
    if (!value) throw new AssertionError(name);
    checks++; System.out.println("PASS " + name);
  }
  private static void rejects(Runnable action, String name) {
    try { action.run(); } catch (RuntimeException expected) { checks++; System.out.println("PASS " + name); return; }
    throw new AssertionError(name);
  }
  private static Map<String,Integer> counts(Object... pairs) {
    Map<String,Integer> result = new LinkedHashMap<>();
    for (int i=0;i<pairs.length;i+=2) result.put((String)pairs[i],(Integer)pairs[i+1]);
    return result;
  }
  private static Set<Integer> waves(Integer... ids) { return new LinkedHashSet<>(Arrays.asList(ids)); }
  private static RewardLedger rich() { RewardLedger l=new RewardLedger();l.balance=100000;return l; }
  private static String packet(String session, int wave, Set<Integer> cleared, Map<String,Integer> remaining) {
    return new JSONObject().put("wave",wave).put("completedWaves",new JSONArray(cleared))
      .put("rewards",new JSONObject().put("session",session).put("applied",true).put("remaining",new JSONObject(remaining))).toString();
  }

  public static void main(String[] args) {
    check(RewardCatalog.list().size()==19,"catalog exposes19 canonical items");
    Set<String> nativeIds=new LinkedHashSet<>();
    for(RewardCatalog.Item item:RewardCatalog.list()) if(!item.nativeId.isEmpty()) nativeIds.add(item.nativeId);
    check(nativeIds.size()==17,"all17 building unlocks have distinct native IDs");
    check(RewardCatalog.get("fortress").price==120 && RewardCatalog.get("research").price==60
      && RewardCatalog.get("supply").price==30,"existing prices preserved");
    rejects(()->RewardCatalog.get("aa"),"unknown or AA reward is not offered");

    for(int qty:new int[]{1,5,10,15,20,25}) {
      RewardLedger l=rich();l.buy("gauss_hardpoint",qty);
      check(l.inventory.get("gauss_hardpoint")==qty && l.balance==100000-25*qty,
        "bulk quantity"+qty+" charges exact crystal cost");
      check(l.loadout.get("gauss_hardpoint")==qty,"bulk quantity"+qty+" defaults only new purchase into next match");
    }
    RewardLedger capped=rich();capped.buy("ripple",999);int before=capped.balance;
    rejects(()->capped.buy("ripple",1),"item stock cannot exceed999");
    check(capped.balance==before && capped.inventory.get("ripple")==999,"stock cap rejection is atomic");
    rejects(()->capped.buy("ripple",0),"zero purchase rejected");
    rejects(()->capped.buy("ripple",1000),"oversized purchase rejected");
    RewardLedger poor=new RewardLedger();poor.balance=24;
    rejects(()->poor.buy("gauss_hardpoint",1),"insufficient funds rejected");
    check(poor.balance==24 && poor.inventory.isEmpty() && poor.loadout.isEmpty(),"failed purchase changes neither money nor stock");

    RewardLedger forts=rich();forts.buy("fortress",1);forts.buy("missile_fortress",1);forts.buy("mass_driver_fortress",1);
    check(RewardLedger.fortressCount(forts.inventory)==3 && RewardLedger.fortressCount(forts.loadout)==3,"mixed fortress stock and loadout share maximum3");
    int fortBalance=forts.balance;
    rejects(()->forts.buy("rocket_bastion",1),"fourth mixed fortress purchase rejected");
    check(forts.balance==fortBalance,"fortress cap failure does not charge");
    forts.equip("missile_fortress",0);forts.equip("mass_driver_fortress",0);
    rejects(()->forts.buy("rocket_bastion",1),"leaving fortress stored does not free purchase slot");
    forts.begin("fortRun","anyMap");forts.applied("fortRun");
    rejects(()->forts.buy("rocket_bastion",1),"in-flight fortress still occupies purchase allowance");
    forts.progress("fortRun",1,25,waves(),counts("fortress",0));forts.finish("fortRun",false,"hard",25,true);
    forts.buy("rocket_bastion",1);
    check(RewardLedger.fortressCount(forts.inventory)==3,"spent fortress permits buying replacement after match");
    RewardLedger support=rich();support.buy("laser_sat",1);
    rejects(()->support.buy("laser_sat",1),"only one satellite can be stored");
    support.buy("research",5);support.buy("supply",5);
    check(support.inventory.get("research")==5 && support.loadout.get("research")==1
      && support.inventory.get("supply")==5 && support.loadout.get("supply")==1,"support batches are portable but only one each is taken");
    rejects(()->support.equip("research",2),"research match quantity capped at1");

    RewardLedger portable=rich();portable.buy("ripple",15);portable.equip("ripple",10);
    check(portable.inventory.get("ripple")==15 && portable.loadout.get("ripple")==10,"choosing next-match quantity does not deduct stock");
    rejects(()->portable.equip("ripple",16),"cannot take more than owned");
    RewardLedger.Run first=portable.begin("mapOneRun","mapOne");
    check(first.items.get("ripple")==10 && portable.inventory.get("ripple")==5 && portable.loadout.isEmpty(),"Play reserves chosen quantity exactly once");
    check(portable.begin("mapOneRun","mapOne")==first && portable.inventory.get("ripple")==5,"duplicate begin does not reserve twice");
    rejects(()->portable.begin("mapOneRun","differentMap"),"a session remains bound to its played map");
    rejects(()->portable.equip("ripple",1),"cannot alter current run through loadout");
    portable.applied("mapOneRun");portable.progress("mapOneRun",4,25,waves(1,2),counts("ripple",3));
    portable.progress("mapOneRun",3,25,waves(1),counts("ripple",8));
    check(first.remaining.get("ripple")==3,"older snapshot cannot increase remaining allowance");
    portable.finish("mapOneRun",false,"hard",25,true);
    check(portable.inventory.get("ripple")==8 && portable.loadout.get("ripple")==3,"only unused3 return and preselect while deliberately stored5 stay stored");
    RewardLedger.Run second=portable.begin("mapTwoRun","mapTwo");
    check(second.map.equals("mapTwo") && second.items.get("ripple")==3 && portable.inventory.get("ripple")==5,"unused stock can be taken into a different map");
    portable.abandon("mapTwoRun",false);
    check(portable.inventory.get("ripple")==8 && portable.loadout.get("ripple")==3,"interrupted pre-apply run returns full reserved quantities");

    RewardLedger credits=new RewardLedger();credits.begin("creditRun","hardMap");credits.applied("creditRun");
    check(credits.progress("creditRun",8,25,waves(),counts())==0 && credits.balance==350,"started wave alone grants no crystals");
    check(credits.progress("creditRun",8,25,waves(1,3),counts())==10 && credits.balance==360,"each distinct cleared wave grants5");
    check(credits.progress("creditRun",9,25,waves(3,2,1),counts())==5 && credits.balance==365,"overlapping out-of-order clears grant only newly seen ID");
    check(credits.progress("creditRun",9,25,waves(1,2,3),counts())==0 && credits.balance==365,"duplicate clear report cannot pay twice");
    rejects(()->credits.progress("creditRun",10,25,waves(26),counts()),"out-of-map clear ID rejected");
    check(credits.balance==365 && credits.runs.get("creditRun").clearedWaves.size()==3,"invalid clear report is atomic");
    RewardLedger.Receipt receipt=credits.finish("creditRun",true,"hard",25,true);
    check(receipt.earned==165 && credits.balance==515,"receipt includes previously credited waves without paying them again");
    check(credits.finish("creditRun",false,"hard",25,true)==receipt && credits.balance==515,"duplicate terminal callback grants nothing again");
    credits.begin("hardReplay","hardMap");credits.applied("hardReplay");
    check(credits.finish("hardReplay",true,"hard",25,true).earned==100,"replay completion has no second first-clear bonus");
    RewardLedger quits=new RewardLedger();quits.begin("quit","map");quits.applied("quit");
    quits.progress("quit",2,25,waves(1),counts());quits.abandon("quit",true);
    check(quits.balance==355 && quits.finish("quit",true,"hard",25,true)==null,"quit keeps already earned wave credit but adds no finish award");
    rejects(()->quits.finish("unknown",true,"hard",25,true),"unknown session cannot create a reward");
    rejects(()->quits.progress("quit",25,25,waves(2),counts()),"settled session cannot add late wave credit");

    RewardLedger crash=rich();crash.buy("ripple",5);crash.begin("crash","map");crash.applied("crash");
    crash.progress("crash",1,25,waves(),counts("ripple",4));crash.recoverInterrupted();
    check(!crash.inventory.containsKey("ripple"),"applied crash does not refund potentially stale remaining snapshot");
    RewardLedger untrusted=rich();untrusted.buy("ripple",5);untrusted.begin("end","map");untrusted.applied("end");
    untrusted.finish("end",false,"hard",25);
    check(!untrusted.inventory.containsKey("ripple"),"finish without authoritative terminal inventory conservatively refunds nothing");

    storeChecks();
    liveChecks();
    resumeChecks();
    System.out.println("RESULT "+checks+" checks passed; emulatorUsed=false; host preferences I/O simulated");
  }

  private static void storeChecks() {
    Ctx context=new Ctx();RewardStore store=new RewardStore(context);
    check(store.balance()==350,"new persisted wallet gets starter gift once");
    store.buy("supply",1);Ctx restart=context.restart();RewardStore reopened=new RewardStore(restart);
    check(reopened.balance()==320 && reopened.inventory().get("supply")==1,"actual Store encode/decode preserves money and stock without another350gift");
    int balance=reopened.balance();restart.p.failNext=1;
    rejects(()->reopened.buy("ripple",1),"failed preference commit rejects purchase");
    check(reopened.balance()==balance && !reopened.inventory().containsKey("ripple"),"failed commit rolls back actual Store money and stock");
    check(new RewardStore(restart.restart()).balance()==balance,"rollback survives simulated process restart");
    restart.p.failNext=2;
    rejects(()->reopened.buy("ripple",1),"failed save and rollback are rejected");
    rejects(()->reopened.buy("supply",1),"uncertain persistence blocks further wallet mutations");

    Ctx terminal=new Ctx();RewardStore s=new RewardStore(terminal);s.buy("gauss_hardpoint",5);s.begin("native","map");s.applied("native");
    check(new JSONObject(s.config("native")).getJSONObject("items").getInt("gauss_hardpoint")==5,"config exports reserved building quantities");
    check(s.config("unknown").equals("{}"),"unknown session config is empty");
    check(s.progress("native",packet("wrong",2,waves(1),counts("gauss_hardpoint",0)),25)==0,"mismatched native session cannot credit or consume stock");
    check(s.progress("native",packet("native",3,waves(2,1),counts("gauss_hardpoint",0)),25)==10,"actual Store reads completed IDs and explicit zero remaining quota");
    check(s.active("native").containsKey("gauss_hardpoint") && s.active("native").get("gauss_hardpoint")==0,
      "active inventory retains consumed zero-count item for the readonly UI");
    int commits=terminal.p.commits;
    check(s.progress("native",packet("native",3,waves(1,2),counts("gauss_hardpoint",0)),25)==0 && terminal.p.commits==commits,"unchanged native snapshot avoids another persistence write");
    rejects(()->s.progress("native",packet("native",4,waves(3),counts()),25),"omitted remaining key is rejected before it can authorize stale refund");
    rejects(()->s.progress("native",packet("native",4,waves(3),counts("unknown",0)),25),"unknown native item key rejected");
    rejects(()->s.progress("native",packet("native",4,waves(3),counts("gauss_hardpoint",0,"ripple",0)),25),"known but unselected native item key rejected");
    check(s.balance()==235,"invalid native inventories cannot grant wave3");
    RewardLedger.Receipt r=s.finish("native",false,"hard",25,true);
    check(r.earned==10 && s.inventory().isEmpty(),"terminal zero allowance is never refunded as unused stock");
    check(new RewardStore(terminal.restart()).inventory().isEmpty(),"zero quota remains consumed after serialization and restart");
    check(s.finish("native",false,"hard",25,true).earned==10 && s.balance()==235,"serialized Store terminal result is exactly once");

    Ctx malformed=new Ctx();RewardStore starter=new RewardStore(malformed);
    JSONObject record=new JSONObject(malformed.p.memory.get("ledger_v1"));record.getJSONObject("inventory").put("unknown",1);
    String bad=record.toString();malformed.p.seed(bad);RewardStore locked=new RewardStore(malformed);
    check(locked.balance()==0 && malformed.p.memory.get("ledger_v1").equals(bad),"unreadable saved stock is kept instead of erased or gifted again");
    rejects(()->locked.buy("ripple",1),"unreadable record prevents spending");

    Ctx legacy=new Ctx();JSONObject v1=new JSONObject().put("version",1).put("balance",175)
      .put("completed",new JSONArray().put("alreadyCleared"))
      .put("pending",new JSONObject().put("mapA",new JSONArray().put("fortress").put("research"))
        .put("mapB",new JSONArray().put("fortress").put("supply")))
      .put("milestones",new JSONObject().put("mapA",1))
      .put("runs",new JSONArray().put(new JSONObject().put("session","oldPre").put("map","mapC")
        .put("boosts",new JSONArray().put("fortress")).put("applied",false).put("settled",false))
        .put(new JSONObject().put("session","oldApplied").put("map","mapD")
          .put("boosts",new JSONArray().put("research")).put("applied",true).put("settled",false)));
    legacy.p.seed(v1.toString());RewardStore migrated=new RewardStore(legacy);
    check(migrated.balance()==175 && migrated.inventory().get("fortress")==3
      && migrated.inventory().get("research")==1 && migrated.inventory().get("supply")==1,"v1 map-bound pending purchases migrate into one portable bank");
    check(migrated.loadout().get("fortress")==3 && new JSONObject(legacy.p.memory.get("ledger_v1")).getInt("version")==3,"migration persists version3 and valid next-match quantities");
    RewardStore migratedAgain=new RewardStore(legacy.restart());
    check(migratedAgain.balance()==175 && migratedAgain.inventory().get("fortress")==3,"migration is not reapplied on next restart");
    migratedAgain.begin("afterMigration","alreadyCleared");migratedAgain.applied("afterMigration");
    check(migratedAgain.finish("afterMigration",true,"easy",15,true).earned==60,"migration retains completed-map first-clear history");
    Ctx above=new Ctx();JSONObject extra=new JSONObject(v1.toString());
    extra.getJSONObject("pending").put("mapExtra",new JSONArray().put("fortress"));above.p.seed(extra.toString());RewardStore preserved=new RewardStore(above);
    check(preserved.inventory().get("fortress")==4 && preserved.loadout().get("fortress")==3,"legacy purchased fortress stock above new cap is preserved without over-equipping");
    rejects(()->preserved.buy("missile_fortress",1),"legacy excess stock cannot add more fortresses");
  }


  private static RewardStore funded(Ctx context) {
    new RewardStore(context);
    JSONObject data=new JSONObject(context.p.memory.get("ledger_v1")).put("balance",100000);
    context.p.seed(data.toString());return new RewardStore(context);
  }
  private static JSONObject appliedQuote(String session,String tx,Map<String,Integer> remaining) {
    return new JSONObject().put("session",session).put("applied",true).put("transactionId",tx)
      .put("transactions",new JSONArray().put(tx)).put("pendingTransactions",new JSONArray())
      .put("remaining",new JSONObject(remaining));
  }
  private static JSONObject cleanReject(String session,String tx) {
    return new JSONObject().put("session",session).put("transactionId",tx).put("rejected",true)
      .put("transactionApplied",false).put("transactionPending",false).put("ok",false);
  }
  private static void liveChecks() {
    for(RewardCatalog.Item item:RewardCatalog.list()) {
      Ctx c=new Ctx();RewardStore s=funded(c);s.begin("live","map");s.applied("live");
      int qty=item.fortress||item.maxPerMatch==1?1:25;
      JSONObject tx=new JSONObject(s.reserveLive("live",item.id,qty));String id=tx.getString("transactionId");
      Map<String,Integer> left=item.nativeId.isEmpty()?counts():counts(item.id,qty);
      check(s.completeLive("live",id,appliedQuote("live",id,left).toString())
        && s.balance()==100000-item.price*qty && s.active("live").get(item.id)==qty,
        "live purchase applies "+item.id+" quantity"+qty+" with one charge");
      JSONObject initial=new JSONObject(s.config("live"));
      check(initial.getJSONObject("items").length()==0 && !initial.getBoolean("research") && !initial.getBoolean("supply"),
        "live purchase does not alter sealed boot config for "+item.id);
      if(item.nativeId.isEmpty()) rejects(()->s.reserveLive("live",item.id,1),"support purchase is once per match for "+item.id);
    }
    Ctx c=new Ctx();RewardStore s=new RewardStore(c);s.begin("live","map");s.applied("live");
    JSONObject request=new JSONObject(s.reserveLive("live","ripple",5));String tx=request.getString("transactionId");
    check(s.balance()==300 && new JSONObject(s.reserveLive("live","ripple",5)).getString("transactionId").equals(tx)
      && s.balance()==300,"same pending item and quantity retries stable UUID without charging twice");
    rejects(()->s.reserveLive("live","ripple",10),"different quantity cannot bypass pending purchase");
    check(!s.completeLive("live",tx,new JSONObject().put("session","live").put("ok",false).put("error","timeout").toString())
      && s.balance()==300,"generic error or timeout never refunds uncertain native effects");
    check(!s.completeLive("live",tx,new JSONObject().put("session","live").put("transactionId",tx).put("rejected",true).toString())
      && s.balance()==300,"unproven rejected flag without clean native status cannot refund");
    JSONObject pending=new JSONObject().put("session","live").put("transactions",new JSONArray())
      .put("pendingTransactions",new JSONArray().put(tx)).put("rejected",true).put("transactionId",tx)
      .put("transactionApplied",false).put("transactionPending",false);
    check(!s.completeLive("live",tx,pending.toString()) && s.balance()==300,"pending journal preempts contradictory clean rejection");
    JSONObject malformed=new JSONObject().put("session","live").put("transactions",new JSONObject().put(tx,true));
    rejects(()->s.completeLive("live",tx,malformed.toString()),"malformed transaction journal is not applied proof");
    check(s.balance()==300 && s.pendingLive("live").length()==1,"unknown native journal leaves reservation pending");
    check(!s.completeLive("live",tx,cleanReject("live",tx).toString()) && s.balance()==350,
      "explicit clean rejection refunds exactly once");
    s.completeLive("live",tx,cleanReject("live",tx).toString());check(s.balance()==350,"duplicate clean rejection cannot refund twice");
    JSONObject retry=new JSONObject(s.reserveLive("live","ripple",5));String nextTx=retry.getString("transactionId");
    check(!nextTx.equals(tx) && s.balance()==300,"new purchase after clean rejection gets a new identity");
    JSONObject quote=appliedQuote("live",nextTx,counts("ripple",5));
    check(s.completeLive("live",nextTx,quote.toString()) && s.active("live").get("ripple")==5,"applied transaction proof commits allowance");
    s.completeLive("live",nextTx,quote.toString());check(s.balance()==300 && s.active("live").get("ripple")==5,"duplicate applied acknowledgement never adds quota or charge");

    Ctx rollback=new Ctx();RewardStore r=new RewardStore(rollback);r.begin("rollback","map");r.applied("rollback");
    rollback.p.failNext=1;rejects(()->r.reserveLive("rollback","ripple",5),"failed initial reservation commit does not proceed to native purchase");
    check(r.balance()==350 && r.pendingLive("rollback").length()==0,"reservation save failure rolls back money and pending journal");
    String savedTx=new JSONObject(r.reserveLive("rollback","ripple",5)).getString("transactionId");
    JSONObject ack=appliedQuote("rollback",savedTx,counts("ripple",5));rollback.p.failNext=1;
    rejects(()->r.completeLive("rollback",savedTx,ack.toString()),"failed acknowledgement persistence leaves native-applied transaction recoverable");
    check(r.balance()==300 && r.pendingLive("rollback").length()==1,"failed acknowledgement does not refund or charge again");
    check(r.completeLive("rollback",savedTx,ack.toString()) && r.active("rollback").get("ripple")==5,
      "retry same native proof commits after transient disk failure");

    Ctx reconcile=new Ctx();RewardStore q=new RewardStore(reconcile);q.begin("quote","map");q.applied("quote");
    String qid=new JSONObject(q.reserveLive("quote","ripple",5)).getString("transactionId");
    JSONObject state=appliedQuote("quote",qid,counts("ripple",3));
    String packet=new JSONObject().put("wave",2).put("completedWaves",new JSONArray().put(1)).put("rewards",state).toString();
    check(q.progress("quote",packet,25)==5 && q.balance()==305 && q.pendingLive("quote").length()==0
      && q.active("quote").get("ripple")==3,"native progress reconciles applied pending purchase and wave credit atomically");
    check(q.progress("quote",packet,25)==0 && q.balance()==305,"duplicate reconciled progress cannot pay or grant twice");

    Ctx fortsCtx=new Ctx();RewardStore f=funded(fortsCtx);f.buy("fortress",2);f.begin("fort","map");f.applied("fort");
    int b=f.balance();rejects(()->f.reserveLive("fort","missile_fortress",2),"live combined fortress purchase cannot exceed3");
    check(f.balance()==b,"live fortress cap failure does not charge");
    String fid=new JSONObject(f.reserveLive("fort","missile_fortress",1)).getString("transactionId");
    f.completeLive("fort",fid,appliedQuote("fort",fid,counts("fortress",0,"missile_fortress",1)).toString());
    rejects(()->f.reserveLive("fort","fortress",1),"consumed fortresses still count toward cumulative match limit3");

    Ctx interrupted=new Ctx();RewardStore p=new RewardStore(interrupted);p.begin("pendingSave","map");p.applied("pendingSave");p.pinRun("pendingSave");
    String pid=new JSONObject(p.reserveLive("pendingSave","ripple",5)).getString("transactionId");
    RewardStore resumed=new RewardStore(interrupted.restart());
    check(resumed.balance()==300 && resumed.pendingLive("pendingSave").length()==1,"pinned pending purchase survives process restart without refund");
    resumed.resumeRun("pendingSave","map");
    check(new JSONObject(resumed.reserveLive("pendingSave","ripple",5)).getString("transactionId").equals(pid)
      && resumed.balance()==300,"resumed pending purchase retries original UUID without new charge");
    check(resumed.completeLive("pendingSave",pid,appliedQuote("pendingSave",pid,counts("ripple",5)).toString()),
      "native journal completes restored pending purchase once");
  }

  private static void resumeChecks() {
    Ctx context=new Ctx();RewardStore s=new RewardStore(context);s.buy("ripple",10);s.begin("saved","map");s.applied("saved");s.pinRun("saved");
    s.progress("saved",packet("saved",3,waves(1,2),counts("ripple",4)),25);s.abandon("saved",true);
    check(s.inventory().isEmpty() && s.balance()==260,"pinned suspended match holds unused stock without refunding wallet");
    s.buy("gauss_hardpoint",1);check(s.inventory().get("gauss_hardpoint")==1,"suspended saved match does not block ordinary Home purchases");
    s.resumeRun("saved","map");int balance=s.balance();
    check(s.progress("saved",packet("saved",2,waves(1,2),counts("ripple",8)),25)==0
      && s.active("saved").get("ripple")==4 && s.balance()==balance,"loading older save cannot increase consumed quota or repeat cleared-wave credit");
    check(s.resumeCaps("saved").getJSONObject("items").getInt("ripple")==10
      && s.resumeCaps("saved").getJSONObject("remaining").getInt("ripple")==4,"resume caps distinguish cumulative entitlement and allowed unused quota");
    s.progress("saved",packet("saved",4,waves(1,2,3),counts("ripple",4)),25);
    RewardLedger.Receipt won=s.finish("saved",true,"hard",25,true);int wonBalance=s.balance();
    check(won.earned==165 && wonBalance==390,"saved run credits completion only once on first win");
    s.resumeRun("saved","map");
    s.progress("saved",packet("saved",25,waves(1,2,3),counts("ripple",9)),25);
    RewardLedger.Receipt repeated=s.finish("saved",true,"hard",25,true);
    check(s.balance()==wonBalance && repeated.earned==165,"loading same run after win cannot farm wave or completion crystals");
    s.unpinRun("saved");check(s.inventory().get("ripple")==4 && s.loadout().get("ripple")==4,
      "deleting final save releases held unused quota once");
    s.unpinRun("saved");check(s.inventory().get("ripple")==4,"repeated unpin cannot return stock twice");
    check(s.pinnedRuns().length()==0,"deleted final saved run leaves no stale pin");
    s.begin("other","otherMap");s.applied("other");
    s.progress("other",packet("other",1,waves(),counts("ripple",0,"gauss_hardpoint",0)),25);
    s.finish("other",false,"easy",25,true);
    s.resumeRun("saved","map");
    check(s.resumeCaps("saved").getJSONObject("remaining").getInt("ripple")==0 && s.balance()==wonBalance,
      "missing previously returned stock does not block loading and does not recreate spent purchases");
    rejects(()->s.resumeRun("saved","wrongMap"),"saved run cannot change map identity");
    s.abandon("saved",true);rejects(()->s.resumeRun("missing","map"),"unknown saved wallet identity fails clearly without resetting money");
    check(s.balance()==wonBalance,"failed saved-run resume never resets or gifts wallet");

    Ctx legacy2=new Ctx();RewardStore beforeV2=new RewardStore(legacy2);beforeV2.buy("ripple",10);beforeV2.begin("v2run","v2map");beforeV2.applied("v2run");
    beforeV2.progress("v2run",packet("v2run",3,waves(1,2),counts("ripple",4)),25);beforeV2.finish("v2run",false,"hard",25,true);
    legacy2.p.seed(new JSONObject(legacy2.p.memory.get("ledger_v1")).put("version",2).toString());RewardStore fromV2=new RewardStore(legacy2);
    check(fromV2.balance()==260 && fromV2.inventory().get("ripple")==4,"v2 migration preserves existing wallet and returned stock without new gift");
    fromV2.pinRun("v2run");fromV2.resumeRun("v2run","v2map");
    check(fromV2.inventory().isEmpty() && fromV2.resumeCaps("v2run").getJSONObject("remaining").getInt("ripple")==4,
      "v2 terminal remaining is reclaimed from bank rather than duplicated on resume");
    fromV2.finish("v2run",true,"hard",25,true);int paidV2=fromV2.balance();
    legacy2.p.seed(new JSONObject(legacy2.p.memory.get("ledger_v1")).put("version",2).toString());RewardStore wonV2=new RewardStore(legacy2);
    wonV2.pinRun("v2run");wonV2.resumeRun("v2run","v2map");wonV2.finish("v2run",true,"hard",25,true);
    check(wonV2.balance()==paidV2,"v2 winning receipt infers completion-paid history and cannot pay again after migration");
    RewardLedger unknownInventory=rich();unknownInventory.buy("ripple",5);unknownInventory.begin("discarded","map");unknownInventory.applied("discarded");
    unknownInventory.finish("discarded",false,"hard",25);unknownInventory.pinRun("discarded");unknownInventory.resumeRun("discarded","map");
    check(unknownInventory.runs.get("discarded").remaining.get("ripple")==0,
      "late resume of untrusted unpinned settlement cannot recreate stale building quota");

    RewardLedger history=new RewardLedger();history.begin("protected","map");history.applied("protected");history.pinRun("protected");history.abandon("protected",false);
    for(int i=0;i<135;i++){String id="history"+i;history.begin(id,"map");history.applied(id);history.finish(id,false,"easy",15);}
    check(history.runs.containsKey("protected") && !history.runs.containsKey("history0"),"save-pinned run survives normal128-record pruning");
    history.resumeRun("protected","map");check(!history.runs.get("protected").suspended,"pruning-protected saved run can reopen");

    Ctx orphanContext=new Ctx();RewardStore orphan=new RewardStore(orphanContext);
    orphan.buy("ripple",5);orphan.begin("deletedFile","map");orphan.applied("deletedFile");orphan.pinRun("deletedFile");
    orphan.progress("deletedFile",packet("deletedFile",1,waves(),counts("ripple",3)),25);orphan.abandon("deletedFile",true);
    JSONArray pins=orphan.pinnedRuns();
    check(pins.length()==1 && "deletedFile".equals(pins.getString(0)),"pin snapshot identifies logical saved-run identity");
    pins.put("untrusted");check(orphan.pinnedRuns().length()==1,"pin snapshot cannot mutate wallet state");
    orphanContext.p.failNext=1;
    rejects(()->orphan.unpinRun("deletedFile"),"failed delete reconciliation keeps reservation and pin atomic");
    check(orphan.pinnedRuns().length()==1 && orphan.inventory().isEmpty(),"failed unpin is retryable without partial stock return");
    Ctx retryContext=orphanContext.restart();RewardStore retry=new RewardStore(retryContext);
    check(retry.pinnedRuns().length()==1,"stale pin survives restart for missing-file reconciliation");
    JSONArray stalePins=retry.pinnedRuns();
    for(int i=0;i<stalePins.length();i++) retry.unpinRun(stalePins.getString(i));
    check(retry.pinnedRuns().length()==0 && retry.inventory().get("ripple")==3,
      "startup missing-file reconciliation releases only held unused stock");
    RewardStore reconciled=new RewardStore(retryContext.restart());
    check(reconciled.pinnedRuns().length()==0 && reconciled.inventory().get("ripple")==3,
      "reconciled pin and returned stock persist once across later restart");
  }

  private static final class Ctx extends Context {
    final MemoryPreferences p=new MemoryPreferences();
    public SharedPreferences getSharedPreferences(String name,int mode) { return p; }
    Ctx restart(){Ctx c=new Ctx();c.p.memory.putAll(p.durable);c.p.durable.putAll(p.durable);return c;}
  }
  private static final class MemoryPreferences implements SharedPreferences {
    final Map<String,String> memory=new LinkedHashMap<>(),durable=new LinkedHashMap<>();int failNext,commits;
    void seed(String value){memory.put("ledger_v1",value);durable.put("ledger_v1",value);}
    public String getString(String key,String fallback){return memory.getOrDefault(key,fallback);}
    public Editor edit(){return new Editor(){final Map<String,String> changes=new LinkedHashMap<>();
      public Editor putString(String key,String value){changes.put(key,value);return this;}
      public boolean commit(){commits++;memory.putAll(changes);if(failNext>0){failNext--;return false;}
        durable.clear();durable.putAll(memory);return true;}};}
  }
}
