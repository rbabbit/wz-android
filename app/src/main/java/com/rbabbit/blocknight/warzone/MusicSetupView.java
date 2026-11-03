package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Optional Music setup; original album/track controls remain inside Warzone. */
final class MusicSetupView extends FrameLayout {
    interface Actions { void download(); void cancel(); void enabled(boolean on); void close(); }
    private final Actions actions;
    private final Typeface face;
    private final CheckBox enabled;
    private final TextView status;
    private final ProgressBar progress;
    private final Button download, back;
    private boolean cached, busy, updating;
    private static final int INK=0xFFF0E8D3, CYAN=0xFF83CDD1, MUTED=0xFFB4C4C3;

    MusicSetupView(Context context, Actions actions) {
        super(context); this.actions=actions;
        face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF050B0C); setClickable(true); setFocusable(true);
        ImageView art=new ImageView(context); art.setImageResource(R.drawable.warzone_splash);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP); addView(art,new LayoutParams(-1,-1));
        android.view.View shade=new android.view.View(context);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xED081315,0xE5071012,0xF5050B0C})); addView(shade,new LayoutParams(-1,-1));
        LinearLayout panel=new LinearLayout(context); panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(24),dp(18),dp(24),dp(18)); addView(panel,new LayoutParams(-1,-1,Gravity.CENTER));
        ScrollView scroll=new ScrollView(context); scroll.setFillViewport(true);
        LinearLayout content=new LinearLayout(context); content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL); scroll.addView(content,new ScrollView.LayoutParams(-1,-1));
        panel.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        TextView eyebrow=text("WARZONE TOWERS",12,CYAN); eyebrow.setTypeface(face); content.addView(eyebrow);
        TextView title=text("MUSIC",30,INK); title.setTypeface(face); add(content,title,5,9);
        add(content,text("The complete official Warzone music collection.",15,INK),0,14);
        TextView albums=text("WARZONE 2100 OST  ·  LEGACY\nAFTERMATH  ·  RECLAMATION",18,CYAN);
        albums.setTypeface(face); add(content,albums,0,10);
        add(content,text("39 album tracks + menu theme\n110 MiB · Download once from our server · Play offline",13,MUTED),0,14);
        enabled=new CheckBox(context); enabled.setText("Use music in battle"); enabled.setTextColor(INK);
        enabled.setTextSize(15); enabled.setButtonTintList(ColorStateList.valueOf(CYAN));
        enabled.setPadding(0,dp(3),0,dp(3)); content.addView(enabled,new LinearLayout.LayoutParams(-1,dp(48)));
        enabled.setOnCheckedChangeListener((button,on)->{if(!updating&&cached&&!busy)actions.enabled(on);});
        add(content,text("Use MUSIC in battle to choose albums and tracks in Warzone’s original Music Manager.",13,MUTED),7,10);
        status=text("Download Music to enable these options.",13,MUTED);
        add(panel,status,8,8);
        progress=new ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal); progress.setMax(1000);
        progress.setProgressTintList(ColorStateList.valueOf(CYAN));progress.setVisibility(GONE);
        LinearLayout.LayoutParams progressParams=new LinearLayout.LayoutParams(-1,dp(5));progressParams.bottomMargin=dp(10);
        panel.addView(progress,progressParams);
        LinearLayout buttons=new LinearLayout(context);
        back=button("BACK",false);back.setOnClickListener(v->{actions.cancel();actions.close();});
        LinearLayout.LayoutParams backParams=new LinearLayout.LayoutParams(0,dp(48),1);backParams.rightMargin=dp(12);
        buttons.addView(back,backParams);
        download=button("DOWNLOAD MUSIC",true);
        download.setOnClickListener(v->{if(cached)actions.close();else actions.download();});
        buttons.addView(download,new LinearLayout.LayoutParams(0,dp(48),2)); panel.addView(buttons);
        addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
            LayoutParams params=(LayoutParams)panel.getLayoutParams();int width=Math.min(getWidth(),dp(900));
            if(params.width!=width){params.width=width;panel.setLayoutParams(params);}
        });
        setCached(false,false);
    }
    void setCached(boolean ready,boolean on){
        cached=ready;updating=true;enabled.setChecked(ready&&on);updating=false;
        enabled.setEnabled(ready&&!busy);download.setText(ready?"DONE":"DOWNLOAD MUSIC");
        download.setContentDescription(download.getText());
        status.setText(ready?"Downloaded · Verified · Ready offline":"Download Music to enable these options.");status.setTextColor(MUTED);
    }
    void progress(long bytes,boolean verifying){
        busy=true;enabled.setEnabled(false);progress.setVisibility(VISIBLE);progress.setIndeterminate(verifying);
        progress.setProgress((int)(bytes*1000/MusicPackStore.BYTES));download.setEnabled(false);
        download.setText("PREPARING MUSIC…");download.setContentDescription(download.getText());
        back.setText("CANCEL DOWNLOAD");back.setOnClickListener(v->{actions.cancel();paused();});
        status.setText(verifying?"Verifying your Music download…":String.format(java.util.Locale.ROOT,
                "Downloading Music · %d%% · %.1f / 109.4 MiB",bytes*100/MusicPackStore.BYTES,bytes/1048576.0));status.setTextColor(MUTED);
    }
    private void idle(){busy=false;progress.setVisibility(GONE);download.setEnabled(true);enabled.setEnabled(cached);
        back.setText("BACK");back.setOnClickListener(v->{actions.cancel();actions.close();});}
    void paused(){idle();download.setText("RESUME DOWNLOAD");download.setContentDescription(download.getText());status.setText("Download paused. Your progress is saved.");}
    void ready(boolean on){idle();setCached(true,on);}
    void failed(String message){idle();status.setText(message);status.setTextColor(0xFFFFAE9F);download.setText("RETRY DOWNLOAD");download.setContentDescription(download.getText());}
    private void add(LinearLayout parent,TextView view,int top,int bottom){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(top);p.bottomMargin=dp(bottom);parent.addView(view,p);}
    private TextView text(String value,int size,int color){TextView t=new TextView(getContext());t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);return t;}
    private Button button(String value,boolean primary){Button b=new Button(getContext());b.setText(value);b.setTextColor(INK);b.setTypeface(face);b.setTextSize(14);b.setAllCaps(false);b.setPadding(dp(10),0,dp(10),0);
        GradientDrawable bg=new GradientDrawable();bg.setColor(primary?0xFF075F6A:0xFF172629);bg.setCornerRadius(dp(5));bg.setStroke(dp(1),primary?CYAN:0xFF566C70);b.setBackground(bg);return b;}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
