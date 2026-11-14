'use strict';
/* FFA setup assets and Guide facts. Native Android selection/layout is checked on the APK. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), assets = 'app/src/main/assets/';
const checks = [], files = new Set(['tools/check-ffa-setup-066.cjs',
  'app/src/main/java/com/rbabbit/blocknight/warzone/FfaSetupView.java',
  'app/src/main/java/com/rbabbit/blocknight/warzone/FfaMapCatalog.java']);
const read = name => { files.add(name); return fs.readFileSync(path.join(root, name), 'utf8'); };
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
function check(name, body) { try { body(); checks.push({name, passed: true}); console.log('PASS: ' + name); } catch (error) { checks.push({name, passed: false, error: error.message}); console.error('FAIL: ' + name + ': ' + error.message); } }
function data(name, global) { const context = {window: {}}; vm.runInNewContext(read(assets + name), context, {filename: name, timeout: 5000}); return context.window[global]; }
function png(name) { files.add(name); const b = fs.readFileSync(path.join(root, name)); assert(b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), name + ' PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
const catalogue = JSON.parse(read(assets + 'ffa-maps.json'));
const guide = data('guide/practical-data.js', 'WarzoneGuidePracticalData');
const research = data('guide/research-data.js', 'WarzoneGuideResearchData');
const screenshots = data('guide/screenshots-data.js', 'WarzoneGuideScreenshots');
const music = data('warzone/music-catalog.js', 'WarzoneMusicCatalog');
const pages = new Map(guide.chapters.flatMap(ch => ch.pages.map(page => [page.id, page])));
const text = id => JSON.stringify(pages.get(id));
check('All six authored setup previews match native map aspect and contain no blank overview frame', () => {
  assert.equal(catalogue.version, 1); assert.equal(catalogue.maps.length, 6);
  assert.equal(new Set(catalogue.maps.map(map => map.id)).size, 6);
  for (const map of catalogue.maps) {
    assert.equal(map.bots, map.players - 1, map.id + ' opponent count');
    assert.equal(map.players, map.id === 'emaj-6p' ? 6 : 4, map.id + ' authored slots');
    assert.equal(map.preview, 'ffa-previews/' + map.id + '.png');
    assert.deepEqual(png(assets + map.preview), [map.width * 4, map.height * 4], map.id + ' map-only terrain size');
  }
});
check('FFA instructions name the six actual maps, varied authored starts and actual opponent counts', () => {
  assert.equal(guide.sourceMetadata.auditedRelease, '0.66');
  const start = text('ffa-start');
  catalogue.maps.forEach(map => assert(start.includes(map.name), 'Missing Guide map ' + map.name));
  assert.match(start, /three Cobra bots/); assert.match(start, /six: you and five bots/);
  assert.match(start, /Starting trucks, laboratories, factories and oil holdings vary/);
  assert.match(text('ffa-economy'), /Contact starts without labs or factories/);
  assert.match(text('ffa-no-air-and-legacy'), /VTOL is OFF/);
  assert.match(text('ffa-no-air-and-legacy'), /does not convert its AI or map/);
  assert(!/fixed EMAG|fixed four-player|no bot picker or map picker|no map picker/i.test(JSON.stringify(guide.chapters)), 'Stale one-map instructions');
});
check('MUSIC instructions agree with the actual bundled playlist policies and menu', () => {
  assert.equal(music.playlists.ffa.tracks.length, 39); assert.equal(music.playlists.ffa.selection, 'shuffle');
  assert.equal(music.playlists.campaign.tracks.length, 3); assert.equal(music.playlists.campaign.selection, 'random-start-sequential');
  const navigation = text('navigation-and-return');
  assert.match(navigation, /MUSIC in the battle header, then ON or OFF/);
  assert.match(navigation, /One music setting is remembered across modes/);
  assert.match(navigation, /39-track shuffle without immediate repeats/);
  assert.match(navigation, /three original tracks, then cycles in order/);
  assert.match(navigation, /videos pause and resume the song/);
  assert.match(navigation, /Towers loops its assigned map soundtrack/);
  assert.match(read(assets + 'warzone/music-loader.js'), /data-music-enabled="true">ON/);
  assert(!/one track per mission|one-track-per-mission/i.test(navigation));
});
check('All 44 concise Guide pages retain valid links and real screenshot references', () => {
  assert.equal(guide.chapters.length, 10); assert.equal(pages.size, 44);
  const sections = new Set(research.sections.map(section => section.id));
  const topics = new Set(Object.values(research.catalogues).flat().map(topic => topic.id));
  const optional = new Set(['construction-recovery', 'campaign-transport']);
  for (const page of pages.values()) {
    assert(page.steps.length >= 2 && page.steps.length <= 4, page.id + ' steps');
    page.steps.forEach(step => assert(step.title && step.text && step.text.length <= 410, page.id + ' concise step'));
    page.notes.forEach(note => assert(note.length <= 410, page.id + ' concise note'));
    for (const target of page.related) assert(target.startsWith('section:') ? sections.has(target.slice(8)) : target.startsWith('R-') ? topics.has(target) : pages.has(target), page.id + ' link ' + target);
    const screenshot = screenshots[page.screenshotId];
    if (!screenshot && optional.has(page.screenshotId)) continue;
    assert(screenshot, page.id + ' captured illustration');
    assert.deepEqual(png(assets + 'guide/' + screenshot.src), [screenshot.width, screenshot.height], page.id + ' unchanged image dimensions');
  }
});
const report = {version: '0.66', passed: checks.every(item => item.passed), checksPassed: checks.filter(item => item.passed).length,
  checks, maps: catalogue.maps.length, practicalPages: pages.size, emulatorUsed: false, actualNativeEngineExecuted: false,
  limitation: 'Checks setup assets and Guide facts only. Actual Android scrolling, swipe selection, controls, launches and audio are verified separately on the delivery APK.',
  sources: Array.from(files).sort().map(name => ({path: name, sha256: hash(name)})), recordedUTC: new Date().toISOString()};
fs.writeFileSync(path.join(root, 'archive/ffa-maps-0.66-ui-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({passed: report.passed, checksPassed: report.checksPassed, maps: report.maps, pages: report.practicalPages}, null, 2));
if (!report.passed) process.exitCode = 1;
