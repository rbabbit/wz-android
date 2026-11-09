package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual save store with synthetic native bytes and a host-private directory. */
final class SaveStoreCheck027 {
  private static int checks, groups, failures;
  private static Path base;
  private interface Action { void run() throws Exception; }
  private static void check(boolean value, String name) {
    if (!value) throw new AssertionError(name);
    checks++; System.out.println("PASS " + name);
  }
  private static void rejects(Action action, String name) throws Exception {
    try { action.run(); } catch (Exception expected) { checks++; System.out.println("PASS " + name); return; }
    throw new AssertionError(name);
  }
  private static void group(String name, Action action) {
    groups++;
    try { action.run(); } catch (Throwable error) { failures++;System.err.println("FAIL " + name + ": " + error);error.printStackTrace(); }
  }
  private static final class HostContext extends Context {
    final Path directory;
    HostContext() throws Exception { directory=Files.createTempDirectory(base,"save-fixture-"); }
    @Override public File getFilesDir() { return directory.toFile(); }
  }
  private static JSONObject metadata(String session) {
    return new JSONObject().put("session",session).put("mapId","beginner").put("mapName","Greenhaven")
      .put("difficulty","easy").put("wave",3).put("totalWaves",15).put("gameTime",12345).put("nativeLevel","WT-E01-T1");
  }
  private static JSONObject files() {
    return new JSONObject().put("gam.json",encode(new JSONObject().put("gameTime",12345).put("levelName","WT-E01-T1").toString()))
      .put("main.json",encode("{\"selectedPlayer\":0}"))
      .put("gameinfo.json",encode("{\"name\":\"synthetic-native-fixture\"}"))
      .put("scriptstate.json",encode("{\"wtreward_match\":{\"session\":\"saved-session\",\"completedWaves\":[1,2],\"consumed\":1}}"))
      .put("game.map",Base64.getEncoder().encodeToString(new byte[]{0,(byte)255,10,13,(byte)128,7}))
      .put("players/0/droids.json",encode("{\"nativeId\":73,\"x\":10,\"y\":18}"));
  }
  private static String encode(String value) { return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
  private static byte[] gam(String level) { return new JSONObject().put("gameTime",12345).put("levelName",level).toString().getBytes(StandardCharsets.UTF_8); }
  private static String hash(byte[] data) throws Exception {
    StringBuilder value=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))value.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return value.toString();
  }
  private static Path slot(HostContext context,String id) { return context.directory.resolve("towers-saved-games").resolve(id+".zip"); }
  private static byte[] entry(Path file,String name) throws Exception {
    try (ZipFile zip=new ZipFile(file.toFile())) { return zip.getInputStream(zip.getEntry(name)).readAllBytes(); }
  }
  private static void rewrite(Path file,Map<String,byte[]> replacements,Set<String> removed) throws Exception {
    check(file.toAbsolutePath().normalize().startsWith(base),"fixture mutation stays inside isolated test directory");
    Map<String,byte[]> entries=new LinkedHashMap<>();
    try (ZipFile zip=new ZipFile(file.toFile())) {
      Enumeration<? extends ZipEntry> iterator=zip.entries();
      while(iterator.hasMoreElements()) { ZipEntry e=iterator.nextElement();if(!removed.contains(e.getName()))entries.put(e.getName(),zip.getInputStream(e).readAllBytes()); }
    }
    entries.putAll(replacements);
    try (ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(file.toFile()))) {
      for(Map.Entry<String,byte[]> e:entries.entrySet()) {zip.putNextEntry(new ZipEntry(e.getKey()));zip.write(e.getValue());zip.closeEntry();}
    }
  }
  private static void noPartials(HostContext context) throws Exception {
    try(java.util.stream.Stream<Path> list=Files.list(context.directory.resolve("towers-saved-games"))) {
      check(list.noneMatch(p->p.getFileName().toString().endsWith(".partial")),"failed save leaves no permanent partial slot");
    }
  }
  public static void main(String[] args) throws Exception {
    base=Path.of(args[0]).toAbsolutePath().normalize();Files.createDirectories(base);
    group("complete roundtrip",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);JSONObject meta=metadata("saved-session"),input=files();
      meta.put("id","wt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").put("savedAt",Long.MAX_VALUE);
      String id=store.save(meta,input);JSONObject output=store.load(id),saved=output.getJSONObject("metadata");
      check(id.matches("wt_[a-f0-9]{32}")&&!id.equals(meta.getString("id")),"save assigns a new slot identity rather than trusting caller ID");
      check(saved.getInt("version")==1&&saved.getLong("savedAt")!=Long.MAX_VALUE,"store assigns version and save timestamp");
      check(saved.getString("session").equals("saved-session")&&saved.getString("mapId").equals("beginner")&&saved.getLong("gameTime")==12345,"map, reward session and game-time identities survive roundtrip");
      check(output.getJSONObject("files").similar(input),"complete binary, JSON and nested native files roundtrip byte-for-byte");
      check(Arrays.equals(Base64.getDecoder().decode(output.getJSONObject("files").getString("game.map")),new byte[]{0,(byte)255,10,13,(byte)128,7}),"non-text map bytes retain high bits and zero bytes");
      check(saved.getString("session").equals(new JSONObject(new String(Base64.getDecoder().decode(output.getJSONObject("files").getString("scriptstate.json")),StandardCharsets.UTF_8)).getJSONObject("wtreward_match").getString("session")),"reward run identity remains aligned with synthetic script state");
      SaveGameStore restarted=new SaveGameStore(c);check(restarted.list().length()==1&&restarted.hasRun("saved-session"),"restart lists existing slot and finds its reward run");
      check(restarted.load(id).getJSONObject("files").similar(input),"restart loads the complete stored file set");
      byte[] original=Files.readAllBytes(slot(c,id));String second=store.save(metadata("other-session"),files());
      check(!id.equals(second)&&Arrays.equals(original,Files.readAllBytes(slot(c,id))),"another save never overwrites the previous slot");
      JSONArray listing=store.list();long prior=Long.MAX_VALUE;for(int i=0;i<listing.length();i++){long now=listing.getJSONObject(i).getLong("savedAt");check(now<=prior,"saved list sorts newest timestamps first");prior=now;}
      check(store.delete(second).equals("other-session")&&store.list().length()==1&&store.hasRun("saved-session"),"delete removes only the selected slot and returns its session");
      check(Arrays.equals(original,Files.readAllBytes(slot(c,id))),"deleting another slot preserves every byte of the original");
      rejects(()->store.load(second),"deleted slot cannot be loaded");noPartials(c);
    });
    group("startup leftover partial",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String id=store.save(metadata("partial-session"),files());
      Path partial=c.directory.resolve("towers-saved-games/wt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.partial");Files.write(partial,new byte[]{80,75,3});
      check(new SaveGameStore(c).list().length()==1&&Files.exists(partial),"startup ignores and preserves incomplete partial bytes");
      check(store.load(id).getJSONObject("metadata").getString("session").equals("partial-session"),"leftover partial does not disturb a complete save");
    });
    group("unsafe filenames and IDs",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);
      for(String name:new String[]{"../escape.bin","/absolute.bin","folder\\bad.bin","folder//bad.bin","folder/./bad.bin","C:/bad.bin","folder/"}) {
        JSONObject unsafe=files().put(name,encode("fixture"));rejects(()->store.save(metadata("safe-session"),unsafe),"unsafe native path rejected: "+name);noPartials(c);
      }
      rejects(()->store.load("../outside"),"load rejects traversal slot identity");rejects(()->store.delete("wt_not-an-id"),"delete rejects malformed slot identity");
      rejects(()->store.save(metadata("../bad-session"),files()),"unsafe reward session rejected");
      rejects(()->store.save(metadata("safe-session").put("mapId","../map"),files()),"unsafe map identity rejected");
      check(store.list().length()==0&&!Files.exists(c.directory.resolve("escape.bin")),"invalid saves create neither visible slots nor escaped files");
    });
    group("required native file and JSON validation",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);
      for(String name:new String[]{"gam.json","main.json","gameinfo.json","scriptstate.json","game.map"}) {
        JSONObject incomplete=files();incomplete.remove(name);rejects(()->store.save(metadata("missing-file"),incomplete),"missing required native file rejected: "+name);
      }
      rejects(()->store.save(metadata("wrong-time").put("gameTime",12346),files()),"native gam time must match metadata on save");
      rejects(()->store.save(metadata("wrong-level").put("nativeLevel","OtherMap-T1"),files()),"native level must match metadata on save when provided");
      rejects(()->store.save(metadata("missing-level"),files().put("gam.json",encode("{\"gameTime\":12345}"))),"native gam level name is required on save");
      rejects(()->store.save(metadata("invalid-base64"),files().put("game.map","not!base64")),"invalid Base64 is rejected");
      check(store.list().length()==0,"validation failures never expose a save slot");noPartials(c);
    });
    group("manifest or native file corruption",()->{
      for(String mode:new String[]{"native","bytes","negative-bytes","oversized-bytes","sha","unexpected"}) {
        HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String id=store.save(metadata("corrupt-"+mode),files());Path file=slot(c,id);
        if(mode.equals("native"))rewrite(file,Map.of("native/game.map",new byte[]{1,2,3}),Set.of());
        if(mode.equals("bytes")||mode.equals("negative-bytes")||mode.equals("oversized-bytes")||mode.equals("sha")) {
          JSONObject manifest=new JSONObject(new String(entry(file,"manifest.json"),StandardCharsets.UTF_8));
          manifest.getJSONObject("game.map").put(mode.equals("sha")?"sha256":"bytes",
            mode.equals("sha")?"0".repeat(64):mode.equals("negative-bytes")?-1L:mode.equals("oversized-bytes")?2147483648L:7L);
          rewrite(file,Map.of("manifest.json",manifest.toString().getBytes(StandardCharsets.UTF_8)),Set.of());
        }
        if(mode.equals("unexpected"))rewrite(file,Map.of("native/unexpected.bin",new byte[]{1}),Set.of());
        byte[] corrupt=Files.readAllBytes(file);rejects(()->store.load(id),"damaged "+mode+" data is rejected on load");
        check(Arrays.equals(corrupt,Files.readAllBytes(file)),"failed load preserves damaged bytes for "+mode);
      }
    });
    group("duplicate ZIP entries",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String id=store.save(metadata("duplicate-entry"),files());Path file=slot(c,id);
      rewrite(file,Map.of("native/scriptstate.jsox",entry(file,"native/scriptstate.json")),Set.of());
      byte[] data=Files.readAllBytes(file),from="native/scriptstate.jsox".getBytes(StandardCharsets.UTF_8),to="native/scriptstate.json".getBytes(StandardCharsets.UTF_8);int changes=0;
      for(int i=0;i<=data.length-from.length;i++) {boolean match=true;for(int j=0;j<from.length;j++)if(data[i+j]!=from[j]){match=false;break;}if(match){System.arraycopy(to,0,data,i,to.length);changes++;i+=from.length-1;}}
      check(changes==2,"fixture rewrites both local and central ZIP names to create a duplicate");Files.write(file,data);
      rejects(()->store.load(id),"duplicate ZIP entry is rejected even with matching native bytes");
    });
    group("size and file limits",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);JSONObject many=files();
      for(int i=many.length();i<257;i++)many.put("extra-"+i+".bin",encode("x"));
      rejects(()->store.save(metadata("too-many-files"),many),"more than256 native files rejected");
      JSONObject large=files().put("large.bin",Base64.getEncoder().encodeToString(new byte[32*1024*1024+1]));
      rejects(()->store.save(metadata("too-many-bytes"),large),"raw native payload above32MiB rejected");
      check(store.list().length()==0,"oversized files do not expose visible slots");noPartials(c);
    });
    group("slot limit",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String first="";
      for(int i=0;i<40;i++){String id=store.save(metadata("slot-"+i),files());if(i==0)first=id;}
      check(store.list().length()==40,"exactly40 complete slots are supported");
      rejects(()->store.save(metadata("slot-overflow"),files()),"forty-first slot rejected");
      store.delete(first);check(store.save(metadata("replacement-slot"),files())!=null&&store.list().length()==40,"deleting a slot frees exactly one save place");noPartials(c);
    });
    group("load revalidates native metadata identity",()->{
      for(String field:new String[]{"gameTime","nativeLevel","session","mapId"}) {
        HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String id=store.save(metadata("bad-load-identity"),files());Path file=slot(c,id);
        JSONObject meta=new JSONObject(new String(entry(file,"metadata.json"),StandardCharsets.UTF_8))
          .put(field,field.equals("gameTime")?12346:field.equals("nativeLevel")?"OtherMap-T1":"../invalid");
        rewrite(file,Map.of("metadata.json",meta.toString().getBytes(StandardCharsets.UTF_8)),Set.of());
        rejects(()->store.load(id),"load rejects changed or unsafe metadata "+field);
      }
    });
    group("load revalidates complete native file set",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String id=store.save(metadata("bad-load-files"),files());Path file=slot(c,id);
      JSONObject manifest=new JSONObject(new String(entry(file,"manifest.json"),StandardCharsets.UTF_8));
      manifest.put("replacement.bin",manifest.remove("scriptstate.json"));
      rewrite(file,Map.of("manifest.json",manifest.toString().getBytes(StandardCharsets.UTF_8),"native/replacement.bin",entry(file,"native/scriptstate.json")),Set.of("native/scriptstate.json"));
      rejects(()->store.load(id),"load rejects a self-consistent manifest missing native scriptstate");
    });
    group("native GAM level byte boundary",()->{
      HostContext c=new HostContext();SaveGameStore store=new SaveGameStore(c);String allowed="A".repeat(19);
      String id=store.save(metadata("level-boundary").put("nativeLevel",allowed),files().put("gam.json",Base64.getEncoder().encodeToString(gam(allowed))));
      check(store.load(id).getJSONObject("metadata").getString("nativeLevel").equals(allowed),"19-byte native level name saves and loads unchanged");
      rejects(()->store.save(metadata("level-too-long").put("nativeLevel","A".repeat(20)),files().put("gam.json",Base64.getEncoder().encodeToString(gam("A".repeat(20))))),"20-byte native level name rejected before archiving");
      rejects(()->store.save(metadata("level-utf8").put("nativeLevel","é".repeat(10)),files().put("gam.json",Base64.getEncoder().encodeToString(gam("é".repeat(10))))),"native name bound counts UTF8 bytes rather than Java characters");
      Path file=slot(c,id);byte[] data=gam("A".repeat(20));
      JSONObject meta=new JSONObject(new String(entry(file,"metadata.json"),StandardCharsets.UTF_8)).put("nativeLevel","A".repeat(20));
      JSONObject manifest=new JSONObject(new String(entry(file,"manifest.json"),StandardCharsets.UTF_8));
      manifest.getJSONObject("gam.json").put("bytes",data.length).put("sha256",hash(data));
      rewrite(file,Map.of("metadata.json",meta.toString().getBytes(StandardCharsets.UTF_8),"manifest.json",manifest.toString().getBytes(StandardCharsets.UTF_8),"native/gam.json",data),Set.of());
      rejects(()->store.load(id),"load rejects an otherwise consistent archive with unsupported20-byte native level name");
    });
    group("every catalog native map name is saveable",()->{
      JSONArray levels=new JSONObject(Files.readString(Path.of(args[1]),StandardCharsets.UTF_8)).getJSONArray("levels");
      check(levels.length()==46,"all46 map native identities are audited for save compatibility");
      for(int i=0;i<levels.length();i++) {
        JSONObject level=levels.getJSONObject(i);String name=level.getString("mapName");
        check(!name.isEmpty()&&name.getBytes(StandardCharsets.UTF_8).length<20,"native GAM save name fits19bytes: "+level.getString("id"));
      }
    });
    System.out.println("SUMMARY checks="+checks+" groups="+groups+" failures="+failures);
    if(failures!=0)throw new AssertionError("Save store fixture groups failed: "+failures);
  }
}
