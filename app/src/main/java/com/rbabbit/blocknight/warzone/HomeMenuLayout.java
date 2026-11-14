package com.rbabbit.blocknight.warzone;

/** Home artwork and touch bounds, using label sizes measured by the real views. */
final class HomeMenuLayout {
    private static final float LOGO_ASPECT = 483f / 228f;
    private static final float TANK_ASPECT = 1619f / 971f;
    private static final int[] MOCK_WIDTHS = {168, 152, 108, 196, 116, 104};

    static final class Box {
        final int left, top, width, height;
        Box(int left, int top, int width, int height) {
            this.left = left; this.top = top;
            this.width = Math.max(0, width); this.height = Math.max(0, height);
        }
        int right() { return left + width; }
        int bottom() { return top + height; }
    }

    static final class Result {
        final Box logo, tank;
        final Box[] buttons;
        final int contentLeft, contentRight, footerBottom, rows;
        Result(Box logo, Box tank, Box[] buttons, int left, int right, int footerBottom, int rows) {
            this.logo = logo; this.tank = tank; this.buttons = buttons;
            this.contentLeft = left; this.contentRight = right;
            this.footerBottom = footerBottom; this.rows = rows;
        }
    }

    static Result measure(int width, int height, float density, int insetLeft, int insetTop,
            int insetRight, int insetBottom, int[] labelWidths, int fontHeight, int footerHeight) {
        int count = labelWidths.length;
        if (count < 5 || count > 6 || density <= 0 || !Float.isFinite(density))
            throw new IllegalArgumentException("Home needs five or six measured labels and a valid density");
        int safeLeft = Math.max(0, insetLeft), safeTop = Math.max(0, insetTop);
        int safeWidth = Math.max(0, width - safeLeft - Math.max(0, insetRight));
        int safeHeight = Math.max(0, height - safeTop - Math.max(0, insetBottom));
        int edgeX = Math.min(dp(48, density), Math.max(dp(16, density), Math.round(safeWidth * .04f)));
        int edgeY = Math.min(dp(20, density), Math.max(dp(10, density), Math.round(safeHeight * .035f)));
        int left = safeLeft + edgeX, right = Math.max(left, safeLeft + safeWidth - edgeX);
        int top = safeTop + edgeY, footerBottom = safeTop + safeHeight - edgeY;
        int available = right - left;
        int gap = Math.max(dp(6, density), Math.min(dp(12, density), Math.round(safeWidth * .01f)));
        int guideGap = Math.max(dp(8, density), Math.min(dp(24, density), Math.round(safeWidth * .02f)));
        int buttonHeight = Math.max(dp(48, density), fontHeight + dp(22, density));
        int[] minimum = new int[count], preferred = new int[count];
        int minimumTotal = gap * (count - 1) + guideGap;
        for (int index = 0; index < count; index++) {
            minimum[index] = Math.max(dp(48, density), labelWidths[index] + dp(20, density));
            preferred[index] = Math.max(minimum[index], Math.round(safeWidth * MOCK_WIDTHS[index] / 1200f));
            minimumTotal += minimum[index];
        }
        if (minimumTotal > available) {
            int compactGap = dp(6, density), compactGuideGap = dp(8, density);
            minimumTotal -= (gap - compactGap) * (count - 1) + guideGap - compactGuideGap;
            gap = compactGap; guideGap = compactGuideGap;
        }
        // Keep readable system-scaled text. A second row is preferable to
        // shrinking labels or hiding Guide on an unusually narrow/font-large view.
        boolean wrapped = minimumTotal > available;
        int rows = wrapped ? 2 : 1;
        int rowsHeight = rows * buttonHeight + (wrapped ? gap : 0);
        int desiredTop = safeTop + Math.round(safeHeight * (424f / 540f)) - dp(8, density);
        int rowTop = Math.max(top, Math.min(desiredTop,
                footerBottom - Math.max(0, footerHeight) - dp(8, density) - rowsHeight));
        Box[] buttons = new Box[count];
        if (wrapped) {
            row(buttons, new int[]{0, 1, 2}, minimum, preferred, left, available,
                    rowTop, buttonHeight, gap, guideGap);
            row(buttons, count == 6 ? new int[]{3, 4, 5} : new int[]{3, 4}, minimum, preferred, left, available,
                    rowTop + buttonHeight + gap, buttonHeight, gap, guideGap);
        } else row(buttons, count == 6 ? new int[]{0, 1, 2, 3, 4, 5} : new int[]{0, 1, 2, 3, 4}, minimum, preferred, left, available,
                rowTop, buttonHeight, gap, guideGap);

        int stageBottom = Math.max(top, rowTop - dp(16, density));
        int stageHeight = stageBottom - top;
        int logoWidth = Math.max(0, Math.min(Math.round(safeWidth * (296f / 1200f)),
                Math.round(stageHeight * LOGO_ASPECT)));
        int logoHeight = Math.round(logoWidth / LOGO_ASPECT);
        int logoLeft = Math.max(left, safeLeft + Math.round(safeWidth * (129f / 1200f)));
        int logoTop = Math.max(top, Math.min(safeTop + Math.round(safeHeight * (139f / 540f)), stageBottom - logoHeight));
        Box logo = new Box(logoLeft, logoTop, Math.min(logoWidth, right - logoLeft), logoHeight);
        int tankLeft = Math.max(safeLeft + Math.round(safeWidth * (613f / 1200f)), logo.right() + dp(24, density));
        int tankWidth = Math.max(0, Math.min(Math.round(safeWidth * (514f / 1200f)),
                Math.min(right - tankLeft, Math.round(stageHeight * TANK_ASPECT))));
        int tankHeight = Math.round(tankWidth / TANK_ASPECT);
        int tankTop = Math.max(top, Math.min(safeTop + Math.round(safeHeight * (82f / 540f)), stageBottom - tankHeight));
        return new Result(logo, new Box(tankLeft, tankTop, tankWidth, tankHeight), buttons,
                left, right, footerBottom, rows);
    }

    private static void row(Box[] boxes, int[] indices, int[] minimum, int[] preferred,
            int left, int available, int top, int height, int gap, int guideGap) {
        int spaces = gap * (indices.length - 1), base = 0, extra = 0;
        for (int i = 1; i < indices.length; i++) if (indices[i] == 4) spaces += guideGap;
        for (int index : indices) { base += minimum[index]; extra += preferred[index] - minimum[index]; }
        float fraction = extra == 0 ? 0 : Math.max(0f, Math.min(1f, (available - spaces - base) / (float) extra));
        int[] widths = new int[indices.length]; int total = spaces;
        for (int i = 0; i < indices.length; i++) {
            int index = indices[i]; widths[i] = minimum[index] + (int) ((preferred[index] - minimum[index]) * fraction);
            total += widths[i];
        }
        int x = left + Math.max(0, (available - total) / 2);
        for (int i = 0; i < indices.length; i++) {
            int index = indices[i];
            if (i > 0) x += gap + (index == 4 ? guideGap : 0);
            boxes[index] = new Box(x, top, widths[i], height); x += widths[i];
        }
    }

    private static int dp(int value, float density) { return Math.round(value * density); }
    private HomeMenuLayout() { }
}
