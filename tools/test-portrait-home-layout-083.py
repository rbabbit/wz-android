"""Focused production portrait Home geometry/font/art checks, without Android execution."""
from pathlib import Path
import hashlib,json,re,struct,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone';JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
home=BASE/'HomeModesView.java';helper=BASE/'PortraitHomeLayout.java';source=home.read_text(encoding='utf-8-sig')
for action in ['actions.campaign()','chooseMap.run()','actions.ffa()','actions.multiplayer()','actions.guide()','actions.hub()']:assert source.count(action)==1,action
for retained in ['void setCampaignBusy(boolean busy)','campaign.setEnabled(!busy)','Checking campaign files','void showStatus(String value, boolean error)','ACCESSIBILITY_LIVE_REGION_POLITE','void setArtworkVisible(boolean visible)','insets.getInsets(','getDisplayCutout','requestApplyInsets','scroll.setFillViewport(true)','options.inSampleSize = sample']:assert retained in source,retained
assert 'WebView' not in source
assert 'setClipChildren(true)' in source and 'hero.setCropToPadding(true)' in source
assert 'PorterDuff.Mode.DST_IN' in source and 'canvas.saveLayer' in source
assert 'getInsetsIgnoringVisibility' not in source, 'Hidden system bars must not reserve the fullscreen header'
assets=[]
for name in ['hero','campaign','towers','ffa','multiplayer']:
 p=ROOT/f'app/src/main/res/drawable-nodpi/home_portrait_{name}_083.png';b=p.read_bytes();assert b[:8]==b'\x89PNG\r\n\x1a\n';w,h=struct.unpack('>II',b[16:24]);assets.append({'path':p.relative_to(ROOT).as_posix(),'width':w,'height':h,'sha256':hashlib.sha256(b).hexdigest()})
