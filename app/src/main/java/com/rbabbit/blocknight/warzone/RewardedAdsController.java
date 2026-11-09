package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentForm;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.Locale;

/** Optional ads stay dormant until a deliberate Watch action in Rewards. */
final class RewardedAdsController {
  interface Host {
    void onAdsChanged();
    void acquireFullScreen(Runnable show, Runnable cancel);
    void releaseFullScreen();
    String prepareReward();
    boolean creditReward(String token);
    void cancelReward(String token);
  }

  private static final String TAG = "TowersRewardedAds";
  private static final String DEMO_REWARDED_UNIT = "ca-app-pub-3940256099942544/5224354917";
  // The 0.29 test APK used Google's demo APP identity. This test-only migration
  // drops that SDK consent once; production never resets a user's consent.
  private static final String TEST_IDENTITY_PREFS = "towers_test_consent_identity";
  private static final String TEST_IDENTITY_KEY = "publisher_identity_030";
  private static final String TEST_PUBLISHER_IDENTITY = "ca-app-pub-3430279660625393~3119801475";
  private static final String OPTIONAL = "Optional ad · 10 crystals";
  private static final long NETWORK_TIMEOUT_MS = 25_000, INITIALIZATION_TIMEOUT_MS = 35_000;
  private static final long GATE_TIMEOUT_MS = 12_000, AD_MAX_AGE_MS = 55 * 60_000L;
  private static final long SETTLE_CALLBACKS_MS = 1_000;
  private enum Intent { NONE, WATCH, PRIVACY }
  private final Activity activity;
  private final Host host;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ConsentInformation consent;
  private boolean destroyed, started, foreground, consentUpdating, consentChecked;
  private boolean formLoading, initializing, initializationRequested, initialized, loading;
  private boolean gatePending, fullScreenHeld, awaitingRelease, formShowing, settling;
  private boolean testIdentityReady, testIdentityReset, testIdentityCommitFailed, consentNeedsFreshUpdate;
  private long consentEpoch, formEpoch, loadEpoch, gateEpoch, adLoadedAt;
  private RewardedAd loadedAd;
  private Presentation presentation;
  private Intent intent = Intent.NONE;
  private String consentFailure = "", pendingEarned = "", pendingCancellation = "", message = OPTIONAL;

  private static final class Presentation {
    final String token;
    boolean earned, credited, ended, cancelled;
    Presentation(String token) { this.token = token; }
  }

  RewardedAdsController(Activity activity, Host host) {
    this.activity = activity;
    this.host = host;
    consent = UserMessagingPlatform.getConsentInformation(activity.getApplicationContext());
  }

  /** Refresh UMP once at launch, without opening a form or initializing ads. */
  void start() {
    if (destroyed || started) return;
    started = true;
    updateConsent();
  }

  boolean canWatch() { return usable() && !isBusy(); }
  boolean isBusy() {
    return intent != Intent.NONE || gatePending || fullScreenHeld || awaitingRelease
        || formShowing || presentation != null || settling;
  }
  boolean privacyRequired() {
    return !destroyed && consent.getPrivacyOptionsRequirementStatus()
        == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
  }
  boolean usingTestAds() {
    if (BuildConfig.ADMOB_TEST_ADS) return true;
    String fingerprint = (Build.FINGERPRINT == null ? "" : Build.FINGERPRINT).toLowerCase(Locale.ROOT);
    String model = (Build.MODEL == null ? "" : Build.MODEL).toLowerCase(Locale.ROOT);
    String hardware = (Build.HARDWARE == null ? "" : Build.HARDWARE).toLowerCase(Locale.ROOT);
    return fingerprint.startsWith("generic") || fingerprint.contains("emulator")
        || model.contains("sdk_gphone") || model.contains("emulator")
        || hardware.contains("goldfish") || hardware.contains("ranchu");
  }
  String status() {
    if (!pendingEarned.isEmpty()) return "10 crystals earned. Tap to save your reward.";
    if (!pendingCancellation.isEmpty()) return "The previous ad is clearing. Tap to retry.";
    return message;
  }

