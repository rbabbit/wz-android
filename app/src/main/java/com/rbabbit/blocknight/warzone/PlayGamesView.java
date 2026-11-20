package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home's optional Play Games page, with real Google data in the game's own UI. */
final class PlayGamesView extends FrameLayout {
    private static final int ACHIEVEMENTS=0, LEADERBOARDS=1, CLOUD=2;
    private static final int INK=0xFFF2F5F3, MUTED=0xFFC0C6C3, LINE=0xFF454B48;
    private static final int MINT=0xFF7CE6B5, GOLD=0xFFFFCC57, LOCK_BLUE=0xFF90B9D5, LAVENDER=0xFFB6A4C8;
    private final PlayGamesController controller;
    private final Runnable close;
    private final Typeface face;
    private final LinearLayout body, account, main, contents;
    private final TextView accountTitle, status;
    private final Switch enabled;
    private final Button connect;
    private final Button[] tabButtons=new Button[3];
    private JSONObject achievementsData, leaderboardsData, scoresData;
    private String boardId="", boardName="";
    private int tab=ACHIEVEMENTS, span=2;
    private long requestSerial;
    private boolean refreshing, wasConnected, disposed;

    PlayGamesView(Context context, PlayGamesController controller, Runnable close) {
        super(context); this.controller=controller; this.close=close;
        face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xFF101413,0xFF090C0B}));
        setClickable(true); setFocusableInTouchMode(true);
        LinearLayout page=column(); page.setPadding(dp(16),dp(8),dp(16),dp(12));
        addView(page,new LayoutParams(-1,-1));
        LinearLayout header=row();
        Button back=button("BACK",false,()->{ if(!back())this.close.run(); });
        header.addView(back,new LinearLayout.LayoutParams(dp(76),dp(44)));
        TextView title=text("PLAY GAMES",22,INK); title.setTypeface(face);
        LinearLayout.LayoutParams titleParams=new LinearLayout.LayoutParams(0,-2,1); titleParams.leftMargin=dp(16);
        header.addView(title,titleParams); page.addView(header,new LinearLayout.LayoutParams(-1,dp(48)));
        View headerRule=new View(context);headerRule.setBackgroundColor(0xFF5B9B7D);
        page.addView(headerRule,new LinearLayout.LayoutParams(-1,Math.max(1,dp(.5f))));

        body=new LinearLayout(context); body.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams bodyParams=new LinearLayout.LayoutParams(-1,0,1); bodyParams.topMargin=dp(8);
        page.addView(body,bodyParams);
        account=column(); account.setPadding(dp(14),dp(12),dp(14),dp(12)); account.setBackground(accountPanel());
        TextView label=text("GOOGLE PLAY GAMES",12,MUTED); label.setTypeface(face);
        account.addView(label,new LinearLayout.LayoutParams(-1,-2));
        accountTitle=text("Not connected",18,INK); accountTitle.setTypeface(face);
        accountTitle.setMaxLines(2); accountTitle.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams accountTitleParams=new LinearLayout.LayoutParams(-1,-2); accountTitleParams.topMargin=dp(10);
        account.addView(accountTitle,accountTitleParams);
        status=text("",12,MUTED); status.setMaxLines(4); status.setEllipsize(TextUtils.TruncateAt.END);
        status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout.LayoutParams statusParams=new LinearLayout.LayoutParams(-1,-2); statusParams.topMargin=dp(6);
        account.addView(status,statusParams);
        enabled=new Switch(context); enabled.setText("Enable Play Games"); enabled.setTextSize(12);
        enabled.setTextColor(INK); enabled.setMinHeight(dp(44));
        enabled.setThumbTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked},{}},new int[]{MINT,INK}));
        enabled.setTrackTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked},{}},new int[]{0xFF29966B,0xFF58655F}));
        LinearLayout.LayoutParams enabledParams=new LinearLayout.LayoutParams(-1,dp(44)); enabledParams.topMargin=dp(8);
        account.addView(enabled,enabledParams);
        enabled.setOnCheckedChangeListener((view,checked)->{ if(!refreshing)controller.setEnabled(checked); });
        connect=button("CONNECT",true,controller::connect);
        LinearLayout.LayoutParams connectParams=new LinearLayout.LayoutParams(-1,dp(44)); connectParams.topMargin=dp(4);
        account.addView(connect,connectParams);
        body.addView(account,new LinearLayout.LayoutParams(dp(210),-1));

        main=column();
        LinearLayout.LayoutParams mainParams=new LinearLayout.LayoutParams(0,-1,1); mainParams.leftMargin=dp(12);
        body.addView(main,mainParams);
        LinearLayout tabs=row(); String[] names={"Achievements","Leaderboards","Cloud backup"};
        for(int i=0;i<names.length;i++) {
            final int selected=i;
            tabButtons[i]=button(names[i],false,()->selectTab(selected)); tabButtons[i].setTextSize(12);
            tabButtons[i].setPadding(dp(4),0,dp(4),0);
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(42),1);
            if(i>0)p.leftMargin=dp(6);
            tabs.addView(tabButtons[i],p);
        }
        main.addView(tabs,new LinearLayout.LayoutParams(-1,dp(42)));
        contents=column();
        LinearLayout.LayoutParams contentsParams=new LinearLayout.LayoutParams(-1,0,1); contentsParams.topMargin=dp(8);
        main.addView(contents,contentsParams);

        setOnApplyWindowInsetsListener((view,insets)->{
            int left,top,right,bottom;
            if(Build.VERSION.SDK_INT>=30) {
                android.graphics.Insets safe=insets.getInsets(android.view.WindowInsets.Type.systemBars()
                        |android.view.WindowInsets.Type.displayCutout());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
            } else {
                left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();
                right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();
                if(Build.VERSION.SDK_INT>=28&&insets.getDisplayCutout()!=null) {
                    left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());
                    top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                    right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());
                    bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            setPadding(left,top,right,bottom);return insets;
        });
        refresh();
    }

    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) {
        super.onSizeChanged(w,h,oldw,oldh);
        boolean compact=w<dp(600)&&h>w;
        body.setOrientation(compact?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
        account.setLayoutParams(new LinearLayout.LayoutParams(compact?-1:w<dp(700)?dp(170):dp(210),compact?-2:-1));
        status.setMaxLines(compact?2:4);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(compact?-1:0,compact?0:-1,1);
        if(compact)p.topMargin=dp(8);else p.leftMargin=dp(12);main.setLayoutParams(p);
    }

    void refresh() {
        if(disposed)return;
        refreshing=true;enabled.setChecked(controller.enabled());enabled.setEnabled(controller.configured());refreshing=false;
        boolean connected=controller.signedIn(),ready=controller.enabled()&&controller.configured()&&!controller.busy();
        String message=controller.status();
        boolean named=connected&&message.startsWith("Connected as ");
        accountTitle.setText(connected?(named?message.substring(13).replaceFirst("\\.$",""):"Connected"):
                controller.enabled()?"Not connected":"Play Games is off");
        accountTitle.setTextColor(connected?MINT:INK);
        status.setText(named?"Achievements and rankings sync with your Google profile.":message);
        connect.setVisibility(connected?GONE:VISIBLE);connect.setEnabled(ready&&!connected);
        for(Button button:tabButtons)button.setEnabled(!controller.busy());
        if(connected!=wasConnected) {
            wasConnected=connected;requestSerial++;achievementsData=null;leaderboardsData=null;scoresData=null;
            renderActiveTab();
        } else if(contents.getChildCount()==0||tab==CLOUD) renderActiveTab();
    }

    /** Returns true when Back navigated within this page. */
    boolean back() {
        if(!boardId.isEmpty()) {
            requestSerial++;boardId="";boardName="";scoresData=null;leaderboardsData=null;renderActiveTab();return true;
        }
        return false;
    }
    private void selectTab(int selected) {
        if(tab==selected&&boardId.isEmpty())return;
        requestSerial++;tab=selected;boardId="";boardName="";scoresData=null;
        if(tab==ACHIEVEMENTS)achievementsData=null;
        else if(tab==LEADERBOARDS)leaderboardsData=null;
        renderActiveTab();
    }
    private void renderActiveTab() {
        for(int i=0;i<tabButtons.length;i++)styleTab(tabButtons[i],i==tab);
        if(tab==CLOUD){renderCloud();return;}
        if(!controller.signedIn()) {
            showMessage(controller.enabled()?"Connect to see your progress":"Play Games is optional",
                    "Local games and saves remain available. Enable Play Games and connect to view your Google achievements and rankings.",null);return;
        }
        if(tab==ACHIEVEMENTS) {
            if(achievementsData!=null){renderAchievements(achievementsData);return;}
            final long request=++requestSerial;showLoading("Loading achievements…");
            controller.loadAchievements(data->post(()->{
                if(!accept(request))return;achievementsData=data;renderAchievements(data);
            }));
        } else if(boardId.isEmpty()) {
            if(leaderboardsData!=null){renderLeaderboards(leaderboardsData);return;}
            final long request=++requestSerial;showLoading("Loading leaderboards…");
            controller.loadLeaderboards(data->post(()->{
                if(!accept(request))return;leaderboardsData=data;renderLeaderboards(data);
            }));
        } else {
            if(scoresData!=null){renderScores(scoresData);return;}
            final long request=++requestSerial;showLoading("Loading scores…");
            controller.loadLeaderboardScores(boardId,span,data->post(()->{
                if(!accept(request))return;scoresData=data;renderScores(data);
            }));
        }
    }
    private boolean accept(long request) { return !disposed&&request==requestSerial&&controller.signedIn(); }
    private void reload() {
        requestSerial++;
        if(tab==ACHIEVEMENTS)achievementsData=null;
        else if(boardId.isEmpty())leaderboardsData=null;
        else scoresData=null;
        renderActiveTab();
    }
    private boolean failure(JSONObject data) {
        if(data!=null&&data.optBoolean("ok"))return false;
        showMessage("Could not load Google data",data==null?"Please try again.":data.optString("error","Please try again."),this::reload);
        return true;
    }
    private void renderAchievements(JSONObject data) {
        if(failure(data))return;
        JSONArray items=data.optJSONArray("items");if(items==null)items=new JSONArray();
        int unlocked=0;
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.optJSONObject(i);
            if(item!=null&&"unlocked".equals(item.optString("state")))unlocked++;
        }
        contents.removeAllViews();sectionHeader(unlocked+" / "+items.length()+" unlocked");
        LinearLayout list=scrollingList();
        if(items.length()==0){list.addView(paragraph("No achievements are available for this Google profile yet."));return;}
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.optJSONObject(i);if(item==null)continue;
            boolean won="unlocked".equals(item.optString("state")),hidden="hidden".equals(item.optString("state"));
            boolean incremental=item.optBoolean("incremental");int total=Math.max(1,item.optInt("total",1));
            int steps=won?total:Math.max(0,Math.min(total,item.optInt("steps")));
            LinearLayout card=row();card.setMinimumHeight(dp(46));card.setPadding(dp(12),dp(7),dp(12),dp(7));
            card.setBackground(won?unlockedPanel():panel());
            ImageView icon=new ImageView(getContext());
            icon.setImageResource(won?android.R.drawable.star_big_on:android.R.drawable.ic_lock_lock);
            icon.setColorFilter(won?GOLD:i%3==1?LOCK_BLUE:LAVENDER);icon.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
            LinearLayout.LayoutParams iconParams=new LinearLayout.LayoutParams(dp(26),dp(26));iconParams.rightMargin=dp(10);
            card.addView(icon,iconParams);
            LinearLayout copy=column();
            TextView name=text(hidden?"Hidden achievement":item.optString("name","Achievement"),14,INK);
            name.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));copy.addView(name,new LinearLayout.LayoutParams(-1,-2));
            TextView description=text(hidden?"Keep playing to discover this achievement.":item.optString("description"),12,MUTED);
            description.setMaxLines(2);description.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams descriptionParams=new LinearLayout.LayoutParams(-1,-2);descriptionParams.topMargin=dp(2);
            copy.addView(description,descriptionParams);
            if(incremental&&!hidden) {
                ProgressBar progress=new ProgressBar(getContext(),null,android.R.attr.progressBarStyleHorizontal);
                progress.setMax(total);progress.setProgress(steps);progress.setProgressTintList(ColorStateList.valueOf(MINT));
                progress.setProgressBackgroundTintList(ColorStateList.valueOf(LINE));
                progress.setContentDescription(steps+" of "+total+" completed");
                LinearLayout.LayoutParams progressParams=new LinearLayout.LayoutParams(-1,dp(4));progressParams.topMargin=dp(6);
                copy.addView(progress,progressParams);
            }
            card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
            TextView badge=text(won?"Unlocked":incremental?steps+" / "+total:"Locked",11,won?MINT:MUTED);
            badge.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);badge.setMaxLines(2);
            LinearLayout.LayoutParams badgeParams=new LinearLayout.LayoutParams(dp(62),-2);badgeParams.leftMargin=dp(8);
            card.addView(badge,badgeParams);addCard(list,card);
        }
    }
    private void renderLeaderboards(JSONObject data) {
        if(failure(data))return;
        contents.removeAllViews();sectionHeader("Fastest victories");
        LinearLayout list=scrollingList();JSONArray items=data.optJSONArray("items");
        if(items==null||items.length()==0) {
            list.addView(paragraph("No leaderboards are available for this Google profile yet."));return;
        }
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.optJSONObject(i);if(item==null)continue;
            final String id=item.optString("id"),name=item.optString("name","Leaderboard");
            LinearLayout card=row();card.setPadding(dp(12),dp(11),dp(12),dp(11));
            card.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337CE6B5),panel(),null));
            ImageView icon=new ImageView(getContext());icon.setImageResource(android.R.drawable.ic_menu_sort_by_size);
            icon.setColorFilter(MINT);icon.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
            LinearLayout.LayoutParams iconParams=new LinearLayout.LayoutParams(dp(25),dp(25));iconParams.rightMargin=dp(12);
            card.addView(icon,iconParams);
            LinearLayout copy=column();TextView heading=text(name,14,INK);
            heading.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));heading.setMaxLines(2);
            heading.setEllipsize(TextUtils.TruncateAt.END);copy.addView(heading,new LinearLayout.LayoutParams(-1,-2));
            String score=item.optString("score","");
            TextView caption=text(score.isEmpty()?"View rankings and your best time":"Your best · "+score,12,MUTED);
            LinearLayout.LayoutParams captionParams=new LinearLayout.LayoutParams(-1,-2);captionParams.topMargin=dp(4);
            copy.addView(caption,captionParams);card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
            card.setClickable(true);card.setFocusable(true);card.setContentDescription("Open "+name);
            card.setOnClickListener(v->{requestSerial++;boardId=id;boardName=name;span=2;scoresData=null;renderActiveTab();});
            addCard(list,card);
        }
    }
    private void renderScores(JSONObject data) {
        if(failure(data))return;
        contents.removeAllViews();sectionHeader(boardName);
        LinearLayout periods=row();String[] labels={"Today","This week","All time"};
        for(int i=0;i<labels.length;i++) {
            final int selected=i;Button button=button(labels[i],i==span,()->{
                if(span==selected)return;span=selected;scoresData=null;requestSerial++;renderActiveTab();
            });button.setTextSize(11);styleTab(button,i==span);
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(40),1);if(i>0)p.leftMargin=dp(6);periods.addView(button,p);
        }
        contents.addView(periods,new LinearLayout.LayoutParams(-1,dp(40)));
        String best=data.optString("ownScore",""),rank=data.optString("ownRank","");
        String ownText=data.optString("warning","").isEmpty()?"Your best · No recorded time":"Your best could not be refreshed";
        if(!best.isEmpty())ownText="Your best · "+best+(rank.isEmpty()?"":" · Rank "+rank);
        TextView own=text(ownText,12,best.isEmpty()?MUTED:MINT);
        own.setPadding(dp(8),dp(8),dp(8),dp(8));contents.addView(own,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout list=scrollingList();JSONArray items=data.optJSONArray("items");
        if(items==null||items.length()==0) {
            list.addView(paragraph("No public scores in this period yet. Qualifying victories appear here after they are shared with Google."));return;
        }
        for(int i=0;i<items.length();i++) {
            JSONObject item=items.optJSONObject(i);if(item==null)continue;
            boolean me=item.optBoolean("me");LinearLayout row=row();row.setMinimumHeight(dp(44));
            row.setPadding(dp(10),dp(8),dp(10),dp(8));
            row.setBackground(me?unlockedPanel():panel());
            TextView position=text(item.optString("rank","—"),13,me?MINT:MUTED);
            row.addView(position,new LinearLayout.LayoutParams(dp(42),-2));
            TextView player=text(item.optString("player","Player"),13,me?MINT:INK);
            player.setSingleLine(true);player.setEllipsize(TextUtils.TruncateAt.END);row.addView(player,new LinearLayout.LayoutParams(0,-2,1));
            TextView score=text(item.optString("score",""),13,INK);score.setGravity(Gravity.END);
            LinearLayout.LayoutParams scoreParams=new LinearLayout.LayoutParams(-2,-2);scoreParams.leftMargin=dp(8);row.addView(score,scoreParams);
            addCard(list,row);
        }
    }
    private void renderCloud() {
        contents.removeAllViews();sectionHeader("Your manual cloud backup");
        LinearLayout list=scrollingList();
        list.addView(paragraph("Keep a copy of your saved games, tank blueprints, Crystals and installed maps in your Google account."));
        addCloudCard(list,"Back up this device","Upload your current local progress to your account.","BACK UP",()->{
            controller.uploadBackup();refresh();
        });
        addCloudCard(list,"Restore your backup","Restore saved progress from your account. You’ll confirm before local progress is replaced.","RESTORE",()->{
            controller.restoreBackup();refresh();
        });
        TextView note=text(controller.signedIn()?"Backups are manual. Your existing local saves remain available offline.":
                "Connect to Play Games to use cloud backup.",12,MUTED);
        note.setPadding(0,dp(6),0,dp(6));list.addView(note,new LinearLayout.LayoutParams(-1,-2));
    }
    private void addCloudCard(LinearLayout list,String title,String detail,String action,Runnable run) {
        LinearLayout card=row();card.setPadding(dp(12),dp(12),dp(12),dp(12));card.setBackground(panel());
        LinearLayout copy=column();TextView name=text(title,14,INK);name.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));
        copy.addView(name,new LinearLayout.LayoutParams(-1,-2));
        TextView description=text(detail,12,MUTED);
        LinearLayout.LayoutParams descriptionParams=new LinearLayout.LayoutParams(-1,-2);descriptionParams.topMargin=dp(4);copy.addView(description,descriptionParams);
        card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
        Button button=button(action,false,run);button.setTextSize(12);
        button.setEnabled(controller.enabled()&&controller.signedIn()&&!controller.busy());
        LinearLayout.LayoutParams actionParams=new LinearLayout.LayoutParams(dp(100),dp(44));actionParams.leftMargin=dp(12);card.addView(button,actionParams);
        addCard(list,card);
    }
    private void sectionHeader(String title) {
        LinearLayout header=row();TextView text=text(title,14,INK);
        text.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));text.setMaxLines(2);text.setEllipsize(TextUtils.TruncateAt.END);
        header.addView(text,new LinearLayout.LayoutParams(0,-2,1));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(2);p.bottomMargin=dp(10);contents.addView(header,p);
    }
    private LinearLayout scrollingList() {
        ScrollView scroll=new ScrollView(getContext());scroll.setFillViewport(false);scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setClipToPadding(false);scroll.setPadding(0,0,0,dp(4));
        LinearLayout list=column();scroll.addView(list,new ScrollView.LayoutParams(-1,-2));
        contents.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));return list;
    }
    private void addCard(LinearLayout list,View card) {
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(5);list.addView(card,p);
    }
    private TextView paragraph(String text) {
        TextView view=text(text,13,MUTED);view.setPadding(dp(8),dp(10),dp(8),dp(12));return view;
    }
    private void showLoading(String text) {
        contents.removeAllViews();LinearLayout area=column();area.setGravity(Gravity.CENTER);
        ProgressBar progress=new ProgressBar(getContext());progress.setIndeterminateTintList(ColorStateList.valueOf(MINT));
        area.addView(progress,new LinearLayout.LayoutParams(dp(26),dp(26)));
        TextView label=paragraph(text);label.setGravity(Gravity.CENTER);area.addView(label,new LinearLayout.LayoutParams(-1,-2));
        contents.addView(area,new LinearLayout.LayoutParams(-1,-1));
    }
    private void showMessage(String heading,String detail,Runnable retry) {
        contents.removeAllViews();LinearLayout list=scrollingList();
        TextView title=text(heading,18,INK);title.setTypeface(face);title.setPadding(dp(8),dp(12),dp(8),dp(4));
        list.addView(title,new LinearLayout.LayoutParams(-1,-2));list.addView(paragraph(detail),new LinearLayout.LayoutParams(-1,-2));
        if(retry!=null)list.addView(button("TRY AGAIN",false,retry),new LinearLayout.LayoutParams(dp(120),dp(44)));
    }
    private Button button(String label,boolean primary,Runnable action) {
        Button view=new Button(getContext());view.setText(label);view.setAllCaps(false);view.setTextSize(13);view.setTypeface(face);
        view.setMinWidth(0);view.setMinimumWidth(0);view.setMinHeight(dp(40));view.setMinimumHeight(dp(40));
        view.setPadding(dp(10),dp(5),dp(10),dp(5));style(view,primary);view.setOnClickListener(v->action.run());return view;
    }
    private void style(Button button,boolean primary) {
        button.setTextColor(new ColorStateList(new int[][]{{-android.R.attr.state_enabled},{}},new int[]{0xFF7E8D85,INK}));
        GradientDrawable fill=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                primary?new int[]{0xFF205B43,0xFF153F30}:new int[]{0xFF292C2B,0xFF202322});
        fill.setCornerRadius(dp(7));fill.setStroke(Math.max(1,dp(.5f)),primary?MINT:LINE);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337CE6B5),fill,null));
    }
    private void styleTab(Button button,boolean selected) {
        button.setTextColor(new ColorStateList(new int[][]{{-android.R.attr.state_enabled},{}},new int[]{0xFF7E8D85,INK}));
        GradientDrawable fill=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                selected?new int[]{0xFF205B43,0xFF143D2E}:new int[]{0xFF292C2B,0xFF202322});
        fill.setCornerRadius(dp(7));fill.setStroke(selected?dp(1):Math.max(1,dp(.5f)),selected?MINT:LINE);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337CE6B5),fill,null));
    }
    private android.graphics.drawable.Drawable panel() {
        GradientDrawable value=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xFF171B19,0xFF101412});
        value.setCornerRadius(dp(8));value.setStroke(Math.max(1,dp(.5f)),LINE);return value;
    }
    private android.graphics.drawable.Drawable accountPanel() {
        GradientDrawable value=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xFF151C18,0xFF101512});
        value.setCornerRadius(dp(9));value.setStroke(Math.max(1,dp(.5f)),0xFF456D5B);return value;
    }
    private android.graphics.drawable.Drawable unlockedPanel() {
        GradientDrawable value=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xFF183C2D,0xFF10261D});
        value.setCornerRadius(dp(8));value.setStroke(Math.max(1,dp(.5f)),0xFF456D5B);return value;
    }
    private LinearLayout column() { LinearLayout view=new LinearLayout(getContext());view.setOrientation(LinearLayout.VERTICAL);return view; }
    private LinearLayout row() { LinearLayout view=new LinearLayout(getContext());view.setOrientation(LinearLayout.HORIZONTAL);view.setGravity(Gravity.CENTER_VERTICAL);return view; }
    private TextView text(String text,float size,int color) {
        TextView view=new TextView(getContext());view.setText(text);view.setTextSize(size);view.setTextColor(color);view.setIncludeFontPadding(false);return view;
    }
    @Override protected void onAttachedToWindow(){super.onAttachedToWindow();requestApplyInsets();}
    @Override protected void onDetachedFromWindow(){disposed=true;requestSerial++;super.onDetachedFromWindow();}
    private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
