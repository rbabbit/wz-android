package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/** The selected grey tank on Towers Home; original artwork remains for Duel. */
final class WarzoneSplashView extends FrameLayout {
    private static Bitmap artwork;
    private static Bitmap towersArtwork;
    private final View scene;
    private final ImageView logo;
    private final TextView subtitle;

    WarzoneSplashView(Context context) {
        this(context, false);
    }

    WarzoneSplashView(Context context, boolean monochrome) {
        super(context);
        setBackgroundColor(monochrome ? TowersTheme.BACKGROUND : 0xFF0B151B);
        if (!monochrome && artwork == null) {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inScaled = false;
            artwork = BitmapFactory.decodeResource(
                    getResources(), R.drawable.warzone_official_backdrop, options);
        }
        if (monochrome && towersArtwork == null) {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inScaled = false;
            towersArtwork = BitmapFactory.decodeResource(
                    getResources(), R.drawable.towers_home_grey_tank, options);
        }

        scene = new View(context) {
            private final Paint art = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            private final Paint mask = new Paint();
            private final RectF bounds = new RectF();

            {
                ColorMatrix colour = new ColorMatrix();
                colour.setSaturation(.62f);
                colour.postConcat(new ColorMatrix(new float[] {
                        .76f, 0, 0, 0, 0,
                        0, .88f, 0, 0, 0,
                        0, 0, .98f, 0, 3,
                        0, 0, 0, 1, 0
                }));
                if (!monochrome) art.setColorFilter(new ColorMatrixColorFilter(colour));
                mask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
            }

            @Override protected void onSizeChanged(int w, int h, int oldW, int oldH) {
                super.onSizeChanged(w, h, oldW, oldH);
                if (monochrome) {
                    // Match LaunchPanel's existing left control footprint. The
                    // whole transparent asset fits right of it, below the logo.
                    int contentHeight = Math.max(0, h - dp(48));
                    int outer = dp(contentHeight < dp(320) ? 8 : 16);
                    int panelWidth = Math.max(0, Math.min(w - outer * 2,
                            Math.min(dp(480), Math.max(dp(320), Math.round(w * .50f)))));
                    int panelLeft = Math.max(outer,
                            Math.min(Math.round(w * .047f), w - outer - panelWidth));
                    float safeLeft = panelLeft + panelWidth + dp(12);
                    float safeRight = w - dp(14);
                    int logoHeight = Math.min(dp(86), Math.max(dp(46), Math.round(h * .17f)));
                    float subtitleHeight = subtitle == null ? dp(16)
                            : subtitle.getPaint().getFontSpacing();
                    float safeTop = Math.max(h * .36f,
                            dp(16) + logoHeight + dp(4) + subtitleHeight + dp(14));
                    float safeBottom = Math.min(h * .91f, h - dp(28));
                    if (towersArtwork == null || safeRight <= safeLeft || safeBottom <= safeTop) {
                        bounds.setEmpty();
                    } else {
                        float scale = Math.min((safeRight - safeLeft) / towersArtwork.getWidth(),
                                (safeBottom - safeTop) / towersArtwork.getHeight());
                        float imageWidth = towersArtwork.getWidth() * scale;
                        float imageHeight = towersArtwork.getHeight() * scale;
                        float left = safeLeft + (safeRight - safeLeft - imageWidth) / 2f;
                        bounds.set(left, safeBottom - imageHeight, left + imageWidth, safeBottom);
                    }
                    return;
                }
                // Integral layer bounds prevent partially clipped edge pixels in HWUI.
                float size = Math.round(Math.min(h * .98f, w * .68f));
                float left = Math.round(w - size - dp(10));
                float top = Math.round(h - size - dp(4));
                bounds.set(left, top, left + size, top + size);
                mask.setShader(new LinearGradient(left, 0, left + size, 0,
                        new int[] {0x00FFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0x00FFFFFF},
                        new float[] {0, .18f, .90f, 1}, Shader.TileMode.CLAMP));
            }

            @Override protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                if (monochrome) {
                    if (towersArtwork != null && !bounds.isEmpty()) {
                        // Native alpha retains the neutral contact shadow without
                        // a coloured rectangle, colour filter or clipping mask.
                        canvas.drawBitmap(towersArtwork, null, bounds, art);
                    }
                    return;
                }
                if (artwork == null || bounds.isEmpty()) return;
                int layer = canvas.saveLayer(bounds, null);
                canvas.drawBitmap(artwork, null, bounds, art);
                // Cover the whole layer so partial edge pixels cannot retain a bright seam.
                canvas.drawRect(0, 0, getWidth(), getHeight(), mask);
                canvas.restoreToCount(layer);
            }
        };
        scene.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(scene, new LayoutParams(-1, -1));

        logo = new ImageView(context);
        logo.setImageResource(R.drawable.warzone_official_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription("Warzone 2100");
        addView(logo, new LayoutParams(1, 1, Gravity.TOP | Gravity.END));

        subtitle = new TextView(context);
        subtitle.setText("WARZONE TOWERS");
        subtitle.setTextSize(10);
        subtitle.setTextColor(monochrome ? TowersTheme.TEXT : 0xFFF0C27B);
        subtitle.setLetterSpacing(.08f);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setIncludeFontPadding(false);
        addView(subtitle, new LayoutParams(-2, -2, Gravity.TOP | Gravity.END));
    }

    /** Result sheets replace the decorative tank, rather than cutting through it. */
    void setArtworkVisible(boolean visible) {
        scene.setVisibility(visible ? VISIBLE : INVISIBLE);
    }

    void setSubtitleVisible(boolean visible) {
        subtitle.setVisibility(visible ? VISIBLE : GONE);
    }

    @Override protected void onMeasure(int width, int height) {
        int h = MeasureSpec.getSize(height);
        int logoHeight = Math.min(dp(86), Math.max(dp(46), Math.round(h * .17f)));
        LayoutParams p = (LayoutParams) logo.getLayoutParams();
        p.height = logoHeight;
        p.width = Math.round(logoHeight * 490f / 226f);
        p.topMargin = dp(16);
        p.rightMargin = dp(26);
        LayoutParams s = (LayoutParams) subtitle.getLayoutParams();
        s.width = p.width;
        s.topMargin = p.topMargin + logoHeight + dp(4);
        s.rightMargin = p.rightMargin;
        super.onMeasure(width, height);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
