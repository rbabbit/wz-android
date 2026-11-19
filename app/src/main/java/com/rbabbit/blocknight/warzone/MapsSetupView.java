package com.rbabbit.blocknight.warzone;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONArray;
import org.json.JSONObject;

/** Searchable, paginated official map chooser; downloads only the selected map. */
final class MapsSetupView extends FrameLayout {
    interface Actions {
        void start(JSONObject installedMap, String difficulty, String botType, int[] teams);
        void back();
        void saves();
    }
    private int pageSize = 12;
    private final MapsStore store;
    private final Actions actions;
    private final Typeface face;
    private final SharedPreferences preferences;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(), previews = Executors.newSingleThreadExecutor();
    private Future<?> previewWork;
    private final LinearLayout shell, body, listPanel, details;
    private final MapGrid rows;
    private final SettingsRow settings;
    private final Spinner sizes, gameType, bot, difficulty;
    private final EditText search;
    private final TextView status, pageLabel, mapName, mapFacts, mapCredits, opponentFacts;
    private final ImageView preview;
    private final Button play, previous, next, teamButton;
    private final ImageButton refresh;
    private List<MapsStore.Entry> catalogue = Collections.emptyList(), filtered = Collections.emptyList();
    private MapsStore.Entry selected;
    private int firstMapIndex;
    private int[] teamIds;
    private boolean active = true, busy, syncingGameType;
    private AlertDialog teamDialog;

    MapsSetupView(Context context, MapsStore store, Actions actions) {
        super(context); this.store = store; this.actions = actions;
        preferences = context.getSharedPreferences("maps-setup", Context.MODE_PRIVATE);
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF000000); setClickable(true);
        shell = column(); shell.setPadding(dp(12), dp(6), dp(12), dp(8)); addView(shell, new LayoutParams(-1, -1));

