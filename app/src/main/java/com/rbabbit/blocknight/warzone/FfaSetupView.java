package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.LruCache;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Native split FFA launcher: original previews, compact controls, fixed Start. */
final class FfaSetupView extends FrameLayout {
    interface Actions {
        void start(String mapId, String difficulty);
        void map(String mapId);
        void saves();
        void back();
        default void challenge() { }
    }

    private final Typeface face;
    private final Actions actions;
    private final FfaMapCatalog catalog;
    private final FfaMapBrowserState browser;
    private final Button easy, medium, hard, back, saves, start, challenge;
    private final Button[] groupButtons = new Button[4];
    private final int[] groupKeys = {2, 3, 4, FfaMapBrowserState.ORIGINALS};
    private final CompactRow groups, choices;
    private final LinearLayout heading, compactHeading;
    private final TextView title, meta, compactTitle, compactMeta, bots, description, position, screenTitle;
    private final ScrollView facts;
    private final BrowseArrow previous, next;
    private final FfaPager maps;
    private String mapId, difficulty;
    private int insetLeft, insetTop, insetRight, insetBottom;

    FfaSetupView(Context context, Actions actions) { this(context, actions, "emag", "Easy"); }
    FfaSetupView(Context context, Actions actions, String selectedDifficulty) { this(context, actions, "emag", selectedDifficulty); }

