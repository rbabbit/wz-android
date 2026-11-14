'use strict';
/* Real headless Edge against the offline assets. No emulator, engine or game bridge. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'app/src/main/assets');
const out = path.join(root, 'qa/maps-music-066/headless-browser');
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const debugPort = 9265;
const draft = process.argv.includes('--draft');
const checks = [], screenshots = [], exceptions = [], badResponses = [], externalRequests = [], annotationFigures = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const rel = filename => path.relative(root, filename).replaceAll('\\', '/');
function check(name, body) {
  return Promise.resolve().then(body).then(detail => {
    checks.push({name, passed: true, ...(detail ? {detail} : {})}); console.log('PASS: ' + name);
  }, error => {
    checks.push({name, passed: false, error: error.message}); console.error('FAIL: ' + name + ': ' + error.message);
  });
}
async function until(body, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await body(); if (value) return value; } catch (error) { last = error; }
    await delay(50);
  }
  throw new Error('Timed out: ' + label + (last ? ': ' + last.message : ''));
}
class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.next = 0; this.pending = new Map(); this.listeners = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, {once: true}); this.ws.addEventListener('error', reject, {once: true}); });
    this.ws.addEventListener('message', event => {
      const packet = JSON.parse(String(event.data));
      if (packet.id) {
        const pending = this.pending.get(packet.id); if (!pending) return;
        this.pending.delete(packet.id); clearTimeout(pending.timer);
        packet.error ? pending.reject(new Error(packet.error.message)) : pending.resolve(packet.result);
      } else for (const listener of this.listeners.get(packet.method) || []) listener(packet.params);
    });
  }
  on(method, listener) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(listener); }
  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      this.pending.set(id, {resolve, reject, timer}); this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.ws.close(); for (const item of this.pending.values()) clearTimeout(item.timer); }
}
let server, edge, cdp, origin;
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json'};
async function start() {
  assert(fs.existsSync(edgePath), 'Installed Edge not found');
  assert(fs.existsSync(path.join(assets, 'guide/screenshots-data.js')), 'Screenshots must be ready before real browser verification');
  try { const response = await fetch('http://127.0.0.1:' + debugPort + '/json/version', {signal: AbortSignal.timeout(500)}); if (response.ok) throw new Error('Debug port ' + debugPort + ' is already owned; refusing to attach'); }
  catch (error) { if (error.message.includes('already owned')) throw error; }
  fs.mkdirSync(out, {recursive: true});
  server = http.createServer((request, response) => {
    let requested;
    try { requested = decodeURIComponent(new URL(request.url, 'http://local').pathname); } catch { response.writeHead(400); response.end(); return; }
    if (requested === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const filename = requested.startsWith('/assets/') ? path.resolve(assets, requested.slice(8)) : '';
    if (!filename.startsWith(assets + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const profile = path.join(out, 'profile-' + Date.now());
  edge = cp.spawn(edgePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--force-device-scale-factor=1',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile, 'about:blank'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  const log = fs.createWriteStream(path.join(out, 'edge.log')); edge.stdout.pipe(log); edge.stderr.pipe(log);
  const tab = await until(async () => {
    const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list');
    return (await response.json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl);
  }, 'temporary Edge debugging target', 15000);
  cdp = new CDP(tab.webSocketDebuggerUrl); await cdp.open();
  cdp.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  cdp.on('Network.responseReceived', event => { if (event.response.status >= 400) badResponses.push({url: event.response.url, status: event.response.status}); });
  cdp.on('Network.requestWillBeSent', event => { if (/^https?:/.test(event.request.url) && !event.request.url.startsWith(origin + '/')) externalRequests.push(event.request.url); });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setFocusEmulationEnabled', {enabled: true});
}
async function paint() { await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); }
async function load(width = 800, height = 360, large = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height});
  await cdp.send('Page.navigate', {url: origin + '/assets/guide/index.html?mode=towers'});
  await until(() => cdp.evaluate('document.readyState === "complete" && Boolean(window.WarzoneGuide)'), 'Guide reader ready');
  await cdp.evaluate('document.fonts.ready');
  if (large) {
    // Host text-stress profile. Android font-scale behavior is checked separately on device.
    await cdp.evaluate('document.documentElement.style.fontSize="calc(18.2px * var(--scale))";document.getElementById("type-size").click()');
  }
  await paint();
}
async function state() { return cdp.evaluate('window.WarzoneGuide.state()'); }
async function click(selector) { await cdp.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing selector');el.click()})()`); await paint(); }
async function key(key, code, virtualKey) {
  await cdp.send('Input.dispatchKeyEvent', {type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
    ...(key === 'Enter' ? {text: '\r', unmodifiedText: '\r'} : {})});
  await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey}); await paint();
}
async function imageReady(timeout = 10000) {
  return until(() => cdp.evaluate('Array.from(document.querySelectorAll("#main img")).every(img=>img.complete&&img.naturalWidth>0)'), 'current Guide images decode', timeout);
}
async function annotationGeometry(selector, dialog = false) {
  return cdp.evaluate(`(()=>{
    const host=document.querySelector(${JSON.stringify(selector)}),wrap=host?.querySelector('.screen-wrap');
    if(!host||!wrap)throw Error('Missing annotation figure');
    const svg=wrap.querySelector('svg'),frame=(${dialog ? 'wrap' : 'host.firstElementChild'}).getBoundingClientRect();
    const shapes=[...svg.querySelectorAll('rect,line,ellipse,text')];
    const strokes=shapes.flatMap((el,index)=>['rect','line'].includes(el.localName)?[index]:[]);
    const badgeOrder=shapes.flatMap((el,index)=>['ellipse','text'].includes(el.localName)?[index]:[]);
    const labels=[...svg.querySelectorAll('text')];
    const badges=[...svg.querySelectorAll('ellipse')].map((el,index)=>{
      const r=el.getBoundingClientRect(),stroke=parseFloat(getComputedStyle(el).strokeWidth)||0;
      return{number:labels[index]?.textContent,center:[r.x+r.width/2,r.y+r.height/2],radius:r.width/2+stroke/2,verticalRadius:r.height/2+stroke/2,rect:r.toJSON(),stroke};
    });
    return{frame:frame.toJSON(),badges,labels:labels.length,rectangles:svg.querySelectorAll('rect').length,arrows:svg.querySelectorAll('line').length,
      paintOrder:strokes.length>0&&badgeOrder.length>0&&Math.max(...strokes)<Math.min(...badgeOrder)};
  })()`);
}
function annotationIssues(geometry, expected, label) {
  const issues = [];
  if (geometry.badges.length !== expected || geometry.labels !== expected) issues.push(label + ': missing numbered badges');
  if (!geometry.paintOrder) issues.push(label + ': targets/arrows paint after badges');
  if (geometry.rectangles < expected * 2 || geometry.arrows < expected * 2) issues.push(label + ': missing target or arrow strokes');
  const frame = geometry.frame;
  for (const badge of geometry.badges) {
    const [x, y] = badge.center, radius = badge.radius, vertical = badge.verticalRadius;
    if (!(radius > 0 && vertical > 0) || Math.abs(radius - vertical) > .5) issues.push(label + ': badge ' + badge.number + ' is not a physical circle');
    if (x - radius < frame.x - .75 || x + radius > frame.right + .75 || y - vertical < frame.y - .75 || y + vertical > frame.bottom + .75)
      issues.push(label + ': badge ' + badge.number + ' clips image/crop bounds');
  }
  for (let i = 0; i < geometry.badges.length; i++) for (let j = i + 1; j < geometry.badges.length; j++) {
    const a = geometry.badges[i], b = geometry.badges[j];
    const distance = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
    if (distance + .75 < a.radius + b.radius) issues.push(label + ': badges ' + a.number + '/' + b.number + ' overlap (distance ' + distance.toFixed(2) + ', combined radii ' + (a.radius + b.radius).toFixed(2) + ')');
  }
  return issues;
}
async function screenshot(name) {
  await paint(); const result = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  const filename = path.join(out, name + '.png'); fs.writeFileSync(filename, Buffer.from(result.data, 'base64'));
  screenshots.push({path: rel(filename), sha256: sha(filename)}); return filename;
}
async function layout(label) {
  const result = await cdp.evaluate(`(()=>{
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
    const toolbar=[...document.querySelectorAll('.tools button,.tools input,.tools select')].filter(visible).map(el=>({name:el.id||el.textContent,rect:el.getBoundingClientRect().toJSON()}));
    const rows=[...document.querySelectorAll('.tool-row,.search-row')].map(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
    const main=document.getElementById('main');return{viewport:[innerWidth,innerHeight],root:[document.documentElement.clientWidth,document.documentElement.scrollWidth],main:[main.clientWidth,main.scrollWidth],rows,toolbar};
  })()`);
  assert(result.root[1] <= result.root[0] + 1, label + ' document horizontal overflow');
  assert(result.main[1] <= result.main[0] + 1, label + ' main horizontal overflow');
  result.rows.forEach(row => assert(row.scroll <= row.width + 1, label + ' toolbar overflow'));
  result.toolbar.forEach(control => {
    const r = control.rect;
    assert(r.x >= -1 && r.y >= -1 && r.right <= result.viewport[0] + 1 && r.bottom <= result.viewport[1] + 1, label + ' clipped toolbar: ' + control.name);
  });
  return result;
}
async function goto(kind, id) { await cdp.evaluate(`WarzoneGuide.go(${JSON.stringify({kind, ...(id ? {id} : {})})})`); await paint(); }
async function run() {
  await start();
  if (draft) checks.push({name: 'New v0.66 FFA picker capture is ready for final source pinning', passed: null, status: 'photo-pending'});
  else await check('New v0.66 FFA picker capture is ready for final source pinning', async () => {
    const context = {window: {}};
    require('node:vm').runInNewContext(fs.readFileSync(path.join(assets, 'guide/screenshots-data.js'), 'utf8'), context);
    const figure = context.window.WarzoneGuideScreenshots['ffa-setup'];
    assert.equal(figure.src, 'screenshots/ffa-setup-066.png');
    assert.match(figure.caption, /0\.66/);
    assert(fs.existsSync(path.join(assets, 'guide', figure.src)));
  });
  await check('Offline reader loads and reports all native mode catalogues', async () => {
    await load();
    const result = {};
    for (const mode of ['towers', 'ffa', 'campaign']) {
      await cdp.evaluate(`document.getElementById('mode').value=${JSON.stringify(mode)};document.getElementById('mode').dispatchEvent(new Event('change',{bubbles:true}))`);
      result[mode] = await cdp.evaluate('WarzoneGuide.counts()');
    }
    assert.equal(result.towers.topics, 390); assert.equal(result.ffa.topics, 390); assert.equal(result.campaign.topics, 413);
    assert.equal(result.towers.chapters, 10); assert.equal(result.towers.pages, 44);
    await load(); return result;
  });
  const allPages = await cdp.evaluate('WarzoneGuidePracticalData.chapters.flatMap(ch=>ch.pages.map(p=>({id:p.id,title:p.title,mode:p.modes[0],steps:p.steps.length,optional:["construction-recovery","campaign-transport"].includes(p.screenshotId)})))');
  await check('All 44 practical pages render their steps and captured annotations', async () => {
    assert.equal(allPages.length, 44);
    let annotated = 0;
    for (const page of allPages) {
      await cdp.evaluate(`document.getElementById('mode').value=${JSON.stringify(page.mode)};document.getElementById('mode').dispatchEvent(new Event('change'));WarzoneGuide.go({kind:'page',id:${JSON.stringify(page.id)}})`);
      await paint(); await imageReady();
      const rendered = await cdp.evaluate(`(()=>{
        const clippedBadges=[...document.querySelectorAll('#main .screenshot svg ellipse')].flatMap(el=>{
          const r=el.getBoundingClientRect(),crop=el.closest('button').firstElementChild.getBoundingClientRect();
          return r.x<crop.x-1||r.y<crop.y-1||r.right>crop.right+1||r.bottom>crop.bottom+1?[{badge:el.nextElementSibling?.textContent,rect:r.toJSON(),crop:crop.toJSON()}]:[];
        });
        return{title:document.querySelector('#main h1')?.textContent,steps:document.querySelectorAll('#main .steps li').length,image:document.querySelectorAll('#main .screenshot img').length,targets:document.querySelectorAll('#main svg rect').length,keys:document.querySelectorAll('#main .annotation-key li').length,clippedBadges};
      })()`);
      assert.equal(rendered.title, page.title); assert.equal(rendered.steps, page.steps, page.id);
      if (!page.optional) { assert.equal(rendered.image, 1, page.id + ' screenshot'); assert(rendered.targets >= 2 && rendered.keys >= 1, page.id + ' annotation overlay'); annotated++; }
      assert.equal(rendered.clippedBadges.length, 0, page.id + ' annotation badges clipped by focus crop: ' + rendered.clippedBadges.map(item => item.badge).join(', '));
    }
    return {pages: allPages.length, annotatedRequiredPages: annotated};
  });
  await check('All 16 screenshot records have separated, bounded badges above targets in thumbnail and full dialog', async () => {
    await load();
    const figures = await cdp.evaluate(`(()=>{
      const pages=WarzoneGuidePracticalData.chapters.flatMap(ch=>ch.pages);
      return Object.entries(WarzoneGuideScreenshots).map(([id,record])=>{
        const page=pages.find(p=>p.screenshotId===id);if(!page)throw Error('No practical page for '+id);
        return{id,src:record.src,pageId:page.id,mode:page.modes.includes(record.mode)?record.mode:page.modes[0],expected:page.callouts?.length||record.callouts.length};
      });
    })()`);
    assert.equal(figures.length, 16); assert.equal(new Set(figures.map(item => item.src)).size, 14);
    assert(figures.some(item => item.id === 'intelligence-report'), 'Exact-overlap Intelligence case must be included');
    assert(figures.some(item => item.id === 'phone-blueprints'), 'Distinct alias crop must be included');
    const issues = [], deadline = Date.now() + 15000;
    for (const figure of figures) {
      if (Date.now() > deadline) { issues.push('Annotation group exceeded its 15-second bound'); break; }
      await cdp.evaluate(`document.getElementById('mode').value=${JSON.stringify(figure.mode)};document.getElementById('mode').dispatchEvent(new Event('change'));WarzoneGuide.go({kind:'page',id:${JSON.stringify(figure.pageId)}})`);
      await paint(); await imageReady(1500);
      const thumbnail = await annotationGeometry('#main .screenshot button');
      issues.push(...annotationIssues(thumbnail, figure.expected, figure.id + '/thumbnail'));
      if (figure.id === 'intelligence-report') await screenshot('guide-800-intelligence-thumbnail');
      await click('#main .screenshot button');
      await until(() => cdp.evaluate('document.querySelector("#image-stage img")?.complete&&document.querySelector("#image-stage img")?.naturalWidth>0'), 'full dialog image decode', 1500);
      const dialog = await annotationGeometry('#image-stage', true);
      issues.push(...annotationIssues(dialog, figure.expected, figure.id + '/full'));
      if (figure.id === 'intelligence-report') await screenshot('guide-800-intelligence-full-dialog');
      await click('#image-close');
      annotationFigures.push({...figure, thumbnail, dialog});
    }
    assert.equal(annotationFigures.length, 16, 'Every record must be checked before accepting the group');
    assert.equal(issues.length, 0, issues.join('; '));
    return {records: figures.length, originalPNGs: 14, views: figures.length * 2, elapsedWithin15Seconds: true};
  });
  await check('Research links, practical related links, search and in-reader Back navigate correctly', async () => {
    await load();
    await cdp.evaluate(`(()=>{const title=WarzoneGuideResearchData.sections.find(s=>s.id==='machineguns').title;[...document.querySelectorAll('#main .card')].find(b=>b.querySelector('strong')?.textContent===title).click()})()`);
    assert.equal((await state()).route.id, 'machineguns');
    await click('#main .topic-row'); assert.equal((await state()).route.kind, 'topic');
    assert((await cdp.evaluate('document.querySelector("#main").textContent')).includes('Reference: R-'));
    await click('#back'); assert.equal((await state()).route.id, 'machineguns');
    const advanced = await cdp.evaluate('WarzoneGuideResearchData.catalogues.towers.find(t=>t.requiresAll?.length>=2).id');
    await goto('topic', advanced);
    const dependency = await cdp.evaluate('WarzoneGuideResearchData.catalogues.towers.find(t=>t.id===' + JSON.stringify(advanced) + ').requiresAll[0]');
    await click('#main .links button'); assert.equal((await state()).route.id, dependency);
    await goto('page', 'start-with-a-plan'); await click('#main .links button'); assert.equal((await state()).route.id, 'research-overview');
    await click('#back'); assert.equal((await state()).route.id, 'start-with-a-plan');
    await cdp.evaluate('document.getElementById("query").value="machinegun";document.getElementById("query").dispatchEvent(new Event("input",{bubbles:true}))');
    await until(() => cdp.evaluate('document.querySelector("#main .search-summary")?.textContent'), 'search results');
    assert((await cdp.evaluate('document.querySelectorAll("#main .topic-row,#main .card").length')) > 0);
    await click('#main .topic-row'); assert.equal((await state()).route.kind, 'topic');
    await key('Escape', 'Escape', 27); assert.equal((await state()).query, 'machinegun');
  });
  await check('Screenshot dialog decodes, zooms, closes with Back and restores focus', async () => {
    await load(); await goto('page', 'research-lab-queue'); await imageReady();
    await cdp.evaluate('document.querySelector("#main .screenshot button").focus()'); await key('Enter', 'Enter', 13);
    assert.equal((await state()).imageOpen, true, 'Keyboard Enter opens screenshot dialog');
    await click('#image-in'); await click('#image-in');
    assert.equal(await cdp.evaluate('document.getElementById("image-stage").style.width'), '200%');
    assert(await cdp.evaluate('document.querySelector("#image-stage img").complete&&document.querySelector("#image-stage img").naturalWidth>0'));
    await click('#image-close'); assert.equal((await state()).imageOpen, false);
    assert(await cdp.evaluate('document.activeElement===document.querySelector("#main .screenshot button")'));
    await key('Enter', 'Enter', 13); assert.equal((await state()).imageOpen, true, 'Keyboard Enter reopens focused screenshot');
    await key('Escape', 'Escape', 27); assert.equal((await state()).imageOpen, false);
  });
  for (const profile of [{name: '800', width: 800, height: 360, large: false}, {name: '640-large', width: 640, height: 360, large: true}]) {
    await check(profile.name + ': every practical page stays within horizontal bounds; representative screens captured', async () => {
      await load(profile.width, profile.height, profile.large); await layout(profile.name + ' research root');
      await screenshot('guide-' + profile.name + '-research-root');
      const topic = await cdp.evaluate('WarzoneGuideResearchData.catalogues.towers.find(t=>t.requiresAll?.length>=2).id');
      await goto('topic', topic); await layout(profile.name + ' native topic'); await screenshot('guide-' + profile.name + '-research-topic');
      for (const page of allPages) {
        await goto('page', page.id); await layout(profile.name + ' ' + page.id);
      }
      await goto('page', 'research-lab-queue'); await imageReady(); await screenshot('guide-' + profile.name + '-practical-page');
      await goto('page', 'first-economy'); await imageReady(); await screenshot('guide-' + profile.name + '-build-page');
      if (profile.large) {
        await goto('page', 'research-lab-queue'); await imageReady();
        await click('#main .screenshot button');
        const dialog = await cdp.evaluate('(()=>{const d=document.getElementById("image-viewer");return{width:d.clientWidth,scroll:d.scrollWidth,buttons:[...d.querySelectorAll(".image-toolbar button")].map(b=>({id:b.id,rect:b.getBoundingClientRect().toJSON()}))}})()');
        assert(dialog.scroll <= dialog.width + 1, 'Large-text image dialog horizontal overflow');
        for (const item of dialog.buttons) assert(item.rect.x >= 0 && item.rect.right <= profile.width && item.rect.y >= 0 && item.rect.bottom <= profile.height, 'Large-text image toolbar clipped: ' + item.id);
        await screenshot('guide-' + profile.name + '-image-dialog'); await key('Escape', 'Escape', 27);
        await click('#contents'); assert.equal(await cdp.evaluate('document.getElementById("contents").getAttribute("aria-expanded")'), 'true');
        await key('Escape', 'Escape', 27); assert.equal(await cdp.evaluate('document.getElementById("contents").getAttribute("aria-expanded")'), 'false');
      }
      return {viewport: [profile.width, profile.height], hostBaseTextScale: profile.large ? 1.3 : 1, readerLargeText: profile.large};
    });
  }
  await check('Keyboard Tab and Enter expose visible, focused controls', async () => {
    await load(640, 360, true);
    await key('Tab', 'Tab', 9);
    const focused = [];
    for (let n = 0; n < 8; n++) {
      const item = await cdp.evaluate('(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id:e.id,tag:e.tagName,text:e.textContent?.slice(0,80),x:r.x,y:r.y,right:r.right,bottom:r.bottom,outline:s.outlineStyle}})()');
      assert(item.x >= -1 && item.y >= -1 && item.right <= 641 && item.bottom <= 361, 'Keyboard focus clipped: ' + item.id);
      assert(item.outline !== 'none', 'Keyboard focus not visible: ' + item.id); focused.push(item);
      await key('Tab', 'Tab', 9);
    }
    await cdp.evaluate('document.getElementById("sources").focus()'); await key('Enter', 'Enter', 13);
    assert.equal((await state()).route.kind, 'sources'); await key('Escape', 'Escape', 27); assert.equal((await state()).route.kind, 'research');
    return focused;
  });
  await check('Reader issues no external requests, missing resources or JavaScript exceptions', async () => {
    assert.deepEqual(externalRequests, []); assert.deepEqual(badResponses, []); assert.deepEqual(exceptions, []);
  });
}
(async () => {
  let fatal;
  try { await run(); } catch (error) { fatal = error.stack || error.message; console.error(fatal); }
  finally {
    if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.close(); }
    if (edge && edge.exitCode === null) { try { edge.kill(); } catch {} }
    if (server) await new Promise(resolve => server.close(resolve));
  }
  const sources = ['tools/check-guide-browser-066.cjs', 'app/src/main/assets/guide/index.html', 'app/src/main/assets/guide/guide.js', 'app/src/main/assets/guide/guide.css',
    'app/src/main/assets/guide/practical-data.js', 'app/src/main/assets/guide/research-data.js', 'app/src/main/assets/guide/screenshots-data.js',
    ...new Set(annotationFigures.map(item => 'app/src/main/assets/guide/' + item.src))];
  const passed = !fatal && checks.length > 0 && checks.every(item => item.passed);
  const report = {version: '0.66', passed, draft, status: draft ? 'draft-photo-pending' : passed ? 'passed' : 'failed', checksPassed: checks.filter(item => item.passed).length, checks, fatal: fatal || null,
    browser: edgePath, headless: true, emulatorUsed: false, actualNativeEngineExecuted: false,
    limitation: 'Headless HTML reader and host text-stress checks. Android Home/Help integration, font scale and gameplay are verified separately on the exact APK.',
    screenshots, annotationFigures, sources: sources.filter(name => fs.existsSync(path.join(root, name))).map(name => ({path: name, sha256: sha(path.join(root, name))})), recordedUTC: new Date().toISOString()};
  fs.mkdirSync(path.join(root, 'archive'), {recursive: true});
  fs.writeFileSync(path.join(root, 'archive/guide-0.66-browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({passed, status: report.status, checksPassed: report.checksPassed, checksFailed: checks.filter(item => item.passed === false).length, screenshots: screenshots.length, fatal: report.fatal}, null, 2));
  if (!passed && !draft) process.exitCode = 1;
})();
