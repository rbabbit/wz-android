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
  RESEARCH_LAB: 7,
  BUILT: 1,
  STRUCTURE: 3
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, "..", "scenario",
  "blocknight-queue-rules.js"), "utf8");
vm.runInContext(source, context, { filename: "blocknight-queue-rules.js" });

assert.deepEqual(timers, [{ functionName: "blockNightV32PollBridgeCommands", milliseconds: 120 }]);

context.blockNightV32PollQueueCommand();
assert.equal(starts.length, 5, "all five idle labs should start from one atomic command");
assert.deepEqual(starts.map(start => start.labId), labs.map(lab => lab.id));
const firstAck = JSON.parse(messages.at(-1).slice("BNQUEUE:".length));
assert.equal(firstAck.ok, true);
assert.equal(firstAck.nonce, "five-labs");
assert.equal(firstAck.started.length, 5);
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

console.log("PASS: one atomic command validates and syncs all five lab queues without chat typing");
