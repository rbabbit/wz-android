'use strict';
/* Actual pure-Java browser-state checks and bundled UI/Guide asset validation.
   No Android UI, emulator, native engine, live bot or playability claim. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), assets = 'app/src/main/assets/';
const javaDir = 'app/src/main/java/com/rbabbit/blocknight/warzone/';
const files = new Set(['tools/check-ffa-browser-067.cjs', 'tools/check-ffa-browser-067.java',
  javaDir + 'FfaMapBrowserState.java', javaDir + 'FfaSetupView.java', javaDir + 'FfaMapCatalog.java']);
const checks = [];
function read(name) { files.add(name); return fs.readFileSync(path.join(root, name), 'utf8'); }
function digest(name) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'); }
function check(name, run) {
  try { run(); checks.push({name, passed: true}); console.log('PASS: ' + name); }
  catch (error) { checks.push({name, passed: false, error: error.stack}); console.error('FAIL: ' + name + ': ' + error.message); }
}
function data(name, global) {
  const context = {window: {}};
  vm.runInNewContext(read(assets + name), context, {filename: name, timeout: 5000});
  return context.window[global];
}
function png(name) {
  files.add(name); const bytes = fs.readFileSync(path.join(root, name));
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'PNG ' + name);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
const catalogue = JSON.parse(read(assets + 'ffa-maps.json'));
const guide = data('guide/practical-data.js', 'WarzoneGuidePracticalData');
const screenshots = data('guide/screenshots-data.js', 'WarzoneGuideScreenshots');
const research = data('guide/research-data.js', 'WarzoneGuideResearchData');
const pages = new Map(guide.chapters.flatMap(ch => ch.pages.map(page => [page.id,page])));
let actualJava = null;
check('51 real map previews and distinct player-count groups are bundled', () => {
  assert.equal(catalogue.maps.length, 51);
  assert.equal(new Set(catalogue.maps.map(map => map.id)).size, 51);
  const groups = {2:0,3:0,4:0,originals:0};
  for (const map of catalogue.maps) {
    assert.equal(map.bots, map.players - 1, map.id + ' bot count');
    if (map.id.startsWith('ntw-')) {
      assert.match(map.id, /^ntw-([234])p-(0[1-9]|1[0-5])$/);
      assert.equal(Number(map.id[4]), map.players); groups[map.players]++;
    } else groups.originals++;
    assert.equal(map.preview, 'ffa-previews/' + map.id + '.png');
    const size = png(assets + map.preview);
    if (map.id.startsWith('ntw-')) {
      assert(Math.max(...size) <= 640 && Math.max(...size) >= 320, map.id + ' bounded high-resolution preview');
      assert(Math.abs(size[0] * map.height - size[1] * map.width) <= Math.max(map.width,map.height), map.id + ' native aspect retained within one thumbnail pixel');
    } else assert.deepEqual(size, [map.width * 4,map.height * 4], map.id + ' original overview dimensions');
  }
  assert.deepEqual(groups,{2:15,3:15,4:15,originals:6});
});
check('Actual Java selection state preserves all51 identities and rejects retired-group snaps', () => {
  assert.equal(catalogue.maps.length, 51, 'Real51mapcatalogue required before state check');
  const output = fs.mkdtempSync(path.join(root,'qa','ffa-browser-067-'));
  const rows = path.join(output,'catalogue.tsv');
  fs.writeFileSync(rows,catalogue.maps.map(map => map.id+'\t'+map.players).join('\n')+'\n');
  const jbr = process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr';
  const javac = cp.spawnSync(path.join(jbr,'bin','javac.exe'),['-encoding','UTF-8','-d',output,
    path.join(root,javaDir+'FfaMapBrowserState.java'),path.join(root,'tools/check-ffa-browser-067.java')],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(javac.status,0,javac.stderr || javac.stdout);
  const java = cp.spawnSync(path.join(jbr,'bin','java.exe'),['-cp',output,'com.rbabbit.blocknight.warzone.FfaBrowserChecks',rows],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(java.status,0,java.stderr || java.stdout);
  actualJava = JSON.parse(java.stdout.trim());
  assert.equal(actualJava.passed,true); assert.equal(actualJava.maps,51);
  assert(actualJava.assertions>30000); assert.equal(actualJava.transitionSteps,5000);
});
check('Native pager uses the tested state, bounded current-group views and pending-launch settlement', () => {
  const source = read(javaDir+'FfaSetupView.java');
  assert.match(source,/new FfaMapBrowserState\(ids, players, mapId\)/);
  assert.match(source,/if \(!browser\.selectIndex\(index, epoch\)\) return/);
  assert.match(source,/final int epoch = browser\.epoch\(\)/);
  assert.match(source,/if \(groupEpoch != browser\.epoch\(\)\) return/);
  assert.match(source,/snapToPage\(selectedIndex \+ \(forward \? 1 : -1\), groupEpoch\)/);
  assert.match(source,/pages\.removeAllViews\(\);\s*cards\.clear\(\)/);
  assert.match(source,/for \(int i = 0; i < browser\.size\(\); i\+\+\)/);
  assert.match(source,/new LruCache<>\(6\)/);
  assert.match(source,/onDetachedFromWindow\(\) \{ cancelSettle\(\); previews\.evictAll\(\)/);
  assert.match(source,/start\.setOnClickListener\(v -> \{ maps\.settleSelection\(\); actions\.start\(mapId, difficulty\)/);
  assert.match(source,/saves\.setOnClickListener\(v -> \{ maps\.settleSelection\(\); actions\.saves\(\)/);
  assert.match(source,/String selectedMapId\(\) \{ maps\.settleSelection\(\); return mapId; \}/);
  assert.match(source,/map\.bots == 1 \? " Cobra bot" : " independent Cobra bots"/);
  assert.match(source,/scroll\.setFillViewport\(true\)/);
  assert.match(source,/Math\.max\(h, contentHeight \+ outer \* 2\)/);
  assert(!/catalog\.maps\(\)\.get\(index\)/.test(source), 'Local group index must not select a global map');
});
check('Guide describes15mapspergroup and keeps the historical screenshot honestly labelled', () => {
  assert.equal(guide.sourceMetadata.auditedRelease,'0.67');
  const start = JSON.stringify(pages.get('ffa-start'));
  assert.match(start,/15 new maps each under 2 players, 3 players and 4 players/);
  assert.match(start,/Two players means you and one Cobra bot/);
  assert.match(start,/three means two bots; four means three bots/);
  assert.match(start,/Originals keeps EMAG FFA/);
  assert.match(start,/VTOL stays OFF/);
  assert.match(start,/previous v0\.66 browser/);
  assert.equal(screenshots['ffa-setup'].src,'screenshots/ffa-setup-066.png');
  assert.match(screenshots['ffa-setup'].caption,/Previous v0\.66 FFA browser/);
  assert.equal(guide.chapters.length,10); assert.equal(pages.size,44);
  const sections = new Set(research.sections.map(section => section.id));
  const topics = new Set(Object.values(research.catalogues).flat().map(topic => topic.id));
  for (const page of pages.values()) {
    assert(page.steps.length>=2 && page.steps.length<=4,page.id+' concise steps');
    for (const step of page.steps) assert(step.title && step.text && step.text.length<=410,page.id+' concise instruction');
    for (const note of page.notes) assert(note.length<=410,page.id+' concise note');
    for (const target of page.related) assert(target.startsWith('section:') ? sections.has(target.slice(8)) : target.startsWith('R-') ? topics.has(target) : pages.has(target),page.id+' valid link '+target);
    const shot = screenshots[page.screenshotId];
    if (!shot && ['construction-recovery','campaign-transport'].includes(page.screenshotId)) continue;
    assert(shot,page.id+' real screenshot reference');
    assert.deepEqual(png(assets+'guide/'+shot.src),[shot.width,shot.height],page.id+' screenshot geometry');
  }
});
const report = {version:'0.67',passed:checks.every(row=>row.passed),checksPassed:checks.filter(row=>row.passed).length,
  checks,actualJava,maps:catalogue.maps.length,practicalPages:pages.size,emulatorUsed:false,actualNativeEngineExecuted:false,
  limitations:['No Android/native rendering, gesture, playability or save/load execution is claimed. The Java state class is real; transition calls are host inputs. Actual APK gameplay/layout remains unverified as requested.'],
  sources:Array.from(files).sort().map(name=>({path:name,sha256:digest(name),bytes:fs.statSync(path.join(root,name)).size})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(root,'archive/ntw-0.67-ui-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checksPassed:report.checksPassed,actualJava},null,2));
if(!report.passed) process.exitCode=1;
