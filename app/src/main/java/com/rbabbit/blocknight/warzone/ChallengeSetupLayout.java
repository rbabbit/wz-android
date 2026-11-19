package com.rbabbit.blocknight.warzone;

/** Pixel geometry for the native Challenge launcher. No Android or game state. */
final class ChallengeSetupLayout {
    static final class Box {
        final int left, top, right, bottom;
        Box(int left, int top, int right, int bottom) {
            this.left = left; this.top = top; this.right = right; this.bottom = bottom;
        }
        int width() { return right - left; }
        int height() { return bottom - top; }
    }

    final Box header, preview, previous, position, next, heading, groups, difficulty, facts, start;
    final boolean compactHeading;

    private ChallengeSetupLayout(Box header, Box preview, Box previous, Box position, Box next,
                           Box heading, Box groups, Box difficulty, Box facts, Box start, boolean compactHeading) {
        this.header=header; this.preview=preview; this.previous=previous; this.position=position; this.next=next;
        this.heading=heading; this.groups=groups; this.difficulty=difficulty; this.facts=facts; this.start=start;
        this.compactHeading=compactHeading;
    }

    static ChallengeSetupLayout calculate(int width, int height, float density,
                                   int insetLeft, int insetTop, int insetRight, int insetBottom,
                                   int headingHeight, int desiredStartWidth) {
        if (width <= 0 || height <= 0 || !Float.isFinite(density) || density <= 0)
            throw new IllegalArgumentException("Invalid Challenge viewport");
        int left=Math.max(px(16,density),insetLeft), right=width-Math.max(px(16,density),insetRight);
        int top=Math.max(px(8,density),insetTop), bottom=height-Math.max(px(12,density),insetBottom);
        int touch=px(48,density), launch=touch, gap=px(6,density);
        Box header=new Box(left,top,right,top+touch);
        int bodyTop=header.bottom+gap, bodyHeight=Math.max(0,bottom-bodyTop);
        int columnGap=px(width/density >= 760 ? 24 : 16,density), available=right-left;
        int settingsWidth=Math.max(px(260,density),Math.round(available*.50f));
        settingsWidth=Math.min(settingsWidth,Math.max(px(176,density),available-columnGap-px(100,density)));
        int settingsLeft=right-settingsWidth, previewRight=settingsLeft-columnGap;
        int previewBottom=bottom-touch-gap;
        int previewLeft=left+px(16,density);
        Box preview=new Box(previewLeft,bodyTop,previewRight,Math.max(bodyTop,previewBottom));
        int browseWidth=touch*2+px(76,density), browseLeft=previewLeft+Math.max(0,(previewRight-previewLeft-browseWidth)/2);
        int browseTop=bottom-touch;
        Box previous=new Box(browseLeft,browseTop,browseLeft+touch,bottom);
        Box position=new Box(previous.right,browseTop,previous.right+px(76,density),bottom);
        Box next=new Box(position.right,browseTop,position.right+touch,bottom);
        boolean compact=headingHeight>bodyHeight-touch-launch-gap*3-px(32,density);
        int fixedHeading=compact?0:Math.max(0,headingHeight);
        Box groups=new Box(settingsLeft,bodyTop,right,bodyTop);
        Box heading=new Box(settingsLeft,bodyTop,right,bodyTop+fixedHeading);
        int difficultyTop=compact?bodyTop:heading.bottom+gap;
        Box difficulty=new Box(settingsLeft,difficultyTop,right,difficultyTop+touch);
        int startWidth=Math.min(settingsWidth,Math.max(px(128,density),desiredStartWidth));
        Box start=new Box(right-startWidth,bottom-launch,right,bottom);
        Box facts=new Box(settingsLeft,difficulty.bottom+gap,right,Math.max(difficulty.bottom+gap,start.top-gap));
        return new ChallengeSetupLayout(header,preview,previous,position,next,heading,groups,difficulty,facts,start,compact);
    }

    /** Content-sized chips retain minimum hit targets, shrinking only to fit a row. */
    static int[] chipWidths(int available, int gap, int minimum, int[] desired) {
        int[] result=new int[desired.length];
        int room=Math.max(0,available-gap*Math.max(0,desired.length-1)), total=0;
        for(int i=0;i<desired.length;i++) { result[i]=Math.max(minimum,desired[i]);total+=result[i]; }
        if(total<=room)return result;
        int extra=Math.max(0,room-minimum*desired.length), wanted=Math.max(1,total-minimum*desired.length), used=0;
        for(int i=0;i<result.length;i++) {
            int add=i==result.length-1?extra-used:(int)((long)(result[i]-minimum)*extra/wanted);
            result[i]=minimum+Math.max(0,add);used+=Math.max(0,add);
        }
        return result;
    }

    /** Contain a real map without cropping or distorting its authored aspect. */
    static Box contain(int areaWidth, int areaHeight, int imageWidth, int imageHeight) {
        if(areaWidth<0||areaHeight<0||imageWidth<=0||imageHeight<=0)throw new IllegalArgumentException("Invalid Challenge preview");
        double scale=Math.min(areaWidth/(double)imageWidth,areaHeight/(double)imageHeight);
        int w=(int)Math.round(imageWidth*scale),h=(int)Math.round(imageHeight*scale);
        int x=(areaWidth-w)/2,y=(areaHeight-h)/2;
        return new Box(x,y,x+w,y+h);
    }

    private static int px(int dp,float density) { return Math.round(dp*density); }
}
