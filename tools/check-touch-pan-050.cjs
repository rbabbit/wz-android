'use strict';
// Focused SDL-state regression model. This executes the real adapter, but is
// not a native engine, emulator, renderer, or substitute for device testing.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {fixture: domFixture} = require('./check-touch-pan-049.cjs');
const ROOT = path.resolve(__dirname, '..');
const FILE = 'app/src/main/assets/warzone-touch-controls.js';
const currentSource = () => fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function createSdlOracle(options = {}) {
  // These transitions follow the matched native main_sdl.cpp, not DOM held
  // buttons. In particular, native mouseDown is state != UP, including RELEASED.
  const native = {
    x: 0, y: 0, buttons: new Set(), view: {x: 0, y: 0}, queue: [], frames: [],
    states: new Map([[0, 'UP'], [1, 'UP'], [2, 'UP']]),
    lastDown: new Map([[0, 0], [1, 0], [2, 0]]),
    dragKey: 0, dragX: 0, dragY: 0,
    panActive: false, panMouseX: null, panMouseY: null, panStarts: 0,
    trackerX: null, trackerY: null,
    enqueue(event) {
      this.queue.push({type: event.type, x: event.clientX, y: event.clientY,
        button: event.button, buttons: event.buttons});
    },
    consumeFrame(dt, now) {
      const realTime = 1000 + now;
      const bounds = options.bounds || {left: 0, top: 0};
      const scale = options.displayScale || 1;
      for (const event of this.queue.splice(0)) {
        this.x = Math.trunc((event.x - bounds.left) / scale) & 0xffff;
        this.y = Math.trunc((event.y - bounds.top) / scale) & 0xffff;
        const state = this.states.get(event.button) || 'UP';
        if (event.type === 'pointerdown') {
          if (['UP', 'RELEASED', 'PRESSRELEASE'].includes(state)) {
            const normalize = event.button === 1 && options.normalizeMiddleDoubleClick;
            if (!normalize && realTime - this.lastDown.get(event.button) < 250) {
              this.states.set(event.button, 'DOUBLECLICK');
              this.lastDown.set(event.button, 0);
            } else {
              this.states.set(event.button, 'PRESSED');
              this.lastDown.set(event.button, realTime);
            }
            this.dragKey = event.button;
            this.dragX = this.x; this.dragY = this.y;
          }
        } else if (event.type === 'pointerup') {
          if (state === 'PRESSED') this.states.set(event.button, 'PRESSRELEASE');
          else if (['DOWN', 'DRAG', 'DOUBLECLICK'].includes(state)) this.states.set(event.button, 'RELEASED');
        } else if (event.type === 'pointermove') {
          const dragState = this.states.get(this.dragKey);
          if (['PRESSED', 'DOWN'].includes(dragState)
              && (Math.abs(this.x - this.dragX) > 5 || Math.abs(this.y - this.dragY) > 5)) {
            this.states.set(this.dragKey, 'DRAG');
          }
        }
      }

      // loop.cpp: processMouseClickInput(), displayWorld(), then main_sdl.cpp:
      // inputNewFrame(). The camera anchor is latched on the first KEY_DRAG
      // mainLoop, never on button-down. The tracker eases instead of teleporting.
      if (this.states.get(1) === 'DRAG' && !this.panActive) {
        this.panMouseX = this.dragX; this.panMouseY = this.dragY;
        this.trackerX = {initial: this.view.x, current: this.view.x};
        this.trackerY = {initial: this.view.y, current: this.view.y};
        this.panActive = true; this.panStarts += 1;
      }
      const before = {...this.view};
      if (this.panActive) {
        if (this.states.get(1) === 'UP') this.panActive = false;
        else {
          // Heading zero, cameraSpeed 200: project onto the native pan axes.
          // This isolates lifecycle errors without claiming real world coords.
          const update = (tracker, delta) => {
            const target = tracker.initial + delta;
            const remaining = target - tracker.current;
            if (Math.abs(remaining) < 1) return target;
            let change = remaining * (10 * dt / 1000);
            if (remaining >= 0 && change > remaining || remaining < 0 && change < remaining) change = remaining;
            tracker.current += change;
            return tracker.initial + Math.trunc(tracker.current - tracker.initial);
          };
          this.view = {
            x: update(this.trackerX, this.x - this.panMouseX),
            y: update(this.trackerY, this.y - this.panMouseY)
          };
        }
      }
      const snapshot = {
        frame: this.frames.length, time: now, mouseState: this.states.get(1),
        mouse: {x: this.x, y: this.y}, anchor: {x: this.panMouseX, y: this.panMouseY},
        panActive: this.panActive, before, view: {...this.view},
        target: this.panActive ? {x: this.x - this.panMouseX, y: this.y - this.panMouseY} : null
      };
      this.frames.push(snapshot);
      for (const [button, state] of this.states) {
        if (state === 'PRESSED') this.states.set(button, 'DOWN');
        else if (['RELEASED', 'DOUBLECLICK', 'PRESSRELEASE'].includes(state)) this.states.set(button, 'UP');
      }
      this.buttons = new Set([...this.states].filter(([, state]) => state !== 'UP').map(([button]) => button));
      return snapshot;
    }
  };
  return native;
}

