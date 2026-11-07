"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const source = fs.readFileSync(path.join(__dirname, "../scenario/warzone-towers-bridge.js"), "utf8");
const begin = source.indexOf("function blockNightV31PollZoomCommand()");
const end = source.indexOf("function blockNightV32PollQueueCommand()", begin);
let command = {nonce: "base1", preset: "base"};
const centres = [], zooms = [];
const c = vm.createContext({
  includeJSON: () => command, blockNightV31LastZoomNonce: "", gameTime: 1000,
  blockNightV31ZoomDistances: {close: 1600, battle: 2600, map: 3600},
  selectedPlayer: 0, HQ: 10, enumStruct: () => [{x: 14, y: 54}],
  centreView: (x, y) => centres.push([x, y]), cameraZoom: (d, s) => zooms.push([d, s]), dump() {}
});
vm.runInContext(source.slice(begin, end), c);
c.blockNightV31PollZoomCommand();
assert.deepEqual(centres, [[14, 54]]);
assert.equal(zooms.length, 0, "BASE must not change zoom");
c.blockNightV31PollZoomCommand();
assert.equal(centres.length, 1, "duplicate BASE must not recenter twice");
command = {nonce: "map1", preset: "map"};
c.blockNightV31PollZoomCommand();
assert.deepEqual(zooms, [[3600, 0]]);
command = {nonce: "dustfall-start1", preset: "dustfall-start"};
c.blockNightV31PollZoomCommand();
assert.deepEqual(centres.at(-1), [14, 52], "Dustfall starts looking into the field with the HQ below centre");
assert.equal(zooms.length, 1, "Dustfall starting position must not change zoom");
console.log("PASS: BASE uses the position-only engine API; zoom remains independent and commands deduplicate");

const touch = fs.readFileSync(path.join(__dirname, "../app/src/main/assets/warzone-touch-controls.js"), "utf8");
const face = touch.slice(touch.indexOf("  function faceOpponent("), touch.indexOf("  let combatSerial="));
const events = [], frames = [], positions = [];
const view = vm.createContext({
  state: {nativeFrames:0,battleActive:true}, canvas: () => ({}), releaseAll() {}, showCombatHud() {}, observeNativeFrames() {},
  performance:{now:()=>0},
  requestAnimationFrame: fn => frames.push(() => {view.state.nativeFrames++;fn();}),
  dispatchKey: (...args) => events.push(args),
  writeZoomCommand: preset => { positions.push(preset); return "camera1"; }
});
vm.runInContext(face, view);
for (const [map, direction] of [["td1", "ArrowUp"], ["td2", "ArrowDown"]]) {
  events.length = 0; positions.length = 0;
  view.faceOpponent(map);
  while (frames.length) frames.shift()();
  assert.deepEqual(events.map(e => [e[1], e[3]]), [
    ["ControlLeft", true], [direction, true], [direction, false], ["ControlLeft", false]
  ], "absolute engine heading has matching key releases for " + map);
  assert.deepEqual(positions, map === "td1" ? ["dustfall-start"] : []);
}
console.log("PASS: Dustfall faces north; Iron Valley retains south; all native heading keys release");
