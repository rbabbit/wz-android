package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Point;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;
import org.json.JSONArray;

/** Android shell for the official Warzone 2100 4.7 WebAssembly engine. */
public final class MainActivity extends Activity {
  private static final String TAG = "BlockNightWZ";
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  private static final String URL = ORIGIN + "/warzone/mobile.html?blocknight=1";
  private static final float MIN_ENGINE_CSS_WIDTH = 642f;
  private static final float MIN_ENGINE_CSS_HEIGHT = 482f;
  private static final float COMMAND_STRIP_CSS_HEIGHT = 72f;

  private FrameLayout root;
  private WebView webView;
  private BattleControls battleControls;
  private String battleSession = "";
  private volatile String playGamesRunId = "";
  private volatile long playGamesElapsedMs = -1;
  private TextView replayPanel;
  private boolean replayWon;
  private String battleOutcome = "";
  private AlertDialog mainMenuDialog;
  private boolean mainMenuReturnPending;
  private int pendingBackKey = KeyEvent.KEYCODE_UNKNOWN;
  private FrameLayout loadingOverlay;
  private TextView loading;
  private ProgressBar loadingSpinner;
  private WebViewAssetLoader assetLoader;
  private View.OnLayoutChangeListener viewportListener;
  private boolean touchTestMode;
  private boolean touchSuiteMode;
  private boolean researchSuiteMode;
  private boolean isolationAllowlistAvailable;
  private boolean startupAutomationStarted;
  private String webViewVersion = "unknown";
  private GraphicsSetupView graphicsSetup;
  private GuideView guideView;
  private HubView hubView;
  private AboutView aboutView;
  private PlayGamesBackupStore playGamesBackups;
  private BlueprintStore blueprints;
  private PlayGamesController playGames;
  private PlayGamesView playGamesView;
  private long playGamesRestoreGeneration;
  private AppUpdateController appUpdates;
  private android.view.ViewTreeObserver.OnGlobalLayoutListener updateHomeLayoutListener;
  private CampaignSetupView campaignSetup;
  private CampaignVideoStore campaignVideos;
  private SaveGameStore campaignSaves;
  private SaveGameStore ffaSaves;
  private SaveGameStore challengeSaves;
  private ChallengeSetupView challengeSetup;
  private String challengeMapId = "firefight", challengeDifficulty = "easy", challengeWeapon = "cannon";
  private SaveGameStore survivalSaves;
  private SurvivalSetupView survivalSetup;
  private String survivalMapId = "tdn2";
  private FfaSetupView ffaSetup;
  private MapsStore mapsStore;
  private MapsSetupView mapsSetup;
  private String ffaBotType = "cobra";
  private int[] mapsTeams;
  private String ffaDifficulty = "easy";
  private String ffaMapId = "emag";
  private int campaignHomeGeneration;
  private boolean campaignHomeBusy;
  private String mapId = "td2";
  private String matchMode = "towers";
  private String duelWeapon = "cannon";
  private BattleLaunchSpec battleLaunch;
  private MusicPackStore musicStore;
  private MusicTrackCatalog musicCatalog;
  private MapMusicIndex mapMusicIndex;
  private volatile boolean musicEnabled, musicCached;
  private volatile String musicSession = "", musicMapId = "td2";
  private volatile String musicMode = "towers", musicMissionId = "";
  private volatile boolean musicSuspended = true;
  private final Object musicPreferenceLock = new Object();
  private RewardStore rewards;
  private RewardsView rewardsView;
  private RewardsView livePurchaseView;
  private boolean activityResumed;
  private int rewardsHeaderBottomCss, rewardsViewportWidthCss;
  private String livePurchaseTransaction = "", livePurchaseDocument = "";
  private RewardReceiptView rewardReceipt;
  private BattleBriefingView battleBriefing;
  private String startupBriefingSession = "";
  private volatile String rewardSession = "";
  private volatile String rewardRunId = "";
  private SaveGameStore saveGames;
  private SavedGamesView savedGamesView;
  private volatile JSONObject loadingSave;
  private volatile String loadingSaveId = "";
  private boolean restoringGame;
  private boolean rewardSetupFailed;
  private TextView appNotice;
  private final Runnable dismissAppNotice = this::clearAppNotice;
  private volatile String rewardTerminalFreshSession = "", rewardInventoryFreshSession = "";

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    if (Build.VERSION.SDK_INT >= 33) {
      getOnBackInvokedDispatcher()
          .registerOnBackInvokedCallback(
              // Own app navigation before a focused WebView/OEM callback.
              // onBackPressed still gives an open IME first dismissal.
              OnBackInvokedDispatcher.PRIORITY_OVERLAY, this::onBackPressed);
    }
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    touchTestMode = getIntent().getBooleanExtra("touch_test", false);
    touchSuiteMode = getIntent().getBooleanExtra("touch_suite", false);
    researchSuiteMode = getIntent().getBooleanExtra("research_suite", false);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    immersive();

    root = new FrameLayout(this);
    root.setBackgroundColor(TowersTheme.BACKGROUND);
    setContentView(root);

