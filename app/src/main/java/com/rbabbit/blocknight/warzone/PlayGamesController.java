package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.ParcelFileDescriptor;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.Player;
import com.google.android.gms.games.LeaderboardsClient;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.achievement.Achievement;
import com.google.android.gms.games.achievement.AchievementBuffer;
import com.google.android.gms.games.leaderboard.Leaderboard;
import com.google.android.gms.games.leaderboard.LeaderboardBuffer;
import com.google.android.gms.games.leaderboard.LeaderboardScore;
import com.google.android.gms.games.leaderboard.LeaderboardScoreBuffer;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Task;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/** Optional, explicit-connect Google Play Games integration. No SDK calls at startup. */
public final class PlayGamesController {
    private static final int MAX_BACKUP_BYTES=3*1024*1024;
    private final Activity activity;
    private final Runnable changed;
    private final PlayGamesBackupStore backup;
    private final PlayGamesConfig config;
    private final SharedPreferences prefs;
    private final PlayGamesProgressStore progress;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Set<Snapshot> opened=new HashSet<>();
    private final Set<ReadRequest> reads=new HashSet<>();
    private volatile boolean enabled, signedIn, busy, closed, importing;
    private volatile String status, playerId="";
    private volatile long generation, restoredGeneration;
    private boolean initialized, flushing;
    private AlertDialog dialog;
    private SnapshotsClient snapshots;

