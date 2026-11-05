"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let humanPower = 0;
let enemyCount = 0;
const installedTimers = [];
const queued = [];
const logs = [];

const context = vm.createContext({
  namespace() {},
  includeJSON() { return {}; },
  LATEST_RESEARCH: {minimumResearchTime: null, gameTime: null},
  research_offset: 384,
  gameTime: 0,
  ENEMY: 1,
  DROID_ANY: 0,
  spawn_MIN_COST: 30,
  ENTRANCES: Array.from({ length: 6 }, (_, index) => [index, 1]),
  TEMPLATES: Array.from({ length: 181 }, () => ({})),
  queue(name, delay) { queued.push({ name, delay }); },
  setTimer(name, delay) { installedTimers.push({ name, delay }); },
  spawn_getPowerTeam() { return humanPower; },
  spawn_getPowerEnemy() { return enemyCount * 30; },
  spawn_tick() { if (context.spawn_getPowerTeam() > 0 && enemyCount < 4) enemyCount += 1; },
  enumDroid() { return Array.from({ length: enemyCount }, () => ({})); },
  dump(line) { logs.push(line); },
  console
});

const source = fs.readFileSync(
  require('node:path').join(__dirname, '../scenario/warzone-towers-waves.js'),
  "utf8"
);
vm.runInContext(
  'function spawn_eventStartLevel() { setTimer("spawn_tick", 5000); }',
  context,
  { filename: "supplied-spawn-start.js" }
);
vm.runInContext(source, context, { filename: "warzone-towers-waves.js" });

context.spawn_eventStartLevel();
assert.ok(!installedTimers.some(timer => timer.name === "spawn_tick"));

context.warzoneTowersWaves_eventStartLevel();
assert.deepStrictEqual(queued, [{ name: "warzoneTowersWaves_start", delay: 200 }]);
context.warzoneTowersWaves_start();
assert.ok(installedTimers.some(timer => timer.name === "warzoneTowersWaves_tick" && timer.delay === 1000));

context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_phase, "countdown");
assert.strictEqual(context.warzoneTowersWaves_deadline, 240000);

humanPower = 120;
context.gameTime = 1000;
context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_phase, "countdown");
assert.strictEqual(context.warzoneTowersWaves_deadline, 240000, "construction must not shorten or restart preparation");

context.gameTime = 239999;
context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_wave, 0);
humanPower = 0;
context.gameTime = 240000;
context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_phase, "active");
assert.strictEqual(context.warzoneTowersWaves_wave, 1);
assert.strictEqual(context.warzoneTowersWaves_pulsesRemaining, 3);
assert.strictEqual(enemyCount, 1);

for (const time of [241000, 242000, 243000]) {
  context.gameTime = time;
  context.warzoneTowersWaves_tick();
}
assert.strictEqual(context.warzoneTowersWaves_pulsesRemaining, 0);
assert.strictEqual(enemyCount, 4);

context.gameTime = 244000;
context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_phase, "active");

enemyCount = 0;
context.gameTime = 245000;
context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_phase, "countdown");
assert.strictEqual(context.warzoneTowersWaves_deadline, 265000);

context.gameTime = 265000;
context.warzoneTowersWaves_tick();
assert.strictEqual(context.warzoneTowersWaves_phase, "active");
assert.strictEqual(context.warzoneTowersWaves_wave, 2);
assert.strictEqual(enemyCount, 1);
assert.ok(logs.some(line => line.includes('"mode":"numbered-waves"')));

console.log("PASS: four-minute preparation survives construction changes, starts unarmed, and preserves wave clearance/intermission");
