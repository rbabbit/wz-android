package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Small launch console; the original splash artwork stays unobstructed. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions {
        void start(String mode, String map); void cancel(); void music(); void download(); void map(String id);
    }
    private static final int INK=0xFFF0E8D3, MUTED=0xFFB4C4C3, CYAN=0xFF83CDD1;
    private final Actions actions;
    private final Typeface face;
    private final LinearLayout mapOne, mapTwo;
    private final TextView mapOneMark, mapTwoMark, status;
    private final Button normal, high, start, cancel, music, download;
    private final ProgressBar progress;
    private String mode, map;
    private boolean cached, downloading, musicChecked;

    GraphicsSetupView(Context context, String selected, String selectedMap, Actions actions) {
        super(context);this.actions=actions;mode="high".equals(selected)?"high":"normal";map="td1".equals(selectedMap)?"td1":"td2";
        face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF050B0C);setClickable(true);setFocusable(true);
        ImageView art=new ImageView(context);art.setImageResource(R.drawable.warzone_splash);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);addView(art,new LayoutParams(-1,-1));
        ScrollView scroll=new ScrollView(context);scroll.setFillViewport(false);scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);scroll.setBackground(background(0xE6071215,0x8877ACB2));
        LayoutParams placement=new LayoutParams(dp(348),-2,Gravity.BOTTOM|Gravity.RIGHT);
        placement.setMargins(dp(16),dp(16),dp(16),dp(16));addView(scroll,placement);
        LinearLayout panel=new LinearLayout(context);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(14),dp(13),dp(14),dp(13));
        scroll.addView(panel,new ScrollView.LayoutParams(-1,-2));
        TextView heading=text("CHOOSE YOUR MAP",12,CYAN);heading.setLetterSpacing(.1f);panel.addView(heading);
        LinearLayout maps=new LinearLayout(context);maps.setOrientation(LinearLayout.HORIZONTAL);
        mapOne=mapCard();mapTwo=mapCard();mapOneMark=addMap(mapOne,"TOWER DEFENSE 1","NoQ · 64 × 80");mapTwoMark=addMap(mapTwo,"TOWER DEFENSE 2","arc · 64 × 64");
        LinearLayout.LayoutParams one=new LinearLayout.LayoutParams(0,dp(72),1);one.rightMargin=dp(4);maps.addView(mapOne,one);
        LinearLayout.LayoutParams two=new LinearLayout.LayoutParams(0,dp(72),1);two.leftMargin=dp(4);maps.addView(mapTwo,two);add(panel,maps,8,8);
        mapOne.setOnClickListener(v->chooseMap("td1"));mapTwo.setOnClickListener(v->chooseMap("td2"));
        TextView detail=text("30 waves · Defend your command centre",12,MUTED);add(panel,detail,0,10);
        start=button("PLAY",true);start.setContentDescription("Start game");start.setOnClickListener(v->{if(start.isEnabled())actions.start(mode,map);});add(panel,start,0,10,48);
        LinearLayout graphics=new LinearLayout(context);graphics.setGravity(Gravity.CENTER_VERTICAL);
        normal=button("NORMAL",false);high=button("HIGH QUALITY",false);normal.setContentDescription("Normal graphics");high.setContentDescription("High Quality graphics");
        normal.setOnClickListener(v->{mode="normal";refresh();});high.setOnClickListener(v->{mode="high";refresh();});
        LinearLayout.LayoutParams n=new LinearLayout.LayoutParams(0,dp(40),1);n.rightMargin=dp(4);graphics.addView(normal,n);
        LinearLayout.LayoutParams h=new LinearLayout.LayoutParams(0,dp(40),1);h.leftMargin=dp(4);graphics.addView(high,h);panel.addView(graphics);
        LinearLayout options=new LinearLayout(context);
        music=button("MUSIC · CHECKING…",false);music.setEnabled(false);music.setOnClickListener(v->actions.music());
        download=button("HQ · DOWNLOAD",false);download.setOnClickListener(v->actions.download());
        LinearLayout.LayoutParams m=new LinearLayout.LayoutParams(0,dp(40),1);m.rightMargin=dp(4);options.addView(music,m);
        LinearLayout.LayoutParams d=new LinearLayout.LayoutParams(0,dp(40),1);d.leftMargin=dp(4);options.addView(download,d);add(panel,options,6,0);
        status=text("",12,MUTED);status.setVisibility(GONE);add(panel,status,7,0);
        progress=new ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1000);progress.setProgressTintList(ColorStateList.valueOf(CYAN));progress.setVisibility(GONE);add(panel,progress,8,0,4);
        cancel=button("CANCEL DOWNLOAD",false);cancel.setVisibility(GONE);cancel.setOnClickListener(v->{actions.cancel();setDownloading(false);showStatus("Download paused. Your progress is saved.",false);});add(panel,cancel,7,0,40);
        refresh();
        addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
            LayoutParams p=(LayoutParams)scroll.getLayoutParams();int width=Math.min(dp(348),getWidth()-dp(32));
            if(p.width!=width){p.width=width;scroll.setLayoutParams(p);}
        });
    }
    private void chooseMap(String id){if(downloading)return;map=id;actions.map(id);refresh();}
    private LinearLayout mapCard(){LinearLayout c=new LinearLayout(getContext());c.setOrientation(LinearLayout.VERTICAL);c.setGravity(Gravity.CENTER_VERTICAL);c.setPadding(dp(10),dp(7),dp(10),dp(7));c.setClickable(true);c.setFocusable(true);return c;}
    private TextView addMap(LinearLayout c,String name,String detail){TextView title=text(name,16,INK);title.setTypeface(face);c.addView(title);TextView note=text(detail,11,MUTED);c.addView(note);TextView mark=text("",10,CYAN);c.addView(mark);return mark;}
    private void decorateMap(LinearLayout c,TextView mark,boolean selected,String name){c.setBackground(background(selected?0xFF11343B:0xFF101E23,selected?CYAN:0xFF37515A));c.setSelected(selected);c.setContentDescription(name+(selected?", selected":", not selected"));mark.setText(selected?"SELECTED":"");c.setEnabled(!downloading);}
    private void refresh(){
        decorateMap(mapOne,mapOneMark,"td1".equals(map),"Tower Defense 1 map");decorateMap(mapTwo,mapTwoMark,"td2".equals(map),"Tower Defense 2 map");
        normal.setBackground(background("normal".equals(mode)?0xFF164852:0xFF101E23,"normal".equals(mode)?CYAN:0xFF37515A));normal.setSelected("normal".equals(mode));
        high.setBackground(background("high".equals(mode)?0xFF164852:0xFF101E23,"high".equals(mode)?CYAN:0xFF37515A));high.setSelected("high".equals(mode));
        normal.setEnabled(!downloading);high.setEnabled(!downloading);music.setEnabled(!downloading&&musicChecked);
        download.setText(cached?"HQ · READY OFFLINE":"HQ · DOWNLOAD 95 MiB");download.setContentDescription(cached?"HQ pack ready offline":"Download High Quality graphics");download.setEnabled(!downloading&&!cached);
        start.setText(downloading?"DOWNLOADING…":"PLAY TOWER DEFENSE "+("td1".equals(map)?"1":"2"));start.setEnabled(!downloading&&musicChecked&&(!"high".equals(mode)||cached));start.setAlpha(start.isEnabled()?1f:.45f);download.setAlpha(cached?.7f:1f);
    }
    String selectedMode(){return mode;}
    String selectedMap(){return map;}
    void setCached(boolean value){cached=value;refresh();}
    void setMusicState(boolean ready,boolean on){musicChecked=true;music.setText(ready?(on?"MUSIC · ON":"MUSIC · OFF"):"MUSIC · CHOOSE TRACKS");music.setContentDescription("Music settings");refresh();}
    void setDownloading(boolean value){downloading=value;cancel.setVisibility(value?VISIBLE:GONE);progress.setVisibility(value?VISIBLE:GONE);refresh();}
    void downloadProgress(long bytes,boolean verifying){setDownloading(true);progress.setIndeterminate(verifying);progress.setProgress((int)(bytes*1000/GraphicsPackStore.BYTES));showStatus(verifying?"Verifying HQ download…":String.format(java.util.Locale.ROOT,"HQ download · %d%% · %.1f / 95 MiB",bytes*100/GraphicsPackStore.BYTES,bytes/1048576.0),false);}
    void showError(String message){setDownloading(false);showStatus(message,true);}
    void showStatus(String message,boolean error){status.setText(message);status.setTextColor(error?0xFFFFAE9F:MUTED);status.setVisibility(VISIBLE);}
    private GradientDrawable background(int fill,int border){GradientDrawable b=new GradientDrawable();b.setColor(fill);b.setCornerRadius(dp(6));b.setStroke(dp(1),border);return b;}
    private TextView text(String value,int size,int color){TextView t=new TextView(getContext());t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);return t;}
    private Button button(String value,boolean primary){Button b=new Button(getContext());b.setText(value);b.setTextColor(INK);b.setTextSize(primary?18:12);b.setTypeface(face);b.setAllCaps(false);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(0);b.setMinimumHeight(0);b.setPadding(dp(6),0,dp(6),0);b.setBackground(background(primary?0xFF075F6A:0xFF101E23,primary?CYAN:0xFF37515A));return b;}
    private void add(LinearLayout parent,View child,int top,int bottom){add(parent,child,top,bottom,-2);}
    private void add(LinearLayout parent,View child,int top,int bottom,int height){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,height<0?height:dp(height));p.topMargin=dp(top);p.bottomMargin=dp(bottom);parent.addView(child,p);}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
