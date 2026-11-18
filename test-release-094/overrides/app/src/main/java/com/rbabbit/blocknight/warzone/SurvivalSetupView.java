package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;

/** Same fixed preview/facts layout as Towers; a separate single-player launch. */
final class SurvivalSetupView extends FrameLayout {
    interface Actions {
        void start(String map); void map(String map); void saves(); void rewards(); void back();
    }
    private final Actions actions;
    private final Typeface face;
    private final MapPreviewPager maps;
    private final LinearLayout header, choices, copy;
    private final ScrollView facts;
    private final TextView name, meta, description, error, position;
    private final Button first, second, previous, next, play, rewards;
    private String selected;
    private int insetLeft, insetTop, insetRight, insetBottom;
    private TowersSetupLayout layout;

    SurvivalSetupView(Context context, String selectedMap, Actions actions) {
        super(context); this.actions = actions;
        selected = SurvivalMapCatalog.normalizeId(selectedMap);
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(TowersTheme.BACKGROUND); setClickable(true);
        maps = new MapPreviewPager(context, face, level -> acceptMap(level.id)); maps.setPreviewOnly(true);
        header = new LinearLayout(context); header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = button("BACK", false); back.setOnClickListener(v -> actions.back());
        back.setContentDescription("Back to Towers maps");
        header.addView(back, new LinearLayout.LayoutParams(dp(70), -1));
        View space = new View(context); header.addView(space, new LinearLayout.LayoutParams(0, 1, 1));
        rewards = button("REWARDS 0", false); rewards.setOnClickListener(v -> { maps.settleSelection(); actions.rewards(); });
        android.graphics.drawable.Drawable crystal = context.getDrawable(R.drawable.reward_crystal);
        crystal.setBounds(0, 0, dp(18), dp(18)); rewards.setCompoundDrawables(crystal, null, null, null); rewards.setCompoundDrawablePadding(dp(5));
        header.addView(rewards, new LinearLayout.LayoutParams(dp(116), -1));
        Button saves = button("SAVED GAMES", false); saves.setOnClickListener(v -> { maps.settleSelection(); actions.saves(); });
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(dp(112), -1); saveParams.leftMargin = dp(8);
        header.addView(saves, saveParams); addView(header);
        choices = new LinearLayout(context);
        first = button("TDN2", false); second = button("Wave", false);
        first.setOnClickListener(v -> select("tdn2")); second.setOnClickListener(v -> select("wave"));
        choices.addView(first, new LinearLayout.LayoutParams(0, -1, 1));
        LinearLayout.LayoutParams secondParams = new LinearLayout.LayoutParams(0, -1, 1); secondParams.leftMargin = dp(6);
        choices.addView(second, secondParams); addView(choices);
        maps.showLevels(SurvivalMapCatalog.levels(), selected); addView(maps);
        previous = button("‹", false); next = button("›", false);
        previous.setContentDescription("Previous Survival map"); next.setContentDescription("Next Survival map");
        previous.setOnClickListener(v -> maps.browseBy(-1)); next.setOnClickListener(v -> maps.browseBy(1));
        position = text("", 14, TowersTheme.SECONDARY); position.setGravity(Gravity.CENTER);
        addView(previous); addView(position); addView(next);
        facts = new ScrollView(context); facts.setFillViewport(false); facts.setOverScrollMode(OVER_SCROLL_NEVER);
        copy = new LinearLayout(context); copy.setOrientation(LinearLayout.VERTICAL);
        name = text("", 21, TowersTheme.TEXT); name.setTypeface(face);
        meta = text("", 13, TowersTheme.SECONDARY);
        description = text("", 14, TowersTheme.SECONDARY);
        error = text("", 13, TowersTheme.TEXT); error.setVisibility(GONE);
        for (TextView item : new TextView[]{name, meta, description, error}) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(10); copy.addView(item, p);
        }
        facts.addView(copy); addView(facts);
        play = button("PLAY SURVIVAL", true);
        play.setOnClickListener(v -> { maps.settleSelection(); actions.start(selected); }); addView(play);
        refresh();
        setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                insetLeft=safe.left; insetTop=safe.top; insetRight=safe.right; insetBottom=safe.bottom;
            } else { insetLeft=insets.getSystemWindowInsetLeft(); insetTop=insets.getSystemWindowInsetTop(); insetRight=insets.getSystemWindowInsetRight(); insetBottom=insets.getSystemWindowInsetBottom(); }
            requestLayout(); return insets;
        });
    }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); requestApplyInsets(); }
    private void select(String id) { maps.settleSelection(); maps.showLevels(SurvivalMapCatalog.levels(), id); acceptMap(id); }
    private void acceptMap(String id) {
        selected=SurvivalMapCatalog.get(id).id; error.setVisibility(GONE); actions.map(selected); refresh();
    }
    private void refresh() {
        MapLevelCatalog.Level level=SurvivalMapCatalog.get(selected);
        name.setText(level.name.toUpperCase(Locale.ROOT)); meta.setText("60 waves · 4 min preparation"); description.setText(level.description);
        first.setSelected("tdn2".equals(selected)); second.setSelected("wave".equals(selected));
        first.setTextColor(TowersTheme.buttonText(first.isSelected())); second.setTextColor(TowersTheme.buttonText(second.isSelected()));
        first.setContentDescription("TDN2, " + (first.isSelected()?"selected":"not selected")); second.setContentDescription("Wave, " + (second.isSelected()?"selected":"not selected"));
        previous.setEnabled(!"tdn2".equals(selected)); next.setEnabled(!"wave".equals(selected)); position.setText("tdn2".equals(selected)?"1 / 2":"2 / 2");
    }
    String selectedMap() { maps.settleSelection(); return selected; }
    void setRewardBalance(int amount) { rewards.setText("REWARDS " + Math.max(0, amount)); }
    void showError(String message) { error.setText(message); error.setVisibility(VISIBLE); }
    private TextView text(String value,int size,int colour) { TextView v=new TextView(getContext());v.setText(value);v.setTextSize(size);v.setTextColor(colour);v.setIncludeFontPadding(false);return v; }
    private Button button(String value,boolean primary) {
        Button b=new Button(getContext());b.setText(value);b.setAllCaps(false);b.setTypeface(face);b.setTextSize(primary?18:13);
        b.setTextColor(TowersTheme.buttonText(primary));b.setBackgroundTintList(null);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(0);b.setMinimumHeight(0);
        b.setPadding(dp(8),0,dp(8),0);b.setSingleLine(true);b.setIncludeFontPadding(false);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),TowersTheme.control(getContext(),primary?TowersTheme.PRIMARY:TowersTheme.CONTROL,6),null));return b;
    }
    @Override protected void onMeasure(int width,int height) {
        int w=MeasureSpec.getSize(width),h=MeasureSpec.getSize(height);
        layout=TowersSetupLayout.calculate(w,h,getResources().getDisplayMetrics().density,insetLeft,insetTop,insetRight,insetBottom,dp(160));
        measureBox(header,layout.header);measureBox(choices,layout.difficulty);measureBox(maps,layout.preview);measureBox(previous,layout.previous);measureBox(position,layout.position);measureBox(next,layout.next);measureBox(facts,layout.facts);measureBox(play,layout.start);setMeasuredDimension(w,h);
    }
    private void measureBox(View view,FfaSetupLayout.Box box) {view.measure(MeasureSpec.makeMeasureSpec(box.width(),MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(box.height(),MeasureSpec.EXACTLY));}
    private void place(View view,FfaSetupLayout.Box box) {view.layout(box.left,box.top,box.right,box.bottom);}
    @Override protected void onLayout(boolean changed,int left,int top,int right,int bottom) {place(header,layout.header);place(choices,layout.difficulty);place(maps,layout.preview);place(previous,layout.previous);place(position,layout.position);place(next,layout.next);place(facts,layout.facts);place(play,layout.start);}
    private int dp(int n) {return Math.round(n*getResources().getDisplayMetrics().density);}
}
