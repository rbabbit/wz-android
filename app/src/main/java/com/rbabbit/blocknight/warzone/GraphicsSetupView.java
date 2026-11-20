package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Native Home container and compact, landscape Towers map picker. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions {
        void start(String graphicsMode, String map, String matchMode, String duelWeapon);
        void rewards();
        void savedGames();
        default void survival() {}
        void campaign();
        void ffa();
        void multiplayer();
        void guide();
        void hub();
        default void about() {}
        default void playGames() {}
        void campaignContinue();
        void campaignNew();
        void map(String id);
        default void homePage(boolean modesVisible) {}
        default void updates() {}
    }

    private static final int INK = TowersTheme.TEXT, MUTED = TowersTheme.SECONDARY;
    private final Actions actions;
    private final Typeface face;
    private final MapLevelCatalog catalog;
    private final LinearLayout matchChoices, weaponChoices, difficultyChoices, launchActions, message;
    private final TextView detail, status;
    private final Button towers, duel, cannon, rockets, easy, medium, hard;
    private final Button start, rewards, savedGames, homeBack, survival;
    private final LinearLayout homeActions;
    private final MapPreviewPager maps;
    private final WarzoneSplashView splash;
    private final TextView version;
    private final LaunchPanel panel;
    private final FrameLayout mapScroll;
    private final HomeModesView homeModes;
    private final TextView screenTitle, mapTitle, mapMeta, mapDescription, mapCompletion, mapPosition;
    private final ScrollView mapFacts;
    private final Button previous, next;
    private String map, matchMode, duelWeapon, difficulty;
    private int viewportHeight, insetLeft, insetTop, insetRight, insetBottom;
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
        maps.setPreviewOnly(true);
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

        mapTitle=text("",26,INK);mapTitle.setTypeface(face);mapTitle.setMaxLines(2);
        mapTitle.setEllipsize(TextUtils.TruncateAt.END);
        mapMeta=text("",13,INK);
        mapDescription=text("",13,MUTED);
        mapCompletion=text("\u2605 Complete",11,MUTED);
        LinearLayout factsContent=new LinearLayout(context);factsContent.setOrientation(LinearLayout.VERTICAL);
        factsContent.addView(mapTitle,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout.LayoutParams metaParams=new LinearLayout.LayoutParams(-1,-2);metaParams.topMargin=dp(4);
        factsContent.addView(mapMeta,metaParams);
        LinearLayout.LayoutParams descriptionParams=new LinearLayout.LayoutParams(-1,-2);descriptionParams.topMargin=dp(12);
        factsContent.addView(mapDescription,descriptionParams);
        LinearLayout.LayoutParams completionParams=new LinearLayout.LayoutParams(-1,-2);completionParams.topMargin=dp(8);
        factsContent.addView(mapCompletion,completionParams);
        mapFacts=new ScrollView(context);mapFacts.setFillViewport(false);mapFacts.setOverScrollMode(OVER_SCROLL_NEVER);
        mapFacts.setContentDescription("Selected Towers map details; scroll for more information when needed");
        mapFacts.addView(factsContent,new ScrollView.LayoutParams(-1,-2));
        previous=button("\u2039",false);next=button("\u203a",false);
        previous.setTextSize(28);next.setTextSize(28);
        previous.setContentDescription("Previous Towers map, or swipe right");
        next.setContentDescription("Next Towers map, or swipe left");
        previous.setOnClickListener(v -> maps.browseBy(-1));next.setOnClickListener(v -> maps.browseBy(1));
        mapPosition=text("",14,MUTED);mapPosition.setTypeface(face);mapPosition.setGravity(Gravity.CENTER);
        mapPosition.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);

        panel = new LaunchPanel(context);
        mapScroll = new FrameLayout(context);
        mapScroll.addView(panel, new FrameLayout.LayoutParams(-1, -1));
        LayoutParams scrollParams = new LayoutParams(-1, -1);
        addView(mapScroll, scrollParams);
        rewards = button("REWARDS 0", false);
        rewards.setTextSize(13);
        rewards.setSingleLine(true);
        android.graphics.drawable.Drawable crystal = context.getDrawable(R.drawable.reward_crystal);
        crystal.setBounds(0, 0, dp(20), dp(20));
        rewards.setCompoundDrawables(crystal, null, null, null);
        rewards.setCompoundDrawablePadding(dp(6));
        rewards.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 7), 0, dp(4), 0, dp(4)), null));
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
                new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 7), 0, dp(4), 0, dp(4)), null));
        savedGames.setPadding(dp(10), 0, dp(10), 0);
        savedGames.setOnClickListener(v -> {
            maps.settleSelection();
            actions.savedGames();
        });
        homeActions = new HeaderRow(context);
        homeActions.setGravity(Gravity.CENTER_VERTICAL);
        homeBack = button("BACK", false);
        homeBack.setTextSize(13);
        homeBack.setSingleLine(true);
        homeBack.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 7), 0, dp(4), 0, dp(4)), null));
        homeBack.setPadding(dp(10), 0, dp(10), 0);
        homeBack.setContentDescription("Back to Campaign and Towers");
        homeBack.setOnClickListener(v -> handleHomeBack());
        homeActions.addView(homeBack, new LinearLayout.LayoutParams(-2, dp(48)));
        screenTitle=text("TOWERS",20,INK);screenTitle.setTypeface(face);screenTitle.setGravity(Gravity.CENTER_VERTICAL);
        homeActions.addView(screenTitle,new LinearLayout.LayoutParams(-2,dp(48)));
        survival = button("PLAY SURVIVAL", false);
        survival.setTextSize(13); survival.setSingleLine(true); survival.setPadding(dp(10), 0, dp(10), 0);
        survival.setContentDescription("Play Survival, choose a map");
        survival.setOnClickListener(v -> { maps.settleSelection(); actions.survival(); });
        homeActions.addView(survival, new LinearLayout.LayoutParams(-2, dp(48)));
        LinearLayout.LayoutParams rewardsParams = new LinearLayout.LayoutParams(-2, dp(48));
        rewardsParams.leftMargin = dp(8);
        homeActions.addView(rewards, rewardsParams);
        LinearLayout.LayoutParams savedParams = new LinearLayout.LayoutParams(-2, dp(48));
        savedParams.leftMargin = dp(8);
        homeActions.addView(savedGames, savedParams);
        LayoutParams homeParams = new LayoutParams(-1, dp(48), Gravity.TOP | Gravity.START);
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
        setOnApplyWindowInsetsListener((view,insets) -> {
            int left=0,top=0,right=0,bottom=0;
            if(Build.VERSION.SDK_INT>=30) {
                android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
            } else {
                left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();
                right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();
                if(Build.VERSION.SDK_INT>=28&&insets.getDisplayCutout()!=null) {
                    left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());
                    top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                    right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());
                    bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            if(left!=insetLeft||top!=insetTop||right!=insetRight||bottom!=insetBottom) {
                insetLeft=left;insetTop=top;insetRight=right;insetBottom=bottom;requestLayout();
            }
            return insets;
        });
    }

    @Override protected void onAttachedToWindow() {super.onAttachedToWindow();requestApplyInsets();}

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
        viewportHeight = Math.max(0, MeasureSpec.getSize(height));
        TowersSetupLayout layout=TowersSetupLayout.calculate(MeasureSpec.getSize(width),viewportHeight,
                getResources().getDisplayMetrics().density,insetLeft,insetTop,insetRight,insetBottom,dp(136));
        LayoutParams params = (LayoutParams) homeActions.getLayoutParams();
        params.leftMargin=layout.header.left;params.topMargin=layout.header.top;
        params.width=layout.header.width();params.height=layout.header.height();
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
        if(mapFacts!=null&&!map.equals(BattleLaunchSpec.mapId(id)))mapFacts.scrollTo(0,0);
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
        maps.setPreviewOnly(!botMatch);
        maps.setInteractionEnabled(true);
        mapFacts.setVisibility(botMatch?GONE:VISIBLE);
        previous.setVisibility(botMatch?GONE:VISIBLE);next.setVisibility(botMatch?GONE:VISIBLE);
        mapPosition.setVisibility(botMatch?GONE:VISIBLE);
        updateMapDetails();
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

    private void updateMapDetails() {
        MapLevelCatalog.Level level=catalog.level(map);
        mapTitle.setText(level.name.toUpperCase(Locale.ROOT));
        mapMeta.setText(level.rounds+" waves · "+level.preparationSeconds+"s prep");
        mapDescription.setText(level.description);
        mapCompletion.setVisibility(maps.isCompleted(map)?VISIBLE:GONE);
        mapCompletion.setContentDescription(level.name+", Complete");
        mapPosition.setText((maps.selectedIndex()+1)+" / "+maps.pageCount());
        previous.setEnabled(maps.selectedIndex()>0);next.setEnabled(maps.selectedIndex()<maps.pageCount()-1);
    }

    private void applyCompactTowersStyle() {
        boolean compact = !"duel".equals(matchMode);
        message.setBackground(shape(compact ? TowersTheme.PANEL : 0xFF101F26, compact ? 0 : 0xFF29414A, 7));
        for (Button b : new Button[] {towers, duel, cannon, rockets, easy, medium, hard}) {
            boolean selected = b.isSelected();
            int fill = compact ? (selected ? TowersTheme.PRIMARY : TowersTheme.CONTROL)
                    : (selected ? 0xFF18343B : 0xFF101F26);
            if (compact) b.setTextColor(TowersTheme.buttonText(selected));
            else b.setTextColor(INK);
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(compact
                    ? selected ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE : 0x228BD3CC),
                    new InsetDrawable(compact ? TowersTheme.control(getContext(), fill, 7)
                            : shape(fill, selected ? 0xFF8BD3CC : 0xFF29414A, 7),
                            compact?0:dp(4), dp(compact?4:8), compact?0:dp(4), dp(compact?4:8)), null));
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
                            : shape(fill, 0, 7), 0, dp(compact?4:8), 0, dp(compact?4:8)), null));
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

    void setCompletedMaps(Set<String> completedMaps) { maps.setCompletedMaps(completedMaps);updateMapDetails(); }

    void setCampaignBusy(boolean busy) { homeModes.setCampaignBusy(busy); }

    void showTowersMap() {
        maps.settleSelection();
        towersMapVisible = true;
        homeModes.setVisibility(GONE);
        mapScroll.setVisibility(VISIBLE);
        homeActions.setVisibility(VISIBLE);
        version.setVisibility(GONE);
        splash.setVisibility("duel".equals(matchMode)?VISIBLE:GONE);
        // Switching modes also invalidates a pending Campaign inspection.
        actions.map(map);
        actions.homePage(false);
    }

    boolean isHomeModesVisible() { return !towersMapVisible; }

    void focusPlayGames() { homeModes.focusPlayGames(); }

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
        actions.homePage(true);
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

    /** Content-sized native header, with title left and saved actions right. */
    private final class HeaderRow extends LinearLayout {
        private int backWidth,rewardWidth,saveWidth,titleWidth,survivalWidth;
        HeaderRow(Context context) {super(context);}
        @Override protected void onMeasure(int width,int height) {
            int w=MeasureSpec.getSize(width),h=MeasureSpec.getSize(height),gap=dp(8);
            backWidth=Math.max(dp(64),desiredButtonWidth(homeBack));
            rewardWidth=Math.max(dp(100),desiredButtonWidth(rewards));
            saveWidth=Math.max(dp(96),desiredButtonWidth(savedGames));
            survivalWidth=Math.max(dp(122),desiredButtonWidth(survival));
            int remaining=Math.max(0,w-backWidth-gap*4);
            if(rewardWidth+saveWidth+survivalWidth>remaining) {
                int total=rewardWidth+saveWidth+survivalWidth;
                rewardWidth=Math.round(remaining*rewardWidth/(float)Math.max(1,total));
                saveWidth=Math.round(remaining*saveWidth/(float)Math.max(1,total));
                survivalWidth=remaining-rewardWidth-saveWidth;
            }
            titleWidth=Math.max(0,w-backWidth-rewardWidth-saveWidth-survivalWidth-gap*4);
            View[] views={homeBack,screenTitle,survival,rewards,savedGames};int[] widths={backWidth,titleWidth,survivalWidth,rewardWidth,saveWidth};
            for(int i=0;i<views.length;i++)views[i].measure(MeasureSpec.makeMeasureSpec(widths[i],MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(h,MeasureSpec.EXACTLY));
            setMeasuredDimension(w,h);
        }
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b) {
            int w=getWidth(),h=getHeight(),gap=dp(8);
            homeBack.layout(0,0,backWidth,h);
            screenTitle.layout(backWidth+gap,0,backWidth+gap+titleWidth,h);
            savedGames.layout(w-saveWidth,0,w,h);
            rewards.layout(w-saveWidth-gap-rewardWidth,0,w-saveWidth-gap,h);
            survival.layout(w-saveWidth-rewardWidth-survivalWidth-gap*2,0,w-saveWidth-rewardWidth-gap*2,h);
        }
    }

    /** Fixed split picker. Only the selected map facts scroll; Play stays visible. */
    private final class LaunchPanel extends FrameLayout {
        private int left, top, panelWidth, contentHeight, gap, previewHeight;
        private int messageHeight, detailHeight;
        private TowersSetupLayout towersLayout;

        LaunchPanel(Context context) {
            super(context);
            for (View view : new View[] {matchChoices, weaponChoices, difficultyChoices,
                    maps, detail, launchActions, message,mapFacts,previous,mapPosition,next}) addView(view);
        }

        private void exact(View view, int width, int height) {
            view.measure(MeasureSpec.makeMeasureSpec(Math.max(0, width), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(Math.max(0, height), MeasureSpec.EXACTLY));
        }

        @Override protected void onMeasure(int width, int height) {
            int w = MeasureSpec.getSize(width), h = viewportHeight;
            boolean botMatch = "duel".equals(matchMode);
            if(!botMatch) {
                float density=getResources().getDisplayMetrics().density;
                towersLayout=TowersSetupLayout.calculate(w,h,density,insetLeft,insetTop,insetRight,insetBottom,
                        Math.max(dp(136),desiredButtonWidth(start)));
                exact(matchChoices,0,0);exact(weaponChoices,0,0);exact(detail,0,0);
                exact(difficultyChoices,towersLayout.difficulty.width(),towersLayout.difficulty.height());
                exact(maps,towersLayout.preview.width(),towersLayout.preview.height());
                exact(previous,towersLayout.previous.width(),towersLayout.previous.height());
                exact(mapPosition,towersLayout.position.width(),towersLayout.position.height());
                exact(next,towersLayout.next.width(),towersLayout.next.height());
                messageHeight=message.getVisibility()==VISIBLE?dp(48):0;
                exact(mapFacts,towersLayout.facts.width(),Math.max(0,towersLayout.facts.height()-messageHeight));
                exact(message,towersLayout.facts.width(),messageHeight);
                LinearLayout.LayoutParams playParams=(LinearLayout.LayoutParams)start.getLayoutParams();
                playParams.width=towersLayout.start.width();playParams.height=towersLayout.start.height();
                exact(launchActions,towersLayout.start.width(),towersLayout.start.height());
                setMeasuredDimension(w,h);return;
            }
            towersLayout=null;
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
            if(towersLayout!=null) {
                place(maps,towersLayout.preview);place(previous,towersLayout.previous);place(mapPosition,towersLayout.position);place(next,towersLayout.next);
                place(difficultyChoices,towersLayout.difficulty);place(launchActions,towersLayout.start);
                FfaSetupLayout.Box facts=towersLayout.facts;
                mapFacts.layout(facts.left,facts.top,facts.right,facts.bottom-messageHeight);
                message.layout(facts.left,facts.bottom-messageHeight,facts.right,facts.bottom);
                return;
            }
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

        private void place(View view,FfaSetupLayout.Box box) {view.layout(box.left,box.top,box.right,box.bottom);}
    }
}