    public PlayGamesController(Activity activity, Runnable changed, PlayGamesBackupStore backup) {
        this.activity=activity; this.changed=changed; this.backup=backup;
        config=PlayGamesConfig.load(activity);
        prefs=activity.getSharedPreferences("optional_play_games_v1", Activity.MODE_PRIVATE);
        progress=new PlayGamesProgressStore(activity);
        enabled=prefs.getBoolean("enabled", false);
        status=!config.configured()?config.error:enabled?"Choose Connect to use Google Play Games.":"Google Play Games is off.";
    }
    public boolean enabled() { return enabled; }
    public boolean configured() { return config.configured(); }
    public boolean hasAchievements() { return config.configured()&&!config.achievements.isEmpty(); }
    public boolean hasLeaderboards() { return config.configured()&&!config.leaderboards.isEmpty(); }
    public boolean signedIn() { return enabled&&signedIn; }
    public boolean busy() { return busy; }
    public String status() { return status; }
    public long restoredGeneration() { return restoredGeneration; }
    public void recordEvent(JSONObject event) { activity.runOnUiThread(()->{
        if(closed||event==null)return;
        String owner=signedIn?playerId:prefs.getString("lastAccount", "");
        try { progress.recordEvent(owner,event); flush(); }
        catch(Exception ignored) { /* Optional awards cannot interrupt gameplay. */ }
    }); }
    public void refreshProgress() { activity.runOnUiThread(this::flush); }
    private void notifyChanged() { if (!closed) changed.run(); }
    private void message(String value) { status=value; notifyChanged(); }
    private boolean live(long token) { return !closed&&enabled&&token==generation&&!activity.isFinishing()&&!activity.isDestroyed(); }
    private boolean live(long token, String owner) { return live(token)&&signedIn&&owner.equals(playerId); }
    private void failure(long token, String text) {
        if (!live(token)) return;
        busy=importing; flushing=false; discardAll(); message(text);
    }
    public void setEnabled(boolean value) { activity.runOnUiThread(()->{
        if (closed||enabled==value) return;
        generation++; enabled=value; signedIn=false; busy=importing; flushing=false; playerId="";
        cancelReads(value?"Play Games connection changed. Reopen this tab after connecting.":"Google Play Games is off.");
        prefs.edit().putBoolean("enabled", value).apply();
        if (dialog!=null) { dialog.dismiss(); dialog=null; }
        discardAll();
        message(value?(config.configured()?"Choose Connect to use Google Play Games.":config.error):"Google Play Games is off. Progress stays on this device.");
    }); }
    public void connect() { activity.runOnUiThread(()->{
        if (closed||busy) return;
        if (!enabled) setEnabled(true);
        if (!config.configured()) { message(config.error); return; }
        long token=++generation;
        signedIn=false; playerId=""; busy=true; flushing=false;
        cancelReads("Reconnecting to Google Play Games. Reopen this tab after connecting.");
        message("Connecting to Google Play Games…");
        try {
            if (!initialized) { PlayGamesSdk.initialize(activity.getApplicationContext()); initialized=true; }
            PlayGames.getGamesSignInClient(activity).signIn().addOnSuccessListener(result->{
                if (!live(token)) return;
                if (!result.isAuthenticated()) { failure(token,"Not connected. You can continue playing locally."); return; }
                readFreshPlayer(token,player->{
                    if (!live(token)) return;
                    String owner=player.getPlayerId();
                    playerId=owner; signedIn=true; snapshots=PlayGames.getSnapshotsClient(activity); busy=false;
                    prefs.edit().putString("lastAccount",owner).apply();
                    message("Connected as "+player.getDisplayName()+".");
                    offerDeviceProgress(token,owner);
                });
            }).addOnFailureListener(error->failure(token,"Could not connect. You can continue playing locally."));
        } catch (Exception unavailable) { failure(token,"Google Play Games is unavailable on this device."); }
    }); }
    private boolean ready() {
        if (!enabled) { message("Enable Google Play Games first."); return false; }
        if (!config.configured()) { message(config.error); return false; }
        if (!signedIn) { message("Choose Connect first. Local play is always available."); return false; }
        return !busy&&!closed;
    }
    private void verifyIdentity(long token, String owner, Runnable action) {
        if (!live(token,owner)) return;
        readFreshPlayer(token,player->{
            if (!live(token,owner)) return;
            if (!owner.equals(player.getPlayerId())) {
                invalidateAccount(token,"Google Play Games account changed. Choose Connect again.",true);
                return;
            }
            action.run();
        });
    }
    private void readFreshPlayer(long token, Consumer<Player> action) {
        if (!live(token)) return;
        try {
            // Connect and ownership checks use the same fresh profile source.
            // Missing or stale data is not evidence that the account changed.
            PlayGames.getPlayersClient(activity).getCurrentPlayer(true).addOnSuccessListener(result->{
                if (!live(token)) return;
                Player player=result==null?null:result.get();
                if (result==null||result.isStale()||player==null||player.getPlayerId()==null||player.getPlayerId().isEmpty()) {
                    invalidateAccount(token,"Could not refresh your Play Games profile. Choose Connect again. Your local progress is safe.",false);
                    return;
                }
                action.accept(player);
            }).addOnFailureListener(error->invalidateAccount(token,
                    "Could not refresh your Play Games profile. Choose Connect again. Your local progress is safe.",false));
        } catch(Exception unavailable) {
            invalidateAccount(token,"Google Play Games is unavailable. Choose Connect again. Your local progress is safe.",false);
        }
    }
    private void invalidateAccount(long token, String text, boolean accountChanged) {
        if (!live(token)) return;
        generation++; signedIn=false; playerId=""; busy=importing; flushing=false;
        cancelReads(text);
        if (dialog!=null) { dialog.dismiss(); dialog=null; }
        discardAll(); snapshots=null;
        if (accountChanged) prefs.edit().remove("lastAccount").apply();
        message(text);
    }
    public void showAchievements() { activity.runOnUiThread(()->{
        if (!ready()) return;
        if (config.achievements.isEmpty()) { message("Achievements have not been configured for this build."); return; }
        long token=generation; String owner=playerId; busy=true;
        verifyIdentity(token,owner,()->showIntent(token,owner,PlayGames.getAchievementsClient(activity).getAchievementsIntent()));
    }); }

    /** Explicit page reads never enable/sign in, upload progress, or open Google activities. */
    public void loadAchievements(Consumer<JSONObject> callback) { activity.runOnUiThread(()->{
        ReadRequest request=beginRead(callback); if(request==null)return;
        verifyIdentity(request.token,request.owner,()->{
            if(!readLive(request))return;
            try {
                PlayGames.getAchievementsClient(activity).load(true).addOnSuccessListener(result->{
                    AchievementBuffer buffer=result==null?null:result.get();
                    try {
                        if(!readLive(request))return;
                        if(result==null||result.isStale()||buffer==null) { request.fail("Achievements could not be loaded. Reopen this tab to try again."); return; }
                        JSONArray items=new JSONArray();
                        for(int i=0;i<buffer.getCount();i++) {
                            Achievement achievement=buffer.get(i);
                            boolean incremental=achievement.getType()==Achievement.TYPE_INCREMENTAL;
                            int state=achievement.getState();
                            JSONObject item=new JSONObject().put("id",text(achievement.getAchievementId()))
                                    .put("name",text(achievement.getName())).put("description",text(achievement.getDescription()))
                                    .put("state",state==Achievement.STATE_UNLOCKED?"unlocked":state==Achievement.STATE_HIDDEN?"hidden":"revealed")
                                    .put("incremental",incremental)
                                    .put("steps",incremental?achievement.getCurrentSteps():state==Achievement.STATE_UNLOCKED?1:0)
                                    .put("total",incremental?achievement.getTotalSteps():1);
                            if(achievement.getXpValue()>=0)item.put("xp",achievement.getXpValue());
                            items.put(item);
                        }
                        completeRead(request,readResult(true,"",items));
                    } catch(Exception invalid) { request.fail("Achievements could not be read. Reopen this tab to try again."); }
                    finally { if(buffer!=null)buffer.release(); }
                }).addOnFailureListener(error->request.fail("Achievements are unavailable. Check your connection and reopen this tab."));
            } catch(Exception unavailable) { request.fail("Achievements are unavailable. Try connecting again."); }
        });
    }); }

