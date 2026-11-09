package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentForm;
import com.google.android.ump.FormError;
import com.google.android.ump.UserMessagingPlatform;
import java.util.HashSet;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

final class RewardedAdsCheck030 {
  private static int checks;
  static final class Host implements RewardedAdsController.Host {
    RewardedAdsController owner;
    int acquires, releases, prepares, balance, creditCalls, cancelled, cancellationCalls;
    boolean autoGate = true, autoRelease = true, rejectGate, failCredit, failCancel;
    Runnable show, cancel;
    String pending = "";
    final Set<String> paid = new HashSet<>();
    public void onAdsChanged() { }
    public void acquireFullScreen(Runnable show, Runnable cancel) {
      acquires++; this.show = show; this.cancel = cancel;
      if (rejectGate) cancel.run(); else if (autoGate) show.run();
    }
    public void releaseFullScreen() { releases++; if (autoRelease) restore(); }
    void restore() { owner.onFullScreenReleased(); }
    public String prepareReward() { prepares++; pending = "attempt-" + prepares; return pending; }
    public boolean creditReward(String token) {
      creditCalls++;
      if (failCredit) return false;
      if (paid.contains(token)) return true;
      if (!pending.equals(token)) return false;
      paid.add(token); pending = ""; balance += 10; return true;
    }
    public void cancelReward(String token) {
      cancellationCalls++;
      if (failCancel) throw new IllegalStateException("Simulated wallet write failure.");
      if (pending.equals(token)) { pending = ""; cancelled++; }
    }
  }
  record Fixture(RewardedAdsController ads, Host host) { }
  static Fixture fixture() throws Exception {
    for (Thread thread : Thread.getAllStackTraces().keySet())
      if (thread.getName().equals("Towers-ad-initialize")) thread.join(1_000);
    Handler.clear(); RewardedAd.reset(); MobileAds.reset(); UserMessagingPlatform.reset();
    SharedPreferences.clear();
    // Existing scenarios model a device that already completed this one-time
    // migration. Dedicated upgrade cases below remove this persisted marker.
    SharedPreferences.open("towers_test_consent_identity").values.put("publisher_identity_030", "ca-app-pub-3430279660625393~3119801475");
    SharedPreferences.accessed.clear();
    BuildConfig.ADMOB_TEST_ADS = true;
    android.os.Build.FINGERPRINT = "physical";
    android.os.Build.MODEL = "phone"; android.os.Build.HARDWARE = "physical";
    Host host = new Host();
    RewardedAdsController ads = new RewardedAdsController(new Activity(), host); host.owner = ads;
    return new Fixture(ads, host);
  }
  static void launch(Fixture f) { f.ads.start(); f.ads.onResume(); }
  static void pump(BooleanSupplier observed) throws Exception {
    for (int i = 0; i < 200 && !observed.getAsBoolean(); i++) { Thread.sleep(2); Handler.ready(); }
    require(observed.getAsBoolean(), "fixture reached observable callback state");
  }
  static void watch(Fixture f) throws Exception { f.ads.watch(); pump(() -> RewardedAd.shows == 1); }
  static void gate(Fixture f) throws Exception { pump(() -> f.host.acquires > 0); }
  static void idle(Fixture f) throws Exception { pump(() -> !f.ads.isBusy()); }
  static void check(boolean condition, String name) {
    require(condition, name); checks++; System.out.println("PASS " + name);
  }
  static void require(boolean condition, String name) { if (!condition) throw new AssertionError(name); }

