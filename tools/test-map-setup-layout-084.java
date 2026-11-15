package com.rbabbit.blocknight.warzone;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/** Runs production layout/browser policy, not Android Views or game code. */
class CheckMapSetup084 {
    private static int assertions;
    private static void check(boolean value,String why) {assertions++;if(!value)throw new AssertionError(why);}
    private static void bounds(FfaSetupLayout.Box b,int w,int h) {
        check(b.left>=0&&b.top>=0&&b.right>=b.left&&b.bottom>=b.top&&b.right<=w&&b.bottom<=h,"Control inside viewport");
    }
    public static void main(String[] args) throws Exception {
        List<String[]> maps=new ArrayList<>();
        for(String line:Files.readAllLines(Paths.get(args[0]),StandardCharsets.UTF_8))if(!line.isEmpty())maps.add(line.split("\t"));
        int layouts=0;
        for(int[] viewport:new int[][]{{800,360},{640,320},{600,300},{1200,540}})
        for(float density:new float[]{1,2,3})for(float font:new float[]{1,1.3f})for(boolean cutout:new boolean[]{false,true}) {
            int w=Math.round(viewport[0]*density),h=Math.round(viewport[1]*density),touch=Math.round(48*density);
            int il=cutout?Math.round(30*density):0,it=cutout?Math.round(24*density):0;
            int ir=cutout?Math.round(14*density):0,ib=cutout?Math.round(16*density):0;
            FfaSetupLayout f=FfaSetupLayout.calculate(w,h,density,il,it,ir,ib,Math.round(48*font*density),Math.round(136*font*density));
            TowersSetupLayout t=TowersSetupLayout.calculate(w,h,density,il,it,ir,ib,Math.round(136*font*density));
            layouts++;
            for(FfaSetupLayout.Box b:new FfaSetupLayout.Box[]{f.header,f.preview,f.previous,f.position,f.next,f.heading,f.groups,f.difficulty,f.facts,f.start,
                    t.header,t.preview,t.previous,t.position,t.next,t.difficulty,t.facts,t.start})bounds(b,w,h);
            check(f.preview.top>=f.header.bottom&&t.preview.top>=t.header.bottom,"Previews below header");
            check(f.preview.right<f.groups.left&&t.preview.right<t.difficulty.left,"Separate preview and details columns");
            check(f.preview.bottom<f.previous.top&&t.preview.bottom<t.previous.top,"Browse under full preview");
            check(f.next.right<=f.preview.right&&t.next.right<=t.preview.right,"Both browse controls stay in preview column");
            for(FfaSetupLayout.Box b:new FfaSetupLayout.Box[]{f.previous,f.next,t.previous,t.next})
                check(b.width()>=touch&&b.height()>=touch,"48dp browse target");
            for(FfaSetupLayout.Box b:new FfaSetupLayout.Box[]{f.header,f.groups,f.difficulty,f.start,t.header,t.difficulty,t.start})
                check(b.height()>=touch,"48dp header/filter/launch target");
            check(f.facts.height()>=Math.round(32*density)&&t.facts.height()>=Math.round(32*density),"Usable independent facts scroller");
            check(f.facts.bottom<f.start.top&&t.facts.bottom<t.start.top,"Launch controls never covered by facts");
            check(f.start.width()<f.groups.width()&&t.start.width()<t.difficulty.width(),"Launch buttons are compact, not stretched bars");
            check(f.start.bottom<=h-Math.max(Math.round(12*density),ib)&&t.start.bottom<=h-Math.max(Math.round(12*density),ib),"Bottom safe inset respected");
            check(f.groups.top<f.difficulty.top,"Player groups always first");
            if(!f.compactHeading)check(f.groups.bottom<=f.heading.top&&f.heading.bottom<f.difficulty.top,"Normal FFA order: groups, map title, difficulty");
            else check(f.heading.height()==0,"Compact FFA heading goes inside facts scroller");
            for(int count:new int[]{3,4}) {
                int[] desired=new int[count];for(int i=0;i<count;i++)desired[i]=Math.round((i%2==0?72:82)*font*density);
                int gap=Math.round(4*density),sum=gap*(count-1);
                int[] widths=FfaSetupLayout.chipWidths(f.groups.width(),gap,touch,desired);
                for(int width:widths) {check(width>=touch,"48dp filter width");sum+=width;}
                check(sum<=f.groups.width(),"Content-width filters fit small/enlarged-text viewport");
            }
            for(String[] row:maps) {
                FfaSetupLayout.Box area="ffa".equals(row[0])?f.preview:t.preview;
                int iw=Integer.parseInt(row[3]),ih=Integer.parseInt(row[4]);
                FfaSetupLayout.Box fit=FfaSetupLayout.contain(area.width(),area.height(),iw,ih);
                bounds(fit,area.width(),area.height());check(fit.width()>0&&fit.height()>0,"Every actual preview remains visible");
                check(Math.abs(fit.width()/(double)iw-fit.height()/(double)ih)<=1.1/Math.min(iw,ih),"Authored preview aspect stays uncropped");
            }
        }
        List<String> idsList=new ArrayList<>();List<Integer> playersList=new ArrayList<>();
        for(String[] row:maps)if("ffa".equals(row[0])) {idsList.add(row[1]);playersList.add(Integer.parseInt(row[2]));}
        String[] ids=idsList.toArray(new String[0]);int[] players=new int[ids.length];for(int i=0;i<ids.length;i++)players[i]=playersList.get(i);
        FfaMapBrowserState browser=new FfaMapBrowserState(ids,players,"emag");
        check(browser.group()==FfaMapBrowserState.ORIGINALS&&browser.selectedIndex()==0,"Original EMAG default retained");
        for(int group:new int[]{2,3,4,FfaMapBrowserState.ORIGINALS}) {
            int oldEpoch=browser.epoch();browser.selectGroup(group);int epoch=browser.epoch();
            if(epoch!=oldEpoch)check(!browser.selectIndex(1,oldEpoch),"Old group tap rejected");
            browser.selectIndex(-1,epoch);check(browser.selectedIndex()==0,"Previous map clamps at boundary");
            for(int i=0;i<browser.size();i++) {
                check(browser.selectIndex(i,epoch),"Each real map selectable");
                check(browser.idAt(i).equals(browser.selectedId()),"Pager and launch identity match");
                check(new FfaMapBrowserState(ids,players,browser.selectedId()).selectedId().equals(browser.selectedId()),"Reopen retains real map identity");
            }
            browser.selectIndex(999,epoch);check(browser.selectedIndex()==browser.size()-1,"Next map clamps at boundary");
        }
        System.out.println("{\"passed\":true,\"layoutsPerMode\":"+layouts+",\"assertions\":"+assertions+",\"maps\":"+maps.size()+"}");
    }
}
