package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Complete native save folders, atomically archived in private phone storage. */
final class SaveGameStore {
  private static final int MAX_BYTES = 32 * 1024 * 1024, MAX_FILES = 256, MAX_SLOTS = 40;
  private static final String[] REQUIRED_FILES = {"gam.json", "main.json", "gameinfo.json", "scriptstate.json", "game.map"};
  private final File root;
  private final String mode;

  SaveGameStore(Context context) {
    this(context, "towers");
  }

  SaveGameStore(Context context, boolean campaign) {
    this(context, campaign ? "campaign" : "towers");
  }

  SaveGameStore(Context context, String mode) {
    if (!"towers".equals(mode) && !"campaign".equals(mode) && !"ffa".equals(mode) && !"survival".equals(mode) && !"challenge".equals(mode))
      throw new IllegalArgumentException("Invalid saved game mode.");
    this.mode = mode;
    root = new File(context.getFilesDir(), mode + "-saved-games");
    if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Saved Games storage is unavailable.");
  }

  synchronized String save(JSONObject metadata, JSONObject encodedFiles) throws Exception {
    if (list().length() >= MAX_SLOTS) throw new IOException("Delete an old saved game before creating another.");
    if (encodedFiles.length() < 5 || encodedFiles.length() > MAX_FILES) throw new IOException("The native save is incomplete.");
    for (String name : REQUIRED_FILES)
      if (!encodedFiles.has(name)) throw new IOException("The native save is missing " + name + ".");
    validateIdentity(metadata);
    String id = "wt_" + UUID.randomUUID().toString().replace("-", "");
    JSONObject meta = new JSONObject(metadata.toString()).put("id", id).put("savedAt", System.currentTimeMillis()).put("version", 1);
    JSONObject manifest = new JSONObject();
    File partial = file(id, ".partial"), target = file(id, ".zip");
    int total = 0;
    try {
      try (FileOutputStream output = new FileOutputStream(partial); ZipOutputStream zip = new ZipOutputStream(output)) {
        write(zip, "metadata.json", meta.toString().getBytes(StandardCharsets.UTF_8));
        for (Iterator<String> it = encodedFiles.keys(); it.hasNext();) {
          String name = it.next(); safeName(name);
          String encoded = encodedFiles.getString(name);
          if (encoded.length() > MAX_BYTES * 2) throw new IOException("The saved game is too large.");
          byte[] data = Base64.getDecoder().decode(encoded);
          total = Math.addExact(total, data.length);
          if (total > MAX_BYTES) throw new IOException("The saved game is too large.");
          if ("gam.json".equals(name)) validateNativeGam(meta, data);
          manifest.put(name, new JSONObject().put("bytes", data.length).put("sha256", hash(data)));
          write(zip, "native/" + name, data);
        }
        write(zip, "manifest.json", manifest.toString().getBytes(StandardCharsets.UTF_8));
        zip.finish(); output.getFD().sync();
      }
      read(partial, id); // CRC and SHA validation before the slot becomes visible.
      try { Files.move(partial.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE); }
      catch (AtomicMoveNotSupportedException error) { Files.move(partial.toPath(), target.toPath()); }
      return id;
    } finally { if (partial.exists()) Files.delete(partial.toPath()); }
  }

  synchronized JSONArray list() {
    List<JSONObject> values = new ArrayList<>();
    File[] files = root.listFiles((dir, name) -> name.matches("wt_[a-f0-9]{32}\\.zip"));
    if (files != null) for (File file : files) {
      try (ZipFile zip = new ZipFile(file)) {
        JSONObject meta = new JSONObject(new String(bytes(zip, "metadata.json", 65536), StandardCharsets.UTF_8));
        validateIdentity(meta);
        if (file.getName().equals(meta.getString("id") + ".zip")) values.add(meta);
      } catch (Exception ignored) { /* Keep unreadable bytes; never delete another slot. */ }
    }
    values.sort(Comparator.comparingLong((JSONObject item) -> item.optLong("savedAt")).reversed());
    return new JSONArray(values);
  }

