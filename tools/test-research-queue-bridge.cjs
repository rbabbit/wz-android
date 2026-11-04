"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const labs = Array.from({ length: 5 }, (_, index) => ({
  id: 100 + index, player: 0, stattype: 7, status: 1, idle: true
}));
const topics = Array.from({ length: 10 }, (_, index) => ({
  id: `R-Test-${String(index).padStart(2, "0")}`, done: false, started: false
}));
let queueCommand = {
  version: 32,
  nonce: "five-labs",
  labs: labs.map((lab, index) => ({
    labId: lab.id,
    topicIds: index === 0 ? [topics[0].id, topics[1].id] : [topics[index + 1].id]
  }))
};
const zoomCommand = { version: 31, nonce: "", preset: "battle", distance: 2600 };
const messages = [];
const starts = [];
const timers = [];

const context = {
  include: () => true,
  includeJSON: fileName => {
    if (fileName === "blocknight-queue-command.json") return JSON.parse(JSON.stringify(queueCommand));
    if (fileName === "blocknight-zoom-command.json") return { ...zoomCommand };
    throw new Error(`Unexpected includeJSON file: ${fileName}`);
  },
  setTimer: (functionName, milliseconds) => timers.push({ functionName, milliseconds }),
  cameraZoom: () => {},
  dump: message => messages.push(String(message)),
  eventChat: () => {},
  eventResearched: () => {},
  enumResearch: () => topics.map(topic => ({ ...topic })),
  enumStruct: () => labs,
  getObject: (_type, _player, id) => labs.find(lab => lab.id === Number(id)) || null,
  getResearch: id => topics.find(topic => topic.id === id) || null,
  structureIdle: () => true,
  pursueResearch: (lab, topicId) => {
    starts.push({ labId: lab.id, topicId });
    return true;
  },
  queue: () => {},
  blockNightLabTopics: {},
  gameTime: 2468,
  selectedPlayer: 0,
  playerPower: () => 1000,
  queuedPower: () => 0,
  Stats: {Building:{'Research Facility':{Id:'A0ResearchFacility'}}},
  Upgrades: [{Building:{'Research Facility':{ResearchPoints:10,ModuleResearchPoints:5}}}],
  RESEARCH_LAB: 7,
  BUILT: 1,
  STRUCTURE: 3
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, "..", "scenario",
  "warzone-towers-bridge.js"), "utf8");
vm.runInContext(source, context, { filename: "warzone-towers-bridge.js" });

assert.ok(timers.some(timer => timer.functionName === 'blockNightV32PollBridgeCommands' && timer.milliseconds === 120));

context.blockNightV32PollQueueCommand();
assert.equal(starts.length, 5, "all five idle labs should start from one atomic command");
assert.deepEqual(starts.map(start => start.labId), labs.map(lab => lab.id));
const firstAck = JSON.parse(messages.at(-1).slice("BNQUEUE:".length));
assert.equal(firstAck.ok, true);
assert.equal(firstAck.nonce, "five-labs");
assert.equal(firstAck.started.length, 5);
assert.equal(context.warzoneTowersLabResearch[String(labs[0].id)].topicId,topics[0].id);
assert.deepEqual(firstAck.queues.find(queue => queue.labId === labs[0].id).topicIds,
  [topics[1].id], "the prerequisite follow-up should remain queued in Lab 1");

context.blockNightV32PollQueueCommand();
assert.equal(starts.length, 5, "the same nonce must never start research twice");

queueCommand = {
  version: 32,
  nonce: "duplicate-topic",
  labs: [
    { labId: labs[0].id, topicIds: [topics[8].id] },
    { labId: labs[1].id, topicIds: [topics[8].id] }
  ]
};
context.blockNightV32PollQueueCommand();
const rejected = JSON.parse(messages.at(-1).slice("BNQUEUE:".length));
assert.equal(rejected.ok, false);
assert.equal(rejected.reason, "topic-unavailable");
assert.equal(starts.length, 5, "invalid data must be rejected before changing any lab");

queueCommand = {
  version: 32,
  nonce: "clear-five",
  labs: labs.map(lab => ({ labId: lab.id, topicIds: [] }))
};
context.blockNightV32PollQueueCommand();
const cleared = JSON.parse(messages.at(-1).slice("BNQUEUE:".length));
assert.equal(cleared.ok, true);
assert.equal(cleared.started.length, 0);
assert.equal(cleared.queues.length, 5);

const assignment={assignedAt:context.gameTime,estimatePaid:true},topic={points:100,power:10};
context.gameTime+=2000;
let progress=context.warzoneTowersResearchProgress({modules:1},topic,assignment);
assert.equal(progress.remainingSeconds,5,'module rate applied in native game time');
assert.equal(progress.estimatedProgress,.3);
const stopped=context.warzoneTowersResearchProgress({modules:1},topic,assignment);
assert.equal(stopped.remainingSeconds,5,'paused game clock does not tick');
context.gameTime+=20000;
progress=context.warzoneTowersResearchProgress({modules:1},topic,assignment);
assert.equal(progress.remainingSeconds,0);
assert.equal(progress.estimatedProgress,.99,'never claim completion before native event');
context.playerPower=()=>0;context.queuedPower=()=>100;
const waiting={assignedAt:context.gameTime};context.gameTime+=5000;
progress=context.warzoneTowersResearchProgress({modules:0},topic,waiting);
assert.equal(progress.waitingPower,true);assert.equal(progress.estimatedProgress,0);
context.blockNightResearchCategory=()=> 'VEHICLES';context.blockNightLastResearchSnapshot='';
topics[0].points=1200;topics[0].power=37;topics[0].fullname='Cobra';
context.blockNightLabTopics={}; // Simulate the legacy idle cleanup losing its map.
context.blockNightEmitResearchSnapshotV23();
const status=JSON.parse(messages.at(-1).slice('BNTECH:'.length));
assert.equal(status.labs.find(lab=>lab.id===labs[0].id).idle,false,'accepted research remains visible despite temporary native idle');
assert.equal(status.labs.find(lab=>lab.id===labs[0].id).topicName,'Cobra');
console.log("PASS: actual Towers bridge validates atomic ordered queues, game-time estimates, module rates and waiting power");
