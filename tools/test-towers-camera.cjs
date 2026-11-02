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
console.log("PASS: BASE uses the position-only engine API; zoom remains independent and commands deduplicate");
