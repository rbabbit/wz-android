"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
let humanPower = 0, enemies = [], nextId = 1, command = {};
const timers = [], queued = [], logs = [];
const context = vm.createContext({
  namespace() {}, gameTime: 0, ENEMY: 1, maxPlayers: 2,
  DROID_ANY: 0, DROID_WEAPON: 1, DROID_CYBORG: 2, DROID_PERSON: 3, DEFENSE: 4, BUILT: 1,
  ENTRANCES: Array.from({length: 6}, (_, i) => [i, 1]),
  research_offset: 384,
  LATEST_RESEARCH: {minimumResearchTime: 360, gameTime: 0}, derrickPositions: [1, 2, 3],
  getMultiTechLevel: () => 1, syncRandom: max => (nextId * 7 + 3) % Math.max(1, max),
  queue: (name, delay) => queued.push({name, delay}),
  setTimer: (name, delay) => timers.push({name, delay}),
  enumDroid: player => player === 1 ? enemies.slice() : [],
  enumStruct: player => player === 0 ? [{status: 1, canHitGround: true, cost: humanPower}] : [],
  addDroid(player, x, y, name, body, propulsion, unused, unused2, ...turrets) {
    const d = {id: nextId++, cost: 30, body, propulsion, turrets}; enemies.push(d); return d;
  },
  includeJSON: () => command, dump: line => logs.push(line)
});
const root = path.join(__dirname, "..");
vm.runInContext(fs.readFileSync(path.join(root, "vendor/survival/mod/SurvivalMod/TEMPLATES.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "vendor/survival/mod/SurvivalMod/spawn.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "scenario/warzone-towers-waves.js"), "utf8"), context);
context.spawn_eventStartLevel();
assert.equal(timers.length, 0, "continuous Survival timer must be replaced");
context.warzoneTowersWaves_eventStartLevel();
assert.equal(queued[0].name, "warzoneTowersWaves_start");
context.warzoneTowersWaves_start();
assert.equal(timers[0].delay, 1000);
context.warzoneTowersWaves_tick();
assert.equal(context.warzoneTowersWaves_phase, "countdown");
humanPower = 500;
context.gameTime = 1000;
context.warzoneTowersWaves_tick();
assert.equal(context.warzoneTowersWaves_deadline, 240000);
context.gameTime = 240000;
context.warzoneTowersWaves_tick();
for (let wave = 1; wave <= 8; wave++) {
  assert.equal(context.warzoneTowersWaves_wave, wave);
  for (let i = 0; i < 3; i++) { context.gameTime += 1000; context.warzoneTowersWaves_tick(); }
  assert.equal(context.warzoneTowersWaves_pulsesRemaining, 0);
  assert.ok(enemies.length > 0, `wave ${wave} must spawn mod templates`);
  const carried = enemies.map(d => d.id);
  command = {nonce: `skip-${wave}`, action: "next"};
  context.gameTime += 1000;
  context.warzoneTowersWaves_tick();
  assert.equal(context.warzoneTowersWaves_wave, wave + 1);
  assert.ok(carried.every(id => enemies.some(d => d.id === id)), "skip must preserve every survivor");
  assert.ok(enemies.length > carried.length, "survivors must not consume next wave spawn budget");
  context.warzoneTowersWaves_pollCommand();
  assert.equal(context.warzoneTowersWaves_wave, wave + 1, "duplicate command must not advance twice");
}
for (let i = 0; i < 3; i++) { context.gameTime += 1000; context.warzoneTowersWaves_tick(); }
assert.ok(new Set(enemies.map(d => d.body)).size >= 4, "the supplied roster must produce varied bodies");
assert.ok(new Set(enemies.map(d => d.turrets.join())).size >= 4, "waves must advance beyond the initial scavenger weapons");
assert.ok(context.warzoneTowersWaves_frontierTime >= 864, "wave 9 must advance the supplied minute-indexed roster");
enemies = [];
context.gameTime += 1000;
context.warzoneTowersWaves_tick();
assert.equal(context.warzoneTowersWaves_phase, "countdown");
assert.equal(context.warzoneTowersWaves_deadline, context.gameTime + 20000);
assert.ok(logs.some(s => s.includes('"wave":7')));
// A completely unarmed player still receives real supplied mod units after
// four minutes. Assert that our temporary power floor never escapes the pulse.
humanPower=0;enemies=[];command={};context.spawn_powerTeamBest=0;context.gameTime=0;
context.warzoneTowersWaves_wave=0;context.warzoneTowersWaves_phase="build";
context.warzoneTowersWaves_start();
context.gameTime=239999;context.warzoneTowersWaves_tick();
assert.equal(enemies.length,0);assert.equal(context.warzoneTowersWaves_wave,0);
context.gameTime=240000;context.warzoneTowersWaves_tick();
assert.equal(context.warzoneTowersWaves_wave,1);assert.ok(enemies.length>0);
for(let i=0;i<3;i++){context.gameTime+=1000;context.warzoneTowersWaves_tick()}
assert.equal(context.warzoneTowersWaves_pulsesRemaining,0);
assert.equal(context.spawn_getPowerTeam(),0,"real player power must remain unchanged");
const carried=enemies.map(d=>d.id);command={nonce:"unarmed-skip",action:"next"};context.warzoneTowersWaves_tick();
assert.equal(context.warzoneTowersWaves_wave,2);assert.ok(carried.every(id=>enemies.some(d=>d.id===id)));assert.ok(enemies.length>carried.length);
console.log("PASS: Survival spawn calculations through wave 9; early next wave preserves enemies, spawns new units, deduplicates, and clears normally");
console.log("PASS: four-minute automatic wave spawns supplied units with no defences/units, and unarmed Skip Wave retains survivors");
