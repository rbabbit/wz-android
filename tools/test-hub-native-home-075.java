package com.rbabbit.blocknight.warzone;

import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.io.File;

/** Real production geometry with six measured labels and retained font metrics. */
final class HubHomeCheck075 {
    private static final String[] LABELS={"CAMPAIGN","TOWERS","FFA","MULTIPLAYER","GUIDE","HUB"};
    private static final FontRenderContext FRC=new FontRenderContext(null,true,true);
    private static Font face;
    private static int assertions,scenarios,wraps;
    private static void yes(boolean value,String why){assertions++;if(!value)throw new AssertionError(why);}
    private static boolean intersects(HomeMenuLayout.Box a,HomeMenuLayout.Box b){return a.left<b.right()&&a.right()>b.left&&a.top<b.bottom()&&a.bottom()>b.top;}
    private static void run(int widthDp,int heightDp,float density,float scale,int[] insetDp,boolean error){
        int[] widths=new int[6];int fontHeight=0;
        for(int i=0;i<6;i++){Font f=face.deriveFont((i>=4?14:16)*density*scale);widths[i]=(int)Math.ceil(f.getStringBounds(LABELS[i],FRC).getWidth());fontHeight=Math.max(fontHeight,(int)Math.ceil(f.getLineMetrics(LABELS[i],FRC).getHeight()));}
        int[] insets=java.util.Arrays.stream(insetDp).map(n->Math.round(n*density)).toArray();
        int footer=(int)Math.ceil(face.deriveFont((error?24:10)*density*scale).getLineMetrics("rbabbit v0.75",FRC).getHeight());
        HomeMenuLayout.Result r=HomeMenuLayout.measure(Math.round(widthDp*density),Math.round(heightDp*density),density,insets[0],insets[1],insets[2],insets[3],widths,fontHeight,footer);
        String label=widthDp+"x"+heightDp+" density="+density+" scale="+scale+" inset="+java.util.Arrays.toString(insetDp)+" error="+error;
        yes(r.buttons.length==6,label+" missing action");yes(r.rows==1||r.rows==2,label+" invalid row count");
        if(r.rows==2)wraps++;
        for(int i=0;i<6;i++){
            HomeMenuLayout.Box b=r.buttons[i];
            yes(b.width>=Math.round(48*density)&&b.height>=Math.round(48*density),label+" small hit area "+LABELS[i]);
            yes(b.width>=widths[i]+Math.round(20*density),label+" text clipped "+LABELS[i]);
            yes(b.height-Math.round(16*density)>=fontHeight,label+" face clips scaled text");
            yes(b.left>=r.contentLeft&&b.right()<=r.contentRight,label+" control clips safe edge");
            yes(b.top>=insets[1]&&b.bottom()+Math.round(8*density)<=r.footerBottom-footer,label+" footer overlap");
            yes(!intersects(b,r.logo)&&!intersects(b,r.tank),label+" art overlap");
            for(int j=0;j<i;j++)yes(!intersects(b,r.buttons[j]),label+" overlapping hit targets");
        }
        for(HomeMenuLayout.Box a:new HomeMenuLayout.Box[]{r.logo,r.tank})yes(a.width>0&&a.height>0&&a.left>=r.contentLeft&&a.right()<=r.contentRight&&a.top>=insets[1],label+" art clipped/disappeared");
        yes(!intersects(r.logo,r.tank)&&r.logo.right()<r.tank.left,label+" approved artwork balance lost");
        yes(Math.abs(r.logo.width-r.logo.height*483f/228f)<=2.2&&Math.abs(r.tank.width-r.tank.height*1619f/971f)<=2.2,label+" art distorted");
        if(widthDp==800&&scale==1&&insetDp[0]==0)yes(r.rows==1,label+" ordinary screen should be a single row");
        scenarios++;
    }
    public static void main(String[]args)throws Exception{
        face=Font.createFont(Font.TRUETYPE_FONT,new File(args[0]));
        for(int[]size:new int[][]{{800,360},{640,320},{600,300},{1200,540}})for(float d:new float[]{1,2,3})for(float scale:new float[]{1,1.3f}){
            run(size[0],size[1],d,scale,new int[]{0,0,0,0},false);
            run(size[0],size[1],d,scale,new int[]{32,0,12,16},false);
        }
        for(int[]size:new int[][]{{800,360},{640,320},{600,300}})run(size[0],size[1],2,1.3f,new int[]{32,12,12,16},true);
        run(400,300,1,1.8f,new int[]{0,0,0,0},false);
        yes(wraps>0,"Large text/narrow screen should wrap rather than shrink/hide Hub");
        System.out.println("{\"passed\":true,\"assertions\":"+assertions+",\"scenarios\":"+scenarios+",\"wrappedScenarios\":"+wraps+"}");
    }
}
