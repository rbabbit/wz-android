'use strict';

// Run only during an explicit emulator handoff. All input is guarded by native-live.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {adb, tree, screen, nativeTap, connect, delay, packageId, out} = require('./native-live.cjs');
const expected = process.env.WZ_LAB_APK_SHA256;
const approved = process.argv.includes('--approved-startup-handoff');
if (!approved || !/^[a-f0-9]{64}$/.test(expected || '')) {
  throw Error('Require the installed candidate hash and --approved-startup-handoff before emulator use');
}
const activity = packageId + '/com.rbabbit.blocknight.warzone.MainActivity';
const report = {started: new Date().toISOString(), expectedAPK_SHA256: expected, cases: [], seeded: false};
const bounds = node => [...node.bounds.matchAll(/-?\d+/g)].map(m => Number(m[0]));
const label = n => n['content-desc'] || n.text;
const write = () => fs.writeFileSync(path.join(out, 'lab-startup-qa.json'), JSON.stringify(report, null, 2));
const currentTree = () => {
  const t = tree();
  return {...t, visible: t.nodes.filter(n => n.bounds && n.bounds !== '[0,0][0,0]')};
};
function installedHash(pkg = packageId) {
  const file = adb('shell', 'pm', 'path', pkg).toString().trim().replace('package:', '');
  assert.ok(file.startsWith('/data/app/'), 'actual installed APK path');
  return adb('shell', 'sha256sum', file).toString().split(/\s/)[0];
}
function stableState() {
  const names = adb('shell', 'run-as', 'com.rbabbit.warzonetowers', 'ls', 'shared_prefs')
    .toString().trim().split(/\r?\n/).filter(n => n.endsWith('.xml')).sort();
  return {
    apkSHA256: installedHash('com.rbabbit.warzonetowers'),
    preferenceHashes: names.map(n => adb('shell', 'run-as', 'com.rbabbit.warzonetowers',
      'sha256sum', 'shared_prefs/' + n).toString().trim())
  };
}
async function waitNative(predicate, description, timeout = 20000) {
  const until = Date.now() + timeout;
  let latest;
  while (Date.now() < until) {
    latest = currentTree();
    if (predicate(latest)) return latest;
    await delay(150);
  }
  throw Error('Native UI did not reach ' + description + ': ' + JSON.stringify(latest?.visible.map(label)));
}
const startupReady = () => waitNative(t => t.visible.some(n =>
  /^Start game, /.test(n['content-desc'] || '') && n.enabled === 'true'), 'enabled Play');