function replaceOnce(source, from, to) {
  assert.ok(source.includes(from), 'Shared DOM harness structure changed: review the SDL oracle seam');
  assert.equal(source.indexOf(from), source.lastIndexOf(from));
  return source.replace(from, to);
}

// Reuse the existing DOM/timer plumbing while replacing its inaccurate boolean
// mouse oracle in memory. Historical v0.49 fixture and proof remain untouched.
let factory = domFixture.toString();
factory = replaceOnce(factory,
  "const native={x:0,y:0,buttons:new Set(),anchor:null,view:{x:0,y:0}};",
  'const native=createSdlOracle(options);');
factory = replaceOnce(factory,
  "native.x=e.clientX;native.y=e.clientY;if(e.type==='pointerdown'){native.buttons.add(e.button);if(e.button===1)native.anchor={x:e.clientX,y:e.clientY,view:{...native.view}};}if(e.type==='pointerup'){native.buttons.delete(e.button);if(e.button===1)native.anchor=null;}",
  'native.enqueue(e);');
const frameStart = factory.indexOf(' function frame(ms=16)');
const frameEnd = factory.indexOf(' async function frames(', frameStart);
assert.ok(frameStart >= 0 && frameEnd > frameStart);
factory = factory.slice(0, frameStart) + `
 function frame(ms=16){
  tick(ms);
  const render=()=>{if(rendering){const sample=native.consumeFrame(ms,now);samples.push(sample);gl.clear(gl.COLOR_BUFFER_BIT);nativeFrame++;}};
  if(options.nativeFirst)render();
  for(const[id,fn]of [...rafs]){if(!rafs.has(id))continue;rafs.delete(id);fn(now);}
  if(!options.nativeFirst)render();
 }
` + factory.slice(frameEnd);
const fixture = new Function('source', 'FILE', 'vm', 'createSdlOracle', 'return (' + factory + ')')(
  currentSource, FILE, vm, createSdlOracle);

function readRelease(version) {
  return cp.execFileSync('python', ['-c',
    'import zipfile,sys; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
    path.resolve(ROOT, '../warzone-towers-' + version + '-source.zip'), FILE],
  {encoding: 'utf8', maxBuffer: 1024 * 1024});
}

const checks = [];
async function check(name, run) { const detail = await run(); checks.push({name, passed: true, detail}); console.log('PASS: ' + name); }