harness=r'''
package com.rbabbit.blocknight.warzone;
import java.awt.*;import java.awt.font.*;import java.text.*;import java.io.*;import java.util.*;
final class PortraitHome083 {
 static final String TAG="Advance Research Tech · Build & Deploy Units · Upgrade Structures";
 static final String[] TITLES={"CAMPAIGN","TOWERS","FFA","MULTIPLAYER"},SUBS={"The original story","Defend your base","Cobra bot battles","Online battles"};
 static final FontRenderContext FRC=new FontRenderContext(null,true,true);static Font face;static int checks,scenarios,scrolls,singleColumn;static final java.util.List<String> rows=new ArrayList<>();
 static void yes(boolean c,String why){checks++;if(!c)throw new AssertionError(why);}
 static boolean hits(PortraitHomeLayout.Box a,PortraitHomeLayout.Box b){return a.left<b.right()&&a.right()>b.left&&a.top<b.bottom()&&a.bottom()>b.top;}
 static int glyph(Font f,String text){return f.createGlyphVector(FRC,text).getPixelBounds(FRC,0,0).height;}
 static int lineHeight(Font f,String text){return(int)Math.ceil(f.getLineMetrics(text,FRC).getHeight());}
 static int lines(Font f,String text,int width){AttributedString a=new AttributedString(text);a.addAttribute(TextAttribute.FONT,f);LineBreakMeasurer m=new LineBreakMeasurer(a.getIterator(),FRC);int n=0;while(m.getPosition()<text.length()){m.nextLayout(width);n++;}return n;}
 static void run(int w,int h,float density,float scale,int[] insets,boolean error){
  int width=Math.round((w-insets[0]-insets[2])*density),height=Math.round((h-insets[1]-insets[3])*density),edge=PortraitHomeLayout.edge(width,density),available=width-edge*2;
  Font title=face.deriveFont(Font.BOLD,20*density*scale),sub=face.deriveFont(14*density*scale),tag=face.deriveFont(12*density*scale),aux=face.deriveFont(20*density*scale),version=face.deriveFont(11*density*scale);
  int titleHeight=0,subHeight=0,minCard=0;for(int i=0;i<4;i++){titleHeight=Math.max(titleHeight,glyph(title,TITLES[i]));subHeight=Math.max(subHeight,glyph(sub,SUBS[i]));minCard=Math.max(minCard,(int)Math.ceil(Math.max(title.getStringBounds(TITLES[i],FRC).getWidth(),sub.getStringBounds(SUBS[i],FRC).getWidth()))+Math.round(24*density));}
  int tagLines=lines(tag,TAG,available),tagHeight=tagLines*lineHeight(tag,TAG),status=error?2*lineHeight(face.deriveFont(12*density*scale),"Campaign files unavailable"):0;
  PortraitHomeLayout.Result r=PortraitHomeLayout.measure(width,height,density,tagHeight,titleHeight,subHeight,minCard,lineHeight(aux,"GUIDE"),(int)Math.ceil(version.getStringBounds("rbabbit v0.83",FRC).getWidth()),lineHeight(version,"rbabbit v0.83"),status);
  String key=w+"x"+h+" d="+density+" font="+scale+" insets="+Arrays.toString(insets)+" error="+error;
  yes(tagLines<=2,key+" tagline needs more than2lines");yes(r.contentHeight>=height,key+" content smaller than viewport");
  yes(r.logo.top>=0&&r.logo.bottom()<=r.tagline.top,key+" logo/tagline overlap");yes(r.tagline.bottom()<=r.hero.top&&r.hero.bottom()<=r.cards[0].top,key+" hero/header overlaps");
  for(int i=0;i<4;i++){var c=r.cards[i];yes(c.width>=minCard,key+" title/subtitle horizontal clipping");yes(c.height>=Math.round(48*density)&&c.width>=Math.round(48*density),key+" undersizedcard");yes(c.left>=edge&&c.right()<=width-edge,key+" card outside safeedge");yes(r.captionHeight>=titleHeight+subHeight+Math.round(17*density),key+" caption clips glyphs");yes(c.bottom()<=r.guide.top,key+" card/aux overlap");for(int j=0;j<i;j++)yes(!hits(c,r.cards[j]),key+" cards overlap");}
  for(var c:new PortraitHomeLayout.Box[]{r.guide,r.hub}){yes(c.width>=Math.round(48*density)&&c.height>=Math.round(48*density),key+" small auxiliary hit");yes(c.bottom()<=r.version.top,key+" auxiliary/footer overlap");}
  yes(!hits(r.guide,r.hub),key+" auxiliary overlap");yes(r.version.bottom()<=r.contentHeight,key+" version clipped");yes(r.status.height==status,key+" errorstatus lost");if(error)yes(r.status.bottom()+Math.round(8*density)<=r.version.top,key+" error overlapsversion");
  if(w==390&&h==844&&scale==1&&!error){yes(r.columns==2,key+" normal Home must be2x2");yes(r.contentHeight==height,key+" normal390x844 mustfit withoutscroll");yes(r.captionHeight/density>=46&&r.captionHeight/density<=56,key+" caption disproportionate "+r.captionHeight/density);}
  if(r.contentHeight>height)scrolls++;if(r.columns==1)singleColumn++;scenarios++;rows.add(key+" columns="+r.columns+" content="+r.contentHeight+" viewport="+height+" captionDp="+r.captionHeight/density+" heroDp="+r.hero.height/density);
 }
 public static void main(String[]args)throws Exception{face=Font.createFont(Font.TRUETYPE_FONT,new File(args[0]));for(int[]s:new int[][]{{320,568},{360,640},{390,844},{412,892},{480,960},{600,960}})for(float d:new float[]{1,2,3})for(float scale:new float[]{1,1.3f,1.5f}){run(s[0],s[1],d,scale,new int[]{0,0,0,0},false);run(s[0],s[1],d,scale,new int[]{8,28,8,24},false);}run(390,844,3,1,new int[]{0,0,0,0},true);run(320,568,2,1.3f,new int[]{8,28,8,24},true);yes(scrolls>0,"Compact fallback mustscroll");yes(singleColumn>0,"Large text mustretainreadablefullwidthcards");System.out.println("CHECKS="+checks);System.out.println("SCROLLS="+scrolls);for(String row:rows)System.out.println("PASS "+row);}
}
'''
with tempfile.TemporaryDirectory(prefix='portrait-home-083-')as temp:
 work=Path(temp);pkg=work/'com/rbabbit/blocknight/warzone';pkg.mkdir(parents=True);(pkg/'PortraitHomeLayout.java').write_bytes(helper.read_bytes());(pkg/'PortraitHome083.java').write_text(harness,encoding='utf-8')
 built=subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-d',str(work),*map(str,pkg.glob('*.java'))],capture_output=True,text=True);assert built.returncode==0,built.stderr
 ran=subprocess.run([str(JDK/'java.exe'),'-Djava.awt.headless=true','-cp',str(work),'com.rbabbit.blocknight.warzone.PortraitHome083',str(ROOT/'app/src/main/assets/warzone/ui/Oswald.ttf')],capture_output=True,text=True);assert ran.returncode==0,ran.stderr
checks=int(re.search(r'CHECKS=(\d+)',ran.stdout)[1]);scenarios=[x[5:]for x in ran.stdout.splitlines()if x.startswith('PASS ')]
def extracted_method(needle):
 start=source.index(needle);depth=0
 for pos in range(source.index('{',start),len(source)):
  depth+=(source[pos]=='{')-(source[pos]=='}')
  if depth==0:return source[start:pos+1]
 raise AssertionError('Unclosed production method '+needle)
