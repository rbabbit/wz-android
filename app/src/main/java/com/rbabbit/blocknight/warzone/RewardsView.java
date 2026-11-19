package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Illustrated native drawer shared by Home and the active match. Policy stays in RewardStore. */
final class RewardsView extends FrameLayout {
    interface Actions {
        void buy(String id, int quantity);
        void equip(String id, int quantity);
        void close();
    }

    private static final int INK = TowersTheme.TEXT, MUTED = TowersTheme.SECONDARY;
    private static final String[] CATEGORIES = {"Fortresses", "Defences", "Artillery", "Support"};
    private final Actions actions;
    private final boolean inGame;
    private final String profile, mapId;
    private final Typeface face;
    private final LinearLayout drawer, rows;
    private final ScrollView scroll;
    private final TextView wallet;
    private final Map<String, Button> categories = new LinkedHashMap<>();
    private final Map<String, Bitmap> artwork = new LinkedHashMap<>();
    private final Map<String, ItemRow> itemRows = new LinkedHashMap<>();
    private final Map<String, Integer> inventory = new LinkedHashMap<>(), loadout = new LinkedHashMap<>();
    private String category = "Fortresses", selectedId = "fortress";
    private String pendingItemId = "", pendingKind = "", feedbackItemId = "", feedbackText = "";
    private int balance, feedbackGeneration;
    private boolean busy, initialized, feedbackError;
    private PopupWindow ownedPopup;