    public void loadLeaderboards(Consumer<JSONObject> callback) { activity.runOnUiThread(()->{
        ReadRequest request=beginRead(callback); if(request==null)return;
        verifyIdentity(request.token,request.owner,()->{
            if(!readLive(request))return;
            try {
                PlayGames.getLeaderboardsClient(activity).loadLeaderboardMetadata(true).addOnSuccessListener(result->{
                    LeaderboardBuffer buffer=result==null?null:result.get();
                    try {
                        if(!readLive(request))return;
                        if(result==null||result.isStale()||buffer==null) { request.fail("Leaderboards could not be loaded. Reopen this tab to try again."); return; }
                        JSONArray items=new JSONArray();
                        for(int i=0;i<buffer.getCount();i++) {
                            Leaderboard board=buffer.get(i);
                            JSONObject item=new JSONObject().put("id",text(board.getLeaderboardId())).put("name",text(board.getDisplayName()))
                                    .put("order",board.getScoreOrder()==Leaderboard.SCORE_ORDER_SMALLER_IS_BETTER?"smaller":"larger");
                            List<LeaderboardVariant> variants=board.getVariants();
                            if(variants!=null)for(LeaderboardVariant variant:variants)
                                if(variant.getCollection()==LeaderboardVariant.COLLECTION_PUBLIC&&variant.getTimeSpan()==LeaderboardVariant.TIME_SPAN_ALL_TIME&&variant.hasPlayerInfo()) {
                                    String score=text(variant.getDisplayPlayerScore()); if(!score.isEmpty())item.put("score",score);
                                    break;
                                }
                            items.put(item);
                        }
                        completeRead(request,readResult(true,"",items));
                    } catch(Exception invalid) { request.fail("Leaderboards could not be read. Reopen this tab to try again."); }
                    finally { if(buffer!=null)buffer.release(); }
                }).addOnFailureListener(error->request.fail("Leaderboards are unavailable. Check your connection and reopen this tab."));
            } catch(Exception unavailable) { request.fail("Leaderboards are unavailable. Try connecting again."); }
        });
    }); }

    /** span 0 = daily, 1 = weekly, 2 = all time; public scores only. */
    public void loadLeaderboardScores(String id,int span,Consumer<JSONObject> callback) { activity.runOnUiThread(()->{
        ReadRequest request=beginRead(callback); if(request==null)return;
        if(id==null||!id.matches("Cg[A-Za-z0-9_-]{5,150}")||span<0||span>2) { request.fail("Choose a valid leaderboard and time period."); return; }
        final int timeSpan=span==0?LeaderboardVariant.TIME_SPAN_DAILY:span==1?LeaderboardVariant.TIME_SPAN_WEEKLY:LeaderboardVariant.TIME_SPAN_ALL_TIME;
        verifyIdentity(request.token,request.owner,()->{
            if(!readLive(request))return;
            try {
                PlayGames.getLeaderboardsClient(activity).loadTopScores(id,timeSpan,LeaderboardVariant.COLLECTION_PUBLIC,25,true)
                        .addOnSuccessListener(result->{
                            LeaderboardsClient.LeaderboardScores scores=result==null?null:result.get();
                            try {
                                if(!readLive(request))return;
                                if(result==null||result.isStale()||scores==null||scores.getScores()==null) { request.fail("Scores could not be loaded. Reopen this tab to try again."); return; }
                                JSONArray items=new JSONArray(); LeaderboardScoreBuffer buffer=scores.getScores();
                                String ownScore="",ownRank="";
                                for(int i=0;i<buffer.getCount();i++) {
                                    LeaderboardScore score=buffer.get(i); Player player=score.getScoreHolder();
                                    boolean me=player!=null&&request.owner.equals(player.getPlayerId());
                                    String displayedScore=text(score.getDisplayScore()),rank=text(score.getDisplayRank());
                                    items.put(new JSONObject().put("rank",rank).put("player",text(score.getScoreHolderDisplayName()))
                                            .put("score",displayedScore).put("me",me));
                                    if(me) { ownScore=displayedScore; ownRank=rank; }
                                }
                                JSONObject copied=readResult(true,"",items).put("ownScore",ownScore).put("ownRank",ownRank);
                                loadOwnScore(request,id,timeSpan,copied);
                            } catch(Exception invalid) { request.fail("Leaderboard scores could not be read. Reopen this tab to try again."); }
                            finally { if(scores!=null)scores.release(); }
                        }).addOnFailureListener(error->request.fail("Scores are unavailable. Check your connection and reopen this tab."));
            } catch(Exception unavailable) { request.fail("Scores are unavailable. Try connecting again."); }
        });
    }); }

