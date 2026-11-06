package com.rbabbit.blocknight.warzone;

import android.app.AlertDialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import android.widget.*;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONObject;

/** Real Android views. The WebView below this tree renders only the Warzone engine. */
final class TowersNativeUi {
  private static final int BG = 0xff10191e,
      CARD = 0xff1a282e,
      RAIL = 0xff162127,
      LINE = 0xff2c3c43,
      TEXT = 0xffedf2ee,
      MUTED = 0xff9faeb5,
      ACCENT = 0xffedba57,
      CYAN = 0xff80c9ce,
      GREEN = 0xffa8d786;
  private final MainActivity activity;
  private final WebView engine;
  private final Handler handler = new Handler(Looper.getMainLooper());
  final LinearLayout shell;
  final FrameLayout stage;
  private final LinearLayout header;
  private final LinearLayout waveRow;
  private final HorizontalScrollView navigationScroll;
  private final ImageView frozen;
  private final Feedback feedback;
  private final View navigationGuard;
  private boolean navigationPending, pauseTransition;
  private final TextView waveLabel, powerLabel, selectionLabel;
  private final Map<Button, String> headerActions = new LinkedHashMap<>();
  private final Button skip, units, map, moreButton;
  private final LinearLayout field;
  private final Map<Integer, Pending> pending = new HashMap<>();
  private final Map<String, JSONObject> parts = new LinkedHashMap<>();
  private final Map<String, JSONObject> researchCatalogue = new LinkedHashMap<>();
  private final JSONObject catalogue;
  private JSONObject model = new JSONObject(),
      commands = new JSONObject(),
      snapshot = new JSONObject(),
      research = new JSONObject();
  private JSONArray saved = new JSONArray();
  private int requestId, navigation, validationSerial;
  private long selectedLab, factory;
  private String page = "",
      category = "ALL",
      search = "",
      buildCategory = "DEFENCES",
      selectedTopic = "",
      preferredDesign = "";
  private int quantity = 1;
  private boolean ready, closing, fieldExpanded, draftTouched, savedInitialised, buildWasOpen;
  private boolean enginePaused, resuming;
  private long pauseClock, pauseStarted;
  private JSONObject draft = new JSONObject(), validation;
  private boolean designSaving;
  private LinearLayout panel, body, controls, detail;
  private TextView title, status, liveDetail, researchTiming, validationLabel;
  private TextView summaryCaption, factoryTiming;
  private Button quantityButton;
  private ProgressBar factoryProgress;
  private Spinner labSpinner, factorySpinner;
  private EditText designName;
  private Button saveButton, saveNewButton;
  private ProgressBar labProgress;
  private Button researchRetry, factoryRetry;
  private Rows rows, queueRows;
  private ListView list, queueList;
  private String labSignature = "", factorySignature = "", detailSignature = "";
  private float controlScale;
  private String headerWaveText = "Preparing battlefield",
      compactWaveText = "Preparing battlefield";
  private boolean mergedHeader;
  private final Map<TextView, Float> textSizes = new WeakHashMap<>();
  private final android.util.LruCache<String, Bitmap> artwork =
      new android.util.LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap image) {
          return image.getByteCount();
        }
      };
  private final Set<String> missingArtwork = new HashSet<>();
  private AlertDialog activeDialog;
  private boolean dialogScrolling;
  private boolean overlayFrameReady = true;
  private int overlayFrameSerial;
  private final Map<String, String> searches = new HashMap<>();
  private boolean destroyed;
  private Toast noticeToast;
  private String session = UUID.randomUUID().toString();

  private static final class Pending {
    final Consumer<JSONObject> callback;
    final Runnable timeout;

    Pending(Consumer<JSONObject> c, Runnable t) {
      callback = c;
      timeout = t;
    }
  }

  TowersNativeUi(MainActivity activity, WebView engine) {
    this.activity = activity;
    this.engine = engine;
    JSONObject c;
    try (InputStream in = activity.getAssets().open("warzone/command-catalog.json");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int n;
      while ((n = in.read(buffer)) != -1) bytes.write(buffer, 0, n);
      c = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
    } catch (Exception e) {
      throw new IllegalStateException("Command catalogue unavailable", e);
    }
    catalogue = c;
    JSONObject groups = obj(catalogue, "components");
    for (Iterator<String> it = groups.keys(); it.hasNext(); ) {
      JSONArray values = arr(groups, it.next());
      for (int i = 0; i < values.length(); i++) {
        JSONObject part = values.optJSONObject(i);
        if (part != null) parts.put(part.optString("id"), part);
      }
    }
    controlScale = activity.getPreferences(Context.MODE_PRIVATE).getFloat("native_controls", 1f);
    shell = column();
    shell.setBackgroundColor(Color.BLACK);
    header = row();
    header.setPadding(dp(8), 0, dp(8), 0);
    header.setBackgroundColor(RAIL);
    header.setVisibility(View.INVISIBLE);
    navigationScroll = new HorizontalScrollView(activity);
    navigationScroll.setHorizontalScrollBarEnabled(false);
    LinearLayout nav = row();
    navigationScroll.addView(nav);
    headerAction(nav, "BUILD", "build");
    headerAction(nav, "TECH", "research");
    headerAction(nav, "FACTORY", "factory");
    headerAction(nav, "DESIGN", "design");
    header.addView(navigationScroll, new LinearLayout.LayoutParams(0, hit(), 1));
    moreButton = button("MORE", () -> more(null));
    powerLabel = text("", 13, true);
    powerLabel.setSingleLine(true);
    waveLabel = text("Preparing battlefield", 11, false);
    waveLabel.setTextColor(MUTED);
    waveLabel.setMaxLines(2);
    waveLabel.setEllipsize(android.text.TextUtils.TruncateAt.END);
    waveRow = row();
    waveRow.addView(powerLabel, new LinearLayout.LayoutParams(dp(100), hit()));
    waveRow.addView(waveLabel, new LinearLayout.LayoutParams(dp(92), hit()));
    skip = button("SKIP", () -> request("skip-wave", new JSONObject(), null));
    skip.setContentDescription("SKIP WAVE");
    waveRow.addView(skip, new LinearLayout.LayoutParams(dp(50), hit()));
    header.addView(waveRow, new LinearLayout.LayoutParams(-2, hit()));
    header.addView(moreButton, new LinearLayout.LayoutParams(dp(50), hit()));
    header.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> layoutHeader());
    shell.addView(header, new LinearLayout.LayoutParams(-1, hit()));
    stage = new FrameLayout(activity);
    stage.setClipChildren(true);
    stage.setClipToPadding(true);
    stage.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> resizeBuildPane());
    shell.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));
    stage.addView(engine, new FrameLayout.LayoutParams(-1, -1));
    frozen = new ImageView(activity);
    frozen.setScaleType(ImageView.ScaleType.FIT_XY);
    frozen.setVisibility(View.GONE);
    frozen.setOnTouchListener((v, e) -> true);
    stage.addView(frozen, new FrameLayout.LayoutParams(-1, -1));
    feedback = new Feedback(activity);
    feedback.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    stage.addView(feedback, new FrameLayout.LayoutParams(-1, -1));
    field = column();
    field.setClickable(true);
    field.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    field.setBackground(background(0xee10191e, LINE));
    field.setPadding(0, 0, 0, 0);
    LinearLayout fieldHeading = row();
    units =
        button(
            "UNIT CONTROLS",
            () -> {
              fieldExpanded = !fieldExpanded;
              renderField();
            });
    selectionLabel = text("0 selected", 12, false);
    selectionLabel.setPadding(dp(12), 0, dp(12), 0);
    fieldHeading.addView(selectionLabel);
    fieldHeading.addView(units);
    field.addView(fieldHeading);
    FrameLayout.LayoutParams fp =
        new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
    fp.setMargins(dp(8), 0, dp(8), dp(8));
    stage.addView(field, fp);
    field.setVisibility(View.GONE);
    map = button("SHOW MAP", () -> request("map", new JSONObject(), null));
    FrameLayout.LayoutParams mp =
        new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
    mp.setMargins(0, 0, dp(12), dp(12));
    stage.addView(map, mp);
    map.setVisibility(View.GONE);
    navigationGuard = new View(activity);
    navigationGuard.setClickable(true);
    navigationGuard.setContentDescription("Updating battle controls");
    navigationGuard.setVisibility(View.GONE);
    stage.addView(navigationGuard, new FrameLayout.LayoutParams(-1, -1));
    newDraft();
  }

  private void navigationPending(boolean pending) {
    navigationPending = pending;
    navigationGuard.setVisibility(pending ? View.VISIBLE : View.GONE);
    if (pending) {
      navigationGuard.bringToFront();
      field.setVisibility(View.GONE);
      map.setVisibility(View.GONE);
    }
    if (panel != null)
      panel.setImportantForAccessibility(
          pending
              ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
              : View.IMPORTANT_FOR_ACCESSIBILITY_NO);
  }

  private int dp(float v) {
    return Math.round(v * activity.getResources().getDisplayMetrics().density);
  }

  private int hit() {
    // Text grows independently; a landscape phone must retain room for the actual lists.
    return dp(48);
  }

  private void headerAction(LinearLayout parent, String label, String target) {
    Button b = button(label, () -> open(target));
    parent.addView(b, new LinearLayout.LayoutParams(-2, hit()));
    headerActions.put(b, target);
  }

  private void layoutHeader() {
    if (header.getWidth() == 0) return;
    int navigationWidth = 0;
    for (Map.Entry<Button, String> entry : headerActions.entrySet()) {
      Button b = entry.getKey();
      int preferred =
          entry.getValue().equals("factory") ? 76 : entry.getValue().equals("design") ? 68 : 62;
      int wanted =
          Math.max(
              dp(preferred),
              (int) Math.ceil(b.getPaint().measureText(b.getText().toString())) + dp(20));
      navigationWidth += wanted;
      LinearLayout.LayoutParams nav = (LinearLayout.LayoutParams) b.getLayoutParams();
      if (nav.width != wanted || nav.height != hit()) {
        nav.width = wanted;
        nav.height = hit();
        b.setLayoutParams(nav);
      }
      boolean active =
          entry.getValue().equals(page)
              || (entry.getValue().equals("design") && page.equals("saved"));
      b.setTextColor(
          new ColorStateList(
              new int[][] {new int[] {-android.R.attr.state_enabled}, new int[] {}},
              new int[] {MUTED, active ? ACCENT : TEXT}));
      if (!Boolean.valueOf(active).equals(b.getTag())) {
        b.setTag(active);
        android.graphics.drawable.LayerDrawable layers =
            new android.graphics.drawable.LayerDrawable(
                new android.graphics.drawable.Drawable[] {
                  new android.graphics.drawable.ColorDrawable(active ? 0xff252b28 : RAIL),
                  new android.graphics.drawable.ColorDrawable(active ? ACCENT : RAIL)
                });
        layers.setLayerHeight(1, dp(2));
        layers.setLayerGravity(1, Gravity.BOTTOM);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337f9299), layers, null));
      }
    }
    int skipWidth =
        Math.max(
            dp(50),
            (int) Math.ceil(skip.getPaint().measureText(skip.getText().toString()))
                + skip.getPaddingLeft()
                + skip.getPaddingRight());
    int moreWidth =
        Math.max(
            dp(50),
            (int) Math.ceil(moreButton.getPaint().measureText(moreButton.getText().toString()))
                + moreButton.getPaddingLeft()
                + moreButton.getPaddingRight());
    setHeaderWidth(skip, skipWidth);
    setHeaderWidth(moreButton, moreWidth);
    int powerWidth = headerLabelWidth(powerLabel, powerLabel.getText().toString(), 100);
    int waveWidth = headerLabelWidth(waveLabel, headerWaveText, 92);
    mergedHeader =
        navigationWidth
                + powerWidth
                + waveWidth
                + skipWidth
                + moreWidth
                + header.getPaddingLeft()
                + header.getPaddingRight()
            > header.getWidth();
    powerLabel.setVisibility(mergedHeader ? View.GONE : View.VISIBLE);
    String waveText = mergedHeader ? compactWaveText + "\n" + powerLabel.getText() : headerWaveText;
    if (!waveLabel.getText().toString().equals(waveText)) waveLabel.setText(waveText);
    setHeaderWidth(powerLabel, powerWidth);
    setHeaderWidth(waveLabel, headerLabelWidth(waveLabel, waveText, 92));
  }

  private int headerLabelWidth(TextView label, String value, int minimum) {
    float widest = 0;
    for (String line : value.split("\n"))
      widest = Math.max(widest, label.getPaint().measureText(line));
    return Math.max(dp(minimum), (int) Math.ceil(widest) + dp(8));
  }

  private void setHeaderWidth(View view, int width) {
    LinearLayout.LayoutParams p = (LinearLayout.LayoutParams) view.getLayoutParams();
    if (p.width != width || p.height != hit()) {
      p.width = width;
      p.height = hit();
      view.setLayoutParams(p);
    }
  }

  private int textHeight(TextView text, int lines, int minimum) {
    return Math.max(
        dp(minimum),
        text.getLineHeight() * lines
            + text.getCompoundPaddingTop()
            + text.getCompoundPaddingBottom());
  }

  private int buildPaneWidth() {
    return Math.min(dp(300 * controlScale), Math.round(stage.getWidth() * .45f));
  }

  private void resizeBuildPane() {
    if (panel == null || !page.equals("build")) return;
    FrameLayout.LayoutParams p = (FrameLayout.LayoutParams) panel.getLayoutParams();
    int width = buildPaneWidth();
    if (p.width != width) {
      p.width = width;
      panel.setLayoutParams(p);
    }
  }

  private LinearLayout column() {
    LinearLayout v = new LinearLayout(activity);
    v.setOrientation(LinearLayout.VERTICAL);
    return v;
  }

  private LinearLayout row() {
    LinearLayout v = new LinearLayout(activity);
    v.setOrientation(LinearLayout.HORIZONTAL);
    v.setGravity(Gravity.CENTER_VERTICAL);
    return v;
  }

  private GradientDrawable background(int color, int border) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(4));
    if (border != 0) d.setStroke(dp(1), border);
    return d;
  }

  private TextView text(String value, int size, boolean bold) {
    TextView v = new TextView(activity);
    v.setText(value);
    v.setTextColor(TEXT);
    v.setTextSize(size * controlScale);
    v.setIncludeFontPadding(false);
    v.setGravity(Gravity.CENTER_VERTICAL);
    textSizes.put(v, (float) size);
    v.setFontFeatureSettings("kern");
    v.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
    return v;
  }

  private Button button(String value, Runnable action) {
    Button b = new Button(activity);
    b.setText(compactLabel(value));
    b.setTextSize(13 * controlScale);
    textSizes.put(b, 13f);
    b.setTextColor(
        new ColorStateList(
            new int[][] {new int[] {-android.R.attr.state_enabled}, new int[] {}},
            new int[] {MUTED, TEXT}));
    b.setAllCaps(false);
    b.setSingleLine(true);
    b.setIncludeFontPadding(false);
    b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    b.setStateListAnimator(null);
    b.setElevation(0);
    b.setMinHeight(hit());
    b.setMinimumHeight(hit());
    b.setMinWidth(dp(48));
    b.setMinimumWidth(dp(48));
    b.setPadding(dp(10), 0, dp(10), 0);
    b.setBackground(
        new RippleDrawable(ColorStateList.valueOf(0x3368b7bf), background(RAIL, 0), null));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2);
    b.setLayoutParams(p);
    b.setOnClickListener(v -> action.run());
    b.setContentDescription(value);
    return b;
  }

  private String compactLabel(String value) {
    if (value.equals("UNIT CONTROLS")) return "Orders";
    if (value.equals("SHOW MAP")) return "Map";
    if (value.equals("SAVE BLUEPRINT")) return "Save";
    if (value.equals("SAVE AS NEW")) return "Save new";
    return value.length() > 1 && value.equals(value.toUpperCase(Locale.ROOT))
        ? value.substring(0, 1) + value.substring(1).toLowerCase(Locale.ROOT)
        : value;
  }

  private EditText input(String hint) {
    EditText e = new EditText(activity);
    e.setSingleLine(true);
    e.setTextColor(TEXT);
    e.setHintTextColor(MUTED);
    e.setTextSize(13 * controlScale);
    textSizes.put(e, 13f);
    e.setIncludeFontPadding(false);
    e.setHint(hint);
    e.setContentDescription(hint);
    e.setMinHeight(hit());
    e.setPadding(dp(12), dp(4), dp(12), dp(4));
    e.setBackground(
        new android.graphics.drawable.InsetDrawable(background(CARD, 0), 0, dp(4), 0, dp(4)));
    e.setSelectAllOnFocus(false);
    return e;
  }

  private void watch(EditText e, Consumer<String> action) {
    e.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int st, int c, int a) {}

          public void onTextChanged(CharSequence s, int st, int b, int c) {
            action.accept(s.toString());
          }

          public void afterTextChanged(Editable e) {}
        });
  }

  private Spinner spinner(LinearLayout parent, int width) {
    Spinner s = new NativePicker(activity);
    s.setMinimumHeight(hit());
    s.setBackground(background(BG, 0));
    s.setPadding(0, 0, 0, 0);
    boolean vertical = parent.getOrientation() == LinearLayout.VERTICAL;
    LinearLayout.LayoutParams p =
        new LinearLayout.LayoutParams(
            vertical ? -1 : width == 0 ? 0 : dp(width), hit(), !vertical && width == 0 ? 1 : 0);
    parent.addView(s, p);
    return s;
  }

  private void showDialog(AlertDialog dialog) {
    if (activeDialog != null) activeDialog.dismiss();
    activeDialog = dialog;
    int frame = ++overlayFrameSerial;
    overlayFrameReady = false;
    dialogScrolling = false;
    dialog.setOnDismissListener(d -> {
      if (activeDialog == dialog) {
        activeDialog = null;
        int closing = ++overlayFrameSerial;
        overlayFrameReady = false;
        afterFrame(
            shell,
            () -> {
              if (closing == overlayFrameSerial) overlayFrameReady = true;
            });
      }
    });
    // Keep battle pickers immediately usable when returning between controls.
    // A closing dimmed window must not consume the next quick player tap.
    dialog.getWindow().setWindowAnimations(0);
    dialog.show();
    afterFrame(
        dialog.getWindow().getDecorView(),
        () -> {
          if (frame == overlayFrameSerial && activeDialog == dialog) overlayFrameReady = true;
        });
    if (dialog.getListView() != null)
      dialog
          .getListView()
          .setOnScrollListener(
              new AbsListView.OnScrollListener() {
                public void onScrollStateChanged(AbsListView view, int state) {
                  if (activeDialog == dialog) dialogScrolling = state != SCROLL_STATE_IDLE;
                }

                public void onScroll(AbsListView view, int first, int visible, int total) {}
              });
  }

  private void afterFrame(View view, Runnable complete) {
    Runnable submitted = () -> handler.post(() -> view.postOnAnimation(complete));
    if (android.os.Build.VERSION.SDK_INT >= 29 && view.isHardwareAccelerated())
      view.getViewTreeObserver().registerFrameCommitCallback(submitted);
    else view.postOnAnimation(() -> view.postOnAnimation(submitted));
    view.invalidate();
  }

  private final class NativePicker extends Spinner {
    List<String> keys = Collections.emptyList();

    NativePicker(Context context) {
      // Dialog mode avoids Spinner's separate dropdown drag/long-press popup.
      super(context, Spinner.MODE_DIALOG);
    }

    @Override
    public boolean performClick() {
      if (getAdapter() == null || getAdapter().getCount() == 0) return false;
      List<String> originalKeys = new ArrayList<>(keys);
      List<String> labels = new ArrayList<>();
      for (int i = 0; i < getAdapter().getCount(); i++)
        labels.add(String.valueOf(getAdapter().getItem(i)));
      ArrayAdapter<String> choices =
          new ArrayAdapter<String>(activity, android.R.layout.select_dialog_singlechoice, labels) {
            @Override
            public View getView(int position, View reuse, ViewGroup parent) {
              TextView v = (TextView) super.getView(position, reuse, parent);
              v.setTextSize(14 * controlScale);
              v.setMinHeight(hit());
              return v;
            }
          };
      showDialog(
          new AlertDialog.Builder(activity)
              .setTitle(
                  getContentDescription() == null ? "Choose an option" : getContentDescription())
              .setSingleChoiceItems(
                  choices,
                  getSelectedItemPosition(),
                  (dialog, which) -> {
                    int current = keys.indexOf(originalKeys.get(which));
                    if (current >= 0) setSelection(current);
                    else notice("That item is no longer available.", false);
                    dialog.dismiss();
                    if (page.equals("build")) resumeInput();
                  })
              .setNegativeButton("Cancel", null)
              .create());
      return true;
    }
  }

  private void options(
      Spinner spinner, List<String> labels, int selection, Consumer<Integer> action) {
    options(spinner, labels, labels, selection, action);
  }

  private void options(
      Spinner spinner,
      List<String> labels,
      List<String> keys,
      int selection,
      Consumer<Integer> action) {
    ((NativePicker) spinner).keys = new ArrayList<>(keys);
    spinner.setOnItemSelectedListener(null);
    ArrayAdapter<String> adapter =
        new ArrayAdapter<String>(activity, android.R.layout.simple_spinner_item, labels) {
          @Override
          public View getView(int pos, View reuse, ViewGroup parent) {
            TextView v = (TextView) super.getView(pos, reuse, parent);
            v.setTextColor(TEXT);
            v.setTextSize(13 * controlScale);
            v.setIncludeFontPadding(false);
            v.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            String label = labels.get(pos);
            if (spinner == labSpinner)
              label = label.replace("Medium Body - ", "").replace("Heavy Body - ", "");
            else if (spinner == factorySpinner)
              label =
                  label
                      .replaceFirst(" · \\d+ modules$", "")
                      .replace("Cyborg factory", "Cyborg")
                      .replace("VTOL factory", "VTOL");
            else if (label.equals("ALL")) label = page.equals("research") ? "All tech" : "All";
            else if (label.equals(label.toUpperCase(Locale.ROOT))) label = compactLabel(label);
            if (spinner == labSpinner
                && spinner.getLayoutParams().width > 0
                && v.getPaint().measureText(label) > spinner.getLayoutParams().width - dp(36)) {
              int separator = label.indexOf(" · ");
              if (separator > 0) label = label.substring(0, separator);
            }
            v.setText(label);
            v.setSingleLine(true);
            v.setEllipsize(android.text.TextUtils.TruncateAt.END);
            v.setPadding(dp(8), 0, dp(8), 0);
            android.graphics.drawable.Drawable arrow =
                activity.getDrawable(android.R.drawable.arrow_down_float);
            arrow.setTint(MUTED);
            arrow.setBounds(0, 0, dp(12), dp(8));
            v.setCompoundDrawables(null, null, arrow, null);
            v.setCompoundDrawablePadding(dp(8));
            v.setLayoutParams(new ViewGroup.LayoutParams(-1, hit()));
            v.setMinHeight(hit());
            v.setGravity(Gravity.CENTER_VERTICAL);
            return v;
          }

          @Override
          public View getDropDownView(int pos, View reuse, ViewGroup parent) {
            TextView v = (TextView) super.getDropDownView(pos, reuse, parent);
            v.setTextColor(TEXT);
            v.setBackgroundColor(CARD);
            v.setMinHeight(hit());
            v.setTextSize(14 * controlScale);
            return v;
          }
        };
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    spinner.setSelection(Math.max(0, Math.min(selection, labels.size() - 1)), false);
    spinner.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> a) {}

          public void onItemSelected(AdapterView<?> a, View v, int p, long id) {
            action.accept(p);
          }
        });
  }

  private static JSONObject obj(JSONObject o, String key) {
    JSONObject v = o.optJSONObject(key);
    return v == null ? new JSONObject() : v;
  }

  private static JSONArray arr(JSONObject o, String key) {
    JSONArray v = o.optJSONArray(key);
    return v == null ? new JSONArray() : v;
  }

  private static JSONObject json(Object... fields) {
    JSONObject o = new JSONObject();
    try {
      for (int i = 0; i < fields.length; i += 2) o.put((String) fields[i], fields[i + 1]);
    } catch (Exception e) {
      throw new IllegalArgumentException(e);
    }
    return o;
  }

  private static List<JSONObject> objects(JSONArray a) {
    List<JSONObject> list = new ArrayList<>();
    for (int i = 0; i < a.length(); i++)
      if (a.optJSONObject(i) != null) list.add(a.optJSONObject(i));
    return list;
  }

  private JSONObject find(JSONArray a, long id) {
    for (JSONObject v : objects(a)) if (v.optLong("id") == id) return v;
    return new JSONObject();
  }

  private String name(String id) {
    JSONObject p = parts.get(id);
    return p == null ? id : p.optString("name", id);
  }

  private String time(double seconds) {
    return String.format(
        Locale.ROOT, "%d:%02d", (int) Math.max(0, seconds) / 60, (int) Math.max(0, seconds) % 60);
  }

  void ready() {
    ready = true;
    shell.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
    header.setVisibility(View.VISIBLE);
    field.setVisibility(View.VISIBLE);
    renderModel();
  }

  String session() {
    return session;
  }

  boolean gameReady() {
    return ready && !destroyed;
  }

  boolean hasReadyModel() {
    JSONObject touch = obj(model, "touch");
    return snapshot.has("gameTime")
        && research.optInt("bridgeSyncs") > 0
        && touch.optBoolean("hudVisible")
        && !touch.optBoolean("cameraFacingPending")
        && touch.optInt("cameraFacings") > 0;
  }

  void suspend() {
    ready = false;
    shell.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    ++navigation;
    ++validationSerial;
    if (activeDialog != null) activeDialog.dismiss();
    pending.clear();
    handler.removeCallbacksAndMessages(null);
    if (noticeToast != null) noticeToast.cancel();
    header.setVisibility(View.INVISIBLE);
    field.setVisibility(View.GONE);
    map.setVisibility(View.GONE);
    navigationPending(false);
    frozen.setVisibility(View.GONE);
    frozen.setImageDrawable(null);
  }

  void resetForBattle() {
    suspend();
    session = UUID.randomUUID().toString();
    ++overlayFrameSerial;
    overlayFrameReady = true;
    if (panel != null) stage.removeView(panel);
    panel = null;
    page = "";
    status = null;
    model = new JSONObject();
    commands = new JSONObject();
    snapshot = new JSONObject();
    research = new JSONObject();
    researchCatalogue.clear();
    selectedLab = 0;
    factory = 0;
    preferredDesign = "";
    searches.clear();
    search = "";
    category = "ALL";
    buildCategory = "DEFENCES";
    selectedTopic = "";
    quantity = 1;
    closing = false;
    fieldExpanded = false;
    buildWasOpen = false;
    enginePaused = false;
    pauseTransition = false;
    resuming = false;
    designSaving = false;
    validation = null;
    labSpinner = null;
    factorySpinner = null;
    designName = null;
    saveButton = null;
    saveNewButton = null;
    validationLabel = null;
    list = null;
    queueList = null;
    rows = null;
    queueRows = null;
    feedback.start = 0;
    feedback.invalidate();
    enableNavigation(true);
  }

  void receiveModel(String data) {
    if (destroyed || data == null || data.length() > 2000000) return;
    try {
      JSONObject incoming = new JSONObject(data);
      if (!session.equals(incoming.optString("session"))) return;
      model = incoming;
      commands = obj(model, "commands");
      snapshot = obj(commands, "snapshot");
      research = obj(model, "research");
      saved = arr(commands, "saved");
      if (!savedInitialised) {
        savedInitialised = true;
        newDraft();
      }
      renderModel();
    } catch (Exception e) {
      android.util.Log.e("TowersNativeUi", "Invalid native model", e);
    }
  }

  void receiveResult(int id, String data) {
    if (destroyed) return;
    try {
      JSONObject result = new JSONObject(data);
      if (!session.equals(result.optString("session"))) return;
      Pending p = pending.remove(id);
      if (p == null) return;
      handler.removeCallbacks(p.timeout);
      if (!result.optBoolean("ok")) notice(result.optString("error", "Command failed"), true);
      if (p.callback != null) p.callback.accept(result);
    } catch (Exception e) {
      notice("The game reply could not be read.", true);
    }
  }

  private void request(String action, JSONObject data, Consumer<JSONObject> callback) {
    if (pending.size() >= 32) {
      notice("Waiting for the game. Please try again.", true);
      return;
    }
    int id = ++requestId;
    Runnable timeout =
        () -> {
          Pending p = pending.remove(id);
          if (p != null) {
            notice("The game has not replied. Accepted orders remain in the game.", true);
            if (p.callback != null) p.callback.accept(json("ok", false, "error", "timeout"));
          }
        };
    pending.put(id, new Pending(callback, timeout));
    handler.postDelayed(timeout, 20000);
    engine.evaluateJavascript(
        "window.__towersNative?.dispatch("
            + json("session", session, "id", id, "action", action, "data", data)
            + ")",
        null);
  }

  void notice(String text, boolean error) {
    if (destroyed) return;
    if (status != null && !page.equals("build")) {
      status.setText(error ? text : "");
      status.setVisibility(error && !text.isEmpty() ? View.VISIBLE : View.GONE);
    }
    if (noticeToast != null) noticeToast.cancel();
    // Live queues and original field blueprints already confirm routine actions.
    // A system Toast would cover catalogue choices during rapid play.
    if (!error && (page.equals("research") || page.equals("factory") || page.equals("build"))) {
      noticeToast = null;
      return;
    }
    noticeToast = Toast.makeText(activity, text, error ? Toast.LENGTH_LONG : Toast.LENGTH_SHORT);
    noticeToast.show();
  }

  private void hideKeyboard() {
    ((InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE))
        .hideSoftInputFromWindow(shell.getWindowToken(), 0);
    if (panel != null) panel.clearFocus();
  }

  boolean dismissKeyboardIfVisible() {
    boolean visible = false;
    if (android.os.Build.VERSION.SDK_INT >= 30) {
      WindowInsets insets = shell.getRootWindowInsets();
      visible = insets != null && insets.isVisible(WindowInsets.Type.ime());
    } else {
      Rect frame = new Rect();
      shell.getWindowVisibleDisplayFrame(frame);
      visible =
          shell.getRootView().getHeight() - frame.height() > shell.getRootView().getHeight() * .2f;
    }
    if (visible) {
      hideKeyboard();
      return true;
    }
    return false;
  }

  private void resumeInput() {
    engine.requestFocus();
    engine.evaluateJavascript(
        "window.__kalaWarzoneTouch?.resumeInput();document.getElementById('canvas')?.focus({preventScroll:true});",
        null);
  }

  private void more(View anchor) {
    String[] labels = {
      "Blueprint library",
      "All orders",
      "Base",
      "Near view",
      "Battle view",
      "Map view",
      "Help & interface size",
      "Engine statistics",
      "Engine commanders",
      "Engine pause / save / load"
    };
    showDialog(
        new AlertDialog.Builder(activity)
            .setTitle("BATTLE COMMANDS")
            .setItems(
                labels,
                (dialog, which) -> {
                  switch (labels[which]) {
                    case "Blueprint library":
                      open("saved");
                      break;
                    case "All orders":
                      open("queue");
                      break;
                    case "Base":
                      control("jumpToBase");
                      break;
                    case "Near view":
                      zoom("close");
                      break;
                    case "Battle view":
                      zoom("battle");
                      break;
                    case "Map view":
                      zoom("map");
                      break;
                    case "Help & interface size":
                      open("help");
                      break;
                    case "Engine statistics":
                      engineMenu("stats");
                      break;
                    case "Engine commanders":
                      engineMenu("commanders");
                      break;
                    default:
                      pauseGame();
                  }
                })
            .setNegativeButton("Cancel", null)
            .create());
  }

  private void control(String name) {
    JSONObject data = json("name", name);
    String flag =
        name.equals("toggleCombatLock")
            ? "combatLock"
            : name.equals("toggleAutoFight")
                ? "autoFight"
                : name.equals("toggleBoxMode")
                    ? "boxMode"
                    : name.equals("toggleQueueMode") ? "queueMode" : "";
    if (!flag.isEmpty())
      data = json("name", name, "enabled", !obj(model, "touch").optBoolean(flag));
    JSONObject command = data;
    backToBattle(() -> {
      int revision = navigation;
      request(
          "control",
          command,
          r -> {
            if (revision == navigation && page.isEmpty()) resumeInput();
          });
    });
  }

  private void zoom(String preset) {
    backToBattle(() -> {
      int revision = navigation;
      request(
          "zoom",
          json("preset", preset),
          r -> {
            if (revision == navigation && page.isEmpty()) resumeInput();
          });
    });
  }

  private void engineMenu(String menu) {
    backToBattle(() -> {
      int revision = navigation;
      request(
          "engine-menu",
          json("menu", menu),
          r -> {
            if (revision != navigation || !r.optBoolean("ok")) return;
            showEngineReturn();
            resumeInput();
          });
    });
  }

  private void showEngineReturn() {
    page = "engine";
    if (panel != null) stage.removeView(panel);
    panel = column();
    panel.setClickable(true);
    panel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    panel.addView(button("RETURN FROM ENGINE MENU", () -> backToBattle(null)));
    FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
    stage.addView(panel, p);
    field.setVisibility(View.GONE);
  }

  void pauseGame() {
    if (!ready || pauseTransition) return;
    if (enginePaused) {
      resumeEngine(0);
      return;
    }
    backToBattle(() -> {
      int revision = navigation;
      pauseTransition = true;
      enableNavigation(false);
      navigationPending(true);
      request(
          "engine-pause",
          new JSONObject(),
          r -> {
            pauseTransition = false;
            if (revision != navigation) return;
            navigationPending(false);
            if (!r.optBoolean("ok")) {
              enableNavigation(true);
              field.setVisibility(View.VISIBLE);
              return;
            }
            enginePaused = true;
            resuming = false;
            pauseStarted = android.os.SystemClock.uptimeMillis();
            pauseClock = obj(obj(model, "waves"), "snapshot").optLong("gameTime");
            page = "engine";
            if (panel != null) stage.removeView(panel);
            panel = column();
            panel.addView(button("RESUME GAME", () -> resumeEngine(0)));
            stage.addView(panel, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END));
            field.setVisibility(View.GONE);
            enableNavigation(false);
          });
    });
  }

  private void enableNavigation(boolean enabled) {
    enableTree(navigationScroll, enabled);
    moreButton.setEnabled(enabled);
    skip.setEnabled(enabled && skip.isEnabled());
  }

  private void enableTree(View view, boolean enabled) {
    view.setEnabled(enabled);
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) enableTree(group.getChildAt(i), enabled);
    }
  }

  private void resumeEngine(int attempt) {
    if (!enginePaused || resuming) return;
    hideKeyboard();
    resuming = true;
    long clock = obj(obj(model, "waves"), "snapshot").optLong("gameTime");
    request("engine-resume", new JSONObject(), null);
    handler.postDelayed(
        () -> {
          resuming = false;
          if (!enginePaused) return;
          long now = obj(obj(model, "waves"), "snapshot").optLong("gameTime");
          if (now > clock) {
            finishEngineResume();
            return;
          }
          if (attempt < 2) resumeEngine(attempt + 1);
          else notice("Choose Resume in the engine menu to continue.", true);
        },
        2300);
  }

  private void finishEngineResume() {
    enginePaused = false;
    resuming = false;
    enableNavigation(true);
    if (panel != null) stage.removeView(panel);
    panel = null;
    page = "";
    status = null;
    field.setVisibility(View.VISIBLE);
    resumeInput();
    renderModel();
  }

  void open(String target) {
    if (!ready) return;
    hideKeyboard();
    int revision = ++navigation;
    navigationPending(true);
    if (panel != null) enableTree(panel, false);
    request(
        target.equals("research") ? "research-open" : "open",
        json("page", target),
        r -> {
          if (revision != navigation) return;
          navigationPending(false);
          if (!r.optBoolean("ok")) {
            if (panel != null) enableTree(panel, true);
            if (page.isEmpty()) field.setVisibility(View.VISIBLE);
            return;
          }
          showPage(target);
        });
  }

  private void showPage(String target) {
    boolean compactPage = target.equals("research") || target.equals("factory");
    if (target.equals("research")) researchCatalogue.clear();
    search = searches.getOrDefault(target, "");
    buildWasOpen = target.equals("build") && commands.optBoolean("buildOpen");
    page = target;
    detailSignature = "";
    labSignature = "";
    factorySignature = "";
    field.setVisibility(View.GONE);
    map.setVisibility(View.GONE);
    if (panel != null) stage.removeView(panel);
    panel = column();
    panel.setBackgroundColor(BG);
    panel.setClickable(true);
    panel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    panel.setPadding(compactPage ? 0 : dp(8), 0, compactPage ? 0 : dp(8), 0);
    panel.setFocusableInTouchMode(true);
    LinearLayout heading = row();
    title =
        text(
            target.equals("research")
                ? "RESEARCH"
                : target.equals("saved")
                    ? "BLUEPRINT LIBRARY"
                    : target.equals("queue") ? "ALL ORDERS" : target.toUpperCase(),
            16,
            true);
    heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    Button back = button("BATTLE", () -> backToBattle(null));
    back.setContentDescription("BACK TO BATTLE");
    if (!compactPage) {
      heading.addView(back);
      panel.addView(heading, new LinearLayout.LayoutParams(-1, hit()));
    }
    status = text("", 12, false);
    status.setTextColor(ACCENT);
    status.setSingleLine(true);
    status.setEllipsize(android.text.TextUtils.TruncateAt.END);
    status.setVisibility(View.GONE);
    panel.addView(status);
    controls = row();
    if (compactPage) controls.setPadding(dp(8), 0, dp(8), 0);
    panel.addView(controls, new LinearLayout.LayoutParams(-1, compactPage ? hit() : -2));
    if (compactPage) {
      View divider = new View(activity);
      divider.setBackgroundColor(LINE);
      panel.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
    }
    body = row();
    body.setGravity(Gravity.TOP);
    panel.addView(body, new LinearLayout.LayoutParams(-1, 0, 1));
    FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, -1);
    if (target.equals("build")) {
      p = new FrameLayout.LayoutParams(buildPaneWidth(), -1, Gravity.TOP | Gravity.START);
      title.setTextSize(16 * controlScale);
      heading.removeAllViews();
      heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
      heading.addView(button("EXIT", () -> backToBattle(null)));
      controls.setOrientation(LinearLayout.VERTICAL);
      body.setOrientation(LinearLayout.VERTICAL);
    }
    stage.addView(panel, p);
    rows = new Rows();
    list = new StableList(activity);
    list.setDivider(new android.graphics.drawable.ColorDrawable(LINE));
    list.setDividerHeight(dp(1));
    list.setAdapter(rows);
    list.setCacheColorHint(Color.TRANSPARENT);
    body.addView(list, new LinearLayout.LayoutParams(0, -1, 2));
    if (compactPage) {
      View divider = new View(activity);
      divider.setBackgroundColor(LINE);
      body.addView(divider, new LinearLayout.LayoutParams(dp(1), -1));
    }
    detail = column();
    detail.setPadding(dp(12), 0, dp(12), 0);
    body.addView(detail, new LinearLayout.LayoutParams(0, -1, 1));
    queueRows = null;
    queueList = null;
    labSpinner = null;
    factorySpinner = null;
    designName = null;
    saveButton = null;
    saveNewButton = null;
    validationLabel = null;
    switch (target) {
      case "research":
        researchPage();
        break;
      case "factory":
        factoryPage();
        break;
      case "design":
        designPage();
        break;
      case "saved":
        libraryPage();
        break;
      case "queue":
        queuePage();
        break;
      case "build":
        buildPage();
        break;
      default:
        helpPage();
    }
    if (compactPage)
      controls.addView(
          back,
          new LinearLayout.LayoutParams(
              Math.max(
                  dp(66),
                  (int) Math.ceil(back.getPaint().measureText(back.getText().toString()))
                      + back.getPaddingLeft()
                      + back.getPaddingRight()),
              hit()));
    renderModel();
  }

  private void backToBattle(Runnable after) {
    if (closing) return;
    hideKeyboard();
    int revision = ++navigation;
    closing = true;
    navigationPending(true);
    if (panel != null) enableTree(panel, false);
    request(
        "close",
        new JSONObject(),
        r -> {
          closing = false;
          if (revision != navigation) return;
          navigationPending(false);
          if (!r.optBoolean("ok")) {
            if (panel != null) enableTree(panel, true);
            return;
          }
          page = "";
          if (panel != null) {
            stage.removeView(panel);
            panel = null;
          }
          status = null;
          field.setVisibility(ready ? View.VISIBLE : View.GONE);
          renderField();
          resumeInput();
          if (after != null) after.run();
        });
  }

  boolean back() {
    if (!ready) return false;
    if (pauseTransition) return true;
    if (enginePaused) {
      resumeEngine(0);
      return true;
    }
    if (navigationPending
        || !page.isEmpty()
        || commands.optBoolean("buildOpen")
        || !commands.optString("nativeMenu").isEmpty()) {
      backToBattle(null);
      return true;
    }
    return false;
  }

  private void searchBox(LinearLayout parent, String hint, Consumer<String> changed) {
    EditText e = input(hint);
    parent.addView(e, new LinearLayout.LayoutParams(0, hit(), 1));
    e.setText(search);
    watch(
        e,
        s -> {
          search = s;
          searches.put(page, s);
          changed.accept(s);
        });
  }

  private void categories(LinearLayout parent, String[] values, Consumer<String> changed) {
    Spinner s = spinner(parent, 112);
    List<String> labels = Arrays.asList(values);
    options(
        s,
        labels,
        Math.max(0, labels.indexOf(category)),
        i -> {
          category = labels.get(i);
          changed.accept(category);
        });
  }

  private void researchPage() {
    labSpinner = spinner(controls, 150);
    labSpinner.setContentDescription("Choose laboratory");
    categories(
        controls,
        new String[] {"ALL", "WEAPONS", "DEFENCE", "VEHICLES", "CYBORG", "SYSTEMS", "STRUCTURES"},
        s -> renderResearch());
    searchBox(controls, "Search technology", s -> renderResearch());
    LinearLayout summary = column();
    summary.setMinimumHeight(dp(80));
    summary.setGravity(Gravity.CENTER_VERTICAL);
    summary.setPadding(0, dp(6), 0, dp(6));
    summaryCaption = text("", 10, true);
    summaryCaption.setTextColor(MUTED);
    summaryCaption.setSingleLine(true);
    summary.addView(
        summaryCaption, new LinearLayout.LayoutParams(-1, textHeight(summaryCaption, 1, 14)));
    liveDetail = text("", 14, true);
    liveDetail.setMaxLines(2);
    liveDetail.setEllipsize(android.text.TextUtils.TruncateAt.END);
    summary.addView(liveDetail, new LinearLayout.LayoutParams(-1, textHeight(liveDetail, 2, 25)));
    researchTiming = text("", 11, false);
    researchTiming.setTextColor(MUTED);
    researchTiming.setSingleLine(true);
    researchTiming.setEllipsize(android.text.TextUtils.TruncateAt.END);
    labProgress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
    labProgress.setMax(1000);
    labProgress.setProgressTintList(ColorStateList.valueOf(CYAN));
    labProgress.setProgressBackgroundTintList(ColorStateList.valueOf(LINE));
    summary.addView(labProgress, new LinearLayout.LayoutParams(-1, dp(5)));
    summary.addView(
        researchTiming, new LinearLayout.LayoutParams(-1, textHeight(researchTiming, 1, 18)));
    researchRetry =
        button("RETRY QUEUE SYNC", () -> request("research-retry", new JSONObject(), null));
    summary.addView(researchRetry);
    attachQueue(summary);
  }

  private void attachQueue(LinearLayout summary) {
    detail.removeAllViews();
    queueRows = new Rows();
    queueList = new StableList(activity);
    queueList.setDivider(new android.graphics.drawable.ColorDrawable(LINE));
    queueList.setDividerHeight(dp(1));
    queueList.addHeaderView(summary, null, false);
    queueList.setAdapter(queueRows);
    detail.addView(queueList, new LinearLayout.LayoutParams(-1, -1));
  }

  private void renderResearch() {
    JSONArray labs = arr(research, "labs");
    List<JSONObject> values = objects(labs);
    values.sort(Comparator.comparingLong(l -> l.optLong("id")));
    if (values.stream().noneMatch(l -> l.optLong("id") == selectedLab))
      selectedLab = values.isEmpty() ? 0 : values.get(0).optLong("id");
    String signature =
        values.stream()
            .map(l -> l.optLong("id") + ":" + l.optString("topicId") + ":" + l.optBoolean("idle"))
            .reduce("", (a, b) -> a + "|" + b);
    if (!signature.equals(labSignature)) {
      labSignature = signature;
      List<String> labels = new ArrayList<>();
      int selected = 0;
      for (int i = 0; i < values.size(); i++) {
        JSONObject lab = values.get(i);
        if (lab.optLong("id") == selectedLab) selected = i;
        labels.add(
            "Lab "
                + (i + 1)
                + " · "
                + (lab.optBoolean("idle") ? "Idle" : lab.optString("topicName")));
      }
      if (labels.isEmpty()) labels.add("No completed laboratories");
      List<String> keys = new ArrayList<>();
      for (JSONObject lab : values) keys.add("lab:" + lab.optLong("id"));
      if (keys.isEmpty()) keys.add("none");
      options(
          labSpinner,
          labels,
          keys,
          selected,
          i -> {
            if (i < values.size()) {
              selectedLab = values.get(i).optLong("id");
              renderResearch();
            }
          });
    }
    JSONObject lab = find(labs, selectedLab);
    int number = 1;
    for (int i = 0; i < values.size(); i++)
      if (values.get(i).optLong("id") == selectedLab) number = i + 1;
    summaryCaption.setText(
        "LAB " + number + (lab.optBoolean("idle") ? " · IDLE" : " · RESEARCHING"));
    String progress =
        lab.optBoolean("waitingPower")
            ? "Waiting for power"
            : lab.isNull("estimatedProgress") || lab.isNull("remainingSeconds")
                ? "Researching"
                : "~"
                    + Math.round(lab.optDouble("estimatedProgress") * 100)
                    + "% · ~"
                    + time(lab.optDouble("remainingSeconds"))
                    + " remaining";
    liveDetail.setText(
        selectedLab == 0
            ? "No laboratory"
            : lab.optBoolean("idle") ? "No active research" : lab.optString("topicName"));
    liveDetail.setContentDescription(liveDetail.getText());
    researchTiming.setText(
        selectedLab == 0
            ? "Complete a laboratory to research"
            : lab.optBoolean("idle") ? "Choose a technology" : progress);
    researchRetry.setVisibility(research.optBoolean("syncBlocked") ? View.VISIBLE : View.GONE);
    labProgress.setProgress((int) (lab.optDouble("estimatedProgress") * 1000));
    labProgress.setVisibility(lab.optBoolean("idle") ? View.INVISIBLE : View.VISIBLE);
    List<Row> waiting = new ArrayList<>();
    for (JSONObject q : objects(arr(research, "queueItems")))
      if (q.optLong("labId") == selectedLab)
        for (JSONObject topic : objects(arr(q, "topics"))) {
          long labId = selectedLab;
          String id = topic.optString("id");
          waiting.add(
              new Row(
                  "rq:" + id,
                  topic.optString("name"),
                  "Next in Lab " + number,
                  "REMOVE",
                  () -> request("research-remove", json("labId", labId, "topicId", id), null),
                  true));
        }
    if (waiting.isEmpty())
      waiting.add(new Row("caption:empty", "No waiting topics", "", "", null, false));
    if (values.size() > 1) waiting.add(new Row("caption:labs", "OTHER LABS", "", "", null, false));
    for (int i = 0; i < values.size(); i++) {
      JSONObject other = values.get(i);
      long id = other.optLong("id");
      if (id == selectedLab) continue;
      String state = other.optBoolean("idle") ? "Idle" : other.optString("topicName");
      int progressValue =
          other.optBoolean("idle") || other.isNull("estimatedProgress")
              ? -1
              : (int) Math.round(other.optDouble("estimatedProgress") * 1000);
      waiting.add(
          new Row(
              "lab:" + id,
              "Lab " + (i + 1) + " · " + state,
              "",
              "SELECT Lab " + (i + 1),
              () -> {
                selectedLab = id;
                labSignature = "";
                renderResearch();
              },
              true,
              progressValue));
    }
    queueRows.set(waiting, "No waiting topics.");
    List<Row> topics = new ArrayList<>();
    String query = search.toLowerCase(Locale.ROOT);
    Set<String> availableTopics = new HashSet<>();
    for (JSONObject topic : objects(arr(research, "catalog"))) {
      String id = topic.optString("id");
      availableTopics.add(id);
      researchCatalogue.put(id, topic);
    }
    // Keep identities and order for this visit. Starting/completing research
    // must not move the next topic into a rapid second tap. New unlocks append;
    // opening the page again refreshes the available catalogue.
    for (JSONObject topic : researchCatalogue.values()) {
      if (!category.equals("ALL") && !category.equals(topic.optString("category"))) continue;
      if (!topic.optString("name").toLowerCase(Locale.ROOT).contains(query)) continue;
      String id = topic.optString("id");
      boolean used = topic.optBoolean("started") || topic.optBoolean("done");
      String owner = "";
      int otherLabNumber = 0;
      for (int i = 0; i < values.size(); i++) {
        JSONObject l = values.get(i);
        if (id.equals(l.optString("topicId")) && !l.optBoolean("idle")) {
          owner = "Researching";
          if (l.optLong("id") != selectedLab) otherLabNumber = i + 1;
        }
      }
      for (JSONObject q : objects(arr(research, "queueItems")))
        for (JSONObject t : objects(arr(q, "topics")))
          if (id.equals(t.optString("id"))) owner = "Queued";
      long labId = selectedLab;
      boolean available = availableTopics.contains(id);
      String action =
          owner.equals("Researching")
              ? "ACTIVE"
              : owner.equals("Queued") ? "QUEUED" : available && !used ? "ADD" : "\u2014";
      topics.add(
          new Row(
              "tech:" + id,
              topic.optString("name"),
              topic.optInt("power") + " power · " + compactLabel(topic.optString("category")),
              action,
              () -> {
                selectedTopic = id;
                request("research-add", json("labId", labId, "topicId", id), null);
              },
              available && !used && owner.isEmpty() && labId != 0,
              owner.equals("Researching") && otherLabNumber > 0 ? "Lab " + otherLabNumber : ""));
    }
    rows.set(topics, "No available technologies match this category.");
    status.setText(research.optString("error"));
    status.setVisibility(research.optString("error").isEmpty() ? View.GONE : View.VISIBLE);
  }

  private void factoryPage() {
    factorySpinner = spinner(controls, 138);
    factorySpinner.setContentDescription("Choose factory");
    Button less = button("−", () -> changeQuantity(-1));
    less.setContentDescription("Decrease production quantity");
    controls.addView(less, new LinearLayout.LayoutParams(hit(), hit()));
    quantityButton = button("Qty " + quantity, this::chooseQuantity);
    quantityButton.setContentDescription("Production quantity");
    quantityButton.setPadding(dp(4), 0, dp(4), 0);
    controls.addView(
        quantityButton,
        new LinearLayout.LayoutParams(
            Math.max(
                dp(56), (int) Math.ceil(quantityButton.getPaint().measureText("Qty 20")) + dp(8)),
            hit()));
    Button more = button("+", () -> changeQuantity(1));
    more.setContentDescription("Increase production quantity");
    controls.addView(more, new LinearLayout.LayoutParams(hit(), hit()));
    searchBox(controls, "Search designs", s -> renderFactory());
    LinearLayout summary = column();
    summary.setMinimumHeight(dp(80));
    summary.setGravity(Gravity.CENTER_VERTICAL);
    summary.setPadding(0, dp(6), 0, dp(6));
    summaryCaption = text("", 10, true);
    summaryCaption.setTextColor(MUTED);
    summaryCaption.setSingleLine(true);
    summary.addView(
        summaryCaption, new LinearLayout.LayoutParams(-1, textHeight(summaryCaption, 1, 14)));
    liveDetail = text("", 14, true);
    liveDetail.setMaxLines(2);
    liveDetail.setEllipsize(android.text.TextUtils.TruncateAt.END);
    summary.addView(liveDetail, new LinearLayout.LayoutParams(-1, textHeight(liveDetail, 2, 25)));
    factoryProgress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
    factoryProgress.setIndeterminateTintList(ColorStateList.valueOf(CYAN));
    factoryProgress.setIndeterminate(true);
    summary.addView(factoryProgress, new LinearLayout.LayoutParams(-1, dp(5)));
    factoryTiming = text("", 11, false);
    factoryTiming.setTextColor(MUTED);
    factoryTiming.setSingleLine(true);
    factoryTiming.setEllipsize(android.text.TextUtils.TruncateAt.END);
    summary.addView(
        factoryTiming, new LinearLayout.LayoutParams(-1, textHeight(factoryTiming, 1, 18)));
    factoryRetry =
        button("RETRY QUEUE", () -> request("retry-production", json("factoryId", factory), null));
    factoryRetry.setContentDescription("RETRY BLOCKED QUEUE");
    summary.addView(factoryRetry);
    attachQueue(summary);
  }

  private void changeQuantity(int delta) {
    quantity = Math.max(1, Math.min(20, quantity + delta));
    quantityButton.setText("Qty " + quantity);
  }

  private void chooseQuantity() {
    int[] values = {1, 5, 10, 20};
    showDialog(
        new AlertDialog.Builder(activity)
            .setTitle("Production quantity")
            .setItems(
                new String[] {"1 unit", "5 units", "10 units", "20 units"},
                (dialog, index) -> {
                  quantity = values[index];
                  quantityButton.setText("Qty " + quantity);
                })
            .setNegativeButton("Cancel", null)
            .create());
  }

  private boolean available(JSONObject design) {
    Set<String> live = new HashSet<>();
    JSONArray ids = arr(snapshot, "parts");
    for (int i = 0; i < ids.length(); i++) live.add(ids.optString(i));
    if (!live.contains(design.optString("body")) || !live.contains(design.optString("propulsion")))
      return false;
    for (int i = 0; i < arr(design, "turrets").length(); i++)
      if (!live.contains(arr(design, "turrets").optString(i))) return false;
    return true;
  }

  private boolean fits(JSONObject design, JSONObject f) {
    String body = design.optString("body"),
        prop = design.optString("propulsion"),
        kind = f.optString("kind").toLowerCase(Locale.ROOT);
    boolean cyborg = (body + prop).toLowerCase(Locale.ROOT).contains("cyborg"),
        flying =
            prop.toLowerCase(Locale.ROOT).contains("vtol")
                || "Lift"
                    .equals(parts.getOrDefault(prop, new JSONObject()).optString("propulsionType"));
    if (cyborg) return kind.contains("cyborg");
    if (kind.contains("cyborg") || flying != kind.contains("vtol")) return false;
    int size =
        Arrays.asList("LIGHT", "MEDIUM", "HEAVY", "SUPER HEAVY")
            .indexOf(parts.getOrDefault(body, new JSONObject()).optString("size"));
    return kind.contains("vtol") || size < 0 || size <= f.optInt("modules");
  }

  private String templateKey(JSONObject design) {
    JSONArray turrets = design.optJSONArray("turrets");
    if (turrets == null) {
      turrets = new JSONArray();
      for (int i = 0; i < arr(design, "weapons").length(); i++)
        turrets.put(arr(design, "weapons").optString(i));
      for (String k : new String[] {"construct", "sensor", "repair", "brain", "ecm"}) {
        String v = design.optString(k);
        if (parts.containsKey(v) && !v.startsWith("ZNULL")) turrets.put(v);
      }
    }
    return new JSONArray()
        .put(design.optString("body"))
        .put(design.optString("propulsion"))
        .put(turrets)
        .toString();
  }

  private void renderFactory() {
    List<JSONObject> factories = objects(arr(snapshot, "factories"));
    if (factories.stream().noneMatch(f -> f.optLong("id") == factory))
      factory = factories.isEmpty() ? 0 : factories.get(0).optLong("id");
    String signature =
        factories.stream()
            .map(f -> f.optLong("id") + ":" + f.optBoolean("ready") + ":" + f.optInt("modules"))
            .reduce("", (a, b) -> a + "|" + b);
    if (!signature.equals(factorySignature)) {
      factorySignature = signature;
      List<String> labels = new ArrayList<>();
      int selected = 0;
      for (int i = 0; i < factories.size(); i++) {
        JSONObject f = factories.get(i);
        if (f.optLong("id") == factory) selected = i;
        labels.add(
            f.optString("kind")
                + " "
                + f.optInt("number")
                + " · "
                + f.optInt("modules")
                + " modules");
      }
      if (labels.isEmpty()) labels.add("No completed factories");
      List<String> keys = new ArrayList<>();
      for (JSONObject f : factories) keys.add("factory:" + f.optLong("id"));
      if (keys.isEmpty()) keys.add("none");
      options(
          factorySpinner,
          labels,
          keys,
          selected,
          i -> {
            if (i < factories.size()) {
              factory = factories.get(i).optLong("id");
              renderFactory();
            }
          });
    }
    JSONObject f = find(arr(snapshot, "factories"), factory),
        active = obj(f, "active"),
        waiting = obj(f, "waitingReason");
    String current =
        active.has("design")
            ? "Producing " + obj(active, "design").optString("name")
            : f.optBoolean("idle") ? "Idle" : "Production active";
    if (waiting.has("kind"))
      current =
          "Waiting: "
              + waiting.optString("kind")
              + " limit "
              + waiting.optInt("current")
              + " / "
              + waiting.optInt("limit");
    summaryCaption.setText(
        f.optString("kind", "Factory").replace(" factory", "").toUpperCase(Locale.ROOT)
            + " "
            + f.optInt("number", 1)
            + (active.has("design") ? " · PRODUCING" : " · IDLE"));
    liveDetail.setText(
        !f.has("id")
            ? "No completed factory"
            : active.has("design") && !waiting.has("kind")
                ? obj(active, "design").optString("name")
                : current);
    liveDetail.setContentDescription(current);
    factoryProgress.setVisibility(
        active.has("design") && !waiting.has("kind") ? View.VISIBLE : View.INVISIBLE);
    // The adapter exposes the accepted job and start clock, not actual build-point progress.
    // Show real elapsed simulation time instead of copying a mock percentage into gameplay.
    factoryTiming.setText(
        active.has("design")
            ? time(Math.max(0, snapshot.optDouble("gameTime") - active.optDouble("started")) / 1000)
                + " elapsed · "
                + arr(f, "queue").length()
                + " waiting"
            : f.has("id") ? "Choose a design" : "Complete a factory to produce units");
    factoryRetry.setVisibility(
        arr(f, "queue").optJSONObject(0) != null
                && "blocked".equals(arr(f, "queue").optJSONObject(0).optString("status"))
            ? View.VISIBLE
            : View.GONE);
    List<Row> queue = new ArrayList<>();
    long factoryId = factory;
    List<JSONObject> waitingJobs = objects(arr(f, "queue"));
    for (int i = 0; i < waitingJobs.size(); ) {
      JSONObject job = waitingJobs.get(i);
      String jobId = job.optString("id"), batch = productionBatch(jobId);
      JSONArray ids = new JSONArray();
      while (i < waitingJobs.size()
          && productionBatch(waitingJobs.get(i).optString("id")).equals(batch))
        ids.put(waitingJobs.get(i++).optString("id"));
      queue.add(
          new Row(
              "pq:" + jobId,
              ids.length() + " × " + obj(job, "design").optString("name"),
              job.optString("status") + (job.has("reason") ? " · " + job.optString("reason") : ""),
              "REMOVE",
              () -> request("remove-production", json("factoryId", factoryId, "jobIds", ids), null),
              true));
    }
    if (queue.isEmpty())
      queue.add(new Row("caption:empty", "No waiting units", "", "", null, false));
    else
      queue.add(
          new Row(
              "utility:clear-production",
              "Clear waiting",
              "",
              "CLEAR WAITING QUEUE",
              () ->
                  confirm(
                      "Clear waiting production?",
                      "The active unit continues.",
                      () -> request("clear-production", json("factoryId", factoryId), null)),
              true));
    for (JSONObject other : factories) {
      long id = other.optLong("id");
      if (id == factoryId) continue;
      JSONObject job = obj(other, "active");
      String state = job.has("design") ? obj(job, "design").optString("name") : "Idle";
      String name = other.optString("kind") + " " + other.optInt("number");
      queue.add(
          new Row(
              "factory-status:" + id,
              name + " · " + state,
              "",
              "SELECT " + name,
              () -> {
                factory = id;
                factorySignature = "";
                renderFactory();
              },
              true));
    }
    queueRows.set(queue, "No waiting units.");
    List<Row> designs = new ArrayList<>();
    JSONArray templates = arr(snapshot, "templates"), allowed = arr(f, "templates");
    Set<String> ids = new HashSet<>();
    for (int i = 0; i < allowed.length(); i++) ids.add(allowed.optString(i));
    for (JSONObject design : objects(templates)) {
      String id = design.optString("id");
      if (f.has("templates") && !ids.contains(id)) continue;
      if (id.startsWith("native:")
          && objects(saved).stream().anyMatch(d -> templateKey(d).equals(templateKey(design))))
        continue;
      if (!design
          .optString("name")
          .toLowerCase(Locale.ROOT)
          .contains(search.toLowerCase(Locale.ROOT))) continue;
      designs.add(
          new Row(
              "template:" + id,
              design.optString("fullname", design.optString("name")),
              design.optInt("cost") + " power · " + designParts(design),
              "PRODUCE",
              () -> produce(design, true),
              f.optBoolean("ready")));
    }
    for (JSONObject design : objects(saved)) {
      if (!design
          .optString("name")
          .toLowerCase(Locale.ROOT)
          .contains(search.toLowerCase(Locale.ROOT))) continue;
      boolean unlocked = available(design), compatible = fits(design, f);
      designs.add(
          new Row(
              "saved:" + design.optString("id"),
              design.optString("name"),
              design.optInt("cost")
                  + " power · "
                  + (!unlocked
                      ? "Research components first"
                      : !compatible ? "Needs a compatible factory" : designParts(design)),
              "PRODUCE",
              () -> produce(design, false),
              unlocked && compatible && f.optBoolean("ready")));
    }
    for (int i = 0; i < designs.size(); i++)
      if (designs.get(i).id.equals("saved:" + preferredDesign)) {
        Row chosen = designs.remove(i);
        designs.add(0, chosen);
        break;
      }
    rows.set(designs, "Create a blueprint in DESIGN, or complete a compatible factory.");
  }

  private String designParts(JSONObject design) {
    JSONObject body = parts.getOrDefault(design.optString("body"), new JSONObject());
    JSONObject propulsion = parts.getOrDefault(design.optString("propulsion"), new JSONObject());
    return body.optString("name", "Custom body")
        + " / "
        + propulsion.optString("name", "Custom propulsion");
  }

  private String productionBatch(String id) {
    int split = id.lastIndexOf('-');
    return split < 0 ? id : id.substring(0, split);
  }

  private void produce(JSONObject design, boolean template) {
    int count = quantity;
    JSONObject data = json("factoryId", factory, "count", count);
    try {
      data.put(template ? "templateId" : "design", template ? design.optString("id") : design);
    } catch (Exception ignored) {
    }
    request(
        "produce",
        data,
        r -> {
          if (r.optBoolean("ok"))
            notice(count + " × " + design.optString("name") + " added to production.", false);
        });
  }

  private void newDraft() {
    int n = 1;
    while (true) {
      boolean exists = false;
      for (JSONObject s : objects(saved))
        if (s.optString("name").equals("Design " + n)) exists = true;
      if (!exists) break;
      n++;
    }
    draft =
        json(
            "id",
            "design-" + UUID.randomUUID(),
            "name",
            "Design " + n,
            "body",
            "",
            "propulsion",
            "",
            "turrets",
            new JSONArray().put(""));
    validation = null;
    draftTouched = false;
  }

  private void designPage() {
    controls.addView(button("BLUEPRINT LIBRARY", () -> open("saved")));
    controls.addView(
        button(
            "NEW DESIGN",
            () -> {
              if (draftTouched)
                confirm(
                    "Discard current edits?",
                    "Saved blueprints remain on this device.",
                    () -> {
                      newDraft();
                      showPage("design");
                    });
              else {
                newDraft();
                showPage("design");
              }
            }));
    designName = input("Design name");
    designName.setFilters(
        new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(80)});
    designName.setText(draft.optString("name"));
    controls.addView(designName, new LinearLayout.LayoutParams(0, -2, 1));
    watch(
        designName,
        s -> {
          try {
            draft.put("name", s);
          } catch (Exception ignored) {
          }
          draftTouched = true;
          validateDesign();
        });
    body.removeAllViews();
    ScrollView scroll = new ScrollView(activity);
    LinearLayout form = column();
    scroll.addView(form);
    body.addView(scroll, new LinearLayout.LayoutParams(0, -1, 1));
    LinearLayout designActions = column();
    designActions.setPadding(dp(20), dp(8), dp(8), dp(8));
    body.addView(designActions, new LinearLayout.LayoutParams(0, -1, .65f));
    LinearLayout saves = row();
    designActions.addView(saves, new LinearLayout.LayoutParams(-1, -2));
    saveButton = button("SAVE", () -> saveDesign(false));
    saveButton.setContentDescription("SAVE BLUEPRINT");
    saveNewButton = button("SAVE NEW", () -> saveDesign(true));
    saveNewButton.setContentDescription("SAVE AS NEW");
    for (Button action : new Button[] {saveButton, saveNewButton}) {
      action.setSingleLine(false);
      action.setMaxLines(2);
      LinearLayout.LayoutParams actionSize = new LinearLayout.LayoutParams(0, -2, 1);
      actionSize.setMargins(dp(2), dp(2), dp(2), dp(2));
      saves.addView(action, actionSize);
    }
    detail = column();
    detail.setPadding(0, dp(8), 0, dp(8));
    ScrollView detailScroll = new ScrollView(activity);
    detailScroll.setFillViewport(true);
    detailScroll.addView(detail);
    designActions.addView(detailScroll, new LinearLayout.LayoutParams(-1, 0, 1));
    partPicker(form, "BODY", "Body", "body", -1);
    partPicker(form, "PROPULSION", "Propulsion", "propulsion", -1);
    int slots =
        Math.max(
            1,
            Math.min(
                3,
                parts.getOrDefault(draft.optString("body"), new JSONObject()).optInt("slots", 1)));
    for (int i = 0; i < slots; i++)
      partPicker(form, "WEAPON / SYSTEM " + (i + 1), "turret", "turrets", i);
    validationLabel = text("Choose compatible researched components.", 15, false);
    detail.addView(validationLabel);
    detail.addView(
        text(
            "Saved on this device between games. Production still needs the components researched"
                + " in the current battle.",
            13,
            false));
    validateDesign();
  }

  private void partPicker(LinearLayout form, String label, String group, String key, int slot) {
    TextView caption = text(label, 12, true);
    caption.setTextColor(ACCENT);
    caption.setPadding(dp(6), dp(14), 0, 0);
    form.addView(caption);
    LinearLayout line = row();
    form.addView(line);
    Spinner selector = spinner(line, 0);
    selector.setContentDescription("Choose " + label.toLowerCase(Locale.ROOT));
    Set<String> available = new HashSet<>();
    JSONArray live = arr(snapshot, "parts");
    for (int i = 0; i < live.length(); i++) available.add(live.optString(i));
    List<String> ids = new ArrayList<>(), labels = new ArrayList<>();
    ids.add("");
    labels.add(slot > 0 ? "Empty slot" : "Choose a component");
    String current = slot < 0 ? draft.optString(key) : arr(draft, key).optString(slot, "");
    for (JSONObject part : parts.values()) {
      String g = part.optString("group");
      if (!(group.equals("turret")
          ? Arrays.asList("Weapon", "Construct", "Repair", "Sensor", "ECM", "Brain").contains(g)
          : group.equals(g))) continue;
      String id = part.optString("id");
      if (available.contains(id)) {
        ids.add(id);
        labels.add(
            part.optString("name")
                + (g.equals("Body") ? " · " + part.optInt("slots") + " slots" : ""));
      }
    }
    if (!current.isEmpty() && !ids.contains(current)) {
      ids.add(current);
      labels.add(name(current) + " · Locked this battle");
    }
    options(
        selector,
        labels,
        Math.max(0, ids.indexOf(current)),
        i -> {
          String selected = ids.get(i);
          String before = slot < 0 ? draft.optString(key) : arr(draft, key).optString(slot, "");
          if (before.equals(selected)) return;
          try {
            if (slot < 0) draft.put(key, selected);
            else {
              JSONArray turrets = arr(draft, key);
              turrets.put(slot, selected);
              draft.put(key, turrets);
            }
            if (key.equals("body")) {
              int count =
                  Math.max(
                      1,
                      Math.min(
                          3, parts.getOrDefault(selected, new JSONObject()).optInt("slots", 1)));
              JSONArray old = arr(draft, "turrets"), next = new JSONArray();
              for (int j = 0; j < count; j++) next.put(old.optString(j, ""));
              draft.put("turrets", next);
            }
          } catch (Exception ignored) {
          }
          draftTouched = true;
          if (key.equals("body")) showPage("design");
          else validateDesign();
        });
  }

  private JSONObject designPayload(boolean asNew) {
    try {
      JSONObject d = new JSONObject(draft.toString());
      JSONArray items = new JSONArray();
      for (int i = 0; i < arr(d, "turrets").length(); i++)
        if (!arr(d, "turrets").optString(i).isEmpty()) items.put(arr(d, "turrets").optString(i));
      d.put("turrets", items);
      if (asNew) d.put("id", "design-" + UUID.randomUUID());
      return d;
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private void validateDesign() {
    int revision = ++validationSerial;
    validation = null;
    if (saveButton != null) saveButton.setEnabled(false);
    if (saveNewButton != null) saveNewButton.setEnabled(false);
    if (validationLabel == null) return;
    JSONObject d = designPayload(false);
    if (d.optString("name").trim().isEmpty()
        || d.optString("body").isEmpty()
        || d.optString("propulsion").isEmpty()
        || arr(d, "turrets").length() == 0) {
      validationLabel.setText("Choose a name, body, propulsion and weapon or system.");
      return;
    }
    validationLabel.setText("Checking this design with Warzone…");
    handler.postDelayed(
        () -> {
          if (revision != validationSerial || !page.equals("design")) return;
          request(
              "validate-design",
              json("design", d),
              r -> {
                if (revision != validationSerial || !page.equals("design")) return;
                JSONObject result = obj(r, "result");
                if (r.optBoolean("ok") && result.optBoolean("ok")) {
                  validation = result;
                  JSONObject stats = obj(result, "result");
                  validationLabel.setText(
                      "READY TO SAVE\n"
                          + stats.optInt("cost")
                          + " power\n"
                          + stats.optInt("points")
                          + " production points");
                  saveButton.setEnabled(!designSaving);
                  saveNewButton.setEnabled(!designSaving);
                } else
                  validationLabel.setText(
                      r.optString("error", "These components are not compatible."));
              });
        },
        240);
  }

  private void saveDesign(boolean asNew) {
    if (validation == null || designSaving) return;
    designSaving = true;
    String sourceId = draft.optString("id");
    JSONObject d = designPayload(asNew);
    saveButton.setEnabled(false);
    saveNewButton.setEnabled(false);
    int revision = validationSerial;
    request(
        "save-design",
        json("design", d),
        r -> {
          designSaving = false;
          if (r.optBoolean("ok")
              && revision == validationSerial
              && sourceId.equals(draft.optString("id"))) {
            draft = obj(r, "result");
            draftTouched = false;
            if (page.equals("design")) open("saved");
          } else if (page.equals("design")) validateDesign();
        });
  }

  private void libraryPage() {
    controls.addView(
        button(
            "NEW DESIGN",
            () -> {
              if (draftTouched)
                confirm(
                    "Discard current edits?",
                    "Your saved designs remain on the device.",
                    () -> {
                      newDraft();
                      open("design");
                    });
              else {
                newDraft();
                open("design");
              }
            }));
    searchBox(controls, "Search saved blueprints", s -> renderLibrary());
    body.removeView(detail);
    detail = null;
  }

  private void renderLibrary() {
    List<Row> entries = new ArrayList<>();
    for (JSONObject design : objects(saved)) {
      if (!design
          .optString("name")
          .toLowerCase(Locale.ROOT)
          .contains(search.toLowerCase(Locale.ROOT))) continue;
      entries.add(
          new Row(
              design.optString("id"),
              design.optString("name"),
              name(design.optString("body"))
                  + " · "
                  + name(design.optString("propulsion"))
                  + (available(design) ? "" : "\nComponents locked in this battle"),
              "OPEN",
              () -> blueprintActions(design),
              true));
    }
    rows.set(entries, "No saved blueprints. Create one in DESIGN.");
  }

  private void blueprintActions(JSONObject design) {
    showDialog(
        new AlertDialog.Builder(activity)
            .setTitle(design.optString("name"))
            .setItems(
                new String[] {"Edit blueprint", "Produce in factory", "Delete from this device"},
                (d, which) -> {
                  if (which == 0) {
                    try {
                      draft = new JSONObject(design.toString());
                      draftTouched = false;
                      open("design");
                    } catch (Exception ignored) {
                    }
                  } else if (which == 1) {
                    preferredDesign = design.optString("id");
                    search = "";
                    searches.put("factory", "");
                    for (JSONObject f : objects(arr(snapshot, "factories")))
                      if (f.optBoolean("ready") && fits(design, f)) {
                        factory = f.optLong("id");
                        break;
                      }
                    open("factory");
                  } else
                    confirm(
                        "Delete " + design.optString("name") + "?",
                        "This removes the saved blueprint from this device.",
                        () -> request("delete-design", json("id", design.optString("id")), null));
                })
            .setNegativeButton("Cancel", null)
            .create());
  }

  private void confirm(String title, String message, Runnable yes) {
    showDialog(
        new AlertDialog.Builder(activity)
            .setTitle(title)
            .setMessage(message)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Confirm", (d, w) -> yes.run())
            .create());
  }

  private void queuePage() {
    controls.addView(button("BUILD", () -> open("build")));
    controls.addView(button("FACTORY", () -> open("factory")));
    detail.addView(
        text(
            "Construction follows actual truck activity. Remaining times are approximate. Green"
                + " blueprints on the battlefield mark native queued sites.",
            14,
            false));
  }

  private void renderQueue() {
    List<Row> entries = new ArrayList<>();
    for (JSONObject f : objects(arr(snapshot, "factories"))) {
      JSONObject active = obj(f, "active");
      if (active.has("design"))
        entries.add(
            new Row(
                "active:" + f.optLong("id"),
                obj(active, "design").optString("name"),
                f.optString("kind") + " " + f.optInt("number") + " · Producing",
                "",
                null,
                false));
      for (JSONObject job : objects(arr(f, "queue")))
        entries.add(
            new Row(
                "production:" + job.optString("id"),
                obj(job, "design").optString("name"),
                f.optString("kind") + " · " + job.optString("status"),
                "",
                null,
                false));
    }
    for (JSONObject site : objects(arr(commands, "construction"))) entries.add(siteRow(site));
    for (JSONObject job : objects(arr(snapshot, "jobs"))) {
      String id = job.optString("id");
      entries.add(
          new Row(
              "job:" + id,
              job.optString("itemId"),
              job.optString("status") + " · " + job.optString("reason"),
              job.optString("status").equals("blocked") ? "RETRY" : "REMOVE",
              () ->
                  request(
                      job.optString("status").equals("blocked") ? "retry-job" : "cancel-job",
                      json("jobId", id),
                      null),
              true));
    }
    rows.set(entries, "No active construction or production.");
  }

  private Row siteRow(JSONObject site) {
    String state = site.optString("status").replace('-', ' ');
    boolean complete = state.equals("done");
    return new Row(
        "site:" + site.optString("id"),
        site.optString("name", "Structure"),
        complete
            ? "Complete"
            : state
                + (site.has("progress")
                    ? " · " + Math.round(site.optDouble("progress") * 100) + "%"
                    : "")
                + (site.has("remaining") && !site.isNull("remaining")
                    ? " · ~" + time(site.optDouble("remaining"))
                    : ""),
        "",
        null,
        false);
  }

  private void buildPage() {
    body.removeAllViews();
    body.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
    detail = column();
    body.addView(detail, new LinearLayout.LayoutParams(-1, -2));
    liveDetail = text("", 12, false);
    liveDetail.setMaxLines(4);
    detail.addView(liveDetail);
    if (stage.getHeight() < dp(440)) liveDetail.setVisibility(View.GONE);
    LinearLayout actions = row();
    detail.addView(actions);
    actions.addView(button("ORDERS", () -> open("queue")));
    actions.addView(button("SHOW MAP", () -> request("map", new JSONObject(), r -> resumeInput())));
    Spinner s = spinner(controls, 0);
    List<String> cats = Arrays.asList("DEFENCES", "STRUCTURES", "MODULES", "ALL");
    options(
        s,
        cats,
        Math.max(0, cats.indexOf(buildCategory)),
        i -> {
          buildCategory = cats.get(i);
          renderBuild();
        });
  }

  private void renderBuild() {
    boolean busy = commands.optBoolean("busy");
    String active = commands.optBoolean("nativeToolReady") ? commands.optString("nativeItem") : "";
    List<Row> entries = new ArrayList<>();
    for (JSONObject b : objects(arr(commands, "buildings"))) {
      if (!buildCategory.equals("ALL") && !buildCategory.equals(b.optString("category"))) continue;
      String id = b.optString("id");
      entries.add(
          new Row(
              "build:" + id,
              b.optString("name"),
              b.optInt("power") + " power · " + b.optInt("width") + "×" + b.optInt("breadth"),
              commands.optString("pendingItem").equals(id)
                  ? "WAIT…"
                  : active.equals(id) ? "RESELECT" : "BUILD",
              () -> request("build", json("itemId", id), r -> resumeInput()),
              !busy));
    }
    rows.set(entries, "No available structures in this category.");
    StringBuilder live =
        new StringBuilder(
            busy
                ? "Preparing the build tool…"
                : "Tap clear terrain to queue.\nAccepted orders continue after EXIT.");
    int shown = 0;
    for (JSONObject site : objects(arr(commands, "construction")))
      if (!site.optString("status").equals("done") && shown++ < 2)
        live.append("\n\n")
            .append(site.optString("name"))
            .append(" · ")
            .append(site.optString("status"));
    liveDetail.setText(live.toString());
    status.setText(commands.optString("notice"));
  }

  private void helpPage() {
    body.removeAllViews();
    ScrollView scroll = new ScrollView(activity);
    LinearLayout content = column();
    content.setPadding(dp(12), dp(8), dp(12), dp(24));
    scroll.addView(content);
    body.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
    interfaceSizeControls(content);
    content.addView(text("TOWERS", 20, true));
    content.addView(
        text(
            "Research manually, design units, build defences and survive the supplied enemy rounds."
                + " The preparation timer and Skip Wave button follow the map’s actual wave rules."
                + " Surviving enemies remain when calling another wave.",
            16,
            false));
    content.addView(text("BATTLEFIELD CONTROLS", 16, true));
    content.addView(
        text(
            "Tap to select or give a contextual order. Double tap selects matching nearby units."
                + " Drag to move the camera. Pinch to zoom; two fingers moving vertically tilt the"
                + " view. Drag the radar to move the camera. BOX arms rectangle selection. QUEUE"
                + " keeps subsequent movement orders. STOP cancels selected units’ orders. TRUCKS"
                + " selects the nearby connected truck group; ALL TRUCKS spans the map.",
            15,
            false));
    content.addView(text("CONSTRUCTION", 16, true));
    content.addView(
        text(
            "Choose BUILD, then a structure, then tap open, level terrain. Accepted sites appear as"
                + " green blueprints and are built in order. Changing a structure keeps accepted"
                + " sites. EXIT returns to normal selection and keeps orders. Modules require a"
                + " completed matching building. Nearby trucks on disconnected platforms cannot"
                + " cross cliffs.",
            15,
            false));
    content.addView(text("ANDROID AND ENGINE", 16, true));
    content.addView(
        text(
            "These app controls and pages use Android views. Warzone still renders the battlefield,"
                + " radar, blueprints, messages and its original pause/save/load, statistics and"
                + " commander menus inside WebView. Those engine menus are not Android-native.",
            15,
            false));
    content.addView(button("ENGINE COMMANDERS", () -> engineMenu("commanders")));
    content.addView(button("ENGINE PAUSE / SAVE / LOAD", this::pauseGame));
  }

  private void interfaceSizeControls(LinearLayout content) {
    content.addView(text("INTERFACE SIZE", 16, true));
    LinearLayout sizes = row();
    HorizontalScrollView sizeScroll = new HorizontalScrollView(activity);
    sizeScroll.addView(sizes);
    content.addView(sizeScroll);
    for (float size : new float[] {1f, 1.2f, 1.4f})
      sizes.addView(
          button(
              size == 1 ? "Standard" : size == 1.2f ? "Large" : "Extra large",
              () -> {
                controlScale = size;
                activity
                    .getPreferences(Context.MODE_PRIVATE)
                    .edit()
                    .putFloat("native_controls", size)
                    .apply();
                configurationChanged();
              }));
  }

  private void renderModel() {
    if (!ready) return;
    JSONObject wave = obj(obj(model, "waves"), "snapshot");
    String phase = wave.optString("phase");
    String label;
    if (enginePaused) {
      // A loaded save can rewind simulation time. Observe progress from that new clock.
      if (android.os.SystemClock.uptimeMillis() - pauseStarted < 1800
          || wave.optLong("gameTime") < pauseClock) pauseClock = wave.optLong("gameTime");
      else if (wave.optLong("gameTime") > pauseClock) {
        finishEngineResume();
        return;
      }
    }
    if (phase.equals("countdown"))
      label =
          "Wave "
              + wave.optInt("nextWave")
              + " / "
              + wave.optInt("totalRounds", 30)
              + "\nNext in "
              + time(wave.optDouble("nextWaveIn"));
    else if (phase.equals("active"))
      label =
          "Wave "
              + wave.optInt("wave")
              + " / "
              + wave.optInt("totalRounds", 30)
              + "\n"
              + wave.optInt("enemyDroids")
              + " enemies";
    else label = phase.isEmpty() ? "Preparing battlefield" : phase.toUpperCase(Locale.ROOT);
    headerWaveText = label;
    compactWaveText =
        phase.equals("countdown")
            ? "W"
                + wave.optInt("nextWave")
                + "/"
                + wave.optInt("totalRounds", 30)
                + " · "
                + time(wave.optDouble("nextWaveIn"))
            : phase.equals("active")
                ? "W"
                    + wave.optInt("wave")
                    + "/"
                    + wave.optInt("totalRounds", 30)
                    + " · "
                    + wave.optInt("enemyDroids")
                    + " enemies"
                : label.replace('\n', ' ');
    powerLabel.setText(String.format(Locale.ROOT, "%,d power", (int) snapshot.optDouble("power")));
    layoutHeader();
    skip.setEnabled(
        !enginePaused
            && !pauseTransition
            && obj(model, "waves").optString("pendingCommand").isEmpty()
            && wave.optBoolean("canSkip", true)
            && (phase.equals("countdown") || phase.equals("active")));
    renderField();
    map.setVisibility(
        !navigationPending && page.isEmpty() && commands.optBoolean("nativeHudHidden")
            ? View.VISIBLE
            : View.GONE);
    if (panel == null) return;
    if (page.equals("build")) {
      if (commands.optBoolean("buildOpen")) buildWasOpen = true;
      else if (buildWasOpen && !commands.optBoolean("busy") && !closing) {
        stage.removeView(panel);
        panel = null;
        page = "";
        status = null;
        field.setVisibility(View.VISIBLE);
        resumeInput();
        return;
      }
    }
    switch (page) {
      case "research":
        renderResearch();
        break;
      case "factory":
        renderFactory();
        break;
      case "saved":
        renderLibrary();
        break;
      case "queue":
        renderQueue();
        break;
      case "build":
        renderBuild();
        break;
    }
  }

  private void renderField() {
    JSONArray selected = arr(snapshot, "selectedUnits");
    boolean trucks =
        selected.length() > 0
            && objects(selected).stream().allMatch(u -> u.optBoolean("constructor"));
    selectionLabel.setText(selected.length() + (trucks ? " trucks selected" : " units selected"));
    units.setText(fieldExpanded ? "Close" : "Orders");
    units.setContentDescription("UNIT CONTROLS");
    if (!fieldExpanded) {
      if (field.getChildCount() > 1) field.removeViews(1, field.getChildCount() - 1);
      return;
    }
    // Field controls are rebuilt only when explicitly expanded, not on clock ticks.
    if (field.getChildCount() == 1) {
      LinearLayout one = row();
      field.addView(one);
      one.addView(
          button(
              "SELECT",
              () -> {
                fieldExpanded = false;
                backToBattle(null);
              }));
      one.addView(button("COMBAT", () -> control("toggleCombatLock")));
      one.addView(button("PATROL", () -> control("toggleAutoFight")));
      one.addView(button("BOX", () -> control("toggleBoxMode")));
      LinearLayout two = row();
      field.addView(two);
      two.addView(button("QUEUE", () -> control("toggleQueueMode")));
      two.addView(button("STOP", () -> control("stopSelected")));
      two.addView(
          button(
              "TRUCKS",
              () -> {
                fieldExpanded = false;
                backToBattle(() -> {
                  int revision = navigation;
                  request(
                      "nearby-trucks",
                      new JSONObject(),
                      r -> {
                        if (revision == navigation && page.isEmpty()) resumeInput();
                      });
                });
              }));
      two.addView(button("ALL TRUCKS", () -> control("selectAllTrucks")));
    }
    JSONObject touch = obj(model, "touch");
    for (int i = 1; i < field.getChildCount(); i++) {
      LinearLayout row = (LinearLayout) field.getChildAt(i);
      for (int j = 0; j < row.getChildCount(); j++) {
        Button b = (Button) row.getChildAt(j);
        String label = b.getText().toString();
        boolean on =
            label.equals("COMBAT") && touch.optBoolean("combatLock")
                || label.equals("PATROL") && touch.optBoolean("autoFight")
                || label.equals("BOX") && touch.optBoolean("boxMode")
                || label.equals("QUEUE") && touch.optBoolean("queueMode");
        b.setTextColor(on ? ACCENT : TEXT);
        b.setSelected(on);
        b.setEnabled(!touch.optBoolean("stopPending"));
      }
    }
  }

  void freeze(int id, boolean show) {
    if (destroyed) return;
    if (!show) {
      frozen.setVisibility(View.GONE);
      frozen.setImageDrawable(null);
      return;
    }
    if (stage.getWidth() == 0 || stage.getHeight() == 0) {
      freezeAck(id, false);
      return;
    }
    // PixelCopy captures the actual hardware-composited WebGL frame into a native ImageView.
    int[] position = new int[2];
    stage.getLocationInWindow(position);
    Rect region =
        new Rect(
            position[0],
            position[1],
            position[0] + stage.getWidth(),
            position[1] + stage.getHeight());
    float captureScale = Math.min(1f, 2048f / stage.getWidth());
    String captureSession = session;
    final Bitmap bitmap;
    try {
      bitmap =
          Bitmap.createBitmap(
              Math.max(1, Math.round(stage.getWidth() * captureScale)),
              Math.max(1, Math.round(stage.getHeight() * captureScale)),
              Bitmap.Config.ARGB_8888);
    } catch (OutOfMemoryError exhausted) {
      freezeAck(id, false);
      return;
    }
    try {
      PixelCopy.request(
          activity.getWindow(),
          region,
          bitmap,
          result -> {
            if (destroyed || !captureSession.equals(session)) {
              bitmap.recycle();
              return;
            }
            if (result == PixelCopy.SUCCESS) {
              frozen.setImageBitmap(bitmap);
              frozen.setVisibility(View.VISIBLE);
              freezeAck(id, true);
            } else {
              bitmap.recycle();
              freezeAck(id, false);
            }
          },
          handler);
    } catch (Exception e) {
      bitmap.recycle();
      freezeAck(id, false);
    }
  }

  private void freezeAck(int id, boolean ok) {
    if (destroyed) return;
    engine.evaluateJavascript(
        "window.__warzoneCommands?.freezeComplete(" + id + "," + ok + ")", null);
  }

  void feedback(float x, float y, float width, float height, String kind) {
    if (width <= 0) return;
    // The engine extends below the clipped stage while building. CSS pixels
    // retain their uniform width scale; the hidden bottom must not squash Y.
    float scale = stage.getWidth() / width;
    feedback.pulse(x * scale, y * scale, kind);
  }

  String diagnostics() {
    JSONArray views = new JSONArray();
    View surface =
        activeDialog != null && activeDialog.isShowing()
            ? activeDialog.getWindow().getDecorView()
            : shell;
    inspect(surface, views);
    JSONObject result =
        json(
            "implementation",
            "android.view",
            "gameVisible",
            ready,
            "page",
            page,
            "pendingRequests",
            pending.size(),
            "navigationPending",
            navigationPending,
            "selectedFactory",
            factory,
            "productionQuantity",
            quantity,
            "selectedLab",
            selectedLab,
            "enginePaused",
            enginePaused,
            "headerClass",
            header.getClass().getName(),
            "headerBounds",
            bounds(header),
            "mergedHeaderStatus",
            mergedHeader,
            "controlScale",
            controlScale,
            "panelClass",
            panel == null ? "" : panel.getClass().getName(),
            "panelBounds",
            bounds(panel),
            "listBounds",
            bounds(list),
            "queueBounds",
            bounds(queueList),
            "feedback",
            json("x", feedback.x, "y", feedback.y, "started", feedback.start),
            "listClass",
            list == null ? "" : list.getClass().getName(),
            "listSuperclass",
            list == null ? "" : list.getClass().getSuperclass().getName(),
            "editorClass",
            designName == null ? "" : designName.getClass().getName(),
            "stageWidth",
            stage.getWidth(),
            "stageHeight",
            stage.getHeight(),
            "minimumTouchPx",
            hit(),
            "viewCount",
            count(shell),
            "dialog",
            surface != shell,
            "dialogGeneration",
            overlayFrameSerial,
            "listScrolling",
            surface != shell ? dialogScrolling : listMoving(list) || listMoving(queueList),
            "windowFocused",
            surface.hasWindowFocus(),
            "layoutPending",
            !overlayFrameReady
                || surface.isLayoutRequested()
                || (surface == shell
                    && (stage.isLayoutRequested()
                        || (panel != null && panel.isLayoutRequested())
                        || (list != null && list.isAttachedToWindow() && list.isLayoutRequested())
                        || (queueList != null
                            && queueList.isAttachedToWindow()
                            && queueList.isLayoutRequested()))),
            "engineClass",
            engine.getClass().getName(),
            "views",
            views);
    return result.toString();
  }

  private boolean listMoving(ListView view) {
    return view instanceof StableList
        && view.isAttachedToWindow()
        && ((StableList) view).scrollState != AbsListView.OnScrollListener.SCROLL_STATE_IDLE;
  }

  private JSONArray bounds(View view) {
    Rect r = new Rect();
    if (view != null && view.isShown() && view.getGlobalVisibleRect(r)) {
      int[] origin = new int[2];
      view.getRootView().getLocationOnScreen(origin);
      r.offset(origin[0], origin[1]);
    }
    return new JSONArray().put(r.left).put(r.top).put(r.right).put(r.bottom);
  }

  private void inspect(View v, JSONArray result) {
    if (v == engine || !v.isShown()) return;
    if (v instanceof TextView || v instanceof Spinner) {
      Rect r = new Rect();
      if (v.getGlobalVisibleRect(r)) {
        // GlobalVisibleRect is local to a window. Dialogs have their own screen origin.
        int[] windowOrigin = new int[2];
        v.getRootView().getLocationOnScreen(windowOrigin);
        r.offset(windowOrigin[0], windowOrigin[1]);
        int ellipsis = 0;
        float textWidth = 0;
        int availableTextWidth = 0, textLayoutHeight = 0, availableTextHeight = 0;
        if (v instanceof TextView && ((TextView) v).getLayout() != null) {
          TextView label = (TextView) v;
          android.text.Layout layout = label.getLayout();
          for (int i = 0; i < layout.getLineCount(); i++) ellipsis += layout.getEllipsisCount(i);
          for (String line : label.getText().toString().split("\n"))
            textWidth = Math.max(textWidth, label.getPaint().measureText(line));
          availableTextWidth =
              label.getWidth() - label.getCompoundPaddingLeft() - label.getCompoundPaddingRight();
          textLayoutHeight = layout.getHeight();
          availableTextHeight =
              label.getHeight() - label.getCompoundPaddingTop() - label.getCompoundPaddingBottom();
        }
        result.put(
            json(
                "text",
                v instanceof TextView ? ((TextView) v).getText().toString() : "",
                "label",
                String.valueOf(v.getContentDescription()),
                "class",
                v.getClass().getName(),
                "enabled",
                v.isEnabled(),
                "rowId",
                v.getTag() instanceof String ? v.getTag() : "",
                "ellipsizedCharacters",
                ellipsis,
                "textWidthPx",
                textWidth,
                "availableTextWidthPx",
                availableTextWidth,
                "textLayoutHeightPx",
                textLayoutHeight,
                "availableTextHeightPx",
                availableTextHeight,
                "viewWidthPx",
                v.getWidth(),
                "clickable",
                v.isClickable(),
                "bounds",
                new JSONArray().put(r.left).put(r.top).put(r.right).put(r.bottom)));
      }
    }
    if (v instanceof ViewGroup) {
      ViewGroup g = (ViewGroup) v;
      for (int i = 0; i < g.getChildCount(); i++) inspect(g.getChildAt(i), result);
    }
  }

  private int count(View v) {
    int n = 1;
    if (v instanceof ViewGroup) {
      ViewGroup g = (ViewGroup) v;
      for (int i = 0; i < g.getChildCount(); i++)
        if (g.getChildAt(i) != engine) n += count(g.getChildAt(i));
    }
    return n;
  }

  void destroy() {
    destroyed = true;
    if (noticeToast != null) noticeToast.cancel();
    if (activeDialog != null) activeDialog.dismiss();
    for (Pending p : pending.values()) handler.removeCallbacks(p.timeout);
    pending.clear();
    handler.removeCallbacksAndMessages(null);
    frozen.setImageDrawable(null);
  }

  void configurationChanged() {
    if (activeDialog != null) activeDialog.dismiss();
    header.setPadding(dp(8), 0, dp(8), 0);
    header.setLayoutParams(new LinearLayout.LayoutParams(-1, hit()));
    LinearLayout.LayoutParams navLayout =
        (LinearLayout.LayoutParams) navigationScroll.getLayoutParams();
    navLayout.height = hit();
    navigationScroll.setLayoutParams(navLayout);
    waveRow.setLayoutParams(new LinearLayout.LayoutParams(-2, hit()));
    moreButton.setLayoutParams(new LinearLayout.LayoutParams(dp(50), hit()));
    skip.setLayoutParams(new LinearLayout.LayoutParams(dp(50), hit()));
    field.setPadding(0, 0, 0, 0);
    FrameLayout.LayoutParams fieldLayout = (FrameLayout.LayoutParams) field.getLayoutParams();
    fieldLayout.setMargins(dp(8), 0, dp(8), dp(8));
    field.setLayoutParams(fieldLayout);
    selectionLabel.setPadding(dp(12), 0, dp(12), 0);
    for (Map.Entry<TextView, Float> entry : new ArrayList<>(textSizes.entrySet()))
      if (entry.getKey() != null) {
        TextView v = entry.getKey();
        v.setTextSize(entry.getValue() * controlScale);
        if (v instanceof Button || v instanceof EditText) {
          v.setMinimumHeight(hit());
          v.setMinHeight(hit());
          if (v instanceof Button) {
            v.setMinWidth(dp(48));
            v.setMinimumWidth(dp(48));
            v.setPadding(dp(10), 0, dp(10), 0);
            if (v.getLayoutParams() instanceof LinearLayout.LayoutParams) {
              LinearLayout.LayoutParams p = (LinearLayout.LayoutParams) v.getLayoutParams();
              p.setMargins(0, 0, 0, 0);
              v.setLayoutParams(p);
            }
          }
        }
      }
    int position = list == null ? 0 : list.getFirstVisiblePosition();
    String current = page;
    if (field.getChildCount() > 1) field.removeViews(1, field.getChildCount() - 1);
    if (!current.isEmpty() && !current.equals("engine")) {
      hideKeyboard();
      showPage(current);
      if (list.isAttachedToWindow()) list.post(() -> list.setSelection(position));
    }
    for (Button action : headerActions.keySet()) {
      action.setTag(null);
      action.setLayoutParams(new LinearLayout.LayoutParams(-2, hit()));
    }
    layoutHeader();
    renderField();
  }

  private String imageFor(Row item) {
    if (item.id.startsWith("build:")) {
      for (JSONObject b : objects(arr(catalogue, "buildings")))
        if (item.id.substring(6).equals(b.optString("id"))) return b.optString("image", "");
    }
    if (item.id.startsWith("tech:"))
      return "research-icons/"
          + android.net.Uri.encode(item.title)
          + ("Avenger SAM".equals(item.title) ? ".png" : ".gif");
    String id = item.id.replaceFirst("^(saved:|template:)", "");
    JSONObject design = null;
    for (JSONObject d : objects(saved)) if (id.equals(d.optString("id"))) design = d;
    for (JSONObject d : objects(arr(snapshot, "templates")))
      if (id.equals(d.optString("id"))) design = d;
    if (design != null) {
      String part =
          arr(design, "turrets")
              .optString(0, arr(design, "weapons").optString(0, design.optString("construct")));
      JSONObject p = parts.get(part);
      if (p != null && !p.isNull("image")) return p.optString("image");
      if (part.equals("Spade1Mk1")) return "research-icons/Engineering.gif";
    }
    return "";
  }

  private void bindArtwork(ImageView view, Row item) {
    String path = imageFor(item);
    if (path.equals(view.getTag())) return;
    view.setTag(path);
    if (path.isEmpty() || path.equals("null") || missingArtwork.contains(path)) {
      view.setImageDrawable(null);
      view.setVisibility(View.GONE);
      return;
    }
    Bitmap image = artwork.get(path);
    if (image == null) {
      try (InputStream in = activity.getAssets().open("warzone/" + android.net.Uri.decode(path))) {
        image = BitmapFactory.decodeStream(in);
        if (image != null) artwork.put(path, image);
      } catch (Exception ignored) {
      }
      if (image == null) missingArtwork.add(path);
    }
    view.setImageBitmap(image);
    view.setVisibility(image == null ? View.GONE : View.VISIBLE);
  }

  private static final class Row {
    final String id, title, subtitle, action, visualAction;
    final Runnable click;
    final boolean enabled;
    final int progress;

    Row(String id, String title, String subtitle, String action, Runnable click, boolean enabled) {
      this(id, title, subtitle, action, click, enabled, -1, "");
    }

    Row(
        String id,
        String title,
        String subtitle,
        String action,
        Runnable click,
        boolean enabled,
        String visualAction) {
      this(id, title, subtitle, action, click, enabled, -1, visualAction);
    }

    Row(
        String id,
        String title,
        String subtitle,
        String action,
        Runnable click,
        boolean enabled,
        int progress) {
      this(id, title, subtitle, action, click, enabled, progress, "");
    }

    Row(
        String id,
        String title,
        String subtitle,
        String action,
        Runnable click,
        boolean enabled,
        int progress,
        String visualAction) {
      this.id = id;
      this.title = title;
      this.subtitle = subtitle;
      this.action = action;
      this.click = click;
      this.enabled = enabled;
      this.progress = progress;
      this.visualAction = visualAction;
    }

    String signature() {
      return id
          + "\n"
          + title
          + "\n"
          + subtitle
          + "\n"
          + action
          + "\n"
          + enabled
          + "\n"
          + progress
          + "\n"
          + visualAction;
    }
  }

  private final class Rows extends BaseAdapter {
    private List<Row> entries = new ArrayList<>();
    private String signature = "";
    private StableList owner;
    private int updateSerial;

    void set(List<Row> values, String empty) {
      int revision = ++updateSerial;
      final List<Row> actual =
          values.isEmpty()
              ? Collections.singletonList(new Row("empty", empty, "", "", null, false))
              : values;
      StringBuilder s = new StringBuilder();
      for (Row r : actual) s.append(r.signature());
      String next = s.toString();
      if (!signature.equals(next)) {
        if (owner != null
            && (owner.touching
                || owner.scrollState != AbsListView.OnScrollListener.SCROLL_STATE_IDLE)) {
          List<Row> copy = valuesCopy(actual);
          owner.deferred =
              () -> {
                if (revision == updateSerial) set(copy, empty);
              };
          return;
        }
        signature = next;
        entries = actual;
        notifyDataSetChanged();
      } else entries = actual;
    }

    private List<Row> valuesCopy(List<Row> values) {
      return new ArrayList<>(values);
    }

    public int getCount() {
      return entries.size();
    }

    public Object getItem(int p) {
      return entries.get(p);
    }

    public long getItemId(int p) {
      return entries.get(p).id.hashCode();
    }

    public boolean hasStableIds() {
      return true;
    }

    public int getViewTypeCount() {
      return 4;
    }

    public int getItemViewType(int position) {
      String id = entries.get(position).id;
      return id.startsWith("lab:") || id.startsWith("factory-status:")
          ? 1
          : id.startsWith("caption:") ? 2 : id.startsWith("utility:") ? 3 : 0;
    }

    public View getView(int pos, View reuse, ViewGroup parent) {
      if (parent instanceof StableList) owner = (StableList) parent;
      Row item = entries.get(pos);
      int type = getItemViewType(pos);
      if (type == 2) {
        TextView caption = reuse instanceof TextView ? (TextView) reuse : text("", 10, true);
        caption.setText(item.title);
        caption.setTextColor(MUTED);
        caption.setSingleLine(true);
        caption.setLayoutParams(new AbsListView.LayoutParams(-1, textHeight(caption, 1, 16)));
        return caption;
      }
      if (type == 3) {
        Button utility = reuse instanceof Button ? (Button) reuse : button("", () -> {});
        utility.setText(item.title);
        utility.setContentDescription(item.action);
        utility.setTextColor(MUTED);
        utility.setOnClickListener(v -> perform(item.id));
        utility.setLayoutParams(new AbsListView.LayoutParams(-1, hit()));
        return utility;
      }
      if (type == 1) {
        FrameLayout statusRow;
        Button select;
        ProgressBar progress;
        if (reuse instanceof FrameLayout) {
          statusRow = (FrameLayout) reuse;
          select = (Button) statusRow.getChildAt(0);
          progress = (ProgressBar) statusRow.getChildAt(1);
        } else {
          statusRow = new FrameLayout(activity);
          select = button("", () -> {});
          select.setBackground(
              new RippleDrawable(ColorStateList.valueOf(0x337f9299), background(BG, 0), null));
          select.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
          select.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
          select.setSingleLine(false);
          select.setMaxLines(2);
          select.setEllipsize(android.text.TextUtils.TruncateAt.END);
          select.setTextSize(12 * controlScale);
          textSizes.put(select, 12f);
          select.setPadding(0, dp(4), 0, dp(4));
          statusRow.addView(select, new FrameLayout.LayoutParams(-1, -1));
          progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
          progress.setMax(1000);
          progress.setProgressTintList(ColorStateList.valueOf(CYAN));
          progress.setProgressBackgroundTintList(ColorStateList.valueOf(LINE));
          progress.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
          statusRow.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.BOTTOM));
        }
        select.setText(item.title + (item.subtitle.isEmpty() ? "" : "\n" + item.subtitle));
        select.setContentDescription(item.action);
        select.setEnabled(item.enabled);
        select.setTextColor(item.progress < 0 ? MUTED : TEXT);
        select.setOnClickListener(v -> perform(item.id));
        progress.setProgress(Math.max(0, item.progress));
        progress.setVisibility(item.progress < 0 ? View.GONE : View.VISIBLE);
        int height =
            Math.max(hit(), (int) Math.ceil(select.getPaint().getFontSpacing() * 2) + dp(8));
        statusRow.setLayoutParams(new AbsListView.LayoutParams(-1, height));
        return statusRow;
      }
      LinearLayout row;
      TextView title, subtitle;
      Button action;
      ImageView icon;
      if (reuse instanceof LinearLayout) {
        row = (LinearLayout) reuse;
        icon = (ImageView) row.getChildAt(0);
        LinearLayout content = (LinearLayout) row.getChildAt(1);
        TextView[] labels = (TextView[]) content.getTag();
        title = labels[0];
        subtitle = labels[1];
        action = (Button) row.getChildAt(2);
      } else {
        row = row();
        row.setPadding(dp(12), dp(5), dp(12), dp(5));
        row.setMinimumHeight(dp(59));
        icon = new ImageView(activity);
        icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(32), dp(32));
        ip.setMargins(0, 0, dp(10), 0);
        row.addView(icon, ip);
        LinearLayout content = column();
        title = text("", 14, true);
        title.setMaxLines(2);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_SIMPLE);
        title.setHyphenationFrequency(android.text.Layout.HYPHENATION_FREQUENCY_NONE);
        subtitle = text("", 11, false);
        subtitle.setTextColor(MUTED);
        subtitle.setPadding(0, dp(3), dp(6), 0);
        content.addView(title);
        content.addView(subtitle);
        content.setTag(new TextView[] {title, subtitle});
        row.addView(content, new LinearLayout.LayoutParams(0, -2, 1));
        action = button("", () -> {});
        row.addView(action);
      }
      title.setText(item.title);
      subtitle.setText(item.subtitle);
      subtitle.setVisibility(item.subtitle.isEmpty() ? View.GONE : View.VISIBLE);
      boolean removeTopic = item.id.startsWith("rq:") || item.id.startsWith("pq:"),
          building = item.id.startsWith("build:");
      boolean technology = item.id.startsWith("tech:");
      row.setPadding(
          dp(removeTopic ? 0 : 12),
          dp(removeTopic ? 4 : 5),
          dp(removeTopic ? 0 : 12),
          dp(removeTopic ? 4 : 5));
      row.setMinimumHeight(dp(removeTopic ? 56 : 59));
      title.setTextSize((removeTopic ? 13 : 14) * controlScale);
      textSizes.put(title, removeTopic ? 13f : 14f);
      title.setTypeface(
          Typeface.create(removeTopic ? "sans-serif" : "sans-serif-medium", Typeface.NORMAL));
      title.setPadding(0, dp(removeTopic ? 3 : 0), 0, 0);
      subtitle.setTextSize((removeTopic ? 10 : 11) * controlScale);
      textSizes.put(subtitle, removeTopic ? 10f : 11f);
      subtitle.setPadding(0, dp(removeTopic ? 0 : 3), dp(6), 0);
      if (removeTopic)
        subtitle.setText(
            item.id.startsWith("rq:") ? item.subtitle.toUpperCase(Locale.ROOT) : "WAITING");
      LinearLayout content = (LinearLayout) row.getChildAt(1);
      if (content.getChildAt(0) != (removeTopic ? subtitle : title)) {
        content.removeAllViews();
        content.addView(removeTopic ? subtitle : title);
        content.addView(removeTopic ? title : subtitle);
      }
      title.setMaxLines(building ? 3 : 2);
      action.setText(
          removeTopic
              ? "\u00d7"
              : building && item.action.equals("RESELECT")
                  ? "Ready"
                  : item.action.equals("PRODUCE")
                      ? "Build"
                      : item.visualAction.isEmpty()
                          ? compactLabel(item.action)
                          : item.visualAction);
      action.setMinWidth(dp(removeTopic ? 48 : 60));
      action.setMinimumWidth(dp(removeTopic ? 48 : 60));
      float actionSize = removeTopic ? 21 : technology && !item.enabled ? 11 : 13;
      action.setTextSize(actionSize * controlScale);
      textSizes.put(action, actionSize);
      action.setTextColor(
          technology && item.action.equals("ACTIVE") && item.visualAction.isEmpty()
              ? ACCENT
              : item.enabled ? CYAN : MUTED);
      action.setBackground(
          new RippleDrawable(
              ColorStateList.valueOf(0x336fcbd3),
              background(
                  removeTopic ? RAIL : technology && !item.enabled ? BG : CARD,
                  removeTopic || technology && !item.enabled ? 0 : LINE),
              null));
      ViewGroup.LayoutParams ap = action.getLayoutParams();
      if (technology || building) {
        Paint measure = new Paint(action.getPaint());
        measure.setTextSize(
            13 * controlScale * activity.getResources().getDisplayMetrics().scaledDensity);
        float widest =
            building
                ? Math.max(measure.measureText("Build"), measure.measureText("Ready"))
                : Math.max(measure.measureText("Active"), measure.measureText("Queued"));
        ap.width =
            Math.max(
                dp(60),
                (int) Math.ceil(widest) + action.getPaddingLeft() + action.getPaddingRight());
      } else ap.width = ViewGroup.LayoutParams.WRAP_CONTENT;
      action.setLayoutParams(ap);
      action.setContentDescription(item.action + " " + item.title);
      action.setTag(item.id);
      action.setVisibility(item.action.isEmpty() ? View.GONE : View.VISIBLE);
      action.setEnabled(item.enabled);
      action.setOnClickListener(v -> perform(item.id));
      row.setOnClickListener(v -> perform(item.id));
      row.setBackgroundColor(BG);
      bindArtwork(icon, item);
      return row;
    }

    private void perform(String id) {
      for (Row current : entries)
        if (current.id.equals(id)) {
          if (current.enabled && current.click != null) current.click.run();
          return;
        }
    }
  }

  private final class StableList extends ListView {
    boolean touching;
    int scrollState;
    Runnable deferred;
    private int lastPosition = -1, lastTop, lastOverscroll, stationaryFrames;
    private final Runnable settleCheck = this::checkSettled;

    StableList(Context c) {
      super(c);
      setOnScrollListener(
          new AbsListView.OnScrollListener() {
            public void onScrollStateChanged(AbsListView view, int state) {
              scrollState = state;
              removeCallbacks(settleCheck);
              if (state == SCROLL_STATE_IDLE && !touching) flushDeferred();
              else if (!touching) postOnAnimation(settleCheck);
            }

            public void onScroll(AbsListView view, int first, int visible, int total) {}
          });
    }

    private void checkSettled() {
      if (touching
          || !isAttachedToWindow()
          || scrollState == AbsListView.OnScrollListener.SCROLL_STATE_IDLE) return;
      View first = getChildAt(0);
      int position = getFirstVisiblePosition(), top = first == null ? 0 : first.getTop();
      if (position == lastPosition && top == lastTop && getScrollY() == lastOverscroll)
        stationaryFrames++;
      else stationaryFrames = 0;
      lastPosition = position;
      lastTop = top;
      lastOverscroll = getScrollY();
      if (stationaryFrames >= 6) {
        // At an edge Android can omit the idle callback. Stop the settled
        // fling itself, so the next tap works and deferred rows can commit.
        smoothScrollBy(0, 0);
        scrollState = AbsListView.OnScrollListener.SCROLL_STATE_IDLE;
        flushDeferred();
      } else postOnAnimation(settleCheck);
    }

    @Override
    protected void onDetachedFromWindow() {
      removeCallbacks(settleCheck);
      touching = false;
      scrollState = AbsListView.OnScrollListener.SCROLL_STATE_IDLE;
      deferred = null;
      super.onDetachedFromWindow();
    }

    private void flushDeferred() {
      Runnable next = deferred;
      deferred = null;
      if (next != null) post(next);
    }

    @Override
    public boolean dispatchTouchEvent(android.view.MotionEvent event) {
      if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
        touching = true;
        stationaryFrames = 0;
        removeCallbacks(settleCheck);
      }
      boolean handled = super.dispatchTouchEvent(event);
      if (event.getActionMasked() == android.view.MotionEvent.ACTION_UP
          || event.getActionMasked() == android.view.MotionEvent.ACTION_CANCEL) {
        touching = false;
        if (scrollState == AbsListView.OnScrollListener.SCROLL_STATE_IDLE) flushDeferred();
        else {
          stationaryFrames = 0;
          removeCallbacks(settleCheck);
          postOnAnimation(settleCheck);
        }
      }
      return handled;
    }
  }

  private final class Feedback extends View {
    final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    float x, y;
    long start;
    String kind = "";

    Feedback(Context c) {
      super(c);
      setClickable(false);
      setFocusable(false);
    }

    void pulse(float x, float y, String kind) {
      this.x = x;
      this.y = y;
      this.kind = kind;
      start = android.os.SystemClock.uptimeMillis();
      invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
      long elapsed = android.os.SystemClock.uptimeMillis() - start;
      if (start == 0 || elapsed > 430) return;
      paint.setColor(kind.equals("double") ? ACCENT : GREEN);
      paint.setAlpha((int) (255 * (1 - elapsed / 430f)));
      paint.setStyle(Paint.Style.STROKE);
      paint.setStrokeWidth(dp(2));
      canvas.drawCircle(x, y, dp(10 + elapsed / 30f), paint);
      postInvalidateOnAnimation();
    }
  }
}
