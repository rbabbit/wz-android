package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.IOException;
import java.io.InputStream;

/** Selected start/defeat artwork with real scalable native text. */
final class BattleBriefingView extends FrameLayout {
    private final TextView caption;
    private long duration, shown, lastTick;
    private boolean drawn, cancelled;
    private Runnable finished;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (cancelled || !drawn) return;
            long now = SystemClock.uptimeMillis();
            if (hasWindowFocus() && getWindowVisibility() == VISIBLE) shown += now - lastTick;
            lastTick = now;
            if (shown >= duration) {
                Runnable done = finished; finished = null;
                if (done != null) done.run();
            } else postDelayed(this, 50);
        }
    };

    BattleBriefingView(Context context, boolean destroyed) {
        super(context);
        setBackgroundColor(TowersTheme.BACKGROUND);
        setClickable(true);
        setFocusableInTouchMode(true);
        ImageView image = new ImageView(context);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        String asset = "warzone/ui/briefing-" + (destroyed ? "defeat" : "start") + ".png";
        try (InputStream input = context.getAssets().open(asset)) {
            image.setImageBitmap(BitmapFactory.decodeStream(input));
        } catch (IOException error) { throw new IllegalStateException("Briefing artwork unavailable", error); }
        addView(image, new LayoutParams(-1, -1));
        caption = new TextView(context);
        caption.setText(destroyed ? "Your Command Centre was Destroyed" : "Protect Your Command Centre");
        caption.setTextColor(TowersTheme.TEXT);
        caption.setBackgroundColor(TowersTheme.PANEL);
        caption.setTypeface(Typeface.create("sans-serif-condensed", Typeface.NORMAL));
        caption.setGravity(Gravity.CENTER);
        caption.setIncludeFontPadding(false);
        caption.setMaxLines(2);
        caption.setAutoSizeTextTypeUniformWithConfiguration(18, destroyed ? 26 : 28, 1, TypedValue.COMPLEX_UNIT_SP);
        caption.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        addView(caption, new LayoutParams(-1, -2));
    }

    void showFor(long milliseconds, Runnable done) {
        duration = milliseconds; finished = done;
        if (drawn) { lastTick = SystemClock.uptimeMillis(); post(tick); }
        requestFocus();
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        super.onMeasure(widthSpec, heightSpec);
        // Measure the complete label before layout, including the first frame.
        caption.measure(MeasureSpec.makeMeasureSpec(Math.round(getMeasuredWidth() * .90f), MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(Math.round(getMeasuredHeight() * .14f), MeasureSpec.EXACTLY));
    }

    @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        super.onLayout(changed, left, top, right, bottom);
        int width = right - left, height = bottom - top;
        int x = (width - caption.getMeasuredWidth()) / 2;
        int y = Math.round(height * .858f) - caption.getMeasuredHeight() / 2;
        caption.layout(x, y, x + caption.getMeasuredWidth(), y + caption.getMeasuredHeight());
    }

    @Override protected void dispatchDraw(Canvas canvas) {
        super.dispatchDraw(canvas);
        if (!drawn) {
            drawn = true; lastTick = SystemClock.uptimeMillis();
            if (finished != null) post(tick);
        }
    }

    void cancel() {
        cancelled = true; finished = null; removeCallbacks(tick); animate().cancel();
    }

    @Override protected void onDetachedFromWindow() { cancel(); super.onDetachedFromWindow(); }
}