  synchronized JSONObject load(String id) throws Exception { return read(file(id, ".zip"), id); }
  synchronized boolean hasRun(String session) {
    JSONArray slots = list();
    for (int i = 0; i < slots.length(); i++) if (session.equals(slots.optJSONObject(i).optString("challenge".equals(mode) ? "rewardRunId" : "session"))) return true;
    return false;
  }
  synchronized String delete(String id) throws Exception {
    File target = file(id, ".zip");
    JSONObject metadata;
    try (ZipFile zip = new ZipFile(target)) {
      metadata = new JSONObject(new String(bytes(zip, "metadata.json", 65536), StandardCharsets.UTF_8));
    }
    Files.delete(target.toPath());
    return metadata.getString("challenge".equals(mode) ? "rewardRunId" : "session");
  }

  private JSONObject read(File source, String id) throws Exception {
    try (ZipFile zip = new ZipFile(source)) {
      JSONObject meta = new JSONObject(new String(bytes(zip, "metadata.json", 65536), StandardCharsets.UTF_8));
      if (meta.getInt("version") != 1 || !id.equals(meta.getString("id"))) throw new IOException("Invalid save metadata.");
      validateIdentity(meta);
      JSONObject manifest = new JSONObject(new String(bytes(zip, "manifest.json", 256 * 1024), StandardCharsets.UTF_8));
      if (manifest.length() < 5 || manifest.length() > MAX_FILES) throw new IOException("Incomplete saved game.");
      for (String name : REQUIRED_FILES)
        if (!manifest.has(name)) throw new IOException("The saved game is missing " + name + ".");
      Set<String> expected = new HashSet<>(); expected.add("metadata.json"); expected.add("manifest.json");
      JSONObject encoded = new JSONObject(); int total = 0;
      byte[] gamData = null, mainData = null, scriptData = null;
      for (Iterator<String> it = manifest.keys(); it.hasNext();) {
        String name = it.next(); safeName(name); String entry = "native/" + name; expected.add(entry);
        JSONObject check = manifest.getJSONObject(name);
        long expectedBytes = check.getLong("bytes");
        if (expectedBytes < 0 || expectedBytes > MAX_BYTES || expectedBytes > MAX_BYTES - total)
          throw new IOException("A saved game file has an invalid size.");
        byte[] data = bytes(zip, entry, (int) expectedBytes);
        total = Math.addExact(total, data.length);
        if (total > MAX_BYTES || data.length != expectedBytes || !hash(data).equals(check.getString("sha256")))
          throw new IOException("A saved game file is incomplete or damaged.");
        if ("gam.json".equals(name)) gamData = data;
        if ("main.json".equals(name)) mainData = data;
        if ("scriptstate.json".equals(name)) scriptData = data;
        encoded.put(name, Base64.getEncoder().encodeToString(data));
      }
      validateNativeGam(meta, gamData);
      if ("ffa".equals(meta.optString("mode"))) validateFfaArchive(meta, mainData, scriptData);
      if ("survival".equals(mode)) validateSurvivalArchive(meta, scriptData);
      if ("challenge".equals(mode)) validateChallengeArchive(meta, gamData, mainData, scriptData);
      Set<String> actual = new HashSet<>();
      Enumeration<? extends ZipEntry> entries = zip.entries();
      while (entries.hasMoreElements()) if (!actual.add(entries.nextElement().getName())) throw new IOException("Duplicate saved game file.");
      if (!actual.equals(expected)) throw new IOException("Unexpected saved game contents.");
      return new JSONObject().put("metadata", meta).put("files", encoded);
    }
  }

