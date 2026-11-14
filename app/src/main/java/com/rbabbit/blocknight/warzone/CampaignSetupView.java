package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Campaign is an independent route; Towers' selected map and rules stay intact. */
final class CampaignSetupView extends FrameLayout {
  interface Actions {
    void start();
    void saves();
    void download();
    void cancel();
    void back();
  }

  private final TextView status;
  private final Button start, download, saves;
  private final ProgressBar progress;
  private boolean busy;

  CampaignSetupView(Context context, Actions actions) {
    super(context);
    setBackgroundColor(TowersTheme.BACKGROUND);
    setClickable(true);
    Typeface face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
    ScrollView scroll = new ScrollView(context);
    scroll.setFillViewport(true);
    scroll.setOverScrollMode(OVER_SCROLL_NEVER);
    addView(scroll, new LayoutParams(-1, -1));
    LinearLayout panel = new LinearLayout(context);
    panel.setOrientation(LinearLayout.VERTICAL);
    panel.setPadding(dp(28), dp(12), dp(28), dp(16));
    scroll.addView(panel, new ScrollView.LayoutParams(-1, -2));
    LinearLayout header = new LinearLayout(context);
    header.setGravity(Gravity.CENTER_VERTICAL);
    TextView title = copy("CAMPAIGN", 24);
    title.setTypeface(face);
    header.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));
    Button back = RewardsView.action(context, face, "BACK", false);
    back.setOnClickListener(v -> actions.back());
    header.addView(back, new LinearLayout.LayoutParams(dp(88), dp(48)));
    panel.addView(header);
    TextView description = copy("The original Warzone 2100 campaign", 17);
    description.setPadding(0, dp(8), 0, dp(4));
    panel.addView(description);
    TextView detail = copy("Start with Alpha. Recover technology, follow mission objectives and continue through Beta and Gamma. Towers remains available separately.", 13);
    detail.setTextColor(TowersTheme.SECONDARY);
    panel.addView(detail);
    status = copy("Checking campaign videos…", 13);
    status.setPadding(0, dp(14), 0, dp(6));
    status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
    panel.addView(status);
    progress = new ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal);
    progress.setMax(1000);
    panel.addView(progress, new LinearLayout.LayoutParams(-1, dp(5)));
    LinearLayout content = new LinearLayout(context);
    content.setGravity(Gravity.CENTER_VERTICAL);
    download = RewardsView.action(context, face, "DOWNLOAD VIDEOS · 205 MB", false);
    download.setTextSize(13);
    download.setOnClickListener(v -> { if (busy) actions.cancel(); else actions.download(); });
    LinearLayout.LayoutParams install = new LinearLayout.LayoutParams(-2, dp(48));
    install.topMargin = dp(8);
    content.addView(download, install);
    panel.addView(content);
    LinearLayout buttons = new LinearLayout(context);
    start = RewardsView.action(context, face, "NEW CAMPAIGN", true);
    start.setTextSize(14);
    start.setEnabled(false);
    start.setOnClickListener(v -> actions.start());
    buttons.addView(start, new LinearLayout.LayoutParams(dp(168), dp(48)));
    saves = RewardsView.action(context, face, "CONTINUE", false);
    saves.setTextSize(14);
    saves.setOnClickListener(v -> actions.saves());
    LinearLayout.LayoutParams resume = new LinearLayout.LayoutParams(dp(128), dp(48));
    resume.leftMargin = dp(10);
    buttons.addView(saves, resume);
    LinearLayout.LayoutParams controls = new LinearLayout.LayoutParams(-1, -2);
    controls.topMargin = dp(14);
    panel.addView(buttons, controls);
    TextView offline = copy("Download once, then play offline. Campaign saves are stored on this phone.", 12);
    offline.setTextColor(TowersTheme.SECONDARY);
    offline.setPadding(0, dp(10), 0, 0);
    panel.addView(offline);
  }

  void update(boolean ready, boolean working, long bytes, String phase, String error) {
    busy = working;
    start.setEnabled(ready && !working);
    start.setAlpha(start.isEnabled() ? 1f : .45f);
    saves.setEnabled(!working);
    download.setVisibility(ready ? GONE : VISIBLE);
    download.setEnabled(!"checking".equals(phase));
    download.setText(working ? "CANCEL DOWNLOAD" : "DOWNLOAD VIDEOS · 205 MB");
    progress.setVisibility(working ? VISIBLE : GONE);
    progress.setIndeterminate("checking".equals(phase) || "verifying".equals(phase) || "installing".equals(phase));
    progress.setProgress((int) Math.min(1000, Math.max(0, bytes * 1000 / 215283360L)));
    String message = ready ? "Campaign videos ready · offline playback available"
        : "checking".equals(phase) ? "Checking campaign videos…"
        : "verifying".equals(phase) ? "Verifying download…"
        : "installing".equals(phase) ? "Installing campaign videos…"
        : working ? "Downloading videos · " + (bytes * 100 / 215283360L) + "%"
        : "Campaign videos are required · allow 500 MB of free space.";
    status.setText(error == null || error.isEmpty() ? message : error);
  }

  private TextView copy(String text, int size) {
    TextView view = new TextView(getContext());
    view.setText(text);
    view.setTextSize(size);
    view.setTextColor(TowersTheme.TEXT);
    view.setIncludeFontPadding(false);
    return view;
  }
  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
