package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.util.TypedValue;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Independent campaign launcher, sharing the game's compact monochrome controls. */
final class CampaignSetupView extends FrameLayout {
    interface Actions {
        void start();
        void saves();
        void download();
        void cancel();
        void back();
    }
    private final Typeface face;
    private final CampaignArtwork artwork;
    private final TextView title, detail, status;
    private final Button back, start, download, saves;
    private final ProgressBar progress;
    private final ScrollView scroll;
    private final CampaignContent content;
    private CampaignLandingLayout.Frame frame;
    private int safeLeft, safeTop, safeRight, safeBottom;
    private boolean busy;

    CampaignSetupView(Context context, Actions actions) {
        super(context);
        setBackgroundColor(0xFF000000); setClickable(true);
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        artwork = new CampaignArtwork(context); addView(artwork);
        back = RewardsView.action(context, face, "BACK", false);
        back.setOnClickListener(v -> actions.back()); addView(back);
        title = copy("CAMPAIGN", 24, true); addView(title);
        detail = copy("Recover technology and rebuild.\nFollow the story through Beta and Gamma.", 14, false);
        detail.setTextColor(TowersTheme.SECONDARY);
        status = copy("Checking campaign videos…", 13, false);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        progress = new ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000); progress.setVisibility(GONE);
        download = RewardsView.action(context, face, "DOWNLOAD VIDEOS · 205 MB", false);
        download.setOnClickListener(v -> { if (busy) actions.cancel(); else actions.download(); });
        start = RewardsView.action(context, face, "NEW CAMPAIGN", true);
        start.setEnabled(false); start.setOnClickListener(v -> actions.start());
        saves = RewardsView.action(context, face, "CONTINUE", false);
        saves.setOnClickListener(v -> actions.saves());
        content = new CampaignContent(context);
        for (android.view.View child : new android.view.View[]{detail, status, progress, download, start, saves})
            content.addView(child);
        scroll = new ScrollView(context); scroll.setFillViewport(true); scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(true); scroll.setScrollbarFadingEnabled(true);
        scroll.setContentDescription("Campaign details and actions; scroll when needed");
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2)); addView(scroll);
        setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                        android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                    left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                    top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                    right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                    bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            if (safeLeft != left || safeTop != top || safeRight != right || safeBottom != bottom) {
                safeLeft = left; safeTop = top; safeRight = right; safeBottom = bottom; requestLayout();
            }
            return insets;
        });
    }

    void update(boolean ready, boolean working, long bytes, String phase, String error) {
        busy = working;
        start.setEnabled(ready && !working); start.setAlpha(start.isEnabled() ? 1f : .45f);
        saves.setEnabled(!working);
        download.setVisibility(ready ? GONE : VISIBLE);
        download.setEnabled(!"checking".equals(phase));
        download.setText(working ? "CANCEL DOWNLOAD" : "DOWNLOAD VIDEOS · 205 MB");
        progress.setVisibility(working ? VISIBLE : GONE);
        progress.setIndeterminate("checking".equals(phase) || "verifying".equals(phase) || "installing".equals(phase));
        progress.setProgress((int) Math.min(1000, Math.max(0, bytes * 1000 / 215283360L)));
        String message = ready ? "Videos ready · Play offline"
                : "checking".equals(phase) ? "Checking campaign videos…"
                : "verifying".equals(phase) ? "Verifying download…"
                : "installing".equals(phase) ? "Installing campaign videos…"
                : working ? "Downloading videos · " + (bytes * 100 / 215283360L) + "%"
                : "Campaign videos are required · allow 500 MB of free space.";
        status.setText(error == null || error.isEmpty() ? message : error);
        content.requestLayout();
    }
    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec), height = MeasureSpec.getSize(heightSpec);
        int availableWidth = Math.max(1, width - safeLeft - safeRight), availableHeight = Math.max(0, height - safeTop - safeBottom);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24); back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.measure(MeasureSpec.makeMeasureSpec(availableWidth, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(availableHeight, MeasureSpec.AT_MOST));
        int backWidth = Math.max(dp(80), (int) Math.ceil(back.getPaint().measureText("BACK")) + dp(24));
        frame = CampaignLandingLayout.frame(availableWidth, availableHeight,
                getResources().getDisplayMetrics().density, backWidth, title.getMeasuredHeight());
        exact(back, frame.back.width, frame.back.height); exact(artwork, frame.artwork.width, frame.artwork.height);
        content.viewportHeight = frame.body.height;
        exact(scroll, frame.body.width, frame.body.height);
        setMeasuredDimension(width, height);
    }
    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        if (frame == null) return;
        place(artwork, frame.artwork, safeLeft, safeTop); place(back, frame.back, safeLeft, safeTop);
        title.layout(safeLeft + frame.title.left, safeTop + frame.title.top,
                safeLeft + frame.title.left + title.getMeasuredWidth(), safeTop + frame.title.top + title.getMeasuredHeight());
        place(scroll, frame.body, safeLeft, safeTop);
    }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); requestApplyInsets(); }

    private final class CampaignContent extends FrameLayout {
        int viewportHeight;
        CampaignLandingLayout.Body layout;
        CampaignContent(Context context) { super(context); }
        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = Math.max(1, MeasureSpec.getSize(widthSpec));
            detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13); download.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            start.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14); saves.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            for (TextView text : new TextView[]{detail, status}) text.measure(
                    MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
            int startWidth = Math.max(dp(144), (int) Math.ceil(start.getPaint().measureText(start.getText().toString())) + dp(24));
            int savesWidth = Math.max(dp(120), (int) Math.ceil(saves.getPaint().measureText(saves.getText().toString())) + dp(24));
            int downloadWidth = (int) Math.ceil(download.getPaint().measureText(download.getText().toString())) + dp(24);
            int fontHeight = Math.max(start.getPaint().getFontMetricsInt(null), saves.getPaint().getFontMetricsInt(null));
            layout = CampaignLandingLayout.body(width, viewportHeight, getResources().getDisplayMetrics().density,
                    detail.getMeasuredHeight(), status.getMeasuredHeight(),
                    progress.getVisibility() == VISIBLE, download.getVisibility() == VISIBLE,
                    downloadWidth, startWidth, savesWidth, fontHeight);
            exact(start, layout.start.width, layout.start.height); exact(saves, layout.saves.width, layout.saves.height);
            if (progress.getVisibility() == VISIBLE) exact(progress, layout.progress.width, layout.progress.height);
            if (download.getVisibility() == VISIBLE) exact(download, layout.download.width, layout.download.height);
            setMeasuredDimension(width, layout.height);
        }
        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            if (layout == null) return;
            place(detail, layout.detail, 0, 0); place(status, layout.status, 0, 0);
            place(start, layout.start, 0, 0); place(saves, layout.saves, 0, 0);
            if (progress.getVisibility() == VISIBLE) place(progress, layout.progress, 0, 0);
            if (download.getVisibility() == VISIBLE) place(download, layout.download, 0, 0);
        }
    }

    private final class CampaignArtwork extends ImageView {
        final Paint mask = new Paint(Paint.ANTI_ALIAS_FLAG);
        int sample, maskWidth, maskHeight;
        CampaignArtwork(Context context) {
            super(context); setScaleType(ScaleType.CENTER_CROP); setCropToPadding(true);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = Math.max(1, MeasureSpec.getSize(widthSpec)), height = Math.max(1, MeasureSpec.getSize(heightSpec));
            int next = 1; while (1691 / (next * 2) >= width && 930 / (next * 2) >= height) next *= 2;
            if (sample != next) {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = next; options.inScaled = false;
                options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                setImageBitmap(BitmapFactory.decodeResource(getResources(), R.drawable.home_portrait_campaign_083, options)); sample = next;
            }
            super.onMeasure(widthSpec, heightSpec);
        }
        @Override protected void onDraw(Canvas canvas) {
            int layer = canvas.saveLayer(0, 0, getWidth(), getHeight(), null);
            super.onDraw(canvas);
            mask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
            mask.setShader(new LinearGradient(0, 0, getWidth(), 0,
                    new int[]{0x00FFFFFF, 0xFFFFFFFF, 0xFFFFFFFF}, new float[]{0, .52f, 1}, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, getWidth(), getHeight(), mask);
            mask.setShader(new LinearGradient(0, 0, 0, getHeight(),
                    new int[]{0x00FFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0x00FFFFFF}, new float[]{0, .10f, .78f, 1}, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, getWidth(), getHeight(), mask);
            canvas.restoreToCount(layer);
        }
    }
    private TextView copy(String value, int size, boolean displayFace) {
        TextView text = new TextView(getContext()); text.setText(value); text.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        text.setTextColor(TowersTheme.TEXT); text.setIncludeFontPadding(false); if (displayFace) text.setTypeface(face); return text;
    }
    private static void exact(android.view.View view, int width, int height) {
        view.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }
    private static void place(android.view.View view, CampaignLandingLayout.Box box, int left, int top) {
        view.layout(left + box.left, top + box.top, left + box.right(), top + box.bottom());
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
