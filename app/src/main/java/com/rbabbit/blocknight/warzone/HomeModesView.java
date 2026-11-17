package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/** The compact mode chooser; each mode owns its detailed options. */
final class HomeModesView extends FrameLayout {
    private final Typeface face;
    private final ImageView logo, tank;
    private final Button campaign, towers, ffa, multiplayer, guide, hub;
    private final TextView version, status, tagline;
    private HomeMenuLayout.Result menuLayout;
    private HomeMenuLayout.Box taglineBox;
    private int safeLeft, safeTop, safeRight, safeBottom;

    HomeModesView(Context context, Typeface typeface, GraphicsSetupView.Actions actions,
            Runnable chooseMap, MapLevelCatalog.Level selectedMap) {
        super(context);
        face = typeface;
        setBackgroundColor(0xFF000000);

        tank = artwork(R.drawable.towers_home_grey_tank, null);
        logo = artwork(R.drawable.warzone_official_logo, "Warzone 2100");
        tagline = text("Research Tech - Build & Deploy Units - Upgrade Structures",
                12, TowersTheme.SECONDARY);
        tagline.setGravity(Gravity.CENTER);
        tagline.setLetterSpacing(.02f);
        tagline.setMaxLines(2);
        addView(tagline);
        campaign = button("CAMPAIGN", false);
        campaign.setContentDescription("Campaign");
        campaign.setOnClickListener(v -> actions.campaign());
        addView(campaign);
        towers = button("TOWERS", true);
        towers.setContentDescription("Towers");
        towers.setOnClickListener(v -> chooseMap.run());
        addView(towers);
        ffa = button("FFA", false);
        ffa.setContentDescription("Free for all");
        ffa.setOnClickListener(v -> actions.ffa());
        addView(ffa);
        multiplayer = button("MULTIPLAYER", false);
        multiplayer.setContentDescription("Multiplayer");
        multiplayer.setOnClickListener(v -> actions.multiplayer());
        addView(multiplayer);
        guide = button("GUIDE", false);
        guide.setContentDescription("Guide: research paths and how to play");
        guide.setOnClickListener(v -> actions.guide());
        addView(guide);
        hub = button("HUB", false);
        hub.setContentDescription("Game Hub: public multiplayer results and rankings");
        hub.setOnClickListener(v -> actions.hub());
        addView(hub);

        String installedVersion = GraphicsSetupView.appVersion(context);
        version = text("rbabbit v" + installedVersion
                + (BuildConfig.PLAY_STORE_BUILD ? "" : " - Check for updates"), 12,
                TowersTheme.SECONDARY);
        version.setContentDescription((BuildConfig.PLAY_STORE_BUILD
                ? "Installed version " : "Check for updates. Installed version ") + installedVersion);
        version.setGravity(Gravity.CENTER);
        version.setMinHeight(dp(48));
        version.setPadding(dp(8), 0, dp(8), 0);
        if (!BuildConfig.PLAY_STORE_BUILD) {
            version.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE), null, null));
            version.setOnClickListener(v -> actions.updates());
        } else {
            version.setClickable(false);
            version.setFocusable(false);
        }
        version.setSingleLine(false);
        version.setMaxLines(2);
        addView(version);
        status = text("", 12, TowersTheme.TEXT);
        status.setMaxLines(2);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setVisibility(GONE);
        addView(status);
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

    // Map selection and Rewards remain on the existing mode screens.
    void setRewardBalance(int balance) { }
    void setSelectedMap(MapLevelCatalog.Level level) { }

    void setCampaignBusy(boolean busy) {
        campaign.setEnabled(!busy);
        campaign.setContentDescription(busy ? "Checking campaign files" : "Campaign");
    }

    void showStatus(String value, boolean error) {
        boolean show = error && value != null && !value.trim().isEmpty();
        status.setText(show ? value : "");
        status.setVisibility(show ? VISIBLE : GONE);
    }

    void setArtworkVisible(boolean visible) {
        logo.setVisibility(visible ? VISIBLE : INVISIBLE);
        tank.setVisibility(visible ? VISIBLE : INVISIBLE);
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec), height = MeasureSpec.getSize(heightSpec);
        tagline.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        Button[] modes = {campaign, towers, ffa, multiplayer, guide, hub};
        int[] labelWidths = new int[modes.length]; int fontHeight = 0;
        for (int index = 0; index < modes.length; index++) {
            Button button = modes[index];
            button.setTextSize(TypedValue.COMPLEX_UNIT_SP, index >= 4 ? 14 : 16);
            labelWidths[index] = (int) Math.ceil(button.getPaint().measureText(button.getText().toString()));
            fontHeight = Math.max(fontHeight, button.getPaint().getFontMetricsInt(null));
        }
        float density = getResources().getDisplayMetrics().density;
        HomeMenuLayout.Result safeLayout = HomeMenuLayout.measure(width, height, density,
                safeLeft, safeTop, safeRight, safeBottom, labelWidths, fontHeight, 0);
        int footerWidth = safeLayout.contentRight - safeLayout.contentLeft;
        version.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        version.measure(MeasureSpec.makeMeasureSpec(footerWidth,
                MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(height, MeasureSpec.AT_MOST));
        if (status.getVisibility() == VISIBLE) {
            status.measure(MeasureSpec.makeMeasureSpec(Math.max(0,
                    footerWidth - version.getMeasuredWidth() - dp(16)), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(height, MeasureSpec.AT_MOST));
        }
        menuLayout = HomeMenuLayout.measure(width, height, density,
                safeLeft, safeTop, safeRight, safeBottom, labelWidths, fontHeight,
                Math.max(version.getMeasuredHeight(), status.getVisibility() == VISIBLE ? status.getMeasuredHeight() : 0));
        for (int index = 0; index < modes.length; index++)
            exact(modes[index], menuLayout.buttons[index].width, menuLayout.buttons[index].height);
        exact(logo, menuLayout.logo.width, menuLayout.logo.height);
        exact(tank, menuLayout.tank.width, menuLayout.tank.height);
        tagline.measure(MeasureSpec.makeMeasureSpec(footerWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.AT_MOST));
        taglineBox = taglineBounds(menuLayout, safeTop, density, tagline.getMeasuredHeight());
        if (taglineBox.width != tagline.getMeasuredWidth()) {
            tagline.measure(MeasureSpec.makeMeasureSpec(taglineBox.width, MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(height, MeasureSpec.AT_MOST));
            taglineBox = taglineBounds(menuLayout, safeTop, density, tagline.getMeasuredHeight());
        }
        setMeasuredDimension(width, height);
    }

    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        if (menuLayout == null) return;
        place(tank, menuLayout.tank.left, menuLayout.tank.top);
        place(logo, menuLayout.logo.left, menuLayout.logo.top);
        if (taglineBox != null) place(tagline, taglineBox.left, taglineBox.top);
        Button[] modes = {campaign, towers, ffa, multiplayer, guide, hub};
        for (int index = 0; index < modes.length; index++)
            place(modes[index], menuLayout.buttons[index].left, menuLayout.buttons[index].top);
        place(version, menuLayout.contentRight - version.getMeasuredWidth(),
                menuLayout.footerBottom - version.getMeasuredHeight());
        if (status.getVisibility() == VISIBLE) {
            place(status, menuLayout.contentLeft, menuLayout.footerBottom - status.getMeasuredHeight());
        }
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow(); requestApplyInsets();
    }

    private ImageView artwork(int resource, String description) {
        ImageView image = new ImageView(getContext());
        image.setImageResource(resource);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setContentDescription(description);
        image.setImportantForAccessibility(description == null
                ? IMPORTANT_FOR_ACCESSIBILITY_NO : IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        addView(image);
        return image;
    }

    private TextView text(String value, int size, int colour) {
        TextView view = new TextView(getContext());
        view.setText(value);
        view.setTextSize(size);
        view.setTypeface(face);
        view.setTextColor(colour);
        view.setIncludeFontPadding(false);
        return view;
    }

    private Button button(String label, boolean primary) {
        Button button = new Button(getContext());
        button.setText(label);
        button.setTextSize(16);
        button.setTypeface(face);
        button.setAllCaps(false);
        button.setSingleLine(true);
        button.setIncludeFontPadding(false);
        button.setTextColor(TowersTheme.buttonText(primary));
        button.setGravity(Gravity.CENTER);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(10), 0, dp(10), 0);
        button.setBackgroundTintList(null);
        button.setStateListAnimator(null);
        // The visible 32dp face stays compact inside a full 48dp touch target.
        InsetDrawable face = new InsetDrawable(TowersTheme.control(getContext(),
                primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL, 6), 0, dp(8), 0, dp(8));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(primary
                ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE), face, null));
        return button;
    }

    private static HomeMenuLayout.Box taglineBounds(HomeMenuLayout.Result layout,
            int safeTop, float density, int textHeight) {
        int right = layout.contentRight;
        int artTop = Math.min(layout.logo.top, layout.tank.top);
        if (textHeight + Math.round(2 * density) > artTop - safeTop) {
            right = Math.max(layout.contentLeft, layout.tank.left - Math.round(12 * density));
            artTop = layout.logo.top;
        }
        int top = Math.max(safeTop, Math.min(safeTop + Math.round(24 * density),
                artTop - textHeight - Math.round(2 * density)));
        return new HomeMenuLayout.Box(layout.contentLeft, top,
                right - layout.contentLeft, textHeight);
    }

    private static void exact(View view, int width, int height) {
        view.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }

    private static void place(View view, int x, int y) {
        view.layout(x, y, x + view.getMeasuredWidth(), y + view.getMeasuredHeight());
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
