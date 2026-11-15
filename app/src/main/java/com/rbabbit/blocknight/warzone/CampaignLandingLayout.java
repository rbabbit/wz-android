package com.rbabbit.blocknight.warzone;

/** Measured native Campaign landing geometry; long states scroll without hiding Back. */
final class CampaignLandingLayout {
    static final class Box {
        final int left, top, width, height;
        Box(int left, int top, int width, int height) {
            this.left = left; this.top = top;
            this.width = Math.max(0, width); this.height = Math.max(0, height);
        }
        int right() { return left + width; }
        int bottom() { return top + height; }
    }
    static final class Frame {
        final Box back, title, body, artwork;
        Frame(Box back, Box title, Box body, Box artwork) {
            this.back = back; this.title = title; this.body = body; this.artwork = artwork;
        }
    }
    static final class Body {
        final Box detail, status, progress, download, start, saves;
        final int height;
        final boolean wrappedActions;
        Body(Box detail, Box status, Box progress, Box download, Box start,
                Box saves, int height, boolean wrappedActions) {
            this.detail = detail; this.status = status;
            this.progress = progress; this.download = download; this.start = start;
            this.saves = saves; this.height = height; this.wrappedActions = wrappedActions;
        }
    }
    static Frame frame(int width, int height, float density, int backWidth, int titleHeight) {
        int edge = Math.min(dp(32, density), Math.max(dp(20, density), Math.round(width * .038f)));
        int top = dp(12, density), hit = dp(48, density);
        Box back = new Box(edge, top, Math.max(hit, backWidth), hit);
        Box title = new Box(back.right() + dp(24, density), top + Math.max(0, (hit - titleHeight) / 2),
                Math.max(0, width - edge - back.right() - dp(24, density)), titleHeight);
        int bodyTop = Math.max(back.bottom() + dp(16, density), Math.round(height * .25f));
        int bodyWidth = Math.max(1, Math.min(dp(352, density), Math.round((width - 2 * edge) * .47f)));
        Box body = new Box(edge, bodyTop, bodyWidth, Math.max(0, height - edge - bodyTop));
        int artLeft = Math.round(width * .27f);
        return new Frame(back, title, body, new Box(artLeft, 0, Math.max(0, width - artLeft), height));
    }
    static Body body(int width, int viewportHeight, float density,
            int detailHeight, int statusHeight, boolean progressVisible, boolean downloadVisible,
            int downloadWidth, int startWidth, int savesWidth, int fontHeight) {
        int hit = Math.max(dp(48, density), fontHeight + dp(20, density)), gap = dp(12, density);
        Box detail = new Box(0, 0, width, detailHeight);
        Box status = new Box(0, detail.bottom() + dp(20, density), width, statusHeight);
        int cursor = status.bottom();
        Box progress = new Box(0, cursor + dp(8, density), width, progressVisible ? dp(4, density) : 0);
        if (progressVisible) cursor = progress.bottom();
        Box download = new Box(0, cursor + dp(8, density), Math.min(width, downloadWidth), downloadVisible ? hit : 0);
        if (downloadVisible) cursor = download.bottom();
        boolean wrap = startWidth + savesWidth + gap > width;
        int rowsHeight = wrap ? hit * 2 + dp(8, density) : hit;
        int height = Math.max(viewportHeight, cursor + dp(18, density) + rowsHeight);
        int rowTop = height - rowsHeight;
        Box start = new Box(0, rowTop, wrap ? width : startWidth, hit);
        Box saves = new Box(wrap ? 0 : startWidth + gap, wrap ? start.bottom() + dp(8, density) : rowTop,
                wrap ? width : savesWidth, hit);
        return new Body(detail, status, progress, download, start, saves, height, wrap);
    }
    private static int dp(int value, float density) { return Math.round(value * density); }
    private CampaignLandingLayout() { }
}
