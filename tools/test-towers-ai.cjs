"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const hq = {id: 100, stattype: 10, x: 100, y: 50, health: 100};
const blocker = {id: 101, stattype: 11, x: 15, y: 50, health: 100};
const d = {id: 1, x: 10, y: 50, order: 0, action: 0, droidType: 1};
let targets = [blocker, hq], units = [d], calls = [];
const c = vm.createContext({
  me: 1, maxPlayers: 3, gameTime: 0, DROID_ANY: 0, DROID_SENSOR: 2,
  DORDER_ATTACK: 3, DORDER_OBSERVE: 4, DORDER_MOVE: 5, HQ: 10,
  orderDroidLoc(droid, order, x, y) { calls.push({order, x, y}); droid.order = order; },
  setTimer() {}, allianceExistsBetween: (_, player) => player === 2,
  enumStruct: player => player === 0 ? targets : [{id: 999, stattype: 10, x: 5, y: 5}],
  enumDroid: () => units, droidCanReach: (_, x) => x < 200,
  orderDroidObj(droid, order, target) { calls.push({order, target: target.id}); droid.order = order; return true; }, dump() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../scenario/warzone-towers-ai.js"), "utf8"), c);
c.towersAi_tick();
assert.equal(calls.at(-1).target, hq.id, "HQ takes priority over a nearby random building");
d.x = 12; c.gameTime = 1000; c.towersAi_tick();
assert.equal(calls.length, 1, "advancing units must not have their path reset each tick");
c.gameTime = 10000; c.towersAi_tick();
assert.equal(calls.at(-1).target, blocker.id, "stuck unit attacks a nearby road blocker");
const firingCount = calls.length;
d.action = 6; c.gameTime = 11000; c.towersAi_tick();
assert.equal(calls.length, firingCount, "stationary firing must be allowed to finish");
targets = [hq]; d.action = 0; c.gameTime = 12000; c.towersAi_tick();
assert.equal(calls.at(-1).target, hq.id, "after blocker removal, resume the HQ attack");
d.order = 5; d.action = 1; c.gameTime = 22000; c.towersAi_tick();
assert.equal(calls.at(-1).order, 3, "abandoned scout/move must be replaced with HQ attack");
d.isVTOL = true; d.weapons = [{armed: 0}]; d.order = 0;
c.gameTime += 1000; c.towersAi_tick();
assert.deepEqual(calls.at(-1), {order: 5, x: 1, y: 1}, "empty aircraft must use the supplied mod's despawn lane");
units = []; c.gameTime += 1000; c.towersAi_tick();
assert.equal(Object.keys(c.towersAi_units).length, 0, "destroyed units must not leak tracking state");
console.log("PASS: HQ priority, stable moving/firing orders, stalled-unit recovery, blocker removal, ally exclusion, tracking cleanup");
