'use strict';
// Production pure-Java geometry/browser execution plus native-view wiring review.
// No Android Views, emulator, device, game engine or gameplay is executed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),java='app/src/main/java/com/rbabbit/blocknight/warzone/';
const checks=[],files=new Set();
function read(p){files.add(p);return fs.readFileSync(path.join(root,p),'utf8');}
function check(name,fn){fn();checks.push(name);}
const catalogue=JSON.parse(read('app/src/main/assets/ffa-maps.json')),view=read(java+'FfaSetupView.java');
let nativeGeometry;
check('The actual geometry/browser Java classes keep controls visible across48 viewport/font/density/inset combinations',()=>{
 const dir=path.join(root,'qa/launcher-074/ffa-host-classes');fs.mkdirSync(dir,{recursive:true});
 const rows=catalogue.maps.map(map=>{
  const p='app/src/main/assets/'+map.preview;files.add(p);const png=fs.readFileSync(path.join(root,p));
  assert.equal(png.readUInt32BE(0),0x89504e47,map.id+' real PNG');
  return[map.id,map.players,png.readUInt32BE(16),png.readUInt32BE(20)].join('\t');
 });
 const tsv=path.join(dir,'maps.tsv');fs.writeFileSync(tsv,rows.join('\n')+'\n');
 const inputs=[java+'FfaSetupLayout.java',java+'FfaMapBrowserState.java','tools/test-ffa-layout-074.java'];inputs.forEach(p=>files.add(p));
 const jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
 cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,...inputs.map(p=>path.join(root,p))],{stdio:'pipe'});
 nativeGeometry=JSON.parse(cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'com.rbabbit.blocknight.warzone.CheckFfaLayout074',tsv],{encoding:'utf8'}));
 assert.equal(nativeGeometry.passed,true);assert.equal(nativeGeometry.maps,51);assert.equal(nativeGeometry.layouts,48);
});
check('Start, Back and FFA Saves remain fixed native actions and settle the selected pager identity',()=>{
 assert.match(view,/back\.setOnClickListener\(v -> \{ maps\.settleSelection\(\); actions\.back\(\)/);
 assert.match(view,/saves\.setOnClickListener\(v -> \{ maps\.settleSelection\(\); actions\.saves\(\)/);
 assert.match(view,/start\.setOnClickListener\(v -> \{ maps\.settleSelection\(\); actions\.start\(mapId, difficulty\)/);
 assert.match(view,/place\(facts,layout\.facts\);place\(start,layout\.start\)/);
 assert.equal((view.match(/new ScrollView\(/g)||[]).length,1,'Only the right facts may scroll vertically');
 assert.match(view,/facts\.addView\(factsContent/);assert.doesNotMatch(view,/new LaunchPanel[^;]*ScrollView/);
});
check('All51 original map facts/previews bind by real identity and compact detail copy can scroll independently',()=>{
 assert.equal(catalogue.maps.length,51);assert.equal(new Set(catalogue.maps.map(m=>m.id)).size,51);
 assert.match(view,/catalog\.map\(browser\.selectedId\(\)\)/);assert.match(view,/map\.description/);
 assert.match(view,/map\.width\+" × "\+map\.height/);assert.match(view,/map\.players\+" players/);
 assert.match(view,/map\.bots==1\?" Cobra bot":" independent Cobra bots"/);
 assert.match(view,/compactHeading\.setVisibility\(layout\.compactHeading\?VISIBLE:GONE\)/);
 assert.match(view,/facts\.scrollTo\(0,0\)/);assert.doesNotMatch(view,/forty oil|five laboratories|Four trucks/);
});
check('The preview uses production contain geometry and actual uncropped artwork with a bounded cache',()=>{
 assert.match(view,/FfaSetupLayout\.contain\(getWidth\(\), getHeight\(\), bitmap\.getWidth\(\), bitmap\.getHeight\(\)\)/);
 assert.match(view,/canvas\.drawBitmap\(bitmap, null, target, paint\)/);
 assert.match(view,/new LruCache<>\(6\)/);assert.match(view,/previews\.evictAll\(\)/);
 assert.match(view,/addView\(new MapImage\(map\.preview\)/);
});
check('Previous/Next, swipes and accessibility use the current group epoch and report the selected map count',()=>{
 assert.match(view,/int epoch=touchEpoch==0\?browser\.epoch\(\):touchEpoch/);
 assert.match(view,/if\(epoch!=browser\.epoch\(\)\)return/);
 assert.match(view,/snapToPage\(browser\.selectedIndex\(\)\+\(forward\?1:-1\),epoch\)/);
 assert.match(view,/previous\.setEnabled\(browser\.selectedIndex\(\)>0\)/);
 assert.match(view,/next\.setEnabled\(browser\.selectedIndex\(\)<browser\.size\(\)-1\)/);
 assert.match(view,/position\.setText\(\(browser\.selectedIndex\(\)\+1\)\+" \/ "\+browser\.size\(\)\)/);
 assert.match(view,/ACTION_SCROLL_FORWARD/);assert.match(view,/ACTION_SCROLL_BACKWARD/);
 assert.match(view,/final int epoch = browser\.epoch\(\)/);assert.match(view,/snapToPage\(Math\.round\(getScrollX\(\)/);
});
check('Content-width button rows retain44dp touch bounds, rounded native styling and inset safety',()=>{
 assert.match(view,/RewardsView\.action\(/);assert.match(view,/button\.setTextSize\(primary\?16:13\)/);
 assert.match(view,/FfaSetupLayout\.chipWidths\(w,dp\(4\),dp\(44\),desired\)/);
 assert.match(view,/contentWidth\(start,128\)/);assert.match(view,/contentWidth\(back,72\)/);
 assert.match(view,/WindowInsets\.Type\.systemBars\(\)\|WindowInsets\.Type\.displayCutout\(\)/);
 assert.match(view,/requestApplyInsets\(\)/);assert.match(view,/getSafeInsetLeft\(\)/);
});
files.add('tools/test-ffa-layout-074.cjs');files.add(java+'FfaMapCatalog.java');
const report={version:'0.74',passed:true,emulatorUsed:false,actualAndroidViewsExecuted:false,actualNativeEngineExecuted:false,
 scope:'Production pure-Java geometry and browser-state execution; native-view source wiring and catalogue/preview checks only',
 checksPassed:checks.length,checks,nativeGeometry,
 sources:[...files].sort().map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
fs.writeFileSync(path.join(root,'qa/launcher-074/ffa-layout-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,nativeGeometry,report:'qa/launcher-074/ffa-layout-checks.json'}));