    RewardsView(Context context, String mapId, String mapName, int balance,
            Map<String, Integer> inventory, Map<String, Integer> loadout, boolean inGame, Actions actions) {
        this(context,"towers",mapId,mapName,balance,inventory,loadout,inGame,actions);
    }
    RewardsView(Context context, String profile, String mapId, String mapName, int balance,
            Map<String, Integer> inventory, Map<String, Integer> loadout, boolean inGame, Actions actions) {
        super(context);
        this.profile=RewardCatalog.profile(profile);this.mapId=mapId;
        this.actions = actions;
        this.inGame = inGame;
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(0x44000000);
        setClickable(true);
        // A focusable scrim consumes its first tap to take focus. Outside taps
        // must close immediately now that the header is the normal toggle.
        setFocusableInTouchMode(false);
        setOnClickListener(v -> actions.close());
        drawer = new LinearLayout(context);
        drawer.setOrientation(LinearLayout.VERTICAL);
        drawer.setPadding(dp(8), dp(4), dp(8), dp(4));
        drawer.setBackground(surface(context, TowersTheme.PANEL, 0));
        drawer.setClickable(true);
        drawer.setOnClickListener(v -> { });
        addView(drawer, new LayoutParams(dp(350), -1, Gravity.END));

        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setMinimumHeight(dp(36));
        header.addView(copy("challenge".equals(profile) ? "" : "5 crystals per completed wave", 12, MUTED),
                new LinearLayout.LayoutParams(0, -2, 1));
        LinearLayout.LayoutParams crystalParams = new LinearLayout.LayoutParams(dp(15), dp(17));
        crystalParams.leftMargin = dp(7);
        header.addView(crystal(), crystalParams);
        wallet = copy("", 16, INK);
        wallet.setTypeface(face);
        wallet.setSingleLine(true);
        wallet.setMaxWidth(dp(80));
        wallet.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams walletParams = new LinearLayout.LayoutParams(-2, -2);
        walletParams.leftMargin = dp(4);
        header.addView(wallet, walletParams);
        drawer.addView(header, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout tabs = new LinearLayout(context);
        for (String name : CATEGORIES) {
            Button tab = compactAction(name, false, 11);
            tab.setContentDescription("Rewards category " + name);
            tab.setOnClickListener(v -> setCategory(name));
            categories.put(name, tab);
            tabs.addView(tab, new LinearLayout.LayoutParams(0, dp(32), 1));
        }
        drawer.addView(tabs, new LinearLayout.LayoutParams(-1, dp(32)));

        scroll = new ScrollView(context);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(true);
        scroll.setFillViewport(false);
        rows = new LinearLayout(context);
        rows.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(rows, new ScrollView.LayoutParams(-1, -2));
        drawer.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        refresh(balance, inventory, loadout);
    }

    void refresh(int balance, Map<String, Integer> inventory, Map<String, Integer> loadout) {
        Map<String, Integer> newInventory = normalized(inventory), newLoadout = normalized(loadout);
        int newBalance = Math.max(0, balance);
        // Wave snapshots arrive repeatedly. Preserve actual touched rows and
        // their scroll position when the wallet/allowances have not changed.
        if (initialized && this.balance == newBalance && this.inventory.equals(newInventory)
                && this.loadout.equals(newLoadout)) return;
        this.balance = newBalance;
        this.inventory.clear(); this.inventory.putAll(newInventory);
        this.loadout.clear(); this.loadout.putAll(newLoadout);
        initialized = true;
        render();
    }

    /** Native progress never releases a pending purchase; its callback does. */
    void completeMutation(int balance, Map<String, Integer> inventory, Map<String, Integer> loadout) {
        String acknowledgedItem = pendingItemId, acknowledgedKind = pendingKind;
        busy = false;
        pendingItemId = "";
        pendingKind = "";
        refresh(balance, inventory, loadout);
        if (!acknowledgedItem.isEmpty()) {
            String message = "buy".equals(acknowledgedKind) ? "+1 added"
                    : "Selected " + count(this.loadout, acknowledgedItem);
            showFeedback(acknowledgedItem, message, false);
        } else render(); // Also unlocks an acknowledged operation whose counts stayed equal.
    }

    void showError(String message) {
        String failedItem = pendingItemId.isEmpty() ? selectedId : pendingItemId;
        busy = false;
        pendingItemId = "";
        pendingKind = "";
        showFeedback(failedItem, message == null || message.isEmpty() ? "Could not save. Please retry." : message, true);
    }

    private void setCategory(String value) {
        if (busy || category.equals(value)) return;
        dismissOwnedPopup();
        category = value;
        selectedId = "";
        clearFeedback();
        itemRows.clear();
        rows.removeAllViews();
        scroll.scrollTo(0, 0);
        render();
    }

    private void commitOne(RewardCatalog.Item entry) {
        if (busy) return;
        dismissOwnedPopup();
        selectedId = entry.id;
        if (!entry.requires.isEmpty() && count(loadout,entry.requires)<1) {
            showFeedback(entry.id,"Select "+RewardCatalog.get(entry.requires).name+" first",true);return;
        }
        if (inGame && entry.moreFortress && entry.consumedOnApply() && count(loadout,entry.id)>0) {
            showFeedback(entry.id,"Applied this run",true);return;
        }
        if (maxQuantity(entry) < 1) {
            showFeedback(entry.id, entry.fortress ? "Fortress limit reached" : "Maximum stock reached", true);
            return;
        }
        if (entry.price > balance) {
            showFeedback(entry.id, "Need " + (entry.price - balance) + " more crystals", true);
            return;
        }
        clearFeedback();
        pendingItemId = entry.id;
        pendingKind = "buy";
        busy = true;
        render();
        actions.buy(entry.id, 1);
    }

    private void selectOwned(RewardCatalog.Item entry, int value) {
        if (inGame || busy) return;
        dismissOwnedPopup();
        selectedId = entry.id;
        if (value < 0 || value > maxOwned(entry)) {
            showFeedback(entry.id, "Stored amount changed. Choose again.", true);
            return;
        }
        if (value == count(loadout, entry.id)) return;
        clearFeedback();
        pendingItemId = entry.id;
        pendingKind = "equip";
        busy = true;
        render();
        actions.equip(entry.id, value);
    }

    private void clearFeedback() {
        ++feedbackGeneration;
        feedbackItemId = "";
        feedbackText = "";
        feedbackError = false;
    }

    private void showFeedback(String itemId, String message, boolean failed) {
        clearFeedback();
        feedbackItemId = itemId;
        feedbackText = message;
        feedbackError = failed;
        int generation = feedbackGeneration;
        render();
        postDelayed(() -> {
            if (generation != feedbackGeneration) return;
            clearFeedback();
            render();
        }, failed ? 3200 : 1800);
    }

    private int maxQuantity(RewardCatalog.Item item) {
        if(!eligible(item)||!item.requires.isEmpty()&&count(loadout,item.requires)<1)return 0;
        if(inGame&&item.moreFortress&&item.consumedOnApply())return Math.max(0,1-count(loadout,item.id));
        if (inGame) {
            if (item.fortress) return 3;
            if (item.maxPerMatch == 1 || item.nativeId.isEmpty()) return 1;
            return 999;
        }
        int available = Math.max(0, 999 - count(inventory, item.id));
        if (item.fortress) {
            int stored = 0;
            for (RewardCatalog.Item entry : RewardCatalog.list()) if (entry.fortress) stored += count(inventory, entry.id);
            available = Math.min(available, Math.max(0, 3 - stored));
        }
        if (item.structure() && item.maxPerMatch == 1) available = Math.min(available, Math.max(0, 1 - count(inventory, item.id)));
        return available;
    }

    private int maxOwned(RewardCatalog.Item item) {
        if(!eligible(item)||!item.requires.isEmpty()&&count(loadout,item.requires)<1)return 0;
        int available = Math.min(count(inventory, item.id), item.maxPerMatch);
        if (item.fortress) {
            int other = 0;
            for (RewardCatalog.Item entry : RewardCatalog.list()) if (entry.fortress && !entry.id.equals(item.id)) other += count(loadout, entry.id);
            available = Math.min(available, Math.max(0, 3 - other));
        }
        return available;
    }

    private boolean eligible(RewardCatalog.Item item) {
        try{RewardCatalog.requireEligible(item,profile,mapId);return true;}catch(IllegalArgumentException error){return false;}
    }
    private List<RewardCatalog.Item> visibleItems() {
        List<RewardCatalog.Item> values = new ArrayList<>();
        for (RewardCatalog.Item item : RewardCatalog.list()) if (item.purchasable()&&category.equals(item.category)&&eligible(item)) values.add(item);
        return values;
    }

    private void render() {
        String amount = Integer.toString(balance);
        if (!amount.contentEquals(wallet.getText())) wallet.setText(amount);
        wallet.setContentDescription(balance + " crystals");
        for (Map.Entry<String, Button> tab : categories.entrySet()) {
            styleTab(tab.getValue(), category.equals(tab.getKey()));
            tab.getValue().setEnabled(!busy);
        }
        List<RewardCatalog.Item> visible = visibleItems();
        // Keep touched row instances and their scroll positions while snapshots,
        // acknowledgements and transient feedback update only their contents.
        for (RewardCatalog.Item entry : visible) {
            ItemRow row = itemRows.get(entry.id);
            if (row == null) {
                row = new ItemRow(entry);
                itemRows.put(entry.id, row);
                rows.addView(row.root, new LinearLayout.LayoutParams(-1, -2));
            }
            row.bind();
        }
    }

    private String itemStatus(RewardCatalog.Item entry) {
        if (!inGame) return "Stored " + count(inventory, entry.id);
        if (entry.consumedOnApply()) return loadout.containsKey(entry.id) ? "Applied this match" : "Not applied";
        return "This match " + count(loadout, entry.id);
    }

    private final class ItemRow {
        final RewardCatalog.Item entry;
        final LinearLayout root;
        final TextView name, status, amount, details;
        final Button owned;
        int background = Integer.MIN_VALUE;

        ItemRow(RewardCatalog.Item entry) {
            this.entry = entry;
            root = new LinearLayout(getContext());
            root.setGravity(Gravity.CENTER_VERTICAL);
            root.setPadding(dp(3), dp(4), dp(3), dp(4));
            root.setMinimumHeight(dp(48));
            root.setClickable(true);
            root.setFocusable(true);
            root.setOnClickListener(v -> commitOne(entry));

            ImageView icon = new ImageView(getContext());
            icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            icon.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
            Bitmap bitmap = image(entry.id);
            if (bitmap != null) {
                BitmapDrawable drawable = new BitmapDrawable(getResources(), bitmap);
                drawable.setFilterBitmap(false);
                icon.setImageDrawable(drawable);
            }
            LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(dp(40), dp(32));
            imageParams.rightMargin = dp(7);
            root.addView(icon, imageParams);

            LinearLayout labels = new LinearLayout(getContext());
            labels.setOrientation(LinearLayout.VERTICAL);
            labels.setDuplicateParentStateEnabled(true);
            name = copy(entry.name, 13, INK);
            name.setDuplicateParentStateEnabled(true);
            name.setTypeface(face);
            name.setMaxLines(2);
            name.setEllipsize(TextUtils.TruncateAt.END);
            labels.addView(name, new LinearLayout.LayoutParams(-1, -2));
            details=copy(entry.description,10,MUTED);details.setMaxLines(4);details.setEllipsize(TextUtils.TruncateAt.END);
            details.setVisibility(entry.moreFortress?VISIBLE:GONE);labels.addView(details,new LinearLayout.LayoutParams(-1,-2));
            status = copy("", 10, MUTED);
            status.setDuplicateParentStateEnabled(true);
            status.setMaxLines(2);
            status.setEllipsize(TextUtils.TruncateAt.END);
            status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
            labels.addView(status, new LinearLayout.LayoutParams(-1, -2));
            root.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));

            // This child action consumes its own click: choosing existing stock
            // never reaches the parent row's purchase action.
            owned = compactAction("", false, 10);
            owned.setMaxLines(2);
            owned.setSingleLine(false);
            owned.setMinHeight(dp(36));
            owned.setPadding(dp(5), 0, dp(5), 0);
            owned.setOnClickListener(v -> showOwnedChooser(entry, owned));
            LinearLayout.LayoutParams ownedParams = new LinearLayout.LayoutParams(-2, -2);
            ownedParams.leftMargin = dp(4);
            root.addView(owned, ownedParams);

            LinearLayout price = new LinearLayout(getContext());
            price.setDuplicateParentStateEnabled(true);
            price.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
            price.setMinimumWidth(dp(39));
            price.addView(crystal(), new LinearLayout.LayoutParams(dp(10), dp(12)));
            amount = copy(Integer.toString(entry.price), 12, INK);
            amount.setDuplicateParentStateEnabled(true);
            amount.setTypeface(face);
            amount.setPadding(dp(3), 0, 0, 0);
            price.addView(amount, new LinearLayout.LayoutParams(-2, -2));
            LinearLayout.LayoutParams priceParams = new LinearLayout.LayoutParams(-2, -2);
            priceParams.leftMargin = dp(5);
            root.addView(price, priceParams);
        }