    private void loadOwnScore(ReadRequest request,String id,int span,JSONObject copied) {
        if(!readLive(request))return;
        try {
            PlayGames.getLeaderboardsClient(activity).loadCurrentPlayerLeaderboardScore(id,span,LeaderboardVariant.COLLECTION_PUBLIC)
                    .addOnSuccessListener(result->{
                        if(!readLive(request))return;
                        try {
                            if(result==null||result.isStale()) {
                                copied.put("warning","Your own score could not be loaded. Reopen this tab to try again.");
                            } else {
                                LeaderboardScore score=result.get();
                                if(score!=null)copied.put("ownScore",text(score.getDisplayScore())).put("ownRank",text(score.getDisplayRank()));
                            }
                            completeRead(request,copied);
                        } catch(Exception invalid) { request.fail("Your score could not be read. Reopen this tab to try again."); }
                    }).addOnFailureListener(error->{
                        if(!readLive(request))return;
                        try { copied.put("warning","Your own score is unavailable. Reopen this tab to try again."); completeRead(request,copied); }
                        catch(Exception invalid) { request.fail("Your score could not be read. Reopen this tab to try again."); }
                    });
        } catch(Exception unavailable) {
            try { copied.put("warning","Your own score is unavailable. Reopen this tab to try again."); completeRead(request,copied); }
            catch(Exception invalid) { request.fail("Your score could not be read. Reopen this tab to try again."); }
        }
    }