        LinearLayout header = row();
        Button back = button("BACK", false); back.setOnClickListener(v -> { hideKeyboard(); actions.back(); });
        header.addView(back, new LinearLayout.LayoutParams(-2, dp(36)));
        TextView heading = text("Select Game Map", 16, TowersTheme.TEXT); heading.setTypeface(face);
        heading.setSingleLine(true); heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        header.addView(heading, weighted(1, dp(36), 10));
        Button saves = button("SAVES", false); saves.setContentDescription("Open FFA and Maps saved games");
        saves.setOnClickListener(v -> { hideKeyboard(); actions.saves(); });
        header.addView(saves, new LinearLayout.LayoutParams(-2, dp(36)));
        refresh = new ImageButton(context); refresh.setImageResource(android.R.drawable.ic_popup_sync);
        refresh.setImageTintList(ColorStateList.valueOf(TowersTheme.TEXT)); refresh.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        refresh.setPadding(dp(9), dp(9), dp(9), dp(9)); refresh.setContentDescription("Refresh maps");
        refresh.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE), TowersTheme.control(context, TowersTheme.CONTROL, 4), null));
        refresh.setOnClickListener(v -> refresh());
        LinearLayout.LayoutParams refreshParams = new LinearLayout.LayoutParams(dp(36), dp(36)); refreshParams.leftMargin = dp(8);
        header.addView(refresh, refreshParams);
        shell.addView(header, new LinearLayout.LayoutParams(-1, -2));

        body = row();
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(-1, 0, 1); bodyParams.topMargin = dp(6);
        shell.addView(body, bodyParams);
        listPanel = column();
        body.addView(listPanel, new LinearLayout.LayoutParams(0, -1, .51f));
        LinearLayout filters = row(); filters.setPadding(0, 0, 0, dp(5));
        search = new EditText(context); search.setTextSize(12); search.setSingleLine(true); search.setTextColor(TowersTheme.TEXT);
        search.setHintTextColor(TowersTheme.SECONDARY); search.setHint("Search maps"); search.setContentDescription("Search maps by name or author");
        search.setPadding(dp(10), 0, dp(10), 0); search.setBackground(TowersTheme.control(context, TowersTheme.CONTROL, 4));
        filters.addView(search, weighted(1.5f, dp(34), 0));
        String[] groups = {"All players", "2 players", "3 players", "4 players", "5 players", "6 players", "7 players", "8 players", "9 players", "10 players", "Downloaded"};
        sizes = spinner(groups); sizes.setContentDescription("Filter maps by player count or downloaded maps");
        filters.addView(sizes, weighted(1, dp(34), 6)); listPanel.addView(filters, new LinearLayout.LayoutParams(-1, -2));
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            public void onTextChanged(CharSequence s, int start, int before, int count) { firstMapIndex = 0; filter(); }
            public void afterTextChanged(Editable e) { }
        });
        sizes.setOnItemSelectedListener(selection(() -> { firstMapIndex = 0; filter(); }));

        rows = new MapGrid(context);
        listPanel.addView(rows, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout pages = row(); previous = button("‹", false); next = button("›", false);
        previous.setContentDescription("Previous page of maps"); next.setContentDescription("Next page of maps");
        previous.setOnClickListener(v -> changePage(-1)); next.setOnClickListener(v -> changePage(1));
        pageLabel = text("", 11, TowersTheme.SECONDARY); pageLabel.setGravity(Gravity.CENTER); pageLabel.setSingleLine(true);
        previous.setPadding(0, 0, 0, 0); next.setPadding(0, 0, 0, 0);
        pages.addView(previous, new LinearLayout.LayoutParams(dp(32), dp(36)));
        pages.addView(pageLabel, weighted(1, dp(36), 0)); pages.addView(next, new LinearLayout.LayoutParams(dp(32), dp(36)));
        LinearLayout.LayoutParams pageParams = new LinearLayout.LayoutParams(-1, -2); pageParams.topMargin = dp(3);
        listPanel.addView(pages, pageParams);

        details = column(); details.setPadding(dp(16), 0, 0, 0);
        mapName = text("Choose a map", 17, TowersTheme.TEXT); mapName.setTypeface(face); mapName.setMaxLines(2);
        mapName.setEllipsize(android.text.TextUtils.TruncateAt.END); details.addView(mapName, new LinearLayout.LayoutParams(-1, -2));
        mapFacts = text("", 12, TowersTheme.SECONDARY); details.addView(mapFacts, new LinearLayout.LayoutParams(-1, -2));
        preview = new ImageView(context); preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        preview.setContentDescription("Selected map preview");
        LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(-1, 0, 1); imageParams.topMargin = dp(8); imageParams.bottomMargin = dp(6);
        details.addView(preview, imageParams);
        mapCredits = text("", 10, TowersTheme.SECONDARY); mapCredits.setGravity(Gravity.CENTER);
        details.addView(mapCredits, new LinearLayout.LayoutParams(-1, -2));
        body.addView(details, new LinearLayout.LayoutParams(0, -1, .49f));

        gameType = spinner(new String[]{"FFA", "Teams"}); gameType.setContentDescription("Game type: free for all or teams");
        teamButton = button("Set teams", false); teamButton.setVisibility(GONE);
        teamButton.setTextSize(12); teamButton.setPadding(dp(6), 0, dp(6), 0);
        teamButton.setOnClickListener(v -> openTeamSetup());
        gameType.setOnItemSelectedListener(selection(() -> {
            if (syncingGameType || selected == null || busy) return;
            teamButton.setVisibility(gameType.getSelectedItemPosition() == 1 ? VISIBLE : GONE);
            saveTeamSetup(); updateSelectedFacts();
        }));

        String[] botNames = new String[MapsBotCatalog.ALL.size()];
        for (int i = 0; i < botNames.length; i++) botNames[i] = MapsBotCatalog.ALL.get(i).name;
        bot = spinner(botNames); bot.setContentDescription("Opponent bot");
        String preferredBot = preferences.getString("bot", "cobra");
        for (int i = 0; i < botNames.length; i++) if (MapsBotCatalog.ALL.get(i).id.equals(preferredBot)) bot.setSelection(i);
        difficulty = spinner(new String[]{"Easy", "Medium", "Hard"}); difficulty.setContentDescription("Bot difficulty");
        String preferredDifficulty = preferences.getString("difficulty", "easy");
        difficulty.setSelection("hard".equals(preferredDifficulty) ? 2 : "medium".equals(preferredDifficulty) ? 1 : 0);
        bot.setOnItemSelectedListener(selection(this::updateSelectedFacts));
        settings = new SettingsRow(context);
        for (View control : new View[]{gameType, teamButton, bot, difficulty}) settings.addView(control);
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(-1, -2); settingsParams.topMargin = dp(4);
        listPanel.addView(settings, settingsParams);
        opponentFacts = text("", 11, TowersTheme.SECONDARY); opponentFacts.setPadding(0, dp(2), 0, dp(2));
        opponentFacts.setSingleLine(true); opponentFacts.setEllipsize(android.text.TextUtils.TruncateAt.END);
        opponentFacts.setIncludeFontPadding(false);
        listPanel.addView(opponentFacts, new LinearLayout.LayoutParams(-1, -2));
        status = text("", 11, TowersTheme.SECONDARY); status.setMaxLines(2); status.setVisibility(GONE);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE); listPanel.addView(status, new LinearLayout.LayoutParams(-1, -2));
        play = button("DOWNLOAD & PLAY", true); play.setEnabled(false);
        play.setOnClickListener(v -> downloadAndPlay());
        LinearLayout.LayoutParams playParams = new LinearLayout.LayoutParams(-1, dp(36)); playParams.topMargin = dp(3);
        listPanel.addView(play, playParams);

        setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            } else { left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop(); right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom(); }
            shell.setPadding(dp(12) + left, dp(6) + top, dp(12) + right, dp(8) + bottom); return insets;
        });
        catalogue = store.cachedCatalog();
        if (catalogue.isEmpty()) catalogue = store.installedEntries();
        filter(); refresh();
    }

    private void refresh() {
        if (busy || !active) return;
        refresh.setEnabled(false); showStatus(catalogue.isEmpty() ? "Loading maps…" : "");
        worker.execute(() -> {
            try {
                List<MapsStore.Entry> result = store.refreshCatalog();
                post(() -> { if (!active) return; catalogue = result; refresh.setEnabled(!busy); filter(); if (!busy) showStatus(""); });
            } catch (Exception error) {
                post(() -> { if (!active) return; refresh.setEnabled(!busy); if (!busy) showStatus((catalogue.isEmpty() ? "" : "Using saved maps. ") + message(error)); });
            }
        });
    }

    private void filter() {
        if (sizes == null || search == null) return;
        String query = search.getText().toString().trim().toLowerCase(Locale.ROOT); int group = sizes.getSelectedItemPosition();
        List<MapsStore.Entry> list = new ArrayList<>();
        for (MapsStore.Entry e : catalogue) {
            if (group == 10 && !store.isInstalled(e)) continue;
            if (group > 0 && group < 10 && e.players != group + 1) continue;
            if (!query.isEmpty() && !(e.name + " " + e.author).toLowerCase(Locale.ROOT).contains(query)) continue;
            list.add(e);
        }
        filtered = list; firstMapIndex = Math.min(firstMapIndex, Math.max(0, filtered.size() - 1));
        MapsStore.Entry choice = null;
        String preferred = selected != null ? selected.id : preferences.getString("map", "");
        for (MapsStore.Entry entry : filtered) if (entry.id.equals(preferred)) { choice = entry; break; }
        if (choice == null && !filtered.isEmpty()) choice = filtered.get(0);
        if (choice != null && (selected == null || !selected.id.equals(choice.id))) select(choice);
        else if (choice == null) {
            selected = null; mapName.setText("Choose a map"); mapFacts.setText(""); mapCredits.setText(""); opponentFacts.setText("");
            gameType.setEnabled(false); teamButton.setVisibility(GONE);
            preview.setImageDrawable(null); play.setEnabled(false);
            if (previewWork != null) previewWork.cancel(true);
        }
        renderRows();
    }

    private void renderRows() {
        if (rows == null) return;
        rows.removeAllViews(); int start = firstMapIndex, end = Math.min(start + pageSize, filtered.size());
        for (int i = start; i < end; i++) {
            MapsStore.Entry entry = filtered.get(i);
            MapTile tile = new MapTile(entry);
            tile.setSelected(selected != null && selected.id.equals(entry.id));
            tile.setOnClickListener(v -> { if (!busy) { hideKeyboard(); select(entry); } }); tile.setEnabled(!busy);
            rows.addView(tile);
        }
        if (filtered.isEmpty()) rows.addView(text(catalogue.isEmpty() ? "Connect to load available maps." : "No maps match this filter.", 12, TowersTheme.SECONDARY));
        pageLabel.setText(filtered.isEmpty() ? "0 maps" : (start + 1) + "–" + end + " / " + filtered.size());
        previous.setEnabled(!busy && firstMapIndex > 0); next.setEnabled(!busy && end < filtered.size());
    }

    private void changePage(int direction) {
        if (busy) return;
        int target = Math.max(0, firstMapIndex + direction * pageSize);
        if (target == firstMapIndex || target >= filtered.size()) return;
        firstMapIndex = target; renderRows();
    }

    private void showStatus(String message) {
        status.setText(message); status.setVisibility(message.isEmpty() ? GONE : VISIBLE);
    }

    private void select(MapsStore.Entry entry) {
        selected = entry; preferences.edit().putString("map", entry.id).apply();
        loadTeamSetup(entry);
        mapName.setText(entry.name); mapCredits.setText(entry.author + " · " + entry.license);
        mapCredits.setContentDescription("By " + entry.author + ". " + entry.license + ". Source: maps.wz2100.net");
        preview.setContentDescription(entry.name + ", " + entry.width + " by " + entry.height + ", " + entry.oilWells + " oil wells");
        updateSelectedFacts(); renderRows(); preview.setImageDrawable(null);
        if (previewWork != null) previewWork.cancel(true);
        previewWork = previews.submit(() -> {
            try {
                byte[] bytes = store.preview(entry); Bitmap image = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                post(() -> { if (active && selected != null && selected.id.equals(entry.id)) preview.setImageBitmap(image); });
            } catch (Exception ignored) { }
        });
    }

    private void updateSelectedFacts() {
        if (selected == null || mapFacts == null || bot == null) return;
        mapFacts.setText(selected.players + " players · " + selected.width + " × " + selected.height);
        String opponents = gameType.getSelectedItemPosition() == 1
                ? teamSummary(teamIds) : "You + " + (selected.players - 1) + (selected.players == 2 ? " bot" : " bots");
        opponentFacts.setText(opponents
                + " · VTOL on" + (selected.scavengers > 0 ? " · Scavengers" : ""));
        play.setText(store.isInstalled(selected) ? "PLAY" : "DOWNLOAD & PLAY");
        play.setContentDescription((store.isInstalled(selected) ? "Play " : "Download and play ") + selected.name);
        play.setEnabled(!busy && selected.supported());
    }

    private void loadTeamSetup(MapsStore.Entry entry) {
        teamIds = defaultTeams(entry.players);
        try {
            JSONArray saved = new JSONArray(preferences.getString("teams." + entry.id, "[]"));
            int[] restored = new int[saved.length()];
            for (int i = 0; i < restored.length; i++) restored[i] = saved.getInt(i);
            teamIds = MapsTeamSetup.validate(restored, entry.players);
        } catch (Exception ignored) { }
        syncingGameType = true;
        boolean teams = "teams".equals(preferences.getString("game-type." + entry.id, "ffa"));
        gameType.setSelection(teams ? 1 : 0); gameType.setEnabled(!busy);
        teamButton.setVisibility(teams ? VISIBLE : GONE); teamButton.setEnabled(!busy);
        syncingGameType = false;
    }

    private void saveTeamSetup() {
        if (selected == null || teamIds == null) return;
        JSONArray saved = new JSONArray();
        for (int team : teamIds) saved.put(team);
        preferences.edit().putString("game-type." + selected.id, gameType.getSelectedItemPosition() == 1 ? "teams" : "ffa")
                .putString("teams." + selected.id, saved.toString()).apply();
    }

    private static int[] defaultTeams(int players) {
        int[] result = new int[players];
        for (int i = (players + 1) / 2; i < players; i++) result[i] = 1;
        return result;
    }

    private static String teamSummary(int[] teams) {
        int[] counts = new int[teams.length];
        for (int team : teams) counts[team]++;
        StringBuilder result = new StringBuilder();
        for (int count : counts) if (count > 0) {
            if (result.length() > 0) result.append('v');
            result.append(count);
        }
        return result + " · Team " + (char) ('A' + teams[0]);
    }

    private void openTeamSetup() {
        if (busy || selected == null || gameType.getSelectedItemPosition() != 1 || teamDialog != null) return;
        hideKeyboard();
        final MapsStore.Entry entry = selected;
        final int[] working = teamIds.clone();
        final List<int[]> presets = new ArrayList<>();
        final List<String> presetNames = new ArrayList<>();
        presets.add(null); presetNames.add("Custom");
        int[] balanced = defaultTeams(entry.players);
        presets.add(balanced); presetNames.add(((entry.players + 1) / 2) + "v" + (entry.players / 2));
        for (int groups = 3; groups <= entry.players / 2; groups++) {
            if (entry.players % groups != 0) continue;
            int size = entry.players / groups;
            int[] preset = new int[entry.players];
            StringBuilder label = new StringBuilder();
            for (int i = 0; i < preset.length; i++) preset[i] = i / size;
            for (int i = 0; i < groups; i++) { if (i > 0) label.append('v'); label.append(size); }
            presets.add(preset); presetNames.add(label.toString());
        }
        LinearLayout content = column(); content.setPadding(dp(18), dp(10), dp(18), dp(8));
        content.setBackgroundColor(0xFF151515);
        TextView explanation = text("Slots follow the map’s starting positions.", 12, TowersTheme.SECONDARY);
        content.addView(explanation, new LinearLayout.LayoutParams(-1, -2));
        Spinner preset = spinner(presetNames.toArray(new String[0])); preset.setContentDescription("Team layout preset");
        LinearLayout.LayoutParams presetParams = new LinearLayout.LayoutParams(-1, dp(38)); presetParams.topMargin = dp(8);
        content.addView(preset, presetParams);
        String[] teamNames = new String[entry.players];
        for (int i = 0; i < teamNames.length; i++) teamNames[i] = "Team " + (char) ('A' + i);
        final Spinner[] slots = new Spinner[entry.players];
        final boolean[] changingPreset = {false};
        for (int i = 0; i < entry.players; i++) {
            final int slot = i;
            LinearLayout line = row();
            TextView label = text("Slot " + (i + 1) + (i == 0 ? " · You" : " · Bot"), 12, TowersTheme.TEXT);
            line.addView(label, weighted(1, dp(38), 0));
            slots[i] = spinner(teamNames); slots[i].setContentDescription("Team for slot " + (i + 1) + (i == 0 ? ", you" : ", bot"));
            slots[i].setSelection(working[i]);
            slots[i].setOnItemSelectedListener(selection(() -> {
                int value = slots[slot].getSelectedItemPosition();
                if (working[slot] == value) return;
                working[slot] = value;
                if (!changingPreset[0]) preset.setSelection(0);
            }));
            line.addView(slots[i], weighted(1, dp(38), 8));
            LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(-1, -2); lineParams.topMargin = dp(5);
            content.addView(line, lineParams);
        }
        int currentPreset = 0;
        for (int i = 1; i < presets.size(); i++) if (Arrays.equals(working, presets.get(i))) currentPreset = i;
        preset.setSelection(currentPreset);
        preset.setOnItemSelectedListener(selection(() -> {
            int[] choice = presets.get(preset.getSelectedItemPosition());
            if (choice == null || Arrays.equals(working, choice)) return;
            changingPreset[0] = true;
            System.arraycopy(choice, 0, working, 0, working.length);
            for (int i = 0; i < slots.length; i++) slots[i].setSelection(working[i]);
            changingPreset[0] = false;
        }));
        ScrollView scroll = new ScrollView(getContext()); scroll.addView(content);
        AlertDialog dialog = new AlertDialog.Builder(getContext(), android.R.style.Theme_Material_Dialog_Alert)
                .setTitle("Set teams").setView(scroll).setPositiveButton("Apply", null).setNegativeButton("Cancel", null).create();
        teamDialog = dialog;
        dialog.setOnDismissListener(ignored -> { if (teamDialog == dialog) teamDialog = null; });
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (selected == null || !entry.id.equals(selected.id) || selected.players != entry.players) {
                dialog.dismiss(); Toast.makeText(getContext(), "Map changed. Open team setup again.", Toast.LENGTH_SHORT).show(); return;
            }
            try { teamIds = MapsTeamSetup.validate(working, entry.players); }
            catch (IllegalArgumentException error) { Toast.makeText(getContext(), "Choose at least two teams.", Toast.LENGTH_SHORT).show(); return; }
            saveTeamSetup(); updateSelectedFacts(); dialog.dismiss();
        }));
        dialog.show();
        if (dialog.getWindow() != null) dialog.getWindow().setLayout(Math.min(dp(430), Math.max(dp(240), getWidth() - dp(32))), -2);
    }

    private void downloadAndPlay() {
        if (busy || selected == null) return; hideKeyboard();
        final MapsStore.Entry entry = selected; final String botId = MapsBotCatalog.ALL.get(bot.getSelectedItemPosition()).id;
        final String level = MapsBotCatalog.difficulty(difficulty.getSelectedItem().toString());
        final int[] teams;
        try { teams = gameType.getSelectedItemPosition() == 1 ? MapsTeamSetup.validate(teamIds, entry.players) : null; }
        catch (IllegalArgumentException error) { showStatus("Choose at least two teams before playing."); return; }
        preferences.edit().putString("bot", botId).putString("difficulty", level).apply();
        busy = true; setBusy(true); showStatus(store.isInstalled(entry) ? "Opening " + entry.name + "…" : "Downloading " + entry.name + "…");
        worker.execute(() -> {
            try {
                JSONObject installed = store.install(entry);
                post(() -> {
                    if (!active) return;
                    try { FfaMapCatalog.registerDownloaded(installed); busy = false; actions.start(installed, level, botId, teams); }
                    catch (Exception error) { busy = false; setBusy(false); showStatus(message(error)); }
                });
            } catch (Exception error) { post(() -> { if (active) { busy = false; setBusy(false); showStatus(message(error)); } }); }
        });
    }

    private void setBusy(boolean value) {
        play.setEnabled(!value && selected != null && selected.supported()); sizes.setEnabled(!value); search.setEnabled(!value);
        gameType.setEnabled(!value && selected != null); teamButton.setEnabled(!value);
        bot.setEnabled(!value); difficulty.setEnabled(!value); refresh.setEnabled(!value); renderRows();
    }
    boolean dismissInput() {
        if (!search.hasFocus()) return false;
        hideKeyboard(); search.clearFocus();
        shell.setFocusableInTouchMode(true); shell.requestFocus();
        return true;
    }
    void close() { active = false; if (teamDialog != null) teamDialog.dismiss(); worker.shutdownNow(); previews.shutdownNow(); hideKeyboard(); }
    @Override protected void onDetachedFromWindow() { close(); super.onDetachedFromWindow(); }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); requestApplyInsets(); }
    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        boolean wide = width > height;
        body.setOrientation(wide ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
        for (int i = 0; i < body.getChildCount(); i++) body.getChildAt(i).setLayoutParams(wide
                ? new LinearLayout.LayoutParams(0, -1, i == 0 ? .51f : .49f) : new LinearLayout.LayoutParams(-1, 0, 1));
        details.setPadding(wide ? dp(16) : 0, wide ? 0 : dp(8), 0, 0);
    }

    /** Keep all setup controls together, using a second row only when needed. */
    private final class SettingsRow extends FrameLayout {
        private boolean twoRows;
        private int controlHeight;

        SettingsRow(Context context) { super(context); }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec), gap = dp(5);
            int fontHeight = (int) Math.ceil(android.util.TypedValue.applyDimension(
                    android.util.TypedValue.COMPLEX_UNIT_SP, 12, getResources().getDisplayMetrics()));
            controlHeight = Math.max(dp(34), fontHeight + dp(16));
            float textScale = Math.max(1f, getResources().getConfiguration().fontScale);
            int minimum = dp((teamButton.getVisibility() == VISIBLE ? 322 : 246) * textScale)
                    + gap * (teamButton.getVisibility() == VISIBLE ? 3 : 2);
            twoRows = width < minimum;
            measureControls(0, twoRows ? 2 : 4, width, gap);
            if (twoRows) measureControls(2, 4, width, gap);
            setMeasuredDimension(width, controlHeight * (twoRows ? 2 : 1) + (twoRows ? gap : 0));
        }

        private void measureControls(int start, int end, int width, int gap) {
            float total = 0;
            int visible = 0;
            for (int i = start; i < end; i++) if (getChildAt(i).getVisibility() != GONE) { total += controlWeight(i); visible++; }
            int remaining = Math.max(0, width - Math.max(0, visible - 1) * gap), used = 0, count = 0;
            for (int i = start; i < end; i++) {
                View child = getChildAt(i); if (child.getVisibility() == GONE) continue;
                int childWidth = ++count == visible ? remaining - used : Math.round(remaining * controlWeight(i) / total);
                child.measure(MeasureSpec.makeMeasureSpec(Math.max(0, childWidth), MeasureSpec.EXACTLY),
                        MeasureSpec.makeMeasureSpec(controlHeight, MeasureSpec.EXACTLY));
                used += childWidth;
            }
        }

        private float controlWeight(int index) { return index == 2 ? 1.35f : index == 3 ? 1.1f : 1f; }

        @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
            int x = 0, y = 0, gap = dp(5);
            for (int i = 0; i < getChildCount(); i++) {
                if (twoRows && i == 2) { x = 0; y = controlHeight + gap; }
                View child = getChildAt(i); if (child.getVisibility() == GONE) continue;
                child.layout(x, y, x + child.getMeasuredWidth(), y + controlHeight); x += child.getMeasuredWidth() + gap;
            }
        }
    }

    /** One contained page of cards, changed only by the previous/next buttons. */
    private final class MapGrid extends FrameLayout {
        private int columns = 3, rowCount = 4, tileWidth, tileHeight;

        MapGrid(Context context) {
            super(context);
            setContentDescription("Game maps. Use the previous and next buttons to browse pages.");
        }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec), height = MeasureSpec.getSize(heightSpec), gap = dp(4);
            int fontHeight = (int) Math.ceil(android.util.TypedValue.applyDimension(
                    android.util.TypedValue.COMPLEX_UNIT_SP, 12, getResources().getDisplayMetrics()));
            int minimum = Math.max(dp(38), fontHeight + dp(14));
            float textScale = Math.max(1f, getResources().getConfiguration().fontScale);
            columns = width >= dp(350 * textScale) ? 3 : width >= dp(210) ? 2 : 1;
            rowCount = Math.max(1, Math.min(4, (height + gap) / Math.max(1, minimum + gap)));
            int capacity = columns * rowCount;
            // Weighted LinearLayout first probes with a provisional height.
            // Only its allocated height can change capacity, and the first
            // visible map remains stable across either measurement pass.
            if (MeasureSpec.getMode(heightSpec) == MeasureSpec.EXACTLY && height > dp(18) && capacity != pageSize) {
                pageSize = capacity;
                renderRows();
            }
            tileWidth = Math.max(0, (width - gap * (columns - 1)) / columns);
            tileHeight = Math.max(0, Math.min(dp(52), (height - gap * (rowCount - 1)) / rowCount));
            for (int i = 0; i < getChildCount(); i++) {
                View child = getChildAt(i);
                child.measure(MeasureSpec.makeMeasureSpec(filtered.isEmpty() ? width : tileWidth, MeasureSpec.EXACTLY),
                        MeasureSpec.makeMeasureSpec(filtered.isEmpty() ? height : tileHeight, MeasureSpec.EXACTLY));
            }
            setMeasuredDimension(width, height);
        }

        @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
            int gap = dp(4);
            for (int i = 0; i < getChildCount(); i++) {
                View child = getChildAt(i);
                int x = (i % columns) * (tileWidth + gap), y = (i / columns) * (tileHeight + gap);
                child.layout(x, y, x + child.getMeasuredWidth(), y + child.getMeasuredHeight());
            }
        }

    }

    private final class MapTile extends FrameLayout {
        private final TextView name, count;

        MapTile(MapsStore.Entry entry) {
            super(MapsSetupView.this.getContext());
            setClickable(true); setFocusable(true);
            setContentDescription(entry.name + ", " + entry.players + " players" + (store.isInstalled(entry) ? ", downloaded" : ""));
            setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                    TowersTheme.control(getContext(), TowersTheme.CONTROL, 4), null));
            name = text(entry.name, 12, TowersTheme.TEXT); count = text(entry.players + "p", 11, TowersTheme.TEXT);
            for (TextView text : new TextView[]{name, count}) {
                text.setSingleLine(true); text.setTextColor(TowersTheme.buttonText(false)); text.setDuplicateParentStateEnabled(true);
                text.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); addView(text);
            }
            name.setEllipsize(android.text.TextUtils.TruncateAt.END); count.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec), height = MeasureSpec.getSize(heightSpec), pad = dp(8);
            int countWidth = Math.min(Math.max(0, width - pad * 2), (int) Math.ceil(count.getPaint().measureText(count.getText().toString())) + dp(2));
            count.measure(MeasureSpec.makeMeasureSpec(countWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
            name.measure(MeasureSpec.makeMeasureSpec(Math.max(0, width - pad * 2 - countWidth - dp(5)), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
            setMeasuredDimension(width, height);
        }

        @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
            int pad = dp(8); name.layout(pad, 0, pad + name.getMeasuredWidth(), getHeight());
            count.layout(getWidth() - pad - count.getMeasuredWidth(), 0, getWidth() - pad, getHeight());
        }

        @Override public void onInitializeAccessibilityNodeInfo(android.view.accessibility.AccessibilityNodeInfo info) {
            super.onInitializeAccessibilityNodeInfo(info); info.setClassName(Button.class.getName()); info.setSelected(isSelected());
        }
    }

    private AdapterView.OnItemSelectedListener selection(Runnable action) {
        return new AdapterView.OnItemSelectedListener() { public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { action.run(); } public void onNothingSelected(AdapterView<?> parent) { } };
    }
    private Spinner spinner(String[] values) {
        Spinner spinner = new Spinner(getContext());
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_item, values) {
            @Override public View getView(int position, View view, ViewGroup parent) {
                TextView text = (TextView) super.getView(position, view, parent); text.setTextSize(12); text.setTextColor(TowersTheme.TEXT);
                text.setSingleLine(true); text.setEllipsize(android.text.TextUtils.TruncateAt.END); text.setGravity(Gravity.CENTER_VERTICAL);
                text.setPadding(dp(8), dp(3), dp(4), dp(3)); return text;
            }
            @Override public View getDropDownView(int position, View view, ViewGroup parent) {
                TextView text = (TextView) super.getDropDownView(position, view, parent); text.setTextColor(TowersTheme.TEXT); text.setBackgroundColor(TowersTheme.CONTROL); text.setMinHeight(dp(48)); text.setGravity(Gravity.CENTER_VERTICAL); text.setPadding(dp(12), dp(8), dp(12), dp(8)); return text;
            }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); spinner.setAdapter(adapter);
        spinner.setBackground(TowersTheme.control(getContext(), TowersTheme.CONTROL, 4)); return spinner;
    }
    private Button button(String label, boolean primary) {
        Button button = new Button(getContext()); button.setText(label); button.setTypeface(face); button.setTextSize(13); button.setAllCaps(false);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinimumHeight(0); button.setMinHeight(0); button.setPadding(dp(12), 0, dp(12), 0);
        button.setTextColor(TowersTheme.buttonText(primary)); button.setBackground(new RippleDrawable(ColorStateList.valueOf(primary ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE), TowersTheme.control(getContext(), primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL, 4), null)); return button;
    }
    private TextView text(String label, float size, int color) { TextView text = new TextView(getContext()); text.setText(label); text.setTextSize(size); text.setTextColor(color); text.setGravity(Gravity.CENTER_VERTICAL); return text; }
    private LinearLayout row() { LinearLayout layout = new LinearLayout(getContext()); layout.setOrientation(LinearLayout.HORIZONTAL); layout.setGravity(Gravity.CENTER_VERTICAL); return layout; }
    private LinearLayout column() { LinearLayout layout = new LinearLayout(getContext()); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
    private LinearLayout.LayoutParams weighted(float weight, int height, int left) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, height, weight); params.leftMargin = dp(left); return params; }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static String message(Exception error) { return error.getMessage() == null ? "Could not load this map. Please retry." : error.getMessage(); }
    private void hideKeyboard() { InputMethodManager input = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE); if (input != null) input.hideSoftInputFromWindow(getWindowToken(), 0); clearFocus(); }
}