    FfaSetupView(Context context, Actions actions, String selectedMapId, String selectedDifficulty) {
        super(context);
        this.actions = actions;
        catalog = FfaMapCatalog.get(context);
        mapId = FfaMapCatalog.normalizeId(selectedMapId);
        String[] ids = new String[catalog.maps().size()];
        int[] players = new int[ids.length];
        for (int i = 0; i < ids.length; i++) { ids[i]=catalog.maps().get(i).id;players[i]=catalog.maps().get(i).players; }
        browser = new FfaMapBrowserState(ids, players, mapId);
        face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        setBackgroundColor(TowersTheme.BACKGROUND);
        setClickable(true);

        back = action("BACK", false);back.setContentDescription("Back to game modes");
        saves = action("FFA SAVES", false);saves.setContentDescription("Open FFA saved games on this phone");
        challenge = action("CHALLENGE", false);challenge.setContentDescription("Open single-player Challenge maps");
        start = action("START FFA", true);
        screenTitle=copy("FFA",20,TowersTheme.TEXT);screenTitle.setTypeface(face);
        screenTitle.setGravity(android.view.Gravity.CENTER_VERTICAL);
        groups = new CompactRow(context);
        for (int i = 0; i < groupKeys.length; i++) {
            final int key = groupKeys[i];
            Button button = action(key == FfaMapBrowserState.ORIGINALS ? "Originals" : key + " players", false);
            button.setAutoSizeTextTypeUniformWithConfiguration(10, 13, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
            button.setOnClickListener(v -> selectGroup(key));button.setEnabled(browser.hasGroup(key));
            groupButtons[i]=button;groups.addView(button);
        }
        decorateGroups();
        easy=action("Easy",false);medium=action("Medium",false);hard=action("Hard",false);
        easy.setOnClickListener(v -> selectDifficulty("Easy"));
        medium.setOnClickListener(v -> selectDifficulty("Medium"));
        hard.setOnClickListener(v -> selectDifficulty("Hard"));
        choices=new CompactRow(context);choices.setContentDescription("Cobra bot difficulty");
        choices.addView(easy);choices.addView(medium);choices.addView(hard);
        selectDifficulty(selectedDifficulty);

        title=mapTitle();meta=mapMeta();heading=heading(title,meta);
        compactTitle=mapTitle();compactMeta=mapMeta();compactHeading=heading(compactTitle,compactMeta);
        LinearLayout factsContent=new LinearLayout(context);factsContent.setOrientation(LinearLayout.VERTICAL);
        factsContent.addView(compactHeading,new LinearLayout.LayoutParams(-1,-2));
        bots=copy("",13,TowersTheme.TEXT);description=copy("",12,TowersTheme.SECONDARY);
        LinearLayout.LayoutParams botParams=new LinearLayout.LayoutParams(-1,-2);botParams.topMargin=dp(4);
        factsContent.addView(bots,botParams);
        LinearLayout.LayoutParams descriptionParams=new LinearLayout.LayoutParams(-1,-2);descriptionParams.topMargin=dp(6);
        factsContent.addView(description,descriptionParams);
        facts=new ScrollView(context);facts.setOverScrollMode(OVER_SCROLL_NEVER);facts.setFillViewport(false);
        facts.setContentDescription("Selected FFA map details; scroll for more information when needed");
        facts.addView(factsContent,new ScrollView.LayoutParams(-1,-2));
        position=copy("",14,TowersTheme.SECONDARY);position.setTypeface(face);position.setGravity(android.view.Gravity.CENTER);
        position.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        previous=new BrowseArrow(false);next=new BrowseArrow(true);
        maps=new FfaPager(context);
        back.setOnClickListener(v -> { maps.settleSelection(); actions.back(); });
        saves.setOnClickListener(v -> { maps.settleSelection(); actions.saves(); });
        challenge.setOnClickListener(v -> { maps.settleSelection(); actions.challenge(); });
        start.setOnClickListener(v -> { maps.settleSelection(); actions.start(mapId, difficulty); });
        addView(new LaunchPanel(context),new LayoutParams(-1,-1));
        setOnApplyWindowInsetsListener((view,insets) -> {
            int left=0,top=0,right=0,bottom=0;
            if(Build.VERSION.SDK_INT>=30) {
                android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
            } else {
                left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();
                right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();
                if(Build.VERSION.SDK_INT>=28 && insets.getDisplayCutout()!=null) {
                    left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());
                    top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                    right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());
                    bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            if(left!=insetLeft||top!=insetTop||right!=insetRight||bottom!=insetBottom) {
                insetLeft=left;insetTop=top;insetRight=right;insetBottom=bottom;requestLayout();
            }
            return insets;
        });
    }

    @Override protected void onAttachedToWindow() { super.onAttachedToWindow();requestApplyInsets(); }
    String selectedMapId() { maps.settleSelection(); return mapId; }
    String selectedDifficulty() { return difficulty; }

    private void chooseMap(FfaMapCatalog.MapInfo map) {
        if (map.id.equals(mapId)) return;
        mapId=map.id;facts.scrollTo(0,0);updateDetails();actions.map(mapId);
    }
    private void selectGroup(int key) {
        maps.settleSelection();if(!browser.selectGroup(key))return;
        maps.showGroup();chooseMap(catalog.map(browser.selectedId()));updateDetails();decorateGroups();
    }
    private void decorateGroups() {
        for(int i=0;i<groupKeys.length;i++) {
            boolean selected=browser.group()==groupKeys[i];groupButtons[i].setSelected(selected);
            groupButtons[i].setContentDescription((groupKeys[i]==FfaMapBrowserState.ORIGINALS ? "Original FFA maps" : groupKeys[i]+" player FFA maps")
                    +(selected?", selected group":", choose group"));
        }
    }
    private void updateDetails() {
        FfaMapCatalog.MapInfo map=catalog.map(browser.selectedId());
        title.setText(map.name.toUpperCase(Locale.ROOT));compactTitle.setText(title.getText());
        String summary=map.players+" players · "+map.width+" × "+map.height+" · VTOL OFF";
        meta.setText(summary);compactMeta.setText(summary);
        bots.setText("You + "+map.bots+(map.bots==1?" Cobra bot":" independent Cobra bots"));
        String text=map.description,prefix=map.width+" × "+map.height+". ";
        description.setText(text.startsWith(prefix)?text.substring(prefix.length()):text);
        position.setText((browser.selectedIndex()+1)+" / "+browser.size());
        previous.setEnabled(browser.selectedIndex()>0);next.setEnabled(browser.selectedIndex()<browser.size()-1);
        start.setContentDescription("Start "+map.name+", "+difficulty+", you and "+map.bots+" Cobra bots, VTOL off");
    }
    private void selectDifficulty(String value) {
        difficulty="Hard".equalsIgnoreCase(value)?"Hard":"Medium".equalsIgnoreCase(value)?"Medium":"Easy";
        select(easy,"Easy");select(medium,"Medium");select(hard,"Hard");
        if(start!=null)start.setContentDescription("Start selected FFA map, "+difficulty+" Cobra bots, VTOL off");
    }
    private void select(Button button,String value) {
        boolean selected=value.equals(difficulty);button.setSelected(selected);
        button.setContentDescription("Bot difficulty: "+value+(selected?", selected":""));
    }
    private Button action(String label,boolean primary) {
        Button button=RewardsView.action(getContext(),face,label,primary);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(primary?TowersTheme.PRIMARY_RIPPLE:TowersTheme.RIPPLE),
                new InsetDrawable(TowersTheme.control(getContext(),primary?TowersTheme.PRIMARY:TowersTheme.CONTROL,7),0,dp(4),0,dp(4)),null));
        button.setTextSize(primary?16:13);button.setSingleLine(true);return button;
    }
    private TextView copy(String value,int size,int colour) {
        TextView text=new TextView(getContext());text.setText(value);text.setTextSize(size);text.setTextColor(colour);
        text.setIncludeFontPadding(false);return text;
    }
    private TextView mapTitle() {
        TextView view=copy("",24,TowersTheme.TEXT);view.setTypeface(face);view.setSingleLine(true);
        view.setEllipsize(TextUtils.TruncateAt.END);view.setAutoSizeTextTypeUniformWithConfiguration(16,24,1,android.util.TypedValue.COMPLEX_UNIT_SP);return view;
    }
    private TextView mapMeta() {
        TextView view=copy("",12,TowersTheme.SECONDARY);view.setSingleLine(true);
        view.setAutoSizeTextTypeUniformWithConfiguration(10,12,1,android.util.TypedValue.COMPLEX_UNIT_SP);return view;
    }
    private LinearLayout heading(TextView title,TextView meta) {
        LinearLayout row=new LinearLayout(getContext());row.setOrientation(LinearLayout.VERTICAL);
        row.addView(title,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(4);row.addView(meta,p);return row;
    }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    private int contentWidth(Button button,int minimum) {
        return Math.max(dp(minimum),Math.round(button.getPaint().measureText(button.getText().toString()))+dp(22));
    }
    private void exact(View view,int width,int height) {
        view.measure(MeasureSpec.makeMeasureSpec(Math.max(0,width),MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(Math.max(0,height),MeasureSpec.EXACTLY));
    }
    private void place(View view,FfaSetupLayout.Box box) { view.layout(box.left,box.top,box.right,box.bottom); }

    private final class CompactRow extends FrameLayout {
        private int[] widths=new int[0];
        CompactRow(Context context) { super(context); }
        @Override protected void onMeasure(int width,int height) {
            int w=MeasureSpec.getSize(width),h=MeasureSpec.getSize(height),count=getChildCount();
            int[] desired=new int[count];for(int i=0;i<count;i++)desired[i]=contentWidth((Button)getChildAt(i),48);
            widths=FfaSetupLayout.chipWidths(w,dp(4),dp(48),desired);
            for(int i=0;i<count;i++)exact(getChildAt(i),widths[i],h);setMeasuredDimension(w,h);
        }
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b) {
            int x=0;for(int i=0;i<getChildCount();i++) { View child=getChildAt(i);child.layout(x,0,x+widths[i],getHeight());x+=widths[i]+dp(4); }
        }
    }

    /** No outer scrolling: only long/right-side facts may scroll. Start is fixed. */
    private final class LaunchPanel extends FrameLayout {
        private FfaSetupLayout layout;
        LaunchPanel(Context context) {
            super(context);addView(back);addView(screenTitle);addView(saves);addView(challenge);addView(maps);addView(previous);addView(position);addView(next);
            addView(heading);addView(groups);addView(choices);addView(facts);addView(start);
        }
        @Override protected void onMeasure(int width,int height) {
            int w=MeasureSpec.getSize(width),h=MeasureSpec.getSize(height);float density=getResources().getDisplayMetrics().density;
            FfaSetupLayout initial=FfaSetupLayout.calculate(w,h,density,insetLeft,insetTop,insetRight,insetBottom,0,contentWidth(start,128));
            heading.measure(MeasureSpec.makeMeasureSpec(initial.groups.width(),MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(0,MeasureSpec.UNSPECIFIED));
            layout=FfaSetupLayout.calculate(w,h,density,insetLeft,insetTop,insetRight,insetBottom,heading.getMeasuredHeight(),contentWidth(start,128));
            heading.setVisibility(layout.compactHeading?GONE:VISIBLE);compactHeading.setVisibility(layout.compactHeading?VISIBLE:GONE);
            exact(back,contentWidth(back,72),layout.header.height());exact(saves,contentWidth(saves,96),layout.header.height());
            exact(challenge,contentWidth(challenge,100),layout.header.height());
            exact(screenTitle,Math.max(0,layout.header.width()-back.getMeasuredWidth()-saves.getMeasuredWidth()-challenge.getMeasuredWidth()-dp(36)),layout.header.height());
            exact(maps,layout.preview.width(),layout.preview.height());exact(previous,layout.previous.width(),layout.previous.height());
            exact(position,layout.position.width(),layout.position.height());exact(next,layout.next.width(),layout.next.height());
            if(!layout.compactHeading)exact(heading,layout.heading.width(),layout.heading.height());
            exact(groups,layout.groups.width(),layout.groups.height());exact(choices,layout.difficulty.width(),layout.difficulty.height());
            exact(facts,layout.facts.width(),layout.facts.height());exact(start,layout.start.width(),layout.start.height());setMeasuredDimension(w,h);
        }
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b) {
            back.layout(layout.header.left,layout.header.top,layout.header.left+back.getMeasuredWidth(),layout.header.bottom);
            saves.layout(layout.header.right-saves.getMeasuredWidth(),layout.header.top,layout.header.right,layout.header.bottom);
            challenge.layout(saves.getLeft()-dp(12)-challenge.getMeasuredWidth(),layout.header.top,saves.getLeft()-dp(12),layout.header.bottom);
            int titleLeft=layout.header.left+back.getMeasuredWidth()+dp(12);
            screenTitle.layout(titleLeft,layout.header.top,titleLeft+screenTitle.getMeasuredWidth(),layout.header.bottom);
            place(maps,layout.preview);place(previous,layout.previous);place(position,layout.position);place(next,layout.next);
            if(!layout.compactHeading)place(heading,layout.heading);
            place(groups,layout.groups);place(choices,layout.difficulty);place(facts,layout.facts);place(start,layout.start);
        }
    }

    private final class BrowseArrow extends View {
        private final Paint ink=new Paint(Paint.ANTI_ALIAS_FLAG);
        private final ColorStateList colours=TowersTheme.buttonText(false);
        private final Path chevron=new Path();
        private final android.graphics.drawable.Drawable buttonFace;
        private final boolean forward;
        private int touchEpoch;
        BrowseArrow(boolean forward) {
            super(FfaSetupView.this.getContext());this.forward=forward;
            buttonFace=TowersTheme.control(getContext(),TowersTheme.CONTROL,6);setClickable(true);setFocusable(true);
            setContentDescription(forward?"Next FFA map, or swipe left":"Previous FFA map, or swipe right");
            setOnClickListener(v -> {
                int epoch=touchEpoch==0?browser.epoch():touchEpoch;touchEpoch=0;if(epoch!=browser.epoch())return;
                maps.settleSelection();maps.cancelSettle();maps.touching=false;
                maps.snapToPage(browser.selectedIndex()+(forward?1:-1),epoch);
            });
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if(event.getActionMasked()==MotionEvent.ACTION_DOWN)touchEpoch=browser.epoch();
            boolean result=super.onTouchEvent(event);
            if(event.getActionMasked()==MotionEvent.ACTION_CANCEL)touchEpoch=0;
            return result;
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);float cx=getWidth()/2f,cy=getHeight()/2f;
            buttonFace.setBounds(Math.round(cx-dp(20)),Math.round(cy-dp(20)),Math.round(cx+dp(20)),Math.round(cy+dp(20)));
            buttonFace.setState(getDrawableState());buttonFace.draw(canvas);
            ink.setColor(colours.getColorForState(getDrawableState(),TowersTheme.TEXT));ink.setStrokeWidth(dp(2));
            ink.setStrokeCap(Paint.Cap.ROUND);ink.setStrokeJoin(Paint.Join.ROUND);ink.setStyle(Paint.Style.STROKE);
            float direction=forward?1f:-1f;chevron.reset();chevron.moveTo(cx-direction*dp(3),cy-dp(6));
            chevron.lineTo(cx+direction*dp(3),cy);chevron.lineTo(cx-direction*dp(3),cy+dp(6));canvas.drawPath(chevron,ink);
        }
        @Override protected void drawableStateChanged() { super.drawableStateChanged();invalidate(); }
        @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) { super.onInitializeAccessibilityNodeInfo(info);info.setClassName("android.widget.Button"); }
    }

    /** Same direct snap/swipe and accessible browse pattern as the Towers pager. */
    private final class FfaPager extends HorizontalScrollView {
        private final LinearLayout pages;
        private final List<MapCard> cards = new ArrayList<>();
        private final LruCache<String, Bitmap> previews = new LruCache<>(6);
        private int selectedIndex, pageWidth;
        private boolean positioning, positionPending = true, touching;
        private Runnable settle;

        FfaPager(Context context) {
            super(context);
            setFillViewport(true);
            setHorizontalScrollBarEnabled(false);
            setOverScrollMode(OVER_SCROLL_NEVER);
            setSmoothScrollingEnabled(false);
            setClipToPadding(true);
            pages = new LinearLayout(context);
            addView(pages, new HorizontalScrollView.LayoutParams(-2, -1));
            showGroup();
        }

        void showGroup() {
            cancelSettle();
            touching = false;
            positioning = true;
            scrollTo(0, 0);
            positioning = false;
            pages.removeAllViews();
            cards.clear();
            selectedIndex = browser.selectedIndex();
            positionPending = true;
            for (int i = 0; i < browser.size(); i++) {
                FfaMapCatalog.MapInfo map = catalog.map(browser.idAt(i));
                MapCard card = new MapCard(map, i + 1);
                cards.add(card);
                pages.addView(card, new LinearLayout.LayoutParams(Math.max(1, pageWidth), -1));
            }
            decorate();
            requestLayout();
        }

        private void cancelSettle() {
            if (settle != null) removeCallbacks(settle);
            settle = null;
        }

        private void scheduleSettle() {
            cancelSettle();
            final int epoch = browser.epoch();
            settle = () -> {
                if (!positionPending && !touching) snapToPage(Math.round(getScrollX() / (float) Math.max(1, pageWidth)), epoch);
            };
            postDelayed(settle, 160);
        }

        void settleSelection() {
            cancelSettle();
            if (!positionPending) snapToPage(Math.round(getScrollX() / (float) Math.max(1, pageWidth)));
        }

        private void decorate() {
            for (int i = 0; i < cards.size(); i++) cards.get(i).setSelected(i == selectedIndex);
            updateDetails();
        }

        private void snapToPage(int index) {
            snapToPage(index, browser.epoch());
        }

        private void snapToPage(int index, int epoch) {
            if (!browser.selectIndex(index, epoch)) return;
            index = browser.selectedIndex();
            scrollTo(index * pageWidth, 0);
            if (index != selectedIndex) {
                selectedIndex = index;
                decorate();
                chooseMap(catalog.map(browser.selectedId()));
            }
        }

        @Override public void fling(int velocityX) {
            int nearest = Math.round(getScrollX() / (float) Math.max(1, pageWidth));
            snapToPage(velocityX > 0 ? Math.max(nearest, selectedIndex + 1)
                    : velocityX < 0 ? Math.min(nearest, selectedIndex - 1) : nearest);
        }

        @Override protected void onMeasure(int width, int height) {
            int available = MeasureSpec.getSize(width);
            if (available != pageWidth) {
                pageWidth = available; positionPending = true;
                for (MapCard card : cards) {
                    LinearLayout.LayoutParams p = (LinearLayout.LayoutParams) card.getLayoutParams();
                    p.width = pageWidth; card.setLayoutParams(p);
                }
            }
            super.onMeasure(width, height);
        }

        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            super.onLayout(changed, l, t, r, b);
            if (positionPending) {
                positioning = true; scrollTo(selectedIndex * pageWidth, 0); positioning = false;
                positionPending = false;
            }
        }

        @Override protected void onScrollChanged(int x, int y, int oldX, int oldY) {
            super.onScrollChanged(x, y, oldX, oldY);
            if (!positioning && !touching && !positionPending) scheduleSettle();
        }

        private void track(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                touching = true; cancelSettle();
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                touching = false; scheduleSettle();
            }
        }
        @Override public boolean onInterceptTouchEvent(MotionEvent event) { track(event); return super.onInterceptTouchEvent(event); }
        @Override public boolean onTouchEvent(MotionEvent event) { track(event); return super.onTouchEvent(event); }

        @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
            super.onInitializeAccessibilityNodeInfo(info);
            info.setContentDescription("FFA map selection, " + (selectedIndex + 1) + " of " + cards.size());
            info.setScrollable(cards.size() > 1);
        }
        @Override public boolean performAccessibilityAction(int action, Bundle arguments) {
            if (action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD && selectedIndex < cards.size() - 1) { snapToPage(selectedIndex + 1); return true; }
            if (action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD && selectedIndex > 0) { snapToPage(selectedIndex - 1); return true; }
            return super.performAccessibilityAction(action, arguments);
        }
        @Override protected void onDetachedFromWindow() { cancelSettle(); previews.evictAll(); super.onDetachedFromWindow(); }

        private final class MapCard extends FrameLayout {
            MapCard(FfaMapCatalog.MapInfo map, int number) {
                super(FfaSetupView.this.getContext());
                setContentDescription(map.name + ", " + map.players + " players, map preview");
                addView(new MapImage(map.preview), new FrameLayout.LayoutParams(-1, -1));
            }
        }

        private final class MapImage extends View {
            private final String path;
            private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            private final RectF target = new RectF();
            private boolean unavailable;
            MapImage(String path) { super(FfaSetupView.this.getContext()); this.path = path; setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
            @Override protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                Bitmap bitmap = previews.get(path);
                if (bitmap == null && !unavailable) {
                    try (InputStream input = getContext().getAssets().open(path)) {
                        BitmapFactory.Options options = new BitmapFactory.Options(); options.inScaled = false;
                        bitmap = BitmapFactory.decodeStream(input, null, options);
                        if (bitmap != null) previews.put(path, bitmap); else unavailable = true;
                    } catch (Exception error) { unavailable = true; }
                }
                paint.setColor(TowersTheme.BACKGROUND);
                canvas.drawRoundRect(0, 0, getWidth(), getHeight(), dp(5), dp(5), paint);
                if (bitmap == null) return;
                FfaSetupLayout.Box box = FfaSetupLayout.contain(getWidth(), getHeight(), bitmap.getWidth(), bitmap.getHeight());
                target.set(box.left, box.top, box.right, box.bottom);
                canvas.drawBitmap(bitmap, null, target, paint);
            }
        }
    }
}