  private void validateIdentity(JSONObject metadata) throws Exception {
    String savedMode = metadata.optString("mode");
    boolean sameMode = "towers".equals(mode)
        ? savedMode.isEmpty() || "tower-defense".equals(savedMode) || "towers".equals(savedMode)
        : mode.equals(savedMode);
    if (!sameMode)
      throw new IOException("This save belongs to a different game mode.");
    if ("survival".equals(mode)) {
      String map = metadata.optString("mapId");
      if (!"survival".equals(metadata.optString("profile")) || !SurvivalMapCatalog.isKnownId(map)
          || !SurvivalMapCatalog.get(map).mapName.equals(metadata.optString("nativeLevel")))
        throw new IOException("Invalid Survival save identity.");
    } else if ("towers".equals(mode) && !"towers".equals(metadata.optString("profile", "towers"))) {
      throw new IOException("This save belongs to a different Towers profile.");
    }
    if ("challenge".equals(mode)) {
      String map = metadata.optString("mapId");
      if (!"challenge".equals(metadata.optString("profile")) || !ChallengeMapCatalog.isKnownId(map)
          || !ChallengeMapCatalog.nativeLevel(map).equals(metadata.optString("nativeLevel"))
          || metadata.optInt("players",-1)!=2 || metadata.optInt("bots",-1)!=1
          || !"dumbot25a".equals(metadata.optString("botType")) || !metadata.optBoolean("vtol")
          || !("cannon".equals(metadata.optString("weapon")) || "rockets".equals(metadata.optString("weapon")))
          || !metadata.optString("rewardRunId").matches("[A-Za-z0-9_-]{1,96}")
          || !("easy".equals(metadata.optString("difficulty")) || "medium".equals(metadata.optString("difficulty")) || "hard".equals(metadata.optString("difficulty"))))
        throw new IOException("Invalid Challenge save identity.");
    }
    if ("ffa".equals(mode)) {
      String map = metadata.optString("mapId");
      int players = FfaMapCatalog.playerCount(map);
      if (!FfaMapCatalog.isKnownId(map) || !FfaMapCatalog.nativeLevel(map).equals(metadata.optString("nativeLevel"))
          || metadata.optInt("players", "emag".equals(map) ? 4 : -1) != players
          || metadata.optInt("bots", "emag".equals(map) ? 3 : -1) != players - 1
          || !("easy".equals(metadata.optString("difficulty"))
              || "medium".equals(metadata.optString("difficulty")) || "hard".equals(metadata.optString("difficulty"))))
        throw new IOException("Invalid FFA save identity.");
      ffaBotType(metadata);
    }
    if (!metadata.getString("session").matches("[A-Za-z0-9_-]{1,96}")
        || !metadata.getString("mapId").matches("[a-zA-Z0-9_-]{1,64}"))
      throw new IOException("Invalid save identity.");
  }
  private static void validateSurvivalArchive(JSONObject metadata, byte[] scriptData) throws Exception {
    if (scriptData == null) throw new IOException("The saved Survival state is incomplete.");
    JSONObject script = new JSONObject(new String(scriptData, StandardCharsets.UTF_8));
    for (Iterator<String> keys = script.keys(); keys.hasNext();) {
      JSONObject context = script.optJSONObject(keys.next());
      if (context == null) continue;
      JSONObject identity = context.optJSONObject("survivalIdentity"), reward = context.optJSONObject("wtreward_match");
      if (identity == null || reward == null || context.optJSONObject("warzoneTowersWaves_state") == null) continue;
      if (identity.optInt("version", -1) == 94 && "survival".equals(identity.optString("mode"))
          && "survival".equals(identity.optString("profile")) && identity.optInt("player", -1) == 0
          && identity.optInt("enemyPlayer", -1) == 1 && metadata.getString("mapId").equals(identity.optString("map"))
          && metadata.getString("nativeLevel").equals(identity.optString("level"))
          && metadata.getString("session").equals(reward.optString("session"))) return;
    }
    throw new IOException("The saved Survival rules did not match this battle.");
  }
  private static void validateNativeGam(JSONObject metadata, byte[] data) throws Exception {
    if (data == null) throw new IOException("The saved game is missing gam.json.");
    JSONObject gam = new JSONObject(new String(data, StandardCharsets.UTF_8));
    String level = gam.getString("levelName");
    // The native GAM header reserves 20 bytes including its terminating NUL.
    if (level.isEmpty() || level.getBytes(StandardCharsets.UTF_8).length >= 20
        || gam.getLong("gameTime") != metadata.getLong("gameTime")
        || metadata.has("nativeLevel") && !level.equals(metadata.getString("nativeLevel")))
      throw new IOException("The native save did not match the current battle.");
    if ("ffa".equals(metadata.optString("mode"))) {
      String expected = "cobra".equals(ffaBotType(metadata)) ? "Cobra" : "NullBot (ground)";
      int difficulty = "hard".equals(metadata.optString("difficulty")) ? 3
          : "medium".equals(metadata.optString("difficulty")) ? 2 : 1;
      JSONArray players = gam.optJSONArray("netPlayers");
      int count = FfaMapCatalog.playerCount(metadata.optString("mapId"));
      if (players == null || players.length() < count || gam.optInt("multiMaxPlayers", -1) != count
          || gam.optInt("netSelectedPlayer", -1) != 0 || gam.optInt("multiAlliance", -1) != 0)
        throw new IOException("The saved FFA player slots did not match their map.");
      JSONObject human = players.optJSONObject(0);
      if (human == null || human.optInt("allocated", -1) != 1
          || human.optInt("position", -1) != 0 || human.optInt("team", -1) != 0)
        throw new IOException("The saved FFA human slot is invalid.");
      for (int i = 1; i < count; i++) {
        JSONObject player = players.optJSONObject(i);
        if (player == null || !expected.equals(player.optString("aiName")) || player.optInt("difficulty", -1) != difficulty
            || player.optInt("allocated", -1) != 0 || player.optInt("position", -1) != i || player.optInt("team", -1) != i)
          throw new IOException("The saved FFA bots did not match their native files.");
      }
    }
  }

