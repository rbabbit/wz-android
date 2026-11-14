'use strict';
/* Offline content integrity only. Real screen/annotation quality is verified by emulator QA.
 * node tools/check-guide-content-065.cjs [--allow-pending-assets] [--record]
 * The explicit pending-assets option permits drafting, but never records passed:true.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const guidePath = 'app/src/main/assets/guide/';
const practicalPath = guidePath + 'practical-data.js';
const researchPath = guidePath + 'research-data.js';
const screenshotsPath = guidePath + 'screenshots-data.js';
const allowPending = process.argv.includes('--allow-pending-assets');
const record = process.argv.includes('--record');
const unknownArgs = process.argv.slice(2).filter(arg => !['--allow-pending-assets', '--record'].includes(arg));
assert.equal(unknownArgs.length, 0, 'Unknown arguments: ' + unknownArgs.join(', '));
const checks = [], pending = [], sourcePaths = new Set([practicalPath, 'tools/check-guide-content-065.cjs']);
const optionalImages = new Set(['construction-recovery', 'campaign-transport']);
const validModes = new Set(['towers', 'ffa', 'campaign']);
const slug = /^[a-z][a-z0-9-]*$/;
const abs = name => path.resolve(root, name);
const read = name => fs.readFileSync(abs(name), 'utf8');
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(abs(name))).digest('hex');
function check(name, body) {
  try {
    const result = body();
    if (result === 'pending') { checks.push({name, passed: null, status: 'pending'}); console.log('PENDING: ' + name); }
    else { checks.push({name, passed: true}); console.log('PASS: ' + name); }
  }
  catch (error) { checks.push({name, passed: false, error: error.message}); console.error('FAIL: ' + name + ': ' + error.message); }
}
function load(name, globalName, required) {
  if (!fs.existsSync(abs(name))) {
    if (required) throw new Error('Missing ' + name);
    pending.push('Missing ' + name);
    return null;
  }
  sourcePaths.add(name);
  const sandbox = {window: {}};
  vm.runInNewContext(read(name), sandbox, {filename: name, timeout: 5000});
  assert(sandbox.window[globalName], name + ' must define window.' + globalName);
  return sandbox.window[globalName];
}
const practical = load(practicalPath, 'WarzoneGuidePracticalData', true);
const research = load(researchPath, 'WarzoneGuideResearchData', false);
const screenshots = load(screenshotsPath, 'WarzoneGuideScreenshots', false);
const chapters = new Map(), pages = new Map();

check('Ten practical chapters contain unique, concise pages with valid mode scopes', () => {
  const required = ['first-five-minutes', 'controls-and-orders', 'building-and-recovery', 'research-and-intelligence',
    'manufacturing-and-design', 'towers-survival', 'ffa-cobra', 'campaign-missions', 'saves-and-rewards', 'troubleshooting'];
  assert(Array.isArray(practical.chapters));
  assert.equal(practical.chapters.length, required.length);
  for (const chapter of practical.chapters) {
    assert(slug.test(chapter.id) && !chapters.has(chapter.id), 'Duplicate/invalid chapter: ' + chapter.id);
    assert(chapter.title && chapter.summary && chapter.summary.length <= 200, chapter.id + ' heading');
    assert(Array.isArray(chapter.pages) && chapter.pages.length >= 3, chapter.id + ' pages');
    chapters.set(chapter.id, chapter);
    for (const page of chapter.pages) {
      assert(slug.test(page.id) && !pages.has(page.id), 'Duplicate/invalid page: ' + page.id);
      assert(page.title && page.title.length <= 80, page.id + ' title');
      assert(Array.isArray(page.modes) && page.modes.length && new Set(page.modes).size === page.modes.length, page.id + ' modes');
      page.modes.forEach(mode => assert(validModes.has(mode), page.id + ' mode ' + mode));
      assert(Array.isArray(page.steps) && page.steps.length >= 2 && page.steps.length <= 4, page.id + ' step count');
      page.steps.forEach(step => assert(step.title && step.title.length <= 80 && step.text && step.text.length <= 410, page.id + ' long/empty step'));
      assert(Array.isArray(page.notes) && page.notes.length <= 3, page.id + ' notes');
      page.notes.forEach(note => assert(typeof note === 'string' && note.length <= 410, page.id + ' long/invalid note'));
      assert(typeof page.screenshotId === 'string' && slug.test(page.screenshotId), page.id + ' screenshot ID');
      assert(Array.isArray(page.callouts) && Array.isArray(page.related), page.id + ' annotation/link arrays');
      pages.set(page.id, page);
    }
  }
  required.forEach(id => assert(chapters.has(id), 'Missing chapter ' + id));
  assert(pages.size >= 40 && pages.size <= 50, 'Unexpected practical page count: ' + pages.size);
});

function collectResearch(value, topics, sections, key = '') {
  if (!value || typeof value !== 'object') return;
  if (typeof value.id === 'string' && /^R-/.test(value.id)) topics.add(value.id);
  if (Array.isArray(value)) {
    if (key === 'sections') for (const item of value) if (item && typeof item.id === 'string') sections.add(item.id);
    for (const item of value) collectResearch(item, topics, sections);
  } else for (const [childKey, child] of Object.entries(value)) collectResearch(child, topics, sections, childKey);
}
const topicIds = new Set(), sectionIds = new Set();
if (research) collectResearch(research, topicIds, sectionIds);
check('Every related link resolves to a practical page, native topic or research section', () => {
  let deferred = false;
  for (const page of pages.values()) for (const id of page.related) {
    assert(typeof id === 'string', page.id + ' non-string link');
    if (id.startsWith('R-')) {
      if (research) assert(topicIds.has(id), page.id + ' unknown native topic ' + id);
      else if (!allowPending) assert.fail('Cannot validate native links until research-data.js exists');
      else deferred = true;
    } else if (id.startsWith('section:')) {
      if (research) assert(sectionIds.has(id.slice(8)), page.id + ' unknown section ' + id);
      else if (!allowPending) assert.fail('Cannot validate section links until research-data.js exists');
      else deferred = true;
    } else assert(pages.has(id), page.id + ' unknown practical page ' + id);
  }
  return deferred ? 'pending' : undefined;
});

const pageText = id => {
  assert(pages.has(id), 'Missing required page ' + id);
  return JSON.stringify(pages.get(id));
};
check('Mode-specific rules and documented limitations remain explicit', () => {
  for (const id of ['ffa-start', 'ffa-economy', 'ffa-high-oil', 'ffa-no-air-and-legacy']) assert.deepEqual(Array.from(pages.get(id).modes), ['ffa']);
  for (const id of ['campaign-start', 'campaign-objectives', 'campaign-transporter', 'campaign-briefings']) assert.deepEqual(Array.from(pages.get(id).modes), ['campaign']);
  for (const id of ['towers-wave-flow', 'towers-enemy-info', 'towers-command-centre', 'towers-map-progress', 'completion-and-crystals', 'towers-reward-stock', 'towers-support-boosts']) assert.deepEqual(Array.from(pages.get(id).modes), ['towers']);
  assert.match(pageText('ffa-start'), /three independent Cobra/);
  assert.match(pageText('ffa-no-air-and-legacy'), /VTOL is OFF/);
  assert.match(pageText('ffa-no-air-and-legacy'), /does not convert/);
  assert.match(pageText('ffa-high-oil'), /not 120 oil/);
  assert.match(pageText('towers-wave-flow'), /Surviving enemies stay/);
  assert.match(pageText('campaign-objectives'), /no added universal objective-checklist/);
  assert.match(pageText('campaign-transporter'), /vary by mission/);
  assert.match(pageText('phone-blueprints'), /Research its components again/);
  assert.match(pageText('manual-save'), /wait for Game saved/);
  assert.match(pageText('construction-recovery'), /Campaign uses RETRY/);
  assert.match(pageText('read-intelligence'), /initially granted technology may not issue/);
  const visible = JSON.stringify(practical.chapters);
  assert(!/PATROL|SELECT \/ MOVE|EXIT . KEEP ORDERS|NEAR.?BATTLE.?MAP|BOX button/.test(visible), 'Obsolete public Help controls');
});

check('Audited source records exist and numerical guidance matches bundled mode data', () => {
  assert(practical.sourceMetadata && practical.sourceMetadata.auditedRelease === '0.64');
  assert(practical.sourceMetadata.sources.length >= 12);
  for (const source of practical.sourceMetadata.sources) {
    assert(source.path && Array.isArray(source.areas) && source.areas.length, 'Incomplete source record');
    assert(fs.existsSync(abs(source.path)), 'Missing source ' + source.path);
    sourcePaths.add(source.path);
  }
  const cataloguePath = 'app/src/main/assets/warzone/levels/catalog.json';
  sourcePaths.add(cataloguePath);
  const counts = {};
  for (const level of JSON.parse(read(cataloguePath)).levels) counts[level.difficulty] = (counts[level.difficulty] || 0) + 1;
  assert.deepEqual(counts, {easy: 16, hard: 15, medium: 15});
  assert.match(pageText('towers-map-progress'), /16 Easy, 15 Medium and 15 Hard/);
  const rewards = read('app/src/main/java/com/rbabbit/blocknight/warzone/RewardCatalog.java');
  assert.match(rewards, /25% faster research for one match/);
  assert.match(rewards, /\+1,000 starting power for one match/);
  assert.match(pageText('towers-support-boosts'), /research rate increases by 25%/);
  assert.match(pageText('towers-support-boosts'), /1,000 extra power/);
  const ledger = read('app/src/main/java/com/rbabbit/blocknight/warzone/RewardLedger.java');
  assert.match(ledger, /DIFFICULTY_COMPLETION_CRYSTALS\s*=\s*1000/);
  assert.match(pageText('completion-and-crystals'), /one-time 1,000-crystal/);
  const tactics = read('scenario/ffa/stock/cobra/cobra_includes/tactics.js');
  assert.match(tactics, /__amountOfAttackers\s*>=\s*\(highOilMap\(\)\s*\?\s*120\s*:\s*20\)/);
});

function validateCallouts(list, label) {
  assert(Array.isArray(list), label + ' callouts');
  const numbers = new Set();
  for (const callout of list) {
    assert(Number.isInteger(callout.number) && callout.number >= 1 && !numbers.has(callout.number), label + ' duplicate/invalid callout number');
    numbers.add(callout.number);
    assert(typeof callout.label === 'string' && callout.label.trim() && callout.label.length <= 160, label + ' callout label');
    const rect = callout.targetRect;
    assert(Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite), label + ' target rectangle');
    assert(rect[0] >= 0 && rect[1] >= 0 && rect[2] > 0 && rect[3] > 0 && rect[0] + rect[2] <= 1.000001 && rect[1] + rect[3] <= 1.000001, label + ' target outside original image');
  }
}
function pngDimensions(filename) {
  const bytes = fs.readFileSync(filename);
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Expected original PNG capture: ' + filename);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
const usedImages = new Set(), missingOptionalImages = new Set();
check('Screenshot references use real files, original dimensions and bounded SVG targets', () => {
  for (const page of pages.values()) validateCallouts(page.callouts, page.id);
  if (!screenshots) {
    if (!allowPending) assert.fail('Screenshot manifest is not available');
    return 'pending';
  }
  const guideRoot = abs(guidePath);
  for (const [id, image] of Object.entries(screenshots)) {
    assert(slug.test(id), 'Invalid screenshot ID ' + id);
    assert(typeof image.src === 'string' && image.src.startsWith('screenshots/'), id + ' local capture path');
    const filename = path.resolve(guideRoot, image.src);
    assert(filename.startsWith(guideRoot + path.sep), id + ' path escapes Guide');
    assert(fs.existsSync(filename), id + ' missing captured file');
    const [width, height] = pngDimensions(filename);
    assert.equal(image.width, width, id + ' original width');
    assert.equal(image.height, height, id + ' original height');
    assert(typeof image.caption === 'string' && image.caption.trim(), id + ' caption');
    assert(validModes.has(image.mode) || image.mode === 'all', id + ' image mode');
    validateCallouts(image.callouts, id);
    if (image.focusRect) {
      const rect = image.focusRect;
      assert(Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite), id + ' focus rectangle');
      assert(rect[0] >= 0 && rect[1] >= 0 && rect[2] > 0 && rect[3] > 0 && rect[0] + rect[2] <= 1.000001 && rect[1] + rect[3] <= 1.000001, id + ' focus crop outside original image');
      for (const callout of image.callouts) {
        const target = callout.targetRect;
        assert(target[0] >= rect[0] - .000001 && target[1] >= rect[1] - .000001 && target[0] + target[2] <= rect[0] + rect[2] + .000001 && target[1] + target[3] <= rect[1] + rect[3] + .000001, id + ' cropped target ' + callout.number);
      }
    }
    sourcePaths.add(path.relative(root, filename).replaceAll('\\', '/'));
  }
  for (const page of pages.values()) {
    const image = screenshots[page.screenshotId];
    if (!image && optionalImages.has(page.screenshotId)) { missingOptionalImages.add(page.screenshotId); continue; }
    assert(image, page.id + ' unresolved screenshot ' + page.screenshotId);
    const callouts = page.callouts.length ? page.callouts : image.callouts;
    assert(callouts.length, page.id + ' needs a verified page or manifest annotation');
    usedImages.add(image.src);
  }
  assert(usedImages.size >= 6, 'Expected at least six distinct representative original captures');
});

if (pending.length && !allowPending) check('Required research and screenshot assets are present', () => assert.fail(pending.join('; ')));
const failed = checks.filter(item => item.passed === false);
const report = {
  version: '0.65', passed: !failed.length && !pending.length,
  status: failed.length ? 'failed' : pending.length ? 'content-passed-assets-pending' : 'passed',
  checksPassed: checks.filter(item => item.passed === true).length, checks, pendingAssets: pending,
  chapters: chapters.size, pages: pages.size, nativeTopicLinksAvailable: topicIds.size, researchSectionsAvailable: sectionIds.size,
  uniqueCapturedImagesUsed: usedImages.size, optionalImagesNotCaptured: Array.from(missingOptionalImages),
  emulatorUsed: false, actualNativeEngineExecuted: false,
  limitation: 'Checks data integrity and current source facts. It does not establish visual clarity, real gesture behavior or native mission completion.',
  sources: Array.from(sourcePaths).filter(name => fs.existsSync(abs(name))).sort().map(name => ({path: name, sha256: hash(name)})),
  recordedUTC: new Date().toISOString()
};
if (record) {
  const destination = abs('archive/guide-0.65-content-checks.json');
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({status: report.status, checksPassed: report.checksPassed, chapters: report.chapters, pages: report.pages,
  pendingAssets: pending, optionalImagesNotCaptured: report.optionalImagesNotCaptured, uniqueCapturedImagesUsed: usedImages.size}, null, 2));
if (failed.length || (pending.length && !allowPending)) process.exitCode = 1;
