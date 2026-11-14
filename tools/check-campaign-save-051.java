package com.rbabbit.blocknight.warzone;

import android.content.Context;
import java.io.File;
import java.nio.file.Files;
import java.util.Base64;
import org.json.JSONObject;

/** Actual store code, synthetic native bytes, isolated JVM context. */
class CheckCampaignSave051 {
  private static int count;
  private static void check(boolean ok, String what) {
    if (!ok) throw new AssertionError(what);
    count++;
  }
  static class HostContext extends Context {
    final File dir;
    HostContext(File dir) { this.dir = dir; }
    public File getFilesDir() { return dir; }
  }
  private static JSONObject meta(boolean campaign) throws Exception {
    JSONObject o = new JSONObject().put("session", "campaign-fixture-051").put("mapId", "CAM_1A")
        .put("nativeLevel", "CAM_1A").put("gameTime", 4567);
    if (campaign) o.put("mode", "campaign");
    return o;
  }
  private static JSONObject files() throws Exception {
    JSONObject o = new JSONObject();
    for (String name : new String[] {"gam.json", "main.json", "gameinfo.json", "scriptstate.json", "game.map"}) {
      byte[] data = (name.equals("gam.json") ? "{\"levelName\":\"CAM_1A\",\"gameTime\":4567}" : "{}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
      o.put(name, Base64.getEncoder().encodeToString(data));
    }
    return o;
  }
  public static void main(String[] args) throws Exception {
    File root = new File(args[0]); root.mkdirs();
    HostContext context = new HostContext(root);
    SaveGameStore towers = new SaveGameStore(context), campaign = new SaveGameStore(context, true);
    String tid = towers.save(meta(false), files()), cid = campaign.save(meta(true), files());
    check(towers.list().length() == 1 && campaign.list().length() == 1, "separate phone stores");
    check(campaign.load(cid).getJSONObject("metadata").getString("mode").equals("campaign"), "campaign round trip");
    check(!towers.load(tid).getJSONObject("metadata").has("mode"), "existing Towers format retained");
    boolean rejected = false;
    try { towers.save(meta(true), files()); } catch (Exception e) { rejected = true; }
    check(rejected, "campaign cannot enter Towers store");
    rejected = false;
    try { campaign.save(meta(false), files()); } catch (Exception e) { rejected = true; }
    check(rejected, "Towers cannot enter campaign store");
    Files.copy(new File(root, "towers-saved-games/"+tid+".zip").toPath(), new File(root, "campaign-saved-games/"+tid+".zip").toPath());
    check(campaign.list().length() == 1, "wrong-mode archive not listed");
    rejected = false;
    try { campaign.load(tid); } catch (Exception e) { rejected = true; }
    check(rejected, "wrong-mode archive cannot load");
    check(new SaveGameStore(context,true).list().length() == 1, "campaign store survives process restart");
    campaign.delete(cid);
    check(campaign.list().length() == 0 && towers.list().length() == 1, "campaign delete leaves Towers save");
    System.out.println("PASS "+count+" campaign save isolation checks");
  }
}