  private static void validateFfaArchive(JSONObject metadata, byte[] mainData, byte[] scriptData) throws Exception {
    if (mainData == null || scriptData == null) throw new IOException("The saved FFA native state is incomplete.");
    JSONObject main = new JSONObject(new String(mainData, StandardCharsets.UTF_8));
    JSONObject scripts = new JSONObject(new String(scriptData, StandardCharsets.UTF_8));
    String map = metadata.getString("mapId"), level = FfaMapCatalog.nativeLevel(map);
    int count = FfaMapCatalog.playerCount(map);
    int difficulty = "hard".equals(metadata.optString("difficulty")) ? 3
        : "medium".equals(metadata.optString("difficulty")) ? 2 : 1;
    boolean cobra = "cobra".equals(ffaBotType(metadata));
    String expectedName = cobra ? "Cobra" : "NullBot (ground)", expectedScript = cobra ? "Cobra" : "ffa-nullbot";
    if (!level.equals(main.optString("levelName")) || main.optInt("maxPlayers", -1) != count
        || main.optInt("selectedPlayer", -1) != 0 || main.optInt("allianceSetting", -1) != 0)
      throw new IOException("The saved FFA configuration did not match its map.");
    JSONArray players = main.optJSONArray("players");
    if (players == null) throw new IOException("The saved FFA players are missing.");
    Set<Integer> seen = new HashSet<>();
    for (int j = 0; j < players.length(); j++) {
      JSONObject player = players.optJSONObject(j);
      if (player == null) continue;
      int i = player.optInt("index", -1);
      if (i < 0 || i >= count) continue;
      if (!seen.add(i) || player.optInt("position", -1) != i || player.optInt("team", -1) != i
          || player.optBoolean("allocated", false) != (i == 0))
        throw new IOException("The saved FFA player configuration is invalid.");
      if (i > 0) {
        JSONObject context = scripts.optJSONObject("globals_" + i);
        if (!expectedName.equals(player.optString("nameAI")) || player.optInt("difficulty", -1) != difficulty
            || context == null || context.optInt("me", -1) != i || !expectedScript.equals(context.optString("scriptName")))
          throw new IOException("The saved FFA AI state did not match its players.");
      }
      JSONArray alliances = player.optJSONArray("alliances");
      if (alliances == null || alliances.length() < count) throw new IOException("The saved FFA alliances are missing.");
      for (int other = 0; other < count; other++)
        if (alliances.optInt(other, -1) != (i == other ? 3 : 0))
          throw new IOException("The saved FFA is not a free-for-all match.");
    }
    if (seen.size() != count) throw new IOException("The saved FFA player slots are incomplete.");
    Set<Integer> contexts = new HashSet<>();
    JSONObject rules = null;
    for (Iterator<String> it = scripts.keys(); it.hasNext();) {
      String key = it.next();
      if (!key.matches("globals_[0-9]+")) continue;
      JSONObject context = scripts.optJSONObject(key);
      if (context == null) continue;
      int player = context.optInt("me", -1);
      if (player > 0) {
        if (player >= count || !expectedScript.equals(context.optString("scriptName")) || !contexts.add(player))
          throw new IOException("The saved FFA AI contexts are inconsistent.");
      }
      if (context.has("ffaConfig") || context.has("ffaSession")) {
        if (rules != null || player != 0 || !"init".equals(context.optString("scriptName")))
          throw new IOException("The saved FFA rules context is inconsistent.");
        rules = context;
      }
    }
    if (contexts.size() != count - 1 || rules == null
        || !metadata.getString("session").equals(rules.optString("ffaSession"))
        || !rules.optString("ffaOutcome", "").isEmpty())
      throw new IOException("The saved FFA rules did not match this battle.");
    JSONObject config = rules.optJSONObject("ffaConfig");
    if (config == null || !"ffa".equals(config.optString("mode")) || !map.equals(config.optString("map"))
        || !metadata.getString("difficulty").equals(config.optString("difficulty")) || config.optInt("player", -1) != 0
        || config.optInt("players", "emag".equals(map) ? 4 : -1) != count
        || !level.equals(config.optString("level", "emag".equals(map) ? "FFA-EMAG-T1" : ""))
        || !ffaBotType(metadata).equals(config.optString("botType", "nullbot")))
      throw new IOException("The saved FFA rules did not match its map or opponents.");
  }

