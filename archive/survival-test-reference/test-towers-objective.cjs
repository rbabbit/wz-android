"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
let hqs = [{id: 1}], ended = 0, emitted = 0;
const removed = [];
const c = vm.createContext({
  namespace() {}, selectedPlayer: 0, HQ: 10,
  enumStruct: () => hqs, setTimer() {}, removeTimer: name => removed.push(name),
  warzoneTowersWaves_phase: "active", warzoneTowersWaves_deadline: 10000,
  warzoneTowersWaves_pulsesRemaining: 3,
  warzoneTowersWaves_emit: () => emitted++,
  gameOverMessage: win => { assert.equal(win, false); ended++; }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../scenario/warzone-towers-objective.js"), "utf8"), c);
c.warzoneTowersObjective_eventStartLevel();
c.warzoneTowersObjective_eventDestroyed({player: 0, stattype: 11});
assert.equal(ended, 0, "ordinary tower loss must not end the game");
hqs = [];
c.warzoneTowersObjective_eventDestroyed({player: 1, stattype: 10});
assert.equal(ended, 0, "enemy HQ loss must not fail the player");
c.warzoneTowersObjective_eventDestroyed({player: 0, stattype: 10});
assert.equal(ended, 1);
assert.equal(emitted, 1);
assert.equal(c.warzoneTowersWaves_phase, "defeated");
assert.equal(c.warzoneTowersWaves_pulsesRemaining, 0);
assert.ok(removed.includes("warzoneTowersWaves_tick"));
c.warzoneTowersObjective_tick();
assert.equal(ended, 1, "defeat must fire exactly once");
console.log("PASS: command centre destruction immediately ends the run once and cancels wave spawning");
