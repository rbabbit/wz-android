package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.os.Handler;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentForm;
import com.google.android.ump.UserMessagingPlatform;
import java.util.HashSet;
import java.util.Set;

final class RewardedAdsCheck029 {
  private static int checks;
  static final class Host implements RewardedAdsController.Host {
    int changes, acquires, releases, prepares, balance, creditCalls, cancelled, cancellationCalls;
    boolean autoGate = true, rejectGate, failCredit, failCancel;
    Runnable show, cancel;
    String pending = "";
    final Set<String> paid = new HashSet<>();
    public void onAdsChanged() { changes++; }
    public void acquireFullScreen(Runnable show, Runnable cancel) {
      acquires++; this.show = show; this.cancel = cancel;
      if (rejectGate) cancel.run(); else if (autoGate) show.run();
    }
    public void releaseFullScreen() { releases++; }
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
    // Settle the prior controller's one initialization worker before replacing
    // global fake SDK state. Never mistake a fixture reset race for an app bug.
    for (Thread thread : Thread.getAllStackTraces().keySet())
      if (thread.getName().equals("Towers-ad-initialize")) thread.join(1_000);
    Handler.clear(); RewardedAd.reset(); UserMessagingPlatform.reset();
    Host host = new Host();
    return new Fixture(new RewardedAdsController(new Activity(), host), host);
  }
  static void ready(Fixture f) throws Exception {
    f.ads.start(); f.ads.onResume();
    for (int i = 0; i < 100 && (RewardedAd.requests == 0 || f.ads.isBusy()); i++) {
      Thread.sleep(5); Handler.ready();
    }
    require(RewardedAd.requests > 0 && f.ads.canWatch(), "fixture loaded an ad");
  }
  static void check(boolean condition, String name) {
    require(condition, name); checks++; System.out.println("PASS " + name);
  }
  static void require(boolean condition, String name) {
    if (!condition) throw new AssertionError(name);
  }

