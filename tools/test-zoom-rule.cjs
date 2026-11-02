"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let command = { version: 31, nonce: "a", preset: "close", distance: 1600 };
const zooms = [];
const messages = [];
const timers = [];

const context = {
  include: () => true,
  includeJSON: fileName => {
    assert.equal(fileName, "blocknight-zoom-command.json");
    return { ...command };
  },
  setTimer: (functionName, milliseconds) => timers.push({ functionName, milliseconds }),
  cameraZoom: (distance, speed) => zooms.push({ distance, speed }),
  dump: message => messages.push(String(message)),
  eventChat: () => {},
  eventResearched: () => {},
  gameTime: 1234,
  selectedPlayer: 0,
  RESEARCH_LAB: 1,
  BUILT: 1,
  STRUCTURE: 1
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, "..", "scenario",
  "blocknight-queue-rules.js"), "utf8");
vm.runInContext(source, context, { filename: "blocknight-queue-rules.js" });

assert.deepEqual(timers, [{ functionName: "blockNightV32PollBridgeCommands", milliseconds: 120 }]);

context.blockNightV31PollZoomCommand();
assert.deepEqual(zooms, [{ distance: 1600, speed: 0 }]);
assert.match(messages.at(-1), /BNZOOM:/);

context.blockNightV31PollZoomCommand();
assert.equal(zooms.length, 1, "a consumed nonce must never run twice");

command = { version: 31, nonce: "b", preset: "battle", distance: 9999 };
context.blockNightV31PollZoomCommand();
assert.deepEqual(zooms.at(-1), { distance: 2600, speed: 0 },
  "the rule must use its calibrated distance, not untrusted file input");

command = { version: 31, nonce: "c", preset: "map", distance: 3600 };
context.blockNightV31PollZoomCommand();
assert.deepEqual(zooms.at(-1), { distance: 3600, speed: 0 });

const zoomCount = zooms.length;
command = { version: 31, nonce: "d", preset: "manual", distance: 0 };
context.blockNightV31PollZoomCommand();
assert.equal(zooms.length, zoomCount, "pinch cancellation must not move the camera");
assert.equal(JSON.parse(messages.at(-1).slice("BNZOOM:".length)).distance, 0);

console.log("PASS: custom rule applies exact 1600/2600/3600 camera distances and honors cancellation");