    appUpdates = new AppUpdateController(this);
    updateHomeLayoutListener = this::refreshUpdateHomeVisibility;
    root.getViewTreeObserver().addOnGlobalLayoutListener(updateHomeLayoutListener);
    blueprints = new BlueprintStore(this);
    createWebView();
    musicStore = new MusicPackStore(this);
    musicCached = musicStore.ready();
    musicCatalog = new MusicTrackCatalog(this);
    mapMusicIndex = new MapMusicIndex(this, musicCatalog);
    playGamesBackups = new PlayGamesBackupStore(this);
    try { playGamesBackups.recoverPendingRestore(); }
    catch (Exception error) {
      Log.e(TAG, "Local cloud-backup recovery could not finish", error);
      TextView recovery = new TextView(this);
      recovery.setText("Saved progress recovery could not finish. Your local recovery copy is retained. Close the app and retry.");
      recovery.setTextColor(Color.WHITE); recovery.setTextSize(18); recovery.setPadding(dp(24), dp(24), dp(24), dp(24));
      root.addView(recovery, new FrameLayout.LayoutParams(-1, -1));
      return;
    }
    rewards = new RewardStore(this);
    mapsStore = new MapsStore(this);
    for (JSONObject installed : mapsStore.installedMaps()) {
      try { FfaMapCatalog.registerDownloaded(installed); }
      catch (Exception error) { Log.w(TAG, "An installed map could not be loaded", error); }
    }
    saveGames = new SaveGameStore(this);
    campaignSaves = new SaveGameStore(this, true);
    ffaSaves = new SaveGameStore(this, "ffa");
    challengeSaves = new SaveGameStore(this, "challenge");
    survivalSaves = new SaveGameStore(this, "survival");
    playGames = new PlayGamesController(this, this::playGamesChanged, playGamesBackups);
    survivalMapId = SurvivalMapCatalog.normalizeId(getPreferences(MODE_PRIVATE).getString("survival_map_id", "tdn2"));
    campaignVideos = new CampaignVideoStore(this);
    String savedWalletError = null;
    JSONArray pinnedRuns = rewards.pinnedRuns();
    for (int i = 0; i < pinnedRuns.length(); i++) {
      String run = pinnedRuns.optString(i);
      try { if (!saveGames.hasRun(run) && !survivalSaves.hasRun(run) && !challengeSaves.hasRun(run)) rewards.unpinRun(run); }
      catch (RuntimeException error) { savedWalletError = "Saved-game stock could not be reconciled. Restart to retry."; }
    }
    musicEnabled = getPreferences(MODE_PRIVATE).getBoolean("music_enabled", true);
    String requestedMap = getIntent().getStringExtra("map");
    // A normal app launch starts at the first authored Easy level. Home returns
    // after a battle/save still use mapId from that run, not this cold-start default.
    mapId = MapLevelCatalog.isKnownId(requestedMap) ? requestedMap
        : MapLevelCatalog.get(this).difficulty("easy").get(0).id;
    matchMode = BattleLaunchSpec.matchMode(getIntent().getStringExtra("match_mode"));
    duelWeapon = BattleLaunchSpec.duelWeapon(getIntent().getStringExtra("duel_weapon"));
    ffaDifficulty = BattleLaunchSpec.ffaDifficulty(getPreferences(MODE_PRIVATE).getString("ffa_difficulty", "easy"));
    ffaMapId = FfaMapCatalog.normalizeId(getPreferences(MODE_PRIVATE).getString("ffa_map_id", "emag"));
    challengeMapId = ChallengeMapCatalog.normalizeId(getPreferences(MODE_PRIVATE).getString("challenge_map_id", "firefight"));
    challengeDifficulty = BattleLaunchSpec.ffaDifficulty(getPreferences(MODE_PRIVATE).getString("challenge_difficulty", "easy"));
    showGraphicsSetup();
    if (savedWalletError != null) graphicsSetup.showError(savedWalletError);
    LegacyBlueprintImport.prepare(this, ok -> {
      if (webView != null && !isFinishing() && !isDestroyed())
        webView.evaluateJavascript("window.__warzoneCommands?.reloadBlueprints()", null);
    });
  }

  private void showGraphicsSetup() {
    cancelCampaignHomeCheck();
    graphicsSetup =
        new GraphicsSetupView(
            this,
            "normal",
            mapId,
            matchMode,
            duelWeapon,
            new GraphicsSetupView.Actions() {
              @Override
              public void start(String mode, String map, String selectedMatch, String selectedWeapon) {
                cancelCampaignHomeCheck();
                mapId = map;
                matchMode = BattleLaunchSpec.matchMode(selectedMatch);
                duelWeapon = BattleLaunchSpec.duelWeapon(selectedWeapon);
                startGame();
              }

              @Override
              public void map(String id) {
                cancelCampaignHomeCheck();
                mapId = id;
                getPreferences(MODE_PRIVATE).edit().putString("map_id", id).apply();
              }

              @Override
              public void rewards() { showRewards(false); }
              @Override
              public void savedGames() { showSavedGames(); }
              @Override
              public void survival() { showSurvivalSetup(); }
              @Override
              public void campaign() { showCampaignSetup(); }
              @Override
              public void ffa() { showFfaSetup(); }
              @Override
              public void multiplayer() {
                cancelCampaignHomeCheck();
                startActivity(new android.content.Intent(MainActivity.this, MultiplayerActivity.class));
              }
              @Override
              public void guide() { showGuide(); }
              @Override
              public void hub() { showHub(); }
              @Override
              public void about() { showAbout(); }
              @Override
              public void playGames() { showPlayGames(); }
              @Override
              public void updates() {
                if (appUpdates != null && isUpdateHomeVisible()) appUpdates.show();
              }
              @Override
              public void campaignContinue() { openCampaignFromHome(true); }
              @Override
              public void campaignNew() { openCampaignFromHome(false); }
            });
    String completionError = null;
    try { rewards.reconcileDifficultyBonuses(completionMapGroups()); }
    catch (RuntimeException error) { completionError = error.getMessage(); }
    graphicsSetup.setCompletedMaps(rewards.completedMaps());
    graphicsSetup.setRewardBalance(rewards.balance());
    root.addView(graphicsSetup, new FrameLayout.LayoutParams(-1, -1));
    if (completionError != null) graphicsSetup.showError(completionError);
  }

  private void showSurvivalSetup() {
    if (survivalSetup != null || graphicsSetup == null || loadingOverlay != null) return;
    cancelCampaignHomeCheck();
    graphicsSetup.setVisibility(View.GONE);
    survivalSetup = new SurvivalSetupView(this, survivalMapId, new SurvivalSetupView.Actions() {
      @Override public void start(String selected) {
        survivalMapId = SurvivalMapCatalog.get(selected).id;
        matchMode = "survival";
        getPreferences(MODE_PRIVATE).edit().putString("survival_map_id", survivalMapId).apply();
        closeSurvivalSetup(); startGame();
      }
      @Override public void map(String selected) {
        survivalMapId = SurvivalMapCatalog.get(selected).id;
        getPreferences(MODE_PRIVATE).edit().putString("survival_map_id", survivalMapId).apply();
      }
      @Override public void saves() { showSavedGames(); }
      @Override public void rewards() { showRewards(false); }
      @Override public void back() { closeSurvivalSetup(); }
    });
    survivalSetup.setRewardBalance(rewards.balance());
    root.addView(survivalSetup, new FrameLayout.LayoutParams(-1, -1));
    survivalSetup.requestFocus();
  }

  private void closeSurvivalSetup() {
    if (survivalSetup != null) {
      survivalMapId = survivalSetup.selectedMap();
      root.removeView(survivalSetup); survivalSetup = null;
    }
    if (graphicsSetup != null) { graphicsSetup.setVisibility(View.VISIBLE); graphicsSetup.showTowersMap(); }
  }

  private String currentRewardProfile() { return challengeSetup != null || graphicsSetup == null && isChallengeBattle() ? "challenge" : survivalSetup != null || graphicsSetup == null && isSurvivalBattle() ? "survival" : "towers"; }
  private String currentRewardMap() { return graphicsSetup == null ? battleLaunch.mapId : challengeSetup != null ? challengeSetup.selectedMap() : survivalSetup != null ? survivalSetup.selectedMap() : graphicsSetup.selectedMap(); }
  private MapLevelCatalog.Level currentTowersLevel() { return isSurvivalBattle() ? SurvivalMapCatalog.get(battleLaunch.mapId) : MapLevelCatalog.get(this).level(battleLaunch.mapId); }
  private SaveGameStore currentTowersSaves() { return isSurvivalBattle() ? survivalSaves : saveGames; }

  private void showGuide() {
    if (guideView != null || hubView != null || aboutView != null || playGamesView != null || graphicsSetup == null || campaignHomeBusy) return;
    guideView = new GuideView(this, this::closeGuide);
    graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    root.addView(guideView, new FrameLayout.LayoutParams(-1, -1));
    guideView.requestFocus();
  }

  private void showHub() {
    if (hubView != null || guideView != null || aboutView != null || playGamesView != null || graphicsSetup == null || campaignHomeBusy) return;
    hubView = new HubView(this, this::closeHub);
    graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    root.addView(hubView, new FrameLayout.LayoutParams(-1, -1));
    hubView.requestFocus();
  }

  private void showAbout() {
    if (aboutView != null || hubView != null || guideView != null || playGamesView != null || graphicsSetup == null || campaignHomeBusy) return;
    aboutView = new AboutView(this, this::closeAbout);
    graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    root.addView(aboutView, new FrameLayout.LayoutParams(-1, -1));
    aboutView.requestFocus();
  }

  private void closeAbout() {
    if (aboutView == null) return;
    root.removeView(aboutView);
    aboutView = null;
    if (graphicsSetup != null) {
      graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
      graphicsSetup.requestFocus();
    }
    immersive();
  }

  private void showPlayGames() {
    if (playGames == null || playGamesView != null || aboutView != null || guideView != null || hubView != null
        || graphicsSetup == null || graphicsSetup.getVisibility() != View.VISIBLE
        || !graphicsSetup.isHomeModesVisible() || campaignHomeBusy) return;
    graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    playGamesView = new PlayGamesView(this, playGames, this::closePlayGames);
    root.addView(playGamesView, new FrameLayout.LayoutParams(-1, -1));
    playGamesView.requestFocus();
  }

  private void closePlayGames() {
    if (playGamesView == null) return;
    if (playGames != null && playGames.busy()) {
      android.widget.Toast.makeText(this, "Play Games is busy. Wait, or turn it off to cancel.", android.widget.Toast.LENGTH_SHORT).show();
      return;
    }
    root.removeView(playGamesView); playGamesView = null;
    if (graphicsSetup != null) {
      graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
      graphicsSetup.focusPlayGames();
    }
    immersive();
  }

  private void playGamesChanged() {
    runOnUiThread(() -> {
      if (playGames == null || isFinishing() || isDestroyed()) return;
      if (playGames.restoredGeneration() != playGamesRestoreGeneration) {
        playGamesRestoreGeneration = playGames.restoredGeneration();
        rewards = new RewardStore(this);
        mapsStore = new MapsStore(this);
        for (JSONObject installed : mapsStore.installedMaps()) {
          try { FfaMapCatalog.registerDownloaded(installed); }
          catch (Exception error) { Log.w(TAG, "A restored map could not be registered", error); }
        }
        if (graphicsSetup != null) {
          graphicsSetup.setCompletedMaps(rewards.completedMaps());
          graphicsSetup.setRewardBalance(rewards.balance());
        }
      }
      if (playGamesView != null) playGamesView.refresh();
    });
  }

  private void recordPlayGamesWave(String session) {
    final BattleLaunchSpec launch = battleLaunch;
    if (playGames == null || launch == null || isChallengeBattle()
        || !("towers".equals(launch.matchMode) || "survival".equals(launch.matchMode))) return;
    int cleared = rewards.clearedWave(rewardRunId);
    if (cleared < 1) return;
    final int wave = cleared;
    final String difficulty = currentTowersLevel().difficulty;
    final JSONObject event = playGamesMatchEvent("wave_cleared", false);
    try { if (event != null) event.put("completedWaves", rewards.clearedWaves(rewardRunId)); }
    catch (org.json.JSONException ignored) { return; }
    if (session.equals(rewardSession) && battleLaunch == launch) {
      playGames.recordWave(launch.matchMode, launch.mapId, difficulty, wave, "crystal-support-allowed");
      if (event != null) playGames.recordEvent(event);
    }
  }

  private JSONObject playGamesMatchEvent(String kind, boolean won) {
    BattleLaunchSpec launch = battleLaunch;
    if (launch == null || playGamesRunId.isEmpty() || launch.isCampaign() || launch.isDuel()) return null;
    try {
      String mode = launch.isFfa() && FfaMapCatalog.isDownloaded(launch.mapId) ? "maps" : launch.matchMode;
      boolean skirmish = launch.isFfa() || launch.isChallenge();
      int players = launch.isFfa() ? FfaMapCatalog.playerCount(launch.mapId) : 2;
      JSONObject event = new JSONObject().put("eventId", playGamesRunId + ":" + kind)
          .put("runId", playGamesRunId).put("kind", kind).put("mode", mode).put("map", launch.mapId)
          .put("difficulty", skirmish ? launch.ffaDifficulty : currentTowersLevel().difficulty)
          .put("players", players).put("botType", launch.isChallenge() ? "dumbot25a" : launch.isFfa() ? launch.ffaBotType : "scripted")
          .put("gameType", launch.isFfa() ? MapsTeamSetup.gameType(launch.mapTeams) : "ffa")
          .put("strategy", launch.isChallenge() ? launch.duelWeapon : "native")
          .put("classification", launch.isFfa() ? "native-v1" : "crystal-support-allowed")
          .put("elapsedMs", playGamesElapsedMs).put("nativeCompleted", true).put("verifiedResult", true)
          .put("serverVerified", false).put("spectator", false).put("won", won);
      if (launch.isFfa()) event.put("teams", MapsTeamSetup.toJson(launch.mapTeams, players));
      return event;
    } catch (Exception ignored) { return null; }
  }

  private void recordPlayGamesMatch(boolean won) {
    if (playGames == null) return;
    JSONObject event = playGamesMatchEvent("match_finished", won);
    if (event != null) playGames.recordEvent(event);
  }

  private void closeHub() {
    if (hubView == null) return;
    hideKeyboard();
    HubView closing = hubView;
    hubView = null;
    root.removeView(closing);
    closing.dispose();
    if (graphicsSetup != null) {
      graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
      graphicsSetup.requestFocus();
    }
    immersive();
  }

  private void closeGuide() {
    if (guideView == null) return;
    hideKeyboard();
    GuideView closing = guideView;
    guideView = null;
    root.removeView(closing);
    closing.dispose();
    if (graphicsSetup != null) {
      graphicsSetup.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
      graphicsSetup.requestFocus();
    }
    immersive();
  }

  /** Use the shipped catalogue, including Greenhaven and both original hard maps. */
  private java.util.Map<String, java.util.Set<String>> completionMapGroups() {
    java.util.Map<String, java.util.Set<String>> groups = new java.util.LinkedHashMap<>();
    for (String difficulty : new String[] {"easy", "medium", "hard"}) {
      java.util.Set<String> maps = new java.util.LinkedHashSet<>();
      for (MapLevelCatalog.Level level : MapLevelCatalog.get(this).difficulty(difficulty)) maps.add(level.id);
      groups.put(difficulty, maps);
    }
    return groups;
  }

  private void startGame() {
    if (graphicsSetup == null || loadingOverlay != null || mainMenuReturnPending) return;
    launchGame();
  }

  private void cancelCampaignHomeCheck() {
    campaignHomeGeneration++;
    campaignHomeBusy = false;
    if (graphicsSetup != null) graphicsSetup.setCampaignBusy(false);
  }

  private void openCampaignFromHome(boolean continueSavedGame) {
    if (graphicsSetup == null || campaignHomeBusy || campaignSetup != null
        || loadingOverlay != null || savedGamesView != null || rewardsView != null
        || rewardReceipt != null || mainMenuReturnPending || campaignVideos == null
        || isFinishing() || isDestroyed()) return;
    final GraphicsSetupView home = graphicsSetup;
    final int generation = ++campaignHomeGeneration;
    campaignHomeBusy = true;
    home.setCampaignBusy(true);
    campaignVideos.inspect(ready -> {
      if (generation != campaignHomeGeneration || !campaignHomeBusy || graphicsSetup != home
          || campaignSetup != null || loadingOverlay != null || savedGamesView != null
          || rewardsView != null || rewardReceipt != null || mainMenuReturnPending) return;
      cancelCampaignHomeCheck();
      if (!activityResumed || isFinishing() || isDestroyed()) return;
      if (!ready) { showCampaignSetup(); return; }
      if (continueSavedGame) showCampaignSaves();
      else { matchMode = "campaign"; launchGame(); }
    });
  }

  private void showCampaignSetup() {
    if (graphicsSetup == null || campaignSetup != null || loadingOverlay != null) return;
    cancelCampaignHomeCheck();
    closeRewards();
    closeSavedGames();
    campaignSetup = new CampaignSetupView(this, new CampaignSetupView.Actions() {
      @Override public void start() {
        if (campaignVideos.ready()) { matchMode = "campaign"; launchGame(); }
      }
      @Override public void saves() { showCampaignSaves(); }
      @Override public void download() {
        campaignVideos.download(new OptionalPackStore.Listener() {
          @Override public void progress(long bytes, boolean verifying) { refreshCampaignSetup(null); }
          @Override public void ready() { refreshCampaignSetup(null); }
          @Override public void failed(String message) { refreshCampaignSetup(message); }
        });
        refreshCampaignSetup(null);
      }
      @Override public void cancel() {
        campaignVideos.cancel();
        refreshCampaignSetup("Download paused. Tap Download to resume.");
      }
      @Override public void back() { closeCampaignSetup(); }
    });
    root.addView(campaignSetup, new FrameLayout.LayoutParams(-1, -1));
    campaignVideos.inspect(ready -> refreshCampaignSetup(null));
    refreshCampaignSetup(null);
  }

  private void showFfaSetup() {
    if (graphicsSetup == null || ffaSetup != null || loadingOverlay != null) return;
    cancelCampaignHomeCheck();
    closeCampaignSetup();
    closeRewards();
    closeSavedGames();
    ffaSetup = new FfaSetupView(this, new FfaSetupView.Actions() {
      @Override public void start(String selectedMap, String difficulty) {
        ffaBotType = "cobra";
        mapsTeams = null;
        ffaMapId = BattleLaunchSpec.ffaMapId(selectedMap);
        ffaDifficulty = BattleLaunchSpec.ffaDifficulty(difficulty);
        getPreferences(MODE_PRIVATE).edit().putString("ffa_difficulty", ffaDifficulty)
            .putString("ffa_map_id", ffaMapId).apply();
        matchMode = "ffa";
        launchGame();
      }
      @Override public void map(String id) {
        ffaMapId = BattleLaunchSpec.ffaMapId(id);
        getPreferences(MODE_PRIVATE).edit().putString("ffa_map_id", ffaMapId).apply();
      }
      @Override public void saves() { showFfaSaves(); }
      @Override public void back() { closeFfaSetup(); }
      @Override public void challenge() { closeFfaSetup(); showChallengeSetup(); }
      @Override public void maps() { closeFfaSetup(); showMapsSetup(); }
    }, FfaMapCatalog.isDownloaded(ffaMapId) ? "emag" : ffaMapId, ffaDifficulty);
    root.addView(ffaSetup, new FrameLayout.LayoutParams(-1, -1));
  }

  private void closeFfaSetup() {
    closeSavedGames();
    if (ffaSetup != null) {
      ffaMapId = ffaSetup.selectedMapId();
      root.removeView(ffaSetup); ffaSetup = null;
    }
  }

  private void showMapsSetup() {
    if (graphicsSetup == null || mapsSetup != null || loadingOverlay != null) return;
    mapsSetup = new MapsSetupView(this, mapsStore, new MapsSetupView.Actions() {
      @Override public void start(JSONObject installed, String difficulty, String botType, int[] teams) {
        try {
          FfaMapCatalog.registerDownloaded(installed);
          ffaMapId = BattleLaunchSpec.ffaMapId(installed.getString("id"));
          ffaDifficulty = BattleLaunchSpec.ffaDifficulty(difficulty);
          ffaBotType = MapsBotCatalog.get(botType).id;
          mapsTeams = MapsTeamSetup.validate(teams, installed.getInt("players"));
          matchMode = "ffa";
          launchGame();
        } catch (Exception error) { showAppNotice(String.valueOf(error.getMessage()), true); }
      }
      @Override public void saves() { showFfaSaves(); }
      @Override public void back() { closeMapsSetup(); showFfaSetup(); }
    });
    root.addView(mapsSetup, new FrameLayout.LayoutParams(-1, -1));
  }

  private void closeMapsSetup() {
    if (mapsSetup != null) { root.removeView(mapsSetup); mapsSetup = null; }
  }

  private void showFfaSaves() {
    if (graphicsSetup == null || (ffaSetup == null && mapsSetup == null) || savedGamesView != null || loadingOverlay != null) return;
    savedGamesView = new SavedGamesView(this, ffaSaves.list(), new SavedGamesView.Actions() {
      @Override public void load(String id) { loadFfaSave(id); }
      @Override public void delete(String id) {
        try { ffaSaves.delete(id); savedGamesView.refresh(ffaSaves.list()); }
        catch (Exception error) { savedGamesView.showError(error.getMessage()); }
      }
      @Override public void close() { closeSavedGames(); }
    }, "ffa");
    root.addView(savedGamesView, new FrameLayout.LayoutParams(-1, -1));
  }

  private void loadFfaSave(String id) {
    if (graphicsSetup == null || savedGamesView == null || loadingOverlay != null) return;
    try {
      JSONObject payload = ffaSaves.load(id);
      ffaDifficulty = BattleLaunchSpec.ffaDifficulty(payload.getJSONObject("metadata").getString("difficulty"));
      ffaMapId = BattleLaunchSpec.ffaMapId(payload.getJSONObject("metadata").getString("mapId"));
      mapsTeams = MapsTeamSetup.fromMetadata(payload.getJSONObject("metadata"), FfaMapCatalog.playerCount(ffaMapId));
      matchMode = "ffa";
      battleLaunch = new BattleLaunchSpec("ffa", duelWeapon, ffaMapId, musicEnabled && musicCached, ffaDifficulty,
          BattleLaunchSpec.ffaBotType(payload.getJSONObject("metadata").optString("botType")), mapsTeams);
      closeFfaSetup();
      closeMapsSetup();
      ffaMapId = battleLaunch.mapId;
      getPreferences(MODE_PRIVATE).edit().putString("ffa_map_id", ffaMapId).putString("ffa_difficulty", ffaDifficulty).apply();
      root.removeView(graphicsSetup); graphicsSetup = null;
      loadingSave = payload; loadingSaveId = id; restoringGame = true;
      createLoadingPanel();
      webView.loadUrl(gameUrl());
    } catch (Exception error) {
      if (savedGamesView != null) savedGamesView.showError(error.getMessage());
      else { returnToMainMenu(); graphicsSetup.showError(error.getMessage()); }
    }
  }

  private void showChallengeSetup() {
    if (graphicsSetup == null || challengeSetup != null || loadingOverlay != null) return;
    cancelCampaignHomeCheck(); closeCampaignSetup(); closeFfaSetup(); closeRewards(); closeSavedGames();
    challengeSetup = new ChallengeSetupView(this, new ChallengeSetupView.Actions() {
      @Override public void start(String selectedMap, String difficulty) {
        challengeMapId = BattleLaunchSpec.challengeMapId(selectedMap);
        challengeDifficulty = BattleLaunchSpec.ffaDifficulty(difficulty);
        // Choose once per new match. Restored games keep their saved branch.
        challengeWeapon = new java.security.SecureRandom().nextBoolean() ? "cannon" : "rockets";
        getPreferences(MODE_PRIVATE).edit().putString("challenge_map_id", challengeMapId).putString("challenge_difficulty", challengeDifficulty).apply();
        matchMode = "challenge"; launchGame();
      }
      @Override public void map(String id) { challengeMapId = BattleLaunchSpec.challengeMapId(id); getPreferences(MODE_PRIVATE).edit().putString("challenge_map_id", id).apply(); }
      @Override public void saves() { showChallengeSaves(); }
      @Override public void rewards() { showRewards(false); }
      @Override public void back() { closeChallengeSetup(); showFfaSetup(); }
    }, challengeMapId, challengeDifficulty);
    challengeSetup.setRewardBalance(rewards.balance());
    root.addView(challengeSetup, new FrameLayout.LayoutParams(-1,-1)); challengeSetup.requestFocus();
  }
  private void closeChallengeSetup() {
    closeSavedGames();
    if (challengeSetup != null) { challengeMapId = challengeSetup.selectedMap(); root.removeView(challengeSetup); challengeSetup = null; }
  }
  private void showChallengeSaves() {
    if (graphicsSetup == null || challengeSetup == null || savedGamesView != null || loadingOverlay != null) return;
    savedGamesView = new SavedGamesView(this, challengeSaves.list(), new SavedGamesView.Actions() {
      @Override public void load(String id) { loadChallengeSave(id); }
      @Override public void delete(String id) {
        try { String run = challengeSaves.delete(id); if (!saveGames.hasRun(run) && !survivalSaves.hasRun(run) && !challengeSaves.hasRun(run)) rewards.unpinRun(run); savedGamesView.refresh(challengeSaves.list()); }
        catch (Exception error) { savedGamesView.showError(error.getMessage()); }
      }
      @Override public void close() { closeSavedGames(); }
    }, "challenge"); root.addView(savedGamesView, new FrameLayout.LayoutParams(-1,-1));
  }
  private void loadChallengeSave(String id) {
    if (graphicsSetup == null || savedGamesView == null || loadingOverlay != null) return;
    try {
      JSONObject payload = challengeSaves.load(id), metadata = payload.getJSONObject("metadata");
      String selected = BattleLaunchSpec.challengeMapId(metadata.getString("mapId"));
      String run = metadata.getString("rewardRunId");
      rewards.resumeRun(run, selected, "challenge");
      challengeDifficulty = BattleLaunchSpec.ffaDifficulty(metadata.getString("difficulty"));
      challengeWeapon = metadata.getString("weapon"); challengeMapId = selected; matchMode = "challenge";
      battleLaunch = new BattleLaunchSpec("challenge", challengeWeapon, selected, musicEnabled && musicCached, challengeDifficulty, "dumbot25a");
      closeChallengeSetup(); challengeMapId = selected;
      getPreferences(MODE_PRIVATE).edit().putString("challenge_map_id",selected).putString("challenge_difficulty",challengeDifficulty).apply();
      root.removeView(graphicsSetup); graphicsSetup = null;
      loadingSave = payload; loadingSaveId = id; restoringGame = true;
      createLoadingPanel(); rewardRunId = run; webView.loadUrl(gameUrl());
    } catch (Exception error) {
      if (savedGamesView != null) savedGamesView.showError(error.getMessage());
      else { returnToMainMenu(); graphicsSetup.showError(error.getMessage()); }
    }
  }

  private void refreshCampaignSetup(String error) {
    if (campaignSetup != null) campaignSetup.update(campaignVideos.ready(), campaignVideos.downloading(),
        campaignVideos.downloadedBytes(), campaignVideos.phase(), error);
  }

  private void closeCampaignSetup() {
    cancelCampaignHomeCheck();
    closeSavedGames();
    if (campaignSetup != null) { root.removeView(campaignSetup); campaignSetup = null; }
    if (campaignVideos != null) campaignVideos.cancel();
  }

  private void showCampaignSaves() {
    if (graphicsSetup == null || savedGamesView != null || loadingOverlay != null
        || !campaignVideos.ready()) return;
    cancelCampaignHomeCheck();
    savedGamesView = new SavedGamesView(this, campaignSaves.list(), new SavedGamesView.Actions() {
      @Override public void load(String id) {
        if (!campaignVideos.ready()) {
          savedGamesView.showError("Download the campaign videos before continuing."); return;
        }
        loadCampaignSave(id);
      }
      @Override public void delete(String id) {
        try { campaignSaves.delete(id); savedGamesView.refresh(campaignSaves.list()); }
        catch (Exception error) { savedGamesView.showError(error.getMessage()); }
      }
      @Override public void close() { closeSavedGames(); }
    }, true);
    root.addView(savedGamesView, new FrameLayout.LayoutParams(-1, -1));
  }

  private void loadCampaignSave(String id) {
    if (graphicsSetup == null || savedGamesView == null || loadingOverlay != null
        || !campaignVideos.ready()) return;
    cancelCampaignHomeCheck();
    try {
      JSONObject payload = campaignSaves.load(id);
      matchMode = "campaign";
      battleLaunch = new BattleLaunchSpec("campaign", duelWeapon, mapId, musicEnabled && musicCached);
      closeCampaignSetup();
      root.removeView(graphicsSetup);
      graphicsSetup = null;
      loadingSave = payload;
      loadingSaveId = id;
      restoringGame = true;
      createLoadingPanel();
      webView.loadUrl(gameUrl());
    } catch (Exception error) {
      if (savedGamesView != null) savedGamesView.showError(error.getMessage());
      else { returnToMainMenu(); graphicsSetup.showError(error.getMessage()); }
    }
  }

  private void launchGame() {
    launchGame(new BattleLaunchSpec(
        matchMode, "challenge".equals(matchMode) ? challengeWeapon : duelWeapon, "challenge".equals(matchMode) ? challengeMapId : "survival".equals(matchMode) ? survivalMapId : "ffa".equals(matchMode) ? ffaMapId : mapId, musicEnabled && musicCached, "challenge".equals(matchMode) ? challengeDifficulty : ffaDifficulty, ffaBotType,
        "ffa".equals(matchMode) && FfaMapCatalog.isDownloaded(ffaMapId) ? mapsTeams : null));
  }

  private void launchCrystalSkirmish() {
    if (graphicsSetup == null || rewardsView == null || !"towers".equals(currentRewardProfile())) return;
    launchGame(new BattleLaunchSpec("ffa", "cannon", BattleLaunchSpec.CRYSTAL_SKIRMISH_MAP,
        musicEnabled && musicCached, "easy", "cobra"));
  }

  private void launchGame(BattleLaunchSpec launch) {
    cancelCampaignHomeCheck();
    dismissBriefing();
    startupBriefingSession = "";
    closeRewards();
    closeSavedGames();
    dismissRewardReceipt();
    loadingSave = null;
    loadingSaveId = "";
    restoringGame = false;
    battleLaunch = launch;
    closeCampaignSetup();
    closeFfaSetup();
    closeChallengeSetup();
    closeMapsSetup();
    getPreferences(MODE_PRIVATE)
        .edit()
        .putString("map_id", mapId)
        .apply();
    if (graphicsSetup != null) {
      root.removeView(graphicsSetup);
      graphicsSetup = null;
    }
    createLoadingPanel();
    rewardRunId = isRewardBattle() ? battleSession : "";
    if (isRewardBattle()) {
      try { rewards.begin(rewardRunId, battleLaunch.mapId, battleLaunch.matchMode); }
      catch (RuntimeException error) {
        returnToMainMenu();
        graphicsSetup.showError(error.getMessage());
        return;
      }
    }
    webView.loadUrl(gameUrl());
  }

  private void showRewards(boolean inGame) {
    if (rewardsView != null || rewardReceipt != null || rewards == null) return;
    if (inGame && (!isRewardBattle() || battleSession.isEmpty() || !battleOutcome.isEmpty()
        || loadingOverlay != null || graphicsSetup != null)) return;
    if (!inGame && graphicsSetup == null) return;
    if (!inGame) cancelCampaignHomeCheck();
    final String selectedMap = currentRewardMap(), profile = currentRewardProfile();
    final boolean crystalSkirmishAvailable = !inGame && "towers".equals(profile);
    final String crystalSkirmishOffer = !crystalSkirmishAvailable ? null
        : rewards.wonCrystalSkirmishToday() ? "25 Krystals per completed match today"
            : "35 Krystals for your first win today";
    String selectedName = "challenge".equals(profile) ? ChallengeMapCatalog.get(this).map(selectedMap).name : "survival".equals(profile) ? SurvivalMapCatalog.get(selectedMap).name : MapLevelCatalog.get(this).level(selectedMap).name;
    rewardsView = new RewardsView(this, profile, selectedMap, selectedName, rewards.balance(), rewards.inventory(),
        inGame ? rewards.active(rewardRunId) : rewards.loadout(profile), inGame, crystalSkirmishOffer,
        new RewardsView.Actions() {
          @Override public void crystalSkirmish() { launchCrystalSkirmish(); }
          @Override public void buy(String id, int quantity) {
            if (rewardsView == null) return;
            try {
              if (inGame) {
                if (rewardSession.isEmpty() || !rewardSession.equals(battleSession)) return;
                String request = rewards.reserveLive(rewardRunId, id, quantity);
                livePurchaseView = rewardsView;
                livePurchaseDocument = rewardSession;
                try { livePurchaseTransaction = new JSONObject(request).getString("transactionId"); }
                catch (org.json.JSONException error) { throw new IllegalStateException("The purchase could not be prepared.", error); }
                webView.evaluateJavascript("window.WarzoneRewards?.purchase(" + request + ")", null);
                return;
              }
              if (graphicsSetup == null) return;
              rewards.buy(id, quantity, profile, selectedMap);
              graphicsSetup.setRewardBalance(rewards.balance());
              if (survivalSetup != null) survivalSetup.setRewardBalance(rewards.balance());
    if (challengeSetup != null) challengeSetup.setRewardBalance(rewards.balance());
              rewardsView.completeMutation(rewards.balance(), rewards.inventory(), rewards.loadout(profile));
            } catch (RuntimeException error) { rewardsView.showError(error.getMessage()); }
          }
          @Override public void equip(String id, int quantity) {
            if (inGame || graphicsSetup == null || rewardsView == null) return;
            try {
              rewards.equip(id, quantity, profile, selectedMap);
              rewardsView.completeMutation(rewards.balance(), rewards.inventory(), rewards.loadout(profile));
            } catch (RuntimeException error) { rewardsView.showError(error.getMessage()); }
          }
          @Override public void close() { closeRewards(); }
        });
    FrameLayout.LayoutParams rewardLayout = new FrameLayout.LayoutParams(-1, -1);
    if (inGame) {
      int width = webView == null ? 0 : webView.getWidth();
      int inset = rewardsViewportWidthCss > 0
          ? Math.round(rewardsHeaderBottomCss * width * webView.getScaleX() / rewardsViewportWidthCss) : dp(40);
      rewardLayout.topMargin = Math.max(0, Math.min(root.getHeight() / 3, inset));
    }
    root.addView(rewardsView, rewardLayout);
    if (inGame && webView != null)
      webView.evaluateJavascript("window.WarzoneRewards?.drawerChanged(true);true", null);
  }

  private void closeRewards() {
    livePurchaseView = null;
    livePurchaseTransaction = "";
    livePurchaseDocument = "";
    if (rewardsView != null) { root.removeView(rewardsView); rewardsView = null; }
    if (survivalSetup != null) survivalSetup.setRewardBalance(rewards.balance());
    if (challengeSetup != null) challengeSetup.setRewardBalance(rewards.balance());
    if (webView != null && graphicsSetup == null && !battleSession.isEmpty())
      webView.evaluateJavascript("window.WarzoneRewards?.drawerChanged(false);true", null);
    rewardsHeaderBottomCss = 0; rewardsViewportWidthCss = 0;
    if (webView != null && graphicsSetup == null) webView.requestFocus();
    immersive();
  }

  private void showSavedGames() {
    if (graphicsSetup == null || savedGamesView != null || rewardsView != null) return;
    cancelCampaignHomeCheck();
    final boolean survival = survivalSetup != null;
    final SaveGameStore store = survival ? survivalSaves : saveGames;
    savedGamesView = new SavedGamesView(this, store.list(), new SavedGamesView.Actions() {
      @Override public void load(String id) { loadSavedGame(id, survival); }
      @Override public void delete(String id) {
        String failure = null;
        try {
          String run = store.delete(id);
          if (!saveGames.hasRun(run) && !survivalSaves.hasRun(run) && !challengeSaves.hasRun(run)) rewards.unpinRun(run);
        } catch (Exception error) { failure = error.getMessage() == null ? "Saved-game deletion could not finish. Restart to retry." : error.getMessage(); }
        finally {
          if (savedGamesView != null) {
            savedGamesView.refresh(store.list());
            if (failure != null) savedGamesView.showError(failure);
          }
          if (graphicsSetup != null) graphicsSetup.setRewardBalance(rewards.balance());
        }
      }
      @Override public void close() { closeSavedGames(); }
    }, survival ? "survival" : "towers");
    root.addView(savedGamesView, new FrameLayout.LayoutParams(-1, -1));
  }

  private void closeSavedGames() {
    if (savedGamesView != null) { root.removeView(savedGamesView); savedGamesView = null; }
  }

  private void loadSavedGame(String id, boolean survival) {
    if (graphicsSetup == null || savedGamesView == null || loadingOverlay != null) return;
    cancelCampaignHomeCheck();
    try {
      JSONObject payload = (survival ? survivalSaves : saveGames).load(id), metadata = payload.getJSONObject("metadata");
      String savedMap = metadata.getString("mapId"), run = metadata.getString("session");
      if (survival) SurvivalMapCatalog.get(savedMap); else MapLevelCatalog.get(this).level(savedMap);
      rewards.resumeRun(run, savedMap, survival ? "survival" : "towers");
      rewardRunId = run;
      rewardSession = run; // Cleanup can suspend the correct run if setup fails before a new document exists.
      closeSavedGames();
      if (survival) { closeSurvivalSetup(); survivalMapId = savedMap; } else mapId = savedMap;
      matchMode = survival ? "survival" : "towers";
      battleLaunch = new BattleLaunchSpec(matchMode, duelWeapon, savedMap, musicEnabled && musicCached);
      getPreferences(MODE_PRIVATE).edit().putString(survival ? "survival_map_id" : "map_id", savedMap).apply();
      root.removeView(graphicsSetup);
      graphicsSetup = null;
      loadingSave = payload;
      loadingSaveId = id;
      restoringGame = true;
      createLoadingPanel();
      rewardRunId = run;
      webView.loadUrl(gameUrl());
    } catch (Exception error) {
      if (savedGamesView != null) savedGamesView.showError(error.getMessage());
      else { returnToMainMenu(); graphicsSetup.showError(error.getMessage()); }
    }
  }

  private boolean completeRewardQuote(String session, JSONObject quote) {
    try {
      if (!session.equals(rewardSession) || quote == null || !rewardRunId.equals(quote.optString("session")) || !quote.optBoolean("applied")) return false;
      if (battleLaunch == null || !battleLaunch.matchMode.equals(quote.optString("profile", "towers"))
          || !battleLaunch.mapId.equals(quote.optString("map", battleLaunch.mapId))) return false;
      JSONObject remaining = quote.getJSONObject("remaining");
      JSONObject expected = rewards.resumeCaps(rewardRunId).getJSONObject("items");
      for (java.util.Iterator<String> it = expected.keys(); it.hasNext();) if (!remaining.has(it.next())) return false;
      return true;
    } catch (Exception error) { return false; }
  }

  private void dismissRewardReceipt() {
    if (rewardReceipt != null) { root.removeView(rewardReceipt); rewardReceipt = null; }
    if (graphicsSetup != null) graphicsSetup.setResultOverlayVisible(false);
  }

  private void finishTowersRewards(boolean won) {
    if (isCampaignBattle()) return;
    if (isChallengeBattle()) { finishChallenge(won); return; }
    if (isFfaBattle()) { finishFfa(won); return; }
    if (isDuelBattle()) { showReplayPanel(won); return; }
    if (battleSession.isEmpty() || !battleOutcome.isEmpty() || battleLaunch == null) return;
    final String playedMap = battleLaunch.mapId;
    MapLevelCatalog.Level level = currentTowersLevel();
    RewardLedger.Receipt receipt;
    try { receipt = isSurvivalBattle()
        ? rewards.finish(rewardRunId, won, level.difficulty, level.rounds, battleSession.equals(rewardTerminalFreshSession))
        : rewards.finish(rewardRunId, won, level.difficulty, level.rounds,
            battleSession.equals(rewardTerminalFreshSession), completionMapGroups().get(level.difficulty)); }
    catch (RuntimeException error) {
      // Never display an invented credit when storage fails.
      showAppNotice(error.getMessage(), true);
      if (isSurvivalBattle()) survivalMapId = playedMap; else mapId = playedMap;
      returnToMainMenu();
      return;
    }
    if (receipt == null) return;
    recordPlayGamesWave(battleSession);
    recordPlayGamesMatch(won);
    if (playGames != null) {
      int cleared = rewards.clearedWave(rewardRunId);
      if (cleared > 0) playGames.recordWave(battleLaunch.matchMode, playedMap, level.difficulty,
          cleared, "crystal-support-allowed");
      if (won) playGames.recordVictory(battleLaunch.matchMode, playedMap, level.difficulty, "crystal-support-allowed");
    }
    battleOutcome = won ? "victory" : "defeated";
    boolean survival = isSurvivalBattle();
    if (survival) survivalMapId = playedMap; else mapId = playedMap;
    getPreferences(MODE_PRIVATE).edit().putString(survival ? "survival_map_id" : "map_id", playedMap).apply();
    // Unload the ended engine before showing Home. The stock loss/frontend
    // screen never becomes a destination, and the played map remains selected.
    returnToMainMenu();
    int receiptBottomClearance = graphicsSetup == null ? dp(32)
        : graphicsSetup.resultOverlayBottomClearance();
    if (graphicsSetup != null) graphicsSetup.setResultOverlayVisible(true);
    rewardReceipt = new RewardReceiptView(this, won, level.name, level.difficulty,
        receipt.wave, receipt.total, receipt.earned, receipt.balance, receipt.reason,
        receiptBottomClearance, this::dismissRewardReceipt);
    root.addView(rewardReceipt, new FrameLayout.LayoutParams(-1, -1));
    rewardReceipt.requestFocus();
    if (!won) {
      BattleBriefingView view = new BattleBriefingView(this, true);
      battleBriefing = view;
      root.addView(view, new FrameLayout.LayoutParams(-1, -1));
      view.showFor(3000, () -> fadeBriefing(view));
    }
  }

  private void dismissBriefing() {
    if (battleBriefing != null) {
      battleBriefing.cancel();
      root.removeView(battleBriefing);
      battleBriefing = null;
    }
  }

  private void fadeBriefing(BattleBriefingView expected) {
    if (battleBriefing != expected) return;
    expected.animate().alpha(0f).setDuration(180).withEndAction(() -> {
      if (battleBriefing == expected) dismissBriefing();
    }).start();
  }

  private void prepareStartupBriefing(String session) {
    if (isDuelBattle() || isCampaignBattle() || isSkirmishBattle() || restoringGame) {
      hideLoadingPanel(); webView.requestFocus(); return;
    }
    if (session.equals(startupBriefingSession)) return;
    startupBriefingSession = session;
    webView.evaluateJavascript("Promise.resolve(window.WarzoneBriefing?.prepare(" + JSONObject.quote(session)
        + ")).then(ok=>BlockNightAndroid.startupBriefingReady(" + JSONObject.quote(session)
        + ",ok===true)).catch(()=>BlockNightAndroid.startupBriefingReady(" + JSONObject.quote(session)
        + ",false));true", null);
  }

  private void briefingFailed() {
    showEngineFailure("The battlefield could not resume. Tap to return Home.");
    if (loading != null) loading.setOnClickListener(v -> returnToMainMenu());
    dismissBriefing();
  }

  private Set<String> selectedMusicTracks() {
    Set<String> allowed = musicCatalog.allIds();
    Set<String> selected =
        new HashSet<>(
            getPreferences(MODE_PRIVATE).getStringSet("music_tracks", Collections.emptySet()));
    selected.retainAll(allowed);
    return selected;
  }

  private String gameUrl() {
    BattleLaunchSpec launch = battleLaunch;
    String url =
        (launch.isSurvival() ? ORIGIN + "/warzone/mobile-survival.html?blocknight=1&mode=survival"
            : launch.isCampaign() ? ORIGIN + "/warzone/mobile-campaign.html?blocknight=1&mode=campaign"
            : launch.isChallenge() ? ORIGIN + "/warzone/mobile-challenge.html?blocknight=1&mode=challenge&bnFfaDifficulty=" + launch.ffaDifficulty
                + "&bnFfaMap=" + launch.mapId + "&bnChallengeWeapon=" + launch.duelWeapon
                + (restoringGame ? "&bnFfaRestore=1" : "")
            : launch.isFfa() ? ORIGIN + "/warzone/mobile-ffa.html?blocknight=1&mode=ffa&bnFfaDifficulty=" + launch.ffaDifficulty
                + "&bnFfaBotType=" + launch.ffaBotType + "&bnFfaMap=" + launch.mapId
                + (restoringGame ? "&bnFfaRestore=1" : "")
            : launch.isDuel()
            ? ORIGIN + "/warzone/mobile-duel.html?blocknight=1&match_mode=duel&weapon="
                + launch.duelWeapon
            : URL)
            + "&battle_session="
            + battleSession
            + "&bnProgressRunId=" + android.net.Uri.encode(playGamesRunId)
            + "&map="
            + launch.mapId
            + "&music="
            + (launch.musicEnabled ? "1" : "0");
    if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        || getIntent().getBooleanExtra("music_probe", false)) url += "&music_probe=1";
    return url;
  }

  private boolean isDuelBattle() {
    return battleLaunch != null && battleLaunch.isDuel();
  }

  private boolean isCampaignBattle() { return battleLaunch != null && battleLaunch.isCampaign(); }
  private boolean isFfaBattle() { return battleLaunch != null && battleLaunch.isFfa(); }
  private boolean isCrystalSkirmish() { return battleLaunch != null && battleLaunch.isCrystalSkirmish(); }
  private boolean isChallengeBattle() { return battleLaunch != null && battleLaunch.isChallenge(); }
  private boolean isSkirmishBattle() { return isFfaBattle() || isChallengeBattle(); }
  private boolean isRewardBattle() { return isTowersBattle() || isChallengeBattle(); }
  private boolean isSurvivalBattle() { return battleLaunch != null && battleLaunch.isSurvival(); }
  private boolean isTowersBattle() { return battleLaunch != null && ("towers".equals(battleLaunch.matchMode) || isSurvivalBattle()); }

  private void createWebView() {
    EngineWebView engine = new EngineWebView(this);
    webView = engine;
    webView.setBackgroundColor(isDuelBattle() ? Color.BLACK : TowersTheme.BACKGROUND);
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    webView.setHorizontalScrollBarEnabled(false);
    webView.setVerticalScrollBarEnabled(false);
    webView.setLongClickable(false);
    webView.setOnLongClickListener(view -> true);
    webView.setHapticFeedbackEnabled(false);
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    webView.setFocusable(true);
    webView.setFocusableInTouchMode(true);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setSupportZoom(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

    webView.addJavascriptInterface(new EngineBridge(), "BlockNightAndroid");
    WebViewAssetLoader.AssetsPathHandler guideAssets = new WebViewAssetLoader.AssetsPathHandler(this);
    assetLoader =
        new WebViewAssetLoader.Builder()
            .addPathHandler("/warzone/", new WarzoneAssetHandler())
            .addPathHandler("/assets/", path -> {
              WebResourceResponse response = guideAssets.handle(path);
              // Help lives inside the isolated engine document. Its reader
              // frame must opt into the same embedder policy to load at all.
              if (response != null) response.setResponseHeaders(isolationHeaders());
              return response;
            })
            .build();
    configureIsolationAllowlist();

    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String videoPath = "/warzone/sequences/";
            if (campaignVideos != null && "https".equalsIgnoreCase(uri.getScheme())
                && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith(videoPath)) {
              String range = null;
              for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet())
                if ("Range".equalsIgnoreCase(header.getKey())) range = header.getValue();
              return campaignVideos.response(uri.getPath().substring(videoPath.length()), request.getMethod(), range, isolationHeaders());
            }
            String musicPath = "/warzone/optional/map-music/";
            if ("https".equalsIgnoreCase(uri.getScheme())
                && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith(musicPath)) {
              return mapMusicResponse(request, uri.getPath().substring(musicPath.length()));
            }
            return assetLoader.shouldInterceptRequest(request.getUrl());
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !"appassets.androidplatform.net".equalsIgnoreCase(uri.getHost());
          }

          @Override
          public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            if (battleControls != null) battleControls.reset();
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            Uri page = Uri.parse(url);
            if (!"appassets.androidplatform.net".equals(page.getHost())
                || !("/warzone/mobile.html".equals(page.getPath())
                    || "/warzone/mobile-duel.html".equals(page.getPath())
                    || "/warzone/mobile-ffa.html".equals(page.getPath())
                    || "/warzone/mobile-challenge.html".equals(page.getPath())
                    || "/warzone/mobile-survival.html".equals(page.getPath())
                    || "/warzone/mobile-campaign.html".equals(page.getPath()))) return;
            if (battleControls != null) battleControls.pageReady(url);
            verifyEnginePrerequisites();
          }
        });
    webView.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onConsoleMessage(ConsoleMessage message) {
            String engineMessage = message.message();
            if ((engineMessage.contains("BNWAVE:") || isDuelBattle() && engineMessage.contains("BNDUEL:")
                    || isSkirmishBattle() && engineMessage.contains("BNFFA:"))
                && (engineMessage.contains("\"phase\":\"victory\"")
                    || engineMessage.contains("\"phase\":\"defeated\""))) {
              // Preserve a worker's explicit result before its subsequent quit
              // log is routed through the neutral-exit path.
              webView.evaluateJavascript(
                  (isDuelBattle()
                      ? "window.__warzoneDuel?.nativeOutput(" + JSONObject.quote(engineMessage) + ");"
                      : "")
                      + "window.__towersHtml?.nativeOutput(" + JSONObject.quote(engineMessage) + ");true", null);
            }
            boolean quitting = engineMessage.contains("GAMECODE_QUITGAME");
            boolean failedLoad = engineMessage.contains("Exiting to main menu")
                || engineMessage.contains("Restarting main menu")
                || (engineMessage.contains("Trying to load Game ") && engineMessage.contains(" failed!"));
            if ((quitting || failedLoad)
                && startupAutomationStarted && graphicsSetup == null && replayPanel == null) {
              // Also cover logs emitted by a native worker, whose console is
              // outside the page's synchronous lifecycle observer.
              webView.setVisibility(View.INVISIBLE);
              webView.evaluateJavascript(
                  "window.__towersHtml?.exit('" + (quitting ? "quit" : "load-failed") + "');true", null);
            }
            Log.i(
                "BlockNightWZConsole",
                message.messageLevel()
                    + " "
                    + message.message()
                    + " ("
                    + message.lineNumber()
                    + ")");
            return true;
          }
        });

    root.addView(
        webView,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    battleControls = BattleControls.attach(root, engine, engine::evaluateHostJavascript);
    webView.setPivotX(0f);
    webView.setPivotY(0f);
    viewportListener =
        (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> fitViewport();
    root.addOnLayoutChangeListener(viewportListener);
    root.post(this::fitViewport);
  }

  /** Reserve the command row while keeping the engine above its minimum. */
  private void fitViewport() {
    if (root == null || webView == null) return;
    int width = root.getWidth();
    int height = root.getHeight();
    if (width <= 0 || height <= 0) return;
    float density = getResources().getDisplayMetrics().density;
    // Warzone's blocker uses inclusive max-width/max-height media queries.
    // Give the unmodified engine a small margin above its documented minimum.
    float scale =
        Math.min(
            1f,
            Math.min(
                width / (MIN_ENGINE_CSS_WIDTH * density),
                height / ((MIN_ENGINE_CSS_HEIGHT + COMMAND_STRIP_CSS_HEIGHT) * density)));
    // Compact layouts keep all commands visible on a second row, with
    // wave status at the top-right. Preserve the engine minimum below both.
    if (width / (scale * density) <= 1100f) {
      // Leave room for Extra large wrapper controls as well as the
      // second-row wave status, without taking SDL below its minimum.
      scale = Math.min(scale, height / ((MIN_ENGINE_CSS_HEIGHT + 116f) * density));
    }
    int virtualWidth = (int) Math.ceil(width / scale);
    int virtualHeight = (int) Math.ceil(height / scale);
    FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webView.getLayoutParams();
    int gravity = Gravity.TOP | Gravity.START;
    // The root's layout callback also runs when its bounds have not changed.
    // Reapplying identical child parameters requests another layout, which
    // otherwise creates a continuous layout loop during play and loading.
    if (params.width != virtualWidth
        || params.height != virtualHeight
        || params.gravity != gravity) {
      params.width = virtualWidth;
      params.height = virtualHeight;
      params.gravity = gravity;
      webView.setLayoutParams(params);
    }
    if (webView.getScaleX() != scale) webView.setScaleX(scale);
    if (webView.getScaleY() != scale) webView.setScaleY(scale);
  }

  private void createLoadingPanel() {
    mapMusicLifecycle("dispose");
    dismissMainMenuDialog();
    mainMenuReturnPending = false;
    if (webView != null) webView.setVisibility(View.VISIBLE);
    battleSession = java.util.UUID.randomUUID().toString();
    JSONObject progressMetadata = loadingSave == null ? null : loadingSave.optJSONObject("metadata");
    playGamesRunId = progressMetadata == null ? battleSession : progressMetadata.optString("progressRunId",
        progressMetadata.optString("rewardRunId", progressMetadata.optString("session", battleSession)));
    if (playGamesRunId.isEmpty() || playGamesRunId.length() > 160) playGamesRunId = battleSession;
    playGamesElapsedMs = -1;
    rewardSetupFailed = false;
    rewardTerminalFreshSession = "";
    rewardInventoryFreshSession = "";
    rewardSession = isRewardBattle() ? battleSession : "";
    synchronized (musicPreferenceLock) {
      musicMapId = battleLaunch != null ? battleLaunch.mapId : mapId;
      musicMode = battleLaunch != null ? battleLaunch.matchMode : "towers";
      musicMissionId = isCampaignBattle() ? (loadingSave != null
          ? loadingSave.optJSONObject("metadata").optString("nativeLevel", "CAM_1A") : "CAM_1A") : "";
      musicSession = isDuelBattle() ? "" : battleSession;
    }
    if (replayPanel != null) {
      root.removeView(replayPanel);
      replayPanel = null;
    }
    replayWon = false;
    battleOutcome = "";
    if (loadingOverlay != null) root.removeView(loadingOverlay);

    loadingOverlay = new FrameLayout(this);
    loadingOverlay.setBackgroundColor(isDuelBattle() ? 0xFF0B151B : TowersTheme.BACKGROUND);
    // Loading taps must not reach the covered native lobby or battlefield.
    loadingOverlay.setClickable(true);
    loadingOverlay.setFocusable(true);

    WarzoneSplashView artwork = new WarzoneSplashView(this, !isDuelBattle());
    loadingOverlay.addView(
        artwork,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.HORIZONTAL);
    card.setGravity(Gravity.CENTER_VERTICAL);
    card.setPadding(dp(16), dp(12), dp(16), dp(12));
    GradientDrawable cardBackground = new GradientDrawable();
    cardBackground.setColor(isDuelBattle() ? 0xF2101F26 : TowersTheme.PANEL);
    cardBackground.setCornerRadius(dp(7));
    if (isDuelBattle()) cardBackground.setStroke(dp(1), 0xFF29414A);
    card.setBackground(cardBackground);

    loadingSpinner = new ProgressBar(this, null, android.R.attr.progressBarStyleSmall);
    loadingSpinner.setIndeterminate(true);
    loadingSpinner.getIndeterminateDrawable().setTint(isDuelBattle() ? 0xFF8BD3CC : TowersTheme.TEXT);
    LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(18), dp(18));
    spinnerParams.rightMargin = dp(12);
    card.addView(loadingSpinner, spinnerParams);

    loading = new TextView(this);
    loading.setText("PREPARING THE BATTLEFIELD…");
    loading.setTextColor(isDuelBattle() ? 0xFFF0F3ED : TowersTheme.TEXT);
    loading.setTextSize(12);
    loading.setGravity(Gravity.CENTER_VERTICAL);
    loading.setLetterSpacing(0.04f);
    loading.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    LinearLayout.LayoutParams statusParams =
        new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    card.addView(loading, statusParams);

    FrameLayout.LayoutParams cardParams =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
    cardParams.setMargins(dp(20), dp(12), dp(20), dp(16));
    loadingOverlay.addView(card, cardParams);
    root.addView(
        loadingOverlay,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    loadingOverlay.bringToFront();
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private void updateLoadingStatus(String detail) {
    if (loading != null) loading.setText(detail);
  }

  private void hideLoadingPanel() {
    if (loadingOverlay != null) {
      root.removeView(loadingOverlay);
      loadingOverlay = null;
    }
    loading = null;
    loadingSpinner = null;
  }

  private void configureIsolationAllowlist() {
    PackageInfo provider = WebView.getCurrentWebViewPackage();
    if (provider != null) {
      webViewVersion = provider.versionName;
    }
    boolean profilesAvailable = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
    isolationAllowlistAvailable =
        WebViewFeature.isFeatureSupported(WebViewFeature.CROSS_ORIGIN_ISOLATED_ALLOWLIST);
    Log.i(
        TAG,
        "WebView "
            + webViewVersion
            + ", profile="
            + profilesAvailable
            + ", cross-origin allowlist="
            + isolationAllowlistAvailable);
    try {
      if (profilesAvailable && isolationAllowlistAvailable) {
        WebViewCompat.getProfile(webView)
            .setCrossOriginIsolatedAllowlist(Collections.singleton(ORIGIN));
      }
    } catch (RuntimeException error) {
      Log.w(TAG, "Cross-origin isolation profile unavailable", error);
    }
  }

  private void verifyEnginePrerequisites() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "JSON.stringify({crossOriginIsolated:Boolean(window.crossOriginIsolated),"
            + "sharedArrayBuffer:typeof SharedArrayBuffer==='function',"
            + "innerWidth:window.innerWidth,innerHeight:window.innerHeight})",
        result -> Log.i(TAG, "Warzone WebView capabilities: " + result));
    webView.evaluateJavascript(
        "typeof SharedArrayBuffer==='function'",
        result -> {
          if ("true".equals(result)) {
            installTouchControls();
            installAutoLauncher();
            return;
          }
          String detail =
              "Android System WebView "
                  + webViewVersion
                  + " does not expose SharedArrayBuffer. "
                  + "Cross-origin allowlist support: "
                  + isolationAllowlistAvailable
                  + ".";
          showEngineFailure(detail);
        });
  }

  private void showEngineFailure(String detail) {
    Log.e(TAG, "Warzone engine unavailable: " + detail);
    if (loading == null) return;
    if (loadingSpinner != null) loadingSpinner.setVisibility(View.GONE);
    loading.setTextColor(isDuelBattle() ? 0xFFFF8B7B : TowersTheme.TEXT);
    loading.setText(
        "WARZONE ENGINE CANNOT START\n\n"
            + detail);
  }

  private void installAutoLauncher() {
    if (isCampaignBattle()) webView.evaluateJavascript(
        "window.addEventListener('error',()=>{if(!window.LaunchedModule?.calledRun)"
            + "BlockNightAndroid.engineFailed('Campaign could not start. Tap to return Home.');},{once:true});true", null);
    // A narrow official log category exposes authoritative game/frontend
    // transitions. It lets the HTML shell cover the frontend before it paints.
    webView.evaluateJavascript(
        "(() => {if(window.__towersLifecycleLogging)return;window.__towersLifecycleLogging=true;"
            + "const original=constructWZModuleConfig;constructWZModuleConfig=(args)=>{"
            + "const m=original(args);if(!m.arguments.includes('--debug=main'))m.arguments.push('--debug=main');"
            + "if(window.WarzoneNotices)m.preRun.push(window.WarzoneNotices.prepare);return m;};})()",
        null);
    // Explicit ADB diagnostic mode gets an isolated save directory and
    // verbose engine logs. Normal launches retain the player's data.
    if (getIntent().getBooleanExtra("engine_debug", false)) {
      webView.evaluateJavascript(
          "(() => {const original=constructWZModuleConfig;"
              + "constructWZModuleConfig=(args)=>{WZ_CONFIG_DIR_SUFFIX='"
              + (isCampaignBattle() ? "-campaign-emulator-v51" : isSkirmishBattle() ? "-ffa-emulator-v60" : isDuelBattle() ? "-duel-emulator-v22" : "-emulator-v22") + "';"
              + "const m=original(args);m.arguments.push('--debug=all');return m;};})()",
          null);
    }
    String js =
        "(() => {"
            + "if(window.__blockNightAutoLaunch)return;window.__blockNightAutoLaunch=true;"
            + "if(typeof SharedArrayBuffer!=='function'){"
            + "BlockNightAndroid.engineFailed('SharedArrayBuffer is unavailable');return;}"
            + "const music=document.getElementById('launchOption_loadMusic');"
            + "if(music)music.checked=false;"
            + "const terrain=document.getElementById('launchOption_loadClassicTerrain');"
            + "if(terrain)terrain.checked=false;"
            + "const deadline=Date.now()+90000;const timer=setInterval(()=>{"
            + "const b=document.getElementById('start-button');"
            + "if(b&&!b.disabled){clearInterval(timer);b.click();"
            + "const e=setInterval(()=>{if(window.LaunchedModule?.calledRun){"
            + "clearInterval(e);BlockNightAndroid.engineReady();}},400);"
            + "}else if(Date.now()>deadline){clearInterval(timer);"
            + "BlockNightAndroid.engineFailed('Launcher timeout');}},200);"
            + "})();";
    webView.evaluateJavascript(js, null);
  }

  private void installTouchControls() {
    String[] scripts = isChallengeBattle() ? new String[] {
      "warzone-html-session.js", "warzone/ui/research-art.js", "warzone-towers-notices.js", "warzone-terrain-picker.js",
      "warzone-command-pages.js", "warzone/rewards.js", "warzone/challenge-saved-games.js", "warzone/ui/mobile-patrol.js", "warzone-touch-controls.js",
      "warzone-mobile-research.js", "warzone-intelligence.js", "warzone-challenge-hud.js"
    } : isFfaBattle() ? new String[] {
      "warzone-html-session.js", "warzone/ui/research-art.js", "warzone-towers-notices.js", "warzone-terrain-picker.js",
      "warzone-command-pages.js", "warzone/saved-games.js", "warzone/ui/mobile-patrol.js", "warzone-touch-controls.js",
      "warzone-mobile-research.js", "warzone-intelligence.js", "warzone-ffa-hud.js"
    } : isCampaignBattle() ? new String[] {
      "warzone-html-session.js", "warzone/ui/research-art.js", "warzone-towers-notices.js", "warzone-terrain-picker.js",
      "warzone-command-pages.js", "warzone/saved-games.js", "warzone/ui/mobile-patrol.js", "warzone-touch-controls.js",
      "warzone-mobile-research.js", "warzone-intelligence.js", "warzone-campaign-hud.js"
    } : new String[] {
      "warzone-html-session.js",
      "warzone/ui/research-art.js",
      "warzone-towers-notices.js",
      "warzone-terrain-picker.js",
      "warzone-command-pages.js",
      "warzone/rewards.js",
      "warzone/saved-games.js",
      "warzone/ui/mobile-patrol.js", "warzone-touch-controls.js",
      "warzone-mobile-research.js",
      isDuelBattle() ? "warzone-duel-ui.js" : "warzone-towers-wave-hud.js",
      "warzone/briefing.js",
      "warzone-intelligence.js"
    };
    try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      for (String script : scripts) {
        try (InputStream input = getAssets().open(script)) {
          int read;
          while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
          }
          output.write('\n');
        }
      }
      webView.evaluateJavascript(
          (isSkirmishBattle() ? "window.__warzoneFfaMode=true;\n"
              : isCampaignBattle() ? "window.__warzoneCampaignMode=true;\n"
              : isDuelBattle()
              ? "window.__warzoneDuelConfig=window.__warzoneDuelConfig||Object.freeze({mode:'duel',humanBranch:'"
                  + battleLaunch.duelWeapon + "',botBranch:'" + battleLaunch.botWeapon() + "'});\n"
              : "")
              + "window.__towersHtmlSession="
              + JSONObject.quote(battleSession)
              + ";\n"
              + new String(output.toByteArray(), StandardCharsets.UTF_8),
          null);
    } catch (IOException error) {
      Log.e(TAG, "Touch controls unavailable", error);
    }
  }

  public final class EngineBridge {
    @JavascriptInterface
    public void playGamesFrame(String session, String packet) {
      if (session == null || !session.equals(battleSession) || battleLaunch == null || loadingSave != null
          || packet == null || packet.length() > 262144) return;
      try {
        JSONObject data = new JSONObject(packet);
        String mode = battleLaunch.isFfa() ? "ffa" : battleLaunch.isChallenge() ? "challenge"
            : battleLaunch.isSurvival() ? "survival" : "tower-defense";
        if (!mode.equals(data.optString("mode")) || !data.has("gameTime")) return;
        long elapsed = data.getLong("gameTime");
        if (elapsed >= 0 && elapsed <= 604800000L) playGamesElapsedMs = Math.max(playGamesElapsedMs, elapsed);
      } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void playGamesEvent(String session, String packet) {
      if (session == null || !session.equals(battleSession) || !isCampaignBattle() || loadingSave != null
          || packet == null || packet.length() > 8192 || playGames == null) return;
      try {
        JSONObject event = new JSONObject(packet);
        String kind = event.optString("kind"), mission = event.optString("map");
        if (!"campaign".equals(event.optString("mode")) || !playGamesRunId.equals(event.optString("runId"))
            || !event.optBoolean("nativeCompleted") || !event.optBoolean("won")
            || !("mission_completed".equals(kind) || "campaign_completed".equals(kind))
            || !mission.matches("(?:CAM|SUB)_[A-Z0-9_-]{1,60}")) return;
        event.put("players", 1).put("botType", "scripted").put("strategy", "native");
        playGames.recordEvent(event);
      } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public String mapsLaunchPayload(String session) {
      try {
        BattleLaunchSpec launch = battleLaunch;
        if (launch == null || !launch.isFfa() || !FfaMapCatalog.isDownloaded(launch.mapId)
            || session == null || !session.equals(battleSession) || graphicsSetup != null || mainMenuReturnPending)
          return "{}";
        JSONObject payload = mapsStore.installBundle(launch.mapId);
        MapsBotCatalog.Bot bot = MapsBotCatalog.get(launch.ffaBotType);
        if (bot.needsAssetBundle()) {
          try (InputStream input = getAssets().open("warzone/maps-bots/files.json");
               ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] block = new byte[8192]; int count;
            while ((count = input.read(block)) != -1) {
              if (output.size() + count > 4 * 1024 * 1024) throw new IOException("Bundled map bots are too large.");
              output.write(block, 0, count);
            }
            payload.put("botFiles", new JSONArray(output.toString(StandardCharsets.UTF_8.name())));
          }
        }
        return payload.put("session", session).put("difficulty", launch.ffaDifficulty)
            .put("gameType", MapsTeamSetup.gameType(launch.mapTeams))
            .put("teams", MapsTeamSetup.toJson(launch.mapTeams, FfaMapCatalog.playerCount(launch.mapId)))
            .put("bot", new JSONObject().put("id", bot.id).put("name", bot.name).put("script", bot.script)).toString();
      } catch (Exception error) {
        Log.w(TAG, "Installed map could not be prepared", error);
        return "{}";
      }
    }
    @JavascriptInterface
    public String appVersion() { return GraphicsSetupView.appVersion(MainActivity.this); }

    @JavascriptInterface
    public String rewardConfig(String session) {
      if (session == null || session.isEmpty() || !session.equals(rewardSession) || rewards == null) return "{}";
      return rewards.config(rewardRunId);
    }

    @JavascriptInterface
    public boolean rewardApplied(String session) {
      if (session == null || !session.equals(rewardSession) || rewards == null) return false;
      try { rewards.applied(rewardRunId); return true; }
      catch (RuntimeException error) { rewardFailed(session, error.getMessage()); return false; }
    }

    @JavascriptInterface
    public void rewardFailed(String session, String detail) {
      runOnUiThread(() -> {
        if (session == null || !session.equals(rewardSession)) return;
        rewardSetupFailed = true;
        showEngineFailure(detail);
        if (loading != null) {
          loading.append("\n\nTAP TO RETURN HOME");
          loading.setOnClickListener(v -> returnToMainMenu());
        }
      });
    }

    @JavascriptInterface
    public int rewardProgress(String session, String packet) {
      if (session == null || !session.equals(rewardSession) || rewards == null || battleLaunch == null
          || packet == null || packet.length() > 262144) return 0;
      try {
        int credited = rewards.progress(rewardRunId, packet, isChallengeBattle() ? 0 : currentTowersLevel().rounds);
        JSONObject data = new JSONObject(packet);
        if (credited > 0) recordPlayGamesWave(session);
        if (("victory".equals(data.optString("phase")) || "defeated".equals(data.optString("phase")))
            && completeRewardQuote(session, data.optJSONObject("rewards"))) rewardTerminalFreshSession = session;
        runOnUiThread(() -> {
          if (session.equals(rewardSession) && rewardsView != null && graphicsSetup == null)
            rewardsView.refresh(rewards.balance(), rewards.inventory(), rewards.active(rewardRunId));
        });
        return credited;
      } catch (RuntimeException | org.json.JSONException error) {
        Log.w(TAG, "Reward progress could not save", error); return 0;
      }
    }

    @JavascriptInterface
    public boolean rewardInventorySnapshot(String session, String packet) {
      if (session == null || !session.equals(rewardSession) || packet == null || packet.length() > 262144) return false;
      try {
        JSONObject quote = new JSONObject(packet);
        if (!completeRewardQuote(session, quote)) return false;
        JSONObject progress = new JSONObject().put("wave", 0)
            .put("completedWaves", quote.optJSONArray("completedWaves")) .put("rewards", quote);
        int credited = rewards.progress(rewardRunId, progress.toString(), isChallengeBattle() ? 0 : currentTowersLevel().rounds);
        rewardInventoryFreshSession = session;
        if (credited > 0) recordPlayGamesWave(session);
        if (credited > 0) runOnUiThread(() -> {
          if (session.equals(rewardSession))
            webView.evaluateJavascript("window.WarzoneRewards?.waveCredited(" + credited + ")", null);
        });
        return true;
      } catch (Exception error) { Log.w(TAG, "Reward inventory could not save", error); return false; }
    }

    @JavascriptInterface
    public void showRewards(String session) {
      runOnUiThread(() -> {
        if (session != null && session.equals(rewardSession) && session.equals(battleSession))
          MainActivity.this.showRewards(true);
      });
    }

    @JavascriptInterface
    public void toggleHeaderRewards(String session, int headerBottomCss, int viewportWidthCss) {
      runOnUiThread(() -> {
        if (session == null || !session.equals(rewardSession) || !session.equals(battleSession)
            || graphicsSetup != null) return;
        if (rewardsView != null) { closeRewards(); return; }
        if (headerBottomCss < 0 || viewportWidthCss < 1 || viewportWidthCss > 16384) return;
        rewardsHeaderBottomCss = headerBottomCss;
        rewardsViewportWidthCss = viewportWidthCss;
        MainActivity.this.showRewards(true);
      });
    }

    @JavascriptInterface
    public void closeHeaderRewards(String session) {
      runOnUiThread(() -> {
        if (session != null && session.equals(rewardSession) && session.equals(battleSession)
            && graphicsSetup == null) closeRewards();
      });
    }

    @JavascriptInterface
    public boolean rewardPurchaseResult(String session, String transactionId, String packet) {
      if (session == null || !session.equals(rewardSession) || packet == null || packet.length() > 262144) return false;
      boolean applied = false;
      String message = "Purchase pending. Reopen Rewards and retry the same item to check it without another charge.";
      try {
        applied = rewards.completeLive(rewardRunId, transactionId, packet);
        JSONObject quote = new JSONObject(packet);
        if (quote.optBoolean("rejected") && !quote.optBoolean("transactionApplied") && !quote.optBoolean("transactionPending"))
          message = "The game rejected this purchase. Your crystals were returned.";
      } catch (Exception error) { message = error.getMessage(); }
      final boolean completed = applied;
      final String detail = message;
      runOnUiThread(() -> {
        if (!session.equals(rewardSession) || rewardsView == null) return;
        if (livePurchaseView != rewardsView || !transactionId.equals(livePurchaseTransaction)
            || !session.equals(livePurchaseDocument)) {
          rewardsView.refresh(rewards.balance(), rewards.inventory(), rewards.active(rewardRunId));
          return;
        }
        if (completed) rewardsView.completeMutation(rewards.balance(), rewards.inventory(), rewards.active(rewardRunId));
        else rewardsView.showError(detail);
      });
      return applied;
    }

    @JavascriptInterface
    public String savedGamePayload(String session) {
      JSONObject payload = loadingSave;
      return session != null && session.equals(isFfaBattle() ? battleSession : rewardSession) && payload != null ? payload.toString() : "{}";
    }

    @JavascriptInterface
    public String ffaSave(String session, String metadataJSON, String filesJSON) {
      try {
        if (!isFfaBattle() || isCrystalSkirmish() || session == null || !session.equals(battleSession)
            || graphicsSetup != null || mainMenuReturnPending || !battleOutcome.isEmpty()
            || metadataJSON == null || metadataJSON.length() > 65536
            || filesJSON == null || filesJSON.length() > 48 * 1024 * 1024)
          throw new IOException("This FFA save is no longer active.");
        JSONObject metadata = new JSONObject(metadataJSON);
        FfaMapCatalog.MapInfo map = FfaMapCatalog.get(MainActivity.this).map(battleLaunch.mapId);
        if (!"ffa".equals(metadata.optString("mode")) || !battleLaunch.mapId.equals(metadata.optString("mapId"))
            || !battleLaunch.ffaDifficulty.equals(metadata.optString("difficulty"))
            || !metadata.has("botType") || !battleLaunch.ffaBotType.equals(metadata.optString("botType"))
            || map == null || !map.level.equals(metadata.optString("nativeLevel"))
            || metadata.optInt("players", "emag".equals(map.id) ? 4 : -1) != map.players
            || metadata.optInt("bots", "emag".equals(map.id) ? 3 : -1) != map.bots
            || !MapsTeamSetup.matches(metadata, battleLaunch.mapTeams, map.players))
          throw new IOException("The saved FFA match did not match.");
        metadata.put("mapName", map.name).put("players", map.players).put("bots", map.bots).put("progressRunId", playGamesRunId);
        String id = ffaSaves.save(metadata, new JSONObject(filesJSON));
        return new JSONObject().put("ok", true).put("id", id).toString();
      } catch (Exception error) {
        try { return new JSONObject().put("ok", false).put("error", String.valueOf(error.getMessage())).toString(); }
        catch (Exception ignored) { return "{\"ok\":false}"; }
      }
    }

    @JavascriptInterface
    public boolean ffaRestored(String session, String id, String stateJSON) {
      try {
        JSONObject payload = loadingSave;
        if (!isFfaBattle() || session == null || !session.equals(battleSession)
            || !id.equals(loadingSaveId) || payload == null) return false;
        JSONObject metadata = payload.getJSONObject("metadata"), state = new JSONObject(stateJSON);
        if (!state.optBoolean("ok") || !metadata.getString("session").equals(state.optString("session"))
            || !battleLaunch.mapId.equals(state.optString("mapId"))
            || !battleLaunch.mapId.equals(metadata.optString("mapId"))
            || state.optInt("players", "emag".equals(battleLaunch.mapId) ? 4 : -1) != FfaMapCatalog.playerCount(battleLaunch.mapId)
            || state.optInt("bots", "emag".equals(battleLaunch.mapId) ? 3 : -1) != FfaMapCatalog.playerCount(battleLaunch.mapId) - 1
            || !metadata.getString("difficulty").equals(state.optString("difficulty"))
            || !battleLaunch.ffaBotType.equals(BattleLaunchSpec.ffaBotType(metadata.optString("botType")))
            || !state.has("botType") || !battleLaunch.ffaBotType.equals(state.optString("botType"))
            || !MapsTeamSetup.matches(metadata, battleLaunch.mapTeams, FfaMapCatalog.playerCount(battleLaunch.mapId))
            || !MapsTeamSetup.matches(state, battleLaunch.mapTeams, FfaMapCatalog.playerCount(battleLaunch.mapId))
            || !metadata.getString("nativeLevel").equals(state.optString("nativeLevel"))
            || state.optLong("gameTime", -1) < metadata.getLong("gameTime")) return false;
        loadingSave = null;
        return true;
      } catch (Exception error) { Log.w(TAG, "FFA restoration could not verify", error); return false; }
    }

    @JavascriptInterface
    public String challengeSavePayload(String session) {
      JSONObject payload=loadingSave;
      return isChallengeBattle() && session!=null && session.equals(battleSession) && payload!=null ? payload.toString() : "{}";
    }
    @JavascriptInterface
    public String challengeSave(String session,String metadataJSON,String filesJSON) {
      boolean pinned=false;final String run=rewardRunId;
      try {
        if(!isChallengeBattle()||session==null||!session.equals(battleSession)||!session.equals(rewardSession)||graphicsSetup!=null||mainMenuReturnPending||!battleOutcome.isEmpty()
            ||metadataJSON==null||metadataJSON.length()>65536||filesJSON==null||filesJSON.length()>48*1024*1024)throw new IOException("This Challenge save is no longer active.");
        JSONObject meta=new JSONObject(metadataJSON);ChallengeMapCatalog.MapInfo map=ChallengeMapCatalog.get(MainActivity.this).map(battleLaunch.mapId);
        if(!"challenge".equals(meta.optString("mode"))||!"challenge".equals(meta.optString("profile"))||!battleLaunch.mapId.equals(meta.optString("mapId"))||!map.level.equals(meta.optString("nativeLevel"))
            ||!battleLaunch.ffaDifficulty.equals(meta.optString("difficulty"))||!battleLaunch.duelWeapon.equals(meta.optString("weapon"))||!"dumbot25a".equals(meta.optString("botType"))||!run.equals(meta.optString("rewardRunId"))||!meta.optBoolean("vtol")||meta.optInt("players",-1)!=2||meta.optInt("bots",-1)!=1)throw new IOException("The saved Challenge identity does not match.");
        meta.put("mapName",map.name).put("progressRunId",playGamesRunId);rewards.pinRun(run);pinned=true;
        String id=challengeSaves.save(meta,new JSONObject(filesJSON));return new JSONObject().put("ok",true).put("id",id).toString();
      } catch(Exception error) {
        if(pinned&&!saveGames.hasRun(run)&&!survivalSaves.hasRun(run)&&!challengeSaves.hasRun(run))try{rewards.unpinRun(run);}catch(RuntimeException ignored){}
        try{return new JSONObject().put("ok",false).put("error",String.valueOf(error.getMessage())).toString();}catch(Exception ignored){return "{\"ok\":false}";}
      }
    }
    @JavascriptInterface
    public boolean challengeRestored(String session,String id,String stateJSON) {
      try {
        JSONObject payload=loadingSave;if(!isChallengeBattle()||session==null||!session.equals(battleSession)||!id.equals(loadingSaveId)||payload==null)return false;
        JSONObject meta=payload.getJSONObject("metadata"),state=new JSONObject(stateJSON);
        if(!state.optBoolean("ok")||!"challenge".equals(state.optString("mode"))||!"challenge".equals(state.optString("profile"))||!meta.getString("session").equals(state.optString("session"))||!rewardRunId.equals(state.optString("rewardRunId"))
            ||!battleLaunch.mapId.equals(state.optString("mapId"))||!battleLaunch.ffaDifficulty.equals(state.optString("difficulty"))||!battleLaunch.duelWeapon.equals(state.optString("weapon"))||!state.optBoolean("vtol")||!"dumbot25a".equals(state.optString("botType"))
            ||state.optInt("players",-1)!=2||state.optInt("bots",-1)!=1||!meta.getString("nativeLevel").equals(state.optString("nativeLevel"))||state.optLong("gameTime",-1)<meta.getLong("gameTime")||!completeRewardQuote(session,state.optJSONObject("rewards")))return false;
        if(!rewards.confirmResumeInventory(rewardRunId,state.getJSONObject("rewards").toString()))return false;
        loadingSave=null;return true;
      } catch(Exception error){Log.w(TAG,"Challenge restoration could not verify",error);return false;}
    }

    @JavascriptInterface
    public String campaignSavePayload(String session) {
      JSONObject payload = loadingSave;
      return isCampaignBattle() && session != null && session.equals(battleSession) && payload != null
          ? payload.toString() : "{}";
    }

    @JavascriptInterface
    public String storeCampaignSave(String session, String metadataJSON, String filesJSON) {
      try {
        if (!isCampaignBattle() || session == null || !session.equals(battleSession)
            || graphicsSetup != null || mainMenuReturnPending || metadataJSON == null || metadataJSON.length() > 65536
            || filesJSON == null || filesJSON.length() > 48 * 1024 * 1024)
          throw new IOException("This campaign save is no longer active.");
        JSONObject metadata = new JSONObject(metadataJSON);
        if (!"campaign".equals(metadata.optString("mode"))) throw new IOException("Invalid campaign save.");
        String level = metadata.getString("nativeLevel");
        if (!level.matches("[A-Za-z0-9_-]{1,19}")) throw new IOException("Invalid campaign mission.");
        metadata.put("mapName", BattleLaunchSpec.campaignChapter(level)).put("mapId", level).put("difficulty", "").put("progressRunId", playGamesRunId);
        String id = campaignSaves.save(metadata, new JSONObject(filesJSON));
        return new JSONObject().put("ok", true).put("id", id).toString();
      } catch (Exception error) {
        try { return new JSONObject().put("ok", false).put("error", String.valueOf(error.getMessage())).toString(); }
        catch (Exception ignored) { return "{\"ok\":false}"; }
      }
    }

    @JavascriptInterface
    public boolean campaignSaveRestored(String session, String id, String stateJSON) {
      try {
        JSONObject payload = loadingSave;
        if (!isCampaignBattle() || session == null || !session.equals(battleSession)
            || !id.equals(loadingSaveId) || payload == null) return false;
        JSONObject metadata = payload.getJSONObject("metadata"), state = new JSONObject(stateJSON);
        if (!state.optBoolean("ok") || !metadata.getString("nativeLevel").equals(state.optString("nativeLevel"))
            || state.optLong("gameTime", -1) < metadata.getLong("gameTime")) return false;
        loadingSave = null;
        return true;
      } catch (Exception error) { Log.w(TAG, "Campaign restoration could not verify", error); return false; }
    }

    @JavascriptInterface
    public String rewardResumeCaps(String session) {
      if (session == null || !session.equals(rewardSession)) return "{}";
      try { return rewards.resumeCaps(rewardRunId).toString(); }
      catch (RuntimeException error) { return "{}"; }
    }

    @JavascriptInterface
    public String storeSavedGame(String session, String metadataJSON, String filesJSON) {
      boolean pinned = false;
      final String run = rewardRunId;
      try {
        if (session == null || !session.equals(rewardSession) || metadataJSON == null || metadataJSON.length() > 65536
            || filesJSON == null || filesJSON.length() > 48 * 1024 * 1024) throw new IOException("This save is no longer active.");
        JSONObject metadata = new JSONObject(metadataJSON);
        if (!run.equals(metadata.getString("session")) || battleLaunch == null
            || !battleLaunch.mapId.equals(metadata.getString("mapId"))) throw new IOException("The saved match identity did not match.");
        MapLevelCatalog.Level level = currentTowersLevel();
        if (isSurvivalBattle() && (!"survival".equals(metadata.optString("mode"))
            || !"survival".equals(metadata.optString("profile")) || !level.mapName.equals(metadata.optString("nativeLevel"))))
          throw new IOException("The saved Survival identity did not match this battle.");
        metadata.put("mapName", level.name).put("difficulty", level.difficulty).put("totalWaves", level.rounds).put("progressRunId", playGamesRunId);
        rewards.pinRun(run);
        pinned = true;
        String id = currentTowersSaves().save(metadata, new JSONObject(filesJSON));
        return new JSONObject().put("ok", true).put("id", id).toString();
      } catch (Exception error) {
        if (pinned && !saveGames.hasRun(run) && !survivalSaves.hasRun(run) && !challengeSaves.hasRun(run)) {
          try { rewards.unpinRun(run); } catch (RuntimeException ignored) { }
        }
        try { return new JSONObject().put("ok", false).put("error", String.valueOf(error.getMessage())).toString(); }
        catch (Exception ignored) { return "{\"ok\":false}"; }
      }
    }

    @JavascriptInterface
    public boolean savedGameRestored(String session, String id, String stateJSON) {
      try {
        JSONObject payload = loadingSave;
        if (session == null || !session.equals(rewardSession) || !id.equals(loadingSaveId) || payload == null) return false;
        JSONObject metadata = payload.getJSONObject("metadata"), state = new JSONObject(stateJSON);
        if (!state.optBoolean("ok") || !rewardRunId.equals(state.optString("session"))
            || isSurvivalBattle() && (!"survival".equals(metadata.optString("profile"))
                || !"survival".equals(state.optString("profile")))
            || !battleLaunch.mapId.equals(state.optString("mapId"))
            || !metadata.getString("nativeLevel").equals(state.optString("nativeLevel"))
            || state.optLong("gameTime", -1) < metadata.getLong("gameTime")
            || !completeRewardQuote(session, state.optJSONObject("rewards"))) return false;
        if (!rewards.confirmResumeInventory(rewardRunId, state.getJSONObject("rewards").toString())) return false;
        loadingSave = null;
        return true;
      } catch (Exception error) { Log.w(TAG, "Saved game restoration could not verify", error); return false; }
    }

    @JavascriptInterface
    public String loadDesigns() {
      return blueprints.load();
    }

    @JavascriptInterface
    public boolean importLegacyDesigns(String data) { return blueprints.importLegacy(data); }

    @JavascriptInterface
    public boolean importNativeTemplates(String data) { return blueprints.importNativeTemplates(data); }

    @JavascriptInterface
    public String writeDesign(String data) { return blueprints.write(data); }

    @JavascriptInterface
    public String deleteDesign(String id) { return blueprints.delete(id); }

    @JavascriptInterface
    public String musicSelection() {
      return musicCatalog.selectionJson(selectedMusicTracks());
    }

    @JavascriptInterface
    public String musicState() {
      return mapMusicState();
    }

    @JavascriptInterface
    public String setMusicEnabled(boolean on, String session) {
      // A delayed event from an outgoing iframe must not alter a new battle.
      synchronized (musicPreferenceLock) {
        if (session != null && session.equals(musicSession) && !session.isEmpty()) {
          getPreferences(MODE_PRIVATE).edit().putBoolean("music_enabled", on).apply();
          musicEnabled = on;
        }
      }
      return mapMusicState();
    }

    @JavascriptInterface
    public void musicFailed(String detail) {
      runOnUiThread(() -> {
        showEngineFailure("Music could not load. " + detail);
        if (loading != null) {
          loading.append("\n\nTAP HERE TO CONTINUE WITHOUT MUSIC");
          loading.setOnClickListener(v -> {
            getPreferences(MODE_PRIVATE).edit().putBoolean("music_enabled", false).apply();
            recreate();
          });
        }
      });
    }

    @JavascriptInterface
    public void showNotice(String message) {
      runOnUiThread(() -> showAppNotice(message, false));
    }

    @JavascriptInterface
    public void engineReady() {
      runOnUiThread(() -> {
        if (getIntent().getBooleanExtra("engine_debug", false)) hideLoadingPanel();
        updateLoadingStatus(isCampaignBattle() ? "OPENING THE CAMPAIGN…" : isDuelBattle() ? "PREPARING YOUR MATCH…" : "PREPARING YOUR DEFENCES…");
        webView.requestFocus();
        if (isCampaignBattle()) { startupAutomationStarted = true; awaitCampaignCanvas(0, battleSession); }
        else if (restoringGame) { startupAutomationStarted = true; awaitBattlefieldReady(0); }
        else if (isChallengeBattle() || isCrystalSkirmish()
            || (isFfaBattle() && FfaMapCatalog.isDownloaded(battleLaunch.mapId))) beginChallengeStartup();
        else beginStartupAutomation();
        if (touchTestMode) {
          webView.postDelayed(MainActivity.this::selectAllUnitsForTouchTest, 30000);
          webView.postDelayed(MainActivity.this::issueTouchTestOrder, 32000);
          webView.postDelayed(MainActivity.this::dumpTouchReport, 35000);
        }
        if (touchSuiteMode) {
          webView.postDelayed(MainActivity.this::runTouchSuite, 30000);
          webView.postDelayed(MainActivity.this::dumpTouchReport, 33000);
        }
        if (researchSuiteMode) {
          webView.postDelayed(MainActivity.this::runResearchSuite, 30000);
          webView.postDelayed(MainActivity.this::dumpResearchReport, 34000);
        }
        webView.postDelayed(MainActivity.this::dumpEngineErrors, 2000);
        webView.postDelayed(MainActivity.this::dumpEngineErrors, 18000);
      });
    }

    @JavascriptInterface
    public void startupBriefingReady(String session, boolean ready) {
      runOnUiThread(() -> {
        if (session == null || !session.equals(battleSession) || !session.equals(startupBriefingSession)
            || graphicsSetup != null || loadingOverlay == null || isFinishing() || isDestroyed()) return;
        if (!ready) { briefingFailed(); return; }
        if (battleBriefing != null) return;
        BattleBriefingView view = new BattleBriefingView(MainActivity.this, false);
        battleBriefing = view;
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));
        view.showFor(500, () -> {
          if (battleBriefing != view || !session.equals(battleSession)) return;
          webView.evaluateJavascript("Promise.resolve(window.WarzoneBriefing.release(" + JSONObject.quote(session)
              + ")).then(ok=>BlockNightAndroid.startupBriefingReleased(" + JSONObject.quote(session)
              + ",ok===true)).catch(()=>BlockNightAndroid.startupBriefingReleased(" + JSONObject.quote(session)
              + ",false));true", null);
        });
      });
    }

    @JavascriptInterface
    public void startupBriefingReleased(String session, boolean ready) {
      runOnUiThread(() -> {
        if (session == null || !session.equals(battleSession) || !session.equals(startupBriefingSession)
            || graphicsSetup != null || battleBriefing == null || isFinishing() || isDestroyed()) return;
        if (!ready) { briefingFailed(); return; }
        hideLoadingPanel();
        webView.requestFocus();
        fadeBriefing(battleBriefing);
      });
    }

    @JavascriptInterface
    public void engineFailed(String detail) {
      runOnUiThread(() -> {
        showEngineFailure(detail);
        if (loading != null) loading.setOnClickListener(v -> returnToMainMenu());
        showAppNotice("Warzone engine failed: " + detail, true);
      });
    }

    @JavascriptInterface
    public void battleFinished(String session) {
      runOnUiThread(() -> {
        if (battleSession.equals(session)) finishTowersRewards(false);
      });
    }

    @JavascriptInterface
    public void battleWon(String session) {
      runOnUiThread(() -> {
        if (battleSession.equals(session)) finishTowersRewards(true);
      });
    }

    @JavascriptInterface
    public void confirmReturnToMainMenu(String session) {
      runOnUiThread(() -> showMainMenuDialog(session));
    }

    @JavascriptInterface
    public void battleExited(String session) {
      runOnUiThread(() -> {
        if (!battleSession.equals(session)) return;
        if (mainMenuReturnPending) returnToMainMenu();
        else showBattleExitPanel();
      });
    }
  }

  private void dismissMainMenuDialog() {
    if (mainMenuDialog != null) {
      mainMenuDialog.dismiss();
      mainMenuDialog = null;
    }
  }

  private void cancelMainMenuReturn(String session) {
    if (webView == null || !battleSession.equals(session) || mainMenuReturnPending) return;
    webView.evaluateJavascript(
        "window.__towersHtml?.cancelMainMenuReturn(" + JSONObject.quote(session) + ")", null);
  }

  private void showMainMenuDialog(String session) {
    if (root == null || webView == null || isFinishing() || isDestroyed()
        || !battleSession.equals(session) || battleSession.isEmpty()
        || !battleOutcome.isEmpty() || graphicsSetup != null || loadingOverlay != null
        || replayPanel != null || mainMenuReturnPending || mainMenuDialog != null) return;
    Typeface dialogFace = Typeface.createFromAsset(getAssets(), "warzone/ui/Oswald.ttf");
    TextView title = new TextView(this);
    title.setText("Return to main menu?");
    title.setTextColor(isDuelBattle() ? Color.WHITE : TowersTheme.TEXT);
    title.setTextSize(18);
    title.setTypeface(dialogFace);
    title.setPadding(dp(20), dp(18), dp(20), dp(14));
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Return to main menu?")
            .setCustomTitle(title)
            .setNegativeButton("Cancel", (ignored, which) -> cancelMainMenuReturn(session))
            .setPositiveButton("Return", (ignored, which) -> {
              if (webView == null || !battleSession.equals(session)) return;
              mainMenuReturnPending = true;
              rewardInventoryFreshSession = "";
              webView.evaluateJavascript(
                  "window.__towersHtml?.returnToMainMenu(" + JSONObject.quote(session) + ")",
                  result -> {
                    if (!"true".equals(result) && battleSession.equals(session)) {
                      mainMenuReturnPending = false;
                      cancelMainMenuReturn(session);
                    }
                  });
            })
            .create();
    mainMenuDialog = dialog;
    dialog.setCanceledOnTouchOutside(false);
    dialog.setOnCancelListener(ignored -> cancelMainMenuReturn(session));
    dialog.setOnDismissListener(ignored -> {
      if (mainMenuDialog == dialog) mainMenuDialog = null;
      if (webView != null && !isFinishing() && !isDestroyed()) {
        immersive();
        webView.requestFocus();
      }
    });
    dialog.show();
    // Presentation only: all navigation listeners above remain native.
    GradientDrawable surface = new GradientDrawable();
    surface.setColor(isDuelBattle() ? Color.BLACK : TowersTheme.PANEL);
    surface.setCornerRadius(dp(6));
    if (isDuelBattle()) surface.setStroke(dp(1), 0xFF252B2F);
    if (dialog.getWindow() != null) {
      dialog.getWindow().setBackgroundDrawable(surface);
      dialog.getWindow().setLayout(
          Math.min(dp(320), getResources().getDisplayMetrics().widthPixels - dp(32)),
          ViewGroup.LayoutParams.WRAP_CONTENT);
      WindowManager.LayoutParams attributes = dialog.getWindow().getAttributes();
      attributes.dimAmount = 0.42f;
      dialog.getWindow().setAttributes(attributes);
    }
    for (int which : new int[] {AlertDialog.BUTTON_NEGATIVE, AlertDialog.BUTTON_POSITIVE}) {
      Button button = dialog.getButton(which);
      boolean primary = which == AlertDialog.BUTTON_POSITIVE;
      if (isDuelBattle()) button.setTextColor(Color.WHITE);
      else button.setTextColor(TowersTheme.buttonText(primary));
      button.setTextSize(14);
      button.setTypeface(dialogFace);
      button.setAllCaps(false);
      button.setMinHeight(dp(48));
      button.setMinimumHeight(dp(48));
      button.setMinWidth(dp(88));
      button.setMinimumWidth(dp(88));
      button.setPadding(dp(16), 0, dp(16), 0);
      GradientDrawable buttonSurface = new GradientDrawable();
      buttonSurface.setColor(isDuelBattle() ? (primary ? 0xFF202426 : Color.TRANSPARENT)
          : primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL);
      buttonSurface.setCornerRadius(dp(4));
      button.setBackgroundTintList(null);
      button.setBackground(
          new RippleDrawable(ColorStateList.valueOf(isDuelBattle() ? 0x1AFFFFFF
              : primary ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE), isDuelBattle() ? buttonSurface
                  : TowersTheme.control(this, primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL, 4), null));
      ViewGroup.LayoutParams params = button.getLayoutParams();
      if (params instanceof ViewGroup.MarginLayoutParams) {
        ((ViewGroup.MarginLayoutParams) params).setMarginStart(dp(8));
        button.setLayoutParams(params);
      }
    }
  }

  private void returnToMainMenu() {
    final boolean returnToCrystalSkirmish = graphicsSetup == null && isCrystalSkirmish();
    final boolean returnToSurvival = graphicsSetup == null && isSurvivalBattle();
    final boolean returnToTowersMap = graphicsSetup == null && isTowersBattle() && !returnToSurvival;
    final boolean returnToFfa = graphicsSetup == null && isFfaBattle() && !returnToCrystalSkirmish;
    final boolean returnToMaps = returnToFfa && FfaMapCatalog.isDownloaded(battleLaunch.mapId);
    final boolean returnToChallenge = graphicsSetup == null && isChallengeBattle();
    cancelCampaignHomeCheck();
    dismissBriefing();
    startupBriefingSession = "";
    closeRewards();
    closeSavedGames();
    closeCampaignSetup();
    closeFfaSetup();
    closeMapsSetup();
    closeChallengeSetup();
    closeSurvivalSetup();
    dismissRewardReceipt();
    if (rewards != null && !rewardSession.isEmpty()) {
      try { rewards.abandon(rewardRunId, rewardSession.equals(rewardInventoryFreshSession)); }
      catch (RuntimeException error) { showAppNotice(error.getMessage(), true); }
    }
    rewardSession = "";
    rewardRunId = "";
    loadingSave = null;
    loadingSaveId = "";
    restoringGame = false;
    rewardTerminalFreshSession = "";
    rewardInventoryFreshSession = "";
    mapMusicLifecycle("dispose");
    dismissMainMenuDialog();
    mainMenuReturnPending = false;
    battleSession = "";
    startupAutomationStarted = false;
    battleOutcome = "";
    hideLoadingPanel();
    if (replayPanel != null) {
      root.removeView(replayPanel);
      replayPanel = null;
    }
    webView.stopLoading();
    webView.loadUrl("about:blank");
    if (graphicsSetup == null) showGraphicsSetup();
    if (returnToTowersMap || returnToCrystalSkirmish) graphicsSetup.showTowersMap();
    if (returnToSurvival) showSurvivalSetup();
    if (returnToMaps) showMapsSetup();
    else if (returnToFfa) showFfaSetup();
    if (returnToChallenge) showChallengeSetup();
  }

  private void finishChallenge(boolean won) {
    if (battleSession.isEmpty() || !battleOutcome.isEmpty() || !isChallengeBattle()) return;
    try {
      RewardLedger.Receipt receipt = rewards.finishChallenge(rewardRunId, won, battleLaunch.ffaDifficulty, battleSession.equals(rewardTerminalFreshSession));
      recordPlayGamesMatch(won);
      if (won && playGames != null)
        playGames.recordVictory("challenge", battleLaunch.mapId, battleLaunch.ffaDifficulty, "crystal-support-allowed");
      battleOutcome = won ? "victory" : "defeated";
      final String name = ChallengeMapCatalog.get(this).map(battleLaunch.mapId).name, difficulty = battleLaunch.ffaDifficulty;
      returnToMainMenu();
      rewardReceipt = new RewardReceiptView(this, won, name, difficulty, 0, 0, receipt.earned, receipt.balance, receipt.reason, dp(32), this::dismissRewardReceipt);
      root.addView(rewardReceipt, new FrameLayout.LayoutParams(-1,-1)); rewardReceipt.requestFocus();
    } catch (RuntimeException error) {
      // The native result has already retired the battlefield. Keep a storage
      // failure actionable without displaying a credit that was not saved.
      String detail = error.getMessage();
      returnToMainMenu();
      showAppNotice(detail, true);
    }
  }

  private void finishFfa(boolean won) {
    if (battleSession.isEmpty() || !battleOutcome.isEmpty()) return;
    if (isCrystalSkirmish()) { finishCrystalSkirmish(won); return; }
    recordPlayGamesMatch(won);
    if (won && playGames != null && battleLaunch != null)
      playGames.recordVictory("ffa", battleLaunch.mapId, battleLaunch.ffaDifficulty);
    battleOutcome = won ? "victory" : "defeated";
    returnToMainMenu();
    showAppNotice(won ? "Victory — you won the free for all." : "Defeat — your forces were eliminated.", false);
  }

  private void finishCrystalSkirmish(boolean won) {
    battleOutcome = won ? "victory" : "defeated";
    try {
      RewardLedger.Receipt receipt = rewards.finishCrystalSkirmish(battleSession, won);
      returnToMainMenu();
      if (receipt == null) return;
      rewardReceipt = new RewardReceiptView(this, won, "Crystal Skirmish · Centerpede", "T4",
          0, 0, receipt.earned, receipt.balance, receipt.reason, dp(32), () -> {
            dismissRewardReceipt();
            showRewards(false);
          }, true);
      root.addView(rewardReceipt, new FrameLayout.LayoutParams(-1, -1));
      rewardReceipt.requestFocus();
    } catch (RuntimeException error) {
      returnToMainMenu();
      showAppNotice(error.getMessage(), true);
    }
  }

  private void showBattleExitPanel() {
    if (!isDuelBattle()) { returnToMainMenu(); return; }
    if (root == null || isFinishing() || isDestroyed() || !battleOutcome.isEmpty()) return;
    dismissMainMenuDialog();
    battleOutcome = "exited";
    mapMusicLifecycle("dispose");
    hideLoadingPanel();
    TextView exit = new TextView(this);
    replayPanel = exit;
    exit.setText((isDuelBattle() ? "WARZONE 1v1" : "WARZONE TOWERS")
        + "\n\nBATTLE ENDED\n\nTap to return to the start screen");
    exit.setTextColor(isDuelBattle() ? 0xFFE2ECE8 : TowersTheme.TEXT);
    exit.setTextSize(22);
    exit.setGravity(Gravity.CENTER);
    exit.setBackgroundColor(isDuelBattle() ? 0xFF070F13 : TowersTheme.BACKGROUND);
    exit.setClickable(true);
    exit.setOnClickListener(view -> {
      root.removeView(view);
      replayPanel = null;
      battleSession = "";
      startupAutomationStarted = false;
      webView.loadUrl("about:blank");
      showGraphicsSetup();
    });
    root.addView(exit, new FrameLayout.LayoutParams(-1, -1));
  }

  private void showReplayPanel(boolean won) {
    if (root == null || isFinishing() || isDestroyed()) return;
    if ("exited".equals(battleOutcome)) return;
    if ("victory".equals(battleOutcome) && !won) return;
    dismissMainMenuDialog();
    battleOutcome = won ? "victory" : "defeated";
    mapMusicLifecycle("dispose");
    if (replayPanel != null) {
      if (won && !replayWon) {
        replayWon = true;
        replayPanel.setText(replayText(true));
      }
      return;
    }
    replayWon = won;
    TextView replay = new TextView(this);
    replayPanel = replay;
    replay.setText(replayText(won));
    replay.setTextColor(isDuelBattle() ? 0xFFF0B43C : TowersTheme.TEXT);
    replay.setTextSize(22);
    replay.setGravity(Gravity.CENTER);
    replay.setBackgroundColor(isDuelBattle() ? 0xF7030705 : TowersTheme.BACKGROUND);
    replay.setClickable(true);
    replay.setOnClickListener(view -> {
      root.removeView(view);
      startupAutomationStarted = false;
      createLoadingPanel();
      webView.loadUrl(gameUrl() + "&replay=" + System.currentTimeMillis());
    });
    root.addView(
        replay,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
  }

  private String replayText(boolean won) {
    if (isDuelBattle()) return won
        ? "WARZONE 1v1\n\nVICTORY\n\nEnemy command centre destroyed\n\nTap to play again"
        : "WARZONE 1v1\n\nDEFEAT\n\nYour command centre was destroyed\n\nTap to try again";
    return won
        ? "WARZONE TOWERS\n\nVICTORY\n\nAll "
            + currentTowersLevel().rounds
            + " rounds cleared\n\nTap to play again"
        : "WARZONE TOWERS\n\nYOU HAVE FAILED\n\nCommand centre destroyed\n\nTap to try again";
  }

  private void dumpEngineErrors() {
    if (webView == null) return;
    webView.evaluateJavascript(
        "JSON.stringify(Array.isArray(window.errorLog)?window.errorLog.slice(-40):[])",
        result -> Log.i(TAG, "Engine error buffer: " + result));
  }

  /**
   * Pace the native lobby interactions from completion callbacks. The engine can block Android's UI
   * thread while changing screens; independently posted delays then collapse into a burst and miss
   * the Limits/Ready controls on high-resolution devices.
   */
  private void beginStartupAutomation() {
    if (isCampaignBattle()) { startupAutomationStarted = true; awaitCampaignCanvas(0, battleSession); return; }
    if (startupAutomationStarted || webView == null || isFinishing()) return;
    startupAutomationStarted = true;
    final String startupSession = battleSession;
    updateLoadingStatus("OPENING THE BATTLEFIELD…");
    webView.postDelayed(
        () -> {
          if (!startupSession.equals(battleSession) || graphicsSetup != null) return;
          evaluateTouchTapThen(
                170,
                392,
                "Start Hosting",
                1500,
                () ->
                    evaluateTouchTapThen(
                        290,
                        327,
                        "Limits",
                        1800,
                        () -> {
                          updateLoadingStatus("PREPARING YOUR COMMAND CENTRE…");
                          decreaseVtolLimit(6);
                        }));
        },
        1200);
  }

  /** The native --skirmish descriptor opens its locked lobby; start it without changing its air limits. */
  private void beginChallengeStartup() {
    if (startupAutomationStarted || webView == null || isFinishing()) return;
    startupAutomationStarted = true;
    final String startupSession = battleSession;
    updateLoadingStatus(isCrystalSkirmish() ? "OPENING CRYSTAL SKIRMISH…" : "OPENING THE CHALLENGE…");
    webView.postDelayed(() -> {
      if (!startupSession.equals(battleSession) || graphicsSetup != null || !isSkirmishBattle()) return;
      evaluateTouchTapThen(170, 392, "Start Hosting", 1500, () -> {
        if (!startupSession.equals(battleSession) || !isSkirmishBattle()) return;
        updateLoadingStatus("DEPLOYING TO THE BATTLEFIELD…");
        evaluateTouchTapThen(585, 30, "Ready", 1500, this::finishStartupAutomation);
      });
    }, 1200);
  }

  private void awaitCampaignCanvas(int attempt, String session) {
    if (webView == null || isFinishing() || !session.equals(battleSession) || graphicsSetup != null) return;
    webView.evaluateJavascript("(()=>{const n=window.__warzoneCampaign?.report?.().nativeState;"
        + "return Boolean(window.LaunchedModule?.calledRun && document.getElementById('canvas')?.width>0 "
        + "&& (n?.video||n?.playing) && !window.WarzoneSavedGames?.restoring);})()", result -> {
      if (!session.equals(battleSession) || graphicsSetup != null) return;
      if ("true".equals(result)) { hideLoadingPanel(); webView.requestFocus(); }
      else if (attempt < 240) webView.postDelayed(() -> awaitCampaignCanvas(attempt + 1, session), 250);
      else {
        showEngineFailure("Campaign did not become ready. Tap to return Home.");
        if (loading != null) loading.setOnClickListener(v -> returnToMainMenu());
      }
    });
  }

  private void decreaseVtolLimit(int remaining) {
    if (remaining <= 0) {
      updateLoadingStatus("DEPLOYING TO THE BATTLEFIELD…");
      evaluateTouchTapThen(
          535,
          431,
          "Accept limits",
          1800,
          () ->
              evaluateTouchTapThen(
                  585,
                  isDuelBattle() || isSkirmishBattle() ? 30 : 30
                      + 40 * currentTowersLevel().humanPosition,
                  "Ready",
                  1500,
                  this::finishStartupAutomation));
      return;
    }
    evaluateTouchTapThen(376, 391, "VTOL minus", 320, () -> decreaseVtolLimit(remaining - 1));
  }

  private void finishStartupAutomation() {
    updateLoadingStatus(isDuelBattle() || isSkirmishBattle() ? "PREPARING THE MATCH…" : "PREPARING THE FIRST WAVE…");
    awaitBattlefieldReady(0);
  }

  private void awaitBattlefieldReady(int attempt) {
    awaitBattlefieldReady(attempt, battleSession);
  }

  private void awaitBattlefieldReady(int attempt, String expectedSession) {
    if (webView == null || isFinishing() || !expectedSession.equals(battleSession) || graphicsSetup != null) return;
    String script =
        "(() => {const r=window."
            + (isSkirmishBattle() ? "__warzoneFfa" : isDuelBattle() ? "__warzoneDuel" : "__warzoneTowersWaves") + "?.report?.();"
            + "return Boolean(document.getElementById('canvas')"
            + "&&r?.snapshot?.mode==='" + (isChallengeBattle() ? "challenge" : isFfaBattle() ? "ffa" : isDuelBattle() ? "duel" : isSurvivalBattle() ? "survival" : "tower-defense") + "');})()";
    webView.evaluateJavascript(
        script,
        result -> {
          if (!expectedSession.equals(battleSession) || graphicsSetup != null) return;
          if ("true".equals(result)) {
            revealBattlefield();
            return;
          }
          if (attempt >= 240) {
            showEngineFailure(isDuelBattle()
                ? "The 1v1 battlefield did not become ready in time."
                : "The tower-defence battlefield did not become ready in time.");
            return;
          }
          if (attempt == 40) updateLoadingStatus("ASSEMBLING THE BATTLEFIELD…");
          if (attempt == 120) updateLoadingStatus("FINALISING BATTLEFIELD…");
          webView.postDelayed(() -> awaitBattlefieldReady(attempt + 1, expectedSession), 500);
        });
  }

  private void revealBattlefield() {
    if (webView == null || isFinishing()) return;
    // Establish this map's battlefield-facing view while the splash still covers
    // the canvas. Waves and BASE must never change the camera direction.
    if (!restoringGame && !isSkirmishBattle()) faceOpponent();
    showCombatHud();
    awaitInitialCamera(0);
  }

  private void awaitInitialCamera(int attempt) {
    awaitInitialCamera(attempt, battleSession);
  }

  private void awaitInitialCamera(int attempt, String expectedSession) {
    if (webView == null || isFinishing() || !battleOutcome.isEmpty() || graphicsSetup != null
        || expectedSession.isEmpty() || !expectedSession.equals(battleSession) || rewardSetupFailed) return;
    webView.evaluateJavascript(
        "Boolean(window.__kalaWarzoneTouch?.report?.().cameraFacingPending===false"
            + (isChallengeBattle() ? "&&window.WarzoneSavedGames?.ready===true&&window.WarzoneRewards?.ready===true" : isFfaBattle() ? "&&window.WarzoneSavedGames?.ready===true" : isDuelBattle()
                ? "&&window.__warzoneDuel?.report?.().cameraRequested&&window.__warzoneDuel?.report?.().cameraReady"
                : "&&window.WarzoneRewards?.ready===true") + ")",
        result -> {
          if (!expectedSession.equals(battleSession) || graphicsSetup != null || rewardSetupFailed) return;
          if ("true".equals(result)) {
            prepareStartupBriefing(expectedSession);
          } else if (attempt < 60) {
            webView.postDelayed(() -> awaitInitialCamera(attempt + 1, expectedSession), 250);
          } else {
            showEngineFailure("The battlefield or match bonuses did not become ready. Tap to return Home.");
            if (loading != null) loading.setOnClickListener(v -> returnToMainMenu());
          }
        });
  }

  private void faceOpponent() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        isDuelBattle()
            ? "Boolean(window.__warzoneDuel?.faceOpponent())"
            : "Boolean(window.__kalaWarzoneTouch?.faceOpponent('" + battleLaunch.mapId + "'))",
        result -> Log.i(TAG, "Automatic Warzone battlefield heading (" + battleLaunch.matchMode + "): " + result));
  }

  private void showCombatHud() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "Boolean(window.__kalaWarzoneTouch?.showCombatHud())",
        result -> Log.i(TAG, "Show Warzone Towers combat HUD: " + result));
  }

  /** A dormant ADB-only verification route; normal launches never execute it. */
  private void selectAllUnitsForTouchTest() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "Boolean(window.__kalaWarzoneTouch?.selectAllUnits())",
        result -> Log.i(TAG, "Touch test native Ctrl+U selection: " + result));
  }

  private void issueTouchTestOrder() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "Boolean(window.__kalaWarzoneTouch?.tapNormalized(0.42,0.18))",
        result -> Log.i(TAG, "Touch test single-tap destination: " + result));
  }

  private void dumpTouchReport() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "JSON.stringify(window.__kalaWarzoneTouch?.report?.() || {})",
        result -> Log.i(TAG, "Touch test report: " + result));
  }

  private void runTouchSuite() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "Boolean(window.__kalaWarzoneTouch?.runSyntheticSuite())",
        result -> Log.i(TAG, "Touch v2 synthetic suite started: " + result));
  }

  private void runResearchSuite() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "Boolean(window.__blockNightResearch?.runSyntheticSuite())",
        result -> Log.i(TAG, "Research v2.3 engine-sync suite started: " + result));
  }

  private void dumpResearchReport() {
    if (webView == null || isFinishing()) return;
    webView.evaluateJavascript(
        "JSON.stringify(window.__blockNightResearch?.report?.() || {})",
        result -> Log.i(TAG, "Research test report: " + result));
  }

  private void evaluateTouchTapThen(double x, double y, String label, long delayMs, Runnable next) {
    if (webView == null || isFinishing()) return;
    final String expectedSession = battleSession;
    boolean lobby =
        "Start Hosting".equals(label) || "Limits".equals(label) || "Ready".equals(label);
    String script =
        "Boolean(window.__kalaWarzoneTouch?.tapFrontend(" + x + "," + y + "," + lobby + "))";
    webView.evaluateJavascript(
        script,
        result -> {
          if (!expectedSession.equals(battleSession) || graphicsSetup != null) return;
          Log.i(TAG, "Automatic Warzone " + label + " tap: " + result);
          if (next != null && webView != null && !isFinishing()) {
            webView.postDelayed(() -> {
              if (expectedSession.equals(battleSession) && graphicsSetup == null) next.run();
            }, delayMs);
          }
        });
  }

  private String mapMusicState() {
    try {
      boolean cached = musicStore != null && musicStore.ready();
      synchronized (musicPreferenceLock) {
        return mapMusicIndex.stateJson(musicMode, musicMapId, musicMissionId, cached,
            cached && getPreferences(MODE_PRIVATE).getBoolean("music_enabled", true), musicSuspended, ORIGIN);
      }
    } catch (Exception error) {
      Log.w(TAG, "Map music metadata unavailable", error);
      return "{\"cached\":false,\"enabled\":false,\"suspended\":true,\"mapId\":\"td2\",\"trackId\":\"\","
          + "\"title\":\"Music unavailable\",\"author\":\"\",\"url\":\"\"}";
    }
  }

  private WebResourceResponse mapMusicResponse(WebResourceRequest request, String id) {
    MapMusicIndex.Slice track = mapMusicIndex == null ? null : mapMusicIndex.slice(id);
    if (track != null && musicStore != null && musicStore.ready()) {
      String range = null;
      for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet())
        if ("Range".equalsIgnoreCase(header.getKey())) range = header.getValue();
      try {
        return MusicTrackResponse.open(musicStore, track, request.getMethod(), range, isolationHeaders());
      } catch (IOException error) {
        Log.w(TAG, "Bundled music track unavailable", error);
      }
    }
    Map<String, String> headers = isolationHeaders();
    headers.put("Content-Length", "0");
    return new WebResourceResponse("audio/ogg", null, 404, "Not Found", headers,
        new ByteArrayInputStream(new byte[0]));
  }

  private void mapMusicLifecycle(String action) {
    String session;
    synchronized (musicPreferenceLock) {
      session = musicSession;
      if ("dispose".equals(action)) musicSession = "";
    }
    if (webView == null || session.isEmpty()) return;
    String call = "dispose".equals(action) ? "window.WarzoneMusic?.dispose?.();"
        : "window.WarzoneMusic?.setSuspended?.(" + ("suspend".equals(action) ? "true" : "false") + ");";
    webView.evaluateJavascript(
        "if(new URLSearchParams(location.search).get('battle_session')==="
            + JSONObject.quote(session) + "){" + call + "}true", null);
  }

  private final class WarzoneAssetHandler implements WebViewAssetLoader.PathHandler {
    @Override
    public WebResourceResponse handle(String path) {
      if (path == null
          || path.isEmpty()
          || path.startsWith("/")
          || path.contains("..")
          || path.contains("\\")) {
        return response404(path);
      }
      try {
        if ("optional/music-v1.data".equals(path)) {
          if (musicStore == null || !musicStore.ready()) return response404(path);
          return new WebResourceResponse(
              "application/octet-stream",
              null,
              200,
              "OK",
              isolationHeaders(),
              musicStore.openArchive());
        }
        if (path.endsWith(".data")
            || path.endsWith(".wasm")
            || path.endsWith("blocknight-scenario.js")) {
          Log.i(TAG, "Serving packaged engine asset: " + path);
        }
        InputStream stream = getAssets().open("warzone/" + path);
        Map<String, String> headers = isolationHeaders();
        if ("index.html".equals(path) || "mobile.html".equals(path)
            || "index-duel.html".equals(path) || "mobile-duel.html".equals(path)
            || "index-ffa.html".equals(path) || "mobile-ffa.html".equals(path)
            || "index-challenge.html".equals(path) || "mobile-challenge.html".equals(path)
            || "index-survival.html".equals(path) || "mobile-survival.html".equals(path)
            || "index-campaign.html".equals(path) || "mobile-campaign.html".equals(path)) {
          headers.put("Cross-Origin-Opener-Policy", "same-origin");
          headers.put("Document-Isolation-Policy", "isolate-and-require-corp");
        }
        return new WebResourceResponse(
            mimeType(path), isText(path) ? "UTF-8" : null, 200, "OK", headers, stream);
      } catch (IOException error) {
        Log.e(TAG, "Missing packaged engine asset: " + path, error);
        return response404(path);
      }
    }

    private WebResourceResponse response404(String path) {
      byte[] body = ("Missing packaged Warzone asset: " + path).getBytes(StandardCharsets.UTF_8);
      return new WebResourceResponse(
          "text/plain",
          "UTF-8",
          404,
          "Not Found",
          isolationHeaders(),
          new ByteArrayInputStream(body));
    }
  }

  private static Map<String, String> isolationHeaders() {
    Map<String, String> headers = new HashMap<>();
    headers.put("Cache-Control", "no-store");
    headers.put("Cross-Origin-Resource-Policy", "same-origin");
    headers.put("Cross-Origin-Embedder-Policy", "require-corp");
    return headers;
  }

  private static boolean isText(String path) {
    return path.endsWith(".html")
        || path.endsWith(".js")
        || path.endsWith(".css")
        || path.endsWith(".json");
  }

  /** Keep existing bridge scripts in the engine frame's own JS realm. */
  private final class EngineWebView extends WebView {
    EngineWebView(Context context) {
      super(context);
    }

    @Override
    public boolean onKeyPreIme(int keyCode, KeyEvent event) {
      if (isGameBackKey(keyCode) && gameBackWindow()) {
        // Do not let Chromium turn legacy Back into an engine Escape. When
        // the keyboard is open, forward directly to the IME input stage.
        if (isKeyboardVisible()) {
          pendingBackKey = KeyEvent.KEYCODE_UNKNOWN;
          return false;
        }
        return routeGameBackKey(event);
      }
      return super.onKeyPreIme(keyCode, event);
    }

    // The game is a fixed viewport. Android's focus reveal can scroll the
    // WebView itself even while both HTML documents report scrollY == 0.
    // Let HTML lists scroll, but never move the native viewport/header.
    @Override
    public void scrollTo(int x, int y) {
      super.scrollTo(0, 0);
    }

    @Override
    protected void onScrollChanged(int x, int y, int oldX, int oldY) {
      super.onScrollChanged(x, y, oldX, oldY);
      if (x != 0 || y != 0) super.scrollTo(0, 0);
    }

    // The toolbar and menu layouts are in the outer page, outside the game frame.
    void evaluateHostJavascript(String script) {
      super.evaluateJavascript(script, null);
    }

    @Override
    public void evaluateJavascript(String script, ValueCallback<String> callback) {
      String routed =
          "(() => {const f=document.getElementById('warzone-game-frame');"
              + "if(!f?.contentWindow)return null;return f.contentWindow.eval("
              + JSONObject.quote(script)
              + ");})()";
      super.evaluateJavascript(routed, callback);
    }
  }

  private static String mimeType(String path) {
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".js")) return "application/javascript";
    if (path.endsWith(".css")) return "text/css";
    if (path.endsWith(".json")) return "application/json";
    if (path.endsWith(".wasm")) return "application/wasm";
    if (path.endsWith(".data")) return "application/octet-stream";
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".svg")) return "image/svg+xml";
    if (path.endsWith(".ttf")) return "font/ttf";
    return "application/octet-stream";
  }

  /** App-owned feedback shares the Towers palette and never captures game input. */
  private void showAppNotice(String message, boolean longer) {
    if (message == null || message.isEmpty() || isFinishing() || isDestroyed()) return;
    if (isDuelBattle() || root == null) {
      Toast.makeText(this, message, longer ? Toast.LENGTH_LONG : Toast.LENGTH_SHORT).show();
      return;
    }
    clearAppNotice();
    TextView notice = new TextView(this);
    appNotice = notice;
    notice.setTextColor(TowersTheme.TEXT);
    notice.setTextSize(14);
    notice.setTypeface(Typeface.create("sans-serif-condensed", Typeface.NORMAL));
    notice.setIncludeFontPadding(false);
    notice.setPadding(dp(12), dp(8), dp(12), dp(8));
    notice.setMaxWidth(Math.max(dp(80), getResources().getDisplayMetrics().widthPixels - dp(24)));
    notice.setClickable(false);
    notice.setFocusable(false);
    notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    GradientDrawable background = new GradientDrawable();
    background.setColor(TowersTheme.PANEL);
    background.setCornerRadius(dp(6));
    notice.setBackground(background);
    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(-2, -2,
        Gravity.TOP | Gravity.CENTER_HORIZONTAL);
    params.topMargin = dp(64);
    params.leftMargin = dp(12);
    params.rightMargin = dp(12);
    root.addView(notice, params);
    notice.setText(message);
    root.postDelayed(dismissAppNotice, longer ? 3500 : 2000);
  }

  private void clearAppNotice() {
    if (root != null) {
      root.removeCallbacks(dismissAppNotice);
      if (appNotice != null) root.removeView(appNotice);
    }
    appNotice = null;
  }

  private void immersive() {
    getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | (isDuelBattle() ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR));
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) immersive();
    refreshUpdateHomeVisibility();
  }

  private boolean isUpdateHomeVisible() {
    if (!activityResumed || root == null || graphicsSetup == null
        || graphicsSetup.getVisibility() != View.VISIBLE || !graphicsSetup.isHomeModesVisible()
        || campaignHomeBusy || loadingOverlay != null || guideView != null || hubView != null
        || aboutView != null || playGamesView != null || mainMenuDialog != null) return false;
    for (int index = root.getChildCount() - 1; index >= 0; index--) {
      View child = root.getChildAt(index);
      if (child.getVisibility() == View.VISIBLE) return child == graphicsSetup;
    }
    return false;
  }

  private void refreshUpdateHomeVisibility() {
    if (appUpdates != null) appUpdates.onHomeVisible(isUpdateHomeVisible());
  }

  @Override
  protected void onPause() {
    if (hubView != null) hubView.pause();
    cancelCampaignHomeCheck();
    clearAppNotice();
    activityResumed = false;
    refreshUpdateHomeVisibility();
    musicSuspended = true;
    mapMusicLifecycle("suspend");
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (playGames != null) playGames.refreshProgress();
    if (hubView != null) hubView.resume();
    activityResumed = true;
    musicSuspended = false;
    mapMusicLifecycle(musicSuspended ? "suspend" : "resume");
    refreshUpdateHomeVisibility();
  }

  @Override
  protected void onDestroy() {
    if (root != null && updateHomeLayoutListener != null) {
      root.getViewTreeObserver().removeOnGlobalLayoutListener(updateHomeLayoutListener);
      updateHomeLayoutListener = null;
    }
    if (playGames != null) playGames.close();
    if (appUpdates != null) appUpdates.close();
    closeHub();
    closeGuide();
    cancelCampaignHomeCheck();
    if (campaignVideos != null) campaignVideos.close();
    clearAppNotice();
    dismissBriefing();
    mapMusicLifecycle("dispose");
    dismissMainMenuDialog();
    if (musicStore != null) musicStore.close();
    if (root != null && viewportListener != null) {
      root.removeOnLayoutChangeListener(viewportListener);
      viewportListener = null;
    }
    if (battleControls != null) {
      battleControls.detach(root);
      battleControls = null;
    }
    if (webView != null) {
      webView.stopLoading();
      root.removeView(webView);
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }

  private static boolean isGameBackKey(int keyCode) {
    return keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE;
  }

  private boolean gameBackWindow() {
    return webView != null && graphicsSetup == null && loadingOverlay == null
        && replayPanel == null;
  }

  private boolean isKeyboardVisible() {
    View decor = getWindow().getDecorView();
    if (Build.VERSION.SDK_INT >= 30) {
      WindowInsets insets = decor.getRootWindowInsets();
      if (insets != null) return insets.isVisible(WindowInsets.Type.ime());
    }
    // API 26-29 has no IME visibility insets. Compare with the real screen,
    // because adjustResize can shrink the decor itself above the keyboard.
    Rect visible = new Rect();
    Point screen = new Point();
    decor.getWindowVisibleDisplayFrame(visible);
    getWindowManager().getDefaultDisplay().getRealSize(screen);
    int threshold = Math.max(Math.round(100 * getResources().getDisplayMetrics().density), screen.y / 5);
    return screen.y - visible.bottom > threshold;
  }

  private void hideKeyboard() {
    InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
    if (keyboard != null) keyboard.hideSoftInputFromWindow(getWindow().getDecorView().getWindowToken(), 0);
  }

  private boolean routeGameBackKey(KeyEvent event) {
    int keyCode = event.getKeyCode();
    if (!isGameBackKey(keyCode) || !gameBackWindow()) return false;
    if (isKeyboardVisible()) {
      pendingBackKey = KeyEvent.KEYCODE_UNKNOWN;
      if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) hideKeyboard();
      return true;
    }
    if (event.getAction() == KeyEvent.ACTION_DOWN) {
      if (event.getRepeatCount() == 0) pendingBackKey = keyCode;
      return true;
    }
    if (event.getAction() == KeyEvent.ACTION_UP) {
      boolean route = pendingBackKey == keyCode && !event.isCanceled();
      pendingBackKey = KeyEvent.KEYCODE_UNKNOWN;
      if (route) {
        Log.i(TAG, "Back routed before WebView: " + keyCode);
        onBackPressed();
      }
      return true;
    }
    return true;
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    // This is the post-IME fallback for legacy button/key delivery. Modern
    // predictive Back continues through OnBackInvokedDispatcher above.
    if (routeGameBackKey(event)) return true;
    return super.dispatchKeyEvent(event);
  }

  @Override
  public void onBackPressed() {
    if (playGamesView != null) { if (!playGamesView.back()) closePlayGames(); return; }
    if (aboutView != null) {
      aboutView.back();
      return;
    }
    if (hubView != null) {
      hubView.back();
      return;
    }
    if (guideView != null) {
      guideView.back();
      return;
    }
    if (battleBriefing != null) return;
    if (campaignHomeBusy) { cancelCampaignHomeCheck(); return; }
    if (savedGamesView != null) { closeSavedGames(); return; }
    if (mapsSetup != null) {
      if (mapsSetup.dismissInput()) return;
      closeMapsSetup(); showFfaSetup(); return;
    }
    if (campaignSetup != null) { closeCampaignSetup(); return; }
    if (ffaSetup != null) { closeFfaSetup(); return; }
    if (rewardsView != null) { closeRewards(); return; }
    if (survivalSetup != null) { closeSurvivalSetup(); return; }
    if (rewardReceipt != null) { dismissRewardReceipt(); return; }
    if (challengeSetup != null) { closeChallengeSetup(); showFfaSetup(); return; }
    if (mainMenuDialog != null) {
      mainMenuDialog.cancel();
      return;
    }
    if (mainMenuReturnPending) return;
    if (gameBackWindow() && isKeyboardVisible()) {
      hideKeyboard();
      return;
    }
    if (graphicsSetup != null && graphicsSetup.handleHomeBack()) {
      cancelCampaignHomeCheck();
      return;
    }
    if (webView != null && graphicsSetup == null && loadingOverlay == null && replayPanel == null) {
      webView.evaluateJavascript("if(!window.WarzoneMusic?.closeMenu?.()) window.__towersHtml?.back();true", null);
      return;
    }
    super.onBackPressed();
  }
}
