'use strict';
// Actual production pure-Java geometry/browser checks; no Android/emulator execution.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),java='app/src/main/java/com/rbabbit/blocknight/warzone/',proof='qa/native-landings-084/map-layout.json';
const sources=new Set(),checks=[];
function read(p){sources.add(p);return fs.readFileSync(path.join(root,p),'utf8');}
function check(name,fn){fn();checks.push(name);}
const towers=read(java+'GraphicsSetupView.java'),ffa=read(java+'FfaSetupView.java'),pager=read(java+'MapPreviewPager.java');
const levels=JSON.parse(read('app/src/main/assets/warzone/levels/catalog.json')).levels;
const ffaMaps=JSON.parse(read('app/src/main/assets/ffa-maps.json')).maps;
let geometry;
check('Production Java geometry keeps both launchers inside 48 viewport/font/density/cutout combinations per mode',()=>{
 const dir=path.join(root,'qa/native-landings-084/map-host-classes');fs.mkdirSync(dir,{recursive:true});
 const rows=[];
 for(const [mode,maps] of [['towers',levels],['ffa',ffaMaps]])for(const map of maps){
  const p='app/src/main/assets/'+map.preview;sources.add(p);const bytes=fs.readFileSync(path.join(root,p));
  assert.equal(bytes.readUInt32BE(0),0x89504e47,map.id+' real PNG');
  rows.push([mode,map.id,map.players||0,bytes.readUInt32BE(16),bytes.readUInt32BE(20)].join('\t'));
 }
 const tsv=path.join(dir,'maps.tsv');fs.writeFileSync(tsv,rows.join('\n')+'\n');
 const inputs=[java+'FfaSetupLayout.java',java+'TowersSetupLayout.java',java+'FfaMapBrowserState.java','tools/test-map-setup-layout-084.java'];inputs.forEach(p=>sources.add(p));
 const jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
 cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,...inputs.map(p=>path.join(root,p))],{stdio:'pipe'});
 geometry=JSON.parse(cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'com.rbabbit.blocknight.warzone.CheckMapSetup084',tsv],{encoding:'utf8'}));
 assert.equal(geometry.passed,true);assert.equal(geometry.layoutsPerMode,48);assert.equal(geometry.maps,97);
});
check('Towers is a native split page with no full-page ScrollView and no tank/logo artwork behind its picker',()=>{
 assert.match(towers,/mapScroll = new FrameLayout\(context\)/);assert.equal((towers.match(/new ScrollView\(/g)||[]).length,1);
 assert.match(towers,/mapFacts\.addView\(factsContent/);assert.match(towers,/splash\.setVisibility\("duel"\.equals\(matchMode\)\?VISIBLE:GONE\)/);
 assert.match(towers,/maps\.setPreviewOnly\(true\)/);assert.match(towers,/place\(launchActions,towersLayout\.start\)/);
 assert.match(towers,/screenTitle=text\("TOWERS",20,INK\)/);assert.match(towers,/previous\.setOnClickListener\(v -> maps\.browseBy\(-1\)\)/);
 assert.match(towers,/next\.setOnClickListener\(v -> maps\.browseBy\(1\)\)/);
});
check('All real Towers metadata, completion, difficulty memories and launch/save/reward actions are preserved',()=>{
 assert.equal(levels.length,46);assert.equal(new Set(levels.map(x=>x.id)).size,46);
 assert.match(towers,/mapDescription\.setText\(level\.description\)/);assert.match(towers,/level\.rounds\+" waves · "\+level\.preparationSeconds/);
 assert.match(towers,/maps\.isCompleted\(map\)\?VISIBLE:GONE/);assert.match(towers,/maps\.setCompletedMaps\(completedMaps\);updateMapDetails\(\)/);
 assert.match(towers,/\.getString\("selected_" \+ difficulty/);assert.match(towers,/\.putString\("selected_" \+ difficulty, map\)/);
 assert.match(towers,/actions\.start\("normal", map, matchMode, duelWeapon\)/);assert.match(towers,/actions\.rewards\(\)/);assert.match(towers,/actions\.savedGames\(\)/);
 assert.match(towers,/actions\.homePage\(false\)/);assert.match(towers,/actions\.homePage\(true\)/);
});
check('Opt-in preview-only Towers cards retain the legacy renderer and existing bounded swipe/accessibility navigation',()=>{
 assert.match(pager,/if\(previewOnly\) \{\s*exact\(image,w,h\);setMeasuredDimension\(w,h\);return;/);
 assert.match(pager,/if\(previewOnly\) \{image\.layout\(0,0,getWidth\(\),getHeight\(\)\);return;\}/);
 assert.match(pager,/index = Math\.max\(0, Math\.min\(levels\.size\(\) - 1, index\)\)/);
 assert.match(pager,/settleSelection\(\);removeCallbacks\(settle\);touching=false;\s*snapToPage\(selectedIndex\+delta\)/);
 assert.match(pager,/ACTION_SCROLL_FORWARD/);assert.match(pager,/ACTION_SCROLL_BACKWARD/);
 assert.match(pager,/BitmapFactory\.decodeStream\(input/);assert.match(pager,/Math\.min\(getWidth\(\) \/ \(float\) bitmap\.getWidth\(\), getHeight\(\) \/ \(float\) bitmap\.getHeight\(\)\)/);
});
check('FFA retains all 51 real maps, group epochs, actual Cobra facts and selected-map launch/save actions',()=>{
 assert.equal(ffaMaps.length,51);assert.equal(new Set(ffaMaps.map(m=>m.id)).size,51);
 assert.match(ffa,/catalog\.map\(browser\.selectedId\(\)\)/);assert.match(ffa,/map\.players\+" players/);assert.match(ffa,/map\.width\+" × "\+map\.height/);
 assert.match(ffa,/map\.bots==1\?" Cobra bot":" independent Cobra bots"/);assert.match(ffa,/map\.description/);
 assert.match(ffa,/actions\.start\(mapId, difficulty\)/);assert.match(ffa,/maps\.settleSelection\(\); actions\.saves\(\)/);
 assert.match(ffa,/maps\.showGroup\(\);chooseMap\(catalog\.map\(browser\.selectedId\(\)\)\);updateDetails\(\);decorateGroups\(\)/);
 assert.match(ffa,/if\(epoch!=browser\.epoch\(\)\)return/);assert.match(ffa,/final int epoch = browser\.epoch\(\)/);
});
check('FFA native controls are compact 48dp targets, its preview is uncropped and only right-side facts scroll',()=>{
 assert.equal((ffa.match(/new ScrollView\(/g)||[]).length,1);assert.match(ffa,/place\(facts,layout\.facts\);place\(start,layout\.start\)/);
 assert.match(ffa,/FfaSetupLayout\.chipWidths\(w,dp\(4\),dp\(48\),desired\)/);
 assert.match(ffa,/FfaSetupLayout\.contain\(getWidth\(\), getHeight\(\), bitmap\.getWidth\(\), bitmap\.getHeight\(\)\)/);
 assert.match(ffa,/screenTitle=copy\("FFA",20,TowersTheme\.TEXT\)/);
 assert.doesNotMatch(ffa,/setBackground\(RewardsView\.surface\(getContext\(\), TowersTheme\.PANEL, 8\)\)/);
 for(const source of [towers,ffa]){assert.match(source,/getInsets\(WindowInsets\.Type\.systemBars\(\)\|WindowInsets\.Type\.displayCutout\(\)\)/);assert.match(source,/getSafeInsetLeft\(\)/);}
});
sources.add('tools/test-map-setup-layout-084.cjs');sources.add(java+'MapLevelCatalog.java');sources.add(java+'FfaMapCatalog.java');
const report={version:'0.84',passed:true,emulatorUsed:false,actualAndroidViewsExecuted:false,actualNativeEngineExecuted:false,actualJavaGeometryExecuted:true,
 scope:'Production pure-Java launcher geometry/browser state and native-view source wiring only; Android rendering/gameplay are verified separately by root.',
 checks,checksPassed:checks.length,geometry,sources:[...sources].sort().map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
fs.writeFileSync(path.join(root,proof),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,proof,checksPassed:checks.length,geometry}));