  /** A single deliberate tap may continue through consent, loading and one ad. */
  void watch() {
    if (!usable() || !foreground || isBusy()) return;
    if (!pendingEarned.isEmpty()) { retryEarned(); return; }
    if (!pendingCancellation.isEmpty()) { retryCancellation(); return; }
    intent = Intent.WATCH;
    message = "Preparing optional ad…";
    if (!consentFailure.isEmpty() && !consent.canRequestAds()) consentChecked = false;
    changed();
    advance();
  }

  void showPrivacyOptions() {
    if (!usable() || !foreground || isBusy() || !privacyRequired()) return;
    intent = Intent.PRIVACY;
    invalidateAdLoad();
    message = "Opening privacy choices…";
    changed();
    advance();
  }

  /** Closing Rewards or leaving its document cancels unfinished user intent. */
  void cancelWatch() {
    if (destroyed) return;
    intent = Intent.NONE;
    invalidateAdLoad();
    ++formEpoch; formLoading = false;
    if (gatePending) {
      gatePending = false;
      ++gateEpoch;
      release();
    }
    // An already shown Google form/ad owns its dismissal and an earned reward
    // remains independent of the drawer. Never cancel a paid wallet attempt.
    if (presentation == null && !formShowing && !settling) message = OPTIONAL;
    changed();
  }

  void onPause() {
    foreground = false;
    if (!formShowing && presentation == null) cancelWatch();
  }
  void onResume() {
    if (destroyed) return;
    foreground = true;
    if (!pendingEarned.isEmpty()) retryEarned();
    if (!pendingCancellation.isEmpty()) retryCancellation();
    // Foregrounding alone cannot create a watch intent or request an ad.
    advance();
  }

  /** Root calls this after its native pause cover has actually been restored. */
  void onFullScreenReleased() {
    if (destroyed || !awaitingRelease) return;
    awaitingRelease = false;
    changed();
    advance();
  }

  void destroy() {
    if (destroyed) return;
    destroyed = true;
    intent = Intent.NONE;
    ++consentEpoch; ++formEpoch; ++loadEpoch; ++gateEpoch;
    main.removeCallbacksAndMessages(null);
    loadedAd = null;
    if (presentation != null && !presentation.earned && !presentation.ended) cancel(presentation);
    presentation = null;
    release();
  }

  private void advance() {
    if (!usable() || !foreground || intent == Intent.NONE || consentUpdating || formLoading
        || gatePending || fullScreenHeld || awaitingRelease || formShowing
        || presentation != null || settling || !pendingEarned.isEmpty() || !pendingCancellation.isEmpty()) return;
    if (!consentChecked) { updateConsent(); return; }
    if (intent == Intent.PRIVACY) { presentPrivacyOptions(); return; }
    if (consent.getConsentStatus() == ConsentInformation.ConsentStatus.REQUIRED) {
      loadConsentForm(); return;
    }
    if (!consent.canRequestAds()) {
      endIntent(consentFailure.isEmpty() ? "Privacy choices are unavailable. Tap to retry." : consentFailure);
      return;
    }
    expireAd();
    if (loadedAd == null) { loadAd(); return; }
    final RewardedAd ad = loadedAd;
    loadedAd = null; adLoadedAt = 0;
    acquire(() -> showAd(ad), () -> endIntent("The ad could not open. Tap to retry."));
  }

  private void updateConsent() {
    if (!usable() || consentUpdating || formShowing || gatePending) return;
    if (!prepareTestConsentIdentity()) {
      if (intent != Intent.NONE) endIntent("Privacy setup could not be saved. Tap to retry.");
      return;
    }
    final long epoch = ++consentEpoch;
    consentUpdating = true;
    if (intent != Intent.NONE) message = "Checking privacy choices…";
    changed();
    main.postDelayed(() -> {
      if (!currentConsent(epoch) || !consentUpdating) return;
      ++consentEpoch;
      finishConsentUpdate("Privacy could not be checked. Tap to retry.");
    }, NETWORK_TIMEOUT_MS);
    try {
      consent.requestConsentInfoUpdate(activity, new ConsentRequestParameters.Builder().build(),
          () -> onMain(() -> { if (currentConsent(epoch) && consentUpdating) finishConsentUpdate(""); }),
          error -> onMain(() -> { if (currentConsent(epoch) && consentUpdating)
            finishConsentUpdate("Privacy choices are unavailable. Tap to retry."); }));
    } catch (RuntimeException error) {
      finishConsentUpdate("Privacy choices are unavailable. Tap to retry.");
    }
  }