  private static void validateChallengeArchive(JSONObject metadata, byte[] gamData, byte[] mainData, byte[] scriptData) throws Exception {
    if (gamData==null || mainData==null || scriptData==null) throw new IOException("The saved Challenge state is incomplete.");
    JSONObject gam=new JSONObject(new String(gamData,StandardCharsets.UTF_8)), main=new JSONObject(new String(mainData,StandardCharsets.UTF_8)), scripts=new JSONObject(new String(scriptData,StandardCharsets.UTF_8));
    String map=metadata.getString("mapId"),level=ChallengeMapCatalog.nativeLevel(map),weapon=metadata.getString("weapon");
    int difficulty="hard".equals(metadata.getString("difficulty"))?3:"medium".equals(metadata.getString("difficulty"))?2:1;
    if (!level.equals(gam.optString("levelName")) || !level.equals(main.optString("levelName")) || gam.optInt("multiMaxPlayers",-1)!=2 || main.optInt("maxPlayers",-1)!=2
        || gam.optInt("netSelectedPlayer",-1)!=0 || main.optInt("selectedPlayer",-1)!=0 || gam.optInt("multiAlliance",-1)!=0 || main.optInt("allianceSetting",-1)!=0)
      throw new IOException("The saved Challenge configuration is invalid.");
    JSONArray net=gam.getJSONArray("netPlayers"),players=main.getJSONArray("players");
    for(int i=0;i<2;i++) {
      JSONObject nativePlayer=net.optJSONObject(i),player=null;
      for(int j=0;j<players.length();j++) { JSONObject row=players.optJSONObject(j); if(row!=null&&row.optInt("index",-1)==i) {if(player!=null)throw new IOException("Repeated Challenge player.");player=row;} }
      if(nativePlayer==null||player==null||nativePlayer.optInt("position",-1)!=i||nativePlayer.optInt("team",-1)!=i||player.optInt("position",-1)!=i||player.optInt("team",-1)!=i
          ||nativePlayer.optInt("allocated",-1)!=(i==0?1:0)||player.optBoolean("allocated",false)!=(i==0))throw new IOException("The saved Challenge slots are invalid.");
      if(i==1&&(!"Dumbot25a".equals(nativePlayer.optString("aiName"))||!"Dumbot25a".equals(player.optString("nameAI"))||nativePlayer.optInt("difficulty",-1)!=difficulty||player.optInt("difficulty",-1)!=difficulty))throw new IOException("The saved Challenge opponent is invalid.");
      JSONArray alliances=player.optJSONArray("alliances");
      if(alliances==null||alliances.length()<2||alliances.optInt(1-i,-1)!=0)throw new IOException("The saved Challenge opponents are allied.");
    }
    JSONObject rules=null,bot=null;int bots=0;
    for(Iterator<String> it=scripts.keys();it.hasNext();) {
      String key=it.next();
      // Group/trigger records repeat scriptName and me; only globals identify
      // one live native script context for each opponent and the rules.
      if(!key.matches("globals_[0-9]+"))continue;
      JSONObject context=scripts.optJSONObject(key);if(context==null)continue;
      if(context.optInt("me",-1)==1&&"challenge-dumb25a".equals(context.optString("scriptName"))){bot=context;bots++;}
      if(context.has("ffaConfig")||context.has("ffaSession")){if(rules!=null||context.optInt("me",-1)!=0||!"init".equals(context.optString("scriptName")))throw new IOException("The saved Challenge rules are inconsistent.");rules=context;}
    }
    if(bots!=1||bot==null||rules==null||!metadata.getString("session").equals(rules.optString("ffaSession"))||!rules.optString("ffaOutcome","").isEmpty())throw new IOException("The saved Challenge rules or bot are missing.");
    JSONObject cfg=rules.optJSONObject("ffaConfig"),reward=rules.optJSONObject("wtreward_match"),rewardConfig=reward==null?null:reward.optJSONObject("config");
    if(cfg==null||!"challenge".equals(cfg.optString("mode"))||!map.equals(cfg.optString("map"))||!level.equals(cfg.optString("level"))||!weapon.equals(cfg.optString("weapon"))
        ||!metadata.getString("difficulty").equals(cfg.optString("difficulty"))||cfg.optInt("player",-1)!=0||cfg.optInt("players",-1)!=2||cfg.optInt("bots",-1)!=1||!"dumbot25a".equals(cfg.optString("botType"))
        ||reward==null||rewardConfig==null||!reward.optBoolean("applied")||!"challenge".equals(rewardConfig.optString("profile"))||!map.equals(rewardConfig.optString("map"))||!metadata.getString("rewardRunId").equals(reward.optString("session")))
      throw new IOException("The saved Challenge profile, branch or purchases do not match.");
  }

