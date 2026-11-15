package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.LruCache;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Native horizontally snapping cards, showing the actual map preview PNGs. */
final class MapPreviewPager extends HorizontalScrollView {
    interface Selection { void selected(MapLevelCatalog.Level level); }
    private static final LruCache<String, Bitmap> PREVIEWS = new LruCache<>(6);
    private final LinearLayout pages;
    private final Typeface face;
    private final Selection selection;
    private final List<PreviewCard> cards = new ArrayList<>();
    private List<MapLevelCatalog.Level> levels = Collections.emptyList();
    private Set<String> completedMaps = Collections.emptySet();
    private int selectedIndex, pageWidth;
    private boolean positioning, positionPending, touching, interactionEnabled = true, previewOnly;
    private final Runnable settle = () -> snapToPage(Math.round(getScrollX() / (float) Math.max(1, pageWidth)));

    MapPreviewPager(Context context, Typeface face, Selection selection) {
        super(context);
        this.face = face;
        this.selection = selection;
        setFillViewport(true);
        setHorizontalScrollBarEnabled(false);
        setOverScrollMode(OVER_SCROLL_NEVER);
        setSmoothScrollingEnabled(false);
        setClipToPadding(true);
        pages = new LinearLayout(context);
        addView(pages, new HorizontalScrollView.LayoutParams(-2, -1));
    }

    void showLevels(List<MapLevelCatalog.Level> values, String selectedId) {
        removeCallbacks(settle);
        levels = values;
        selectedIndex = 0;
        pages.removeAllViews();
        cards.clear();
        for (int i = 0; i < levels.size(); i++) {
            MapLevelCatalog.Level level = levels.get(i);
            if (level.id.equals(selectedId)) selectedIndex = i;
            PreviewCard card = new PreviewCard(level, i + 1, levels.size());
            card.setCompleted(completedMaps.contains(level.id));
            cards.add(card);
            pages.addView(card, new LinearLayout.LayoutParams(Math.max(1, pageWidth), -1));
        }
        positionPending = true;
        decorate();
        requestLayout();
    }

    /** The split native picker reuses paging and artwork without the legacy copy card. */
    void setPreviewOnly(boolean value) {
        if(previewOnly==value)return;
        previewOnly=value;
        for(PreviewCard card:cards)card.applyPreviewMode();
        requestLayout();
    }

    int selectedIndex() { return selectedIndex; }
    int pageCount() { return levels.size(); }
    boolean isCompleted(String id) { return completedMaps.contains(id); }

    void browseBy(int delta) {
        if(!interactionEnabled||levels.isEmpty())return;
        settleSelection();removeCallbacks(settle);touching=false;
        snapToPage(selectedIndex+delta);
    }

    /** Refresh existing cards without disturbing the current swipe or selection. */
    void setCompletedMaps(Set<String> values) {
        Set<String> snapshot = values == null || values.isEmpty() ? Collections.emptySet()
                : Collections.unmodifiableSet(new HashSet<>(values));
        if (snapshot.equals(completedMaps)) return;
        completedMaps = snapshot;
        for (PreviewCard card : cards) card.setCompleted(completedMaps.contains(card.levelId));
    }

    void setInteractionEnabled(boolean enabled) {
        interactionEnabled = enabled;
        setAlpha(enabled ? 1f : .45f);
        if (!enabled) {
            touching = false;
            removeCallbacks(settle);
            positioning = true;
            scrollTo(selectedIndex * pageWidth, 0);
            positioning = false;
        }
        decorate();
    }

    void settleSelection() {
        removeCallbacks(settle);
        if (!positionPending) snapToPage(Math.round(getScrollX() / (float) Math.max(1, pageWidth)));
    }

    private void decorate() {
        for (int i = 0; i < cards.size(); i++) cards.get(i).setSelected(i == selectedIndex);
    }

    private void snapToPage(int index) {
        if (!interactionEnabled || levels.isEmpty()) return;
        index = Math.max(0, Math.min(levels.size() - 1, index));
        scrollTo(index * pageWidth, 0);
        if (index != selectedIndex) {
            selectedIndex = index;
            decorate();
            selection.selected(levels.get(index));
        }
    }

    /** Page flicks finish directly, so no old momentum can run after changing difficulty. */
    @Override public void fling(int velocityX) {
        if (!interactionEnabled || levels.isEmpty()) return;
        int nearest = Math.round(getScrollX() / (float) Math.max(1, pageWidth));
        int next = velocityX > 0 ? Math.max(nearest, selectedIndex + 1)
                : velocityX < 0 ? Math.min(nearest, selectedIndex - 1) : nearest;
        snapToPage(next);
    }

