package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;

/** An already-credited reward receipt; it never performs a wallet transaction. */
final class RewardReceiptView extends FrameLayout {
    private static final int INK = TowersTheme.TEXT, MUTED = TowersTheme.SECONDARY;
    private final ScrollView sheet;
    private final boolean won;
    private final int bottomClearance;

    RewardReceiptView(Context context, boolean won, String mapName, String difficulty,
            int reachedWave, int totalWaves, int earned, int balance, String reason,
            int bottomClearance, Runnable close) {
        this(context, won, mapName, difficulty, reachedWave, totalWaves, earned, balance, reason,
                bottomClearance, close, false);
    }

    RewardReceiptView(Context context, boolean won, String mapName, String difficulty,
            int reachedWave, int totalWaves, int earned, int balance, String reason,
            int bottomClearance, Runnable close, boolean crystalSkirmish) {
        super(context);
        this.won = won;
        this.bottomClearance = Math.max(0, bottomClearance);
        Typeface face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(won ? 0x66000000 : 0x00000000);
        setClickable(true);
        setFocusableInTouchMode(true);
        setOnClickListener(v -> close.run());
        sheet = new ScrollView(context);
        sheet.setOverScrollMode(OVER_SCROLL_NEVER);
        sheet.setVerticalScrollBarEnabled(true);
        sheet.setScrollbarFadingEnabled(true);
        sheet.setBackground(RewardsView.surface(context, TowersTheme.PANEL, 8));
        sheet.setClickable(true);
        sheet.setOnClickListener(v -> { });
        LinearLayout body = new LinearLayout(context);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(won ? 20 : 16), dp(won ? 16 : 12), dp(won ? 20 : 16), dp(won ? 14 : 10));
        sheet.addView(body, new ScrollView.LayoutParams(-1, -2));
        addView(sheet);

        TextView title = copy(won ? "VICTORY" : "BATTLE ENDED", won ? 27 : 20, INK);
        title.setTypeface(face);
        title.setGravity(won ? Gravity.CENTER : Gravity.START);
        body.addView(title, new LinearLayout.LayoutParams(-1, -2));
        String mapLabel = mapName + " · " + (difficulty == null ? "" : difficulty.toUpperCase(Locale.ROOT));
        TextView map = copy(mapLabel, 12, MUTED);
        map.setGravity(won ? Gravity.CENTER : Gravity.START);
        add(body, map, 3);
        int reached = Math.max(0, Math.min(reachedWave, Math.max(0, totalWaves)));
        TextView summary = copy(crystalSkirmish ? "Match complete"
                : totalWaves == 0 ? (won ? "Challenge won" : "Challenge ended")
                : won ? "All " + totalWaves + " waves survived" : "Reached wave " + reached + " of " + totalWaves, 13, INK);
        summary.setGravity(won ? Gravity.CENTER : Gravity.START);
        add(body, summary, won ? 8 : 7);

        LinearLayout reward = new LinearLayout(context);
        TextView earnedLabel = copy("Total earned this match", 11, MUTED);
        earnedLabel.setGravity(won ? Gravity.CENTER : Gravity.START);
        add(body, earnedLabel, 8);
        reward.setGravity(won ? Gravity.CENTER : Gravity.START | Gravity.CENTER_VERTICAL);
        ImageView crystal = new ImageView(context);
        crystal.setImageResource(R.drawable.reward_crystal);
        crystal.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        reward.addView(crystal, new LinearLayout.LayoutParams(dp(won ? 30 : 23), dp(won ? 30 : 23)));
        TextView amount = copy("+" + Math.max(0, earned) + " crystals", won ? 25 : 20, INK);
        amount.setTypeface(face);
        LinearLayout.LayoutParams amountParams = new LinearLayout.LayoutParams(-2, -2);
        amountParams.leftMargin = dp(8);
        reward.addView(amount, amountParams);
        add(body, reward, won ? 12 : 8);
        if (reason != null && !reason.trim().isEmpty()) {
            TextView explanation = copy(reason, won ? 12 : 11, MUTED);
            explanation.setGravity(won ? Gravity.CENTER : Gravity.START);
            add(body, explanation, 6);
        }

        LinearLayout footer = new LinearLayout(context);
        footer.setOrientation(won ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout wallet = new LinearLayout(context);
        wallet.setOrientation(LinearLayout.VERTICAL);
        TextView total = copy("Wallet: " + Math.max(0, balance), won ? 17 : 14, INK);
        total.setTypeface(face);
        total.setGravity(won ? Gravity.CENTER : Gravity.START);
        wallet.addView(total, new LinearLayout.LayoutParams(-1, -2));
        TextView saved = copy(won ? "Rewards saved to this phone" : "Rewards saved", 11, MUTED);
        saved.setGravity(won ? Gravity.CENTER : Gravity.START);
        saved.setPadding(0, dp(3), 0, 0);
        wallet.addView(saved, new LinearLayout.LayoutParams(-1, -2));
        footer.addView(wallet, new LinearLayout.LayoutParams(won ? -1 : 0, -2, won ? 0 : 1));
        Button button = RewardsView.action(context, face, won ? "CONTINUE" : "OK", true);
        button.setOnClickListener(v -> close.run());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(dp(won ? 148 : 72), dp(48));
        buttonParams.gravity = Gravity.CENTER_HORIZONTAL;
        if (won) buttonParams.topMargin = dp(6);
        else buttonParams.leftMargin = dp(10);
        footer.addView(button, buttonParams);
        add(body, footer, won ? 12 : 8);
        if (won && !crystalSkirmish) {
            TextView returnLabel = copy(mapName + " is selected on " + (totalWaves == 0 ? "Challenge" : "Home"), 11, MUTED);
            returnLabel.setGravity(Gravity.CENTER);
            body.addView(returnLabel, new LinearLayout.LayoutParams(-1, -2));
        }
        setContentDescription((won ? "Victory. " : "Battle ended. ") + mapName + ". "
                + Math.max(0, earned) + " crystals earned. Wallet " + Math.max(0, balance) + ". Rewards saved.");
        setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
    }

    @Override protected void onMeasure(int width, int height) {
        int w = MeasureSpec.getSize(width), h = MeasureSpec.getSize(height);
        int margin = dp(12);
        int sheetWidth = Math.max(0, Math.min(dp(won ? 350 : 296), w - margin * 2));
        sheet.measure(MeasureSpec.makeMeasureSpec(sheetWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(Math.max(0, h - margin * 2 - bottomClearance), MeasureSpec.AT_MOST));
        setMeasuredDimension(w, h);
    }

    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int x = won ? (getWidth() - sheet.getMeasuredWidth()) / 2 : getWidth() - dp(12) - sheet.getMeasuredWidth();
        int availableHeight = Math.max(0, getHeight() - bottomClearance);
        int y = won ? (availableHeight - sheet.getMeasuredHeight()) / 2
                : availableHeight - dp(12) - sheet.getMeasuredHeight();
        sheet.layout(x, y, x + sheet.getMeasuredWidth(), y + sheet.getMeasuredHeight());
    }

    private TextView copy(String value, int size, int colour) {
        TextView text = new TextView(getContext());
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(colour);
        text.setIncludeFontPadding(false);
        return text;
    }

    private void add(LinearLayout body, View view, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(margin);
        body.addView(view, params);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
