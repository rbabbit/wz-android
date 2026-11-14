package com.rbabbit.blocknight.warzone;

/** Shared monochrome chrome; original game artwork retains its own colours. */
final class TowersTheme {
    static final int BACKGROUND = 0xFF0C0C0C;
    static final int PANEL = 0xFF111111;
    static final int CONTROL = 0xFF252525;
    static final int CARD_SELECTED = 0xFF1C1C1C;
    static final int PRIMARY = 0xFFF4F4F4;
    static final int TEXT = 0xFFF4F4F4;
    static final int SECONDARY = 0xFFBCBCBC;
    static final int DISABLED = 0xFF888888;
    static final int ON_PRIMARY = 0xFF101010;
    static final int RIPPLE = 0x22FFFFFF;
    static final int PRIMARY_RIPPLE = 0x22101010;

    static android.content.res.ColorStateList buttonText(boolean primary) {
        return controlText(primary, TEXT);
    }

    static android.content.res.ColorStateList controlText(boolean primary, int normalInk) {
        return new android.content.res.ColorStateList(new int[][] {
                new int[] {-android.R.attr.state_enabled},
                new int[] {android.R.attr.state_pressed},
                new int[] {android.R.attr.state_selected},
                new int[] {android.R.attr.state_checked},
                new int[] { }
        }, new int[] {primary ? 0xFF505050 : DISABLED, TEXT, ON_PRIMARY, ON_PRIMARY,
                primary ? ON_PRIMARY : normalInk});
    }

    static android.graphics.drawable.Drawable control(android.content.Context context, int fill, int radiusDp) {
        return new TowersControlDrawable(context, fill, radiusDp);
    }

    private TowersTheme() { }
}
