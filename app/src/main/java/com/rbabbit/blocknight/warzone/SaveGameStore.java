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

  SaveGameStore(Context context) {
    root = new File(context.getFilesDir(), "towers-saved-games");
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
        if (file.getName().equals(meta.getString("id") + ".zip")) values.add(meta);
      } catch (Exception ignored) { /* Keep unreadable bytes; never delete another slot. */ }
    }
    values.sort(Comparator.comparingLong((JSONObject item) -> item.optLong("savedAt")).reversed());
    return new JSONArray(values);
  }

  synchronized JSONObject load(String id) throws Exception { return read(file(id, ".zip"), id); }
  synchronized boolean hasRun(String session) {
    JSONArray slots = list();
    for (int i = 0; i < slots.length(); i++) if (session.equals(slots.optJSONObject(i).optString("session"))) return true;
    return false;
  }
  synchronized String delete(String id) throws Exception {
    File target = file(id, ".zip");
    JSONObject metadata;
    try (ZipFile zip = new ZipFile(target)) {
      metadata = new JSONObject(new String(bytes(zip, "metadata.json", 65536), StandardCharsets.UTF_8));
    }
    Files.delete(target.toPath());
    return metadata.getString("session");
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
      JSONObject encoded = new JSONObject(); int total = 0; byte[] gamData = null;
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
        encoded.put(name, Base64.getEncoder().encodeToString(data));
      }
      validateNativeGam(meta, gamData);
      Set<String> actual = new HashSet<>();
      Enumeration<? extends ZipEntry> entries = zip.entries();
      while (entries.hasMoreElements()) if (!actual.add(entries.nextElement().getName())) throw new IOException("Duplicate saved game file.");
      if (!actual.equals(expected)) throw new IOException("Unexpected saved game contents.");
      return new JSONObject().put("metadata", meta).put("files", encoded);
    }
  }

  private static void validateIdentity(JSONObject metadata) throws Exception {
    if (!metadata.getString("session").matches("[A-Za-z0-9_-]{1,96}")
        || !metadata.getString("mapId").matches("[a-zA-Z0-9_-]{1,64}"))
      throw new IOException("Invalid save identity.");
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