  private static String ffaBotType(JSONObject metadata) throws IOException {
    if (!metadata.has("botType")) return "nullbot";
    String value = metadata.optString("botType");
    if (!"cobra".equals(value) && !"nullbot".equals(value)) throw new IOException("Invalid FFA bot identity.");
    return value;
  }

  private File file(String id, String suffix) throws IOException {
    if (id == null || !id.matches("wt_[a-f0-9]{32}")) throw new IOException("Invalid saved game.");
    File result = new File(root, id + suffix).getCanonicalFile();
    if (!result.getParentFile().equals(root.getCanonicalFile())) throw new IOException("Invalid saved game path.");
    return result;
  }
  private static void safeName(String name) throws IOException {
    if (name == null || name.isEmpty() || name.length() > 240 || name.startsWith("/") || name.contains("\\")) throw new IOException("Invalid native save filename.");
    for (String part : name.split("/", -1)) if (!part.matches("[A-Za-z0-9_.-]{1,80}") || part.equals(".") || part.equals(".."))
      throw new IOException("Invalid native save filename.");
  }
  private static byte[] bytes(ZipFile zip, String name, int limit) throws IOException {
    ZipEntry entry = zip.getEntry(name);
    if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > limit) throw new IOException("Missing or oversized save file.");
    try (java.io.InputStream input = zip.getInputStream(entry); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192]; int read;
      while ((read = input.read(buffer)) != -1) { if (output.size() + read > limit) throw new IOException("Oversized save file."); output.write(buffer, 0, read); }
      return output.toByteArray();
    }
  }
  private static void write(ZipOutputStream zip, String name, byte[] bytes) throws IOException {
    zip.putNextEntry(new ZipEntry(name)); zip.write(bytes); zip.closeEntry();
  }
  private static String hash(byte[] data) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(data); StringBuilder result = new StringBuilder();
    for (byte value : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
    return result.toString();
  }
}