async function audit() {
  await check('Native oracle retains RELEASED through mainLoop, then reaches UP; tracker eases and latches at DRAG', () => {
    const n = createSdlOracle();
    n.enqueue({type: 'pointerdown', clientX: 300, clientY: 220, button: 1, buttons: 4});
    n.consumeFrame(16, 16); assert.equal(n.panActive, false); assert.equal(n.states.get(1), 'DOWN');
    n.enqueue({type: 'pointermove', clientX: 400, clientY: 260, button: -1, buttons: 4});
    const drag = n.consumeFrame(16, 32); assert.equal(drag.mouseState, 'DRAG');
    assert.deepEqual(drag.anchor, {x: 300, y: 220}); assert.deepEqual(drag.view, {x: 16, y: 6});
    n.enqueue({type: 'pointerup', clientX: 410, clientY: 265, button: 1, buttons: 0});
    const released = n.consumeFrame(16, 48); assert.equal(released.mouseState, 'RELEASED'); assert.equal(released.panActive, true); assert.equal(n.states.get(1), 'UP');
    const up = n.consumeFrame(16, 64); assert.equal(up.panActive, false); assert.deepEqual(up.view, released.view);
    return {drag, released, up};
  });
  await check('Native oracle detects centre parking changing a live RELEASED-frame pan target', () => {
    const n = createSdlOracle();
    n.enqueue({type: 'pointerdown', clientX: 300, clientY: 220, button: 1, buttons: 4});
    n.enqueue({type: 'pointermove', clientX: 400, clientY: 260, button: -1, buttons: 4});
    n.consumeFrame(16, 16);
    n.enqueue({type: 'pointerup', clientX: 400, clientY: 260, button: 1, buttons: 0});
    n.enqueue({type: 'pointermove', clientX: 500, clientY: 300, button: -1, buttons: 0});
    const jump = n.consumeFrame(16, 32); assert.equal(jump.mouseState, 'RELEASED');
    assert.deepEqual(jump.target, {x: 200, y: 80}); assert.ok(jump.view.x > jump.before.x);
    return jump;
  });
  await check('Native oracle detects stale pan anchor when release and fresh press share a native poll cycle', () => {
    const n = createSdlOracle();
    n.enqueue({type: 'pointerdown', clientX: 300, clientY: 220, button: 1, buttons: 4});
    n.enqueue({type: 'pointermove', clientX: 400, clientY: 260, button: -1, buttons: 4}); n.consumeFrame(16, 16);
    n.enqueue({type: 'pointerup', clientX: 400, clientY: 260, button: 1, buttons: 0});
    n.enqueue({type: 'pointerdown', clientX: 600, clientY: 300, button: 1, buttons: 4});
    n.enqueue({type: 'pointermove', clientX: 640, clientY: 320, button: -1, buttons: 4});
    const stale = n.consumeFrame(16, 300); assert.equal(stale.mouseState, 'DRAG');
    assert.deepEqual(stale.anchor, {x: 300, y: 220}); assert.equal(n.panStarts, 1);
    return stale;
  });
  await check('Native oracle reproduces unmodified SDL MMB double-click preventing a rapid second drag', () => {
    const n = createSdlOracle();
    const e = (type, x) => n.enqueue({type, clientX: x, clientY: 220, button: type === 'pointermove' ? -1 : 1, buttons: type === 'pointerup' ? 0 : 4});
    e('pointerdown', 300); e('pointermove', 350); n.consumeFrame(16, 16);
    e('pointerup', 350); n.consumeFrame(16, 32); n.consumeFrame(16, 48);
    e('pointerdown', 400); e('pointermove', 450); const failed = n.consumeFrame(16, 64);
    assert.equal(failed.mouseState, 'DOUBLECLICK'); assert.equal(failed.panActive, false);
    e('pointermove', 480); n.consumeFrame(16, 80); assert.equal(n.panActive, false);
    return failed;
  });

  const baseline = readRelease('0.49');
  await check('Preserved v0.49 actual adapter reproduces release-centre jump under both native/adapter RAF orders', async () => {
    const observations = [];
    for (const nativeFirst of [false, true]) {
      const f = fixture(baseline, {nativeFirst});
      f.fire('pointerdown', 300, 220); f.fire('pointermove', 380, 250); await f.frames(4);
      f.fire('pointerup', 400, 260); await f.frames(6);
      const jump = f.native.frames.find(s => s.mouseState === 'RELEASED' && s.mouse.x === 500 && s.mouse.y === 300 && s.panActive);
      assert.ok(jump, 'The v0.49 release must expose the native centre target');
      assert.deepEqual(jump.anchor, {x: 300, y: 220}); assert.deepEqual(jump.target, {x: 200, y: 80});
      observations.push({nativeFirst, jump});
    }
    return {sourceSha256: sha(baseline), observations};
  });
  await check('Preserved v0.49 deferred first move adds an unpanned native frame when the native RAF runs first', async () => {
    const f = fixture(baseline, {nativeFirst: true});
    f.fire('pointerdown', 300, 220); f.fire('pointermove', 380, 250); await f.frames(1);
    assert.equal(f.native.frames[0].mouseState, 'PRESSED'); assert.equal(f.native.frames[0].panActive, false);
    await f.frames(1); assert.equal(f.native.frames[1].panActive, true);
    return f.native.frames.slice(0, 2);
  });
  await check('Preserved v0.49 actual adapter can restart before the old native pan has reached an inactive frame', async () => {
    const f = fixture(baseline);
    f.fire('pointerdown', 300, 220); f.fire('pointermove', 380, 250); await f.frames(4);
    f.fire('pointerup', 400, 260);
    f.fire('pointerdown', 600, 300); f.fire('pointermove', 640, 320); await f.frames(1);
    const stale = f.native.frames.at(-1);
    assert.equal(stale.panActive, true); assert.deepEqual(stale.anchor, {x: 300, y: 220});
    assert.deepEqual(stale.target, {x: 340, y: 100}); assert.equal(f.native.panStarts, 1);
    return stale;
  });
  await check('Preserved v0.48 active native pan already consumes pointer-up endpoint; the earlier boolean oracle was wrong', async () => {
    const old = readRelease('0.48');
    const f = fixture(old);
    f.fire('pointerdown', 300, 220); f.fire('pointermove', 340, 240); await f.frames(1);
    f.fire('pointermove', 360, 250); f.fire('pointerup', 375, 265); await f.frames(1);
    const released = f.native.frames.at(-1);
    assert.equal(released.mouseState, 'RELEASED'); assert.equal(released.panActive, true);
    assert.deepEqual(released.mouse, {x: 375, y: 265}); assert.deepEqual(released.target, {x: 75, y: 45});
    return {sourceSha256: sha(old), released};
  });
  return {mode: 'regression-audit', adapterFixed: false, checksPassed: checks.length, checks,
    limits: 'Focused native input/camera equations in JavaScript; no real SDL/native runtime, camera limits, radar overlap, game UI gating, or rendered visual verification.',
    sourceReferences: ['lib/sdl/main_sdl.cpp:1370 inputNewFrame', 'lib/sdl/main_sdl.cpp:1499 mouseDown',
      'lib/sdl/main_sdl.cpp:1734 inputHandleMouseButtonEvent', 'lib/sdl/main_sdl.cpp:1799 inputHandleMouseMotionEvent',
      'lib/sdl/main_sdl.cpp:3682 SDL_PollEvent/mainLoop/inputNewFrame', 'src/loop.cpp:334 processMouseClickInput/displayWorld',
      'src/display.cpp:738 pan tracker latch', 'src/display.cpp:1222 displayWorld pan', 'src/animation.cpp:67 ValueTracker::update'],
    baselineSourceSha256: sha(baseline), currentSourceSha256: sha(currentSource()), fixtureSha256: sha(fs.readFileSync(__filename)),
    emulatorUsed: false, actualNativeEngineExecuted: false};
}