    private ReadRequest beginRead(Consumer<JSONObject> callback) {
        if(callback==null)return null;
        ReadRequest request=new ReadRequest(callback); reads.add(request);
        if(closed)request.fail("This Play Games page is closed.");
        else if(!enabled)request.fail("Google Play Games is off. Enable it and choose Connect.");
        else if(!config.configured())request.fail(config.error);
        else if(!signedIn)request.fail("Choose Connect to load your Google Play Games data.");
        else if(busy||importing)request.fail("Finish the current Play Games action, then reopen this tab.");
        return request.done?null:request;
    }
    private boolean readLive(ReadRequest request) {
        if(request.done)return false;
        if(live(request.token,request.owner))return true;
        request.fail("The Play Games connection changed. Connect again, then reopen this tab."); return false;
    }
    private void completeRead(ReadRequest request,JSONObject result) {
        if(!readLive(request))return;
        // Recheck the profile before showing account-scoped data copied from the SDK.
        verifyIdentity(request.token,request.owner,()->{ if(readLive(request))request.finish(result); });
    }
    private void cancelReads(String reason) { for(ReadRequest request:new ArrayList<>(reads))request.fail(reason); }
    private static String text(String value) { return value==null?"":value; }
    private static JSONObject readResult(boolean ok,String error,JSONArray items) {
        try { return new JSONObject().put("ok",ok).put("error",error).put("items",items).put("ownScore","").put("ownRank",""); }
        catch(Exception invalid) { throw new IllegalStateException("Play Games data could not be prepared.",invalid); }
    }
    private final class ReadRequest {
        final long token=generation; final String owner=playerId; final Consumer<JSONObject> callback; boolean done;
        ReadRequest(Consumer<JSONObject> callback) { this.callback=callback; }
        void fail(String error) { finish(readResult(false,error,new JSONArray())); }
        void finish(JSONObject result) {
            if(done)return;
            if(result.optBoolean("ok")&&!live(token,owner))result=readResult(false,"The Play Games connection changed. Connect again, then reopen this tab.",new JSONArray());
            done=true; reads.remove(this);
            try { callback.accept(result); } catch(RuntimeException ignored) { /* A closed view must not interrupt SDK resource cleanup. */ }
        }
    }
    public void showLeaderboards() { activity.runOnUiThread(()->{
        if (!ready()) return;
        if (config.leaderboards.isEmpty()) { message("Leaderboards have not been configured for this build."); return; }
        long token=generation; String owner=playerId; busy=true;
        verifyIdentity(token,owner,()->showIntent(token,owner,PlayGames.getLeaderboardsClient(activity).getAllLeaderboardsIntent()));
    }); }
    private void showIntent(long token, String owner, Task<Intent> task) {
        task.addOnSuccessListener(intent->{
            if (!live(token,owner)) return;
            busy=false;
            try { activity.startActivityForResult(intent,6431); notifyChanged(); }
            catch (Exception unavailable) { failure(token,"Google Play Games could not open this page."); }
        }).addOnFailureListener(error->failure(token,"This Google Play Games page is unavailable right now."));
    }
    private void confirm(long token, String owner, String title, String text, String positive, Runnable action) {
        if (!live(token,owner)) return;
        dialog=new AlertDialog.Builder(activity).setTitle(title).setMessage(text)
                .setPositiveButton(positive,(view,which)->{ dialog=null; if(live(token,owner)) action.run(); })
                .setNegativeButton("Cancel",(view,which)->{ dialog=null; failure(token,"Cancelled. Local progress was not changed."); })
                .setOnCancelListener(view->{ dialog=null; failure(token,"Cancelled. Local progress was not changed."); }).create();
        dialog.show();
    }
    public void uploadBackup() { activity.runOnUiThread(()->{
        if (!ready()) return;
        long token=generation; String owner=playerId; busy=true;
        confirm(token,owner,"Back up to Google Play Games?",
                "Upload this device’s local progress to your connected account? This replaces that account’s existing manual backup.",
                "Upload backup",()->verifyIdentity(token,owner,()->prepareBlueprints(token,owner,()->{
                    message("Preparing your backup…");
                    io.execute(()->{
                        try {
                            if (!live(token,owner)) return;
                            byte[] bytes=backup.exportBackup();
                            if (bytes.length==0||bytes.length>MAX_BACKUP_BYTES) throw new IllegalArgumentException("size");
                            activity.runOnUiThread(()->{
                                if (!live(token,owner)) return;
                                snapshots.getMaxDataSize().addOnSuccessListener(max->{
                                    if (!live(token,owner)) return;
                                    if (bytes.length>max) { failure(token,"This backup exceeds the Google Play Games size limit. Local progress is unchanged."); return; }
                                    open(token,owner,true,bytes);
                                }).addOnFailureListener(error->failure(token,"Cloud backup is unavailable. Local progress is unchanged."));
                            });
                        } catch (Exception error) { activity.runOnUiThread(()->failure(token,"Could not prepare a backup within the 3 MB cloud limit. Local progress is unchanged.")); }
                    });
                })));
    }); }
    public void restoreBackup() { activity.runOnUiThread(()->{
        if (!ready()) return;
        long token=generation; String owner=playerId; busy=true;
        verifyIdentity(token,owner,()->prepareBlueprints(token,owner,()->open(token,owner,false,null)));
    }); }
    private void prepareBlueprints(long token, String owner, Runnable action) {
        LegacyBlueprintImport.prepare(activity, ok->{
            if (!live(token,owner)) return;
            if (ok) action.run();
            else failure(token,"Could not read the existing blueprint library. Local progress is unchanged.");
        });
    }
    private void open(long token, String owner, boolean upload, byte[] bytes) {
        if (!live(token,owner)) return;
        message(upload?"Opening your cloud backup…":"Loading your cloud backup…");
        snapshots.open(config.snapshotName,upload,SnapshotsClient.RESOLUTION_POLICY_MANUAL)
                .addOnSuccessListener(result->handleOpen(token,owner,upload,bytes,result,0))
                .addOnFailureListener(error->failure(token,"No cloud backup could be opened. Local progress is unchanged."));
    }
    private void handleOpen(long token, String owner, boolean upload, byte[] bytes,
                            SnapshotsClient.DataOrConflict<Snapshot> result, int attempts) {
        if (result.isConflict()) {
            SnapshotsClient.SnapshotConflict conflict=result.getConflict();
            Snapshot first=conflict.getSnapshot(),second=conflict.getConflictingSnapshot();
            opened.add(first); opened.add(second);
            if (!live(token,owner)) { discard(first); discard(second); return; }
            if (upload||attempts>=3) {
                discard(first); discard(second);
                failure(token,"Cloud saves conflict. Use Restore to choose a cloud version before uploading a replacement."); return;
            }
            dialog=new AlertDialog.Builder(activity).setTitle("Choose a cloud backup")
                    .setItems(new String[]{"First cloud version · "+new java.util.Date(first.getMetadata().getLastModifiedTimestamp()),
                            "Second cloud version · "+new java.util.Date(second.getMetadata().getLastModifiedTimestamp())},(view,which)->{
                        dialog=null;
                        verifyIdentity(token,owner,()->snapshots.resolveConflict(conflict.getConflictId(),which==0?first:second)
                                .addOnSuccessListener(resolved->{
                                    // The SDK transfers ownership to the resolved result.
                                    // Discarding the selected old handle here can close
                                    // the very contents returned for the next read.
                                    opened.remove(first); opened.remove(second);
                                    handleOpen(token,owner,false,null,resolved,attempts+1);
                                }).addOnFailureListener(error->{ discard(first); discard(second); failure(token,"The conflict could not be resolved. Local progress is unchanged."); }));
                    }).setNegativeButton("Cancel",(view,which)->{
                        dialog=null; discard(first); discard(second); failure(token,"Cancelled. Local progress is unchanged.");
                    }).setOnCancelListener(view->{
                        dialog=null; discard(first); discard(second); failure(token,"Cancelled. Local progress is unchanged.");
                    }).create();
            dialog.show(); return;
        }
        Snapshot snapshot=result.getData();
        if (snapshot==null) { failure(token,"The cloud backup has no usable data."); return; }
        opened.add(snapshot);
        if (!live(token,owner)) { discard(snapshot); return; }
        if (upload) {
            verifyIdentity(token,owner,()->{
                if (!live(token,owner)) { discard(snapshot); return; }
                try {
                    if (!snapshot.getSnapshotContents().writeBytes(bytes)) throw new IllegalStateException("write failed");
                    SnapshotMetadataChange metadata=new SnapshotMetadataChange.Builder().setDescription("Warzone Towers manual device backup").build();
                    snapshots.commitAndClose(snapshot,metadata).addOnSuccessListener(saved->{
                        opened.remove(snapshot);
                        if (live(token,owner)) { busy=false; message("Backup uploaded to your Google Play Games account."); }
                    }).addOnFailureListener(error->{ discard(snapshot); failure(token,"Upload failed. Your local progress is unchanged."); });
                } catch (Exception error) { discard(snapshot); failure(token,"Could not upload the backup. Local progress is unchanged."); }
            });
        } else {
            io.execute(()->{
                try {
                    if (!live(token,owner)) { activity.runOnUiThread(()->discard(snapshot)); return; }
                    byte[] contents=readSnapshot(snapshot);
                    if (contents.length==0||contents.length>MAX_BACKUP_BYTES) throw new IllegalArgumentException("size");
                    activity.runOnUiThread(()->{
                        discard(snapshot);
                        if (!live(token,owner)) return;
                        confirm(token,owner,"Restore cloud progress?",
                                "Import this cloud backup into this device? Matching local progress may be replaced. Cancel keeps the current local progress.",
                                "Restore",()->verifyIdentity(token,owner,()->{
                                    if (!live(token,owner)) return;
                                    importing=true;
                                    message("Restoring cloud progress…");
                                    io.execute(()->{
                                        boolean restored=false;
                                        try {
                                            if(live(token,owner)) {
                                                backup.importBackup(contents,()->live(token,owner));
                                                restoredGeneration++; restored=true;
                                            }
                                        } catch(Exception error) { /* The helper rolls back cancellation or import failure. */ }
                                        final boolean completed=restored;
                                        activity.runOnUiThread(()->{
                                            // Off invalidates the operation immediately, but navigation
                                            // stays busy until the helper has finished any rollback.
                                            importing=false; busy=false;
                                            if(live(token,owner))message(completed?"Cloud progress restored on this device.":
                                                    "This cloud backup could not be imported. Local progress was preserved.");
                                            else notifyChanged();
                                        });
                                    });
                                }));
                    });
                } catch (Exception error) { activity.runOnUiThread(()->{ discard(snapshot); failure(token,"The cloud backup could not be read. Local progress is unchanged."); }); }
            });
        }
    }
    private void discard(Snapshot snapshot) {
        if (snapshot==null) return;
        opened.remove(snapshot);
        if (snapshots!=null) try { snapshots.discardAndClose(snapshot); } catch (Exception ignored) { }
    }
    private void discardAll() { for(Snapshot snapshot:new ArrayList<>(opened)) discard(snapshot); }
    private byte[] readSnapshot(Snapshot snapshot) throws Exception {
        ParcelFileDescriptor source=snapshot.getSnapshotContents().getParcelFileDescriptor();
        if(source.getStatSize()>MAX_BACKUP_BYTES)throw new IllegalArgumentException("size");
        try(ParcelFileDescriptor.AutoCloseInputStream input=new ParcelFileDescriptor.AutoCloseInputStream(
                ParcelFileDescriptor.dup(source.getFileDescriptor()))) {
            input.getChannel().position(0);
            ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int count;
            while((count=input.read(chunk))!=-1) {
                if(output.size()+count>MAX_BACKUP_BYTES)throw new IllegalArgumentException("size");
                output.write(chunk,0,count);
            }
            return output.toByteArray();
        }
    }

