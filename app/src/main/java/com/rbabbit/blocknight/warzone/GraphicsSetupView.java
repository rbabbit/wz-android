package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Compact game setup. Map, download and music actions retain their existing contracts. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions {
        void start(String graphicsMode, String map, String matchMode, String duelWeapon);
        void cancel();
        void music();
        void download();
        void map(String id);
    }

    private static final int INK = 0xFFF0F3ED;
    private static final int MUTED = 0xFFA6B9BE;
    private static final int TEAL = 0xFF8BD3CC;
    private final Actions actions;
    private final Typeface face;
    private final MapCard mapOne, mapTwo;
    private final LinearLayout heading, matchChoices, weaponChoices, options, message;
    private final TextView detail, status;
    private final Button towers, duel, cannon, rockets, graphics, start, cancel, music, download;
    private final ProgressBar progress;
    private final LaunchPanel panel;
    private String mode, map, matchMode, duelWeapon;
    private int viewportHeight;
    private boolean cached, downloading, musicChecked, musicCached, musicOn;

    GraphicsSetupView(Context context, String selected, String selectedMap,
            String selectedMatch, String selectedWeapon, Actions actions) {
        super(context);
        this.actions = actions;
        mode = "high".equals(selected) ? "high" : "normal";
        map = "td1".equals(selectedMap) ? "td1" : "td2";
        matchMode = BattleLaunchSpec.matchMode(selectedMatch);
        duelWeapon = BattleLaunchSpec.duelWeapon(selectedWeapon);
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF0B151B);
        setClickable(true);
        setFocusable(true);
        addView(new WarzoneSplashView(context), new LayoutParams(-1, -1));

        heading = new LinearLayout(context);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("WARZONE TOWERS", 24, INK);
        title.setTypeface(face);
        title.setSingleLine(true);
        title.setAutoSizeTextTypeUniformWithConfiguration(14, 24, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        title.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(title, new LinearLayout.LayoutParams(0, -1, 1));

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

        mapOne = new MapCard("DUSTFALL", "Raised platforms");
        mapTwo = new MapCard("IRON VALLEY", "Classic battlefield");
        mapOne.setOnClickListener(v -> chooseMap("td1"));
        mapTwo.setOnClickListener(v -> chooseMap("td2"));

        detail = text("30 waves \u00b7 Defend your command centre", 12, MUTED);
        detail.setGravity(Gravity.CENTER_VERTICAL);
        detail.setMaxLines(2);

        start = button("PLAY", true);
        start.setOnClickListener(v -> {
            if (start.isEnabled()) actions.start(mode, map, matchMode, duelWeapon);
        });

        options = new LinearLayout(context);
        options.setGravity(Gravity.CENTER_VERTICAL);
        graphics = button("GRAPHICS\nNORMAL", false);
        graphics.setOnClickListener(v -> showGraphics());
        music = button("MUSIC\nCHECKING\u2026", false);
        music.setEnabled(false);
        music.setOnClickListener(v -> actions.music());
        download = button("HQ PACK\n95 MiB", false);
        download.setOnClickListener(v -> actions.download());
        for (Button b : new Button[] {graphics, music, download}) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1);
            if (b != graphics) p.leftMargin = dp(6);
            options.addView(b, p);
        }

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
        message.setBackground(shape(0xFF101F26, 0xFF29414A, 7));
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
        addView(scroll, new LayoutParams(-1, -1));
        refresh();
    }

    @Override protected void onMeasure(int width, int height) {
        viewportHeight = MeasureSpec.getSize(height);
        super.onMeasure(width, height);
    }

    private Button choice(String label) {
        Button b = button(label, false);
        b.setTextSize(13);
        b.setSingleLine(true);
        b.setEllipsize(TextUtils.TruncateAt.END);
        return b;
    }

    private LinearLayout choiceRow(Button first, Button second) {
        LinearLayout row = new LinearLayout(getContext());
        row.addView(first, new LinearLayout.LayoutParams(0, dp(48), 1));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1);
        p.leftMargin = dp(6);
        row.addView(second, p);
        return row;
    }

    private void decorateChoice(Button b, boolean selected, String description) {
        if (b.getTag() == null || b.isSelected() != selected) {
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x228BD3CC),
                    shape(selected ? 0xFF18343B : 0xFF101F26,
                            selected ? TEAL : 0xFF29414A, 6), null));
            b.setTag(Boolean.TRUE);
        }
        b.setSelected(selected);
        b.setEnabled(!downloading);
        b.setAlpha(downloading ? .5f : 1f);
        b.setContentDescription(description + ", " + (selected ? "selected" : "not selected"));
    }

    private void chooseMatch(String value) {
        if (downloading) return;
        matchMode = BattleLaunchSpec.matchMode(value);
        refresh();
    }

    private void chooseWeapon(String value) {
        if (downloading) return;
        duelWeapon = BattleLaunchSpec.duelWeapon(value);
        refresh();
    }

    private String mapName() {
        return "td1".equals(map) ? "Dustfall" : "Iron Valley";
    }

    private void chooseMap(String id) {
        if (downloading) return;
        map = id;
        actions.map(id);
        refresh();
    }

    private void showGraphics() {
        if (downloading) return;
        PopupMenu popup = new PopupMenu(getContext(), graphics);
        popup.getMenu().add(0, 1, Menu.NONE, "Normal")
                .setCheckable(true).setChecked("normal".equals(mode));
        popup.getMenu().add(0, 2, Menu.NONE, "High Quality")
                .setCheckable(true).setChecked("high".equals(mode));
        popup.getMenu().setGroupCheckable(0, true, true);
        popup.setOnMenuItemClickListener(item -> {
            mode = item.getItemId() == 2 ? "high" : "normal";
            refresh();
            return true;
        });
        popup.show();
    }

    private void refresh() {
        boolean botMatch = "duel".equals(matchMode);
        decorateChoice(towers, !botMatch, "Game mode, Towers");
        decorateChoice(duel, botMatch, "Game mode, 1v1 vs Bot");
        decorateChoice(cannon, "cannon".equals(duelWeapon), "Your weapon, Cannon");
        decorateChoice(rockets, "rockets".equals(duelWeapon), "Your weapon, Rockets");
        weaponChoices.setVisibility(botMatch ? VISIBLE : GONE);
        mapOne.setVisibility(botMatch ? GONE : VISIBLE);
        mapTwo.setVisibility(botMatch ? GONE : VISIBLE);
        detail.setText(botMatch
                ? "You: " + ("cannon".equals(duelWeapon) ? "Cannon  ·  Bot: Rockets" : "Rockets  ·  Bot: Cannon")
                : "30 waves · Defend your command centre");
        mapOne.decorate("td1".equals(map), "Dustfall", !downloading);
        mapTwo.decorate("td2".equals(map), "Iron Valley", !downloading);
        graphics.setText("GRAPHICS\n" + ("high".equals(mode) ? "HQ" : "NORMAL"));
        graphics.setContentDescription(
                "Graphics options, " + ("high".equals(mode) ? "High Quality" : "Normal"));
        graphics.setEnabled(!downloading);
        graphics.setAlpha(downloading ? .45f : 1f);
        music.setEnabled(!downloading && musicChecked);
        music.setAlpha(music.isEnabled() ? 1f : .45f);
        music.setText(!musicChecked ? "MUSIC\nCHECKING\u2026"
                : musicCached ? "MUSIC\n" + (musicOn ? "ON" : "OFF") : "MUSIC\nCHOOSE");
        download.setText(cached ? "HQ PACK\nREADY" : "HQ PACK\n95 MiB");
        download.setContentDescription(
                cached ? "HQ pack ready offline" : "Download High Quality graphics");
        download.setEnabled(!downloading && !cached);
        download.setAlpha(downloading ? .45f : cached ? .7f : 1f);
        start.setText(downloading ? "DOWNLOADING\u2026"
                : botMatch ? "PLAY 1v1" : "PLAY " + mapName().toUpperCase(java.util.Locale.ROOT));
        start.setContentDescription("Start game, " + (botMatch ? "1v1 vs Bot" : mapName()));
        start.setEnabled(!downloading && musicChecked && (!"high".equals(mode) || cached));
        start.setAlpha(start.isEnabled() ? 1f : .45f);
        applyCompactTowersStyle();
        if (panel != null) panel.requestLayout();
    }

    /** Keep the native launcher controls in the same flat visual family. */
    private void applyCompactTowersStyle() {
        boolean compact = !"duel".equals(matchMode);
        if (panel != null) panel.base.setBackground(shape(0xEF0B151B, compact ? 0 : 0xFF203640, 12));
        message.setBackground(shape(0xFF101F26, compact ? 0 : 0xFF29414A, 7));
        for (Button b : new Button[] {towers, duel, cannon, rockets}) {
            boolean selected = b.isSelected();
            int fill = compact ? (selected ? 0xFF28574E : Color.TRANSPARENT)
                    : (selected ? 0xFF18343B : 0xFF101F26);
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x228BD3CC),
                    shape(fill, compact ? 0 : selected ? TEAL : 0xFF29414A, 6), null));
        }
        for (Button b : new Button[] {start, graphics, music, download, cancel}) {
            boolean primary = b == start;
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                    shape(primary ? TEAL : 0xFF14252D,
                            compact ? 0 : primary ? TEAL : 0xFF29414A, 6), null));
        }
        for (MapCard card : new MapCard[] {mapOne, mapTwo}) {
            boolean selected = card.isSelected();
            card.setBackground(shape(selected ? (compact ? 0xFF28574E : 0xFF18343B) : 0xFF101F26,
                    compact ? 0 : selected ? TEAL : 0xFF29414A, 7));
            card.mark.setVisibility(!compact && selected ? VISIBLE : INVISIBLE);
        }
    }

    String selectedMode() { return mode; }
    String selectedMap() { return map; }
    String selectedMatchMode() { return matchMode; }
    String selectedDuelWeapon() { return duelWeapon; }

    void setCached(boolean value) {
        cached = value;
        refresh();
    }

    void setMusicState(boolean ready, boolean on) {
        musicChecked = true;
        musicCached = ready;
        musicOn = on;
        music.setContentDescription("Music settings");
        refresh();
    }

    void setDownloading(boolean value) {
        downloading = value;
        cancel.setVisibility(value ? VISIBLE : GONE);
        progress.setVisibility(value ? VISIBLE : GONE);
        refresh();
        panel.requestLayout();
    }

    void downloadProgress(long bytes, boolean verifying) {
        setDownloading(true);
        progress.setIndeterminate(verifying);
        progress.setProgress((int) (bytes * 1000 / GraphicsPackStore.BYTES));
        showStatus(verifying ? "Verifying HQ download\u2026"
                : String.format(java.util.Locale.ROOT, "HQ download \u00b7 %d%% \u00b7 %.1f / 95 MiB",
                        bytes * 100 / GraphicsPackStore.BYTES, bytes / 1048576.0), false);
    }

    void showError(String value) {
        setDownloading(false);
        showStatus(value, true);
    }

    void showStatus(String value, boolean error) {
        status.setText(value);
        status.setTextColor(error ? 0xFFFFB6A5 : MUTED);
        message.setVisibility(VISIBLE);
        panel.requestLayout();
    }

    private GradientDrawable shape(int fill, int border, int radius) {
        GradientDrawable b = new GradientDrawable();
        b.setColor(fill);
        b.setCornerRadius(dp(radius));
        if (border != 0) b.setStroke(dp(1), border);
        return b;
    }

    private TextView text(String value, int size, int colour) {
        TextView t = new TextView(getContext());
        t.setText(value);
        t.setTextSize(size);
        t.setTextColor(colour);
        t.setIncludeFontPadding(false);
        return t;
    }

    private Button button(String value, boolean primary) {
        Button b = new Button(getContext());
        b.setText(value);
        b.setTextColor(primary ? 0xFF0B151B : INK);
        b.setTextSize(primary ? 16 : 11);
        b.setTypeface(face);
        b.setAllCaps(false);
        b.setSingleLine(primary);
        b.setMaxLines(primary ? 1 : 2);
        b.setGravity(Gravity.CENTER);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setPadding(dp(5), 0, dp(5), 0);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                shape(primary ? TEAL : 0xFF14252D, primary ? TEAL : 0xFF29414A, 6), null));
        return b;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class MapCard extends FrameLayout {
        private final View mark;
        private final TextView note;
        private boolean decorated, previousSelection;

        MapCard(String title, String description) {
            super(GraphicsSetupView.this.getContext());
            setClickable(true);
            setFocusable(true);
            LinearLayout copy = new LinearLayout(getContext());
            copy.setOrientation(LinearLayout.VERTICAL);
            copy.setGravity(Gravity.CENTER_VERTICAL);
            TextView name = text(title, 15, INK);
            name.setTypeface(face);
            name.setSingleLine(true);
            copy.addView(name);
            note = text(description, 11, MUTED);
            note.setSingleLine(true);
            note.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
            noteParams.topMargin = dp(2);
            copy.addView(note, noteParams);
            LayoutParams copyParams = new LayoutParams(-1, -1);
            copyParams.setMargins(dp(14), dp(5), dp(10), dp(5));
            addView(copy, copyParams);
            mark = new View(getContext());
            mark.setBackgroundColor(TEAL);
            LayoutParams markParams = new LayoutParams(dp(3), -1, Gravity.START);
            markParams.topMargin = dp(10);
            markParams.bottomMargin = dp(10);
            addView(mark, markParams);
            setForeground(new RippleDrawable(ColorStateList.valueOf(0x228BD3CC), null, null));
        }

        void decorate(boolean selected, String name, boolean enabled) {
            setSelected(selected);
            setContentDescription(name + " map, " + (selected ? "selected" : "not selected"));
            mark.setVisibility(selected ? VISIBLE : INVISIBLE);
            setEnabled(enabled);
            setAlpha(enabled ? 1f : .5f);
            if (!decorated || selected != previousSelection) {
                setBackground(shape(selected ? 0xFF18343B : 0xFF101F26,
                        selected ? TEAL : 0xFF29414A, 7));
                decorated = true;
                previousSelection = selected;
            }
        }

        void setCompact(boolean compact) {
            note.setVisibility(compact ? GONE : VISIBLE);
        }
    }

    /** The deck adapts its map cards before reducing any actionable touch target. */
    private final class LaunchPanel extends FrameLayout {
        private final View base;
        private int left, top, panelWidth, innerWidth, contentHeight, gap, headerHeight;
        private int mapHeight, mapSpan, detailHeight, messageHeight;
        private boolean verticalMaps;

        LaunchPanel(Context context) {
            super(context);
            base = new View(context);
            base.setBackground(shape(0xEF0B151B, 0xFF203640, 12));
            addView(base);
            addView(heading);
            addView(matchChoices);
            addView(weaponChoices);
            addView(mapOne);
            addView(mapTwo);
            addView(detail);
            addView(start);
            addView(options);
            addView(message);
            addView(progress);
        }

        private void exact(View v, int w, int h) {
            v.measure(MeasureSpec.makeMeasureSpec(Math.max(0, w), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(Math.max(0, h), MeasureSpec.EXACTLY));
        }

        @Override protected void onMeasure(int width, int height) {
            int w = MeasureSpec.getSize(width), h = viewportHeight;
            boolean botMatch = "duel".equals(matchMode);
            boolean enlarged = getResources().getConfiguration().fontScale > 1.15f;
            int outer = dp(16), inset = dp(16);
            messageHeight = message.getVisibility() == VISIBLE ? dp(64) : 0;
            int available = Math.max(0, h - outer * 2 - messageHeight);
            panelWidth = Math.min(w - outer * 2, Math.min(dp(410),
                    Math.max(dp(280), Math.round(w * .44f))));
            innerWidth = Math.max(0, panelWidth - inset * 2);
            headerHeight = dp(enlarged ? 48 : 44);
            detailHeight = dp(enlarged ? 34 : 26);
            gap = dp(12);
            mapHeight = dp(enlarged ? 64 : 54);
            int stackedSpan = mapHeight * 2 + dp(8);
            int other = headerHeight + gap * 3 + detailHeight + dp(144);
            verticalMaps = !botMatch && available >= other + stackedSpan;
            mapSpan = botMatch ? dp(48) : verticalMaps ? stackedSpan : mapHeight;
            contentHeight = other + mapSpan;
            if (contentHeight > available) {
                detailHeight = 0;
                contentHeight = headerHeight + gap * 3 + mapSpan + dp(144);
            }
            if (contentHeight > available) {
                // The shared artwork still carries the game title on very short screens.
                headerHeight = 0;
                gap = dp(8);
                contentHeight = gap * 3 + mapSpan + dp(144);
            }
            boolean compactCards = contentHeight > available;
            if (compactCards) {
                // Four actionable rows retain 48dp targets, including mode and
                // weapon/map choices. Decorative text yields before controls.
                verticalMaps = false;
                mapHeight = dp(48);
                mapSpan = mapHeight;
                gap = 0;
                contentHeight = dp(192);
            }
            mapOne.setCompact(compactCards);
            mapTwo.setCompact(compactCards);
            left = outer;
            top = outer + Math.max(0, (available - contentHeight) / 2);
            exact(base, panelWidth, contentHeight + inset * 2);
            exact(heading, innerWidth, headerHeight);
            exact(matchChoices, innerWidth, dp(48));
            exact(weaponChoices, innerWidth, botMatch ? dp(48) : 0);
            exact(mapOne, verticalMaps ? innerWidth : (innerWidth - dp(8)) / 2, mapHeight);
            exact(mapTwo, verticalMaps ? innerWidth : (innerWidth - dp(8)) / 2, mapHeight);
            exact(detail, innerWidth, detailHeight);
            exact(start, innerWidth, dp(48));
            exact(options, innerWidth, dp(48));
            exact(message, Math.min(w - outer * 2, dp(880)), dp(52));
            exact(progress, Math.min(w - outer * 2, dp(880)) - dp(20), dp(4));
            // A short screen with a download/status row scrolls rather than
            // clipping actionable controls or shrinking their touch targets.
            setMeasuredDimension(w, Math.max(h, contentHeight + outer * 2 + messageHeight));
        }

        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            int x = left + dp(16), y = top;
            base.layout(left, Math.max(dp(4), top - dp(16)), left + panelWidth,
                    top + contentHeight + dp(16));
            heading.layout(x, y, x + innerWidth, y + headerHeight);
            y += headerHeight;
            matchChoices.layout(x, y, x + innerWidth, y + dp(48));
            y += dp(48) + gap;
            int cardWidth = mapOne.getMeasuredWidth();
            if ("duel".equals(matchMode)) {
                weaponChoices.layout(x, y, x + innerWidth, y + dp(48));
                mapOne.layout(0, 0, 0, 0);
                mapTwo.layout(0, 0, 0, 0);
            } else {
                weaponChoices.layout(0, 0, 0, 0);
                mapOne.layout(x, y, x + cardWidth, y + mapHeight);
                int secondX = verticalMaps ? x : x + cardWidth + dp(8);
                int secondY = verticalMaps ? y + mapHeight + dp(8) : y;
                mapTwo.layout(secondX, secondY, secondX + cardWidth, secondY + mapHeight);
            }
            y += mapSpan + gap;
            detail.layout(x, y, x + innerWidth, y + detailHeight);
            y += detailHeight;
            start.layout(x, y, x + innerWidth, y + dp(48));
            y += dp(48) + gap;
            options.layout(x, y, x + innerWidth, y + dp(48));
            int messageWidth = message.getMeasuredWidth();
            int messageX = (getWidth() - messageWidth) / 2;
            int messageY = getHeight() - dp(60);
            message.layout(messageX, messageY, messageX + messageWidth, messageY + dp(52));
            progress.layout(messageX + dp(10), messageY + dp(48),
                    messageX + messageWidth - dp(10), messageY + dp(52));
        }
    }
}
