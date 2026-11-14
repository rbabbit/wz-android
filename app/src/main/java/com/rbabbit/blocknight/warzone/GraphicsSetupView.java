package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.List;
import java.util.Set;

/** Map-first native launcher: compact controls with a scrollable content panel. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions {
        void start(String graphicsMode, String map, String matchMode, String duelWeapon);
        void rewards();
        void savedGames();
        void campaign();
        void ffa();
        void multiplayer();
        void guide();
        void hub();
        void campaignContinue();
        void campaignNew();
        void map(String id);
    }

    private static final int INK = TowersTheme.TEXT, MUTED = TowersTheme.SECONDARY;
    private final Actions actions;
    private final Typeface face;
    private final MapLevelCatalog catalog;
    private final LinearLayout matchChoices, weaponChoices, difficultyChoices, launchActions, message;
    private final TextView detail, status;
    private final Button towers, duel, cannon, rockets, easy, medium, hard;
    private final Button start, rewards, savedGames, homeBack;
    private final LinearLayout homeActions;
    private final MapPreviewPager maps;
    private final WarzoneSplashView splash;
    private final TextView version;
    private final LaunchPanel panel;
    private final ScrollView mapScroll;
    private final HomeModesView homeModes;
    private String map, matchMode, duelWeapon, difficulty;
    private int viewportHeight;
    private boolean towersMapVisible;

    GraphicsSetupView(Context context, String selected, String selectedMap,
            String selectedMatch, String selectedWeapon, Actions actions) {
        super(context);
        this.actions = actions;
        catalog = MapLevelCatalog.get(context);
        map = BattleLaunchSpec.mapId(selectedMap);
        // Keep the dormant Duel implementation, but expose only Towers here.
        matchMode = "towers";
        duelWeapon = BattleLaunchSpec.duelWeapon(selectedWeapon);
        difficulty = catalog.level(map).difficulty;
        rememberMap();
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(TowersTheme.BACKGROUND);
        setClickable(true);
        setFocusable(true);
        splash = new WarzoneSplashView(context, !"duel".equals(matchMode));
        splash.setSubtitleVisible(false);
        addView(splash, new LayoutParams(-1, -1));

        towers = choice("Towers");
        duel = choice("1v1 vs Bot");
        matchChoices = choiceRow(towers, duel);
        towers.setOnClickListener(v -> chooseMatch("towers"));
        duel.setOnClickListener(v -> chooseMatch("duel"));
        cannon = choice("Cannon");
        rockets = choice("Rockets");
        weaponChoices = choiceRow(cannon, rockets);
        cannon.setOnClickListener(v -> chooseWeapon("cannon"));
        rockets.setOnClickListener(v -> chooseWeapon("rockets"));

        easy = choice("Easy · " + catalog.difficulty("easy").size());
        medium = choice("Medium · " + catalog.difficulty("medium").size());
        hard = choice("Hard · " + catalog.difficulty("hard").size());
        difficultyChoices = choiceRow(easy, medium, hard);
        easy.setOnClickListener(v -> chooseDifficulty("easy"));
        medium.setOnClickListener(v -> chooseDifficulty("medium"));
        hard.setOnClickListener(v -> chooseDifficulty("hard"));
        maps = new MapPreviewPager(context, face, level -> chooseMap(level.id));
        maps.showLevels(catalog.difficulty(difficulty), map);

        detail = text("", 12, MUTED);
        detail.setGravity(Gravity.CENTER_VERTICAL);
        detail.setMaxLines(2);
        start = button("PLAY", true);
        start.setOnClickListener(v -> {
            if (start.isEnabled()) {
                if (!"duel".equals(matchMode)) maps.settleSelection();
                actions.start("normal", map, matchMode, duelWeapon);
            }
        });

        launchActions = new LinearLayout(context);
        launchActions.setGravity(Gravity.CENTER_VERTICAL);
        launchActions.addView(start, new LinearLayout.LayoutParams(dp(112), dp(48)));

        status = text("", 12, MUTED);
        status.setMaxLines(2);
        status.setGravity(Gravity.CENTER_VERTICAL);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        message = new LinearLayout(context);
        message.setPadding(dp(12), 0, dp(8), 0);
        message.setGravity(Gravity.CENTER_VERTICAL);
        message.setVisibility(GONE);
        message.setBackground(shape(TowersTheme.PANEL, 0, 7));
        message.addView(status, new LinearLayout.LayoutParams(0, dp(48), 1));

        panel = new LaunchPanel(context);
        mapScroll = new ScrollView(context);
        mapScroll.setFillViewport(true);
        mapScroll.setOverScrollMode(OVER_SCROLL_NEVER);
        mapScroll.setVerticalScrollBarEnabled(true);
        mapScroll.setScrollbarFadingEnabled(true);
        mapScroll.setContentDescription("Map selection and Play; scroll vertically when needed");
        mapScroll.addView(panel, new ScrollView.LayoutParams(-1, -2));
        LayoutParams scrollParams = new LayoutParams(-1, -1);
        scrollParams.topMargin = dp(48);
        addView(mapScroll, scrollParams);
        rewards = button("REWARDS 0", false);
        rewards.setTextSize(13);
        rewards.setSingleLine(true);
        android.graphics.drawable.Drawable crystal = context.getDrawable(R.drawable.reward_crystal);
        crystal.setBounds(0, 0, dp(20), dp(20));
        rewards.setCompoundDrawables(crystal, null, null, null);
        rewards.setCompoundDrawablePadding(dp(6));
        rewards.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 7), 0, dp(8), 0, dp(8)), null));
        rewards.setPadding(dp(9), 0, dp(9), 0);
        rewards.setOnClickListener(v -> {
            maps.settleSelection();
            actions.rewards();
        });
        savedGames = button("SAVED GAMES", false);
        savedGames.setTextSize(13);
        savedGames.setSingleLine(true);
        savedGames.setContentDescription("Open saved games on this phone");
        savedGames.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 7), 0, dp(8), 0, dp(8)), null));
        savedGames.setPadding(dp(10), 0, dp(10), 0);
        savedGames.setOnClickListener(v -> {
            maps.settleSelection();
            actions.savedGames();
        });
        homeActions = new LinearLayout(context);
        homeActions.setGravity(Gravity.CENTER_VERTICAL);
        homeBack = button("BACK", false);
        homeBack.setTextSize(13);
        homeBack.setSingleLine(true);
        homeBack.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 7), 0, dp(8), 0, dp(8)), null));
        homeBack.setPadding(dp(10), 0, dp(10), 0);
        homeBack.setContentDescription("Back to Campaign and Towers");
        homeBack.setOnClickListener(v -> handleHomeBack());
        homeActions.addView(homeBack, new LinearLayout.LayoutParams(-2, dp(48)));
        LinearLayout.LayoutParams rewardsParams = new LinearLayout.LayoutParams(-2, dp(48));
        rewardsParams.leftMargin = dp(8);
        homeActions.addView(rewards, rewardsParams);
        LinearLayout.LayoutParams savedParams = new LinearLayout.LayoutParams(-2, dp(48));
        savedParams.leftMargin = dp(8);
        homeActions.addView(savedGames, savedParams);
        LayoutParams homeParams = new LayoutParams(-2, dp(48), Gravity.TOP | Gravity.START);
        homeParams.leftMargin = dp(18);
        homeParams.topMargin = dp(8);
        addView(homeActions, homeParams);
        version = text("rbabbit v" + appVersion(context), 11, MUTED);
        version.setContentDescription("rbabbit, Warzone Towers version " + appVersion(context));
        LayoutParams versionParams = new LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        versionParams.rightMargin = dp(14);
        versionParams.bottomMargin = dp(8);
        addView(version, versionParams);
        homeModes = new HomeModesView(context, face, actions, this::showTowersMap, catalog.level(map));
        addView(homeModes, new LayoutParams(-1, -1));
        refresh();
        showHomeModes();
    }

    void setResultOverlayVisible(boolean visible) {
        splash.setArtworkVisible(!visible);
        homeModes.setArtworkVisible(!visible);
        setImportantForAccessibility(visible ? IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
                : IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        setDescendantFocusability(visible ? FOCUS_BLOCK_DESCENDANTS : FOCUS_AFTER_DESCENDANTS);
    }

    /** Keep the complete Home version label below a result sheet, even before first layout. */
    int resultOverlayBottomClearance() {
        LayoutParams params = (LayoutParams) version.getLayoutParams();
        int textHeight = Math.max(version.getMeasuredHeight(),
                (int) Math.ceil(version.getPaint().getFontSpacing())
                        + version.getPaddingTop() + version.getPaddingBottom());
        return textHeight + params.bottomMargin + dp(8);
    }

    static String appVersion(Context context) {
        try { return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName; }
        catch (android.content.pm.PackageManager.NameNotFoundException error) { return "unknown"; }
    }

    @Override protected void onMeasure(int width, int height) {
        viewportHeight = Math.max(0, MeasureSpec.getSize(height) - dp(48));
        LayoutParams params = (LayoutParams) homeActions.getLayoutParams();
        params.leftMargin = Math.max(dp(8), Math.round(MeasureSpec.getSize(width) * .047f));
        params.topMargin = dp(viewportHeight < dp(320) ? 0 : 8);
        // Reserve each label's measured text and icon width rather than clipping
        // it with unrelated percentages when Android's font size is enlarged.
        int availableWidth = Math.max(0, MeasureSpec.getSize(width) - params.leftMargin - dp(12));
        Button[] controls = {homeBack, rewards, savedGames};
        int wanted = 0;
        for (Button control : controls) wanted += desiredButtonWidth(control);
        int budget = Math.max(0, availableWidth - dp(16)), remaining = budget;
        for (int i = 0; i < controls.length; i++) {
            Button control = controls[i];
            int desired = desiredButtonWidth(control);
            int assigned = wanted <= budget ? desired : i == controls.length - 1 ? remaining
                    : Math.round(budget * desired / (float) Math.max(1, wanted));
            remaining -= assigned;
            control.getLayoutParams().width = Math.max(0, assigned);
        }
        super.onMeasure(width, height);
    }

    private int desiredButtonWidth(Button button) {
        return (int) Math.ceil(button.getPaint().measureText(button.getText().toString()))
                + button.getCompoundPaddingLeft() + button.getCompoundPaddingRight() + dp(2);
    }

    private Button choice(String label) {
        Button b = button(label, false);
        b.setTextSize(13);
        b.setSingleLine(true);
        b.setEllipsize(TextUtils.TruncateAt.END);
        return b;
    }

    private LinearLayout choiceRow(Button... choices) {
        LinearLayout row = new LinearLayout(getContext());
        for (Button button : choices) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1);
            if (row.getChildCount() > 0) p.leftMargin = dp(6);
            row.addView(button, p);
        }
        return row;
    }

    private void decorateChoice(Button b, boolean selected, String description) {
        b.setSelected(selected);
        b.setEnabled(true);
        b.setAlpha(1f);
        b.setContentDescription(description + ", " + (selected ? "selected" : "not selected"));
    }

    private void chooseMatch(String value) {
        if (!"duel".equals(matchMode)) maps.settleSelection();
        matchMode = BattleLaunchSpec.matchMode(value);
        refresh();
    }

    private void chooseWeapon(String value) {
        duelWeapon = BattleLaunchSpec.duelWeapon(value);
        refresh();
    }

    private void chooseDifficulty(String value) {
        if (value.equals(difficulty)) return;
        difficulty = value;
        List<MapLevelCatalog.Level> levels = catalog.difficulty(difficulty);
        // Return each tab to its last map, then select that map for Play.
        String previous = getContext().getSharedPreferences("map_browser", Context.MODE_PRIVATE)
                .getString("selected_" + difficulty, "");
        String next = levels.get(0).id;
        for (MapLevelCatalog.Level level : levels) if (level.id.equals(previous)) next = level.id;
        maps.showLevels(levels, next);
        chooseMap(next);
    }

    private void chooseMap(String id) {
        map = BattleLaunchSpec.mapId(id);
        rememberMap();
        actions.map(map);
        refresh();
    }

    private void rememberMap() {
        getContext().getSharedPreferences("map_browser", Context.MODE_PRIVATE).edit()
                .putString("selected_" + difficulty, map).apply();
    }

    private void refresh() {
        boolean botMatch = "duel".equals(matchMode);
        matchChoices.setVisibility(GONE);
        decorateChoice(towers, !botMatch, "Game mode, Towers");
        decorateChoice(duel, botMatch, "Game mode, 1v1 vs Bot");
        decorateChoice(cannon, "cannon".equals(duelWeapon), "Your weapon, Cannon");
        decorateChoice(rockets, "rockets".equals(duelWeapon), "Your weapon, Rockets");
        decorateChoice(easy, "easy".equals(difficulty), "Easy maps, " + catalog.difficulty("easy").size());
        decorateChoice(medium, "medium".equals(difficulty), "Medium maps, " + catalog.difficulty("medium").size());
        decorateChoice(hard, "hard".equals(difficulty), "Hard maps, " + catalog.difficulty("hard").size());
        weaponChoices.setVisibility(botMatch ? VISIBLE : GONE);
        difficultyChoices.setVisibility(botMatch ? GONE : VISIBLE);
        maps.setVisibility(botMatch ? GONE : VISIBLE);
        maps.setInteractionEnabled(true);
        detail.setVisibility(botMatch ? VISIBLE : GONE);
        detail.setText("You: " + ("cannon".equals(duelWeapon)
                ? "Cannon  ·  Bot: Rockets" : "Rockets  ·  Bot: Cannon"));
        String name = catalog.level(map).name;
        start.setText(botMatch ? "PLAY 1v1" : "PLAY");
        start.setContentDescription("Start game, " + (botMatch ? "1v1 vs Bot" : name));
        start.setEnabled(true);
        start.setAlpha(start.isEnabled() ? 1f : .45f);
        rewards.setEnabled(true);
        savedGames.setEnabled(true);
        applyCompactTowersStyle();
        if (homeModes != null) homeModes.setSelectedMap(catalog.level(map));
        if (panel != null) panel.requestLayout();
    }

    private void applyCompactTowersStyle() {
        boolean compact = !"duel".equals(matchMode);
        message.setBackground(shape(compact ? TowersTheme.PANEL : 0xFF101F26, compact ? 0 : 0xFF29414A, 7));
        for (Button b : new Button[] {towers, duel, cannon, rockets, easy, medium, hard}) {
            boolean selected = b.isSelected();
            int fill = compact ? (selected ? TowersTheme.PRIMARY : Color.TRANSPARENT)
                    : (selected ? 0xFF18343B : 0xFF101F26);
            if (compact) b.setTextColor(TowersTheme.buttonText(selected));
            else b.setTextColor(INK);
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(compact
                    ? selected ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE : 0x228BD3CC),
                    new InsetDrawable(compact ? TowersTheme.control(getContext(), fill, 7)
                            : shape(fill, selected ? 0xFF8BD3CC : 0xFF29414A, 7),
                            dp(4), dp(8), dp(4), dp(8)), null));
            b.setPadding(dp(5), 0, dp(5), 0);
        }
        for (Button b : new Button[] {start}) {
            boolean primary = b == start;
            int fill = primary ? (compact ? TowersTheme.PRIMARY : 0xFF8BD3CC) : TowersTheme.CONTROL;
            if (compact) b.setTextColor(TowersTheme.buttonText(primary));
            else b.setTextColor(primary ? TowersTheme.ON_PRIMARY : INK);
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(compact
                    ? primary ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE : 0x338BD3CC),
                    new InsetDrawable(compact ? TowersTheme.control(getContext(), fill, 7)
                            : shape(fill, 0, 7), 0, dp(8), 0, dp(8)), null));
            b.setPadding(dp(5), 0, dp(5), 0);
        }
    }

    String selectedMap() {
        if (!"duel".equals(matchMode)) maps.settleSelection();
        return map;
    }
    String selectedMatchMode() { return matchMode; }
    String selectedDuelWeapon() { return duelWeapon; }

    void setRewardBalance(int balance) {
        rewards.setText("REWARDS " + Math.max(0, balance));
        rewards.setContentDescription("Rewards, " + Math.max(0, balance) + " crystals");
        homeModes.setRewardBalance(balance);
        requestLayout();
    }

    void setCompletedMaps(Set<String> completedMaps) { maps.setCompletedMaps(completedMaps); }

    void setCampaignBusy(boolean busy) { homeModes.setCampaignBusy(busy); }

    void showTowersMap() {
        maps.settleSelection();
        towersMapVisible = true;
        homeModes.setVisibility(GONE);
        mapScroll.setVisibility(VISIBLE);
        homeActions.setVisibility(VISIBLE);
        version.setVisibility(VISIBLE);
        splash.setVisibility(VISIBLE);
        // Switching modes also invalidates a pending Campaign inspection.
        actions.map(map);
    }

    boolean handleHomeBack() {
        if (!towersMapVisible) return false;
        maps.settleSelection();
        showHomeModes();
        return true;
    }

    private void showHomeModes() {
        towersMapVisible = false;
        homeModes.setSelectedMap(catalog.level(map));
        homeModes.setVisibility(VISIBLE);
        mapScroll.setVisibility(GONE);
        homeActions.setVisibility(GONE);
        version.setVisibility(GONE);
        splash.setVisibility(GONE);
    }

    void showError(String value) { showStatus(value, true); }

    void showStatus(String value, boolean error) {
        status.setText(value);
        status.setTextColor(error ? INK : MUTED);
        message.setVisibility(VISIBLE);
        homeModes.showStatus(value, error);
        panel.requestLayout();
    }

    private GradientDrawable shape(int fill, int border, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        if (border != 0) drawable.setStroke(dp(1), border);
        return drawable;
    }

    private TextView text(String value, int size, int colour) {
        TextView text = new TextView(getContext());
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(colour);
        text.setIncludeFontPadding(false);
        return text;
    }

    private Button button(String value, boolean primary) {
        Button button = new Button(getContext());
        button.setBackgroundTintList(null);
        button.setText(value);
        button.setTextColor(TowersTheme.buttonText(primary));
        button.setTextSize(primary ? 18 : 13);
        button.setTypeface(face);
        button.setIncludeFontPadding(false);
        button.setEllipsize(TextUtils.TruncateAt.END);
        button.setAllCaps(false);
        button.setSingleLine(primary);
        button.setMaxLines(primary ? 1 : 2);
        button.setGravity(Gravity.CENTER);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(5), 0, dp(5), 0);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(primary ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE),
                TowersTheme.control(getContext(), primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL, 6), null));
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    /** Compact visible controls keep 48dp touch rows; very short windows can scroll. */
    private final class LaunchPanel extends FrameLayout {
        private int left, top, panelWidth, contentHeight, gap, previewHeight;
        private int messageHeight, detailHeight;

        LaunchPanel(Context context) {
            super(context);
            for (View view : new View[] {matchChoices, weaponChoices, difficultyChoices,
                    maps, detail, launchActions, message}) addView(view);
        }

        private void exact(View view, int width, int height) {
            view.measure(MeasureSpec.makeMeasureSpec(Math.max(0, width), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(Math.max(0, height), MeasureSpec.EXACTLY));
        }

        @Override protected void onMeasure(int width, int height) {
            int w = MeasureSpec.getSize(width), h = viewportHeight;
            boolean botMatch = "duel".equals(matchMode);
            int outer = dp(h < dp(320) ? 8 : 16);
            messageHeight = message.getVisibility() == VISIBLE ? dp(56) : 0;
            int available = Math.max(0, h - outer * 2 - messageHeight);
            panelWidth = Math.max(0, Math.min(w - outer * 2,
                    Math.min(dp(480), Math.max(dp(320), Math.round(w * .50f)))));
            gap = dp(6);
            detailHeight = botMatch ? dp(getResources().getConfiguration().fontScale > 1.15f ? 36 : 28) : 0;
            int fixed = dp(96) + gap * 2;
            float fontScale = getResources().getConfiguration().fontScale;
            int minimumPreview = Math.round(dp(120) * Math.min(1.6f, Math.max(1f, fontScale)));
            int desiredPreview = Math.max(dp(144), Math.min(dp(240), Math.round(h * .44f)));
            previewHeight = botMatch ? 0 : Math.max(minimumPreview, Math.min(desiredPreview, available - fixed));
            contentHeight = fixed + (botMatch ? detailHeight : previewHeight);
            int measuredHeight = Math.max(h, contentHeight + outer * 2 + messageHeight);
            left = Math.max(outer, Math.min(Math.round(w * .047f), w - outer - panelWidth));
            top = outer + Math.max(0, (available - contentHeight) / 2);
            exact(matchChoices, panelWidth, 0);
            exact(weaponChoices, panelWidth, botMatch ? dp(48) : 0);
            exact(difficultyChoices, panelWidth, botMatch ? 0 : dp(48));
            exact(maps, panelWidth, previewHeight);
            exact(detail, panelWidth, detailHeight);
            // Allow enlarged system text without turning the Play control into a banner.
            LinearLayout.LayoutParams playParams = (LinearLayout.LayoutParams) start.getLayoutParams();
            int playWidth = Math.min(panelWidth / 2, Math.round(dp(112) * Math.min(1.4f, fontScale)));
            if (playParams.width != playWidth) {
                playParams.width = playWidth;
                start.setLayoutParams(playParams);
            }
            exact(launchActions, panelWidth, dp(48));
            exact(message, Math.min(w - outer * 2, dp(880)), dp(52));
            setMeasuredDimension(w, measuredHeight);
        }

        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            int x = left, y = top;
            matchChoices.layout(0, 0, 0, 0);
            if ("duel".equals(matchMode)) {
                weaponChoices.layout(x, y, x + panelWidth, y + dp(48));
                difficultyChoices.layout(0, 0, 0, 0);
                maps.layout(0, 0, 0, 0);
                y += dp(48) + gap;
                detail.layout(x, y, x + panelWidth, y + detailHeight);
                y += detailHeight + gap;
            } else {
                weaponChoices.layout(0, 0, 0, 0);
                detail.layout(0, 0, 0, 0);
                difficultyChoices.layout(x, y, x + panelWidth, y + dp(48));
                y += dp(48) + gap;
                maps.layout(x, y, x + panelWidth, y + previewHeight);
                y += previewHeight + gap;
            }
            launchActions.layout(x, y, x + panelWidth, y + dp(48));
            int messageWidth = message.getMeasuredWidth();
            int messageX = (getWidth() - messageWidth) / 2;
            int messageY = getHeight() - dp(56);
            message.layout(messageX, messageY, messageX + messageWidth, messageY + dp(52));
        }
    }
}