async function capture(name) {
  const t = currentTree();
  fs.writeFileSync(path.join(out, name + '.xml'), t.xml);
  const file = screen(name), png = fs.readFileSync(file);
  return {file: path.basename(file), width: png.readUInt32BE(16), height: png.readUInt32BE(20),
    controls: t.visible.filter(n => n.clickable === 'true').map(n => ({label: label(n),
      bounds: bounds(n), enabled: n.enabled === 'true', class: n.class}))};
}
async function launchStartup() {
  adb('shell', 'am', 'force-stop', packageId);
  adb('shell', 'am', 'start', '-n', activity, '--es', 'map', 'td2');
  await startupReady();
}
function verifyLayout(shot, density) {
  const controls = shot.controls.filter(n => /^(Dustfall map,|Iron Valley map,|Start game,|Graphics options,|Music settings|Download High Quality|HQ pack ready)/.test(n.label));
  assert.equal(controls.length, 6, 'two maps, Play and three utilities are exposed');
  const minimum = Math.round(48 * density / 160);
  for (const c of controls) {
    const [x1, y1, x2, y2] = c.bounds;
    assert.ok(x1 >= 0 && y1 >= 0 && x2 <= shot.width && y2 <= shot.height,
      c.label + ' remains inside the actual screenshot');
    assert.ok(y2 - y1 >= minimum - 1, c.label + ' keeps a 48dp touch height');
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i].bounds, b = controls[j].bounds;
    const width = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const height = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    assert.ok(width <= 0 || height <= 0, 'startup touch targets do not overlap');
  }
  return {minimumTouchPx: minimum, controls};
}
async function profile(name, width, height, font) {
  adb('shell', 'wm', 'size', width + 'x' + height);
  adb('shell', 'wm', 'density', '240');
  adb('shell', 'settings', 'put', 'system', 'font_scale', String(font));
  await launchStartup();
  const shot = await capture('startup-' + name);
  assert.deepEqual([shot.width, shot.height], [width, height], 'actual Android viewport');
  const layout = verifyLayout(shot, 240);
  report.cases.push({name, width, height, fontScale: font, shot, layout});
  write();
  console.log('PASS startup layout ' + name);
}
async function settingsJourney() {
  await nativeTap('Dustfall map, not selected');
  await waitNative(t => t.visible.some(n => n['content-desc'] === 'Start game, Dustfall'), 'Dustfall choice');
  const dustfall = await capture('startup-dustfall-selected');
  await nativeTap('Iron Valley map, not selected');
  await startupReady();
  await nativeTap('Graphics options, Normal');
  await waitNative(t => t.visible.some(n => n.text === 'High Quality'), 'graphics popup');
  const popup = await capture('startup-graphics-popup');
  adb('shell', 'input', 'keyevent', '4');
  await waitNative(t => !t.visible.some(n => n.text === 'High Quality') &&
    t.visible.some(n => n['content-desc'] === 'Start game, Iron Valley'), 'graphics Back dismissal');
  const musicReturns = [];
  for (let i = 1; i <= 2; i++) {
    await nativeTap('Music settings');
    await waitNative(t => t.visible.some(n => n.text === 'Choose your tracks. Nothing is selected by default.'), 'Music page');
    const opened = await capture('startup-music-open-' + i);
    adb('shell', 'input', 'keyevent', '4');
    await startupReady();
    const returned = await capture('startup-music-return-' + i);
    musicReturns.push({opened, returned});
  }
  report.settings = {dustfall, popup, popupDismissedWithBack: true, musicReturns};
  write();
}
async function offlineDownloadCheck(suffix = '') {
  const wifi = adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim();
  const mobile = adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim();
  report.download = {method: 'actual request with Wi-Fi/mobile data disabled temporarily',
    previousWifi: wifi, previousMobileData: mobile, completionTested: false, cancellationTested: false};
  try {
    adb('shell', 'svc', 'wifi', 'disable');
    adb('shell', 'svc', 'data', 'disable');
    await nativeTap('Download High Quality graphics');
    let latest = await waitNative(t => t.visible.some(n => n.text === 'CANCEL DOWNLOAD') ||
      t.visible.some(n => /Connection unavailable|Connection failed|Unable to resolve|Network is unreachable|Failed to connect|Download interrupted/.test(n.text || '')),
      'download cancellation or actual network error', 35000);
    if (latest.visible.some(n => n.text === 'CANCEL DOWNLOAD' && n.enabled === 'true')) {
      report.download.progress = await capture('startup-download-visible' + suffix);
      await nativeTap('CANCEL DOWNLOAD', 5000);
      latest = await waitNative(t => t.visible.some(n => n.text === 'Download paused. Your progress is saved.'), 'cancelled download');
      report.download.cancellationTested = true;
    } else {
      report.download.observedError = latest.visible.map(n => n.text).filter(Boolean);
    }
    report.download.result = await capture('startup-download-result' + suffix);
    const play = latest.visible.find(n => n['content-desc'] === 'Start game, Iron Valley');
    assert.ok(play?.enabled === 'true', 'Normal play remains available after download interruption');
  } finally {
    adb('shell', 'svc', 'wifi', wifi === '1' ? 'enable' : 'disable');
    adb('shell', 'svc', 'data', mobile === '1' ? 'enable' : 'disable');
    report.download.restoredWifi = adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim();
    report.download.restoredMobileData = adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim();
    report.downloadCases = report.downloadCases || [];
    report.downloadCases.push({...report.download, profile: suffix || 'phone'});
    write();
  }
}
async function playAndPause() {
  await nativeTap('Start game, Iron Valley');
  report.loading = await capture('startup-loading');
  const c = await connect();
  try {
    await c.wait('Boolean(window.__warzoneCommands?.report().snapshot && window.__kalaWarzoneTouch?.report().hudVisible)', 90000);
    const reply = await c.evaluate('__warzoneCommands.send("state")');
    assert.equal(reply.ok, true, 'fresh native state response after Play');
    const observed = await c.evaluate('({snapshot:__warzoneCommands.report().snapshot,wave:__warzoneTowersWaves.report().snapshot})');
    assert.equal(observed.snapshot.trucks.length, 6, 'ordinary Iron Valley authored trucks');
    const firstTime = observed.wave.gameTime;
    const {waitAdvancingClock, pause} = require('./lab-journey.cjs');
    await waitAdvancingClock(c, firstTime, 12000);
    const pausedAt = await pause(c);
    report.play = {freshNativeState: true, trucks: observed.snapshot.trucks.map(t => ({id:t.id,x:t.x,y:t.y})), pausedAt,
      screenshot: path.basename(screen('startup-play-paused')), errors: c.errors};
    assert.deepEqual(c.errors, []);
  } finally { c.close(); }
}
(async () => {
  try {
    assert.equal(installedHash(), expected, 'exact handoff candidate is installed');
    report.stableBefore = stableState();
    report.initialViewport = {size: adb('shell', 'wm', 'size').toString().trim(),
      density: adb('shell', 'wm', 'density').toString().trim(),
      fontScale: adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim()};
    await profile('phone', 1080, 600, 1);
    await settingsJourney();
    if (process.argv.includes('--offline-download')) await offlineDownloadCheck();
    else report.download = {completionTested:false,cancellationTested:false,errorTested:false,reason:'No optional pack fetch requested by this run'};
    await profile('wide', 2400, 1080, 1);
    await profile('enlarged', 1080, 600, 1.3);
    if (process.argv.includes('--offline-download')) await offlineDownloadCheck('-enlarged');
    await profile('final-phone', 1080, 600, 1);
    await playAndPause();
    report.installedAPK_SHA256 = installedHash();
    assert.equal(report.installedAPK_SHA256, expected);
    report.stableAfter = stableState();
    assert.deepEqual(report.stableAfter, report.stableBefore, 'stable APK and private preferences remain unchanged');
    report.passed = true;
    write();
    console.log('PASS exact Lab APK startup layouts/settings/actual Play; stable package untouched');
  } catch (e) {
    report.failure = String(e.stack || e);
    try { report.failureScreen = await capture('startup-failure'); } catch (captureError) { report.captureError = String(captureError); }
    write();
    throw e;
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
