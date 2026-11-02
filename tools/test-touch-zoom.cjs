"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = new Map();
const documentListeners = new Map();

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
    return Boolean(force);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.hidden = false;
  }

  set id(value) {
    this._id = value;
    if (value) elements.set(value, this);
  }

  get id() {
    return this._id;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 };
  }

  dispatchEvent(event) {
    this.events.push(event);
    return true;
  }

  focus() {}
  remove() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
}

class FakeInputEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
  preventDefault() {}
  stopImmediatePropagation() {}
}

const canvas = new FakeElement("canvas");
canvas.id = "canvas";
canvas.events = [];

const body = new FakeElement("body");
const head = new FakeElement("head");
const documentElement = new FakeElement("html");

globalThis.window = globalThis;
globalThis.innerWidth = 1000;
globalThis.innerHeight = 600;
globalThis.devicePixelRatio = 2;
globalThis.addEventListener = () => {};
globalThis.KeyboardEvent = FakeInputEvent;
globalThis.PointerEvent = FakeInputEvent;
globalThis.WheelEvent = FakeInputEvent;
globalThis.CustomEvent = FakeInputEvent;
const virtualFiles = new Map();
globalThis.LaunchedModule = {
  FS: {
    writeFile: (filePath, contents) => virtualFiles.set(filePath, String(contents)),
    rename: (sourcePath, destinationPath) => {
      assert.ok(virtualFiles.has(sourcePath), `missing temporary file ${sourcePath}`);
      virtualFiles.set(destinationPath, virtualFiles.get(sourcePath));
      virtualFiles.delete(sourcePath);
    }
  }
};
globalThis.document = {
  body,
  head,
  documentElement,
  createElement: tagName => {
    const element = new FakeElement(tagName);
    element.events = [];
    return element;
  },
  getElementById: id => elements.get(id) || null,
  addEventListener: (type, listener) => documentListeners.set(type, listener)
};
Object.defineProperty(globalThis, "navigator", {
  value: { vibrate: () => true },
  configurable: true
});

const source = fs.readFileSync(path.join(__dirname,
    "..", "app", "src", "main", "assets", "warzone-touch-controls.js"), "utf8");