async function verify() {
  const reproduction = await audit();
  reproduction.checks = [...reproduction.checks]; checks.length = 0;
  const nativeFile = 'archive/native-touch-0.50/main_sdl.cpp';
  const nativeProofFile = 'archive/native-touch-0.50/native-build.json';
  const nativeSource = fs.readFileSync(path.join(ROOT, nativeFile), 'utf8');
  const nativeProof = JSON.parse(fs.readFileSync(path.join(ROOT, nativeProofFile), 'utf8'));
  const normalized = {normalizeMiddleDoubleClick: true};
  const middleUps = f => f.events.filter(e => e.type === 'pointerup' && e.button === 1);
  const middleDowns = f => f.events.filter(e => e.type === 'pointerdown' && e.button === 1);
  const panMoves = f => f.events.filter(e => e.type === 'pointermove' && e.buttons === 4);
  const start = f => {f.fire('pointerdown', 300, 220); f.fire('pointermove', 380, 250);};
  await check('Corrected Towers MMB normalization assumption matches the built native source and guarded one-object proof', () => {
    assert.equal(nativeProof.passed, true); assert.equal(nativeProof.allOtherEngineObjectsUnchanged, true);
    assert.equal(nativeProof.sourceOverlays['lib/sdl/main_sdl.cpp'], sha(nativeSource));
    assert.match(nativeSource, /static bool towersTouchMiddleDrag\(\)[\s\S]*?#if defined\(__EMSCRIPTEN__\)[\s\S]*?\/tmp\/warzone-towers-ui-v34/);
    assert.match(nativeSource, /mouseKeyCode == MOUSE_MMB && towersTouchMiddleDrag\(\)/);
    assert.match(nativeSource, /if \(!towersPanPress && realTime - aMouseState\[mouseKeyCode\]\.lastdown < DOUBLE_CLICK_INTERVAL\)/);
    return {sourceSha256: sha(nativeSource), nativeBuildSha256: sha(fs.readFileSync(path.join(ROOT, nativeProofFile)))};
  });
  await check('First held motion reaches the first native frame and release stays at the true endpoint under either RAF order', async () => {
    for (const nativeFirst of [false, true]) {
      const f = fixture(undefined, {...normalized, nativeFirst}); start(f);
      assert.equal(panMoves(f).length, 1); await f.frames(4);
      assert.equal(f.native.frames[0].mouseState, 'DRAG'); assert.equal(f.native.frames[0].panActive, true);
      f.fire('pointerup', 400, 260); await f.frames(6);
      const release = f.native.frames.find(s => s.mouseState === 'RELEASED');
      assert.deepEqual(release.mouse, {x: 400, y: 260}); assert.deepEqual(release.target, {x: 100, y: 40});
      const later = f.native.frames.slice(release.frame + 1); assert.ok(later.every(s => !s.panActive));
      assert.ok(later.every(s => s.view.x === release.view.x && s.view.y === release.view.y));
      assert.equal(f.api.report().panPhase, 'idle'); assert.equal(middleUps(f).length, 1);
    }
  });
  await check('Subsequent high-rate samples coalesce once per RAF and preserve the latest absolute target without zoom or heading input', async () => {
    const f = fixture(undefined, normalized); start(f); await f.frames(1); f.events.length = 0;
    for (let i = 1; i <= 40; i++) f.fire('pointermove', 380 + i, 250 + i / 2, 1,
      {getCoalescedEvents: () => [{clientX: 379 + i, clientY: 250 + (i - 1) / 2}, {clientX: 380 + i, clientY: 250 + i / 2}]});
    f.tick(90); assert.equal(panMoves(f).length, 0); await f.frames(1, 1);
    assert.equal(panMoves(f).length, 1); assert.deepEqual({x: panMoves(f)[0].x, y: panMoves(f)[0].y}, {x: 420, y: 270});
    assert.ok(!f.events.some(e => e.type === 'wheel' || e.type.startsWith('key')));
    f.fire('pointerup', 425, 275); await f.frames(6); assert.equal(f.api.report().panPhase, 'idle');
  });
  await check('Rapid consecutive touch lifecycles wait for a genuine inactive native frame and acquire separate correct anchors', async () => {
    for (const nativeFirst of [false, true]) {
      const f = fixture(undefined, {...normalized, nativeFirst}); start(f); await f.frames(2);
      f.fire('pointerup', 400, 260); f.fire('pointerdown', 600, 300); f.fire('pointermove', 640, 320); f.fire('pointerup', 660, 330);
      assert.equal(middleDowns(f).length, 1); assert.equal(f.api.report().panQueuedPointers, 3);
      await f.frames(12); assert.equal(f.native.panStarts, 2); assert.equal(middleUps(f).length, 2);
      const second = f.native.frames.find(s => s.panActive && s.anchor.x === 600);
      assert.ok(second); assert.deepEqual(second.anchor, {x: 600, y: 300}); assert.deepEqual(second.target, {x: 60, y: 30});
      assert.ok(f.native.frames.slice(0, second.frame).some(s => !s.panActive && s.mouseState === 'UP'));
      assert.ok(!f.native.frames.some(s => s.mouseState === 'DOUBLECLICK')); assert.equal(f.api.report().panPhase, 'idle');
    }
  });
  await check('Quick flicks and repeat swipes remain correctly ordered at 5fps; no 150ms timer bypasses native frames', async () => {
    for (const nativeFirst of [false, true]) {
      const f = fixture(undefined, {...normalized, nativeFirst}); start(f); f.fire('pointerup', 400, 260);
      f.fire('pointerdown', 600, 300); f.fire('pointermove', 640, 320); f.fire('pointerup', 660, 330);
      f.tick(190); assert.equal(f.api.report().panPhase, 'held'); assert.equal(middleUps(f).length, 0); assert.equal(middleDowns(f).length, 1);
      await f.frames(10, 200); assert.equal(f.native.panStarts, 2); assert.equal(f.api.report().panPhase, 'idle');
      for (const x of [300, 600]) assert.ok(f.native.frames.some(s => s.mouseState === 'RELEASED' && s.anchor.x === x));
    }
  });
  await check('Renderer stalls release a held button on timeout but retain rearm; UI cancellation drops deferred input', async () => {
    const f = fixture(undefined, {...normalized, rendering: false}); start(f); f.fire('pointerup', 400, 260);
    f.fire('pointerdown', 600, 300); f.fire('pointermove', 640, 320); f.fire('pointerup', 660, 330);
    f.tick(1000); assert.equal(middleUps(f).length, 1); assert.equal(f.api.report().panPhase, 'rearm');
    f.tick(3000); assert.equal(middleDowns(f).length, 1); assert.equal(f.api.report().panPhase, 'rearm');
    f.api.releaseAll(true, false); assert.equal(f.api.report().panQueuedPointers, 0);
    f.rendering(true); await f.frames(5, 200); assert.equal(f.api.report().panPhase, 'idle'); assert.equal(middleDowns(f).length, 1);
    return {heldTimeouts: f.api.report().panHeldTimeouts};
  });
  await check('Cancel, blur, pagehide and leaving battle release immediately at the endpoint with no later ghost motion', async () => {
    for (const cancel of ['pointercancel', 'blur', 'pagehide', 'inactive']) {
      const f = fixture(undefined, normalized); start(f); await f.frames(2); f.fire('pointermove', 410, 270);
      if (cancel === 'pointercancel') f.fire(cancel, 410, 270);
      else if (cancel === 'inactive') f.api.setBattleActive(false); else f.win(cancel);
      assert.equal(middleUps(f).length, 1, cancel); const events = f.events.length;
      await f.frames(7); assert.equal(f.events.length, events, cancel); assert.equal(f.api.isGestureActive(), false);
      assert.equal(f.api.report().panQueuedPointers, 0); assert.equal(f.api.report().panPhase, 'idle');
    }
  });
  await check('One-finger pan handoff to two-finger pan or pinch resets its native anchor; multi-pan cancellation releases immediately', async () => {
    for (const nativeFirst of [false, true]) for (const pinch of [false, true]) {
      const f = fixture(undefined, {...normalized, nativeFirst}); f.fire('pointerdown', 300, 220); f.fire('pointermove', 340, 220); await f.frames(2);
      f.fire('pointerdown', 440, 220, 2); f.fire('pointermove', pinch ? 310 : 370, 220, 1); f.fire('pointermove', 470, 220, 2);
      f.fire('pointerup', pinch ? 310 : 370, 220, 1); f.fire('pointerup', 470, 220, 2); await f.frames(15);
      assert.equal(f.native.panStarts, pinch ? 1 : 2); assert.equal(f.api.report().pinchSteps > 0, pinch);
      assert.equal(f.api.report().panPhase, 'idle'); assert.equal(f.api.isGestureActive(), false);
      if (!pinch) assert.ok(f.native.frames.some(s => s.panActive && s.anchor.x === 390 && s.target.x === 30));
    }
    const g = fixture(undefined, normalized); g.fire('pointerdown', 300, 220, 1); g.fire('pointerdown', 440, 220, 2); g.fire('pointermove', 340, 220, 1); g.fire('pointermove', 480, 220, 2); await g.frames(2);
    g.fire('pointercancel', 340, 220, 1); assert.equal(middleUps(g).length, 1); const events = g.events.length; await g.frames(7); assert.equal(g.events.length, events); assert.equal(g.api.isGestureActive(), false);
  });
  await check('Offset canvas and captured out-of-bounds motion stay inside the safe native range', async () => {
    const bounds = {x: 40, y: 30, left: 40, top: 30, right: 960, bottom: 570, width: 920, height: 540};
    for (const point of [{x: -200, y: -100, target: {x: -252, y: -182}}, {x: 1300, y: 800, target: {x: 652, y: 342}}]) {
      const f = fixture(undefined, {...normalized, bounds}); f.fire('pointerdown', 300, 220); f.fire('pointermove', point.x, point.y); f.fire('pointerup', point.x, point.y); await f.frames(6);
      assert.ok(panMoves(f).every(e => e.x >= 48 && e.x <= 952 && e.y >= 38 && e.y <= 562));
      assert.ok(f.native.frames.some(s => s.panActive && s.target.x === point.target.x && s.target.y === point.target.y));
      assert.equal(f.api.report().panPhase, 'idle');
    }
  });
  await check('Missing GL context uses explicitly reported fallback cycles; context replacement clears an obsolete rearm', async () => {
    for (const noRaf of [false, true]) {
      const f = fixture(undefined, {...normalized, noContext: true, noRaf}); start(f); f.fire('pointerup', 400, 260);
      await f.frames(12); assert.equal(f.api.report().panPhase, 'idle'); assert.equal(f.api.report().panUnobservedRearms, 1); assert.equal(f.native.panStarts, 1);
    }
    const g = fixture(undefined, {...normalized, rendering: false}); start(g); g.fire('pointerup', 400, 260);
    g.window.LaunchedModule.ctx = {COLOR_BUFFER_BIT: 16384, FRAMEBUFFER_BINDING: 36006, getParameter: () => null, clear() {}};
    await g.frames(1); assert.equal(g.api.report().panPhase, 'idle'); assert.equal(g.api.report().panContextResets, 1); assert.equal(middleUps(g).length, 1);
  });
  await check('Deferred pan input coalesces movement, bounds total events and serializes a native click after rearm', async () => {
    const f = fixture(undefined, normalized); start(f); await f.frames(1); f.fire('pointerup', 400, 260);
    f.fire('pointerdown', 600, 300); for (let i = 0; i < 1000; i++) f.fire('pointermove', 600 + i / 100, 300);
    assert.ok(f.api.report().panQueuedPointers <= 3); f.fire('pointerup', 620, 300); await f.frames(12); assert.equal(f.native.panStarts, 2);
    const g = fixture(undefined, normalized); start(g); await g.frames(1); g.fire('pointerup', 400, 260); g.api.nativeClick(450, 280);
    assert.equal(g.events.filter(e => e.type === 'pointerdown' && e.button === 0).length, 0); await g.frames(15);
    assert.equal(g.events.filter(e => e.type === 'pointerdown' && e.button === 0).length, 1);
    const h = fixture(undefined, {...normalized, rendering: false}); start(h); h.fire('pointerup', 400, 260);
    for (let i = 0; i < 80; i++) {h.fire('pointerdown', 500, 300, 2); h.fire('pointerup', 500, 300, 2);}
    assert.ok(h.api.report().panQueuedPointers < 128); assert.ok(h.api.report().panQueueOverflows > 0);
  });
  await check('Tap, deliberate box selection, single-site/line construction, minimap and Duel keep their existing actions', async () => {
    const f = fixture(undefined, normalized); f.fire('pointerdown', 300, 220); f.fire('pointerup', 300, 220); await f.frames(15);
    assert.equal(f.events.filter(e => e.type === 'pointerdown' && e.button === 0).length, 1); assert.equal(middleDowns(f).length, 0);
    const box = fixture(undefined, normalized); box.fire('pointerdown', 300, 220); box.tick(280); box.fire('pointermove', 350, 255); box.fire('pointerup', 350, 255); await box.frames(5); assert.equal(box.api.report().boxSelections, 1); assert.equal(middleDowns(box).length, 0);
    const placement = fixture(undefined, {...normalized, placement: true}); placement.fire('pointerdown', 300, 220); placement.fire('pointerup', 300, 220); await placement.frames(3); assert.equal(placement.calls.filter(c => c[0] === 'place').length, 1);
    const line = fixture(undefined, {...normalized, placement: true, line: true}); line.fire('pointerdown', 300, 220); line.fire('pointermove', 450, 240); line.fire('pointerup', 450, 240); await line.frames(3); assert.equal(line.calls.filter(c => c[0] === 'line-end').length, 1); assert.equal(middleDowns(line).length, 0);
    const radar = fixture(undefined, normalized); radar.fire('pointerdown', 850, 460); radar.fire('pointermove', 890, 490); radar.fire('pointerup', 890, 490); await radar.frames(5); assert.equal(radar.api.report().radarDrags, 1); assert.equal(middleDowns(radar).length, 0);
    const duel = fixture(undefined, {duel: true}); start(duel); assert.equal(panMoves(duel).length, 1); duel.fire('pointerup', 400, 260); assert.equal(duel.api.report().panPhase, 'idle');
  });
  const result = {version: '0.50', passed: true, mode: 'corrected-source-with-native-state-oracle',
    regressionReproductions: reproduction, checksPassed: checks.length, checks: [...checks],
    limits: reproduction.limits, emulatorUsed: false, actualNativeEngineExecuted: false,
    gameplayVerified: false, screensVerified: false,
    sources: [FILE, 'tools/check-touch-pan-050.cjs', nativeFile, nativeProofFile].map(file => ({path: file, sha256: sha(fs.readFileSync(path.join(ROOT, file)))})),
    recordedUTC: new Date().toISOString()};
  fs.writeFileSync(path.join(ROOT, 'archive/touch-pan-0.50-checks.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (require.main === module) (process.argv.includes('--verify') ? verify() : audit())
  .then(result => console.log(JSON.stringify({mode: result.mode, passed: result.passed, adapterFixed: result.adapterFixed,
    checksPassed: result.checksPassed, sources: result.sources, fixtureSha256: result.fixtureSha256})))
  .catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {fixture, createSdlOracle, readRelease, audit, verify};
