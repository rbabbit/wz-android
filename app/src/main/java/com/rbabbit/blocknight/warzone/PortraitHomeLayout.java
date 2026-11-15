package com.rbabbit.blocknight.warzone;

/** Portrait Home bounds from actual native text measurements; compact screens scroll. */
final class PortraitHomeLayout {
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
        final Box logo, tagline, hero, guide, hub, version, status;
        final Box[] cards;
        final int contentHeight, artHeight, captionHeight, columns;
        Result(Box logo, Box tagline, Box hero, Box[] cards, Box guide, Box hub,
                Box version, Box status, int contentHeight, int artHeight, int captionHeight, int columns) {
            this.logo = logo; this.tagline = tagline; this.hero = hero; this.cards = cards;
            this.guide = guide; this.hub = hub; this.version = version; this.status = status;
            this.contentHeight = contentHeight; this.artHeight = artHeight;
            this.captionHeight = captionHeight; this.columns = columns;
        }
    }
    static int edge(int width, float density) {
        return Math.min(dp(20, density), Math.max(dp(12, density), Math.round(width * .038f)));
    }
    static Result measure(int width, int viewportHeight, float density, int taglineHeight,
            int titleGlyphHeight, int subtitleGlyphHeight, int minimumCardWidth,
            int auxiliaryFontHeight, int versionWidth, int versionHeight, int statusHeight) {
        if (width <= 0 || viewportHeight < 0 || density <= 0 || !Float.isFinite(density))
            throw new IllegalArgumentException("Home needs valid viewport dimensions");
        int edge = edge(width, density), available = Math.max(1, width - edge * 2);
        int gap = dp(12, density);
        int columns = (available - gap) / 2 >= minimumCardWidth ? 2 : 1;
        int cardWidth = columns == 2 ? (available - gap) / 2 : available;
        int artHeight = Math.round(cardWidth * 930f / 1691f);
        int captionHeight = dp(17, density) + Math.max(0, titleGlyphHeight) + Math.max(0, subtitleGlyphHeight);
        int cardHeight = Math.max(dp(48, density), artHeight + captionHeight);
        int rows = 4 / columns, gridHeight = rows * cardHeight + (rows - 1) * gap;
        int auxiliaryHeight = Math.max(dp(48, density), auxiliaryFontHeight + dp(12, density));
        int logoWidth = Math.min(Math.round(width * .56f), dp(270, density));
        int logoHeight = Math.round(logoWidth * 228f / 483f);
        int top = Math.min(dp(32, density), Math.max(dp(16, density), Math.round(viewportHeight * .036f)));
        int beforeHero = top + logoHeight + dp(6, density) + taglineHeight + dp(6, density);
        int afterHero = dp(4, density) + gridHeight + dp(14, density) + auxiliaryHeight
                + dp(12, density) + versionHeight + dp(12, density)
                + (statusHeight > 0 ? statusHeight + dp(8, density) : 0);
        int idealHero = Math.round(width * 2f / 3f);
        int minimumHero = Math.min(idealHero, Math.max(dp(150, density), Math.round(width * .42f)));
        int heroHeight = Math.max(minimumHero, Math.min(idealHero, viewportHeight - beforeHero - afterHero));
        Box logo = new Box((width - logoWidth) / 2, top, logoWidth, logoHeight);
        Box tagline = new Box(edge, logo.bottom() + dp(6, density), available, taglineHeight);
        Box hero = new Box(0, tagline.bottom() + dp(6, density), width, heroHeight);
        Box[] cards = new Box[4];
        int gridTop = hero.bottom() + dp(4, density);
        for (int i = 0; i < cards.length; i++) cards[i] = new Box(edge + (i % columns) * (cardWidth + gap),
                gridTop + (i / columns) * (cardHeight + gap), cardWidth, cardHeight);
        int auxiliaryTop = gridTop + gridHeight + dp(14, density);
        int auxiliaryWidth = (available - gap) / 2;
        Box guide = new Box(edge, auxiliaryTop, auxiliaryWidth, auxiliaryHeight);
        Box hub = new Box(edge + auxiliaryWidth + gap, auxiliaryTop, auxiliaryWidth, auxiliaryHeight);
        int naturalHeight = beforeHero + heroHeight + afterHero;
        int contentHeight = Math.max(viewportHeight, naturalHeight);
        Box version = new Box(width - edge - Math.min(available, versionWidth),
                contentHeight - dp(12, density) - versionHeight, Math.min(available, versionWidth), versionHeight);
        Box status = new Box(edge, guide.bottom() + dp(8, density), available, statusHeight);
        return new Result(logo, tagline, hero, cards, guide, hub, version, status,
                contentHeight, artHeight, captionHeight, columns);
    }
    private static int dp(int value, float density) { return Math.round(value * density); }
    private PortraitHomeLayout() { }
}
