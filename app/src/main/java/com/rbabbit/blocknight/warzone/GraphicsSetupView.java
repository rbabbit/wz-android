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
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.List;
import java.util.Locale;

/** Map-first native launcher: compact tabs and one quiet Play/music row. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions {
        void start(String graphicsMode, String map, String matchMode, String duelWeapon);
        void cancel();
        void music();
        void rewards();
        void savedGames();
        void map(String id);
    }

    private static final int INK = 0xFFF0F3ED, MUTED = 0xFFA6B9BE, TEAL = 0xFF8BD3CC;
    private final Actions actions;
    private final Typeface face;
    private final MapLevelCatalog catalog;
    private final LinearLayout matchChoices, weaponChoices, difficultyChoices, launchActions, message;
    private final TextView detail, status;
    private final Button towers, duel, cannon, rockets, easy, medium, hard;
    private final Button start, cancel, music, rewards, savedGames;
    private final LinearLayout homeActions;
    private final ProgressBar progress;
    private final MapPreviewPager maps;
    private final LaunchPanel panel;
    private String map, matchMode, duelWeapon, difficulty;
    private int viewportHeight;
    private boolean downloading, musicChecked, musicCached;

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
        setBackgroundColor(0xFF0B151B);
        setClickable(true);
        setFocusable(true);
        addView(new WarzoneSplashView(context), new LayoutParams(-1, -1));

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
        music = button("MUSIC\nCHECKING…", false);
        music.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        music.setEnabled(false);
        music.setOnClickListener(v -> {
            if (!"duel".equals(matchMode)) maps.settleSelection();
            actions.music();
        });
        launchActions.addView(start, new LinearLayout.LayoutParams(dp(112), dp(48)));
        LinearLayout.LayoutParams musicParams = new LinearLayout.LayoutParams(-2, dp(48));
        musicParams.leftMargin = dp(14);
        launchActions.addView(music, musicParams);

        status = text("", 12, MUTED);
        status.setMaxLines(2);
        status.setGravity(Gravity.CENTER_VERTICAL);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        cancel = button("CANCEL DOWNLOAD", false);
        cancel.setVisibility(GONE);
        cancel.setOnClickListener(v -> {
            actions.cancel();
            setDownloading(false);
            showStatus("Download paused. Your progress is saved.", false);
        });
        message = new LinearLayout(context);
        message.setPadding(dp(12), 0, dp(8), 0);
        message.setGravity(Gravity.CENTER_VERTICAL);
        message.setVisibility(GONE);
        message.setBackground(shape(0xFF101F26, 0, 7));
        message.addView(status, new LinearLayout.LayoutParams(0, dp(48), 1));
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(dp(126), dp(48));
        cancelParams.leftMargin = dp(8);
        message.addView(cancel, cancelParams);
        progress = new ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000);
        progress.setProgressTintList(ColorStateList.valueOf(TEAL));
        progress.setVisibility(GONE);

        panel = new LaunchPanel(context);
        ScrollView scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.addView(panel, new ScrollView.LayoutParams(-1, -2));
        LayoutParams scrollParams = new LayoutParams(-1, -1);
        scrollParams.topMargin = dp(48);
        addView(scroll, scrollParams);
        rewards = button("REWARDS 0", false);
        rewards.setTextSize(13);
        rewards.setSingleLine(true);
        android.graphics.drawable.Drawable crystal = context.getDrawable(R.drawable.reward_crystal);
        crystal.setBounds(0, 0, dp(20), dp(20));
        rewards.setCompoundDrawables(crystal, null, null, null);
        rewards.setCompoundDrawablePadding(dp(6));
        rewards.setBackground(new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                new InsetDrawable(shape(0xE91B3338, 0, 7), 0, dp(8), 0, dp(8)), null));
        rewards.setPadding(dp(9), 0, dp(9), 0);
        rewards.setOnClickListener(v -> {
            if (downloading) return;
            maps.settleSelection();
            actions.rewards();
        });
        savedGames = button("SAVED GAMES", false);
        savedGames.setTextSize(13);
        savedGames.setSingleLine(true);
        savedGames.setContentDescription("Open saved games on this phone");
        savedGames.setBackground(new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                new InsetDrawable(shape(0xB014252D, 0, 7), 0, dp(8), 0, dp(8)), null));
        savedGames.setPadding(dp(10), 0, dp(10), 0);
        savedGames.setOnClickListener(v -> {
            if (downloading) return;
            maps.settleSelection();
            actions.savedGames();
        });
        homeActions = new LinearLayout(context);
        homeActions.setGravity(Gravity.CENTER_VERTICAL);
        homeActions.addView(rewards, new LinearLayout.LayoutParams(-2, dp(48)));
        LinearLayout.LayoutParams savedParams = new LinearLayout.LayoutParams(-2, dp(48));
        savedParams.leftMargin = dp(8);
        homeActions.addView(savedGames, savedParams);
        LayoutParams homeParams = new LayoutParams(-2, dp(48), Gravity.TOP | Gravity.START);
        homeParams.leftMargin = dp(18);
        homeParams.topMargin = dp(8);
        addView(homeActions, homeParams);
        TextView version = text("v" + appVersion(context), 11, MUTED);
        version.setContentDescription("Warzone Towers version " + appVersion(context));
        LayoutParams versionParams = new LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        versionParams.rightMargin = dp(14);
        versionParams.bottomMargin = dp(8);
        addView(version, versionParams);
        refresh();
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
        int availableWidth = MeasureSpec.getSize(width);
        rewards.setMaxWidth(Math.max(dp(80), Math.min(dp(210), Math.round(availableWidth * .34f))));
        savedGames.setMaxWidth(Math.max(dp(80), Math.min(dp(150), Math.round(availableWidth * .24f))));
        super.onMeasure(width, height);
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
        b.setEnabled(!downloading);
        b.setAlpha(downloading ? .5f : 1f);
        b.setContentDescription(description + ", " + (selected ? "selected" : "not selected"));
    }

    private void chooseMatch(String value) {
        if (downloading) return;
        if (!"duel".equals(matchMode)) maps.settleSelection();
        matchMode = BattleLaunchSpec.matchMode(value);
        refresh();
    }

    private void chooseWeapon(String value) {
        if (downloading) return;
        duelWeapon = BattleLaunchSpec.duelWeapon(value);
        refresh();
    }

    private void chooseDifficulty(String value) {
        if (downloading || value.equals(difficulty)) return;
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
        if (downloading) return;
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
        maps.setInteractionEnabled(!downloading);
        detail.setVisibility(botMatch ? VISIBLE : GONE);
        detail.setText("You: " + ("cannon".equals(duelWeapon)
                ? "Cannon  ·  Bot: Rockets" : "Rockets  ·  Bot: Cannon"));
        music.setEnabled(!downloading && musicChecked && !musicCached);
        music.setAlpha(downloading ? .45f : musicCached ? .85f : 1f);
        boolean largeText = getResources().getConfiguration().fontScale > 1.25f;
        music.setMaxLines(largeText ? 1 : 2);
        music.setText(!musicChecked ? "Checking music…"
                : musicCached ? "Music ready" : largeText ? "Download music"
                : "Download music\nOptional · play in-game");
        music.setContentDescription(!musicChecked ? "Checking optional music download"
                : musicCached ? "Music ready" : "Download music to play in-game, optional");
        String name = catalog.level(map).name;
        start.setText(downloading ? "WAIT…" : botMatch ? "PLAY 1v1" : "PLAY");
        start.setContentDescription("Start game, " + (botMatch ? "1v1 vs Bot" : name));
        start.setEnabled(!downloading);
        start.setAlpha(start.isEnabled() ? 1f : .45f);
        rewards.setEnabled(!downloading);
        rewards.setAlpha(downloading ? .45f : 1f);
        savedGames.setEnabled(!downloading);
        savedGames.setAlpha(downloading ? .45f : 1f);
        applyCompactTowersStyle();
        if (panel != null) panel.requestLayout();
    }

    private void applyCompactTowersStyle() {
        boolean compact = !"duel".equals(matchMode);
        message.setBackground(shape(0xFF101F26, compact ? 0 : 0xFF29414A, 7));
        for (Button b : new Button[] {towers, duel, cannon, rockets, easy, medium, hard}) {
            boolean selected = b.isSelected();
            int fill = compact ? (selected ? 0xFF28574E : Color.TRANSPARENT)
                    : (selected ? 0xFF18343B : 0xFF101F26);
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x228BD3CC),
                    new InsetDrawable(shape(fill, compact ? 0 : selected ? TEAL : 0xFF29414A, 7),
                            dp(4), dp(8), dp(4), dp(8)), null));
            b.setPadding(dp(5), 0, dp(5), 0);
        }
        for (Button b : new Button[] {start, music, cancel}) {
            boolean primary = b == start;
            int fill = primary ? TEAL : b == music ? Color.TRANSPARENT : 0xFF14252D;
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                    new InsetDrawable(shape(fill, 0, 7), 0, dp(8), 0, dp(8)), null));
            b.setPadding(dp(b == music ? 8 : 5), 0, dp(5), 0);
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
    }

    void setMusicState(boolean ready, boolean on) {
        musicChecked = true;
        musicCached = ready;
        refresh();
    }

    void musicDownloadProgress(long bytes, boolean verifying) {
        setDownloading(true);
        progress.setIndeterminate(verifying);
        progress.setProgress((int) (bytes * 1000 / MusicPackStore.BYTES));
        showStatus(verifying ? "Verifying music download…"
                : String.format(Locale.ROOT, "Music download · %d%% · %.1f / %.1f MiB",
                        bytes * 100 / MusicPackStore.BYTES, bytes / 1048576.0,
                        MusicPackStore.BYTES / 1048576.0), false);
    }

    void setDownloading(boolean value) {
        downloading = value;
        cancel.setVisibility(value ? VISIBLE : GONE);
        progress.setVisibility(value ? VISIBLE : GONE);
        refresh();
    }

    void showError(String value) { setDownloading(false); showStatus(value, true); }

    void showStatus(String value, boolean error) {
        status.setText(value);
        status.setTextColor(error ? 0xFFFFB6A5 : MUTED);
        message.setVisibility(VISIBLE);
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
        button.setText(value);
        button.setTextColor(primary ? 0xFF0B151B : INK);
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
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                shape(primary ? TEAL : 0xFF14252D, primary ? TEAL : 0xFF29414A, 6), null));
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
                    maps, detail, launchActions, message, progress}) addView(view);
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
            int desiredPreview = Math.max(dp(144), Math.min(dp(240), Math.round(h * .44f)));
            previewHeight = botMatch ? 0 : Math.max(dp(120), Math.min(desiredPreview, available - fixed));
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
            float fontScale = getResources().getConfiguration().fontScale;
            LinearLayout.LayoutParams playParams = (LinearLayout.LayoutParams) start.getLayoutParams();
            int playWidth = Math.min(panelWidth / 2, Math.round(dp(112) * Math.min(1.4f, fontScale)));
            if (playParams.width != playWidth) {
                playParams.width = playWidth;
                start.setLayoutParams(playParams);
            }
            LinearLayout.LayoutParams musicParams = (LinearLayout.LayoutParams) music.getLayoutParams();
            int musicWidth = Math.max(0, panelWidth - playWidth - musicParams.leftMargin);
            if (musicParams.width != musicWidth) {
                musicParams.width = musicWidth;
                music.setLayoutParams(musicParams);
            }
            exact(launchActions, panelWidth, dp(48));
            exact(message, Math.min(w - outer * 2, dp(880)), dp(52));
            exact(progress, Math.max(0, message.getMeasuredWidth() - dp(20)), dp(4));
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
            progress.layout(messageX + dp(10), messageY + dp(48),
                    messageX + messageWidth - dp(10), messageY + dp(52));
        }
    }
}
