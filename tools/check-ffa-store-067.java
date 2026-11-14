package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual classes; two/three/four/six-player identity fixtures never run an engine. */
final class CheckFfaStore067 {
  static int checks;
  interface Action { void run() throws Exception; }
  static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
  static void rejects(Action action,String label)throws Exception{try{action.run();}catch(Exception expected){checks++;return;}throw new AssertionError(label);}
  static final class Host extends Context {final File dir;Host(Path path)throws Exception{Files.createDirectories(path);dir=path.toFile();}public File getFilesDir(){return dir;}}
  static JSONObject json(JSONObject files,String name){return new JSONObject(new String(Base64.getDecoder().decode(files.getString(name)),StandardCharsets.UTF_8));}
  static void put(JSONObject files,String name,JSONObject value){files.put(name,Base64.getEncoder().encodeToString(value.toString().getBytes(StandardCharsets.UTF_8)));}
  static JSONObject payload(Path file)throws Exception{
    try(ZipFile zip=new ZipFile(file.toFile())){JSONObject files=new JSONObject();var entries=zip.entries();while(entries.hasMoreElements()){ZipEntry e=entries.nextElement();if(e.getName().startsWith("native/"))files.put(e.getName().substring(7),Base64.getEncoder().encodeToString(zip.getInputStream(e).readAllBytes()));}return new JSONObject().put("metadata",new JSONObject(new String(zip.getInputStream(zip.getEntry("metadata.json")).readAllBytes(),StandardCharsets.UTF_8))).put("files",files);}
  }
  static JSONObject synthetic(JSONObject original,FfaMapCatalog.MapInfo map,String difficulty){
    // Minimal protocol records, not a native gameplay checkpoint. Full genuine
    // archives are independently loaded/copied above without any modification.
    JSONObject value=new JSONObject().put("metadata",new JSONObject(original.getJSONObject("metadata").toString())).put("files",new JSONObject());
    JSONObject meta=value.getJSONObject("metadata"),files=value.getJSONObject("files");
    int diff="hard".equals(difficulty)?3:"medium".equals(difficulty)?2:1;
    meta.put("mapId",map.id).put("mapName",map.name).put("players",map.players).put("bots",map.bots).put("nativeLevel",map.level).put("difficulty",difficulty).put("botType","cobra").put("session","synthetic-identity-"+map.id+"-"+difficulty);
    JSONObject gam=new JSONObject().put("gameTime",meta.getLong("gameTime")),main=new JSONObject(),state=new JSONObject().put("globals_0",new JSONObject().put("me",0).put("scriptName","init"));
    gam.put("levelName",map.level).put("multiMaxPlayers",map.players).put("netSelectedPlayer",0).put("multiAlliance",0);
    main.put("levelName",map.level).put("maxPlayers",map.players).put("selectedPlayer",0).put("allianceSetting",0);
    JSONArray net=new JSONArray(),players=new JSONArray();
    for(int i=0;i<map.players;i++){
      net.put(new JSONObject().put("aiName",i==0?"Nexus":"Cobra").put("difficulty",i==0?-2:diff).put("allocated",i==0?1:0).put("team",i).put("position",i));
      JSONArray alliances=new JSONArray();for(int j=0;j<map.players;j++)alliances.put(i==j?3:0);
      players.put(new JSONObject().put("index",i).put("nameAI",i==0?"Nexus":"Cobra").put("difficulty",i==0?-2:diff).put("allocated",i==0).put("team",i).put("position",i).put("alliances",alliances));
    }
    gam.put("netPlayers",net);main.put("players",players);
    for(String key:new java.util.ArrayList<String>(state.keySet()))if(key.matches("globals_[1-9][0-9]*"))state.remove(key);
    for(int i=1;i<map.players;i++)state.put("globals_"+i,new JSONObject().put("me",i).put("scriptName","Cobra"));
    state.getJSONObject("globals_0").put("ffaSession",meta.getString("session")).put("ffaOutcome","").put("ffaConfig",new JSONObject().put("mode","ffa").put("map",map.id).put("mapName",map.name).put("difficulty",difficulty).put("player",0).put("botType","cobra").put("players",map.players).put("bots",map.bots).put("level",map.level));
    put(files,"gam.json",gam);put(files,"main.json",main);put(files,"scriptstate.json",state);put(files,"gameinfo.json",new JSONObject());
    files.put("game.map",Base64.getEncoder().encodeToString(new byte[]{0,1,(byte)255,42}));return value;
  }
  static String hash(byte[] data)throws Exception{return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));}
  static Map<String,String> disk(Path dir)throws Exception{Map<String,String> result=new LinkedHashMap<>();try(var stream=Files.list(dir)){for(Path p:stream.sorted().toList())if(Files.isRegularFile(p))result.put(p.getFileName().toString(),hash(Files.readAllBytes(p)));}return result;}
  static void rejectAtomic(SaveGameStore store,Path dir,JSONObject value,String label)throws Exception{Map<String,String> before=disk(dir);rejects(()->store.save(value.getJSONObject("metadata"),value.getJSONObject("files")),label);check(disk(dir).equals(before),"Rejection preserves every existing ZIP and removes partial: "+label);}
  static void semanticArchive(Path path,JSONObject metadata,JSONObject files)throws Exception{
    JSONObject manifest=new JSONObject();try(ZipOutputStream zip=new ZipOutputStream(Files.newOutputStream(path))){
      write(zip,"metadata.json",metadata.toString().getBytes(StandardCharsets.UTF_8));
      for(String name:files.keySet()){byte[] bytes=Base64.getDecoder().decode(files.getString(name));manifest.put(name,new JSONObject().put("bytes",bytes.length).put("sha256",hash(bytes)));write(zip,"native/"+name,bytes);}
      write(zip,"manifest.json",manifest.toString().getBytes(StandardCharsets.UTF_8));
    }
  }
  static void write(ZipOutputStream zip,String name,byte[] value)throws Exception{zip.putNextEntry(new ZipEntry(name));zip.write(value);zip.closeEntry();}
  public static void main(String[]args)throws Exception{
    Path root=Path.of(args[0]);Host host=new Host(root);SaveGameStore store=new SaveGameStore(host,"ffa");Path dir=root.resolve("ffa-saved-games");
    JSONObject legacy=payload(Path.of(args[1])),cobra=payload(Path.of(args[2]));
    FfaMapCatalog catalog=FfaMapCatalog.get(host);check(catalog.maps().size()==51,"Actual FfaMapCatalog reads all fifty-one real assets");
    for(int players:new int[]{2,3,4})for(int number=1;number<=15;number++){
      String mapId="ntw-"+players+"p-"+String.format(java.util.Locale.ROOT,"%02d",number);
      check(FfaMapCatalog.playerCount(mapId)==players&&catalog.map(mapId)!=null,"Exact generated identity/player count: "+mapId);
      check(FfaMapCatalog.nativeLevel(mapId).equals("FFA-NTW"+players+"-"+String.format(java.util.Locale.ROOT,"%02d",number)+"-T1"),"Exact native level: "+mapId);
    }
    for(String bad:new String[]{"ntw-2p-00","ntw-2p-16","ntw-3p-1","ntw-5p-01","NTW-4p-01","ntw-4p-015","../ntw-2p-01"}){
      check(!FfaMapCatalog.isKnownId(bad)&&FfaMapCatalog.playerCount(bad)==0&&FfaMapCatalog.nativeLevel(bad)==null,"Reject malformed generated identity: "+bad);
      rejects(()->new BattleLaunchSpec("ffa","cannon",bad,true,"easy"),"Unknown generated launch rejected");
    }
    JSONObject actualCatalog=new JSONObject(Files.readString(Path.of(System.getProperty("host.assets")).resolve("ffa-maps.json")));
    JSONObject missingCatalog=new JSONObject(actualCatalog.toString());missingCatalog.getJSONArray("maps").remove(50);rejects(()->new FfaMapCatalog(missingCatalog),"Missing generated map rejected");
    JSONObject duplicateCatalog=new JSONObject(actualCatalog.toString());duplicateCatalog.getJSONArray("maps").put(50,new JSONObject(duplicateCatalog.getJSONArray("maps").getJSONObject(49).toString()));rejects(()->new FfaMapCatalog(duplicateCatalog),"Duplicate generated map rejected");
    JSONObject wrongSlots=new JSONObject(actualCatalog.toString());wrongSlots.getJSONArray("maps").getJSONObject(6).put("players",3);rejects(()->new FfaMapCatalog(wrongSlots),"Generated catalogue wrong slots rejected");
    for(Path original:new Path[]{Path.of(args[1]),Path.of(args[2]),Path.of(args[3])}){
      byte[] bytes=Files.readAllBytes(original);JSONObject p=payload(original);String id=p.getJSONObject("metadata").getString("id");Files.copy(original,dir.resolve(id+".zip"));JSONObject loaded=store.load(id);
      check(loaded.getJSONObject("files").similar(p.getJSONObject("files")),"Genuine native archive keeps all bytes: "+original.getFileName());check(Arrays.equals(bytes,Files.readAllBytes(dir.resolve(id+".zip"))),"Load does not rewrite archive");
    }
    check(!legacy.getJSONObject("metadata").has("players")&&!legacy.getJSONObject("metadata").has("botType"),"Actual old metadata defaults remain absent");
    for(FfaMapCatalog.MapInfo map:catalog.maps())for(String difficulty:new String[]{"easy","medium","hard"}){
      BattleLaunchSpec launch=new BattleLaunchSpec("ffa","cannon",map.id,true,difficulty);check(launch.mapId.equals(map.id)&&launch.ffaBotType.equals("cobra"),"Actual immutable launch identity");
      JSONObject value=synthetic(cobra,map,difficulty),files=value.getJSONObject("files"),meta=value.getJSONObject("metadata");String before=files.toString(),id=store.save(meta,files);JSONObject loaded=store.load(id);
      check(loaded.getJSONObject("files").similar(files)&&before.equals(files.toString()),"Synthetic identity is preserved without mutating input: "+map.id+" "+difficulty);store.delete(id);
    }
    rejects(()->new BattleLaunchSpec("ffa","cannon","unknown",false,"easy"),"Unknown explicit launch map rejected");
    check(new BattleLaunchSpec("ffa","cannon",null,false,"easy").mapId.equals("emag"),"Absent legacy map defaults EMAG");
    check(new BattleLaunchSpec("ffa","cannon","emag",false,"easy",null).ffaBotType.equals("nullbot"),"Legacy bot family remains NullBot");
    FfaMapCatalog.MapInfo six=catalog.map("emaj-6p");
    for(FfaMapCatalog.MapInfo corruptedMap:new FfaMapCatalog.MapInfo[]{catalog.map("ntw-2p-01"),catalog.map("ntw-3p-01"),catalog.map("ntw-4p-01"),catalog.map("contact"),six})
    for(String mutation:new String[]{"map","level","slots","missing-slots","bots","missing-bots","difficulty","gam-slots","gam-selected","gam-alliance","gam-human","gam-bot5","gam-team5","main-slots","main-selected","main-alliance","main-team5","main-owner5","main-duplicate","main-missing","allied","self-alliance","short-alliance","missing-context5","wrong-context5","wrong-me5"}){
      int last=corruptedMap.players-1;
      JSONObject value=synthetic(cobra,corruptedMap,"medium"),meta=value.getJSONObject("metadata"),files=value.getJSONObject("files"),gam=json(files,"gam.json"),main=json(files,"main.json"),scripts=json(files,"scriptstate.json");
      switch(mutation){
        case "map":meta.put("mapId","emag");break;case "level":meta.put("nativeLevel","FFA-EMAG-T1");break;case "slots":meta.put("players",1);break;case "missing-slots":meta.remove("players");break;case "bots":meta.put("bots",corruptedMap.bots+1);break;case "missing-bots":meta.remove("bots");break;case "difficulty":meta.put("difficulty","hard");break;
        case "gam-slots":gam.put("multiMaxPlayers",1);break;case "gam-selected":gam.put("netSelectedPlayer",1);break;case "gam-alliance":gam.put("multiAlliance",1);break;case "gam-human":gam.getJSONArray("netPlayers").getJSONObject(0).put("allocated",0);break;case "gam-bot5":gam.getJSONArray("netPlayers").getJSONObject(last).put("aiName","NullBot (ground)");break;case "gam-team5":gam.getJSONArray("netPlayers").getJSONObject(last).put("team",0);break;
        case "main-slots":main.put("maxPlayers",1);break;case "main-selected":main.put("selectedPlayer",1);break;case "main-alliance":main.put("allianceSetting",1);break;case "main-team5":main.getJSONArray("players").getJSONObject(last).put("team",0);break;case "main-owner5":main.getJSONArray("players").getJSONObject(last).put("allocated",true);break;case "main-duplicate":main.getJSONArray("players").put(new JSONObject(main.getJSONArray("players").getJSONObject(last).toString()));break;case "main-missing":main.getJSONArray("players").remove(last);break;
        case "allied":main.getJSONArray("players").getJSONObject(1).getJSONArray("alliances").put(0,3);break;case "self-alliance":main.getJSONArray("players").getJSONObject(last).getJSONArray("alliances").put(last,0);break;case "short-alliance":main.getJSONArray("players").getJSONObject(last).put("alliances",new JSONArray().put(0));break;
        case "missing-context5":scripts.remove("globals_"+last);break;case "wrong-context5":scripts.getJSONObject("globals_"+last).put("scriptName","ffa-nullbot");break;case "wrong-me5":scripts.getJSONObject("globals_"+last).put("me",0);break;
      }
      put(files,"gam.json",gam);put(files,"main.json",main);put(files,"scriptstate.json",scripts);rejectAtomic(store,dir,value,corruptedMap.id+":"+mutation);
    }
    // Corrupt an already-existing archive with a valid updated manifest: this
    // must reach semantic identity validation rather than merely fail a hash.
    JSONObject corrupt=synthetic(cobra,six,"easy"),badMain=json(corrupt.getJSONObject("files"),"main.json");badMain.getJSONArray("players").getJSONObject(5).put("nameAI","Nexus");put(corrupt.getJSONObject("files"),"main.json",badMain);
    String badId="wt_"+UUID.randomUUID().toString().replace("-","");JSONObject badMeta=corrupt.getJSONObject("metadata").put("id",badId).put("version",1);Path badPath=dir.resolve(badId+".zip");semanticArchive(badPath,badMeta,corrupt.getJSONObject("files"));byte[] badBytes=Files.readAllBytes(badPath);rejects(()->store.load(badId),"Corrupted native existing archive rejected");check(Arrays.equals(badBytes,Files.readAllBytes(badPath)),"Failed load never deletes or rewrites existing ZIP");
    JSONArray gaps=new JSONArray();
    for(String mutation:new String[]{"duplicate-context","context-out-of-range","rules-duplicate","rules-missing","native-session","native-mode","native-map","native-difficulty","native-player","native-botType","native-players","native-level","missing-modern-botType","missing-modern-players","missing-modern-level","native-terminal"}){
      Map<String,String> diskBefore=disk(dir);
      JSONObject value=synthetic(cobra,six,"easy"),scripts=json(value.getJSONObject("files"),"scriptstate.json");
      if(mutation.equals("duplicate-context"))scripts.put("globals_99",new JSONObject().put("me",2).put("scriptName","Cobra"));
      else if(mutation.equals("context-out-of-range"))scripts.put("globals_99",new JSONObject().put("me",6).put("scriptName","Cobra"));
      else if(mutation.equals("rules-duplicate"))scripts.put("globals_98",new JSONObject(scripts.getJSONObject("globals_0").toString()));
      else if(mutation.equals("rules-missing")){scripts.getJSONObject("globals_0").remove("ffaConfig");scripts.getJSONObject("globals_0").remove("ffaSession");}
      else if(mutation.equals("native-session"))scripts.getJSONObject("globals_0").put("ffaSession","other-run");
      else if(mutation.equals("native-mode"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("mode","campaign");
      else if(mutation.equals("native-map"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("map","emag");
      else if(mutation.equals("native-difficulty"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("difficulty","hard");
      else if(mutation.equals("native-player"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("player",1);
      else if(mutation.equals("native-botType"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("botType","nullbot");
      else if(mutation.equals("native-players"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("players",4);
      else if(mutation.equals("native-level"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").put("level","FFA-EMAG-T1");
      else if(mutation.startsWith("missing-modern-"))scripts.getJSONObject("globals_0").getJSONObject("ffaConfig").remove(mutation.substring("missing-modern-".length()));
      else scripts.getJSONObject("globals_0").put("ffaOutcome","victory");
      put(value.getJSONObject("files"),"scriptstate.json",scripts);boolean rejected=false;String id=null;try{id=store.save(value.getJSONObject("metadata"),value.getJSONObject("files"));}catch(Exception expected){rejected=true;}if(id!=null)store.delete(id);if(!rejected)gaps.put(mutation);else checks++;
      check(disk(dir).equals(diskBefore),"Rules/context rejection preserves all old ZIPs and leaves no partial: "+mutation);
    }
    System.out.println(new JSONObject().put("passed",gaps.isEmpty()).put("checksPassed",checks).put("gaps",gaps).put("genuineNativeArchives",3).put("syntheticMapDifficultyIdentityCases",153).put("syntheticWorldsNeverExecuted",true));
  }
}