    @Override protected void onMeasure(int width, int height) {
        int available = MeasureSpec.getSize(width);
        if (available != pageWidth) {
            pageWidth = available;
            positionPending = true;
            for (PreviewCard card : cards) {
                LinearLayout.LayoutParams p = (LinearLayout.LayoutParams) card.getLayoutParams();
                p.width = pageWidth;
                card.setLayoutParams(p);
            }
        }
        super.onMeasure(width, height);
    }

    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        super.onLayout(changed, l, t, r, b);
        if (positionPending) {
            positioning = true;
            scrollTo(selectedIndex * pageWidth, 0);
            positioning = false;
            positionPending = false;
        }
    }

    @Override protected void onScrollChanged(int x, int y, int oldX, int oldY) {
        super.onScrollChanged(x, y, oldX, oldY);
        if (!positioning && !touching && interactionEnabled) {
            removeCallbacks(settle);
            postDelayed(settle, 160);
        }
    }

    @Override public boolean onInterceptTouchEvent(MotionEvent event) {
        if (!interactionEnabled) return false;
        // A drag may begin on the clickable arrow before this scroll view
        // intercepts MOVE. Track that DOWN too, so settling cannot fight it.
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            touching = true;
            removeCallbacks(settle);
        } else if (event.getActionMasked() == MotionEvent.ACTION_UP
                || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            touching = false;
            removeCallbacks(settle);
            postDelayed(settle, 160);
        }
        return super.onInterceptTouchEvent(event);
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        if (!interactionEnabled) return false;
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            touching = true;
            removeCallbacks(settle);
        }
        boolean handled = super.onTouchEvent(event);
        if (event.getActionMasked() == MotionEvent.ACTION_UP
                || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            touching = false;
            removeCallbacks(settle);
            postDelayed(settle, 160);
        }
        return handled;
    }

    @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(info);
        info.setContentDescription("Map selection, " + (selectedIndex + 1) + " of " + levels.size());
        info.setScrollable(interactionEnabled && levels.size() > 1);
    }

    @Override public boolean performAccessibilityAction(int action, Bundle arguments) {
        if (interactionEnabled && action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                && selectedIndex < levels.size() - 1) {
            snapToPage(selectedIndex + 1);
            return true;
        }
        if (interactionEnabled && action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD && selectedIndex > 0) {
            snapToPage(selectedIndex - 1);
            return true;
        }
        return super.performAccessibilityAction(action, arguments);
    }

    @Override protected void onDetachedFromWindow() {
        removeCallbacks(settle);
        super.onDetachedFromWindow();
    }

    private TextView copy(String text, int size, int color) {
        TextView view = new TextView(getContext());
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setIncludeFontPadding(false);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setEllipsize(TextUtils.TruncateAt.END);
        return view;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private final class PreviewCard extends FrameLayout {
        private final View image;
        private final BrowseArrow browse;
        private final TextView title, meta, description, position, completion;
        private final String levelId, normalPosition, compactPosition, accessibleName;
        private int imageSize, copyLeft, copyWidth, titleHeight, metaHeight, descriptionHeight, positionHeight;
        private int completionWidth, positionWidth;
        private boolean compact, completed;

        PreviewCard(MapLevelCatalog.Level level, int number, int total) {
            super(MapPreviewPager.this.getContext());
            levelId = level.id;
            accessibleName = level.name;
            GradientDrawable background = new GradientDrawable();
            background.setColor(TowersTheme.PANEL);
            background.setCornerRadius(dp(8));
            setBackground(background);
            image = new MapImage(level.preview);
            addView(image);
            title = copy(level.name.toUpperCase(Locale.ROOT), 22, TowersTheme.TEXT);
            title.setTypeface(face);
            title.setSingleLine(true);
            title.setAutoSizeTextTypeUniformWithConfiguration(13, 22, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
            addView(title);
            meta = copy(level.rounds + " rounds  ·  " + level.preparationSeconds + "s prep", 12, TowersTheme.TEXT);
            meta.setSingleLine(true);
            addView(meta);
            description = copy(level.description, 13, TowersTheme.SECONDARY);
            description.setMaxLines(2);
            addView(description);
            normalPosition = number + " / " + total;
            compactPosition = level.rounds + " rounds · " + number + " / " + total;
            position = copy(normalPosition, 12, TowersTheme.SECONDARY);
            position.setSingleLine(true);
            position.setAutoSizeTextTypeUniformWithConfiguration(9, 12, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
            addView(position);
            completion = copy("\u2605 Complete", 10, TowersTheme.SECONDARY);
            completion.setSingleLine(true);
            completion.setContentDescription(accessibleName + ", Complete");
            completion.setVisibility(GONE);
            addView(completion);
            browse = new BrowseArrow(number < total);
            addView(browse);
            applyPreviewMode();
        }

        void applyPreviewMode() {
            if(previewOnly)setBackground(null);
            else {
                GradientDrawable background=new GradientDrawable();
                background.setColor(isSelected()?TowersTheme.CARD_SELECTED:TowersTheme.PANEL);
                background.setCornerRadius(dp(8));setBackground(background);
            }
            for(View view:new View[]{title,meta,description,position,browse})view.setVisibility(previewOnly?GONE:VISIBLE);
            completion.setVisibility(completed&&!previewOnly?VISIBLE:GONE);
            image.setContentDescription(previewOnly?accessibleName+", actual map preview":null);
            image.setImportantForAccessibility(previewOnly?IMPORTANT_FOR_ACCESSIBILITY_YES:IMPORTANT_FOR_ACCESSIBILITY_NO);
            requestLayout();
        }

        void setCompleted(boolean value) {
            if (completed == value) return;
            completed = value;
            completion.setVisibility(completed && !previewOnly ? VISIBLE : GONE);
            requestLayout();
        }

        @Override public void setSelected(boolean selected) {
            super.setSelected(selected);
            if (getBackground() instanceof GradientDrawable)
                ((GradientDrawable) getBackground()).setColor(selected ? TowersTheme.CARD_SELECTED : TowersTheme.PANEL);
            if (title != null) title.setContentDescription(accessibleName + (selected ? ", selected map" : ", map"));
            if (browse != null) browse.setEnabled(selected && interactionEnabled && levels.size() > 1);
        }

        private void exact(View view, int width, int height) {
            view.measure(MeasureSpec.makeMeasureSpec(Math.max(0, width), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(Math.max(0, height), MeasureSpec.EXACTLY));
        }

        @Override protected void onMeasure(int width, int height) {
            int w = MeasureSpec.getSize(width), h = MeasureSpec.getSize(height);
            if(previewOnly) {
                exact(image,w,h);setMeasuredDimension(w,h);return;
            }
            boolean nextCompact = h < dp(136);
            if (nextCompact != compact) {
                compact = nextCompact;
                position.setText(compact ? compactPosition : normalPosition);
                description.setMaxLines(compact ? 1 : 2);
            }
            float fontScale = getResources().getConfiguration().fontScale;
            int minimumCopy = dp(fontScale > 1.2f ? 130 : 110);
            int imageLimit = Math.max(dp(64), w - dp(82) - minimumCopy);
            imageSize = Math.max(0, Math.min(imageLimit, Math.min(h - dp(16), Math.round(w * .40f))));
            copyLeft = imageSize + dp(22);
            // Keep the visible direction cue clear of titles and descriptions.
            copyWidth = Math.max(0, w - copyLeft - dp(60));
            titleHeight = Math.max(dp(compact ? 26 : 34), title.getLineHeight());
            metaHeight = compact ? 0 : Math.max(dp(19), meta.getLineHeight() + dp(2));
            positionHeight = Math.max(dp(19), position.getLineHeight() + dp(2));
            descriptionHeight = compact ? Math.max(0, h - titleHeight - positionHeight - dp(12))
                    : Math.min(Math.round(dp(40) * fontScale),
                    Math.max(0, h - titleHeight - metaHeight - positionHeight - dp(24)));
            meta.setVisibility(compact ? GONE : VISIBLE);
            description.setVisibility(descriptionHeight > 0 ? VISIBLE : GONE);
            exact(image, imageSize, imageSize);
            exact(title, copyWidth, titleHeight);
            exact(meta, copyWidth, metaHeight);
            exact(description, copyWidth, descriptionHeight);
            completionWidth = 0;
            if (completed) {
                completion.measure(MeasureSpec.makeMeasureSpec(copyWidth, MeasureSpec.AT_MOST),
                        MeasureSpec.makeMeasureSpec(positionHeight, MeasureSpec.EXACTLY));
                completionWidth = completion.getMeasuredWidth();
                int remaining = Math.max(0, copyWidth - completionWidth - dp(8));
                position.measure(MeasureSpec.makeMeasureSpec(remaining, MeasureSpec.AT_MOST),
                        MeasureSpec.makeMeasureSpec(positionHeight, MeasureSpec.EXACTLY));
                positionWidth = position.getMeasuredWidth();
            } else {
                positionWidth = copyWidth;
                exact(position, positionWidth, positionHeight);
            }
            exact(browse, dp(48), dp(48));
            setMeasuredDimension(w, h);
        }

        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            if(previewOnly) {image.layout(0,0,getWidth(),getHeight());return;}
            int imageY = (getHeight() - imageSize) / 2;
            image.layout(dp(8), imageY, dp(8) + imageSize, imageY + imageSize);
            int copyHeight = titleHeight + metaHeight + descriptionHeight + positionHeight + dp(8);
            int y = Math.max(dp(2), (getHeight() - copyHeight) / 2);
            title.layout(copyLeft, y, copyLeft + copyWidth, y + titleHeight);
            y += titleHeight;
            meta.layout(copyLeft, y, copyLeft + copyWidth, y + metaHeight);
            y += metaHeight + dp(4);
            description.layout(copyLeft, y, copyLeft + copyWidth, y + descriptionHeight);
            y += descriptionHeight + dp(4);
            position.layout(copyLeft, y, copyLeft + positionWidth, y + positionHeight);
            if (completed) {
                int completionLeft = copyLeft + positionWidth + dp(8);
                completion.layout(completionLeft, y, completionLeft + completionWidth, y + positionHeight);
            }
            int arrowX = getWidth() - dp(52), arrowY = (getHeight() - dp(48)) / 2;
            browse.layout(arrowX, arrowY, arrowX + dp(48), arrowY + dp(48));
        }
    }

    /** A visible swipe cue that also works as a normal accessible button. */
    private final class BrowseArrow extends View {
        private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final ColorStateList inkColours = TowersTheme.buttonText(false);
        private final Path chevron = new Path();
        private final android.graphics.drawable.Drawable buttonFace;
        private final boolean forward;

        BrowseArrow(boolean forward) {
            super(MapPreviewPager.this.getContext());
            this.forward = forward;
            buttonFace = TowersTheme.control(getContext(), TowersTheme.CONTROL, 6);
            setClickable(true);
            setFocusable(true);
            setContentDescription(forward ? "Next map, or swipe left" : "Previous map, or swipe right");
            setOnClickListener(view -> {
                if (!interactionEnabled || levels.size() < 2) return;
                removeCallbacks(settle);
                touching = false;
                snapToPage(selectedIndex + (forward ? 1 : -1));
            });
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            buttonFace.setBounds(Math.round(cx - dp(17)), Math.round(cy - dp(17)),
                    Math.round(cx + dp(17)), Math.round(cy + dp(17)));
            final int[] visualState = getDrawableState();
            buttonFace.setState(visualState);
            buttonFace.draw(canvas);
            // The selected map propagates its white face to this child. Pair
            // the chevron with that same state instead of always painting white.
            ink.setColor(!isEnabled() && isSelected() ? 0xFF505050
                    : inkColours.getColorForState(visualState, TowersTheme.TEXT));
            ink.setStrokeWidth(dp(2));
            ink.setStrokeCap(Paint.Cap.ROUND);
            ink.setStrokeJoin(Paint.Join.ROUND);
            ink.setStyle(Paint.Style.STROKE);
            float direction = forward ? 1f : -1f;
            chevron.reset();
            chevron.moveTo(cx - direction * dp(3), cy - dp(6));
            chevron.lineTo(cx + direction * dp(3), cy);
            chevron.lineTo(cx - direction * dp(3), cy + dp(6));
            canvas.drawPath(chevron, ink);
        }

        @Override protected void drawableStateChanged() {
            super.drawableStateChanged();
            invalidate();
        }

        @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
            super.onInitializeAccessibilityNodeInfo(info);
            info.setClassName("android.widget.Button");
        }
    }

    private final class MapImage extends View {
        private final String path;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final RectF target = new RectF();
        private boolean unavailable;

        MapImage(String path) {
            super(MapPreviewPager.this.getContext());
            this.path = path;
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            Bitmap bitmap = PREVIEWS.get(path);
            if (bitmap == null && !unavailable) {
                try (InputStream input = getContext().getAssets().open(path)) {
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inScaled = false;
                    bitmap = BitmapFactory.decodeStream(input, null, options);
                    if (bitmap != null) PREVIEWS.put(path, bitmap);
                    else unavailable = true;
                } catch (Exception error) { unavailable = true; }
            }
            paint.setColor(TowersTheme.BACKGROUND);
            canvas.drawRoundRect(0, 0, getWidth(), getHeight(), dp(5), dp(5), paint);
            if (bitmap == null) return;
            float scale = Math.min(getWidth() / (float) bitmap.getWidth(), getHeight() / (float) bitmap.getHeight());
            float w = bitmap.getWidth() * scale, h = bitmap.getHeight() * scale;
            target.set((getWidth() - w) / 2f, (getHeight() - h) / 2f,
                    (getWidth() + w) / 2f, (getHeight() + h) / 2f);
            canvas.drawBitmap(bitmap, null, target, paint);
        }
    }
}
