package com.rbabbit.blocknight.warzone;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/** Executes production pure-Java layout/browser classes, not Android Views. */
class CheckFfaLayout074 {
    private static int checks;
    private static void check(boolean value,String why) {
        checks++;if(!value)throw new AssertionError(why);
    }
    private static void bounds(FfaSetupLayout.Box b,int width,int height,String label) {
        check(b.left>=0&&b.top>=0&&b.right>=b.left&&b.bottom>=b.top&&b.right<=width&&b.bottom<=height,label+" bounds");
    }
    public static void main(String[] args) throws Exception {
        List<String[]> rows=new ArrayList<>();
        for(String line:Files.readAllLines(Paths.get(args[0]),StandardCharsets.UTF_8))if(!line.isEmpty())rows.add(line.split("\t"));
        String[] ids=new String[rows.size()];int[] players=new int[ids.length];
        for(int i=0;i<ids.length;i++){ids[i]=rows.get(i)[0];players[i]=Integer.parseInt(rows.get(i)[1]);}
        int layouts=0;
        for(int[] viewport:new int[][]{{800,360},{640,320},{600,300},{1200,540}})
        for(float density:new float[]{1,2,3})for(float font:new float[]{1,1.3f})for(boolean cutout:new boolean[]{false,true}) {
            int w=Math.round(viewport[0]*density),h=Math.round(viewport[1]*density);
            int left=cutout?Math.round(30*density):0,top=cutout?Math.round(24*density):0;
            int right=cutout?Math.round(14*density):0,bottom=cutout?Math.round(16*density):0;
            int heading=Math.round(48*font*density),startWidth=Math.round(132*font*density);
            FfaSetupLayout l=FfaSetupLayout.calculate(w,h,density,left,top,right,bottom,heading,startWidth);layouts++;
            for(FfaSetupLayout.Box box:new FfaSetupLayout.Box[]{l.header,l.preview,l.previous,l.position,l.next,l.heading,l.groups,l.difficulty,l.facts,l.start})bounds(box,w,h,"Layout "+layouts);
            check(l.preview.top>=l.header.bottom,"Preview stays below header");
            check(l.preview.right<l.groups.left,"Map and settings are separate columns");
            check(l.previous.top>=l.preview.bottom,"Map arrows stay below full preview");
            check(l.next.right<=l.preview.right,"Both browse arrows stay in the map column");
            check(l.previous.height()>=Math.round(44*density)&&l.previous.width()>=Math.round(44*density),"Previous touch target");
            check(l.next.height()>=Math.round(44*density)&&l.next.width()>=Math.round(44*density),"Next touch target");
            check(l.groups.height()>=Math.round(44*density)&&l.difficulty.height()>=Math.round(44*density),"Settings touch height");
            check(l.start.height()>=Math.round(48*density),"Start touch height");
            check(l.start.right<=w-Math.max(Math.round(16*density),right)&&l.start.bottom<=h-Math.max(Math.round(10*density),bottom),"Start stays inside safe edges");
            check(l.facts.top>=l.difficulty.bottom&&l.facts.bottom<l.start.top,"Only facts may scroll, Start never overlaps");
            check(l.facts.height()>=Math.round(32*density),"Right facts retain usable scroll viewport");
            check(l.start.width()<l.groups.width(),"Start face is content width rather than a stretched bar");
            if(viewport[1]<=320)check(l.compactHeading,"Short viewport moves heading into the facts scroller");
            for(int count:new int[]{3,4}) {
                int[] desired=new int[count];for(int i=0;i<count;i++)desired[i]=Math.round((i%2==0?72:82)*font*density);
                int gap=Math.round(4*density),minimum=Math.round(44*density),sum=gap*(count-1);
                int[] actual=FfaSetupLayout.chipWidths(l.groups.width(),gap,minimum,desired);
                for(int chip:actual){check(chip>=minimum,"Chip touch width");sum+=chip;}
                check(sum<=l.groups.width(),"Content-sized chips fit the settings column");
            }
            for(String[] row:rows) {
                int iw=Integer.parseInt(row[2]),ih=Integer.parseInt(row[3]);
                FfaSetupLayout.Box fit=FfaSetupLayout.contain(l.preview.width(),l.preview.height(),iw,ih);
                bounds(fit,l.preview.width(),l.preview.height(),row[0]+" contained preview");
                check(fit.width()>0&&fit.height()>0,row[0]+" visible preview");
                check(Math.abs(fit.width()/(double)iw-fit.height()/(double)ih)<=1.1/Math.min(iw,ih),row[0]+" authored aspect retained");
                check(fit.left*2+fit.width()>=l.preview.width()-1&&fit.left*2+fit.width()<=l.preview.width()+1,row[0]+" horizontal centring");
            }
        }
        FfaMapBrowserState browser=new FfaMapBrowserState(ids,players,"emag");
        check(browser.group()==FfaMapBrowserState.ORIGINALS&&browser.selectedIndex()==0,"Default original EMAG");
        for(int group:new int[]{2,3,4,FfaMapBrowserState.ORIGINALS}) {
            int old=browser.epoch();browser.selectGroup(group);int epoch=browser.epoch();
            if(epoch!=old)check(!browser.selectIndex(1,old),"Retired group arrow/swipe rejected");
            browser.selectIndex(-1,epoch);check(browser.selectedIndex()==0,"Previous boundary clamps");
            for(int i=0;i<browser.size();i++) {
                check(browser.selectIndex(i,epoch),"Current arrow/swipe accepted");
                String map=browser.selectedId();
                check(browser.idAt(i).equals(map),"Visible index has real map identity");
                check(browser.selectIndex(browser.selectedIndex(),epoch),"Start/Saves settles exact selected map");
                check(new FfaMapBrowserState(ids,players,map).selectedId().equals(map),"Back/reopen keeps selected map");
            }
            browser.selectIndex(999,epoch);check(browser.selectedIndex()==browser.size()-1,"Next boundary clamps");
        }
        System.out.println("{\"passed\":true,\"assertions\":"+checks+",\"layouts\":"+layouts+",\"maps\":"+rows.size()+",\"emulatorUsed\":false,\"actualAndroidViewsExecuted\":false}");
    }
}
