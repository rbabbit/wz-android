/* Block Night v3.2 atomic player queues and engine-output bridge. */
(() => {
  "use strict";

  const VERSION = 37;
  const QUEUE_COMMAND_PATH = "/data/mp/multiplay/script/rules/blocknight-queue-command.json";
  const CATEGORIES = ["ALL", "WEAPONS", "DEFENCE", "VEHICLES", "CYBORG", "SYSTEMS", "STRUCTURES"];

  if (window.__blockNightResearch?.version >= VERSION) return "already-installed";

  const state = {
    opening: false, open: false, assigning: false,
    activeLab: 0, activeCategory: "ALL", baseWidth: 0, baseHeight: 0,
    savedCanvasStyle: null, savedHudVisibility: "", savedWaveVisibility: "", savedWavePriority: "", catalog: [], engineLabs: [],
    lastSnapshotGameTime: null, playerPower: 0, pendingCommand: null, topicHistory: {},
    labQueues: {}, syncedQueues: {}, dirtyLabs: {}, runner: null, statusTimer: null,
    assignmentError: "", selectedTopicIndex: null, pendingClose: false, syncBlocked: false,
    opens: 0, closes: 0, topicSelections: 0, labSelections: 0,
    categoryChanges: 0,
    bridgeSyncs: 0, bridgeErrors: 0, completedEvents: 0,
    commandAcks: 0, commandRejects: 0, commandTimeouts: 0,
    queueCommandWrites: 0, queueCommandErrors: 0, backgroundSyncs: 0,
    lastSyncDurationMs: null,
    queueAdds: 0, queueRemovals: 0, directAssignments: 0, directFailures: 0,
    queueSyncs: 0, queueStateEvents: 0,
    fsPolls: 0, fsErrors: 0, fsLogFiles: [], logOffsets: {},
    lastTopic: null, lastCompleted: null
  };

  const canvas = () => document.getElementById("canvas");
  const vibrate = (duration = 10) => { try { navigator.vibrate?.(duration); } catch (_) {} };

  function queueForLab(labId) {
    const key = String(labId);
    if (!Array.isArray(state.labQueues[key])) state.labQueues[key] = [];
    return state.labQueues[key];
  }

  function updateDirtyLab(labId) {
    const key = String(labId);
    const local = queueForLab(labId).map(topic => topic.id);
    const synced = Array.isArray(state.syncedQueues[key]) ? state.syncedQueues[key] : [];
    if (local.length === synced.length && local.every((topicId, index) => topicId === synced[index])) {
      delete state.dirtyLabs[key];
    } else {
      state.dirtyLabs[key] = true;
    }
  }

  function queuedLocation(topicId) {
    for (const [labId, queue] of Object.entries(state.labQueues)) {
      if (queue.some(topic => topic.id === topicId)) return Number(labId);
    }
    return null;
  }

  function activeLabForTopic(topicId) {
    return state.engineLabs.find(lab => !lab.idle && lab.topicId === topicId) || null;
  }

  function categoryFor(topic) {
    const text = `${topic?.category || ""} ${topic?.id || ""} ${topic?.name || ""}`;
    if (/Cyborg/i.test(text)) return "CYBORG";
    if (/R-Wpn|Weapon|Cannon|Rocket|Missile|Mortar|Howitzer|Flamer|Laser|Rail|Machinegun/i.test(text)) return "WEAPONS";
    if (/Defense|Defence|Wall|Tower|Bunker|Pillbox|Emplacement|Hardcrete/i.test(text)) return "DEFENCE";
    if (/Vehicle|Body|Prop|Engine|Tracks|Wheels|Hover|Armor|Armour|Metals/i.test(text)) return "VEHICLES";
    if (/Struc|Factory|Module|Power|Research Facility|Repair Facility|Command Relay/i.test(text)) return "STRUCTURES";
    return "SYSTEMS";
  }

  function commandReason(reason) {
    return ({
      "lab-missing": "That laboratory is no longer available.",
      "lab-busy": "That laboratory is already researching. Pause or cancel it first.",
      "topic-unavailable": "That technology was just started or is no longer available.",
      "wrong-player": "The engine rejected the player assignment.",
      "engine-rejected": "Warzone rejected the research command. Try another laboratory.",
      "invalid": "Warzone rejected the queue data. Your selections were kept."
    })[String(reason || "")] || "The research command was not accepted.";
  }

  function topicImage(topic) {
    const name = String(topic?.name || "Research Module");
    const extension = name === "Avenger SAM" ? "png" : "gif";
    return `research-icons/${encodeURIComponent(name)}.${extension}`;
  }

  function parsePayload(text, marker) {
    const markerIndex = text.indexOf(marker);
    const start = text.indexOf("{", markerIndex + marker.length);
    const end = text.lastIndexOf("}");
    if (markerIndex < 0 || start < 0 || end < start) return null;
    return JSON.parse(text.slice(start, end + 1));
  }

  function knownTopic(topicId) {
    const live = state.catalog.find(topic => topic.id === topicId);
    if (live) return { ...live };
    for (const queue of Object.values(state.labQueues)) {
      const queued = queue.find(topic => topic.id === topicId);
      if (queued) return { ...queued };
    }
    return state.runner?.topics?.find(topic => topic.id === topicId) || state.topicHistory[topicId] || null;
  }

  function applyEngineQueueState(payload) {
    if (!Array.isArray(payload?.queues)) return;
    state.queueStateEvents += 1;
    payload.queues.forEach(engineQueue => {
      const labId = Number(engineQueue.labId);
      const key = String(labId);
      if (!Number.isFinite(labId)) return;
      const topicIds = Array.isArray(engineQueue.topicIds) ? engineQueue.topicIds.map(String) : [];
      state.syncedQueues[key] = topicIds.slice();
      if (state.dirtyLabs[key]) return;
      state.labQueues[key] = topicIds
        .map(topicId => knownTopic(String(topicId)))
        .filter(Boolean);
    });
  }

  function handleEngineOutput(event) {
    const text = String(event?.detail?.text || "");
    try {
      if (text.includes("WTCMD:")) {
        const response = parsePayload(text, "WTCMD:");
        if (response?.nonce) window.dispatchEvent(new CustomEvent("warzone-command-reply", { detail: response }));
        return;
      }
      if (text.includes("BNCONTROL:")) {
        const applied = parsePayload(text, "BNCONTROL:");
        if (applied?.nonce) window.dispatchEvent(new CustomEvent("warzone-towers-control-ack", { detail: applied }));
        return;
      }
      if (text.includes("BNZOOM:")) {
        const applied = parsePayload(text, "BNZOOM:");
        if (!applied?.nonce) return;
        window.dispatchEvent(new CustomEvent("blocknight-zoom-ack", { detail: applied }));
        console.info(`[BlockNight zoom] ${applied.preset} applied at ${applied.distance}`);
        return;
      }
      if (text.includes("BNQUEUE:")) {
        const ack = parsePayload(text, "BNQUEUE:");
        const runner = state.runner;
        if (!ack) return;
        consumeQueueCommand(ack.nonce);
        applyEngineQueueState(ack);
        if (!runner || !ack.nonce || String(ack.nonce) !== runner.nonce) {
          renderAll();
          return;
        }
        state.commandAcks += 1;
        if (!ack.ok) {
          finishRunnerFailure(runner, commandReason(ack.reason), false);
          return;
        }
        clearRunnerTimers(runner);
        const completedAt = performance.now();
        state.lastSyncDurationMs = Math.round(completedAt - runner.startedAt);
        const background = runner.background || !state.open;
        state.runner = null;
        state.pendingCommand = null;
        state.assigning = false;
        state.queueSyncs += 1;
        const started = Array.isArray(ack.started) ? ack.started : [];
        // A started item belongs in NOW RESEARCHING, not in the waiting list.
        // Preserve edits made while this atomic command was in flight.
        for (const assignment of started) {
          const lab = state.engineLabs.find(value => value.id === Number(assignment.labId));
          const topic = knownTopic(String(assignment.topicId));
          const key = String(assignment.labId);
          state.labQueues[key] = queueForLab(assignment.labId).filter(value => value.id !== assignment.topicId);
          if (lab) Object.assign(lab, { idle: false, topicId: assignment.topicId, topicName: topic?.name || assignment.topicId });
          updateDirtyLab(assignment.labId);
        }
        state.directAssignments += started.length;
        const lastStarted = started.length ? knownTopic(String(started[started.length - 1].topicId)) : null;
        if (lastStarted) {
          state.lastTopic = lastStarted;
          state.topicSelections += started.length;
        }
        state.syncBlocked = false;
        state.assignmentError = "";
        renderAll();
        if (background) {
          state.backgroundSyncs += 1;
          showQueueStatus(`${runner.labIds.length} LAB QUEUE${runner.labIds.length === 1 ? "" : "S"} SYNCED`, "done", 3200);
        } else if (state.pendingClose) {
          finishClose(true);
        }
        processQueues();
        return;
      }
      if (text.includes("BNTECHDONE:")) {
        const completed = parsePayload(text, "BNTECHDONE:");
        if (!completed || Number(completed.player) !== 0) return;
        state.completedEvents += 1;
        state.lastCompleted = completed;
        window.dispatchEvent(new CustomEvent("blocknight-research-completed", { detail: completed }));
        renderLabs(); renderSummary();
        return;
      }
      if (!text.includes("BNTECH:")) return;
      const snapshot = parsePayload(text, "BNTECH:");
      if (!snapshot || !Array.isArray(snapshot.topics)) return;
      const previousCatalog = JSON.stringify(state.catalog);
      const previousAssignments = JSON.stringify(state.engineLabs.map(lab => [lab.id, lab.idle, lab.topicId]));
      const selectedTopicId = state.catalog.find(topic => topic.nativeIndex === state.selectedTopicIndex)?.id;
      state.catalog = snapshot.topics.map((topic, snapshotIndex) => ({
        id: String(topic.id || ""), name: String(topic.name || topic.id || "Unknown technology"),
        power: Number(topic.power || 0), points: Number(topic.points || 0),
        started: Boolean(topic.started), done: Boolean(topic.done),
        nativeIndex: Number.isFinite(Number(topic.nativeIndex)) ? Number(topic.nativeIndex) : snapshotIndex,
        category: categoryFor(topic)
      }));
      state.selectedTopicIndex = state.catalog.find(topic => topic.id === selectedTopicId)?.nativeIndex ?? null;
      for (const topic of state.catalog) state.topicHistory[topic.id] = topic;
      state.engineLabs = Array.isArray(snapshot.labs) ? snapshot.labs.map((lab, snapshotIndex) => ({
        id: Number(lab.id), nativeIndex: Number.isFinite(Number(lab.nativeIndex)) ? Number(lab.nativeIndex) : snapshotIndex,
        idle: Boolean(lab.idle), modules: Number(lab.modules || 0), health: Number(lab.health || 0),
        topicId: String(lab.topicId || ""), topicName: String(lab.topicName || ""),
        remainingSeconds: Number.isFinite(lab.remainingSeconds) ? lab.remainingSeconds : null,
        estimatedProgress: Number(lab.estimatedProgress || 0), waitingPower: Boolean(lab.waitingPower)
      })) : [];
      if (state.activeLab >= state.engineLabs.length) state.activeLab = Math.max(0, state.engineLabs.length - 1);
      state.playerPower = Number(snapshot.power || 0);
      state.lastSnapshotGameTime = Number(snapshot.gameTime || 0);
      state.bridgeSyncs += 1;
      // A countdown tick must not replace a technology button under a finger.
      if (previousCatalog !== JSON.stringify(state.catalog) || previousAssignments !== JSON.stringify(state.engineLabs.map(lab => [lab.id, lab.idle, lab.topicId]))) renderAll();
      else { renderLabs(); renderSummary(); }
    } catch (_) { state.bridgeErrors += 1; }
  }
  window.addEventListener("blocknight-engine-output", handleEngineOutput);
  const engineOutputChannel = typeof BroadcastChannel === "function" ?
    new BroadcastChannel("blocknight-engine-output") : null;
  engineOutputChannel?.addEventListener("message", event => {
    handleEngineOutput({ detail: { text: event.data } });
  });

  function pollResearchLogs() {
    const module = window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
    const fs = module?.FS;
    if (!fs?.readdir || !fs?.stat || !fs?.open || !fs?.read || !fs?.close) return;
    const configDir = module.WZVAL_configDirPath || window.Module?.WZVAL_configDirPath || "/warzone2100";
    const logDir = `${configDir}/logs`;
    try {
      const files = fs.readdir(logDir).filter(name => name.endsWith(".log"));
      state.fsLogFiles = files;
      state.fsPolls += 1;
      files.forEach(name => {
        const path = `${logDir}/${name}`;
        const size = fs.stat(path).size;
        state.logPartials ||= {};
        state.logDecoders ||= {};
        if (!Object.prototype.hasOwnProperty.call(state.logOffsets, path)) {
          state.logOffsets[path] = size;
          state.logPartials[path] = "";
          state.logDecoders[path] = new TextDecoder();
          return;
        }
        let offset = Number(state.logOffsets[path] || 0);
        if (offset > size) {
          offset = 0;
          state.logPartials[path] = "";
          state.logDecoders[path] = new TextDecoder();
        }
        if (offset === size) return;
        const buffer = new Uint8Array(Math.min(size - offset, 128 * 1024));
        const stream = fs.open(path, "r");
        let count;
        try { count = fs.read(stream, buffer, 0, buffer.length, offset); }
        finally { fs.close(stream); }
        const addition = state.logPartials[path] + state.logDecoders[path].decode(buffer.subarray(0, count), { stream: true });
        state.logOffsets[path] = offset + count;
        const lines = addition.split(/\r?\n/);
        state.logPartials[path] = lines.pop();
        lines.forEach(line => {
          if (line.includes("BNTECH") || line.includes("BNQUEUE") || line.includes("BNZOOM") || line.includes("BNCONTROL") || line.includes("WTCMD:")) {
            handleEngineOutput({ detail: { text: line } });
          }
        });
      });
    } catch (_) {
      state.fsErrors += 1;
    }
  }
  setTimeout(pollResearchLogs, 500);
  setInterval(pollResearchLogs, 650);


// Native Android owns the screen; these hooks publish data only.
const renderAll=()=>window.__towersNative?.publish(),renderLabs=renderAll,renderSummary=renderAll;
function showQueueStatus(message,tone){window.__towersNative?.notice(message,tone==='error');}
function finishClose(){state.open=false;state.opening=false;state.closes++;renderAll();return true;}
function close(){if(state.runner)state.runner.background=true;state.syncBlocked=false;processQueues();return finishClose();}
function open(){state.open=true;state.opens++;state.syncBlocked=false;processQueues();renderAll();return true;}
function queueModule() {
    if (window.LaunchedModule?.FS) return window.LaunchedModule;
    if (window.Module?.FS) return window.Module;
    return null;
  }
function writeQueueCommand(command) {
    const fs = queueModule()?.FS;
    if (!fs?.writeFile || !fs?.rename) {
      state.queueCommandErrors += 1;
      return false;
    }
    const temporaryPath = `${QUEUE_COMMAND_PATH}.tmp`;
    try {
      fs.writeFile(temporaryPath, JSON.stringify(command), { encoding: "utf8" });
      fs.rename(temporaryPath, QUEUE_COMMAND_PATH);
      state.queueCommandWrites += 1;
      return true;
    } catch (error) {
      state.queueCommandErrors += 1;
      console.warn("[BlockNight research] queue command write failed", error);
      return false;
    }
  }
function consumeQueueCommand(nonce) {
    const fs = queueModule()?.FS;
    if (!nonce || !fs?.readFile || !fs?.writeFile || !fs?.rename) return;
    try {
      const command = JSON.parse(fs.readFile(QUEUE_COMMAND_PATH, { encoding: "utf8" }));
      // An acknowledgement may arrive after another edit has been written.
      // Replace only the consumed request, never the newer exact queue.
      // The native poller expects the file to remain present.
      if (command.nonce === nonce) {
        fs.writeFile(QUEUE_COMMAND_PATH + '.tmp', JSON.stringify({nonce: ""}), {encoding: "utf8"});
        fs.rename(QUEUE_COMMAND_PATH + '.tmp', QUEUE_COMMAND_PATH);
      }
    } catch (_) { /* Already consumed or not yet mounted. */ }
  }
function clearRunnerTimers(runner) {
    clearTimeout(runner?.timeoutId);
  }
function finishRunnerFailure(runner, message = "The research queues could not sync.", timedOut = true) {
    if (state.runner !== runner) return;
    const background = runner.background || !state.open;
    clearRunnerTimers(runner);
    runner.labIds.forEach(labId => { state.dirtyLabs[String(labId)] = true; });
    state.runner = null;
    state.pendingCommand = null;
    state.assigning = false;
    state.pendingClose = false;
    state.syncBlocked = true;
    state.directFailures += 1;
    if (timedOut) state.commandTimeouts += 1;
    else state.commandRejects += 1;
    state.assignmentError = `${message} Your selections are still saved—open Tech and tap Back to Battle to retry.`;
    if (background) showQueueStatus("RESEARCH QUEUE SYNC FAILED — OPEN TECH TO RETRY", "error", 6500);
    else renderAll();
  }
function startQueueSync() {
    if (state.runner) return false;
    const labIds = Object.keys(state.dirtyLabs).map(Number).filter(Number.isFinite);
    if (!labIds.length) return false;
    const labCommands = [];
    const topics = [];
    labIds.forEach(labId => {
      const topicIds = [];
      queueForLab(labId).forEach(queued => {
        const live = state.catalog.find(topic => topic.id === queued.id);
        if (!live || activeLabForTopic(live.id)) return;
        topicIds.push(live.id);
        topics.push({ ...live });
      });
      const lab = state.engineLabs.find(value => value.id === labId);
      if (lab) labCommands.push({ labId: lab.id, topicIds });
      delete state.dirtyLabs[String(labId)];
    });
    const nonce = `${Date.now().toString(36)}-${state.queueAdds.toString(36)}`;
    const runner = {
      labIds, topics, nonce, timeoutId: null, startedAt: performance.now(),
      background: !state.open, transport: "atomic-file"
    };
    state.runner = runner;
    state.pendingCommand = runner;
    state.assigning = true;
    state.assignmentError = "Sending your exact research order to Warzone…";
    renderAll();
    const command = { version: 32, nonce, labs: labCommands };
    if (!writeQueueCommand(command)) {
      finishRunnerFailure(runner, "The queue link is unavailable.", false);
      return false;
    }
    runner.timeoutId = setTimeout(() => finishRunnerFailure(runner,
      "The queue sync timed out.", true), 6000);
    return true;
  }
function processQueues() {
    if (state.runner || state.syncBlocked || !state.engineLabs.length) return false;
    return startQueueSync();
  }
function assignTopic(nativeIndex) {
    if (!state.open || nativeIndex < 0) return false;
    const topic = state.catalog.find(value => value.nativeIndex === nativeIndex);
    const lab = state.engineLabs[state.activeLab];
    if (!topic || !lab) {
      state.assignmentError = "The research list changed. Select the item again.";
      renderAll(); return false;
    }
    const activeLab = activeLabForTopic(topic.id);
    const queuedLabId = queuedLocation(topic.id);
    if (activeLab || queuedLabId !== null) {
      const owner = activeLab || state.engineLabs.find(value => value.id === queuedLabId);
      state.assignmentError = `${topic.name} is already ${activeLab ? "researching" : "queued"}${owner ? ` in Lab ${owner.nativeIndex + 1}` : ""}.`;
      renderAll(); vibrate(12); return false;
    }
    queueForLab(lab.id).push({ ...topic });
    updateDirtyLab(lab.id);
    state.syncBlocked = false;
    state.queueAdds += 1;
    state.assignmentError = `${topic.name} added to Lab ${lab.nativeIndex + 1}.`;
    renderAll();
    processQueues();
    vibrate(12);
    return true;
  }
function removeQueuedTopic(labId, queueIndex) {
    if (!state.open) return false;
    const queue = queueForLab(labId);
    if (queueIndex < 0 || queueIndex >= queue.length) return false;
    queue.splice(queueIndex, 1);
    updateDirtyLab(labId);
    state.syncBlocked = false;
    state.queueRemovals += 1;
    state.assignmentError = "";
    renderAll(); processQueues(); vibrate(8); return true;
  }
function report() {
    return {
      active: true, version: VERSION, open: state.open, opening: state.opening,
      opens: state.opens, closes: state.closes, topicSelections: state.topicSelections,
      labSelections: state.labSelections, categoryChanges: state.categoryChanges,
      activeLab: state.activeLab, activeCategory: state.activeCategory,
      catalogCount: state.catalog.length, catalogSample: state.catalog.slice(0, 4).map(topic => topic.name),
      labCount: state.engineLabs.length, readyLabs: state.engineLabs.filter(lab => lab.idle).length,
      labIds: state.engineLabs.map(lab => lab.id), playerPower: state.playerPower,
      labs: state.engineLabs.map(lab => ({...lab})),
      bridgeSyncs: state.bridgeSyncs, bridgeErrors: state.bridgeErrors,
      commandAcks: state.commandAcks, commandRejects: state.commandRejects,
      commandTimeouts: state.commandTimeouts,
      queueAdds: state.queueAdds, queueRemovals: state.queueRemovals,
      directAssignments: state.directAssignments, directFailures: state.directFailures,
      queueSyncs: state.queueSyncs, queueStateEvents: state.queueStateEvents,
      queueCommandWrites: state.queueCommandWrites, queueCommandErrors: state.queueCommandErrors,
      backgroundSyncs: state.backgroundSyncs, lastSyncDurationMs: state.lastSyncDurationMs,
      queues: state.engineLabs.map(lab => queueForLab(lab.id).map(topic => topic.name)),
      dirtyLabIds: Object.keys(state.dirtyLabs).map(Number), pendingClose: state.pendingClose,
      syncBlocked: state.syncBlocked,
      runner: state.runner ? {
        labIds: state.runner.labIds, topicCount: state.runner.topics.length,
        transport: state.runner.transport, background: state.runner.background
      } : null,
      pendingCommand: state.pendingCommand ? {
        labIds: state.pendingCommand.labIds, topicCount: state.pendingCommand.topics.length
      } : null,
      fsPolls: state.fsPolls, fsErrors: state.fsErrors, fsLogFiles: state.fsLogFiles,
      completedEvents: state.completedEvents, lastTopic: state.lastTopic?.name || null,
      lastCompleted: state.lastCompleted?.name || null,
      canvasRestored: !state.open && !state.savedCanvasStyle
    };
  }
window.__blockNightResearch={version:VERSION,nativeUI:true,open,close,removeQueuedTopic,processQueues,pollOutput:pollResearchLogs,report,
 acceptQueues:queues=>{if(!Array.isArray(queues)||state.runner||Object.keys(state.dirtyLabs).length)return;applyEngineQueueState({queues});renderSummary();},
 enqueue:(labId,topicId)=>{state.activeLab=state.engineLabs.findIndex(l=>l.id===labId);return assignTopic(state.catalog.find(t=>t.id===topicId)?.nativeIndex??-1);},
 remove:(labId,topicId)=>removeQueuedTopic(labId,queueForLab(labId).findIndex(t=>t.id===topicId)),
 model:()=>({...report(),catalog:state.catalog,error:state.assignmentError,queueItems:state.engineLabs.map(l=>({labId:l.id,topics:queueForLab(l.id)}))})};
})();
