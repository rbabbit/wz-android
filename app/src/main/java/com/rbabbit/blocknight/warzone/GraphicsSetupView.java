package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Direct map tabs, rectangular Play and utilities in a shallow footer. */
final class GraphicsSetupView extends FrameLayout {
    interface Actions {
        void start(String mode, String map); void cancel(); void music(); void download(); void map(String id);
    }
    private static final int INK=0xFFF0E8D3, MUTED=0xFFB4C4C3, CYAN=0xFF83CDD1;
    private final Actions actions;
    private final Typeface face;
    private final FrameLayout mapOne, mapTwo;
    private final View mapOneMark, mapTwoMark;
    private final TextView status;
    private final Button graphics, start, cancel, music, download;
    private final ProgressBar progress;
    private final Footer footer;
    private String mode, map;
    private boolean cached, downloading, musicChecked, musicCached, musicOn, shortLabels;

    GraphicsSetupView(Context context, String selected, String selectedMap, Actions actions) {
        super(context);this.actions=actions;mode="high".equals(selected)?"high":"normal";map="td1".equals(selectedMap)?"td1":"td2";
        face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF38251D);setClickable(true);setFocusable(true);
        addView(new WarzoneSplashView(context),new LayoutParams(-1,-1));
        LinearLayout maps=new LinearLayout(context);
        mapOne=mapTab("DUSTFALL","NoQ");mapTwo=mapTab("IRON VALLEY","arc");
        mapOneMark=mapOne.getChildAt(1);mapTwoMark=mapTwo.getChildAt(1);
        maps.addView(mapOne,new LinearLayout.LayoutParams(0,dp(48),1));
        maps.addView(mapTwo,new LinearLayout.LayoutParams(0,dp(48),1));
        mapOne.setOnClickListener(v->chooseMap("td1"));mapTwo.setOnClickListener(v->chooseMap("td2"));
        LinearLayout play=new LinearLayout(context);play.setOrientation(LinearLayout.VERTICAL);play.setGravity(Gravity.BOTTOM);
        TextView detail=text("30 waves · Defend your command centre",12,INK);detail.setGravity(Gravity.CENTER);detail.setMaxLines(2);
        play.addView(detail,new LinearLayout.LayoutParams(-1,dp(28)));
        start=button("PLAY",true);start.setOnClickListener(v->{if(start.isEnabled())actions.start(mode,map);});
        play.addView(start,new LinearLayout.LayoutParams(-1,dp(48)));
        LinearLayout options=new LinearLayout(context);options.setGravity(Gravity.CENTER_VERTICAL);
        graphics=button("GRAPHICS · NORMAL",false);graphics.setOnClickListener(v->showGraphics());
        android.graphics.drawable.Drawable arrow=context.getDrawable(android.R.drawable.arrow_down_float);arrow.setTint(MUTED);arrow.setBounds(0,0,dp(10),dp(10));graphics.setCompoundDrawables(null,null,arrow,null);graphics.setCompoundDrawablePadding(dp(4));
        music=button("MUSIC · CHECKING…",false);music.setEnabled(false);music.setOnClickListener(v->actions.music());
        download=button("HQ DOWNLOAD · 95 MiB",false);download.setOnClickListener(v->actions.download());
        for(Button b:new Button[]{graphics,music,download})options.addView(b,new LinearLayout.LayoutParams(0,dp(48),1));
        status=text("",12,MUTED);status.setMaxLines(2);status.setGravity(Gravity.CENTER_VERTICAL);status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        cancel=button("CANCEL DOWNLOAD",false);cancel.setVisibility(GONE);
        cancel.setOnClickListener(v->{actions.cancel();setDownloading(false);showStatus("Download paused. Your progress is saved.",false);});
        LinearLayout message=new LinearLayout(context);message.setGravity(Gravity.CENTER_VERTICAL);message.setVisibility(GONE);
        message.addView(status,new LinearLayout.LayoutParams(0,dp(48),1));message.addView(cancel,new LinearLayout.LayoutParams(dp(150),dp(48)));
        progress=new ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1000);progress.setProgressTintList(ColorStateList.valueOf(CYAN));progress.setVisibility(GONE);
        footer=new Footer(context,maps,play,options,message);addView(footer,new LayoutParams(-1,-2,Gravity.BOTTOM));refresh();
    }
    private String mapName(){return "td1".equals(map)?"Dustfall":"Iron Valley";}
    private void chooseMap(String id){if(downloading)return;map=id;actions.map(id);refresh();}
    private FrameLayout mapTab(String name,String author){
        FrameLayout tab=new FrameLayout(getContext());tab.setClickable(true);tab.setFocusable(true);
        LinearLayout line=new LinearLayout(getContext());line.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=text(name,15,INK);title.setTypeface(face);title.setSingleLine(true);line.addView(title);
        TextView note=text(author,11,MUTED);LinearLayout.LayoutParams n=new LinearLayout.LayoutParams(-2,-2);n.leftMargin=dp(10);line.addView(note,n);
        LayoutParams content=new LayoutParams(-2,-1,Gravity.CENTER);content.bottomMargin=dp(2);tab.addView(line,content);
        View underline=new View(getContext());underline.setBackgroundColor(CYAN);LayoutParams u=new LayoutParams(-1,dp(2),Gravity.BOTTOM);u.setMargins(dp(12),0,dp(12),0);tab.addView(underline,u);
        tab.setForeground(new RippleDrawable(ColorStateList.valueOf(0x2283CDD1),null,null));return tab;
    }
    private void decorateMap(FrameLayout tab,View mark,boolean selected,String name){
        tab.setSelected(selected);tab.setContentDescription(name+" map, "+(selected?"selected":"not selected"));mark.setVisibility(selected?VISIBLE:INVISIBLE);tab.setEnabled(!downloading);tab.setAlpha(downloading?.5f:1f);
    }
    private void showGraphics(){
        if(downloading)return;PopupMenu popup=new PopupMenu(getContext(),graphics);
        popup.getMenu().add(0,1,Menu.NONE,"Normal").setCheckable(true).setChecked("normal".equals(mode));
        popup.getMenu().add(0,2,Menu.NONE,"High Quality").setCheckable(true).setChecked("high".equals(mode));popup.getMenu().setGroupCheckable(0,true,true);
        popup.setOnMenuItemClickListener(item->{mode=item.getItemId()==2?"high":"normal";refresh();return true;});popup.show();
    }
    private void refresh(){
        decorateMap(mapOne,mapOneMark,"td1".equals(map),"Dustfall");decorateMap(mapTwo,mapTwoMark,"td2".equals(map),"Iron Valley");
        graphics.setText("GRAPHICS"+(shortLabels?"\n":" · ")+("high".equals(mode)?"HQ":"NORMAL"));graphics.setContentDescription("Graphics options, "+("high".equals(mode)?"High Quality":"Normal"));graphics.setEnabled(!downloading);music.setEnabled(!downloading&&musicChecked);
        music.setText(musicChecked?(musicCached?("MUSIC"+(shortLabels?"\n":" · ")+(musicOn?"ON":"OFF")):(shortLabels?"CHOOSE\nMUSIC":"MUSIC · CHOOSE TRACKS")):"MUSIC · CHECKING…");
        download.setText(cached?(shortLabels?"HQ\nREADY":"HQ · READY OFFLINE"):(shortLabels?"HQ DOWNLOAD\n95 MiB":"HQ DOWNLOAD · 95 MiB"));download.setContentDescription(cached?"HQ pack ready offline":"Download High Quality graphics");download.setEnabled(!downloading&&!cached);download.setAlpha(cached?.7f:1f);
        start.setText(downloading?"DOWNLOADING…":"PLAY "+mapName().toUpperCase(java.util.Locale.ROOT));start.setContentDescription("Start game, "+mapName());start.setEnabled(!downloading&&musicChecked&&(!"high".equals(mode)||cached));start.setAlpha(start.isEnabled()?1f:.45f);
    }
    String selectedMode(){return mode;}
    String selectedMap(){return map;}
    void setCached(boolean value){cached=value;refresh();}
    void setMusicState(boolean ready,boolean on){musicChecked=true;musicCached=ready;musicOn=on;music.setContentDescription("Music settings");refresh();}
    void setDownloading(boolean value){downloading=value;cancel.setVisibility(value?VISIBLE:GONE);progress.setVisibility(value?VISIBLE:GONE);refresh();footer.requestLayout();}
    void downloadProgress(long bytes,boolean verifying){setDownloading(true);progress.setIndeterminate(verifying);progress.setProgress((int)(bytes*1000/GraphicsPackStore.BYTES));showStatus(verifying?"Verifying HQ download…":String.format(java.util.Locale.ROOT,"HQ download · %d%% · %.1f / 95 MiB",bytes*100/GraphicsPackStore.BYTES,bytes/1048576.0),false);}
    void showError(String message){setDownloading(false);showStatus(message,true);}
    void showStatus(String message,boolean error){status.setText(message);status.setTextColor(error?0xFFFFAE9F:MUTED);footer.message.setVisibility(VISIBLE);footer.requestLayout();}
    private GradientDrawable shape(int fill,int border){GradientDrawable b=new GradientDrawable();b.setColor(fill);b.setCornerRadius(dp(5));if(border!=0)b.setStroke(dp(1),border);return b;}
    private TextView text(String value,int size,int color){TextView t=new TextView(getContext());t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);return t;}
    private Button button(String value,boolean primary){Button b=new Button(getContext());b.setText(value);b.setTextColor(INK);b.setTextSize(primary?20:12);b.setTypeface(face);b.setAllCaps(false);b.setSingleLine(true);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(0);b.setMinimumHeight(0);b.setPadding(dp(5),0,dp(5),0);b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x3383CDD1),shape(primary?0xFF075F6A:0x00000000,primary?CYAN:0),null));return b;}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}

    private final class Footer extends FrameLayout {
        final View maps,play,options,base;final LinearLayout message;
        boolean stacked;int messageHeight,bodyHeight,pad,gap,playWidth,leftWidth;
        Footer(Context context,View maps,View play,View options,LinearLayout message){
            super(context);this.maps=maps;this.play=play;this.options=options;this.message=message;
            base=new View(context);base.setBackgroundColor(0xE6071215);addView(base);addView(message);addView(progress);addView(maps);addView(play);addView(options);
        }
        private void exact(View v,int w,int h){v.measure(MeasureSpec.makeMeasureSpec(Math.max(0,w),MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(Math.max(0,h),MeasureSpec.EXACTLY));}
        @Override protected void onMeasure(int width,int height){
            int w=MeasureSpec.getSize(width);pad=dp(16);gap=dp(12);stacked=w<dp(720)||getResources().getConfiguration().fontScale>1.15f;
            boolean shorter=w<dp(960)&&!stacked;if(shortLabels!=shorter){shortLabels=shorter;for(Button v:new Button[]{graphics,music,download}){v.setSingleLine(!shorter);v.setMaxLines(shorter?2:1);}refresh();}
            bodyHeight=dp(stacked?140:84);messageHeight=message.getVisibility()==VISIBLE?dp(52):0;
            int span=w-pad*2;playWidth=stacked?(span-gap)/2:Math.min(dp(330),Math.round(span*.28f));leftWidth=stacked?(span-gap)/2:(span-playWidth-gap*2)/2;
            exact(base,w,bodyHeight+messageHeight-dp(24));exact(message,span,dp(48));exact(progress,span,dp(4));exact(maps,leftWidth,dp(48));exact(play,playWidth,dp(76));exact(options,stacked?span:leftWidth,dp(48));setMeasuredDimension(w,bodyHeight+messageHeight);
        }
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b){
            int w=r-l,top=messageHeight;base.layout(0,messageHeight==0?dp(24):0,w,b-t);message.layout(pad,0,w-pad,dp(48));progress.layout(pad,dp(48),w-pad,dp(52));
            maps.layout(pad,top+dp(28),pad+leftWidth,top+dp(76));int x=stacked?pad+leftWidth+gap:(w-playWidth)/2;play.layout(x,top,x+playWidth,top+dp(76));
            int ox=stacked?pad:w-pad-leftWidth,oy=top+dp(stacked?84:28);options.layout(ox,oy,w-pad,oy+dp(48));
        }
    }
}
