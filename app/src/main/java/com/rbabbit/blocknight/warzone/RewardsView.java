package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
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
        void watchAd();
        void adPrivacy();
        void close();
    }

    private static final int INK = 0xFFF0F3ED, MUTED = 0xFFA6B9BE, TEAL = 0xFF8BD3CC;
    private static final String[] CATEGORIES = {"Fortresses", "Defences", "Artillery", "Support"};
    private final Actions actions;
    private final boolean inGame;
    private final Typeface face;
    private final LinearLayout drawer, rows, bulk;
    private final ScrollView scroll;
    private final TextView wallet, selectedLabel, quantityLabel, hint, error;
    private final Button shop, next, minus, plus, confirm;
    private final Button watchAd, adPrivacy;
    private final TextView adStatus;
    private boolean adEnabled, adBusy;
    private int adStatusGeneration;
    private final Map<String, Button> categories = new LinkedHashMap<>();
    private final Map<String, Bitmap> artwork = new LinkedHashMap<>();
    private final Map<String, Integer> inventory = new LinkedHashMap<>(), loadout = new LinkedHashMap<>();
    private String category = "Fortresses", selectedId = "fortress";
    private int balance, quantity = 1;
    private boolean nextMatch, busy, initialized, resetScroll;

    RewardsView(Context context, String mapId, String mapName, int balance,
            Map<String, Integer> inventory, Map<String, Integer> loadout, boolean inGame, Actions actions) {
        super(context);
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
        drawer.setPadding(dp(10), dp(4), dp(10), dp(6));
        drawer.setBackground(surface(context, 0xFF0C1E26, 0));
        drawer.setClickable(true);
        drawer.setOnClickListener(v -> { });
        addView(drawer, new LayoutParams(dp(350), -1, Gravity.END));

        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = copy("REWARDS", 18, INK);
        title.setTypeface(face);
        title.setSingleLine(true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(crystal(), new LinearLayout.LayoutParams(dp(18), dp(18)));
        wallet = copy("", 17, TEAL);
        wallet.setTypeface(face);
        wallet.setSingleLine(true);
        wallet.setMaxWidth(dp(108));
        wallet.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams walletParams = new LinearLayout.LayoutParams(-2, -2);
        walletParams.leftMargin = dp(5);
        header.addView(wallet, walletParams);
        drawer.addView(header, new LinearLayout.LayoutParams(-1, dp(40)));

        LinearLayout adRow = new LinearLayout(context);
        adRow.setGravity(Gravity.CENTER_VERTICAL);
        watchAd = compactAction("Gain 10 Crystals", false, 13);
        watchAd.setGravity(Gravity.CENTER);
        watchAd.setTextColor(INK);
        watchAd.setBackground(new RippleDrawable(ColorStateList.valueOf(0x448BD3CC), surface(context, 0xFF225752, 5), null));
        android.graphics.drawable.Drawable play = context.getDrawable(android.R.drawable.ic_media_play).mutate();
        play.setTint(TEAL); play.setBounds(0, 0, dp(12), dp(12));
        watchAd.setCompoundDrawables(play, null, null, null);
        watchAd.setCompoundDrawablePadding(dp(5));
        watchAd.setContentDescription("Watch an optional ad to earn 10 crystals");
        watchAd.setOnClickListener(v -> { if (!busy && !adBusy) actions.watchAd(); });
        adRow.addView(watchAd, new LinearLayout.LayoutParams(dp(150), dp(36)));
        TextView adDescription = copy("Watch an ad", 10, MUTED);
        adDescription.setPadding(dp(8), 0, dp(2), 0);
        adRow.addView(adDescription, new LinearLayout.LayoutParams(0, -2, 1));
        adPrivacy = compactAction("Privacy", false, 11);
        adPrivacy.setTextColor(MUTED);
        adPrivacy.setBackground(new RippleDrawable(ColorStateList.valueOf(0x228BD3CC), null, null));
        adPrivacy.setContentDescription("Change ad privacy choices");
        adPrivacy.setOnClickListener(v -> actions.adPrivacy());
        LinearLayout.LayoutParams privacyParams = new LinearLayout.LayoutParams(-2, dp(40));
        privacyParams.leftMargin = dp(5);
        adRow.addView(adPrivacy, privacyParams);
        adStatus = copy("", 10, MUTED);
        adStatus.setMaxLines(2);
        adStatus.setEllipsize(TextUtils.TruncateAt.END);
        adStatus.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        adStatus.setVisibility(GONE);

        LinearLayout modes = new LinearLayout(context);
        shop = compactAction("SHOP", false, 12);
        next = compactAction(inGame ? "THIS MATCH" : "NEXT MATCH", false, 12);
        modes.addView(shop, new LinearLayout.LayoutParams(0, dp(36), 1));
        LinearLayout.LayoutParams nextParams = new LinearLayout.LayoutParams(0, dp(36), 1);
        nextParams.leftMargin = dp(5);
        modes.addView(next, nextParams);
        shop.setOnClickListener(v -> setMode(false));
        next.setOnClickListener(v -> setMode(true));
        drawer.addView(modes, new LinearLayout.LayoutParams(-1, dp(36)));

        LinearLayout tabs = new LinearLayout(context);
        for (String name : CATEGORIES) {
            Button tab = compactAction(name, false, 11);
            tab.setContentDescription("Rewards category " + name);
            tab.setOnClickListener(v -> setCategory(name));
            categories.put(name, tab);
            tabs.addView(tab, new LinearLayout.LayoutParams(0, dp(36), 1));
        }
        drawer.addView(tabs, new LinearLayout.LayoutParams(-1, dp(36)));

        scroll = new ScrollView(context);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        rows = new LinearLayout(context);
        rows.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(rows, new ScrollView.LayoutParams(-1, -2));
        drawer.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout footer = new LinearLayout(context);
        footer.setOrientation(LinearLayout.VERTICAL);
        footer.setPadding(0, dp(4), 0, 0);
        selectedLabel = copy("", 12, INK);
        selectedLabel.setTypeface(face);
        selectedLabel.setSingleLine(true);
        selectedLabel.setEllipsize(TextUtils.TruncateAt.END);
        footer.addView(selectedLabel, new LinearLayout.LayoutParams(-1, -2));
        bulk = new LinearLayout(context);
        footer.addView(bulk, new LinearLayout.LayoutParams(-1, dp(32)));

        LinearLayout controls = new LinearLayout(context);
        controls.setGravity(Gravity.CENTER_VERTICAL);
        minus = compactAction("−", false, 19);
        minus.setContentDescription("Decrease reward quantity by one");
        minus.setOnClickListener(v -> changeQuantity(quantity - 1));
        controls.addView(minus, new LinearLayout.LayoutParams(dp(36), dp(40)));
        quantityLabel = copy("1", 15, INK);
        quantityLabel.setTypeface(face);
        quantityLabel.setGravity(Gravity.CENTER);
        controls.addView(quantityLabel, new LinearLayout.LayoutParams(dp(32), dp(40)));
        plus = compactAction("+", false, 19);
        plus.setContentDescription("Increase reward quantity by one");
        plus.setOnClickListener(v -> changeQuantity(quantity + 1));
        controls.addView(plus, new LinearLayout.LayoutParams(dp(36), dp(40)));
        confirm = compactAction("BUY", true, 13);
        confirm.setOnClickListener(v -> commit());
        LinearLayout.LayoutParams confirmParams = new LinearLayout.LayoutParams(0, dp(40), 1);
        confirmParams.leftMargin = dp(8);
        controls.addView(confirm, confirmParams);
        footer.addView(controls, new LinearLayout.LayoutParams(-1, dp(40)));
        hint = copy("", 10, MUTED);
        hint.setMaxLines(2);
        footer.addView(hint, new LinearLayout.LayoutParams(-1, -2));
        error = copy("", 11, 0xFFFFB6A5);
        error.setMaxLines(3);
        error.setVisibility(GONE);
        error.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        footer.addView(error, new LinearLayout.LayoutParams(-1, -2));
        drawer.addView(footer, new LinearLayout.LayoutParams(-1, -2));
        // Keep the optional ad secondary to the shop's normal controls.
        drawer.addView(adRow, new LinearLayout.LayoutParams(-1, dp(40)));
        drawer.addView(adStatus, new LinearLayout.LayoutParams(-1, -2));
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
        ensureSelection();
        quantity = nextMatch ? count(this.loadout, selectedId)
                : Math.max(1, Math.min(quantity, Math.max(1, maxQuantity(item()))));
        render();
    }

    /** Native progress never releases a pending purchase; its callback does. */
    void completeMutation(int balance, Map<String, Integer> inventory, Map<String, Integer> loadout) {
        busy = false;
        error.setVisibility(GONE);
        refresh(balance, inventory, loadout);
        render(); // Also unlocks an acknowledged operation whose counts stayed equal.
    }

    void showError(String message) {
        busy = false;
        error.setText(message);
        error.setVisibility(VISIBLE);
        render();
    }

    void setAdState(boolean enabled, boolean busy, boolean privacyRequired, String status, boolean testAds) {
        boolean wasBusy = adBusy;
        adEnabled = enabled;
        adBusy = busy;
        watchAd.setText(adBusy ? "Please wait…" : "Gain 10 Crystals");
        boolean quiet = status == null || status.isEmpty() || "Optional ad · 10 crystals".equals(status)
                || "Ads are optional.".equals(status)
                || status.startsWith("Ready ·") || "Checking ad privacy settings…".equals(status) && !busy;
        String shown = quiet ? "" : status;
        if (!shown.contentEquals(adStatus.getText())
                || wasBusy && !adBusy && shown.startsWith("+10 crystals")) {
            int generation = ++adStatusGeneration;
            adStatus.setText(shown);
            adStatus.setVisibility(shown.isEmpty() ? GONE : VISIBLE);
            if (!adBusy && shown.startsWith("+10 crystals")) postDelayed(() -> {
                if (generation == adStatusGeneration && !adBusy) adStatus.setVisibility(GONE);
            }, 3000);
        }
        adPrivacy.setVisibility(privacyRequired ? VISIBLE : GONE);
        updateAdControls();
    }

    private void updateAdControls() {
        watchAd.setEnabled(adEnabled && !busy && !adBusy);
        watchAd.setAlpha(watchAd.isEnabled() ? 1f : .55f);
        adPrivacy.setEnabled(!busy && !adBusy);
    }

    private void setMode(boolean value) {
        if (busy) return;
        nextMatch = value;
        error.setVisibility(GONE);
        if (nextMatch) choosePopulatedCategory();
        ensureSelection();
        quantity = nextMatch ? count(loadout, selectedId) : 1;
        resetScroll = true;
        render();
    }

    private void setCategory(String value) {
        if (busy || category.equals(value)) return;
        category = value;
        selectedId = "";
        ensureSelection();
        quantity = nextMatch ? count(loadout, selectedId) : 1;
        error.setVisibility(GONE);
        resetScroll = true;
        render();
    }

    private void changeQuantity(int value) {
        if (busy || selectedId.isEmpty() || inGame && nextMatch) return;
        quantity = Math.max(nextMatch ? 0 : 1, Math.min(value, maxQuantity(item())));
        error.setVisibility(GONE);
        render();
    }

    private void commit() {
        if (inGame && nextMatch) { actions.close(); return; }
        if (busy || selectedId.isEmpty() || quantity < 0 || quantity > maxQuantity(item())) return;
        if (nextMatch && quantity == count(loadout, selectedId)) return;
        long total = (long) item().price * quantity;
        if (!nextMatch && (quantity < 1 || total > balance)) return;
        busy = true;
        error.setVisibility(GONE);
        render();
        if (nextMatch) actions.equip(selectedId, quantity);
        else actions.buy(selectedId, quantity);
    }

    private RewardCatalog.Item item() { return RewardCatalog.get(selectedId.isEmpty() ? "fortress" : selectedId); }
    private int maxQuantity(RewardCatalog.Item item) {
        if (inGame && nextMatch) return count(loadout, item.id);
        if (inGame) {
            if (item.fortress) return 3;
            if ("laser_sat".equals(item.id) || item.nativeId.isEmpty()) return 1;
            return 999;
        }
        int available = nextMatch ? count(inventory, item.id) : Math.max(0, 999 - count(inventory, item.id));
        if (item.fortress) {
            int other = 0;
            for (RewardCatalog.Item entry : RewardCatalog.list()) if (entry.fortress
                    && (!nextMatch || !entry.id.equals(item.id))) other += count(nextMatch ? loadout : inventory, entry.id);
            available = Math.min(available, Math.max(0, 3 - other));
        }
        if ("laser_sat".equals(item.id)) available = Math.min(available, nextMatch ? 1 : Math.max(0, 1 - count(inventory, item.id)));
        if (nextMatch) available = Math.min(available, item.maxPerMatch);
        return available;
    }

    private List<RewardCatalog.Item> visibleItems() {
        List<RewardCatalog.Item> values = new ArrayList<>();
        for (RewardCatalog.Item item : RewardCatalog.list()) if (category.equals(item.category)
                && (inGame && nextMatch ? loadout.containsKey(item.id)
                    : !nextMatch || count(inventory, item.id) > 0 || count(loadout, item.id) > 0)) values.add(item);
        return values;
    }

    private void choosePopulatedCategory() {
        if (!visibleItems().isEmpty()) return;
        for (String name : CATEGORIES) { category = name; if (!visibleItems().isEmpty()) return; }
        category = "Fortresses";
    }

    private void ensureSelection() {
        List<RewardCatalog.Item> values = visibleItems();
        for (RewardCatalog.Item entry : values) if (entry.id.equals(selectedId)) return;
        selectedId = values.isEmpty() ? "" : values.get(0).id;
    }

    private void render() {
        updateAdControls();
        wallet.setText(Integer.toString(balance));
        wallet.setContentDescription(balance + " crystals");
        styleTab(shop, !nextMatch); styleTab(next, nextMatch);
        shop.setEnabled(!busy); next.setEnabled(!busy);
        for (Map.Entry<String, Button> tab : categories.entrySet()) {
            styleTab(tab.getValue(), category.equals(tab.getKey()));
            tab.getValue().setEnabled(!busy);
        }
        int oldScroll = resetScroll ? 0 : scroll.getScrollY();
        resetScroll = false;
        rows.removeAllViews();
        List<RewardCatalog.Item> visible = visibleItems();
        for (RewardCatalog.Item entry : visible) addItemRow(entry);
        if (visible.isEmpty()) {
            TextView empty = copy(inGame && nextMatch ? "No active rewards in this category."
                    : "No stored items here. Buy in Shop, then choose what to take.", 12, MUTED);
            empty.setPadding(dp(6), dp(16), dp(6), dp(16));
            rows.addView(empty, new LinearLayout.LayoutParams(-1, -2));
        }
        scroll.post(() -> scroll.scrollTo(0, oldScroll));

        boolean selected = !selectedId.isEmpty(), readOnly = inGame && nextMatch;
        RewardCatalog.Item current = item();
        selectedLabel.setText(readOnly ? "Active / remaining this match" : selected ? current.name : "Choose an item");
        for (View view : new View[] {minus, quantityLabel, plus}) view.setVisibility(readOnly ? GONE : VISIBLE);
        quantityLabel.setText(Integer.toString(quantity));
        quantityLabel.setContentDescription("Reward quantity " + quantity);
        minus.setEnabled(selected && !busy && quantity > (nextMatch ? 0 : 1));
        plus.setEnabled(selected && !busy && quantity < maxQuantity(current));
        minus.setAlpha(minus.isEnabled() ? 1f : .4f); plus.setAlpha(plus.isEnabled() ? 1f : .4f);
        renderBulk(current, selected, readOnly);
        long total = (long) current.price * quantity;
        boolean can = selected && !busy && quantity >= (nextMatch ? 0 : 1) && quantity <= maxQuantity(current)
                && (nextMatch ? quantity != count(loadout, selectedId) : total <= balance);
        confirm.setText(readOnly ? "RETURN TO GAME" : busy ? "SAVING…" : nextMatch
                ? quantity == 0 ? "LEAVE STORED" : "TAKE " + quantity
                : "BUY · " + total);
        confirm.setEnabled(readOnly || can);
        confirm.setAlpha(confirm.isEnabled() ? 1f : .45f);
        confirm.setContentDescription(readOnly ? "Close rewards and return to game" : nextMatch
                ? "Take " + quantity + " " + current.name + " into the next match"
                : "Buy " + quantity + " " + current.name + " for " + total + " crystals");
        hint.setText(readOnly ? "Purchases and building allowances for this match."
                : !selected ? "Choose a category and an item."
                : selected && maxQuantity(current) == 0 ? current.fortress ? "Maximum 3 fortresses already stored."
                : "Maximum stock for this item already stored."
                : total > balance && !nextMatch ? "Not enough crystals. Your stock stays saved."
                : nextMatch ? "Unused buildings return to storage. Zero leaves this item stored."
                : current.nativeId.isEmpty() ? current.description
                : current.fortress ? "Maximum 3 fortresses · Normal building power applies."
                : inGame ? "Bought for this match · Normal building power applies."
                : "Stock for any map · Normal building power applies.");
    }

    private void addItemRow(RewardCatalog.Item entry) {
        boolean chosen = entry.id.equals(selectedId);
        LinearLayout row = new LinearLayout(getContext());
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(4), dp(4), dp(4), dp(4));
        row.setMinimumHeight(dp(52));
        row.setBackground(new RippleDrawable(ColorStateList.valueOf(0x228BD3CC),
                surface(getContext(), chosen ? 0xFF183A3F : 0x00000000, 5), null));
        row.setClickable(true); row.setFocusable(true); row.setEnabled(!busy); row.setSelected(chosen);
        ImageView check = new ImageView(getContext());
        check.setImageResource(android.R.drawable.checkbox_on_background);
        // Preserve the native two-tone checked glyph; a single tint fills its box.
        check.setVisibility(chosen ? VISIBLE : INVISIBLE);
        check.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        row.addView(check, new LinearLayout.LayoutParams(dp(12), dp(16)));
        ImageView image = new ImageView(getContext());
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        Bitmap bitmap = image(entry.id);
        if (bitmap != null) {
            BitmapDrawable drawable = new BitmapDrawable(getResources(), bitmap);
            drawable.setFilterBitmap(false);
            image.setImageDrawable(drawable);
        }
        LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(dp(56), dp(43));
        imageParams.leftMargin = dp(3); imageParams.rightMargin = dp(8);
        row.addView(image, imageParams);
        LinearLayout labels = new LinearLayout(getContext());
        labels.setOrientation(LinearLayout.VERTICAL);
        TextView name = copy(entry.name, 14, INK);
        name.setTypeface(face); name.setMaxLines(2); name.setEllipsize(TextUtils.TruncateAt.END);
        labels.addView(name, new LinearLayout.LayoutParams(-1, -2));
        String text = inGame ? entry.nativeId.isEmpty()
                ? loadout.containsKey(entry.id) ? "Applied this match" : "Not applied"
                : "This match " + count(loadout, entry.id)
                : "Stored " + count(inventory, entry.id) + (nextMatch ? " · Take " + count(loadout, entry.id) : "");
        TextView counts = copy(text, 10, TEAL);
        counts.setPadding(0, dp(2), 0, 0);
        labels.addView(counts, new LinearLayout.LayoutParams(-1, -2));
        row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
        if (!nextMatch) {
            LinearLayout price = new LinearLayout(getContext());
            price.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
            price.addView(crystal(), new LinearLayout.LayoutParams(dp(11), dp(13)));
            TextView amount = copy(Integer.toString(entry.price), 13, TEAL);
            amount.setTypeface(face);
            amount.setPadding(dp(3), 0, 0, 0);
            price.addView(amount, new LinearLayout.LayoutParams(-2, -2));
            LinearLayout.LayoutParams priceParams = new LinearLayout.LayoutParams(dp(40), -2);
            priceParams.leftMargin = dp(3);
            row.addView(price, priceParams);
        }
        row.setContentDescription("Select " + entry.name + ", " + (inGame ? "remaining " + count(loadout, entry.id)
                : "stored " + count(inventory, entry.id)) + (!nextMatch ? ", " + entry.price + " crystals each" : ""));
        row.setOnClickListener(v -> {
            if (busy) return;
            selectedId = entry.id;
            quantity = nextMatch ? count(loadout, entry.id) : 1;
            error.setVisibility(GONE);
            render();
        });
        rows.addView(row, new LinearLayout.LayoutParams(-1, -2));
    }

    private void renderBulk(RewardCatalog.Item current, boolean selected, boolean readOnly) {
        bulk.removeAllViews();
        boolean visible = selected && !readOnly && !current.fortress && !"laser_sat".equals(current.id)
                && !current.nativeId.isEmpty() && (!nextMatch || current.maxPerMatch > 1);
        bulk.setVisibility(visible ? VISIBLE : GONE);
        if (!visible) return;
        for (int value : new int[] {1, 5, 10, 15, 20, -5}) {
            Button button = compactAction(value == -5 ? "+5" : Integer.toString(value), false, 11);
            styleTab(button, value == quantity);
            int target = value == -5 ? quantity + 5 : value;
            button.setEnabled(!busy && target <= maxQuantity(current));
            button.setAlpha(button.isEnabled() ? 1f : .4f);
            button.setContentDescription(value == -5 ? "Add five to reward quantity" : "Set reward quantity to " + value);
            button.setOnClickListener(v -> changeQuantity(value == -5 ? quantity + 5 : value));
            bulk.addView(button, new LinearLayout.LayoutParams(0, dp(32), 1));
        }
    }

    private Bitmap image(String id) {
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
        button.setBackground(compactBackground(primary ? TEAL : 0xFF14252D));
        return button;
    }

    private RippleDrawable compactBackground(int fill) {
        return new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                new InsetDrawable(surface(getContext(), fill, 5), 0, dp(3), 0, dp(3)), null);
    }

    private void styleTab(Button button, boolean selected) {
        button.setBackground(compactBackground(selected ? 0xFF28574E : 0x00000000));
        button.setTextColor(INK);
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
                Math.min(dp(420), Math.max(dp(330), Math.round(available * .44f)))));
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
        button.setText(value); button.setTextColor(primary ? 0xFF0B151B : INK); button.setTypeface(face);
        button.setTextSize(primary ? 16 : 13); button.setAllCaps(false); button.setSingleLine(true);
        button.setEllipsize(TextUtils.TruncateAt.END); button.setIncludeFontPadding(false);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(0); button.setMinimumHeight(0);
        button.setBackground(buttonBackground(context, primary ? TEAL : 0xFF14252D));
        button.setPadding(dip(context, 6), 0, dip(context, 6), 0);
        return button;
    }
    private static RippleDrawable buttonBackground(Context context, int fill) {
        return new RippleDrawable(ColorStateList.valueOf(0x338BD3CC),
                new InsetDrawable(surface(context, fill, 6), 0, dip(context, 8), 0, dip(context, 8)), null);
    }
    static GradientDrawable surface(Context context, int fill, int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(fill); background.setCornerRadius(dip(context, radius)); return background;
    }
    private int dp(int value) { return dip(getContext(), value); }
    private static int dip(Context context, int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
