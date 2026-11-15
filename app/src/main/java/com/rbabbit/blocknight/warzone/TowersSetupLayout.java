package com.rbabbit.blocknight.warzone;

/** Fixed native Towers picker geometry. Only the right map facts may scroll. */
final class TowersSetupLayout {
    final FfaSetupLayout.Box header, preview, previous, position, next, difficulty, facts, start;

    private TowersSetupLayout(FfaSetupLayout.Box header, FfaSetupLayout.Box preview,
            FfaSetupLayout.Box previous, FfaSetupLayout.Box position, FfaSetupLayout.Box next,
            FfaSetupLayout.Box difficulty, FfaSetupLayout.Box facts, FfaSetupLayout.Box start) {
        this.header=header;this.preview=preview;this.previous=previous;this.position=position;this.next=next;
        this.difficulty=difficulty;this.facts=facts;this.start=start;
    }

    static TowersSetupLayout calculate(int width, int height, float density,
            int insetLeft, int insetTop, int insetRight, int insetBottom, int desiredStartWidth) {
        if(width<=0||height<=0||!Float.isFinite(density)||density<=0)
            throw new IllegalArgumentException("Invalid Towers viewport");
        int left=Math.max(px(16,density),insetLeft),right=width-Math.max(px(16,density),insetRight);
        int top=Math.max(px(8,density),insetTop),bottom=height-Math.max(px(12,density),insetBottom);
        int touch=px(48,density),gap=px(6,density),columnGap=px(width/density>=760?24:16,density);
        FfaSetupLayout.Box header=new FfaSetupLayout.Box(left,top,right,top+touch);
        int bodyTop=header.bottom+gap,settingsWidth=Math.round((right-left)*.56f),settingsLeft=right-settingsWidth;
        int previewLeft=left+px(16,density),previewRight=settingsLeft-columnGap;
        FfaSetupLayout.Box preview=new FfaSetupLayout.Box(previewLeft,bodyTop,previewRight,bottom-touch-gap);
        int browseWidth=touch*2+px(76,density),browseLeft=previewLeft+Math.max(0,(previewRight-previewLeft-browseWidth)/2);
        FfaSetupLayout.Box previous=new FfaSetupLayout.Box(browseLeft,bottom-touch,browseLeft+touch,bottom);
        FfaSetupLayout.Box position=new FfaSetupLayout.Box(previous.right,bottom-touch,previous.right+px(76,density),bottom);
        FfaSetupLayout.Box next=new FfaSetupLayout.Box(position.right,bottom-touch,position.right+touch,bottom);
        int difficultyTop=bodyTop+px(12,density);
        FfaSetupLayout.Box difficulty=new FfaSetupLayout.Box(settingsLeft,difficultyTop,right,difficultyTop+touch);
        int startWidth=Math.min(settingsWidth,Math.max(px(128,density),desiredStartWidth));
        FfaSetupLayout.Box start=new FfaSetupLayout.Box(right-startWidth,bottom-touch,right,bottom);
        FfaSetupLayout.Box facts=new FfaSetupLayout.Box(settingsLeft,difficulty.bottom+px(14,density),right,start.top-gap);
        return new TowersSetupLayout(header,preview,previous,position,next,difficulty,facts,start);
    }

    private static int px(int dp,float density) {return Math.round(dp*density);}
}
