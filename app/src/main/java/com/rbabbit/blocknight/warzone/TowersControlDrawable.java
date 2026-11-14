package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;

/** The selected soft rectangular control; its touch bounds never move under a press. */
final class TowersControlDrawable extends Drawable {
    private final GradientDrawable face = new GradientDrawable();
    private final Paint edgePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF edgeBounds = new RectF();
    private final boolean primary;
    private final float radius, edgeWidth;
    private int alpha = 255;
    private boolean enabled = true, pressed, selected, focused;
    private ColorFilter colourFilter;

    TowersControlDrawable(Context context, int fill, int radiusDp) {
        primary = fill == TowersTheme.PRIMARY;
        float density = context.getResources().getDisplayMetrics().density;
        // Even formerly transparent tabs share the selected soft rectangular shape.
        radius = 6 * density;
        edgeWidth = Math.max(1f, .75f * density);
        face.setOrientation(GradientDrawable.Orientation.TOP_BOTTOM);
        face.setCornerRadius(radius);
        edgePaint.setStyle(Paint.Style.STROKE);
        edgePaint.setStrokeWidth(edgeWidth);
    }

    @Override protected void onBoundsChange(Rect bounds) {
        face.setBounds(bounds);
        edgeBounds.set(bounds.left + edgeWidth / 2, bounds.top + edgeWidth / 2,
                bounds.right - edgeWidth / 2, bounds.bottom - edgeWidth / 2);
    }

    @Override public void draw(Canvas canvas) {
        boolean light = primary || selected;
        if (!enabled) face.setColors(light ? new int[] {0xFFC2C2C2, 0xFFB5B5B5}
                : new int[] {0xFF252525, 0xFF1F1F1F});
        else if (pressed) face.setColors(new int[] {0xFF151515, 0xFF181818});
        else face.setColors(light ? new int[] {0xFFFAFAFA, TowersTheme.PRIMARY}
                : new int[] {0xFF2D2D2D, TowersTheme.CONTROL});
        face.setAlpha(alpha);
        face.setColorFilter(colourFilter);
        face.draw(canvas);
        edgePaint.setColor(light && !pressed ? 0xFFE4E4E4 : focused ? 0xFFBCBCBC : 0xFF404040);
        edgePaint.setAlpha(alpha);
        edgePaint.setColorFilter(colourFilter);
        canvas.drawRoundRect(edgeBounds, Math.max(0, radius - edgeWidth / 2),
                Math.max(0, radius - edgeWidth / 2), edgePaint);
    }

    @Override public boolean isStateful() { return true; }

    @Override protected boolean onStateChange(int[] states) {
        boolean nextEnabled = false, nextPressed = false, nextSelected = false, nextFocused = false;
        for (int state : states) {
            if (state == android.R.attr.state_enabled) nextEnabled = true;
            if (state == android.R.attr.state_pressed) nextPressed = true;
            if (state == android.R.attr.state_focused) nextFocused = true;
            if (state == android.R.attr.state_selected || state == android.R.attr.state_checked) nextSelected = true;
        }
        boolean changed = enabled != nextEnabled || pressed != nextPressed
                || selected != nextSelected || focused != nextFocused;
        enabled = nextEnabled; pressed = nextPressed; selected = nextSelected; focused = nextFocused;
        if (changed) invalidateSelf();
        return changed;
    }

    @Override public void getOutline(Outline outline) { outline.setRoundRect(getBounds(), radius); }
    @Override public void setAlpha(int value) { alpha = Math.max(0, Math.min(255, value)); invalidateSelf(); }
    @Override public int getAlpha() { return alpha; }
    @Override public void setColorFilter(ColorFilter filter) { colourFilter = filter; invalidateSelf(); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
