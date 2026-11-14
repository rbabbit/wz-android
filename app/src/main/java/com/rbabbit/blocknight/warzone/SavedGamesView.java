package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Phone save slots. Loading/deleting bytes belongs to SaveGameStore/MainActivity. */
final class SavedGamesView extends FrameLayout {
    interface Actions {
        void load(String id);
        void delete(String id);
        void close();
    }

    private static final int INK = TowersTheme.TEXT, MUTED = TowersTheme.SECONDARY;
    private final Actions actions;
    private final Typeface face;
    private final LinearLayout panel, rows;
    private final ScrollView scroll;
    private final TextView status;
    private JSONArray saves = new JSONArray();
    private String confirming = "", busyId = "";

    SavedGamesView(Context context, JSONArray saves, Actions actions) {
        this(context, saves, actions, false);
    }

    SavedGamesView(Context context, JSONArray saves, Actions actions, boolean campaign) {
        this(context, saves, actions, campaign ? "campaign" : "towers");
    }

    SavedGamesView(Context context, JSONArray saves, Actions actions, String mode) {
        super(context);
        this.actions = actions;
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(0x66000000);
        setClickable(true);
        setFocusableInTouchMode(true);
        setOnClickListener(v -> actions.close());
        panel = new LinearLayout(context);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(8), dp(16), dp(12));
        panel.setBackground(RewardsView.surface(context, TowersTheme.PANEL, 8));
        panel.setClickable(true);
        panel.setOnClickListener(v -> { });
        addView(panel, new LayoutParams(dp(520), dp(360), Gravity.CENTER));

        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = copy("ffa".equals(mode) ? "FFA SAVES" : "campaign".equals(mode) ? "CAMPAIGN SAVES" : "SAVED GAMES", 20, INK);
        title.setTypeface(face);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        ImageButton close = new ImageButton(context);
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setImageTintList(ColorStateList.valueOf(INK));
        close.setBackgroundTintList(null);
        close.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                TowersTheme.control(context, TowersTheme.CONTROL, 5), null));
        close.setPadding(dp(12), dp(12), dp(12), dp(12));
        close.setContentDescription("Close saved games");
        close.setOnClickListener(v -> actions.close());
        header.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        panel.addView(header, new LinearLayout.LayoutParams(-1, dp(48)));
        TextView hint = copy("Saved on this phone. Load a match to continue playing.", 12, MUTED);
        hint.setPadding(0, 0, 0, dp(8));
        panel.addView(hint, new LinearLayout.LayoutParams(-1, -2));
        scroll = new ScrollView(context);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        rows = new LinearLayout(context);
        rows.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(rows, new ScrollView.LayoutParams(-1, -2));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        status = copy("", 12, MUTED);
        status.setMaxLines(3);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setPadding(0, dp(4), 0, 0);
        panel.addView(status, new LinearLayout.LayoutParams(-1, -2));
        refresh(saves);
    }

    void refresh(JSONArray values) {
        // Keep metadata independent from the mutable store response.
        try { saves = values == null ? new JSONArray() : new JSONArray(values.toString()); }
        catch (JSONException invalid) { showError("The saved games list could not be read."); return; }
        confirming = "";
        busyId = "";
        status.setTextColor(MUTED);
        status.setText(saves.length() == 0 ? "" : saves.length() + (saves.length() == 1 ? " saved match" : " saved matches"));
        render();
    }

    void showError(String message) {
        busyId = "";
        status.setTextColor(INK);
        status.setText(message == null ? "The saved game could not be opened." : message);
        render();
    }

    private void render() {
        int previousY = scroll.getScrollY();
        rows.removeAllViews();
        int valid = 0;
        for (int i = 0; i < saves.length(); i++) {
            JSONObject save = saves.optJSONObject(i);
            if (save == null || save.optString("id", "").isEmpty()) continue;
            valid++;
            String id = save.optString("id"), name = save.optString("mapName", "Saved match");
            if ("campaign".equals(save.optString("mode")))
                name = BattleLaunchSpec.campaignChapter(save.optString("nativeLevel"));
            String difficulty = save.optString("difficulty", "");
            int wave = Math.max(0, save.optInt("wave", 0));
            int total = Math.max(0, save.optInt("totalWaves", 0));
            long savedAt = save.optLong("savedAt", 0);
            boolean ask = id.equals(confirming), busy = !busyId.isEmpty();
            LinearLayout row = new LinearLayout(getContext());
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(4), dp(10), dp(4), dp(10));
            row.setMinimumHeight(dp(72));
            row.setBackground(RewardsView.surface(getContext(), ask ? TowersTheme.CONTROL : 0x00000000, 6));
            LinearLayout labels = new LinearLayout(getContext());
            labels.setOrientation(LinearLayout.VERTICAL);
            TextView map = copy(name, 16, INK);
            map.setTypeface(face);
            labels.addView(map, new LinearLayout.LayoutParams(-1, -2));
            int bots = save.optInt("bots", FfaMapCatalog.playerCount(save.optString("mapId")) - 1);
            String detail = difficulty.isEmpty() ? "" : difficulty.toUpperCase(Locale.ROOT) + " · ";
            detail += "campaign".equals(save.optString("mode"))
                    ? "Campaign checkpoint"
                    : "ffa".equals(save.optString("mode")) ? bots + " "
                        + BattleLaunchSpec.ffaBotName(save.optString("botType")) + (bots == 1 ? " bot" : " bots") + " · Free for all"
                    : "Wave " + wave + (total > 0 ? " / " + total : "");
            TextView progress = copy(detail, 12, INK);
            progress.setPadding(0, dp(3), 0, 0);
            labels.addView(progress, new LinearLayout.LayoutParams(-1, -2));
            if (savedAt > 0) {
                DateFormat format = new SimpleDateFormat("d MMM, HH:mm", Locale.getDefault());
                TextView date = copy(format.format(new Date(savedAt)), 11, MUTED);
                date.setPadding(0, dp(3), 0, 0);
                labels.addView(date, new LinearLayout.LayoutParams(-1, -2));
            }
            if (ask) {
                TextView question = copy("Delete this saved match?", 12, INK);
                question.setPadding(0, dp(5), 0, 0);
                labels.addView(question, new LinearLayout.LayoutParams(-1, -2));
            }
            row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            Button load = RewardsView.action(getContext(), face, ask ? "KEEP" : "LOAD", !ask);
            load.setTextSize(13);
            load.setEnabled(!busy);
            load.setContentDescription(ask ? "Keep saved match " + name : "Load " + name + ", " + detail);
            load.setOnClickListener(v -> {
                if (!busyId.isEmpty()) return;
                if (id.equals(confirming)) { confirming = ""; render(); return; }
                busyId = id;
                status.setTextColor(MUTED);
                status.setText("Loading saved match…");
                render();
                actions.load(id);
            });
            LinearLayout.LayoutParams loadParams = new LinearLayout.LayoutParams(dp(64), dp(48));
            loadParams.leftMargin = dp(10);
            row.addView(load, loadParams);
            Button delete = RewardsView.action(getContext(), face, "DELETE", ask);
            delete.setTextSize(12);
            delete.setEnabled(!busy);
            delete.setContentDescription((ask ? "Confirm deletion of " : "Delete ") + name + " saved match");
            delete.setOnClickListener(v -> {
                if (!busyId.isEmpty()) return;
                if (!id.equals(confirming)) { confirming = id; render(); return; }
                busyId = id;
                status.setTextColor(MUTED);
                status.setText("Deleting saved match…");
                render();
                actions.delete(id);
            });
            LinearLayout.LayoutParams deleteParams = new LinearLayout.LayoutParams(dp(64), dp(48));
            deleteParams.leftMargin = dp(6);
            row.addView(delete, deleteParams);
            rows.addView(row, new LinearLayout.LayoutParams(-1, -2));
        }
        if (valid == 0) {
            TextView empty = copy("No saved games yet. Use SAVE in the game header to keep a match on this phone.", 14, MUTED);
            empty.setPadding(dp(4), dp(20), dp(4), dp(20));
            rows.addView(empty, new LinearLayout.LayoutParams(-1, -2));
        }
        scroll.post(() -> scroll.scrollTo(0, previousY));
    }

    @Override protected void onMeasure(int width, int height) {
        int w = MeasureSpec.getSize(width), h = MeasureSpec.getSize(height);
        LayoutParams params = (LayoutParams) panel.getLayoutParams();
        int panelWidth = Math.max(0, Math.min(w - dp(24), Math.min(dp(580), Math.max(dp(400), Math.round(w * .72f)))));
        int panelHeight = Math.max(0, Math.min(h - dp(24), dp(420)));
        if (params.width != panelWidth || params.height != panelHeight) {
            params.width = panelWidth;
            params.height = panelHeight;
            panel.setLayoutParams(params);
        }
        super.onMeasure(width, height);
    }

    private TextView copy(String value, int size, int colour) {
        TextView text = new TextView(getContext());
        text.setText(value); text.setTextSize(size); text.setTextColor(colour); text.setIncludeFontPadding(false);
        return text;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
