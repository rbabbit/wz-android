package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

/** Native public-list landing only. The existing web session owns all joins and games. */
final class MultiplayerLobbyView extends LinearLayout {
    interface Actions { void back();void refresh();void filter(boolean hide);boolean saveName(String base);void join(String id); }
    private final Actions actions;
    private final Typeface face;
    private final EditText name;
    private final CheckBox hide;
    private final Button refresh;
    private final TextView status,empty;
    private final ListView list;
    private final RoomAdapter adapter=new RoomAdapter();
    private boolean ready,loading,busy,settingFilter;
    private List<MultiplayerLobbyModel.Room> rooms=new ArrayList<>();

    MultiplayerLobbyView(Context context,Actions actions,String base) {
        super(context);this.actions=actions;face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setOrientation(VERTICAL);setBackgroundColor(0xff090909);setPadding(dp(14),dp(7),dp(14),dp(5));setClickable(true);setFocusableInTouchMode(true);
        Flow header=new Flow(context);addView(header,new LayoutParams(-1,-2));
        Button back=button("‹",false);back.setTextSize(34);back.setContentDescription("Back to game modes");back.setOnClickListener(v->actions.back());header.addView(back,new ViewGroup.LayoutParams(dp(48),dp(48)));
        TextView title=text("MULTIPLAYER",22,TowersTheme.TEXT);title.setPadding(dp(4),0,dp(12),0);header.addView(title,new ViewGroup.LayoutParams(-2,dp(48)));
        LinearLayout profile=new LinearLayout(context);profile.setGravity(Gravity.CENTER_VERTICAL);
        TextView label=text("Player name",17,TowersTheme.TEXT);label.setPadding(0,0,dp(8),0);profile.addView(label,new LayoutParams(-2,dp(48)));
        LinearLayout field=new LinearLayout(context);field.setGravity(Gravity.CENTER_VERTICAL);field.setBackground(TowersTheme.control(context,TowersTheme.CONTROL,5));
        name=new EditText(context);name.setSingleLine(true);name.setTypeface(face);name.setTextSize(20);name.setTextColor(TowersTheme.TEXT);name.setBackgroundColor(0x00000000);name.setPadding(dp(10),0,dp(2),0);name.setSelectAllOnFocus(false);name.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);name.setImeOptions(EditorInfo.IME_ACTION_DONE|EditorInfo.IME_FLAG_NO_EXTRACT_UI|EditorInfo.IME_FLAG_NO_FULLSCREEN);name.setContentDescription("Player name, up to twelve characters, fixed mobile suffix");
        name.setFilters(new InputFilter[]{(source,start,end,dest,dstart,dend)->{
            String prefix=dest.subSequence(0,dstart).toString(),suffix=dest.subSequence(dend,dest.length()).toString();
            int remaining=12-prefix.codePointCount(0,prefix.length())-suffix.codePointCount(0,suffix.length());
            String insert=source.subSequence(start,end).toString();int count=insert.codePointCount(0,insert.length());
            if(count<=remaining)return null;if(remaining<=0)return "";
            return source.subSequence(start,start+insert.offsetByCodePoints(0,remaining));
        }});
        name.setText(MultiplayerLobbyModel.limitBase(base));field.addView(name,new LayoutParams(dp(134),dp(46)));
        TextView suffix=text("(m)",20,TowersTheme.TEXT);suffix.setPadding(0,0,dp(10),0);suffix.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);field.addView(suffix,new LayoutParams(-2,dp(46)));profile.addView(field,new LayoutParams(-2,dp(46)));
        header.addView(profile,new ViewGroup.LayoutParams(-2,dp(48)));
        hide=new CheckBox(context);hide.setText("Hide empty");hide.setTypeface(face);hide.setTextSize(18);hide.setTextColor(TowersTheme.TEXT);hide.setButtonTintList(ColorStateList.valueOf(TowersTheme.TEXT));hide.setMinHeight(dp(48));hide.setPadding(dp(8),0,dp(7),0);hide.setOnCheckedChangeListener((v,checked)->{if(!settingFilter){adapter.refresh();actions.filter(checked);}});header.addView(hide,new ViewGroup.LayoutParams(-2,dp(48)));
        refresh=button("REFRESH",false);refresh.setTextSize(18);refresh.setOnClickListener(v->actions.refresh());header.addView(refresh,new ViewGroup.LayoutParams(dp(98),dp(48)));
        status=text("Loading rooms…",13,TowersTheme.SECONDARY);status.setPadding(dp(4),0,dp(4),0);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);addView(status,new LayoutParams(-1,-2));
        FrameLayout body=new FrameLayout(context);addView(body,new LayoutParams(-1,0,1));
        list=new ListView(context);list.setBackgroundColor(0xff090909);list.setDivider(null);list.setDividerHeight(0);list.setVerticalScrollBarEnabled(true);list.setClipToPadding(false);list.setPadding(0,dp(8),0,0);list.setAdapter(adapter);body.addView(list,new FrameLayout.LayoutParams(-1,-1));
        empty=text("Loading public rooms…",18,TowersTheme.SECONDARY);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(18),dp(8),dp(18),dp(8));body.addView(empty,new FrameLayout.LayoutParams(-1,-1));list.setEmptyView(empty);
        name.setOnFocusChangeListener((v,focused)->{if(!focused)actions.saveName(name.getText().toString());});
        name.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_DONE){if(!actions.saveName(name.getText().toString()))return true;name.clearFocus();hideKeyboard();return true;}return false;});
        updateControls();requestFocus();
    }
    void state(boolean ready,boolean loading,boolean hideEmpty,List<MultiplayerLobbyModel.Room> rooms,String error,String notice) {
        this.ready=ready;this.loading=loading;this.busy=false;this.rooms=rooms;
        settingFilter=true;hide.setChecked(hideEmpty);settingFilter=false;adapter.refresh();
        String message=loading?"Loading rooms…":!error.isEmpty()?error:notice;
        status.setText(message);status.setVisibility(message.isEmpty()?GONE:VISIBLE);
        empty.setText(loading?"Loading public rooms…":!error.isEmpty()?error:hideEmpty&&!rooms.isEmpty()?"No occupied rooms. Turn off Hide empty to see all rooms.":"No public rooms are currently listed.");updateControls();
    }
    void pending(boolean value,String message) { busy=value;status.setText(message);status.setVisibility(message.isEmpty()?GONE:VISIBLE);updateControls();adapter.notifyDataSetChanged(); }
    void profileError(String message) { status.setText(message);status.setVisibility(VISIBLE);name.requestFocus(); }
    String draft() { return name.getText().toString(); }
    void acceptedName(String base) { if(!name.getText().toString().equals(base)){name.setText(base);name.setSelection(name.length());} }
    private void updateControls() { refresh.setEnabled(ready&&!loading&&!busy);hide.setEnabled(ready&&!busy);name.setEnabled(!busy); }
    private void hideKeyboard(){android.view.inputmethod.InputMethodManager ime=(android.view.inputmethod.InputMethodManager)getContext().getSystemService(Context.INPUT_METHOD_SERVICE);if(ime!=null)ime.hideSoftInputFromWindow(getWindowToken(),0);}
    private TextView text(String value,int size,int color){TextView v=new TextView(getContext());v.setText(value);v.setTypeface(face);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER_VERTICAL);v.setIncludeFontPadding(false);return v;}
    private Button button(String value,boolean primary){Button b=new Button(getContext());b.setText(value);b.setTypeface(face);b.setAllCaps(false);b.setTextColor(TowersTheme.buttonText(primary));b.setMinHeight(0);b.setMinimumHeight(0);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(10),0,dp(10),0);b.setBackgroundTintList(null);b.setBackground(new RippleDrawable(ColorStateList.valueOf(primary?TowersTheme.PRIMARY_RIPPLE:TowersTheme.RIPPLE),TowersTheme.control(getContext(),primary?TowersTheme.PRIMARY:TowersTheme.CONTROL,5),null));return b;}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private final class RoomAdapter extends BaseAdapter {
        private List<MultiplayerLobbyModel.Room> visible=new ArrayList<>();
        void refresh(){visible=MultiplayerLobbyModel.visible(rooms,hide.isChecked());notifyDataSetChanged();}
        @Override public int getCount(){return visible.size();}
        @Override public Object getItem(int p){return visible.get(p);}
        @Override public long getItemId(int p){return visible.get(p).id.hashCode();}
        @Override public View getView(int position,View reused,ViewGroup parent){
            Row row=reused instanceof Row?(Row)reused:new Row();MultiplayerLobbyModel.Room room=visible.get(position);row.room=room;
            row.map.setText(room.mapLabel());row.details.setText(room.roomLabel());row.count.setText(room.counts());row.join.setText(room.actionLabel());row.join.setEnabled(ready&&!loading&&!busy&&room.joinable());row.join.setContentDescription(room.joinable()?"Join "+room.roomLabel():room.roomLabel()+": "+room.reason());return row;
        }
    }
    private final class Row extends LinearLayout {
        final TextView map,details,count;final Button join;MultiplayerLobbyModel.Room room;
        Row(){super(MultiplayerLobbyView.this.getContext());setOrientation(HORIZONTAL);setGravity(Gravity.CENTER_VERTICAL);setPadding(dp(7),dp(9),dp(6),dp(9));
            LinearLayout labels=new LinearLayout(getContext());labels.setOrientation(VERTICAL);labels.setPadding(0,0,dp(8),0);map=text("",23,TowersTheme.TEXT);map.setSingleLine(true);map.setEllipsize(TextUtils.TruncateAt.END);details=text("",16,TowersTheme.SECONDARY);details.setSingleLine(true);details.setEllipsize(TextUtils.TruncateAt.END);labels.addView(map,new LayoutParams(-1,-2));labels.addView(details,new LayoutParams(-1,-2));addView(labels,new LayoutParams(0,-2,1));
            count=text("",23,TowersTheme.TEXT);count.setGravity(Gravity.CENTER);count.setMaxLines(2);addView(count,new LayoutParams(dp(83),-2));
            join=button("JOIN",true);join.setTextSize(19);LayoutParams p=new LayoutParams(dp(94),dp(48));p.leftMargin=dp(8);addView(join,p);setMinimumHeight(dp(78));
            join.setOnClickListener(v->{if(room==null||!room.joinable()||!ready||loading||busy)return;if(!actions.saveName(draft()))return;name.clearFocus();hideKeyboard();pending(true,"Joining room…");actions.join(room.id);});
        }
    }
    /** Native children wrap as a unit; no compressed webpage-style header. */
    private final class Flow extends ViewGroup {
        Flow(Context c){super(c);}
        @Override protected void onMeasure(int ws,int hs){int width=MeasureSpec.getSize(ws),x=0,y=0,row=0,gap=dp(7);for(int i=0;i<getChildCount();i++){View v=getChildAt(i);measureChild(v,ws,hs);int w=v.getMeasuredWidth(),h=v.getMeasuredHeight();if(x>0&&x+w>width){y+=row+dp(3);x=0;row=0;}x+=w+gap;row=Math.max(row,h);}setMeasuredDimension(width,y+row+dp(4));}
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b){int width=r-l,x=0,y=0,row=0,gap=dp(7);for(int i=0;i<getChildCount();i++){View v=getChildAt(i);int w=v.getMeasuredWidth(),h=v.getMeasuredHeight();if(x>0&&x+w>width){y+=row+dp(3);x=0;row=0;}v.layout(x,y,x+w,y+h);x+=w+gap;row=Math.max(row,h);}}
    }
}