  public static void main(String[] args) throws Exception {
    Fixture f = fixture(); ready(f);
    check(f.ads.usingTestAds() && RewardedAd.shows == 0, "preloading and consent never automatically show an ad");
    check(RewardedAd.lastUnit.equals("ca-app-pub-3940256099942544/5224354917"),
        "development builds request the official rewarded sample unit");
    f.ads.watch(); RewardedAd ad = RewardedAd.last;
    check(f.host.prepares == 1 && RewardedAd.shows == 1, "one durable presentation identity before show");
    f.ads.watch();
    check(f.host.prepares == 1 && RewardedAd.shows == 1, "double watch is ignored during presentation");
    ad.earn(); ad.earn();
    check(f.host.balance == 10 && f.host.creditCalls == 1, "duplicate earned callbacks credit exactly ten once");
    ad.dismiss(); ad.dismiss(); Handler.advance(1_000);
    check(f.host.balance == 10 && f.host.releases == 1 && f.host.cancelled == 0,
        "duplicate dismissal releases once and never cancels earned reward");
    f.ads.destroy();

    BuildConfig.ADMOB_TEST_ADS = false;
    f = fixture(); android.os.Build.HARDWARE = "ranchu"; ready(f);
    check(f.ads.usingTestAds() && RewardedAd.lastUnit.equals("ca-app-pub-3940256099942544/5224354917"),
        "delivery build on emulator requests official sample without live publisher traffic");
    f.ads.destroy(); android.os.Build.HARDWARE = "physical";
    f = fixture(); ready(f);
    check(!f.ads.usingTestAds() && RewardedAd.lastUnit.equals(BuildConfig.ADMOB_REWARDED_AD_UNIT_ID),
        "physical delivery devices retain the configured publisher rewarded unit");
    f.ads.destroy(); BuildConfig.ADMOB_TEST_ADS = true;

    f = fixture(); ready(f); f.ads.watch(); ad = RewardedAd.last; f.host.failCancel = true;
    ad.dismiss(); Handler.advance(1_000);
    int cancellationRequests = RewardedAd.requests;
    check(!f.host.pending.isEmpty() && f.ads.canWatch() && f.ads.status().contains("clearing"),
        "failed cancellation retains the unpaid identity and exposes a retry");
    f.ads.watch();
    check(f.host.prepares == 1 && RewardedAd.requests == cancellationRequests && f.host.cancellationCalls == 2,
        "cancellation retry cannot prepare another ad while prior wallet write fails");
    f.host.failCancel = false; f.ads.watch();
    check(f.host.pending.isEmpty() && f.host.cancelled == 1 && f.host.balance == 0 && RewardedAd.shows == 1,
        "cancellation retry clears durable identity without awarding or auto-showing");
    f.ads.watch();
    check(f.host.prepares == 2 && RewardedAd.shows == 2,
        "a fresh optional ad can be watched after cancellation storage recovers");
    f.ads.destroy();

    f = fixture(); ready(f); f.ads.watch(); ad = RewardedAd.last;
    ad.dismiss(); Handler.advance(1_000);
    check(f.host.balance == 0 && f.host.cancelled == 1 && f.ads.canWatch(), "early close cancels unpaid identity and permits another attempt");
    f.ads.destroy();

    f = fixture(); ready(f); f.ads.watch(); ad = RewardedAd.last;
    ad.dismiss(); ad.earn(); Handler.advance(1_000);
    check(f.host.balance == 10 && f.host.cancelled == 0, "queued earned after dismissal settles without losing reward");
    f.ads.destroy();

    f = fixture(); ready(f); f.ads.watch(); ad = RewardedAd.last;
    ad.fail(); Handler.advance(1_000);
    check(f.host.balance == 0 && f.host.cancelled == 1 && f.host.releases == 1, "show failure restores hold and gives no crystals");
    f.ads.destroy();

    f = fixture(); ready(f); f.host.rejectGate = true; f.ads.watch();
    check(f.host.prepares == 0 && RewardedAd.shows == 0 && f.host.releases == 1,
        "failed gameplay pause never opens ad or prepares wallet attempt");
    f.ads.destroy();

    f = fixture(); ready(f); f.host.autoGate = false; f.ads.watch();
    Runnable staleShow = f.host.show;
    Handler.advance(12_000); staleShow.run();
    check(f.host.prepares == 0 && RewardedAd.shows == 0 && f.host.releases == 1 && f.ads.canWatch(),
        "expired fullscreen gate ignores late show and restores interaction");
    f.ads.destroy();

    f = fixture(); RewardedAd.autoLoad = false;
    f.ads.start(); f.ads.onResume();
    for (int i = 0; i < 100 && RewardedAd.requests == 0; i++) { Thread.sleep(5); Handler.ready(); }
    RewardedAdLoadCallback lateAd = RewardedAd.loadCallback;
    Handler.advance(25_000);
    check(f.ads.canWatch() && f.ads.status().contains("retry"), "ad loading timeout is bounded and retryable");
    lateAd.onAdLoaded(new RewardedAd()); f.ads.watch();
    check(RewardedAd.requests == 2 && RewardedAd.shows == 0, "late ad response is ignored and retry starts a fresh load");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.autoUpdate = false; UserMessagingPlatform.info.required = true;
    f.ads.start(); f.ads.onResume(); Runnable lateConsent = UserMessagingPlatform.info.updateSuccess;
    Handler.advance(25_000);
    check(f.ads.canWatch() && MobileAds.requests == 0 && RewardedAd.requests == 0,
        "consent timeout does not initialize or request ads without UMP permission");
    UserMessagingPlatform.info.required = true; lateConsent.run();
    check(UserMessagingPlatform.loadSuccess == null && f.host.acquires == 0, "late consent update cannot open a surprise form");
    UserMessagingPlatform.info.autoUpdate = true; f.ads.watch();
    check(UserMessagingPlatform.info.requests == 2 && UserMessagingPlatform.form.shows == 1,
        "explicit consent retry can recover and present gated choices");
    UserMessagingPlatform.form.accept(); f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true; UserMessagingPlatform.autoLoad = false;
    f.ads.start(); f.ads.onResume();
    java.util.function.Consumer<ConsentForm> lateForm = UserMessagingPlatform.loadSuccess;
    Handler.advance(25_000); lateForm.accept(UserMessagingPlatform.form);
    check(f.ads.canWatch() && f.host.acquires == 0 && UserMessagingPlatform.form.shows == 0,
        "form loading timeout ignores late form without pausing gameplay");
    f.ads.destroy();

    f = fixture(); UserMessagingPlatform.info.required = true;
    f.ads.start();
    check(UserMessagingPlatform.form.shows == 0 && f.host.acquires == 0, "background startup defers consent presentation");
    f.ads.onResume();
    check(UserMessagingPlatform.form.shows == 1 && f.host.acquires == 1 && MobileAds.requests == 0,
        "foreground consent holds gameplay before showing and blocks ads until chosen");
    f.ads.onPause(); UserMessagingPlatform.form.accept(); f.ads.onResume();
    for (int i = 0; i < 100 && RewardedAd.requests == 0; i++) { Thread.sleep(5); Handler.ready(); }
    check(f.host.releases == 1 && RewardedAd.requests > 0 && RewardedAd.shows == 0,
        "consent dismissal releases hold and only preloads ads");
    f.ads.destroy();

    f = fixture(); ready(f); f.host.failCredit = true; f.ads.watch(); ad = RewardedAd.last;
    ad.earn(); ad.dismiss(); Handler.advance(1_000);
    int previousRequests = RewardedAd.requests;
    check(f.host.balance == 0 && !f.host.pending.isEmpty() && f.ads.status().contains("save") && f.ads.canWatch(),
        "failed earned write retains same proof for an explicit retry");
    f.ads.watch();
    check(f.host.prepares == 1 && RewardedAd.requests == previousRequests && f.host.balance == 0,
        "failed credit retry cannot start another ad or replace earned proof");
    f.host.failCredit = false; f.ads.watch();
    check(f.host.prepares == 1 && f.host.balance == 10 && RewardedAd.shows == 1,
        "successful credit retry pays once and never silently shows next ad");
    f.ads.destroy();
    check(f.host.balance == 10 && f.host.cancelled == 0 && f.host.pending.isEmpty(),
        "disposal preserves an already persisted reward");

    f = fixture(); ready(f); f.host.failCredit = true; f.ads.watch(); ad = RewardedAd.last; ad.earn();
    String pending = f.host.pending;
    f.ads.destroy(); ad.dismiss(); ad.earn();
    check(f.host.cancelled == 0 && pending.equals(f.host.pending) && f.host.balance == 0,
        "disposal never cancels earned proof or acts on stale SDK callbacks");

    f = fixture(); ready(f); UserMessagingPlatform.info.privacyRequired = true;
    f.ads.showPrivacyOptions();
    check(f.host.acquires == 1 && f.ads.isBusy() && f.ads.privacyRequired(), "privacy choices acquire the same full-screen hold");
    UserMessagingPlatform.info.allowed = false; UserMessagingPlatform.privacyDismiss.accept(null);
    check(f.host.releases == 1 && f.ads.canWatch() && RewardedAd.shows == 0,
        "privacy change discards old ad and restores interaction without automatic show");
    f.ads.destroy();

    System.out.println("Actual controller fake-SDK checks passed: " + checks);
  }
}