vm.runInThisContext(source, { filename: "warzone-touch-controls.js" });

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function run() {
  const controls = window.__kalaWarzoneTouch;
  assert.equal(controls.version, 34);
  assert.equal(controls.showCombatHud(), true);
  assert.ok(elements.has("blocknight-zoom-control"), "compact zoom group should exist");
  for (const id of ["blocknight-zoom-close", "blocknight-zoom-battle",
    "blocknight-zoom-map"]) {
    assert.ok(elements.has(id), `${id} should exist`);
  }

  canvas.events.length = 0;
  assert.equal(controls.toggleQueueMode(true), true);
  let queueReport = controls.report();
  assert.equal(queueReport.queueModifierHeld, false);
  assert.equal(queueReport.stickyBuildActivations, 1);
  assert.equal(canvas.events.filter(event => event.type === "keydown"
      && event.code === "ControlLeft").length, 0,
      "enabling +Q must not modify the first defence selection");
  controls.queuedClick(420, 260);
  controls.selectAllUnits();
  await sleep(85);
  assert.ok(canvas.events.some(event => event.type === "pointerdown" && event.ctrlKey === true),
      "every sticky build placement must carry the native Ctrl modifier");
  assert.equal(canvas.events.filter(event => event.type === "keyup"
      && event.code === "ControlLeft").length, 0,
      "sticky +Q must not release Ctrl between placements");
  assert.equal(controls.toggleQueueMode(false), false);
  queueReport = controls.report();
  assert.equal(queueReport.queueModifierHeld, false);
  assert.equal(canvas.events.filter(event => event.type === "keyup"
      && event.code === "ControlLeft").length, 1,
      "turning +Q off should release native Ctrl exactly once");

  controls.toggleQueueMode(true);
  controls.toggleCombatLock(true);
  await sleep(80);
  canvas.events.length = 0;
  controls.nativeUiClick(60, 260);
  assert.equal(canvas.events.find(event => event.type === "pointerdown").ctrlKey, false,
      "builder selection must be an unmodified click or its build list stays closed");
  assert.equal(controls.report().combatLock, false, "native menus must release combat selection");
  await sleep(55);
  assert.equal(controls.report().queueModifierHeld, false, "Ctrl must remain released throughout menu navigation");
  assert.equal(controls.report().queueMode, true, "logical sticky mode must stay enabled");
  canvas.events.length = 0;
  controls.queuedClick(500, 250);
  assert.equal(controls.report().queueModifierHeld, true, "next world placement must restore native Ctrl");
  assert.equal(canvas.events.find(event => event.type === "pointerdown").ctrlKey, true);
  await sleep(40);
  controls.toggleQueueMode(false);
  canvas.events.length = 0;
  controls.tapFrontend(170, 392);
  assert.equal(canvas.events.find(event => event.type === "pointerdown").clientX, 350);
  assert.equal(canvas.events.find(event => event.type === "pointerdown").clientY, 452);
  await sleep(55);
  const defaultBounds = canvas.getBoundingClientRect;
  for (const [width, height] of [[1076, 482], [800, 500], [1280, 800]]) {
    canvas.getBoundingClientRect = () => ({left: 0, top: 0, right: width, bottom: height, width, height});
    canvas.events.length = 0;
    controls.tapFrontend(585, 70, true);
    const readyTap = canvas.events.find(event => event.type === "pointerdown");
    assert.equal(readyTap.clientX, (width - 640) / 2 + 585);
    assert.equal(readyTap.clientY, (height - Math.max(480, Math.min(640, height - 80))) / 2 + 70);
    await sleep(40);
  }
  canvas.getBoundingClientRect = defaultBounds;

  canvas.events.length = 0;
  assert.equal(controls.applyZoomPreset("close"), true);
  let report = controls.report();
  assert.equal(report.zoomPreset, "close");
  assert.equal(report.zoomPresetSelections, 1);
  assert.equal(report.zoomCommandWrites, 1);
  assert.equal(report.lastZoomDistance, 1600);
  assert.equal(canvas.events.filter(event => event.type === "wheel").length, 0,
      "presets must not synthesize wheel events");
  assert.equal(canvas.events.filter(event => event.type.startsWith("key")).length, 0,
      "presets must not synthesize keyboard events");
  let command = JSON.parse(virtualFiles.get("/data/mp/tests/blocknight-zoom-command.json"));
  assert.equal(command.preset, "close");
  assert.equal(command.distance, 1600);

  controls.zoom(1, 500, 300);
  assert.equal(controls.report().zoomPreset, null,
      "manual/pinch zoom should clear the selected preset");
  command = JSON.parse(virtualFiles.get("/data/mp/tests/blocknight-zoom-command.json"));
  assert.equal(command.preset, "manual",
      "manual zoom should cancel any command the engine has not consumed yet");

  canvas.events.length = 0;
  controls.applyZoomPreset("close");
  controls.applyZoomPreset("map");
  report = controls.report();
  assert.equal(report.zoomPreset, "map", "last rapid preset should win");
  command = JSON.parse(virtualFiles.get("/data/mp/tests/blocknight-zoom-command.json"));
  assert.equal(command.preset, "map");
  assert.equal(command.distance, 3600);
  assert.equal(canvas.events.filter(event => event.type === "wheel").length, 0);

  canvas.events.length = 0;
  controls.applyZoomPreset("battle");
  assert.equal(controls.report().zoomPreset, "battle");
  assert.equal(controls.report().lastZoomDistance, 2600);
  assert.equal(canvas.events.filter(event => event.type === "wheel").length, 0);

  canvas.events.length = 0;
  controls.toggleQueueMode(true);
  controls.jumpToBase();
  await sleep(130);
  assert.equal(controls.report().queueMode, true, "BASE must preserve sticky building");
  assert.equal(controls.report().queueModifierHeld, false,
      "BASE must preserve armed +Q without holding Ctrl over a menu");
  assert.ok(!canvas.events.some(event => event.code === "KeyB" || event.code === "ArrowDown"),
      "BASE must never issue the native camera-turning shortcut");
  assert.equal(JSON.parse(virtualFiles.get("/data/mp/tests/blocknight-zoom-command.json")).preset, "base");
  controls.toggleQueueMode(false);
  controls.toggleQueueMode(true);
  controls.releaseAll();
  assert.equal(controls.report().queueMode, false,
      "focus loss must clear armed +Q even before the first placement");

  const fire = (type,id,x,y) => documentListeners.get(type)(new FakeInputEvent(type,{
    target:canvas,pointerType:"touch",pointerId:id,clientX:x,clientY:y
  }));
  canvas.events.length=0;
  fire("pointerdown",31,430,260);fire("pointerdown",32,550,260);
  for(let i=1;i<=12;i++){fire("pointermove",31,430,260-i*4);fire("pointermove",32,550,260-i*4)}
  assert.ok(canvas.events.some(e=>e.type==="keydown"&&e.code==="Numpad2"&&e.location===3),"parallel vertical gesture must use native pitch, not camera translation/yaw");
  assert.ok(controls.report().tiltMoves>0);
  fire("pointercancel",31,430,212);fire("pointercancel",32,550,212);
  assert.equal(controls.report().tiltHeld,null);assert.equal(controls.report().gestureActive,false);
  assert.ok(canvas.events.some(e=>e.type==="keyup"&&e.code==="Numpad2"));
  const pansBefore=controls.report().pans;
  fire("pointerdown",33,900,270);fire("pointermove",33,900,305);fire("pointerup",33,900,305);
  assert.equal(controls.report().pans,pansBefore+1,"world above square radar must pan instead of being mistaken for minimap");
  const radarBefore=controls.report().radarTaps;
  fire("pointerdown",34,900,480);fire("pointerup",34,900,480);
  assert.equal(controls.report().radarTaps,radarBefore+1,"actual square radar must retain native interaction");
  controls.releaseAll();
  controls.toggleQueueMode(true);
  controls.queuedClick(500, 250);
  canvas.events.length = 0;
  controls.stopSelected();
  assert.equal(controls.report().queueMode, false, "STOP must leave sticky construction");
  assert.equal(canvas.events[0].type, "keyup", "STOP releases Ctrl before sending native S");
  await sleep(80);
  const frames = new Map();
  let frameId = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const nextFrame = () => { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); };
  canvas.events.length = 0;
  controls.nativeClick(500, 250);
  assert.equal(canvas.events.filter(e => e.type === "pointerup").length, 0);
  nextFrame();
  assert.equal(canvas.events.filter(e => e.type === "pointerup").length, 0,
      "at least one complete engine frame must see the held mouse button");
  nextFrame();
  assert.equal(canvas.events.filter(e => e.type === "pointerup").length, 1);
  controls.faceOpponent();
  assert.equal(controls.report().cameraFacingPending,true,"startup overlays must know when the native camera chord is still held");
  while(frames.size)nextFrame();
  assert.equal(controls.report().cameraFacingPending,false,"orientation must finish before the preparation dialog takes focus");
  console.log("PASS: sticky building across menus and BASE, tablet lobby coordinates, absolute zoom, rapid switching, and pinch cancellation");
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