    public void recordWave(String map, String difficulty, int wave) { recordWave(map,difficulty,wave,"unclassified"); }
    public void recordWave(String map, String difficulty, int wave, String classification) {
        recordWave("towers",map,difficulty,wave,classification);
    }
    public void recordWave(String mode, String map, String difficulty, int wave, String classification) {
        record("wave",mode,map,difficulty,Math.min(100000,Math.max(0,wave)),classification);
    }
    public void recordVictory(String mode, String map, String difficulty) { recordVictory(mode,map,difficulty,"unclassified"); }
    public void recordVictory(String mode, String map, String difficulty, String classification) {
        record("victory",mode,map,difficulty,1,classification);
    }
    private JSONArray facts() {
        try { return new JSONArray(prefs.getString("facts","[]")); }
        catch (Exception invalid) { return new JSONArray(); }
    }
    private void record(String kind, String mode, String map, String difficulty, int value, String classification) {
        activity.runOnUiThread(()->{
            if (closed||value<=0||mode==null||map==null||difficulty==null||classification==null
                    ||!mode.matches("[A-Za-z0-9_.:-]{1,80}")||!map.matches("[A-Za-z0-9_.:-]{1,160}")
                    ||!difficulty.matches("[A-Za-z0-9_.:-]{1,40}")||!classification.matches("[A-Za-z0-9_.:-]{1,80}")) return;
            String owner=signedIn?playerId:prefs.getString("lastAccount","");
            JSONArray data=facts(); JSONObject found=null;
            for(int i=0;i<data.length();i++) {
                JSONObject item=data.optJSONObject(i); if(item==null)continue;
                if(owner.equals(item.optString("owner"))&&kind.equals(item.optString("kind"))&&mode.equals(item.optString("mode"))
                        &&map.equals(item.optString("map"))&&difficulty.equals(item.optString("difficulty"))
                        &&classification.equals(item.optString("classification"))) { found=item; break; }
            }
            try {
                if(found==null) {
                    if(data.length()>=4000) return;
                    found=new JSONObject().put("owner",owner).put("kind",kind).put("mode",mode).put("map",map)
                            .put("difficulty",difficulty).put("classification",classification); data.put(found);
                }
                found.put("value",Math.max(value,found.optInt("value")));
                prefs.edit().putString("facts",data.toString()).apply();
                flush();
            } catch (Exception ignored) { /* Optional progress never interrupts the game. */ }
        });
    }
    private void offerDeviceProgress(long token, String owner) {
        JSONArray data=facts(); boolean unclaimed=false;
        try { unclaimed=progress.hasUnowned(); }
        catch(Exception error) { message("Local progress is unavailable. Google Play Games remains connected."); return; }
        for(int i=0;i<data.length();i++) if(data.optJSONObject(i)!=null&&data.optJSONObject(i).optString("owner").isEmpty()) { unclaimed=true; break; }
        if(!unclaimed) { flush(); return; }
        dialog=new AlertDialog.Builder(activity).setTitle("Share this device’s progress?")
                .setMessage("Send achievements earned before connecting to this Google Play Games account? Progress belonging to another account is kept separate.")
                .setPositiveButton("Share progress",(view,which)->{
                    dialog=null;
                    if(!live(token,owner))return;
                    try { progress.claimUnowned(owner); }
                    catch(Exception error) { message("Your device progress is safe. Connect again to retry sharing it."); return; }
                    JSONArray current=facts();
                    for(int i=0;i<current.length();i++) try {
                        JSONObject item=current.optJSONObject(i);
                        if(item!=null&&item.optString("owner").isEmpty())item.put("owner",owner);
                    } catch(Exception ignored) { }
                    prefs.edit().putString("facts",current.toString()).apply(); flush();
                }).setNegativeButton("Not now",(view,which)->{ dialog=null; if(live(token,owner))flush(); })
                .setOnCancelListener(view->{ dialog=null; if(live(token,owner))flush(); }).create();
        dialog.show();
    }
    private static final class Submission {
        final PlayGamesConfig.Mapping mapping; final long value; final boolean board;
        Submission(PlayGamesConfig.Mapping mapping,long value,boolean board){this.mapping=mapping;this.value=value;this.board=board;}
    }
    private long sentValue(String key) {
        Object value=prefs.getAll().get(key);
        return value instanceof Number?((Number)value).longValue():0;
    }
    private void flush() {
        if(closed||!enabled||!signedIn||flushing||busy)return;
        String owner=playerId; long token=generation; JSONArray data=facts(); List<Submission> work=new ArrayList<>();
        JSONArray earned;
        try { earned=progress.facts(owner); }
        catch(Exception ignored) { return; }
        for(int i=0;i<earned.length();i++)data.put(earned.opt(i));
        for(int type=0;type<2;type++) for(PlayGamesConfig.Mapping mapping:type==0?config.achievements:config.leaderboards) {
            long maximum=type==1&&mapping.smallerIsBetter?Long.MAX_VALUE:0;
            for(int i=0;i<data.length();i++) {
                JSONObject fact=data.optJSONObject(i);
                if(fact==null||!owner.equals(fact.optString("owner"))||!mapping.matches(fact))continue;
                if(type==1&&!mapping.classification.equals(fact.optString("classification")))continue;
                long value=fact.optLong("value",0);
                if(value>0) maximum=type==1&&mapping.smallerIsBetter?Math.min(maximum,value):Math.max(maximum,value);
            }
            if(maximum==Long.MAX_VALUE||maximum<=0)continue;
            long amount=type==0?Math.min(maximum,mapping.threshold):maximum;
            if(type==0&&!mapping.incremental&&amount<mapping.threshold)continue;
            String key="sent:"+owner+":"+type+":"+mapping.id;
            long prior=sentValue(key);
            if(prior<=0||(type==1&&mapping.smallerIsBetter?amount<prior:amount>prior))work.add(new Submission(mapping,amount,type==1));
        }
        if(work.isEmpty())return;
        flushing=true;
        verifyIdentity(token,owner,()->submit(token,owner,work,0));
    }
    private void submit(long token,String owner,List<Submission> work,int index) {
        if(!live(token,owner)) { flushing=false; return; }
        if(index>=work.size()) { flushing=false; return; }
        Submission item=work.get(index); Task<?> task;
        try {
            task=item.board?PlayGames.getLeaderboardsClient(activity).submitScoreImmediate(item.mapping.id,item.value)
                    :item.mapping.incremental?PlayGames.getAchievementsClient(activity).setStepsImmediate(item.mapping.id,(int)item.value)
                    :PlayGames.getAchievementsClient(activity).unlockImmediate(item.mapping.id);
        } catch(Exception error) { flushing=false; return; }
        task.addOnSuccessListener(result->{
            if(!live(token,owner)) { flushing=false; return; }
            String key="sent:"+owner+":"+(item.board?1:0)+":"+item.mapping.id;
            long prior=sentValue(key);
            long next=prior<=0?item.value:item.board&&item.mapping.smallerIsBetter?Math.min(item.value,prior):Math.max(item.value,prior);
            prefs.edit().putLong(key,next).apply();
            verifyIdentity(token,owner,()->submit(token,owner,work,index+1));
        }).addOnFailureListener(error->{
            if(live(token,owner)) { flushing=false; if(!busy)message("Progress is kept on this device. Connect again to retry sharing it."); }
        });
    }
    public void close() { activity.runOnUiThread(()->{
        if(closed)return;
        closed=true; generation++; signedIn=false; busy=false; flushing=false; playerId="";
        cancelReads("This Play Games page is closed.");
        if(dialog!=null){dialog.dismiss();dialog=null;}
        discardAll(); io.shutdownNow();
    }); }
}
