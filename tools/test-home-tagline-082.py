"""Check the new native Home tagline using actual production geometry and retained font."""
from pathlib import Path
import hashlib,json,re,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone';JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
source=(BASE/'HomeModesView.java').read_text(encoding='utf-8')
label='Advance Research Tech · Build & Deploy Units · Upgrade Structures'
assert source.count(label)==1
for action in ['actions.campaign()','chooseMap.run()','actions.ffa()','actions.multiplayer()','actions.guide()','actions.hub()']:assert source.count(action)==1,action
assert 'tagline.setMaxLines(2)' in source and 'tagline.setLetterSpacing(.02f)' in source and '12, TowersTheme.SECONDARY' in source
assert 'tagline.getMeasuredHeight()' in source and 'tagline.measure' in source
start=source.index('    private static HomeMenuLayout.Box taglineBounds(');end=source.index('\n    private static void exact',start)
method=source[start:end]
harness=r'''
package com.rbabbit.blocknight.warzone;
import java.awt.Font;import java.awt.font.FontRenderContext;import java.awt.font.TextAttribute;import java.awt.font.LineBreakMeasurer;import java.text.AttributedString;import java.io.File;import java.util.*;
final class HomeTagline082 {
__METHOD__
 static final String LINE="Advance Research Tech · Build & Deploy Units · Upgrade Structures";
 static final String[] LABELS={"CAMPAIGN","TOWERS","FFA","MULTIPLAYER","GUIDE","HUB"};
 static final FontRenderContext FRC=new FontRenderContext(null,true,true);static Font face;static int checks,scenarios;static final List<String> rows=new ArrayList<>();
 static void yes(boolean value,String why){checks++;if(!value)throw new AssertionError(why);}
 static boolean hits(HomeMenuLayout.Box a,HomeMenuLayout.Box b){return a.left<b.right()&&a.right()>b.left&&a.top<b.bottom()&&a.bottom()>b.top;}
 static int lines(Font f,int width){AttributedString a=new AttributedString(LINE);a.addAttribute(TextAttribute.FONT,f);LineBreakMeasurer m=new LineBreakMeasurer(a.getIterator(),FRC);int count=0;while(m.getPosition()<LINE.length()){m.nextLayout(width);count++;}return count;}
 static void run(int w,int h,float d,float scale,int[] insets){
  int[] widths=new int[6];int fontHeight=0;for(int i=0;i<6;i++){Font f=face.deriveFont((i>=4?14:16)*d*scale);widths[i]=(int)Math.ceil(f.getStringBounds(LABELS[i],FRC).getWidth());fontHeight=Math.max(fontHeight,(int)Math.ceil(f.getLineMetrics(LABELS[i],FRC).getHeight()));}
  int[] safe=Arrays.stream(insets).map(n->Math.round(n*d)).toArray();int footer=(int)Math.ceil(face.deriveFont(10*d*scale).getLineMetrics("rbabbit v0.82",FRC).getHeight());
  HomeMenuLayout.Result r=HomeMenuLayout.measure(Math.round(w*d),Math.round(h*d),d,safe[0],safe[1],safe[2],safe[3],widths,fontHeight,footer);
  Font font=face.deriveFont(12*d*scale).deriveFont(Map.of(TextAttribute.TRACKING,.02f));int lineHeight=(int)Math.ceil(font.getLineMetrics(LINE,FRC).getHeight())+Math.round(2*d);
  double textWidth=font.getStringBounds(LINE,FRC).getWidth();int lines=lines(font,r.contentRight-r.contentLeft);
  HomeMenuLayout.Box text=taglineBounds(r,safe[1],d,lineHeight*lines);
  if(text.width!=r.contentRight-r.contentLeft){lines=lines(font,text.width);text=taglineBounds(r,safe[1],d,lineHeight*lines);}
  String key=w+"x"+h+" d"+d+" font"+scale+" insets"+Arrays.toString(insets);
  yes(text.left>=safe[0]&&text.right()<=Math.round(w*d)-safe[2],key+" unsafe horizontal bounds");
  yes(text.top>=safe[1]&&text.bottom()<Math.round(h*d)-safe[3],key+" vertical clipping");
  yes(lines<=2,key+" tagline exceeds two readable lines");
  yes(!hits(text,r.logo)&&!hits(text,r.tank),key+" artwork overlap: textBottom="+text.bottom()+" logoTop="+r.logo.top+" tankTop="+r.tank.top);
  for(int i=0;i<6;i++){yes(!hits(text,r.buttons[i]),key+" button overlap");yes(r.buttons[i].width>=Math.round(48*d)&&r.buttons[i].height>=Math.round(48*d),key+" hit target");yes(r.buttons[i].width>=widths[i]+Math.round(20*d),key+" label clipping");}
  yes(r.footerBottom-footer>text.bottom(),key+" footer overlap");scenarios++;rows.add(key+" width="+text.width+" measuredText="+Math.ceil(textWidth)+" textBottom="+text.bottom()+" artTop="+Math.min(r.logo.top,r.tank.top)+" logoTop="+r.logo.top+" tankLeft="+r.tank.left+" rows="+r.rows);
 }
 public static void main(String[]args)throws Exception{face=Font.createFont(Font.TRUETYPE_FONT,new File(args[0]));for(int[] size:new int[][]{{600,300},{640,320},{800,360},{1200,540}})for(float density:new float[]{1,2,3})for(float scale:new float[]{1,1.3f}){run(size[0],size[1],density,scale,new int[]{0,0,0,0});run(size[0],size[1],density,scale,new int[]{32,12,12,16});}System.out.println("CHECKS="+checks);System.out.println("SCENARIOS="+scenarios);for(String row:rows)System.out.println("PASS "+row);}
}
'''.replace('__METHOD__',method)
with tempfile.TemporaryDirectory(prefix='home-tagline-082-')as temp:
 work=Path(temp);package=work/'com/rbabbit/blocknight/warzone';package.mkdir(parents=True)
 (package/'HomeMenuLayout.java').write_bytes((BASE/'HomeMenuLayout.java').read_bytes());(package/'HomeTagline082.java').write_text(harness,encoding='utf-8')
 built=subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-d',str(work),*map(str,package.glob('*.java'))],capture_output=True,text=True);assert built.returncode==0,built.stderr
 ran=subprocess.run([str(JDK/'java.exe'),'-Djava.awt.headless=true','-cp',str(work),'com.rbabbit.blocknight.warzone.HomeTagline082',str(ROOT/'app/src/main/assets/warzone/ui/Oswald.ttf')],capture_output=True,text=True);assert ran.returncode==0,ran.stderr
checks=int(re.search(r'CHECKS=(\d+)',ran.stdout)[1]);scenarios=[s[5:]for s in ran.stdout.splitlines()if s.startswith('PASS ')]
paths=[BASE/'HomeModesView.java',BASE/'HomeMenuLayout.java',ROOT/'app/src/main/assets/warzone/ui/Oswald.ttf',Path(__file__)]
proof={'version':'0.82','passed':True,'emulatorUsed':False,'actualAndroidViewsExecuted':False,'scope':'Actual production HomeMenuLayout and extracted taglineBounds executed on host JDK with retained Oswald AWT font metrics; native TextView drawing/insets dispatch/touch require exact-APK observation. Existing six action bindings source-checked.','checks':['Exact requested tagline and small retained-typeface style','All six existing action bindings retained','Actual label/font metrics and safe geometry','600x300,640x320,800x360,1200x540; density1/2/3; fontScale1.0/1.3; cutout/system insets','Readable one-line or compact two-line text above unchanged artwork/buttons/version'],'checksPassed':5,'assertions':checks,'scenarios':scenarios,'sources':[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in paths]}
out=ROOT/'qa/multiplayer-spectator-082/home-layout.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'assertions':checks,'scenarios':len(scenarios),'proof':str(out)}))