  private void finishConsentUpdate(String failure) {
    consentUpdating = false; consentFailure = failure;
    if (failure.isEmpty()) consentNeedsFreshUpdate = false;
    consentChecked = !consentNeedsFreshUpdate;
    // Quiet launch refreshes are deliberately silent, including network errors.
    if (intent == Intent.NONE) message = OPTIONAL;
    else if (consentNeedsFreshUpdate) { endIntent(failure); return; }
    changed();
    advance();
  }

  private boolean prepareTestConsentIdentity() {
    if (!BuildConfig.ADMOB_TEST_ADS || testIdentityReady) return true;
    try {
      SharedPreferences preferences = activity.getSharedPreferences(TEST_IDENTITY_PREFS, Activity.MODE_PRIVATE);
      if (!testIdentityCommitFailed && TEST_PUBLISHER_IDENTITY.equals(preferences.getString(TEST_IDENTITY_KEY, ""))) {
        testIdentityReady = true;
        return true;
      }
      if (!testIdentityReset) {
        consent.reset();
        testIdentityReset = true;
        consentNeedsFreshUpdate = true;
      }
      // commit() may update process memory even when the disk write fails. Keep
      // retrying that write explicitly rather than trusting the in-memory key.
      if (!preferences.edit().putString(TEST_IDENTITY_KEY, TEST_PUBLISHER_IDENTITY).commit()) {
        testIdentityCommitFailed = true;
        return false;
      }
      testIdentityCommitFailed = false;
      testIdentityReady = true;
      return true;
    } catch (RuntimeException error) {
      testIdentityCommitFailed = true;
      Log.w(TAG, "Test consent identity could not be saved.");
      return false;
    }
  }

  private void loadConsentForm() {
    if (!usable() || intent != Intent.WATCH || formLoading) return;
    if (!consent.isConsentFormAvailable()) { endIntent("Privacy choices are unavailable. Tap to retry."); return; }
    final long epoch = ++formEpoch;
    formLoading = true;
    message = "Loading privacy choices…";
    changed();
    main.postDelayed(() -> {
      if (destroyed || epoch != formEpoch || !formLoading) return;
      formLoading = false; ++formEpoch;
      endIntent("Privacy choices did not load. Tap to retry.");
    }, NETWORK_TIMEOUT_MS);
    try {
      UserMessagingPlatform.loadConsentForm(activity.getApplicationContext(), form -> onMain(() -> {
        if (destroyed || epoch != formEpoch || !formLoading || intent != Intent.WATCH) return;
        formLoading = false;
        if (!foreground) { cancelWatch(); return; }
        acquire(() -> {
          formShowing = true;
          message = "Privacy choices are open.";
          changed();
          try {
            form.show(activity, error -> onMain(() -> {
              if (destroyed || !formShowing) return;
              formShowing = false;
              if (error != null) endIntent("Privacy choices could not open. Tap to retry.");
              else if (intent != Intent.NONE && !consent.canRequestAds())
                endIntent("Ads are unavailable with the current privacy settings.");
              release();
            }));
          } catch (RuntimeException error) {
            formShowing = false;
            endIntent("Privacy choices could not open. Tap to retry.");
            release();
          }
        }, () -> endIntent("Privacy choices could not open. Tap to retry."));
      }), error -> onMain(() -> {
        if (destroyed || epoch != formEpoch || !formLoading) return;
        formLoading = false;
        endIntent("Privacy choices did not load. Tap to retry.");
      }));
    } catch (RuntimeException error) {
      formLoading = false;
      endIntent("Privacy choices did not load. Tap to retry.");
    }
  }

