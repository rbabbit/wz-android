package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
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
import android.widget.GridView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

/** Native public-list landing only. The existing web session owns all joins and games. */
final class MultiplayerLobbyView extends LinearLayout {
    private static final int BACKGROUND = 0xFF0A0C0B;
    private static final int CARD = 0xFF141A18;
    private static final int CARD_BORDER = 0xFF4B5751;
    private static final int SAGE = 0xFFA8C79E;

    interface Actions { void filter(boolean hide);boolean saveName(String base);void join(String id); }
    private final Actions actions;
    private final Typeface face;
    private final EditText name;
    private final CheckBox hide;
    private final TextView status,empty;
    private final RoomAdapter adapter=new RoomAdapter();
    private boolean ready,loading,busy,settingFilter;
    private List<MultiplayerLobbyModel.Room> rooms=new ArrayList<>();

    MultiplayerLobbyView(Context context,Actions actions,String base) {
        super(context);this.actions=actions;face=Typeface.createFromAsset(context.getAssets(),"warzone/ui/Oswald.ttf");
        setOrientation(VERTICAL);setBackgroundColor(BACKGROUND);setPadding(dp(14),dp(10),dp(14),dp(5));setClickable(true);setFocusableInTouchMode(true);
        Header header=new Header(context);addView(header,new LayoutParams(-1,-2));
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
        TextView title=text("Join Live Game",23,TowersTheme.TEXT);
        title.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        if(Build.VERSION.SDK_INT>=28)title.setAccessibilityHeading(true);
        header.addView(title,new ViewGroup.LayoutParams(-2,dp(48)));
        View divider=new View(context);
        divider.setBackgroundColor(SAGE);
        LayoutParams dividerParams=new LayoutParams(-1,dp(1));
        dividerParams.topMargin=dp(3);
        dividerParams.bottomMargin=dp(8);
        addView(divider,dividerParams);
        status=text("Loading rooms…",13,TowersTheme.SECONDARY);status.setPadding(dp(4),0,dp(4),0);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);addView(status,new LayoutParams(-1,-2));
        FrameLayout body=new FrameLayout(context);addView(body,new LayoutParams(-1,0,1));
        GridView grid=new GridView(context) {
            @Override protected void onMeasure(int widthSpec,int heightSpec) {
                int width=MeasureSpec.getSize(widthSpec)-getPaddingLeft()-getPaddingRight();
                int columns=Math.max(1,Math.min(3,(width+dp(8))/dp(204)));
                if(getNumColumns()!=columns)setNumColumns(columns);
                super.onMeasure(widthSpec,heightSpec);
            }
        };
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setHorizontalSpacing(dp(8));
        grid.setVerticalSpacing(dp(8));
        grid.setVerticalScrollBarEnabled(true);
        grid.setPadding(0,dp(14),0,dp(8));
        grid.setClipToPadding(false);
        grid.setAdapter(adapter);
        body.addView(grid,new FrameLayout.LayoutParams(-1,-1));
        empty=text("Loading public rooms…",18,TowersTheme.SECONDARY);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(18),dp(8),dp(18),dp(8));body.addView(empty,new FrameLayout.LayoutParams(-1,-1));grid.setEmptyView(empty);
        name.setOnFocusChangeListener((v,focused)->{if(!focused)actions.saveName(name.getText().toString());});
        name.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_DONE){if(!actions.saveName(name.getText().toString()))return true;name.clearFocus();hideKeyboard();return true;}return false;});
        updateControls();requestFocus();
    }
    void state(boolean ready,boolean loading,boolean hideEmpty,List<MultiplayerLobbyModel.Room> rooms,String error,String notice) {
        this.ready=ready;this.loading=loading;this.busy=false;this.rooms=rooms;
        settingFilter=true;hide.setChecked(hideEmpty);settingFilter=false;adapter.refresh();
        // A directory failure appears once. Keep an independent session-return
        // notice above it, or show the error above cached (possibly stale) rows.
        String message=adapter.getCount()>0?(loading?"Loading rooms…":!error.isEmpty()?error:notice):notice;
        status.setText(message);status.setVisibility(message.isEmpty()?GONE:VISIBLE);
        empty.setText(loading?"Loading public rooms…":!error.isEmpty()?error:hideEmpty&&!rooms.isEmpty()?"No occupied rooms. Turn off Hide empty to see all rooms.":"No public rooms are currently listed.");updateControls();
    }
    void pending(boolean value,String message) { busy=value;status.setText(message);status.setVisibility(message.isEmpty()?GONE:VISIBLE);updateControls();adapter.notifyDataSetChanged(); }
    void profileError(String message) { status.setText(message);status.setVisibility(VISIBLE);name.requestFocus(); }
    String draft() { return name.getText().toString(); }
    void acceptedName(String base) { if(!name.getText().toString().equals(base)){name.setText(base);name.setSelection(name.length());} }
    private void updateControls() { hide.setEnabled(ready&&!busy);name.setEnabled(!busy); }
    private void hideKeyboard(){android.view.inputmethod.InputMethodManager ime=(android.view.inputmethod.InputMethodManager)getContext().getSystemService(Context.INPUT_METHOD_SERVICE);if(ime!=null)ime.hideSoftInputFromWindow(getWindowToken(),0);}
    private TextView text(String value,int size,int color){TextView v=new TextView(getContext());v.setText(value);v.setTypeface(face);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER_VERTICAL);v.setIncludeFontPadding(false);return v;}
    private GradientDrawable cardBackground() {
        GradientDrawable background=new GradientDrawable();
        background.setColor(CARD);
        background.setCornerRadius(dp(8));
        background.setStroke(dp(1),CARD_BORDER);
        return background;
    }

    private Button joinButton() {
        Button button=new Button(getContext());
        button.setTypeface(face);
        button.setTextSize(18);
        button.setAllCaps(false);
        button.setSingleLine(true);
        button.setPadding(dp(6),0,dp(6),0);
        button.setMinimumWidth(0);
        button.setMinWidth(0);
        button.setElevation(0);
        button.setStateListAnimator(null);
        button.setBackgroundTintList(null);
        int[][] states={{-android.R.attr.state_enabled},{}};
        button.setTextColor(new ColorStateList(states,new int[]{TowersTheme.SECONDARY,TowersTheme.ON_PRIMARY}));
        GradientDrawable fill=new GradientDrawable();
        fill.setCornerRadius(dp(5));
        fill.setColor(new ColorStateList(states,new int[]{TowersTheme.CONTROL,SAGE}));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.PRIMARY_RIPPLE),fill,null));
        return button;
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private final class RoomAdapter extends BaseAdapter {
        private List<MultiplayerLobbyModel.Room> visible=new ArrayList<>();
        void refresh(){visible=MultiplayerLobbyModel.visible(rooms,hide.isChecked());notifyDataSetChanged();}
        @Override public int getCount(){return visible.size();}
        @Override public Object getItem(int p){return visible.get(p);}
        @Override public long getItemId(int p){return visible.get(p).id.hashCode();}
        @Override public View getView(int position,View reused,ViewGroup parent){
            RoomCard card=reused instanceof RoomCard?(RoomCard)reused:new RoomCard();MultiplayerLobbyModel.Room room=visible.get(position);card.room=room;
            card.map.setText(room.mapLabel());
            card.details.setText(room.roomLabel());
            card.count.setText(room.current==null?room.counts():room.current+" / "+room.maximum);
            card.join.setText(room.actionLabel());
            card.join.setEnabled(ready&&!loading&&!busy&&room.joinable());
            card.join.setContentDescription(room.joinable()?"Join "+room.roomLabel():room.roomLabel()+": "+room.reason());
            return card;
        }
    }

    private final class RoomCard extends LinearLayout {
        final TextView map,details,count;final Button join;MultiplayerLobbyModel.Room room;
        RoomCard() {
            super(MultiplayerLobbyView.this.getContext());
            setOrientation(VERTICAL);
            setPadding(dp(12),dp(13),dp(12),dp(10));
            setBackground(cardBackground());
            setLayoutParams(new GridView.LayoutParams(-1,dp(172)));

            map=text("",24,TowersTheme.TEXT);
            map.setSingleLine(true);
            map.setEllipsize(TextUtils.TruncateAt.END);
            addView(map,new LayoutParams(-1,-2));
            details=text("",15,TowersTheme.SECONDARY);
            details.setMaxLines(2);
            details.setEllipsize(TextUtils.TruncateAt.END);
            LayoutParams detailParams=new LayoutParams(-1,-2);
            detailParams.topMargin=dp(4);
            addView(details,detailParams);
            addView(new View(getContext()),new LayoutParams(1,0,1));

            LinearLayout footer=new LinearLayout(getContext());
            footer.setGravity(Gravity.CENTER_VERTICAL);
            addView(footer,new LayoutParams(-1,-2));
            count=text("",21,TowersTheme.TEXT);
            count.setMaxLines(2);
            count.setEllipsize(TextUtils.TruncateAt.END);
            footer.addView(count,new LayoutParams(0,-2,1));

            join=joinButton();
            LayoutParams joinParams=new LayoutParams(dp(88),dp(48));
            joinParams.leftMargin=dp(6);
            footer.addView(join,joinParams);
            join.setOnClickListener(v->{
                if(room==null||!room.joinable()||!ready||loading||busy)return;
                if(!actions.saveName(draft()))return;
                name.clearFocus();
                hideKeyboard();
                pending(true,"Joining room…");
                actions.join(room.id);
            });
        }
    }
    /** Keep the title at the top right while the player name and filter wrap. */
    private final class Header extends ViewGroup {
        Header(Context c){super(c);}
        private int[][] bounds(int width){int n=getChildCount();int[] widths=new int[n],heights=new int[n];for(int i=0;i<n;i++){widths[i]=getChildAt(i).getMeasuredWidth();heights[i]=getChildAt(i).getMeasuredHeight();}return headerBounds(width,widths,heights,dp(7),dp(3));}
        @Override protected void onMeasure(int ws,int hs){int width=MeasureSpec.getSize(ws);for(int i=0;i<getChildCount();i++)measureChild(getChildAt(i),ws,hs);int height=0;for(int[] box:bounds(width))height=Math.max(height,box[3]);setMeasuredDimension(width,height+dp(4));}
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b){int[][] boxes=bounds(r-l);for(int i=0;i<boxes.length;i++){int[] box=boxes[i];getChildAt(i).layout(box[0],box[1],box[2],box[3]);}}
    }
    private static int[][] headerBounds(int width,int[] widths,int[] heights,int gap,int rowGap){
        int n=widths.length;int[][] boxes=new int[n][4];if(n==0)return boxes;
        int pinned=n-1,x=0,y=0,row=heights[pinned];
        boxes[pinned]=new int[]{Math.max(0,width-widths[pinned]),0,width,heights[pinned]};
        for(int i=0;i<pinned;i++){
            int available=y==0?Math.max(0,width-widths[pinned]-gap):width;
            if(x+widths[i]>available&&(x>0||y==0)){y+=row+rowGap;x=0;row=0;}
            boxes[i]=new int[]{x,y,x+widths[i],y+heights[i]};x+=widths[i]+gap;row=Math.max(row,heights[i]);
        }
        return boxes;
    }
}
