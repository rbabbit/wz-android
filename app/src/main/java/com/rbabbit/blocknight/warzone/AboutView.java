package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.UnderlineSpan;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local legal notices. External URLs are delegated to the user's browser. */
final class AboutView extends FrameLayout {
    private static final int PAPER = 0xFFF6F5F2;
    private static final int INK = 0xFF202225;
    private static final int MUTED = 0xFF52565D;
    private static final int LINK = 0xFF1555A2;
    private static final int RULE = 0xFFD6D7D8;
    private static final String PAGE_TITLE = "About & Licences";
    private final Runnable onClose;
    private final TextView title;
    private final ScrollView overview, reader;
    private final LinearLayout overviewContent, readerContent;
    private final Set<String> documentPaths = new HashSet<>();
    private boolean reading;
    private int overviewScrollY;
    private View documentOpener;

    AboutView(Context context, Runnable onClose) {
        super(context);
        this.onClose = onClose;
        setBackgroundColor(PAPER);
        setClickable(true);
        setFocusable(true);
        setFocusableInTouchMode(true);
        setContentDescription(PAGE_TITLE);

        LinearLayout page = new LinearLayout(context);
        page.setOrientation(LinearLayout.VERTICAL);
        addView(page, new LayoutParams(-1, -1));
        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), dp(6), dp(20), dp(6));
        Button back = new Button(context);
        back.setText("\u2039 Back");
        back.setContentDescription("Back");
        back.setAllCaps(false);
        back.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        back.setTextSize(15);
        back.setTextColor(INK);
        back.setMinWidth(dp(72));
        back.setMinimumWidth(dp(72));
        back.setMinHeight(dp(48));
        back.setMinimumHeight(dp(48));
        back.setPadding(dp(10), 0, dp(10), 0);
        back.setBackgroundTintList(null);
        back.setBackground(new RippleDrawable(ColorStateList.valueOf(0x18000000),
                new ColorDrawable(PAPER), null));
        back.setOnClickListener(v -> back());
        header.addView(back, new LinearLayout.LayoutParams(-2, -2));
        title = text(PAGE_TITLE, 18, INK);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setMaxLines(2);
        heading(title);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, -2, 1);
        titleParams.leftMargin = dp(16);
        header.addView(title, titleParams);
        page.addView(header, new LinearLayout.LayoutParams(-1, -2));
        View rule = new View(context);
        rule.setBackgroundColor(RULE);
        page.addView(rule, new LinearLayout.LayoutParams(-1, dp(1)));
        FrameLayout sheets = new FrameLayout(context);
        page.addView(sheets, new LinearLayout.LayoutParams(-1, 0, 1));
        overview = scroll();
        reader = scroll();
        overviewContent = column();
        readerContent = column();
        overview.addView(overviewContent, new ScrollView.LayoutParams(-1, -2));
        reader.addView(readerContent, new ScrollView.LayoutParams(-1, -2));
        sheets.addView(overview, new LayoutParams(-1, -1, Gravity.CENTER_HORIZONTAL));
        sheets.addView(reader, new LayoutParams(-1, -1, Gravity.CENTER_HORIZONTAL));
        reader.setVisibility(GONE);

        try {
            renderCatalogue(new JSONObject(readAsset("catalog.json", 1024 * 1024)));
        } catch (Exception error) {
            overviewContent.removeAllViews();
            addParagraph(overviewContent,
                    "The bundled licence catalogue could not be opened. Return to the app and try again.");
        }
        setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                        android.view.WindowInsets.Type.systemBars()
                                | android.view.WindowInsets.Type.displayCutout());
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
            setPadding(left, top, right, bottom);
            return insets;
        });
    }

    private void renderCatalogue(JSONObject catalogue) throws Exception {
        TextView app = text("Warzone Towers", 21, INK);
        app.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        overviewContent.addView(app, new LinearLayout.LayoutParams(-1, -2));
        TextView version = text("Version " + GraphicsSetupView.appVersion(getContext()) + " \u00b7 rbabbit", 14, MUTED);
        LinearLayout.LayoutParams versionParams = new LinearLayout.LayoutParams(-1, -2);
        versionParams.topMargin = dp(5);
        versionParams.bottomMargin = dp(16);
        overviewContent.addView(version, versionParams);
        addParagraph(overviewContent,
                "Project information, copyright notices and licences. Full texts below are stored on this device. Web links open in your browser; long press a link to copy its address.");
        JSONArray sections = catalogue.getJSONArray("sections");
        for (int i = 0; i < sections.length(); i++) {
            JSONObject section = sections.getJSONObject(i);
            TextView sectionTitle = text(section.getString("title"), 17, INK);
            sectionTitle.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            heading(sectionTitle);
            LinearLayout.LayoutParams sectionParams = new LinearLayout.LayoutParams(-1, -2);
            sectionParams.topMargin = dp(24);
            sectionParams.bottomMargin = dp(8);
            overviewContent.addView(sectionTitle, sectionParams);
            String body = section.optString("body", "").trim();
            if (!body.isEmpty()) addParagraph(overviewContent, body);
            JSONArray links = section.optJSONArray("links");
            if (links != null) for (int j = 0; j < links.length(); j++) {
                JSONObject link = links.getJSONObject(j);
                String label = link.getString("label"), url = link.getString("url");
                Uri uri = httpsUri(url);
                TextView entry = action(label, url);
                entry.setContentDescription("Open " + label + ". " + url + ". Long press to copy link.");
                entry.setOnClickListener(v -> openBrowser(uri));
                entry.setOnLongClickListener(v -> {
                    ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                    if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText(label, url));
                    Toast.makeText(getContext(), "Link copied", Toast.LENGTH_SHORT).show();
                    return true;
                });
                overviewContent.addView(entry, new LinearLayout.LayoutParams(-1, -2));
            }
            JSONArray documents = section.optJSONArray("documents");
            if (documents != null) for (int j = 0; j < documents.length(); j++) {
                JSONObject document = documents.getJSONObject(j);
                String label = document.getString("title"), path = document.getString("path");
                requireRelativePath(path);
                documentPaths.add(path);
                TextView entry = action(label, "Read full text \u00b7 available offline");
                entry.setContentDescription("Read " + label + ", available offline");
                entry.setOnClickListener(v -> openDocument(label, path, entry));
                overviewContent.addView(entry, new LinearLayout.LayoutParams(-1, -2));
            }
        }
    }

    private TextView action(String label, String detail) {
        SpannableString value = new SpannableString(label + "\n" + detail);
        value.setSpan(new UnderlineSpan(), 0, label.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        TextView view = text("", 15, LINK);
        view.setText(value);
        view.setMinHeight(dp(48));
        view.setPadding(0, dp(9), dp(8), dp(9));
        view.setFocusable(true);
        view.setClickable(true);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x151555A2),
                new ColorDrawable(PAPER), null));
        return view;
    }

    private void openDocument(String label, String path, View opener) {
        if (!documentPaths.contains(path)) return;
        readerContent.removeAllViews();
        String value;
        try {
            value = readAsset(path, 4 * 1024 * 1024);
        } catch (IOException error) {
            value = "This bundled document could not be opened. Return to the licence list and try again.";
        }
        TextView fullText = text(value, 13, INK);
        fullText.setTypeface(Typeface.MONOSPACE);
        fullText.setTextIsSelectable(true);
        fullText.setHorizontallyScrolling(false);
        fullText.setLineSpacing(dp(3), 1f);
        fullText.setContentDescription(null);
        readerContent.addView(fullText, new LinearLayout.LayoutParams(-1, -2));
        overviewScrollY = overview.getScrollY();
        documentOpener = opener;
        reading = true;
        overview.setVisibility(GONE);
        reader.setVisibility(VISIBLE);
        title.setText(label);
        reader.scrollTo(0, 0);
        reader.requestFocus();
        announceForAccessibility(label);
    }

    void back() {
        if (!reading) {
            onClose.run();
            return;
        }
        reading = false;
        reader.setVisibility(GONE);
        overview.setVisibility(VISIBLE);
        title.setText(PAGE_TITLE);
        readerContent.removeAllViews();
        overview.post(() -> {
            if (documentOpener != null) documentOpener.requestFocus();
            overview.scrollTo(0, overviewScrollY);
        });
        announceForAccessibility(PAGE_TITLE);
    }

    private void openBrowser(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        if (!(getContext() instanceof Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException error) {
            Toast.makeText(getContext(),
                    "No browser is available. Long press the link to copy its address.", Toast.LENGTH_LONG).show();
        }
    }

    private static Uri httpsUri(String value) {
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getHost().isEmpty() || uri.getUserInfo() != null)
            throw new IllegalArgumentException("Only HTTPS document links are permitted");
        return uri;
    }

    private static void requireRelativePath(String path) {
        if (path.isEmpty() || path.startsWith("/") || path.contains("..")
                || !path.matches("[A-Za-z0-9_./-]+"))
            throw new IllegalArgumentException("Invalid bundled document path");
    }

    private String readAsset(String path, int maxBytes) throws IOException {
        requireRelativePath(path);
        try (InputStream input = getContext().getAssets().open("legal/" + path);
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int size;
            while ((size = input.read(buffer)) != -1) {
                if (output.size() + size > maxBytes) throw new IOException("Bundled document exceeds reader limit");
                output.write(buffer, 0, size);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private ScrollView scroll() {
        ScrollView view = new ScrollView(getContext()) {
            @Override protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
                int width = Math.min(MeasureSpec.getSize(widthMeasureSpec), dp(900));
                super.onMeasure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), heightMeasureSpec);
            }
        };
        view.setFillViewport(false);
        view.setOverScrollMode(OVER_SCROLL_IF_CONTENT_SCROLLS);
        view.setClipToPadding(false);
        return view;
    }

    private LinearLayout column() {
        LinearLayout view = new LinearLayout(getContext());
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(24), dp(22), dp(24), dp(40));
        return view;
    }

    private void addParagraph(LinearLayout parent, String value) {
        TextView paragraph = text(value, 15, INK);
        paragraph.setTextIsSelectable(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(6);
        parent.addView(paragraph, params);
    }

    private TextView text(String value, int size, int colour) {
        TextView view = new TextView(getContext());
        view.setText(value);
        view.setTextColor(colour);
        view.setTextSize(size);
        view.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        view.setLineSpacing(dp(3), 1f);
        view.setIncludeFontPadding(true);
        return view;
    }

    private static void heading(TextView view) {
        if (Build.VERSION.SDK_INT >= 28) view.setAccessibilityHeading(true);
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        requestApplyInsets();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
