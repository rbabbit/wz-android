'use strict';
// Focused host checks only: actual Java header geometry and shipped CSS/source contracts.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/menu-polish-085'),checks=[],details={};
const javaPath='app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerLobbyView.java',cssPath='app/src/main/assets/multiplayer/room-ui.css';
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),view=read(javaPath),css=read(cssPath);
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
function block(text,start){const at=text.indexOf(start);assert(at>=0,start);const open=text.indexOf('{',at);let depth=1,i=open+1;for(;i<text.length&&depth;i++){if(text[i]==='{')depth++;if(text[i]==='}')depth--;}assert.equal(depth,0);return text.slice(at,i);}
let fatal;
try{
check('Native BACK and LOBBY wording, flexible text widths and 48dp button targets',()=>{
 assert.match(view,/button\("BACK",false\)/);assert.match(view,/text\("LOBBY",22/);assert.doesNotMatch(view,/text\("MULTIPLAYER"|button\("‹"/);
 for(const variable of ['back','refresh']){assert.match(view,new RegExp('header\\.addView\\('+variable+',new ViewGroup\\.LayoutParams\\(-2,dp\\(48\\)\\)\\)'));assert.match(view,new RegExp(variable+'\\.setMinimumWidth\\(dp\\('));}
 assert.match(view,/back\.setContentDescription\("Back to game modes"\)/);
});
check('Execute actual Java header geometry across phone/tablet widths, density and enlarged control widths',()=>{
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wz-mp-085-'));
 try{
  const method=block(view,'private static int[][] headerBounds(');
  const source=`final class HeaderGeometry085 { ${method}
   static int assertions,cases;static void require(boolean value,String why){assertions++;if(!value)throw new AssertionError(why);}
   public static void main(String[] a){
    for(int widthDp:new int[]{480,568,640,732,844,960,1280})for(int density:new int[]{1,2,3})for(int font:new int[]{100,130,160}){
     int width=widthDp*density;int[] w=new int[]{Math.max(72,56*font/100)*density,70*font/100*density,(180+100*font/100)*density,145*font/100*density,Math.max(98,80*font/100)*density};
     int[] h=new int[]{48*density,48*density,48*density,48*density,48*density};int[][] b=headerBounds(width,w,h,7*density,3*density);cases++;
     require(b[4][0]==width-w[4]&&b[4][1]==0&&b[4][2]==width,"Refresh is not at top-right");
     for(int i=0;i<b.length;i++){require(b[i][0]>=0&&b[i][2]<=width&&b[i][1]>=0,"Clipped header control");require(b[i][2]-b[i][0]==w[i]&&b[i][3]-b[i][1]==h[i],"Compressed native control");for(int j=0;j<i;j++)require(b[i][2]<=b[j][0]||b[j][2]<=b[i][0]||b[i][3]<=b[j][1]||b[j][3]<=b[i][1],"Overlapping controls");}
    }
    int[][] normal=headerBounds(844,new int[]{72,70,280,145,98},new int[]{48,48,48,48,48},7,3);require(normal[3][1]==0,"Normal phone unexpectedly wraps");
    int[][] small=headerBounds(568,new int[]{72,70,280,145,98},new int[]{48,48,48,48,48},7,3);require(small[3][1]>0,"Small phone filter must wrap below Refresh");
    require(headerBounds(640,new int[0],new int[0],7,3).length==0,"Empty header guard");System.out.print("{\\"cases\\":"+cases+",\\"assertions\\":"+assertions+"}");
   }} `;
  const file=path.join(dir,'HeaderGeometry085.java');fs.writeFileSync(file,source);
  const jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
  cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,file],{stdio:'pipe'});
  details.nativeHeaderGeometry=JSON.parse(cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'HeaderGeometry085'],{encoding:'utf8'}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
check('Opaque fullscreen map panel has no compact/media inset override; native viewport remains authoritative',()=>{
 const panel=block(css,'.mp-room-map-preview{position:absolute;');
 for(const expected of ['inset:0;','z-index:3;','background:#090909;','border:0;','border-radius:0;','overflow:hidden'])assert(panel.includes(expected),expected);
 for(const edge of ['top','right','bottom','left'])assert(panel.includes('env(safe-area-inset-'+edge+')'));
 const allPanelBlocks=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].trim().endsWith('.mp-room-map-preview'));
 assert.equal(allPanelBlocks.filter(m=>/\binset\s*:/.test(m[2])).length,1,'A legacy responsive rule reintroduced insets');
 assert(allPanelBlocks.every(m=>!/(?:^|;)\s*(?:top|right|bottom|left|width|height)\s*:/.test(m[2])),'Unexpected map panel dimensions');
 const room=read('app/src/main/assets/multiplayer/room-ui.js');
 assert.match(room,/root\.style\.height\s*=|root\.style\.setProperty\('height'/);
 assert.match(room,/nativeViewport/);assert.match(room,/function setViewport\(/);
});
check('Map canvas fills remaining space and contains native rectangular maps without crop/stretch',()=>{
 const canvas=block(css,'.mp-room-map-preview canvas{');
 for(const expected of ['width:100%;','height:0;','flex:1 1 0;','object-fit:contain;','min-height:0;','min-width:0;'])assert(canvas.includes(expected),expected);
 assert.doesNotMatch(canvas,/aspect-ratio|object-fit:(?:cover|fill)/);
 const close=block(css,'.mp-room-map-preview button{');assert(close.includes('min-height:44px!important;'));
 const markup=read('app/src/main/assets/multiplayer/index.html');const panel=markup.match(/<aside id="mp-room-map-preview"[\s\S]*?<\/aside>/)[0];
 assert.equal((panel.match(/<button\b/g)||[]).length,1);assert.match(panel,/id="mp-room-preview-name"/);assert.match(panel,/id="mp-room-map-close"[^>]*>CLOSE</);assert.match(panel,/id="mp-room-map-status" role="status"/);
 const geometry=[];
 for(const [width,height,left,right,top,bottom] of [[568,320,0,0,0,0],[844,390,32,16,0,0],[1280,800,0,0,24,24],[640,240,0,0,0,0]])for(const [mw,mh]of[[128,128],[128,256],[256,128]]){
  const availableWidth=width-Math.max(14,left)-Math.max(14,right),availableHeight=height-Math.max(8,top)-Math.max(8,bottom)-44-(height<=260?3:8),scale=Math.min(availableWidth/mw,availableHeight/mh),drawW=mw*scale,drawH=mh*scale;
  assert(drawW<=availableWidth+.001&&drawH<=availableHeight+.001);assert(Math.abs(drawW/drawH-mw/mh)<.000001);assert(Math.abs(drawW-availableWidth)<.001||Math.abs(drawH-availableHeight)<.001);
  geometry.push({viewport:[width,height],nativeMap:[mw,mh],contained:[drawW,drawH]});
 }
 details.mapContainGeometry=geometry;
});
check('Original profile/Join/filter, real RGB preview guards, Back, downloads and session code are unchanged from fallback',()=>{
 const fallback=JSON.parse(read('qa/menu-polish-085/fallback.json')).immutableFallbacks.find(x=>x.path.endsWith('.zip')).path;
 const script=`from zipfile import ZipFile\nfrom pathlib import Path\nimport sys\nr=Path(sys.argv[1])\nwith ZipFile(sys.argv[2]) as z:\n for p in ['app/src/main/assets/multiplayer/room-ui.js','app/src/main/assets/multiplayer/index.html','app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerLobbyModel.java','app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java']:\n  assert z.read(p)==(r/p).read_bytes(),p\n p='${javaPath}'\n a=z.read(p).decode('utf8').replace('\\r\\n','\\n');b=(r/p).read_text()\n for start,end in [('        LinearLayout profile=', '        refresh=button('),('        status=text(', '    /** ')]:\n  assert a[a.index(start):a.index(end,a.index(start))]==b[b.index(start):b.index(end,b.index(start))],start\nprint('Protected native controls and session/room files match v0.84 fallback')`;
 cp.execFileSync('python',['-c',script,root,fallback],{stdio:'pipe'});
});
}catch(error){fatal=error.stack||String(error);console.error(fatal);process.exitCode=1;}
fs.mkdirSync(out,{recursive:true});const sources=[javaPath,cssPath,'tools/test-menu-polish-085-mp.cjs'].map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}));
fs.writeFileSync(path.join(out,'mp.json'),JSON.stringify({version:'0.85',passed:!fatal,emulatorUsed:false,browserUsed:false,actualAndroidViewsExecuted:false,actualNativeEngineExecuted:false,actualJavaHeaderGeometryExecuted:true,scope:'Actual extracted Java header arrangement on the host plus shipped CSS/DOM and protected-source checks. Geometry uses measured-control scenarios and CSS contain arithmetic; no Android/browser rendering, touch, keyboard or gameplay claim.',checks,checksPassed:checks.length,details,sources,fatal:fatal||null},null,2)+'\n');