        void bind() {
            boolean pending = busy && entry.id.equals(pendingItemId);
            boolean feedback = entry.id.equals(feedbackItemId) && !feedbackText.isEmpty();
            int fill = feedback || entry.id.equals(selectedId) ? TowersTheme.PRIMARY : 0x00000000;
            if (fill != background) {
                background = fill;
                root.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE),
                        TowersTheme.control(getContext(), fill, 3), null));
            }
            root.setSelected(entry.id.equals(selectedId));
            root.setEnabled(!busy);
            boolean light = fill == TowersTheme.PRIMARY;
            name.setTextColor(TowersTheme.buttonText(light));
            details.setTextColor(TowersTheme.controlText(light,MUTED));
            amount.setTextColor(TowersTheme.buttonText(light));
            String text = itemStatus(entry);
            if (pending) text += " · " + ("buy".equals(pendingKind) ? "Adding…" : "Saving…");
            else if (feedback) text += " · " + feedbackText;
            if (!text.contentEquals(status.getText())) status.setText(text);
            status.setTextColor(TowersTheme.controlText(light, pending || feedback ? INK : MUTED));
            amount.setAlpha(entry.price <= balance && maxQuantity(entry) > 0 ? 1f : .5f);
            int stored = count(inventory, entry.id), selected = count(loadout, entry.id);
            owned.setVisibility(!inGame && stored > 0 ? VISIBLE : GONE);
            String selection = "Selected " + selected;
            if (!selection.contentEquals(owned.getText())) owned.setText(selection);
            owned.setEnabled(!busy);
            owned.setContentDescription("Choose stored " + entry.name + " quantity, " + selected
                    + " selected from " + stored + " stored");
            root.setContentDescription("Buy 1 " + entry.name + " for " + entry.price + " crystals. " + entry.description + " " + text);
        }
    }

    private void showOwnedChooser(RewardCatalog.Item entry, View anchor) {
        if (inGame || busy || count(inventory, entry.id) < 1) return;
        dismissOwnedPopup();
        final int maximum = maxOwned(entry);
        LinearLayout content = new LinearLayout(getContext());
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(4), dp(4), dp(4), dp(4));
        content.setBackground(surface(getContext(), TowersTheme.PANEL, 5));
        TextView heading = copy("Use stored " + entry.name, 12, INK);
        heading.setTypeface(face);
        heading.setMaxLines(2);
        heading.setEllipsize(TextUtils.TruncateAt.END);
        heading.setPadding(dp(8), dp(5), dp(8), dp(7));
        content.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        ListView options = new ListView(getContext());
        options.setDivider(null);
        options.setBackgroundColor(TowersTheme.PANEL);
        options.setSelector(surface(getContext(), TowersTheme.RIPPLE, 3));
        options.setVerticalScrollBarEnabled(true);
        options.setCacheColorHint(0x00000000);
        options.setAdapter(new BaseAdapter() {
            @Override public int getCount() { return maximum + 1; }
            @Override public Integer getItem(int position) { return position; }
            @Override public long getItemId(int position) { return position; }
            @Override public View getView(int position, View recycled, ViewGroup parent) {
                TextView option = recycled instanceof TextView ? (TextView) recycled : copy("", 14, INK);
                option.setTypeface(face);
                option.setGravity(Gravity.CENTER_VERTICAL);
                option.setMinHeight(dp(40));
                option.setPadding(dp(10), dp(5), dp(10), dp(5));
                option.setSingleLine(true);
                option.setEllipsize(TextUtils.TruncateAt.END);
                option.setText(position == 0 ? "0 · Leave stored" : position + " selected");
                boolean chosen = position == count(loadout, entry.id);
                option.setTextColor(TowersTheme.buttonText(chosen));
                option.setBackground(TowersTheme.control(getContext(), chosen ? TowersTheme.PRIMARY : TowersTheme.CONTROL, 6));
                option.setContentDescription("Use " + position + " stored " + entry.name);
                return option;
            }
        });
        // Window-visible bounds are screen coordinates; showAtLocation uses the
        // containing window's coordinates. Keep the entire measured menu visible
        // even when its row is near the bottom, inset, or in a short window.
        Rect visible = new Rect();
        anchor.getWindowVisibleDisplayFrame(visible);
        View windowRoot = anchor.getRootView();
        int[] rootScreen = new int[2];
        windowRoot.getLocationOnScreen(rootScreen);
        Rect rootBounds = new Rect(rootScreen[0], rootScreen[1],
                rootScreen[0] + windowRoot.getWidth(), rootScreen[1] + windowRoot.getHeight());
        if (visible.isEmpty()) visible.set(rootBounds);
        else if (!visible.intersect(rootBounds)) return;
        int margin = dp(4);
        if (visible.width() > margin * 2 && visible.height() > margin * 2) visible.inset(margin, margin);
        if (visible.isEmpty() || anchor.getWindowToken() == null) return;

        int popupWidth = Math.min(visible.width(), Math.min(dp(220), Math.max(dp(160), drawer.getWidth() - dp(16))));
        int innerWidth = Math.max(1, popupWidth - content.getPaddingLeft() - content.getPaddingRight());
        int exactInnerWidth = MeasureSpec.makeMeasureSpec(innerWidth, MeasureSpec.EXACTLY);
        View optionSample = options.getAdapter().getView(0, null, options);
        optionSample.measure(exactInnerWidth, MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
        int optionHeight = Math.max(dp(40), optionSample.getMeasuredHeight());
        int verticalPadding = content.getPaddingTop() + content.getPaddingBottom();
        heading.setMaxHeight(Math.max(0, visible.height() - verticalPadding - optionHeight));
        heading.measure(exactInnerWidth, MeasureSpec.makeMeasureSpec(visible.height(), MeasureSpec.AT_MOST));
        int listHeight = Math.max(1, Math.min(optionHeight * Math.min(maximum + 1, 5),
                visible.height() - verticalPadding - heading.getMeasuredHeight()));
        content.addView(options, new LinearLayout.LayoutParams(-1, listHeight));
        content.measure(MeasureSpec.makeMeasureSpec(popupWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(visible.height(), MeasureSpec.AT_MOST));
        int popupHeight = Math.min(visible.height(), content.getMeasuredHeight());
        int[] anchorScreen = new int[2], anchorWindow = new int[2];
        anchor.getLocationOnScreen(anchorScreen);
        anchor.getLocationInWindow(anchorWindow);
        int x = Math.max(visible.left, Math.min(anchorScreen[0], visible.right - popupWidth));
        int below = anchorScreen[1] + anchor.getHeight() + margin;
        int above = anchorScreen[1] - margin - popupHeight;
        int y = below + popupHeight <= visible.bottom ? below : above;
        y = Math.max(visible.top, Math.min(y, visible.bottom - popupHeight));
        int windowOriginX = anchorScreen[0] - anchorWindow[0];
        int windowOriginY = anchorScreen[1] - anchorWindow[1];
        PopupWindow popup = new PopupWindow(content, popupWidth, popupHeight, true);
        popup.setBackgroundDrawable(surface(getContext(), TowersTheme.PANEL, 5));
        popup.setOutsideTouchable(true);
        popup.setElevation(dp(6));
        popup.setClippingEnabled(true);
        popup.setOnDismissListener(() -> { if (ownedPopup == popup) ownedPopup = null; });
        options.setOnItemClickListener((parent, view, position, id) -> selectOwned(entry, position));
        ownedPopup = popup;
        popup.showAtLocation(anchor, Gravity.TOP | Gravity.LEFT, x - windowOriginX, y - windowOriginY);
        options.setSelection(Math.max(0, Math.min(maximum, count(loadout, entry.id))));
    }

    private void dismissOwnedPopup() {
        if (ownedPopup != null) {
            PopupWindow popup = ownedPopup;
            ownedPopup = null;
            popup.dismiss();
        }
    }

    @Override protected void onDetachedFromWindow() {
        dismissOwnedPopup();
        ++feedbackGeneration;
        super.onDetachedFromWindow();
    }

    private Bitmap image(String id) {
        if(id.startsWith("mf_"))return moreFortressImage(id);
        if (artwork.containsKey(id)) return artwork.get(id);
        String filename;
        switch (id) {
            case "fortress": filename = "Cannon Fortress.gif"; break;
            case "missile_fortress": filename = "Missile Fortress.gif"; break;
            case "mass_driver_fortress": filename = "Mass Driver Fortress.gif"; break;
            case "rocket_bastion": filename = "Heavy Rocket Bastion.gif"; break;
            case "gauss_hardpoint": filename = "Gauss Cannon Hardpoint.gif"; break;
            case "gauss_emplacement": filename = "Gauss Cannon Emplacement.gif"; break;
            case "scourge_hardpoint": filename = "Scourge Missile Hardpoint.gif"; break;
            case "pulse_hardpoint": filename = "Pulse Laser Hardpoint.gif"; break;
            case "heavy_laser": filename = "Heavy Laser Emplacement.gif"; break;
            case "emp_hardpoint": filename = "EMP Cannon Tower.gif"; break;
            case "emp_mortar": filename = "EMP Mortar Pit.gif"; break;
            case "archangel": filename = "Archangel Missile Battery.gif"; break;
            case "ripple": filename = "Ripple Rocket Battery.gif"; break;
            case "hellstorm": filename = "Hellstorm Emplacement.gif"; break;
            case "ground_shaker": filename = "Ground Shaker Emplacement.gif"; break;
            case "wide_sensor": filename = "Wide Spectrum Sensor Tower.gif"; break;
            case "satellite_uplink": filename = "Satellite Uplink Centre.gif"; break;
            case "laser_sat": filename = "Laser Satellite Command Post.gif"; break;
            case "research": filename = "Research Module.gif"; break;
            case "supply": filename = "Power Module.gif"; break;
            default: throw new IllegalArgumentException("Unknown reward artwork: " + id);
        }
        Bitmap result = null;
        try (InputStream input = getContext().getAssets().open("warzone/research-icons/" + filename)) {
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inScaled = false;
            result = BitmapFactory.decodeStream(input, null, options);
        } catch (Exception problem) { Log.w("TowersRewards", "Reward image unavailable: " + filename, problem); }
        artwork.put(id, result);
        return result;
    }

    private Bitmap moreFortressImage(String id) {
        if(artwork.containsKey(id))return artwork.get(id);
        String path;
        switch(id){
            case "mf_aa_flak":case "mf_assault_gun":case "mf_flamer":case "mf_laser":case "mf_rim116":case "mf_howitzer":case "mf_atgm_emplacement":
                path="warzone/more-fortress-icons/"+id+".png";break;
            case "mf_atgm_design":path="warzone/more-fortress-icons/mf_atgm_emplacement.png";break;
            case "mf_fortress_sensor":path="warzone/research-icons/Wide Spectrum Sensor Tower.gif";break;
            default:path="warzone/research-icons/Improved Hardcrete.gif";
        }
        Bitmap result=null;
        try(InputStream input=getContext().getAssets().open(path)){
            BitmapFactory.Options options=new BitmapFactory.Options();options.inScaled=false;result=BitmapFactory.decodeStream(input,null,options);
        }catch(Exception error){Log.w("TowersRewards","Reward image unavailable: "+path,error);}
        artwork.put(id,result);return result;
    }

    private ImageView crystal() {
        ImageView view = new ImageView(getContext());
        view.setImageResource(R.drawable.reward_crystal);
        view.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        return view;
    }

    private Button compactAction(String label, boolean primary, int size) {
        Button button = action(getContext(), face, label, primary);
        button.setTextSize(size);
        button.setPadding(dp(3), 0, dp(3), 0);
        button.setBackground(compactBackground(primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL));
        return button;
    }

    private RippleDrawable compactBackground(int fill) {
        return new RippleDrawable(ColorStateList.valueOf(fill == TowersTheme.PRIMARY ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(getContext(), fill, 5), 0, dp(3), 0, dp(3)), null);
    }

    private void styleTab(Button button, boolean selected) {
        button.setBackground(compactBackground(selected ? TowersTheme.PRIMARY : 0x00000000));
        button.setTextColor(TowersTheme.buttonText(selected));
        button.setSelected(selected);
    }

    private static Map<String, Integer> normalized(Map<String, Integer> source) {
        Map<String, Integer> result = new LinkedHashMap<>();
        if (source != null) for (RewardCatalog.Item item : RewardCatalog.list()) if (source.containsKey(item.id)) {
            Integer count = source.get(item.id); result.put(item.id, Math.max(0, count == null ? 0 : count));
        }
        return result;
    }
    private static int count(Map<String, Integer> values, String id) { return values.getOrDefault(id, 0); }

    @Override protected void onMeasure(int width, int height) {
        int available = MeasureSpec.getSize(width);
        int drawerWidth = Math.max(0, Math.min(available - dp(16),
                Math.min(dp(420), Math.max(dp(330), Math.round(available * .38f)))));
        LayoutParams params = (LayoutParams) drawer.getLayoutParams();
        if (params.width != drawerWidth) { params.width = drawerWidth; drawer.setLayoutParams(params); }
        super.onMeasure(width, height);
    }

    private TextView copy(String value, int size, int colour) {
        TextView text = new TextView(getContext());
        text.setText(value); text.setTextSize(size); text.setTextColor(colour); text.setIncludeFontPadding(false);
        return text;
    }

    // Shared helpers retain their existing dimensions for receipt/saved-game views.
    static Button action(Context context, Typeface face, String value, boolean primary) {
        Button button = new Button(context);
        button.setBackgroundTintList(null);
        button.setText(value); button.setTextColor(TowersTheme.buttonText(primary)); button.setTypeface(face);
        button.setTextSize(primary ? 16 : 13); button.setAllCaps(false); button.setSingleLine(true);
        button.setEllipsize(TextUtils.TruncateAt.END); button.setIncludeFontPadding(false);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(0); button.setMinimumHeight(0);
        button.setBackground(buttonBackground(context, primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL));
        button.setPadding(dip(context, 6), 0, dip(context, 6), 0);
        return button;
    }
    private static RippleDrawable buttonBackground(Context context, int fill) {
        return new RippleDrawable(ColorStateList.valueOf(fill == TowersTheme.PRIMARY ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(context, fill, 6), 0, dip(context, 8), 0, dip(context, 8)), null);
    }
    static GradientDrawable surface(Context context, int fill, int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(fill); background.setCornerRadius(dip(context, radius)); return background;
    }
    private int dp(int value) { return dip(getContext(), value); }
    private static int dip(Context context, int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
