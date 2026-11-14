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
import org.json.JSONObject;

/** Actual store implementation; all native bytes and directories are host fixtures. */
final class CheckFfaSave060 {
  private static int checks;
  private interface Action { void run() throws Exception; }
  private static void check(boolean value, String label) {
    if (!value) throw new AssertionError(label);
    checks++;
  }
  private static void rejects(Action action, String label) throws Exception {
    try { action.run(); } catch (Exception expected) { checks++; return; }
    throw new AssertionError(label);
  }
  private static final class HostContext extends Context {
    private final File dir;
    HostContext(Path dir) { this.dir = dir.toFile(); }
    @Override public File getFilesDir() { return dir; }
  }
  private static JSONObject metadata(String mode, String difficulty) {
    JSONObject value = new JSONObject().put("session", "ffa-host-060").put("gameTime", 45000)
        .put("mapId", "ffa".equals(mode) ? "emag" : "campaign".equals(mode) ? "CAM_1A" : "beginner")
        .put("nativeLevel", "ffa".equals(mode) ? "FFA-EMAG-T1" : "campaign".equals(mode) ? "CAM_1A" : "WT-E01-T1")
        .put("difficulty", difficulty);
    if (mode != null) value.put("mode", mode);
    return value;
  }
  private static JSONObject files(JSONObject metadata) {
    JSONObject value = new JSONObject();
    for (String name : new String[]{"gam.json", "main.json", "gameinfo.json", "scriptstate.json", "game.map"}) {
      String raw = "gam.json".equals(name) ? new JSONObject().put("levelName", metadata.getString("nativeLevel"))
          .put("gameTime", metadata.getLong("gameTime")).toString() : "{}";
      value.put(name, Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8)));
    }
    return value;
  }
  private static Path slot(Path root, String mode, String id) { return root.resolve(mode + "-saved-games/" + id + ".zip"); }
  private static void rewriteMetadata(Path target, String field, Object replacement) throws Exception {
    Map<String, byte[]> entries = new LinkedHashMap<>();
    try (ZipFile zip = new ZipFile(target.toFile())) {
      for (var iterator = zip.entries(); iterator.hasMoreElements();) {
        ZipEntry entry = iterator.nextElement();
        byte[] bytes = zip.getInputStream(entry).readAllBytes();
        if (entry.getName().equals("metadata.json")) bytes = new JSONObject(new String(bytes, StandardCharsets.UTF_8))
            .put(field, replacement).toString().getBytes(StandardCharsets.UTF_8);
        entries.put(entry.getName(), bytes);
      }
    }
    try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(target))) {
      for (var entry : entries.entrySet()) { zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry(); }
    }
  }
  public static void main(String[] args) throws Exception {
    Path root = Path.of(args[0]); Files.createDirectories(root);
    HostContext context = new HostContext(root);
    SaveGameStore towers = new SaveGameStore(context), campaign = new SaveGameStore(context, true), ffa = new SaveGameStore(context, "ffa");
    for (String invalid : new String[]{"duel", "tower-defense", "FFA", "", "../ffa"})
      rejects(() -> new SaveGameStore(context, invalid), "constructor rejects " + invalid);
    rejects(() -> new SaveGameStore(context, (String)null), "constructor rejects null");
    Map<String, SaveGameStore> stores = Map.of("towers", towers, "campaign", campaign, "ffa", ffa);
    Map<String, String> slots = new LinkedHashMap<>();
    for (String mode : stores.keySet()) {
      JSONObject meta = metadata(mode.equals("towers") ? null : mode, "medium");
      String id = stores.get(mode).save(meta, files(meta)); slots.put(mode, id);
      check(stores.get(mode).load(id).getJSONObject("files").similar(files(meta)), mode + " complete native bytes roundtrip");
      check(new SaveGameStore(context, mode).list().length() == 1, mode + " survives restart");
    }
    check(new SaveGameStore(context, false).load(slots.get("towers")).getJSONObject("metadata").optString("mode").isEmpty(), "boolean false preserves mode-less Towers save");
    for (String known : new String[]{"tower-defense", "towers", ""}) {
      JSONObject meta = metadata(known, "easy"); String id = towers.save(meta, files(meta));
      check(towers.load(id).getJSONObject("metadata").getString("mode").equals(known), "known Towers metadata preserved: " + known);
    }
    for (String from : stores.keySet()) for (String to : stores.keySet()) {
      if (from.equals(to)) continue;
      JSONObject wrong = metadata(from.equals("towers") ? null : from, "medium");
      rejects(() -> stores.get(to).save(wrong, files(wrong)), from + " cannot save into " + to);
      Path source = slot(root, from, slots.get(from)), target = slot(root, to, slots.get(from));
      byte[] original = Files.readAllBytes(source); int before = stores.get(to).list().length();
      Files.copy(source, target);
      check(stores.get(to).list().length() == before, "foreign " + from + " archive hidden from " + to);
      rejects(() -> stores.get(to).load(slots.get(from)), "foreign " + from + " archive cannot load in " + to);
      check(java.util.Arrays.equals(original, Files.readAllBytes(source)), "cross-store rejection preserves original " + from);
    }
    for (String unknown : new String[]{"duel", "skirmish", "FFA", "unknown"}) {
      JSONObject meta = metadata(unknown, "easy");
      for (SaveGameStore store : stores.values()) rejects(() -> store.save(meta, files(meta)), "unknown mode not accepted");
    }
    for (String difficulty : new String[]{"easy", "medium", "hard"}) {
      JSONObject meta = metadata("ffa", difficulty); String id = ffa.save(meta, files(meta));
      JSONObject loaded = new SaveGameStore(context, "ffa").load(id).getJSONObject("metadata");
      check(loaded.getString("difficulty").equals(difficulty) && loaded.getString("mapId").equals("emag")
          && loaded.getString("nativeLevel").equals("FFA-EMAG-T1"), "FFA identity survives " + difficulty);
      byte[] original = Files.readAllBytes(slot(root, "towers", slots.get("towers")));
      ffa.delete(id);
      check(java.util.Arrays.equals(original, Files.readAllBytes(slot(root, "towers", slots.get("towers")))), "FFA deletion preserves Towers bytes");
    }
    for (var change : Map.<String, Object>of("mode", "tower-defense", "mapId", "beginner", "nativeLevel", "Other-T1", "difficulty", "insane").entrySet()) {
      JSONObject bad = metadata("ffa", "easy").put(change.getKey(), change.getValue());
      rejects(() -> ffa.save(bad, files(bad)), "FFA rejects bad " + change.getKey() + " on save");
      JSONObject good = metadata("ffa", "easy"); String id = ffa.save(good, files(good));
      int visibleBefore = ffa.list().length();
      Path file = slot(root, "ffa", id); rewriteMetadata(file, change.getKey(), change.getValue());
      byte[] changed = Files.readAllBytes(file);
      rejects(() -> ffa.load(id), "FFA rejects changed " + change.getKey() + " on load");
      check(ffa.list().length() == visibleBefore - 1 && java.util.Arrays.equals(changed, Files.readAllBytes(file)), "tampered FFA slot hidden and untouched");
    }
    for (String difficulty : new String[]{"", "Easy", "Medium", "Hard", "0", "insane"}) {
      JSONObject bad = metadata("ffa", difficulty);
      rejects(() -> ffa.save(bad, files(bad)), "FFA rejects noncanonical difficulty " + difficulty);
    }
    check(new SaveGameStore(context, true).list().length() == 1, "Campaign unaffected by all FFA operations");
    System.out.println("PASS " + checks + " FFA save identity/isolation checks; synthetic native bytes, no emulator");
  }
}
