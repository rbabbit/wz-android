package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Native launch choices over the selected artwork; scales without web page zoom. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions { void start(String mode); void cancel(); void music(); }
    private static final int INK = 0xFFF0E8D3, MUTED = 0xFFB4C4C3, CYAN = 0xFF83CDD1;
    private final Actions actions;
    private final Typeface titleFace;
    private final LinearLayout normalCard, highCard;
    private final TextView normalMark, highMark, highNote, status;
    private final Button start, cancel, music;
    private final ProgressBar progress;
    private String mode = "normal";
    private boolean cached, downloading, musicChecked;

    GraphicsSetupView(Context context, String selected, Actions actions) {
        super(context); this.actions = actions;
        titleFace = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF050B0C); setClickable(true); setFocusable(true);
        ImageView art = new ImageView(context); art.setImageResource(R.drawable.warzone_splash);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        addView(art, new LayoutParams(-1, -1));
        View shade = new View(context);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xD9081315, 0xDA071012, 0xF0050B0C}));
        addView(shade, new LayoutParams(-1, -1));

        LinearLayout panel = new LinearLayout(context); panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(24), dp(18), dp(24), dp(18));
        LayoutParams panelParams = new LayoutParams(-1, -1, Gravity.CENTER);
        addView(panel, panelParams);
        LinearLayout header = new LinearLayout(context); header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text("WARZONE TOWERS", 16, CYAN, true);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(44), 1));
        start = button("START GAME", true); start.setEnabled(false);
        start.setContentDescription("Start game");
        start.setOnClickListener(v -> { if (!downloading) actions.start(mode); });
        header.addView(start, new LinearLayout.LayoutParams(dp(126), dp(44)));
        panel.addView(header);
        ScrollView scroll = new ScrollView(context); scroll.setFillViewport(true);
        scroll.setClipToPadding(false); scroll.setVerticalScrollBarEnabled(false);
        LinearLayout content = new LinearLayout(context); content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        scroll.addView(content, new ScrollView.LayoutParams(-1, -1));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        TextView heading = text("CHOOSE YOUR GRAPHICS", 28, INK, true);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2);
        headingParams.topMargin = dp(5); content.addView(heading, headingParams);
        TextView intro = text("Set the look of your next battle.", 14, MUTED, false);
        LinearLayout.LayoutParams introParams = new LinearLayout.LayoutParams(-1, -2);
        introParams.topMargin = dp(5); introParams.bottomMargin = dp(18); content.addView(intro, introParams);

        LinearLayout cards = new LinearLayout(context); cards.setOrientation(LinearLayout.HORIZONTAL);
        normalCard = card(); highCard = card();
        LinearLayout.LayoutParams left = new LinearLayout.LayoutParams(0, -2, 1); left.rightMargin = dp(7);
        LinearLayout.LayoutParams right = new LinearLayout.LayoutParams(0, -2, 1); right.leftMargin = dp(7);
        cards.addView(normalCard, left); cards.addView(highCard, right); content.addView(cards);
        normalMark = addCard(normalCard, "NORMAL", "The familiar Warzone look", "Included · Ready offline");
        highMark = addCard(highCard, "HIGH QUALITY", "More detailed terrain and water", "95 MiB · Download once");
        highNote = (TextView) highCard.getChildAt(3);
        normalCard.setOnClickListener(v -> { if (!downloading) select("normal"); });
        highCard.setOnClickListener(v -> { if (!downloading) select("high"); });
        TextView footnote = text("Your choice is saved. You can change it each time you open the game.", 12, MUTED, false);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
        noteParams.topMargin = dp(13); noteParams.bottomMargin = dp(8); content.addView(footnote, noteParams);

        status = text("", 13, MUTED, false); status.setVisibility(GONE);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.bottomMargin = dp(8); panel.addView(status, statusParams);
        progress = new ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000); progress.setProgressTintList(ColorStateList.valueOf(CYAN));
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(0xFF243638)); progress.setVisibility(GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(-1, dp(5));
        progressParams.topMargin = dp(8); progressParams.bottomMargin = dp(8); panel.addView(progress, progressParams);
        LinearLayout buttons = new LinearLayout(context); buttons.setGravity(Gravity.CENTER_VERTICAL);
        music = button("MUSIC · CHECKING…", false); music.setEnabled(false);
        music.setOnClickListener(v -> actions.music());
        LinearLayout.LayoutParams musicParams = new LinearLayout.LayoutParams(-2, dp(48)); musicParams.rightMargin = dp(12);
        buttons.addView(music, musicParams);
        cancel = button("CANCEL DOWNLOAD", false); cancel.setVisibility(GONE);
        cancel.setOnClickListener(v -> { actions.cancel(); setDownloading(false); showStatus("Download paused. Your progress is saved.", false); });
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(-2, dp(46)); cancelParams.rightMargin = dp(12);
        buttons.addView(cancel, cancelParams);
        panel.addView(buttons, new LinearLayout.LayoutParams(-1, -2));
        select("high".equals(selected) ? "high" : "normal");
        // Keep the launch panel comfortably sized on large tablets.
        addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob) -> {
            int target = Math.min(getWidth(), dp(900));
            LayoutParams params = (LayoutParams) panel.getLayoutParams();
            if (params.width != target) { params.width = target; panel.setLayoutParams(params); }
        });
    }
    private LinearLayout card() {
        LinearLayout card = new LinearLayout(getContext()); card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(17), dp(14), dp(17), dp(15)); card.setMinimumHeight(dp(137));
        card.setClickable(true); card.setFocusable(true); return card;
    }
    private TextView addCard(LinearLayout card, String title, String description, String note) {
        TextView mark = text("○", 20, MUTED, false); card.addView(mark);
        TextView label = text(title, 22, INK, true); card.addView(label);
        TextView detail = text(description, 13, MUTED, false);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(-1, -2);
        descriptionParams.topMargin = dp(5); card.addView(detail, descriptionParams);
        TextView download = text(note, 12, CYAN, false);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
        noteParams.topMargin = dp(11); card.addView(download, noteParams);
        return mark;
    }
    private void select(String value) {
        mode = value;
        if (!downloading) status.setVisibility(GONE);
        decorate(normalCard, normalMark, value.equals("normal"), "Normal graphics");
        decorate(highCard, highMark, value.equals("high"), "High Quality graphics");
        start.setText("START GAME");
        start.setContentDescription("Start game");
    }
    private void decorate(LinearLayout card, TextView mark, boolean selected, String name) {
        GradientDrawable background = new GradientDrawable(); background.setColor(selected ? 0xEE10292D : 0xDB101A1D);
        background.setCornerRadius(dp(8)); background.setStroke(dp(selected ? 2 : 1), selected ? CYAN : 0xFF4B5D60);
        card.setBackground(background); card.setSelected(selected);
        card.setContentDescription(name + (selected ? ", selected" : ", not selected"));
        mark.setText(selected ? "●" : "○"); mark.setTextColor(selected ? CYAN : MUTED);
    }
    void setCached(boolean value) {
        cached = value; highNote.setText(value ? "Downloaded · Ready offline" : "95 MiB · Download once");
        if (!downloading) select(mode);
    }
    void setDownloading(boolean value) {
        downloading = value; normalCard.setEnabled(!value); highCard.setEnabled(!value); start.setEnabled(!value && musicChecked);
        music.setEnabled(!value && musicChecked);
        cancel.setVisibility(value ? VISIBLE : GONE); progress.setVisibility(value ? VISIBLE : GONE);
        start.setText(value ? "PREPARING…" : "START GAME");
        start.setContentDescription(value ? "Preparing High Quality" : "Start game");
    }
    void setMusicState(boolean ready, boolean on) {
        musicChecked = true;
        music.setText(ready ? (on ? "MUSIC · ON" : "MUSIC · OFF") : "MUSIC · DOWNLOAD");
        music.setContentDescription(music.getText());music.setEnabled(!downloading);start.setEnabled(!downloading);
    }
    String selectedMode() { return mode; }
    void downloadProgress(long bytes, boolean verifying) {
        setDownloading(true); progress.setIndeterminate(verifying);
        progress.setProgress((int) (bytes * 1000 / GraphicsPackStore.BYTES));
        showStatus(verifying ? "Verifying your graphics pack…" : String.format(java.util.Locale.ROOT,
                "Downloading High Quality · %d%% · %.1f / 95.0 MiB", bytes * 100 / GraphicsPackStore.BYTES, bytes / 1048576.0), false);
    }
    void showError(String message) {
        setDownloading(false); showStatus(message, true); start.setText("RETRY DOWNLOAD");
        start.setContentDescription(start.getText());
    }
    void showStatus(String message, boolean error) { status.setText(message); status.setTextColor(error ? 0xFFFFAE9F : MUTED); status.setVisibility(VISIBLE); }
    private Button button(String label, boolean primary) {
        Button button = new Button(getContext()); button.setText(label); button.setTextColor(INK);
        button.setTextSize(14); button.setTypeface(titleFace); button.setLetterSpacing(.06f);
        button.setAllCaps(false); button.setPadding(dp(16), 0, dp(16), 0);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(primary ? 0xFF075F6A : 0xFF172629);
        bg.setCornerRadius(dp(5)); bg.setStroke(dp(1), primary ? CYAN : 0xFF566C70); button.setBackground(bg);
        return button;
    }
    private TextView text(String value, int size, int color, boolean condensed) {
        TextView view = new TextView(getContext()); view.setText(value); view.setTextSize(size); view.setTextColor(color);
        if (condensed) view.setTypeface(titleFace); view.setIncludeFontPadding(false); return view;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
