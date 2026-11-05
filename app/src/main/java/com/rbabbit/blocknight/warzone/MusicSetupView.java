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
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Native playlist choices before the engine starts. Never opens a battle menu. */
final class MusicSetupView extends FrameLayout {
    interface Actions {
        void download(); void cancel(); void enabled(boolean on); void close(); void start();
        void tracks(Set<String> selected);
    }
    private final Actions actions;
    private final Typeface face;
    private final CheckBox enabled;
    private final TextView status, count;
    private final ProgressBar progress;
    private final Button download, back, start, all, clear;
    private final Map<String,CheckBox> tracks=new LinkedHashMap<>();
    private boolean cached, busy, updating;
    private static final int INK=0xFFF0E8D3, CYAN=0xFF83CDD1, MUTED=0xFFB4C4C3;

    MusicSetupView(Context context, MusicTrackCatalog catalog, Set<String> selected, Actions actions) {
        super(context); this.actions=actions;
        face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setBackgroundColor(0xFF050B0C);setClickable(true);setFocusable(true);
        ImageView art=new ImageView(context);art.setImageResource(R.drawable.warzone_splash);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);addView(art,new LayoutParams(-1,-1));
        android.view.View shade=new android.view.View(context);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xEB081315,0xE8071012,0xF5050B0C}));addView(shade,new LayoutParams(-1,-1));
        LinearLayout panel=new LinearLayout(context);panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20),dp(12),dp(20),dp(12));addView(panel,new LayoutParams(-1,-1,Gravity.CENTER));
        LinearLayout header=new LinearLayout(context);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=text("MUSIC",25,INK);title.setTypeface(face);
        header.addView(title,new LinearLayout.LayoutParams(0,dp(44),1));
        start=button("START GAME",true);start.setContentDescription("Start game");
        start.setOnClickListener(v->tryStart());
        header.addView(start,new LinearLayout.LayoutParams(dp(126),dp(44)));panel.addView(header);
        ScrollView scroll=new ScrollView(context);scroll.setFillViewport(false);
        LinearLayout content=new LinearLayout(context);content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content,new ScrollView.LayoutParams(-1,-2));
        panel.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        add(content,text("Choose your tracks. Nothing is selected by default.",14,INK),8,5);
        add(content,text("39 original tracks · Four albums · Original menu theme\n110 MiB · Download once from our server · Play offline",12,MUTED),0,8);
        enabled=new CheckBox(context);enabled.setText("Music on");enabled.setTextColor(INK);
        enabled.setButtonTintList(ColorStateList.valueOf(CYAN));
        content.addView(enabled,new LinearLayout.LayoutParams(-1,dp(48)));
        enabled.setOnCheckedChangeListener((button,on)->{if(!updating&&cached&&!busy){actions.enabled(on);refresh();}});
        LinearLayout selectionBar=new LinearLayout(context);selectionBar.setGravity(Gravity.CENTER_VERTICAL);
        count=text("",13,CYAN);selectionBar.addView(count,new LinearLayout.LayoutParams(0,dp(44),1));
        all=button("ALL",false);clear=button("CLEAR",false);
        all.setContentDescription("Select all music tracks");clear.setContentDescription("Clear music track selection");
        all.setOnClickListener(v->selectAll(true));clear.setOnClickListener(v->selectAll(false));
        selectionBar.addView(all,new LinearLayout.LayoutParams(dp(70),dp(44)));
        LinearLayout.LayoutParams clearParams=new LinearLayout.LayoutParams(dp(70),dp(44));clearParams.leftMargin=dp(8);
        selectionBar.addView(clear,clearParams);content.addView(selectionBar);
        for(MusicTrackCatalog.Album album:catalog.albums){
            TextView heading=text(album.title,19,CYAN);heading.setTypeface(face);add(content,heading,16,4);
            add(content,text(album.author,12,MUTED),0,5);
            for(MusicTrackCatalog.Track track:album.tracks){
                CheckBox choice=new CheckBox(context);choice.setText(track.title);choice.setTextColor(INK);
                choice.setTextSize(14);choice.setMinHeight(dp(48));choice.setButtonTintList(ColorStateList.valueOf(CYAN));
                choice.setContentDescription("Music track: "+album.title+" / "+track.title);
                choice.setChecked(selected.contains(track.id));tracks.put(track.id,choice);
                choice.setOnCheckedChangeListener((button,on)->{if(!updating){actions.tracks(selection());refresh();}});
                content.addView(choice,new LinearLayout.LayoutParams(-1,-2));
            }
        }
        status=text("Download Music to enable these options.",12,MUTED);add(panel,status,8,7);
        progress=new ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1000);
        progress.setProgressTintList(ColorStateList.valueOf(CYAN));progress.setVisibility(GONE);
        LinearLayout.LayoutParams progressParams=new LinearLayout.LayoutParams(-1,dp(5));progressParams.bottomMargin=dp(8);panel.addView(progress,progressParams);
        LinearLayout buttons=new LinearLayout(context);
        back=button("BACK",false);back.setOnClickListener(v->{actions.cancel();actions.close();});
        LinearLayout.LayoutParams backParams=new LinearLayout.LayoutParams(0,dp(44),1);backParams.rightMargin=dp(10);buttons.addView(back,backParams);
        download=button("DOWNLOAD MUSIC",true);download.setOnClickListener(v->{if(cached)actions.close();else actions.download();});
        buttons.addView(download,new LinearLayout.LayoutParams(0,dp(44),2));panel.addView(buttons);
        addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
            LayoutParams p=(LayoutParams)panel.getLayoutParams();int width=Math.min(getWidth(),dp(900));
            if(p.width!=width){p.width=width;panel.setLayoutParams(p);}
        });
        setCached(false,false);
    }
    private void tryStart(){if(!busy&&(!enabled.isChecked()||!selection().isEmpty()))actions.start();}
    private Set<String> selection(){Set<String> ids=new HashSet<>();for(Map.Entry<String,CheckBox> e:tracks.entrySet())if(e.getValue().isChecked())ids.add(e.getKey());return ids;}
    private void selectAll(boolean checked){updating=true;for(CheckBox c:tracks.values())c.setChecked(checked);updating=false;actions.tracks(selection());refresh();}
    private void refresh(){
        boolean usable=!busy;
        for(CheckBox c:tracks.values())c.setEnabled(usable);all.setEnabled(usable);clear.setEnabled(usable);
        int selected=selection().size();count.setText(selected+" / 39 selected");
        start.setEnabled(!busy&&(!enabled.isChecked()||selected>0));
        if(cached&&!busy){status.setText(enabled.isChecked()&&selected==0?"Select a track, or turn Music off to start.":"Saved automatically · Ready offline");status.setTextColor(MUTED);}
    }
    void setCached(boolean ready,boolean on){
        cached=ready;updating=true;enabled.setChecked(ready&&on);updating=false;
        enabled.setEnabled(ready&&!busy);download.setText(ready?"SAVE & BACK":"DOWNLOAD MUSIC");
        download.setContentDescription(download.getText());status.setText(ready?"Saved automatically · Ready offline":"Choose tracks, then download Music. Normal play needs no download.");refresh();
    }
    void progress(long bytes,boolean verifying){
        busy=true;enabled.setEnabled(false);progress.setVisibility(VISIBLE);progress.setIndeterminate(verifying);
        progress.setProgress((int)(bytes*1000/MusicPackStore.BYTES));download.setEnabled(false);
        download.setText("PREPARING MUSIC…");back.setText("CANCEL DOWNLOAD");back.setOnClickListener(v->{actions.cancel();paused();});refresh();
        status.setText(verifying?"Verifying your Music download…":String.format(java.util.Locale.ROOT,"Downloading Music · %d%% · %.1f / 109.4 MiB",bytes*100/MusicPackStore.BYTES,bytes/1048576.0));
    }
    private void idle(){busy=false;progress.setVisibility(GONE);download.setEnabled(true);enabled.setEnabled(cached);back.setText("BACK");back.setOnClickListener(v->{actions.cancel();actions.close();});refresh();}
    void paused(){idle();download.setText("RESUME DOWNLOAD");status.setText("Download paused. Your progress is saved.");}
    void ready(boolean on){idle();setCached(true,on);}
    void failed(String message){idle();status.setText(message);status.setTextColor(0xFFFFAE9F);download.setText("RETRY DOWNLOAD");}
    private void add(LinearLayout parent,TextView view,int top,int bottom){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(top);p.bottomMargin=dp(bottom);parent.addView(view,p);}
    private TextView text(String value,int size,int color){TextView t=new TextView(getContext());t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);return t;}
    private Button button(String value,boolean primary){Button b=new Button(getContext());b.setText(value);b.setTextColor(INK);b.setTypeface(face);b.setTextSize(14);b.setAllCaps(false);b.setPadding(dp(10),0,dp(10),0);GradientDrawable bg=new GradientDrawable();bg.setColor(primary?0xFF075F6A:0xFF172629);bg.setCornerRadius(dp(5));bg.setStroke(dp(1),primary?CYAN:0xFF566C70);b.setBackground(bg);return b;}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