  public static void main(String[] args) throws Exception {
    Fixture f = fixture(); SharedPreferences.clear();
    SharedPreferences.open("towers_rewards").values.put("ledger_v1", "wallet-and-earned-crystals");
    SharedPreferences.accessed.clear(); UserMessagingPlatform.info.privacyRequired = true;
    launch(f);
    check(UserMessagingPlatform.info.resets == 1 && UserMessagingPlatform.info.requests == 1
        && !UserMessagingPlatform.info.privacyRequired && SharedPreferences.commits == 1,
        "test upgrade resets the demo consent identity once before refreshing the publisher identity");
    check(SharedPreferences.accessed.equals(Set.of("towers_test_consent_identity"))
        && SharedPreferences.stores.get("towers_rewards").values.get("ledger_v1").equals("wallet-and-earned-crystals"),
        "the consent identity migration never reads or changes the wallet preference record");
    f.ads.start(); f.ads.onPause(); f.ads.onResume();
    UserMessagingPlatform.info.privacyRequired = true;
    f.ads.destroy(); Host repeatHost = new Host();
    RewardedAdsController repeated = new RewardedAdsController(new Activity(), repeatHost); repeatHost.owner = repeated;
    repeated.start(); repeated.onResume();
    check(UserMessagingPlatform.info.resets == 1 && SharedPreferences.commits == 1
        && UserMessagingPlatform.info.privacyRequired && MobileAds.requests == 0,
        "repeated test launches retain subsequent consent choices and never reset or preload again");
    repeated.destroy();

    f = fixture(); SharedPreferences.clear(); BuildConfig.ADMOB_TEST_ADS = false;
    UserMessagingPlatform.info.privacyRequired = true; launch(f);
    check(UserMessagingPlatform.info.resets == 0 && SharedPreferences.accessed.isEmpty()
        && UserMessagingPlatform.info.privacyRequired && UserMessagingPlatform.info.requests == 1,
        "production skips the test migration and preserves existing consent without accessing migration preferences");
    f.ads.destroy();

    f = fixture(); SharedPreferences.clear(); SharedPreferences.failCommit = true; launch(f); f.ads.watch();
    check(UserMessagingPlatform.info.resets == 1 && UserMessagingPlatform.info.requests == 0
        && MobileAds.requests == 0 && RewardedAd.requests == 0 && f.ads.canWatch(),
        "failed identity marker persistence blocks consent updates and ads while leaving a retryable action");
    check(SharedPreferences.commits == 2 && f.ads.status().contains("saved"),
        "marker write failure is retried despite SharedPreferences already changing its process-memory value");
    SharedPreferences.failCommit = false; f.ads.watch(); pump(() -> RewardedAd.shows == 1);
    check(UserMessagingPlatform.info.resets == 1 && SharedPreferences.commits == 3
        && UserMessagingPlatform.info.requests == 1,
        "successful persistence retry refreshes consent and completes the original optional Watch without resetting twice");
    f.ads.destroy();

    f = fixture(); SharedPreferences.clear(); UserMessagingPlatform.info.autoUpdate = false; launch(f);
    f.ads.watch(); Handler.advance(25_000);
    check(f.ads.canWatch() && MobileAds.requests == 0 && RewardedAd.requests == 0,
        "a freshly reset identity requires a successful consent refresh before any ad initialization");
    UserMessagingPlatform.info.autoUpdate = true; f.ads.watch(); pump(() -> RewardedAd.shows == 1);
    check(UserMessagingPlatform.info.resets == 1 && UserMessagingPlatform.info.requests == 2,
        "consent refresh failure retries without resetting the migrated test identity again");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; launch(f);
    f.ads.start(); f.ads.onPause(); f.ads.onResume();
    check(UserMessagingPlatform.info.requests == 1 && UserMessagingPlatform.formLoads == 0
        && UserMessagingPlatform.form.shows == 0 && MobileAds.requests == 0 && RewardedAd.requests == 0,
        "required-consent launch and resume remain silent without form loading or ad initialization");
    check(f.ads.canWatch() && !f.ads.isBusy(), "quiet launch refresh leaves the optional Watch action available");
    f.host.autoRelease = false; f.ads.watch();
    check(UserMessagingPlatform.form.shows == 1 && f.host.acquires == 1 && MobileAds.requests == 0,
        "deliberate Watch opens consent only after acquiring the host pause cover");
    f.ads.onPause(); UserMessagingPlatform.form.accept();
    check(f.host.releases == 1 && f.ads.isBusy() && MobileAds.requests == 0,
        "consent dismissal waits for asynchronous host restoration before initializing ads");
    f.host.restore();
    check(MobileAds.requests == 0 && RewardedAd.requests == 0,
        "consent completion while backgrounded cannot start the ad chain before resume");
    f.ads.onResume(); pump(() -> RewardedAd.shows == 1);
    check(f.host.acquires == 2 && f.host.prepares == 1,
        "the original Watch tap continues through consent and host restoration to exactly one ad");
    RewardedAd ad = RewardedAd.last; ad.earn(); ad.earn(); ad.dismiss(); ad.dismiss();
    f.host.restore(); Handler.advance(1_000);
    check(f.host.balance == 10 && f.host.creditCalls == 1 && f.host.releases == 2 && f.host.cancelled == 0,
        "duplicate earned and dismissal callbacks credit ten crystals once and release each cover once");
    check(RewardedAd.requests == 1 && f.ads.canWatch(), "finishing a rewarded ad never preloads or shows another ad");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.autoUpdate = false;
    launch(f); f.ads.watch(); Runnable quietReply = UserMessagingPlatform.info.updateSuccess;
    check(f.ads.isBusy() && RewardedAd.requests == 0, "Watch intent can wait for the quiet startup refresh");
    quietReply.run(); pump(() -> RewardedAd.shows == 1);
    check(UserMessagingPlatform.info.requests == 1 && RewardedAd.shows == 1,
        "a pending Watch uses the existing consent refresh and proceeds without a second tap");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.autoUpdate = false; UserMessagingPlatform.info.required = true;
    launch(f); f.ads.watch(); quietReply = UserMessagingPlatform.info.updateSuccess; f.ads.cancelWatch();
    quietReply.run(); f.ads.onPause(); f.ads.onResume();
    check(UserMessagingPlatform.formLoads == 0 && MobileAds.requests == 0 && f.ads.canWatch(),
        "closing Rewards during consent refresh prevents late forms and resume-driven ad loading");
    f.ads.destroy();

    f = fixture(); launch(f); watch(f); ad = RewardedAd.last; f.ads.watch();
    check(f.host.prepares == 1 && RewardedAd.shows == 1, "double Watch cannot create two durable ad attempts");
    ad.dismiss(); Handler.advance(1_000);
    check(f.host.balance == 0 && f.host.cancelled == 1 && f.ads.canWatch() && RewardedAd.requests == 1,
        "closing before earning cancels the unpaid attempt without preloading");
    f.ads.watch();
    check(RewardedAd.requests == 2 && RewardedAd.shows == 2, "a fresh deliberate Watch starts a new ad after dismissal");
    f.ads.destroy();

    f = fixture(); launch(f); watch(f); ad = RewardedAd.last;
    ad.dismiss(); ad.earn(); Handler.advance(1_000);
    check(f.host.balance == 10 && f.host.cancelled == 0, "queued earned callback after dismissal retains its reward");
    f.ads.destroy();

    f = fixture(); launch(f); watch(f); RewardedAd.last.fail(); Handler.advance(1_000);
    check(f.host.balance == 0 && f.host.cancelled == 1 && f.host.releases == 1 && f.ads.canWatch(),
        "show failure restores interaction and cancels its unpaid identity");
    f.ads.destroy();

    f = fixture(); RewardedAd.autoLoad = false; launch(f); f.ads.watch();
    pump(() -> RewardedAd.requests == 1); RewardedAdLoadCallback lateAd = RewardedAd.loadCallback;
    f.ads.cancelWatch(); lateAd.onAdLoaded(new RewardedAd()); f.ads.onPause(); f.ads.onResume();
    check(RewardedAd.shows == 0 && f.host.acquires == 0 && f.ads.canWatch() && RewardedAd.requests == 1,
        "Rewards closure invalidates a late ad response and resume cannot resurrect it");
    f.ads.watch(); RewardedAd.loadCallback.onAdLoaded(new RewardedAd());
    check(RewardedAd.requests == 2 && RewardedAd.shows == 1, "another tap loads a fresh ad after a cancelled request");
    f.ads.destroy();

    f = fixture(); RewardedAd.autoLoad = false; launch(f); f.ads.watch(); pump(() -> RewardedAd.requests == 1);
    lateAd = RewardedAd.loadCallback; f.ads.onPause(); lateAd.onAdLoaded(new RewardedAd()); f.ads.onResume();
    check(RewardedAd.shows == 0 && f.ads.canWatch(), "backgrounding during an ad request cancels automatic presentation");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; UserMessagingPlatform.autoLoad = false;
    launch(f); f.ads.watch(); Consumer<ConsentForm> lateForm = UserMessagingPlatform.loadSuccess;
    f.ads.cancelWatch(); lateForm.accept(UserMessagingPlatform.form);
    check(UserMessagingPlatform.form.shows == 0 && MobileAds.requests == 0 && f.ads.canWatch(),
        "closing Rewards while consent loads discards the late form without a popup");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; launch(f); f.ads.watch();
    f.ads.cancelWatch(); UserMessagingPlatform.form.accept(); f.ads.onResume();
    check(f.host.releases == 1 && MobileAds.requests == 0 && f.ads.canWatch(),
        "leaving Rewards during a displayed consent form cancels its subsequent ad continuation");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.autoGate = false; f.ads.watch(); gate(f);
    Runnable staleShow = f.host.show; f.ads.cancelWatch(); staleShow.run();
    check(f.host.prepares == 0 && RewardedAd.shows == 0 && f.host.releases == 1 && f.ads.canWatch(),
        "closing Rewards during native pause acquisition ignores the stale show callback");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.rejectGate = true; f.ads.watch(); idle(f);
    check(f.host.prepares == 0 && RewardedAd.shows == 0 && f.host.releases == 1,
        "a rejected native pause gate never opens the ad or reserves a reward");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.rejectGate = true; f.host.autoRelease = false;
    f.ads.watch(); gate(f);
    check(f.ads.isBusy() && f.host.releases == 1, "failed fullscreen acquisition waits for the host's asynchronous release acknowledgement");
    f.host.restore(); f.host.restore();
    check(f.ads.canWatch() && RewardedAd.shows == 0 && f.host.acquires == 1,
        "duplicate release acknowledgement cannot reopen a failed ad intent");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.autoGate = false; f.ads.watch(); gate(f);
    staleShow = f.host.show; f.ads.onPause(); staleShow.run(); f.ads.onResume();
    check(f.ads.canWatch() && f.host.releases == 1 && f.host.prepares == 0 && RewardedAd.shows == 0,
        "backgrounding during fullscreen acquisition cancels its delayed show and restores interaction");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; launch(f); f.ads.watch();
    UserMessagingPlatform.form.dismissed.accept(new FormError());
    check(f.ads.canWatch() && f.host.releases == 1 && MobileAds.requests == 0,
        "consent-show failure releases the cover and cannot continue into an ad");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; launch(f);
    f.host.autoRelease = false; f.ads.watch(); UserMessagingPlatform.form.accept();
    f.ads.cancelWatch(); f.host.restore(); f.ads.onResume();
    check(f.ads.canWatch() && MobileAds.requests == 0 && RewardedAd.shows == 0,
        "closing Rewards while the consent cover restores cancels the pending ad chain");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.autoGate = false; f.ads.watch(); gate(f);
    staleShow = f.host.show; Handler.advance(12_000); staleShow.run();
    check(f.host.prepares == 0 && RewardedAd.shows == 0 && f.host.releases == 1 && f.ads.canWatch(),
        "fullscreen gate timeout releases interaction and rejects a late show");
    f.ads.destroy();

    f = fixture(); RewardedAd.autoLoad = false; launch(f); f.ads.watch(); pump(() -> RewardedAd.requests == 1);
    lateAd = RewardedAd.loadCallback; Handler.advance(25_000); lateAd.onAdLoaded(new RewardedAd());
    check(f.ads.canWatch() && RewardedAd.shows == 0 && f.ads.status().contains("retry"),
        "ad-load timeout ends the intent and rejects the stale successful response");
    f.ads.watch(); RewardedAd.loadCallback.onAdFailedToLoad(new LoadAdError());
    check(f.ads.canWatch() && RewardedAd.requests == 2 && f.host.prepares == 0,
        "no-fill restores a retryable optional action without reserving crystals");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; UserMessagingPlatform.autoLoad = false;
    launch(f); f.ads.watch(); lateForm = UserMessagingPlatform.loadSuccess;
    Handler.advance(25_000); lateForm.accept(UserMessagingPlatform.form);
    check(f.ads.canWatch() && f.host.acquires == 0 && UserMessagingPlatform.form.shows == 0,
        "consent-form timeout does not pause the game or allow a late popup");
    f.ads.watch(); UserMessagingPlatform.loadFailure.accept(new FormError());
    check(f.ads.canWatch() && MobileAds.requests == 0, "consent-form load failure leaves a bounded retry without ad initialization");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.autoUpdate = false; UserMessagingPlatform.info.required = true;
    launch(f); quietReply = UserMessagingPlatform.info.updateSuccess; Handler.advance(25_000); quietReply.run();
    check(f.ads.canWatch() && UserMessagingPlatform.formLoads == 0 && MobileAds.requests == 0,
        "quiet consent timeout and stale completion remain invisible");
    UserMessagingPlatform.info.autoUpdate = true; f.ads.watch();
    check(UserMessagingPlatform.info.requests == 2 && UserMessagingPlatform.form.shows == 1,
        "deliberate Watch retries a failed consent refresh before presenting choices");
    UserMessagingPlatform.info.allowed = false; UserMessagingPlatform.form.accept();
    check(f.ads.canWatch() && MobileAds.requests == 0 && f.host.releases == 1,
        "consent completion without request permission never initializes or requests an ad");
    f.ads.destroy();

    f = fixture(); MobileAds.autoInitialize = false; launch(f); f.ads.watch(); pump(() -> MobileAds.requests == 1);
    Handler.advance(35_000);
    check(f.ads.canWatch() && RewardedAd.requests == 0, "SDK initialization timeout cannot leave Watch permanently busy");
    MobileAds.pending.accept(new Object()); Handler.ready(); f.ads.onResume();
    check(RewardedAd.requests == 0, "late SDK initialization never preloads without a current Watch intent");
    f.ads.watch(); pump(() -> RewardedAd.shows == 1);
    check(MobileAds.requests == 1, "late successful SDK initialization can serve a later deliberate Watch without reinitializing");
    f.ads.destroy();

    f = fixture(); MobileAds.autoInitialize = false; launch(f); f.ads.watch(); pump(() -> MobileAds.requests == 1);
    f.ads.cancelWatch(); MobileAds.pending.accept(new Object()); Handler.ready();
    check(f.ads.canWatch() && RewardedAd.requests == 0, "closing Rewards during SDK initialization prevents later ad loading");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.failCredit = true; watch(f); ad = RewardedAd.last;
    ad.earn(); ad.dismiss(); Handler.advance(1_000); f.ads.watch();
    check(f.host.balance == 0 && f.host.prepares == 1 && RewardedAd.shows == 1 && !f.host.pending.isEmpty(),
        "failed earned-credit retry preserves its proof without replacing it or showing another ad");
    f.host.failCredit = false; f.ads.watch();
    check(f.host.balance == 10 && f.host.pending.isEmpty() && RewardedAd.requests == 1,
        "wallet recovery persists ten crystals without silently requesting another ad");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.failCancel = true; watch(f); RewardedAd.last.dismiss(); Handler.advance(1_000);
    f.ads.watch();
    check(f.host.prepares == 1 && f.host.cancellationCalls == 2 && f.ads.status().contains("clearing"),
        "failed unpaid-attempt cleanup blocks replacing the durable identity");
    f.host.failCancel = false; f.ads.watch();
    check(f.host.pending.isEmpty() && f.host.cancelled == 1 && RewardedAd.requests == 1,
        "cleanup recovery restores optional Watch without starting an unsolicited ad");
    f.ads.destroy();

    f = fixture(); launch(f); UserMessagingPlatform.info.privacyRequired = true; f.ads.showPrivacyOptions();
    check(UserMessagingPlatform.privacyShows == 1 && f.host.acquires == 1 && f.ads.isBusy(),
        "explicit privacy action uses the fullscreen hold without requiring an ad");
    UserMessagingPlatform.info.allowed = false; UserMessagingPlatform.privacyDismiss.accept(null);
    check(f.host.releases == 1 && f.ads.canWatch() && RewardedAd.requests == 0 && MobileAds.requests == 0,
        "privacy-options completion never triggers ad initialization or presentation");
    f.ads.destroy();

    f = fixture(); launch(f); watch(f); f.ads.onPause(); ad = RewardedAd.last; ad.earn(); ad.dismiss();
    f.ads.onResume(); Handler.advance(1_000);
    check(f.host.balance == 10 && f.host.cancelled == 0 && RewardedAd.shows == 1,
        "the SDK ad's own activity pause does not cancel an earned presentation");
    f.ads.destroy();

    f = fixture(); launch(f); f.host.failCredit = true; watch(f); ad = RewardedAd.last; ad.earn();
    String proof = f.host.pending; f.ads.destroy(); ad.dismiss(); ad.earn();
    check(f.host.balance == 0 && f.host.cancelled == 0 && proof.equals(f.host.pending),
        "destruction preserves uncommitted earned proof and ignores stale presentation callbacks");

    f = fixture(); launch(f); watch(f);
    check(f.ads.usingTestAds() && RewardedAd.lastUnit.equals("ca-app-pub-3940256099942544/5224354917"),
        "the test build requests the official sample rewarded unit on a physical-device fixture");
    f.ads.destroy();
    f = fixture(); BuildConfig.ADMOB_TEST_ADS = false; android.os.Build.HARDWARE = "ranchu";
    launch(f); watch(f);
    check(f.ads.usingTestAds() && RewardedAd.lastUnit.equals("ca-app-pub-3940256099942544/5224354917"),
        "emulator detection keeps even a production build on Google's official sample unit");
    f.ads.destroy();
    f = fixture(); BuildConfig.ADMOB_TEST_ADS = false; launch(f); watch(f);
    check(!f.ads.usingTestAds() && RewardedAd.lastUnit.equals(BuildConfig.ADMOB_REWARDED_AD_UNIT_ID),
        "a future physical production build retains the configured publisher unit route");
    f.ads.destroy();
    System.out.println("Actual controller fake-SDK checks passed: " + checks);
  }

}
