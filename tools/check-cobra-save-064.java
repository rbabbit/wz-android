package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual archive/launch classes. Cobra identity mutations are host fixtures, never engine saves. */
final class CheckCobraSave064 {
  private static int checks;
  private interface Action { void run() throws Exception; }
  private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
  private static void rejects(Action action, String label) throws Exception {
    try { action.run(); } catch (Exception expected) { checks++; return; }
    throw new AssertionError(label);
  }
  private static final class HostContext extends Context {
    private final File dir; HostContext(Path path) { dir=path.toFile(); }
    @Override public File getFilesDir() { return dir; }
  }
  private static JSONObject json(JSONObject files, String name) {
    return new JSONObject(new String(Base64.getDecoder().decode(files.getString(name)), StandardCharsets.UTF_8));
  }
  private static void put(JSONObject files, String name, JSONObject value) {
    files.put(name, Base64.getEncoder().encodeToString(value.toString().getBytes(StandardCharsets.UTF_8)));
  }
  private static JSONObject identityFixture(JSONObject legacy, String type, String difficulty) {
    JSONObject result=new JSONObject(legacy.toString()),meta=result.getJSONObject("metadata"),files=result.getJSONObject("files");
    int nativeDifficulty="hard".equals(difficulty)?3:"medium".equals(difficulty)?2:1;
    String name="cobra".equals(type)?"Cobra":"NullBot (ground)",script="cobra".equals(type)?"Cobra":"ffa-nullbot";
    meta.put("botType",type).put("difficulty",difficulty);
    JSONObject gam=json(files,"gam.json"),main=json(files,"main.json"),state=json(files,"scriptstate.json");
    for(int i=1;i<=3;i++) {
      gam.getJSONArray("netPlayers").getJSONObject(i).put("aiName",name).put("difficulty",nativeDifficulty);
      main.getJSONArray("players").getJSONObject(i).put("nameAI",name).put("difficulty",nativeDifficulty);
      state.getJSONObject("globals_"+i).put("scriptName",script);
    }
    state.getJSONObject("globals_0").getJSONObject("ffaConfig").put("difficulty",difficulty);
    put(files,"gam.json",gam);put(files,"main.json",main);put(files,"scriptstate.json",state);return result;
  }
  private static void rewriteMetadata(Path file, String botType) throws Exception {
    Map<String,byte[]> entries=new LinkedHashMap<>();
    try(ZipFile zip=new ZipFile(file.toFile())) {
      var iterator=zip.entries();while(iterator.hasMoreElements()) {
        ZipEntry entry=iterator.nextElement();byte[] data=zip.getInputStream(entry).readAllBytes();
        if(entry.getName().equals("metadata.json"))data=new JSONObject(new String(data,StandardCharsets.UTF_8)).put("botType",botType).toString().getBytes(StandardCharsets.UTF_8);
        entries.put(entry.getName(),data);
      }
    }
    try(ZipOutputStream zip=new ZipOutputStream(Files.newOutputStream(file))) {
      for(var entry:entries.entrySet()){zip.putNextEntry(new ZipEntry(entry.getKey()));zip.write(entry.getValue());zip.closeEntry();}
    }
  }
  public static void main(String[] args) throws Exception {
    Path root=Path.of(args[0]),original=Path.of(args[1]);Files.createDirectories(root);HostContext context=new HostContext(root);
    SaveGameStore ffa=new SaveGameStore(context,"ffa");byte[] originalBytes=Files.readAllBytes(original);
    JSONObject originalMeta;
    try(ZipFile zip=new ZipFile(original.toFile())){originalMeta=new JSONObject(new String(zip.getInputStream(zip.getEntry("metadata.json")).readAllBytes(),StandardCharsets.UTF_8));}
    String legacyId=originalMeta.getString("id");Path legacySlot=root.resolve("ffa-saved-games/"+legacyId+".zip");Files.copy(original,legacySlot);
    JSONObject legacy=ffa.load(legacyId);
    check(!legacy.getJSONObject("metadata").has("botType"),"Genuine pre-Cobra metadata stays absent");
    check(BattleLaunchSpec.ffaBotName(legacy.getJSONObject("metadata").optString("botType")).equals("NullBot"),"Legacy list label is actual NullBot");
    check(java.util.Arrays.equals(Files.readAllBytes(legacySlot),originalBytes),"Loading never rewrites the legacy archive");
    check(new BattleLaunchSpec("ffa","cannon","emag",false,"easy").ffaBotType.equals("cobra"),"All new starts default to Cobra");
    check(new BattleLaunchSpec("ffa","cannon","emag",false,"hard",null).ffaBotType.equals("nullbot"),"Missing saved identity routes legacy NullBot");
    rejects(()->new BattleLaunchSpec("ffa","cannon","emag",false,"easy","mixed"),"Unknown launch identity rejected");
    for(String difficulty:new String[]{"easy","medium","hard"}) {
      JSONObject value=identityFixture(legacy,"cobra",difficulty),meta=value.getJSONObject("metadata"),files=value.getJSONObject("files");
      String before=files.toString(),id=ffa.save(meta,files);JSONObject loaded=new SaveGameStore(context,"ffa").load(id);
      check(loaded.getJSONObject("metadata").getString("botType").equals("cobra"),"Cobra metadata survives "+difficulty);
      check(loaded.getJSONObject("files").similar(files),"Complete native bytes survive "+difficulty);
      check(files.toString().equals(before),"Saving does not mutate native input "+difficulty);
    }
    JSONObject nullbot=identityFixture(legacy,"nullbot","hard");String nullId=ffa.save(nullbot.getJSONObject("metadata"),nullbot.getJSONObject("files"));
    check(ffa.load(nullId).getJSONObject("metadata").getString("botType").equals("nullbot"),"Explicit new NullBot checkpoint remains NullBot");
    check(java.util.Arrays.equals(Files.readAllBytes(legacySlot),originalBytes),"Resaving legacy run leaves its old archive immutable");
    for(String type:new String[]{"unknown","mixed","Cobra","","../cobra"}) {
      JSONObject value=identityFixture(legacy,"cobra","easy");value.getJSONObject("metadata").put("botType",type);
      rejects(()->ffa.save(value.getJSONObject("metadata"),value.getJSONObject("files")),"Unknown metadata cannot archive "+type);
    }
    for(String declared:new String[]{"cobra","nullbot"}) {
      JSONObject value=identityFixture(legacy,declared.equals("cobra")?"nullbot":"cobra","medium");value.getJSONObject("metadata").put("botType",declared);
      rejects(()->ffa.save(value.getJSONObject("metadata"),value.getJSONObject("files")),"Native AI cannot be relabelled "+declared);
    }
    JSONObject missing=identityFixture(legacy,"cobra","easy");missing.getJSONObject("metadata").remove("botType");
    rejects(()->ffa.save(missing.getJSONObject("metadata"),missing.getJSONObject("files")),"Cobra cannot masquerade as metadata-less legacy NullBot");
    for(String mutation:new String[]{"mixed","difficulty","missing"}) {
      JSONObject value=identityFixture(legacy,"cobra","easy"),gam=json(value.getJSONObject("files"),"gam.json");
      if(mutation.equals("mixed"))gam.getJSONArray("netPlayers").getJSONObject(2).put("aiName","NullBot (ground)");
      else if(mutation.equals("difficulty"))gam.getJSONArray("netPlayers").getJSONObject(2).put("difficulty",3);
      else gam.remove("netPlayers");put(value.getJSONObject("files"),"gam.json",gam);
      rejects(()->ffa.save(value.getJSONObject("metadata"),value.getJSONObject("files")),"Native identity mismatch rejected "+mutation);
    }
    rewriteMetadata(legacySlot,"cobra");rejects(()->ffa.load(legacyId),"Tampered old archive cannot load as Cobra");
    check(java.util.Arrays.equals(Files.readAllBytes(original),originalBytes),"Genuine input fixture remains byte-identical");
    System.out.println(new JSONObject().put("passed",true).put("checksPassed",checks).put("genuineLegacyArchive",true).put("syntheticCobraIdentityFixture",true));
  }
}