  private void presentPrivacyOptions() {
    if (intent != Intent.PRIVACY) return;
    if (!privacyRequired()) { endIntent(OPTIONAL); return; }
    acquire(() -> {
      formShowing = true;
      message = "Privacy choices are open.";
      changed();
      try {
        UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> onMain(() -> {
          if (destroyed || !formShowing) return;
          formShowing = false;
          endIntent(error == null ? OPTIONAL : "Privacy choices could not open. Tap to retry.");
          release();
        }));
      } catch (RuntimeException error) {
        formShowing = false;
        endIntent("Privacy choices could not open. Tap to retry.");
        release();
      }
    }, () -> endIntent("Privacy choices could not open. Tap to retry."));
  }

  private void loadAd() {
    if (!usable() || intent != Intent.WATCH || !foreground || !consent.canRequestAds() || loading
        || gatePending || fullScreenHeld || awaitingRelease || formShowing || presentation != null) return;
    if (!initialized) { initializeAds(); return; }
    final long epoch = ++loadEpoch;
    loading = true;
    message = "Loading optional ad…";
    changed();
    main.postDelayed(() -> {
      if (destroyed || epoch != loadEpoch || !loading) return;
      loading = false; ++loadEpoch;
      endIntent("No ad available. Tap to retry.");
    }, NETWORK_TIMEOUT_MS);
    try {
      String unit = usingTestAds() ? DEMO_REWARDED_UNIT : BuildConfig.ADMOB_REWARDED_AD_UNIT_ID;
      RewardedAd.load(activity.getApplicationContext(), unit, new AdRequest.Builder().build(),
          new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) { onMain(() -> {
              if (destroyed || epoch != loadEpoch || !loading) return;
              loading = false;
              if (intent != Intent.WATCH || !foreground || !consent.canRequestAds()) return;
              loadedAd = ad; adLoadedAt = SystemClock.elapsedRealtime();
              advance();
            }); }
            @Override public void onAdFailedToLoad(LoadAdError error) { onMain(() -> {
              if (destroyed || epoch != loadEpoch || !loading) return;
              loading = false;
              Log.i(TAG, "Rewarded ad unavailable: " + error.getCode());
              endIntent("No ad available. Tap to retry.");
            }); }
          });
    } catch (RuntimeException error) {
      loading = false;
      endIntent("No ad available. Tap to retry.");
    }
  }

  private void initializeAds() {
    if (initializing) return;
    if (initializationRequested) { endIntent("Ads are still starting. Reopen the app to retry."); return; }
    if (!usable() || intent != Intent.WATCH || !consent.canRequestAds()) return;
    initializationRequested = true; initializing = true;
    message = "Starting optional ad…";
    changed();
    main.postDelayed(() -> {
      if (destroyed || !initializing) return;
      initializing = false;
      if (intent == Intent.WATCH) endIntent("Ads could not start. Reopen the app to retry.");
    }, INITIALIZATION_TIMEOUT_MS);
    Thread init = new Thread(() -> {
      try {
        MobileAds.initialize(activity.getApplicationContext(), status -> onMain(() -> {
          if (destroyed) return;
          initializing = false; initialized = true;
          advance();
        }));
      } catch (RuntimeException error) {
        onMain(() -> {
          if (destroyed) return;
          initializing = false; initializationRequested = false;
          if (intent == Intent.WATCH) endIntent("Ads could not start. Tap to retry.");
        });
      }
    }, "Towers-ad-initialize");
    init.start();
  }

  private void showAd(RewardedAd ad) {
    if (!usable() || !foreground || intent != Intent.WATCH || !consent.canRequestAds()) {
      endIntent("The ad could not open. Tap to retry."); release(); return;
    }
    final Presentation attempt;
    try {
      String token = host.prepareReward();
      if (token == null || token.isEmpty()) throw new IllegalStateException("Reward could not be prepared.");
      attempt = new Presentation(token); presentation = attempt; intent = Intent.NONE;
    } catch (RuntimeException error) {
      endIntent("The reward could not be prepared. Tap to retry."); release(); return;
    }
    message = "Ad playing · 10 crystals when earned";
    changed();
    try {
      ad.setFullScreenContentCallback(new FullScreenContentCallback() {
        @Override public void onAdDismissedFullScreenContent() { onMain(() -> endAd(attempt, false)); }
        @Override public void onAdFailedToShowFullScreenContent(AdError error) { onMain(() -> endAd(attempt, true)); }
      });
      ad.show(activity, reward -> onMain(() -> {
        if (destroyed || attempt.cancelled || attempt.earned) return;
        attempt.earned = true; pendingEarned = attempt.token;
        retryEarned();
      }));
    } catch (RuntimeException error) { endAd(attempt, true); }
  }

  private void endAd(Presentation attempt, boolean failed) {
    if (destroyed || attempt.ended) return;
    attempt.ended = true;
    if (presentation == attempt) presentation = null;
    settling = true;
    message = attempt.earned ? attempt.credited ? "+10 crystals" : "Your earned reward is waiting to be saved."
        : failed ? "The ad could not play. No crystals added." : "Ad closed before earning. No crystals added.";
    changed();
    release();
    main.postDelayed(() -> {
      if (destroyed) return;
      if (!attempt.earned) cancel(attempt);
      settling = false;
      changed();
      // No post-ad preload: another ad requires another deliberate Watch tap.
    }, SETTLE_CALLBACKS_MS);
  }

  private void retryEarned() {
    if (destroyed || pendingEarned.isEmpty()) return;
    String token = pendingEarned;
    try {
      if (host.creditReward(token)) {
        if (presentation != null && presentation.token.equals(token)) presentation.credited = true;
        pendingEarned = ""; message = "+10 crystals";
      } else message = "10 crystals earned. Tap to save your reward.";
    } catch (RuntimeException error) { message = "10 crystals earned. Tap to save your reward."; }
    changed();
  }
  private void cancel(Presentation attempt) {
    if (attempt.earned || attempt.cancelled) return;
    attempt.cancelled = true; pendingCancellation = attempt.token;
    retryCancellation();
  }
  private void retryCancellation() {
    if (pendingCancellation.isEmpty()) return;
    try {
      host.cancelReward(pendingCancellation); pendingCancellation = "";
      message = "Ad closed. No crystals added.";
    } catch (RuntimeException error) {
      message = "The previous ad is clearing. Tap to retry.";
      Log.w(TAG, "Unused ad attempt could not be cleared.");
    }
    changed();
  }

  private void acquire(Runnable show, Runnable cancelled) {
    if (!usable() || !foreground || intent == Intent.NONE || gatePending || fullScreenHeld || awaitingRelease) return;
    final long epoch = ++gateEpoch;
    gatePending = true; fullScreenHeld = true;
    message = "Opening optional ad…";
    changed();
    final Runnable fail = () -> {
      if (destroyed || epoch != gateEpoch || !gatePending) return;
      gatePending = false; ++gateEpoch;
      cancelled.run();
      release();
    };
    main.postDelayed(fail, GATE_TIMEOUT_MS);
    try {
      host.acquireFullScreen(() -> onMain(() -> {
        if (destroyed || epoch != gateEpoch || !gatePending) return;
        if (!foreground || !usable() || intent == Intent.NONE) { fail.run(); return; }
        gatePending = false; ++gateEpoch;
        show.run();
      }), () -> onMain(fail));
    } catch (RuntimeException error) { fail.run(); }
  }
  private void release() {
    if (!fullScreenHeld) return;
    fullScreenHeld = false;
    awaitingRelease = true;
    try { host.releaseFullScreen(); }
    catch (RuntimeException error) {
      awaitingRelease = false;
      endIntent("The game could not resume. Please try again.");
      Log.w(TAG, "Ad screen restoration failed.");
    }
  }
  private void endIntent(String status) {
    intent = Intent.NONE;
    message = status;
    changed();
  }
  private void invalidateAdLoad() { ++loadEpoch; loading = false; loadedAd = null; adLoadedAt = 0; }
  private void expireAd() {
    if (loadedAd != null && SystemClock.elapsedRealtime() - adLoadedAt >= AD_MAX_AGE_MS) {
      loadedAd = null; adLoadedAt = 0;
    }
  }
  private boolean usable() { return !destroyed && !activity.isFinishing() && !activity.isDestroyed(); }
  private boolean currentConsent(long epoch) { return !destroyed && epoch == consentEpoch; }
  private void onMain(Runnable action) {
    if (Looper.myLooper() == Looper.getMainLooper()) action.run(); else main.post(action);
  }
  private void changed() { if (!destroyed) host.onAdsChanged(); }
}