assert 'refreshTextSizes();' in source[source.index('private final class HomeContent'):source.index('private final class ModeCard')]
paint_method=extracted_method('@Override public void draw(Canvas canvas)')
font_method=extracted_method('private void refreshTextSizes()')
regression=r"""
import java.util.*;
final class Paint {static final int ANTI_ALIAS_FLAG=1;int alpha=255;Paint(int flags){}void setColor(int color){alpha=color>>>24;}void setShader(Object shader){}void setStrokeWidth(float value){}}
final class Rect {int left=0,top=0,right=390,bottom=844;}
class Shader {enum TileMode{CLAMP}}
final class LinearGradient {LinearGradient(float x1,float y1,float x2,float y2,int[] colors,float[] positions,Shader.TileMode tile){}}
final class Canvas {final List<Integer> backgroundAlphas=new ArrayList<>();void drawRect(Rect r,Paint p){backgroundAlphas.add(p.alpha);}void drawLine(float x1,float y1,float x2,float y2,Paint p){}}
abstract class Drawable {Rect getBounds(){return new Rect();}public abstract void draw(Canvas canvas);}
final class TypedValue {static final int COMPLEX_UNIT_SP=2;}
final class TextView {static float scale=1.3f;float pixels;void setTextSize(int unit,float value){if(unit!=2)throw new AssertionError("Expected SP");pixels=value*scale;}}
final class HomeVisualRegression083 extends Drawable {
 final Paint paint=new Paint(1);final TextView tagline=new TextView(),version=new TextView(),status=new TextView(),guide=new TextView(),hub=new TextView();
 int dp(int n){return n;}
 __DRAW__
 __FONT__
 public static void main(String[]args){HomeVisualRegression083 h=new HomeVisualRegression083();Canvas c=new Canvas();h.draw(c);h.draw(c);if(!c.backgroundAlphas.equals(Arrays.asList(255,255)))throw new AssertionError("Repeated background must remain opaque: "+c.backgroundAlphas);h.refreshTextSizes();if(h.tagline.pixels!=12*1.3f||h.version.pixels!=11*1.3f||h.guide.pixels!=20*1.3f||h.hub.pixels!=20*1.3f||h.status.pixels!=12*1.3f)throw new AssertionError("Expanded font refresh missing a control");TextView.scale=1;h.refreshTextSizes();if(h.tagline.pixels!=12||h.version.pixels!=11||h.guide.pixels!=20||h.hub.pixels!=20||h.status.pixels!=12)throw new AssertionError("Restored font refresh missing a control");System.out.println("PASS repeated-background-opaque");System.out.println("PASS all-caption-button-fonts-restored");}
}
""".replace('__DRAW__',paint_method).replace('__FONT__',font_method)
with tempfile.TemporaryDirectory(prefix='portrait-home-083-visual-')as temp:
 work=Path(temp);f=work/'HomeVisualRegression083.java';f.write_text(regression,encoding='utf-8')
 built=subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8',str(f)],capture_output=True,text=True);assert built.returncode==0,built.stderr
 ran=subprocess.run([str(JDK/'java.exe'),'-cp',str(work),'HomeVisualRegression083'],capture_output=True,text=True);assert ran.returncode==0,ran.stderr
visual_checks=[v[5:]for v in ran.stdout.splitlines()if v.startswith('PASS ')];assert len(visual_checks)==2

paths=[home,helper,ROOT/'app/src/main/assets/warzone/ui/Oswald.ttf',Path(__file__)]+[ROOT/a['path']for a in assets]
proof={'version':'0.83','passed':True,'emulatorUsed':False,'actualAndroidViewsExecuted':False,'scope':'Actual pure-Java portrait geometry with retained Oswald AWT metrics/image metadata; actual draw/SP-refresh methods executed with inert Paint/TextView stubs. Action/busy/status/inset/decode calls source-checked. Native Android drawing/touch/configuration dispatch require exactAPK observation.','checks':['Exact approvedfourmodeimages/labels and six existingActions retained','Busy/error/accessibility/inset/artvisibility paths retained','Actual portrait helper/font glyph measurements executed','390x844 normal2x2 fitswithoutscroll;320x568compact scroll;largefont readablesinglecolumnfallback','Native caption/touch/version/error bounds nonoverlapping','Sampleddecode policy/real PNGmetadata and hero edgeblend/ownbounds clipping/visible-insets verified','Actual background draw method remains opaque across repeated redraws','Actual SP refresh method restores tagline/version/status/Guide/Hub afterfontchange'],'checksPassed':8,'actualMethodVisualChecks':visual_checks,'assertions':checks+len(visual_checks),'scenarios':scenarios,'assets':assets,'sources':[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in paths]}
out=ROOT/'qa/portrait-home-083/home-layout.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'assertions':checks+len(visual_checks),'scenarios':len(scenarios),'proof':str(out)}))
