/* Block Night v3.2 atomic player queues and engine-output bridge. */
(() => {
  "use strict";

  const VERSION = 39;
  const QUEUE_COMMAND_PATH = "/data/mp/multiplay/script/rules/blocknight-queue-command.json";
  const CATEGORIES = ["ALL", "WEAPONS", "DEFENCE", "VEHICLES", "CYBORG", "SYSTEMS", "STRUCTURES"];

  if (window.__blockNightResearch?.version >= VERSION) return "already-installed";

  // Load the isolated Towers theme before the first research tap. It is never
  // attached to the Duel document, which retains its established stylesheet.
  installTowersResearchTheme();

  const state = {
    opening: false, open: false, assigning: false,
    activeLab: 0, requestedLabId: null, activeCategory: "ALL", baseWidth: 0, baseHeight: 0,
    savedCanvasStyle: null, savedHudVisibility: "", savedWaveVisibility: "", savedWavePriority: "", catalog: [], engineLabs: [],
    lastSnapshotGameTime: null, playerPower: 0, pendingCommand: null, topicHistory: {},
    labQueues: {}, syncedQueues: {}, dirtyLabs: {}, runner: null, statusTimer: null,
    assignmentError: "", selectedTopicIndex: null, selectedTopicIds: [], pendingClose: false, syncBlocked: false,
    opens: 0, closes: 0, topicSelections: 0, labSelections: 0,
    categoryChanges: 0,
    bridgeSyncs: 0, bridgeErrors: 0, completedEvents: 0,
    commandAcks: 0, commandRejects: 0, commandTimeouts: 0,
    queueCommandWrites: 0, queueCommandErrors: 0, backgroundSyncs: 0,
    lastSyncDurationMs: null,
    queueAdds: 0, queueRemovals: 0, directAssignments: 0, directFailures: 0,
    queueSyncs: 0, queueStateEvents: 0, queueSerial: 0, queueStateTime: -1,
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

  function applyEngineQueueState(payload, matchingAck = false) {
    if (!Array.isArray(payload?.queues)) return;
    if(Number.isFinite(payload.gameTime)&&payload.gameTime<state.queueStateTime)return;
    if(Number.isFinite(payload.gameTime))state.queueStateTime=payload.gameTime;
    state.queueStateEvents += 1;
    payload.queues.forEach(engineQueue => {
      const labId = Number(engineQueue.labId);
      const key = String(labId);
      if (!Number.isFinite(labId)) return;
      const topicIds = Array.isArray(engineQueue.topicIds) ? engineQueue.topicIds.map(String) : [];
      state.syncedQueues[key] = topicIds.slice();
      if (state.dirtyLabs[key] || !matchingAck && state.runner?.labIds.includes(labId)) return;
      state.labQueues[key] = topicIds
        .map(topicId => knownTopic(String(topicId)))
        .filter(Boolean);
    });
  }

  function resetOnLoad(){
    {
      clearRunnerTimers(state.runner);state.runner=null;state.pendingCommand=null;state.assigning=false;state.syncBlocked=false;
      state.labQueues={};state.syncedQueues={};state.dirtyLabs={};state.queueStateTime=-1;state.requestedLabId=null;state.selectedTopicIds=[];
    }
  }
  function pruneLabs(){
    const live=new Set(state.engineLabs.map(l=>String(l.id)));
    for(const map of [state.labQueues,state.syncedQueues,state.dirtyLabs])for(const key of Object.keys(map))if(!live.has(key))delete map[key];
    if(state.runner?.labIds.some(id=>!live.has(String(id))))finishRunnerFailure(state.runner,'A laboratory was removed.',false);
  }
  function acceptQueues(queues,time,rewound=false){
    if(!Array.isArray(queues))return;
    if(rewound)resetOnLoad();
    // Fresh command snapshots are authoritative, including after loading an older save.
    state.queueStateTime=Number.isFinite(time)?time:-1;
    applyEngineQueueState({queues,gameTime:time});
    renderAll();
  }
  function handleEngineOutput(event) {
    if (window.__towersHtml?.isEnded?.()) return;
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
        window.__towersHtml?.consume('blocknight-queue-command.json',ack.nonce);
        const matching = Boolean(runner && ack.nonce && String(ack.nonce) === runner.nonce);
        if(ack.nonce && !matching)return;
        applyEngineQueueState(ack,matching);
        if (!matching) {
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
      const selectedLabId = state.engineLabs[state.activeLab]?.id;
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
      })).sort((a,b)=>a.id-b.id).map((lab,nativeIndex)=>({...lab,nativeIndex})) : [];
      pruneLabs();
      const requestedLab=state.engineLabs.findIndex(l=>l.id===state.requestedLabId);
      const selectedLab = state.engineLabs.findIndex(l=>l.id===selectedLabId);
      if(requestedLab>=0){state.activeLab=requestedLab;state.requestedLabId=null;}
      else if(selectedLab>=0)state.activeLab=selectedLab;
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

  function createShell() {
    document.getElementById("blocknight-research-shell")?.remove();
    document.getElementById("blocknight-research-style")?.remove();
    const shell = document.createElement("section");
    shell.id = "blocknight-research-shell";
    shell.setAttribute("aria-label", "Technology command");
    shell.innerHTML = `
      <header class="bn-tech-header">
        <div class="bn-tech-brand"><span class="bn-tech-mark"><img src="research-icons/Research%20Module.gif" alt=""></span><div><strong>RESEARCH QUEUE</strong><small>RESEARCH</small></div></div>
        <div class="bn-tech-live"><i></i><b>RESEARCH STATUS</b><span class="bn-tech-count">LOADING</span><em>POWER</em><strong class="bn-tech-power">0</strong></div>
        <button class="bn-tech-done" type="button">BACK TO BATTLE</button>
      </header>
      <div class="bn-tech-main">
        <aside class="bn-tech-rail">
          <h2>RESEARCH LABS</h2>
          <div class="bn-tech-labs"></div>
          <h2 class="bn-tech-filter-title">TECHNOLOGY FILTER</h2>
          <nav class="bn-tech-categories" aria-label="Technology categories"></nav>
        </aside>
        <section class="bn-tech-browser">
          <div class="bn-tech-browser-head"><h2 class="bn-tech-browser-title">ALL TECHNOLOGIES</h2><span><b class="bn-tech-available-count">0</b> AVAILABLE NOW</span></div>
          <div class="bn-tech-list" role="list"></div>
        </section>
        <section class="bn-tech-preview" aria-label="Catalogue selection">
            <img class="bn-tech-detail-image" src="research-icons/Research%20Module.gif" alt="">
            <div class="bn-tech-preview-copy"><small class="bn-tech-preview-label">SELECTED RESEARCH</small><strong class="bn-tech-detail-name">SELECT A TECHNOLOGY</strong><div class="bn-tech-preview-metrics"><span class="bn-tech-detail-category"></span><span>PTS <b class="bn-tech-detail-points">—</b></span><span>POWER <b class="bn-tech-detail-cost">—</b></span></div><b class="bn-tech-detail-status">WAITING</b></div>
            <button class="bn-tech-assign" type="button">ADD TO LAB 1 QUEUE</button>
            <p class="bn-tech-error" role="status"></p>
        </section>
        <aside class="bn-tech-detail" aria-label="Selected laboratory research">
          <h2><span><b class="bn-tech-selected-lab">LAB 1</b> RESEARCH</span><small class="bn-tech-lab-total">0 ITEMS</small></h2>
          <section class="bn-tech-active" aria-live="polite"><div class="bn-tech-current"><img class="bn-tech-current-image" src="research-icons/Research%20Module.gif" alt=""><div class="bn-tech-current-copy"><small class="bn-tech-current-status">LAB READY</small><strong class="bn-tech-active-name">No active research</strong></div></div><div class="bn-tech-progress"><i></i></div><small class="bn-tech-time">Choose a technology to start.</small></section>
          <section class="bn-tech-queue-panel"><header><b class="bn-tech-queue-title">UP NEXT · LAB 1</b><span class="bn-tech-queue-count">EMPTY</span></header><ol class="bn-tech-queue-list"></ol></section>
        </aside>
      </div>
    `;

    const style = document.createElement("style");
    style.id = "blocknight-research-style";
    style.textContent = `
      #blocknight-research-shell{--bg:#02080b;--panel:#071217;--panel-2:#0a1a20;--line:#17333b;--cyan:#53dff5;--cyan-soft:#8eeafa;--green:#68e98f;--amber:#f1ad43;position:fixed;inset:0;z-index:2147483646;overflow:hidden;display:grid;grid-template-rows:51px minmax(0,1fr);color:#dce9eb;background:var(--bg);font-family:"Roboto Condensed","Arial Narrow",system-ui,sans-serif;touch-action:manipulation}
      #blocknight-research-shell *{box-sizing:border-box}#blocknight-research-shell button{font:inherit;border:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation}#blocknight-research-shell h2{margin:0;color:#bacbd0;font-size:10px;line-height:14px;letter-spacing:1px}
      .bn-tech-header{display:flex;align-items:center;gap:12px;padding:6px 12px;border-bottom:1px solid #18323a;background:#041015}.bn-tech-brand{display:flex;align-items:center;gap:9px;min-width:255px}.bn-tech-mark{display:grid;place-items:center;width:38px;height:38px;overflow:hidden;border:1px solid #2f8190;border-radius:7px;background:#0d252c}.bn-tech-mark img{width:48px;height:48px;object-fit:contain}.bn-tech-brand strong{display:block;color:var(--cyan-soft);font-size:19px;line-height:19px;letter-spacing:1.2px}.bn-tech-brand small{display:block;margin-top:2px;color:#65818a;font-size:7px;font-weight:900;letter-spacing:1.55px}
      .bn-tech-live{margin-left:auto;display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:1px solid #176043;border-radius:18px;color:#a8c8bd;font-size:8px;letter-spacing:.7px;white-space:nowrap}.bn-tech-live i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 8px rgba(104,233,143,.75)}.bn-tech-live b{color:#7eea9e}.bn-tech-live span{color:#cfe0de;font-weight:900}.bn-tech-live em{margin-left:4px;color:#8aa0a4;font-size:7px;font-style:normal}.bn-tech-power{color:#f2c262!important;font-size:10px}.bn-tech-done{width:136px;height:36px;border-radius:7px!important;color:#fff;background:#a92127;outline:1px solid #ef6469;font-size:9px!important;font-weight:1000;letter-spacing:.5px}.bn-tech-done:active{background:#7f171d}.bn-tech-done:disabled{opacity:.75;color:#ffd08b;background:#52351a;outline-color:#9e6c2a}
      .bn-tech-main{min-height:0;display:grid;grid-template-columns:205px minmax(0,1fr) 350px;gap:8px;padding:6px 8px 7px}.bn-tech-rail,.bn-tech-browser,.bn-tech-detail{min-width:0;min-height:0;border:1px solid var(--line);border-radius:7px;background:var(--panel)}
      .bn-tech-rail{display:flex;flex-direction:column;padding:7px}.bn-tech-rail>h2{padding:0 4px 4px}.bn-tech-labs{display:flex;flex-direction:column;gap:3px}.bn-tech-lab{position:relative;width:100%;height:34px;padding:2px 25px 2px 40px;border-radius:6px!important;text-align:left;color:#a9bbc0;background:#0a1a20;outline:1px solid #1e3c46}.bn-tech-lab:before{content:attr(data-number);position:absolute;left:6px;top:4px;width:26px;height:26px;display:grid;place-items:center;border:1px solid #315361;border-radius:5px;color:#afc3c9;background:#0d2027;font-size:14px;font-weight:1000}.bn-tech-lab:after{content:"";position:absolute;right:9px;top:13px;width:5px;height:5px;border-top:1px solid #75b7c3;border-right:1px solid #75b7c3;transform:rotate(45deg)}.bn-tech-lab b,.bn-tech-lab small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bn-tech-lab b{font-size:9px;line-height:12px}.bn-tech-lab small{color:#72919a;font-size:6px;line-height:9px}.bn-tech-lab.active{color:#dfffe8;background:#103324;outline:2px solid var(--green);box-shadow:0 0 12px rgba(104,233,143,.18)}.bn-tech-lab.active:before{color:#e7fff0;border-color:var(--green);background:#10251a}.bn-tech-lab.running:not(.active){outline-color:#247e93}.bn-tech-lab.running small{color:#55d7ed}.bn-tech-filter-title{margin-top:6px!important;border-top:1px solid #142d35;padding-top:5px!important}.bn-tech-categories{display:flex;min-height:0;flex:1;flex-direction:column;gap:2px}.bn-tech-category{position:relative;flex:1;min-height:19px;padding:0 10px;border-radius:4px!important;text-align:left;color:#83a0a7;background:#08161b;outline:1px solid #17333b;font-size:8px!important;font-weight:900;letter-spacing:.8px}.bn-tech-category.active{color:#051115;background:var(--cyan);outline-color:#9bf2ff}.bn-tech-category:active{transform:translateY(1px)}
      .bn-tech-browser{display:flex;flex-direction:column;padding:7px}.bn-tech-browser-head{display:flex;align-items:center;justify-content:space-between;height:28px;padding:0 3px 6px;border-bottom:1px solid #112a32}.bn-tech-browser-head h2{color:#d7e4e7;font-size:12px}.bn-tech-browser-head span{color:#7c969c;font-size:7px;font-weight:900;letter-spacing:.7px}.bn-tech-browser-head span b{color:var(--green);font-size:9px}.bn-tech-list{min-height:0;overflow-y:auto;padding:5px 2px 2px;display:flex;flex-direction:column;gap:4px;scrollbar-color:#2a5964 transparent}.bn-tech-card{position:relative;display:grid;grid-template-columns:56px minmax(0,1fr) 56px 12px;align-items:center;gap:8px;flex:0 0 60px;min-width:0;padding:4px 8px 4px 4px;border-radius:6px!important;text-align:left;color:#dce8ea;background:#0a1a20;outline:1px solid #1b3740}.bn-tech-card:after{content:"";width:6px;height:6px;border-top:1px solid #55d9ee;border-right:1px solid #55d9ee;transform:rotate(45deg)}.bn-tech-card.selected{background:#0d2932;outline:2px solid var(--cyan);box-shadow:0 0 14px rgba(83,223,245,.14)}.bn-tech-card:active{transform:translateY(1px)}.bn-tech-card:disabled{opacity:.55}.bn-tech-icon{display:grid;place-items:center;width:52px;height:52px;overflow:hidden;border:1px solid #20505c;border-radius:5px;background:#071319}.bn-tech-icon img{width:60px;height:60px;object-fit:contain}.bn-tech-copy{min-width:0}.bn-tech-copy strong,.bn-tech-copy small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bn-tech-copy strong{color:#eef6f7;font-size:11px;line-height:15px}.bn-tech-copy small{margin-top:3px;color:#69a3af;font-size:7px;font-weight:900;letter-spacing:.4px}.bn-tech-ready{text-align:right}.bn-tech-ready b{display:block;color:var(--green);font-size:8px;letter-spacing:.7px}.bn-tech-ready small{display:block;margin-top:4px;color:#d7e2e3;font-size:8px;font-weight:900}.bn-tech-empty{min-height:160px;display:grid;place-items:center;padding:20px;text-align:center;color:#789096}.bn-tech-empty b{display:block;color:#c2d2d5;font-size:11px}.bn-tech-empty small{font-size:8px}
      .bn-tech-detail{display:flex;flex-direction:column;padding:7px}.bn-tech-detail>h2{height:28px;padding:0 3px 6px;border-bottom:1px solid #112a32;color:#d7e4e7;font-size:12px}.bn-tech-detail-card{display:grid;grid-template-columns:145px minmax(0,1fr);gap:10px;margin-top:6px;padding:6px;border:1px solid #1d3a43;border-radius:6px;background:#09191f}.bn-tech-hero{display:grid;place-items:center;height:126px;overflow:hidden;border:1px solid #173a45;border-radius:5px;background:#061116}.bn-tech-detail-image{width:145px;height:145px;object-fit:contain}.bn-tech-detail-copy{min-width:0;padding:5px 2px}.bn-tech-detail-name{display:block;color:#f1f6f6;font-size:14px;line-height:17px}.bn-tech-detail-category{display:block;margin-top:3px;color:#73a5af;font-size:8px;font-weight:900;letter-spacing:.5px}.bn-tech-detail-status{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:4px;color:#07120b;background:var(--green);font-size:8px;letter-spacing:.7px}.bn-tech-detail-copy dl{margin:9px 0 0;padding-top:7px;border-top:1px solid #173039}.bn-tech-detail-copy dl div{display:flex;align-items:center;justify-content:space-between;margin-top:4px}.bn-tech-detail-copy dt{color:#7f999f;font-size:7px}.bn-tech-detail-copy dd{margin:0;color:#9eeafa;font-size:10px;font-weight:900}.bn-tech-queue-panel{height:74px;margin-top:7px;padding:6px 8px;border:1px solid #1b3e49;border-radius:5px;background:#07171d}.bn-tech-queue-panel header{display:flex;align-items:center;justify-content:space-between}.bn-tech-queue-title{color:#66d9ec;font-size:8px;letter-spacing:.8px}.bn-tech-queue-count{color:#6f8d94;font-size:7px;font-weight:900}.bn-tech-queue-list{height:47px;margin:4px 0 0;padding:0;overflow-y:auto;list-style:none}.bn-tech-queue-empty{padding-top:12px;color:#658087;font-size:7px;text-align:center}.bn-tech-queue-item{display:grid;grid-template-columns:16px minmax(0,1fr) 20px;align-items:center;height:22px;border-top:1px solid #142e36;color:#c7d8db;font-size:7px}.bn-tech-queue-item:first-child{border-top:0}.bn-tech-queue-item b{color:#64e78d;font-size:8px}.bn-tech-queue-item span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bn-tech-queue-remove{width:18px!important;height:18px!important;border-radius:3px!important;color:#e88989;background:#321317;outline:1px solid #68262b;font-size:10px!important}.bn-tech-error{min-height:18px;margin:4px 2px;color:#efa56f;font-size:7px;line-height:10px}.bn-tech-actions{margin-top:auto;padding-top:5px;border-top:1px solid #173039}.bn-tech-actions>div{display:grid;grid-template-columns:auto auto 1fr;align-items:baseline;gap:5px;margin:0 3px 5px}.bn-tech-actions span{color:#67b8c6;font-size:7px;font-weight:900;letter-spacing:.7px}.bn-tech-selected-lab{color:var(--green);font-size:9px}.bn-tech-lab-state{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#7f989e;font-size:7px;text-align:right}.bn-tech-actions button{width:100%;height:37px;border-radius:6px!important;font-size:9px!important;font-weight:1000;letter-spacing:.6px}.bn-tech-assign{color:#07120b;background:var(--green);outline:1px solid #adffc3}.bn-tech-assign:disabled{color:#70827a;background:#173027;outline-color:#294d3d}
      @media(max-width:800px){.bn-tech-header{gap:7px;padding-left:8px;padding-right:8px}.bn-tech-brand{min-width:180px}.bn-tech-brand strong{font-size:15px}.bn-tech-live{padding:0 8px}.bn-tech-main{grid-template-columns:155px minmax(0,1fr) 230px;gap:5px;padding-left:5px;padding-right:5px}.bn-tech-detail-card{grid-template-columns:82px 1fr}.bn-tech-hero{height:105px}.bn-tech-detail-image{width:105px;height:105px}.bn-tech-card{grid-template-columns:45px minmax(0,1fr) 46px 10px}.bn-tech-icon{width:42px;height:48px}.bn-tech-icon img{width:50px;height:50px}}
    `;
    style.textContent += `
      .bn-tech-browser-head{flex:none}.bn-tech-list{flex:1}
      .bn-tech-preview{flex:none;display:grid;grid-template-columns:44px minmax(0,1fr) 170px;align-items:center;gap:8px;padding:10px 3px 3px;margin-top:7px;border-top:1px solid #24515c;background:#071217}
      .bn-tech-preview .bn-tech-detail-image{width:44px;height:44px;object-fit:contain;border:1px solid #24515c;border-radius:4px}.bn-tech-preview-copy{min-width:0;text-align:left}.bn-tech-preview-label{font-size:7px;letter-spacing:1px;color:#72adb9}.bn-tech-preview .bn-tech-detail-name{font-size:12px;line-height:15px;overflow-wrap:anywhere;margin:3px 0}
      .bn-tech-preview-metrics{display:flex;flex-wrap:wrap;gap:3px 9px;color:#759ba5;font-size:8px}.bn-tech-preview-metrics b{color:#b6e2eb}.bn-tech-preview .bn-tech-detail-category{margin:0;font-size:8px;letter-spacing:0}.bn-tech-preview .bn-tech-detail-status{margin:3px 0 0;padding:0;background:transparent;color:#68e98f;font-size:8px;letter-spacing:.3px}
      .bn-tech-preview .bn-tech-assign{width:100%;min-height:42px;padding:8px;border-radius:5px;font-size:9px!important;font-weight:900;line-height:13px;letter-spacing:.4px}.bn-tech-preview .bn-tech-error{grid-column:1/-1;min-height:0;margin:0;color:#efa56f;font-size:8px;line-height:11px;text-align:left}.bn-tech-error:empty{display:none}
      .bn-tech-detail{overflow:hidden}.bn-tech-detail>h2{display:flex;align-items:center;justify-content:space-between;gap:7px;flex:none;height:28px;font-size:11px}.bn-tech-selected-lab{color:#68e98f}.bn-tech-lab-total{color:#799ea7;font-size:8px;letter-spacing:.4px;white-space:nowrap}
      .bn-tech-active{flex:none;margin-top:8px;padding:12px;border:1px solid #28734c;border-radius:5px;background:#0b241b}.bn-tech-current{display:flex;align-items:center;gap:10px;text-align:left}.bn-tech-current-image{width:80px;height:80px;object-fit:contain;border:1px solid #285341;border-radius:5px;background:#081a14;flex:none}.bn-tech-current-copy{min-width:0}.bn-tech-current-status{display:block;color:#68e98f;font-size:8px;letter-spacing:.8px}.bn-tech-active-name{display:block;margin-top:7px;color:#e1f5e6;font-size:15px;line-height:19px;overflow-wrap:anywhere}
      .bn-tech-progress{height:5px;margin-top:12px;background:#193c2b;border-radius:3px;overflow:hidden}.bn-tech-progress i{display:block;height:100%;background:#68e98f;transition:width .6s linear}.bn-tech-time{display:block;margin-top:7px;color:#a6d8b6;font-size:10px;text-align:left}.bn-tech-active.idle{border-color:#21414b;background:#0a1b22}.bn-tech-active.idle .bn-tech-progress{display:none}.bn-tech-active.idle .bn-tech-current-status{color:#90b2bc}
      .bn-tech-queue-panel{height:auto;min-height:62px;flex:1;display:flex;flex-direction:column;overflow:hidden}.bn-tech-queue-list{height:auto;min-height:0;flex:1}.bn-tech-queue-item{min-height:32px;height:auto;grid-template-columns:18px minmax(0,1fr) 28px;font-size:10px;padding:5px 0}.bn-tech-queue-item span{white-space:normal;overflow-wrap:anywhere}.bn-tech-queue-remove{width:26px!important;height:26px!important}.bn-tech-queue-empty{font-size:9px;text-align:left;padding:12px 0}.bn-tech-lab small{font-size:8px}.bn-tech-lab.running{height:41px}.bn-tech-lab.running small{white-space:normal;line-height:10px;max-height:20px;overflow:hidden}
      @media(max-width:1100px){.bn-tech-main{grid-template-columns:180px minmax(0,1fr) 300px}.bn-tech-preview{grid-template-columns:38px minmax(0,1fr) 142px;gap:6px}.bn-tech-preview .bn-tech-detail-image{width:38px;height:38px}.bn-tech-preview .bn-tech-detail-name{font-size:11px}.bn-tech-preview .bn-tech-assign{font-size:8px!important}.bn-tech-current-image{width:68px;height:68px}.bn-tech-active-name{font-size:13px;line-height:17px}}
      @media(max-width:800px){.bn-tech-main{grid-template-columns:145px minmax(0,1fr) 230px}.bn-tech-preview{grid-template-columns:minmax(0,1fr) 120px}.bn-tech-preview .bn-tech-detail-image{display:none}.bn-tech-active{padding:8px}.bn-tech-current{gap:7px}.bn-tech-current-image{width:52px;height:52px}.bn-tech-active-name{font-size:12px;line-height:15px}}
    `;
    document.head.appendChild(style);

    configureTowersResearchShell(shell);
    ensureLabButtons(shell);
    const categories = shell.querySelector(".bn-tech-categories");
    CATEGORIES.forEach(category => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "bn-tech-category";
      button.dataset.category = category;
      button.textContent = isTowersResearchShell(shell) ? category[0] + category.slice(1).toLowerCase() : category;
      categories.appendChild(button);
    });
    shell.addEventListener("pointerdown", event => {
      event.stopPropagation();
      // Suppress compatibility mouse events: SDL otherwise sees HTML menu
      // touches as unmodified canvas clicks and can cancel a native build.
      if (!event.target.closest("input, textarea, [contenteditable]")) event.preventDefault();
    });
    shell.addEventListener("pointerup", event => event.stopPropagation());
    for (const type of ["mousedown", "mouseup", "mousemove", "keydown", "keyup"]) {
      shell.addEventListener(type, event => event.stopPropagation());
    }
    shell.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button) return;
      event.preventDefault(); event.stopPropagation();
      if (button.classList.contains("bn-tech-done")) close(false);
      else if (button.dataset.lab !== undefined) {
        // The polished strip identifies its real laboratory, so a fresh
        // native ordering cannot redirect a selection to another lab.
        const index = isTowersResearchShell(shell) && button.dataset.labId
          ? state.engineLabs.findIndex(lab => lab.id === Number(button.dataset.labId))
          : Number(button.dataset.lab);
        if (index >= 0) selectLab(index);
      }
      else if (button.dataset.category !== undefined) setCategory(button.dataset.category);
      else if (button.dataset.topicId !== undefined) {
        const topic = state.catalog.find(value => value.id === button.dataset.topicId);
        if (topic) selectTopic(topic.nativeIndex);
      }
      else if (button.dataset.queueLab !== undefined) removeQueuedTopic(Number(button.dataset.queueLab), Number(button.dataset.queueIndex));
      else if (button.classList.contains("bn-tech-assign")) assignSelectedTopic(button);
    });
    return shell;
  }

  function isTowersResearchShell(shell) {
    return shell?.classList?.contains?.("wt-towers-research") === true;
  }

  function installTowersResearchTheme() {
    if (window.__warzoneDuelConfig?.mode === "duel"
      || !document.body?.classList?.contains?.("wt-towers-polished")) return false;
    if (document.getElementById("wt-towers-research-theme")) return true;
    const link = document.createElement("link");
    link.id = "wt-towers-research-theme";
    link.rel = "stylesheet";
    link.href = "/warzone/ui/towers-research.css";
    document.head.appendChild(link);
    return true;
  }

  function configureTowersResearchShell(shell) {
    if (window.__warzoneDuelConfig?.mode === "duel"
      || !document.body.classList.contains("wt-towers-polished")) return false;
    installTowersResearchTheme();
    shell.classList.add("wt-towers-research");
    const main = shell.querySelector(".bn-tech-main");
    const browser = shell.querySelector(".bn-tech-browser");
    const categories = shell.querySelector(".bn-tech-categories");
    const detail = shell.querySelector(".bn-tech-detail");
    const preview = shell.querySelector(".bn-tech-preview");
    // Reuse the actual selection/queue elements and handlers; this changes
    // their layout, not the native research or manual assignment paths.
    main.insertBefore(categories, browser);
    main.insertBefore(preview, detail);
    shell.querySelector(".bn-tech-brand strong").textContent = "RESEARCH";
    shell.querySelector(".bn-tech-brand small").textContent = "TECHNOLOGY";
    shell.querySelector(".bn-tech-labs").setAttribute("aria-label", "Research laboratories");
    return true;
  }

  function ensureLabButtons(shell = document.getElementById("blocknight-research-shell")) {
    const container = shell?.querySelector(".bn-tech-labs");
    if (!container) return;
    const count = state.engineLabs.length || 5;
    if (container.querySelectorAll("[data-lab]").length === count) return;
    container.replaceChildren();
    for (let index = 0; index < count; index += 1) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "bn-tech-lab";
      button.dataset.lab = String(index); button.dataset.number = String(index + 1);
      container.appendChild(button);
    }
  }

  function saveCanvasStyle() {
    const target = canvas();
    state.savedCanvasStyle = { transform: target.style.transform, transformOrigin: target.style.transformOrigin, transition: target.style.transition, willChange: target.style.willChange, filter: target.style.filter };
    const hud = document.getElementById("blocknight-combat-hud");
    state.savedHudVisibility = hud?.style.visibility || "";
    const waveHud = document.getElementById("warzone-towers-wave-hud");
    state.savedWaveVisibility = waveHud?.style.visibility || "";
    state.savedWavePriority = waveHud?.style.getPropertyPriority("visibility") || "";
    // Compact Towers TECH leaves the existing battlefield visible at its
    // original dimensions. Its transparent shield retains menu input coverage.
    if (window.__warzoneDuelConfig?.mode !== 'duel'
      && document.body.classList.contains('wt-towers-polished')) return;
    if (hud) hud.style.visibility = "hidden";
    if (waveHud) waveHud.style.setProperty("visibility", "hidden", "important");
    target.style.transition = "filter 120ms ease"; target.style.filter = "brightness(.32) saturate(.55)";
  }

  function restoreCanvasStyle() {
    const target = canvas();
    if (target && state.savedCanvasStyle) Object.assign(target.style, state.savedCanvasStyle);
    const hud = document.getElementById("blocknight-combat-hud");
    if (hud) hud.style.visibility = state.savedHudVisibility;
    const waveHud = document.getElementById("warzone-towers-wave-hud");
    if (waveHud) {
      if (state.savedWaveVisibility) {
        waveHud.style.setProperty("visibility", state.savedWaveVisibility, state.savedWavePriority);
      } else {
        waveHud.style.removeProperty("visibility");
      }
    }
    state.savedCanvasStyle = null;
  }

  function activate() {
    if (window.__towersHtml?.isEnded?.()) return false;
    if (!canvas() || !state.opening) return false;
    hideQueueStatus();
    const previousLab = state.activeLab;
    saveCanvasStyle();
    const shell = createShell(); document.body.appendChild(shell);
    state.opening = false; state.open = true; state.pendingClose = false;
    window.parent?.WarzoneHost?.setResearchOpen(true);
    state.assigning = Boolean(state.runner); state.opens += 1; state.activeCategory = "ALL";
    const requested=state.engineLabs.findIndex(l=>l.id===state.requestedLabId);
    selectLab(requested>=0?requested:isTowersResearchShell(shell) ? Math.min(previousLab, Math.max(0, state.engineLabs.length - 1)) : 0, false);
    if(requested>=0)state.requestedLabId=null;
    renderAll(); vibrate(12); return true;
  }

  function openForLabId(id) {
    if(window.__warzoneDuelConfig?.mode==='duel'||!Number.isFinite(Number(id)))return false;
    state.requestedLabId=Number(id);
    const index=state.engineLabs.findIndex(l=>l.id===state.requestedLabId);
    if(state.open&&index>=0){selectLab(index);state.requestedLabId=null;return true;}
    return open();
  }
  function open() {
    if(window.__warzoneDuelConfig?.mode!=='duel')window.parent?.TowersStatus?.close?.();
    if (window.__towersHtml?.isEnded?.()) return false;
    if (state.open || state.opening) return true;
    window.__warzoneCommands?.close?.();
    window.__warzoneCommands?.closeNative?.();
    const target = canvas(); if (!target) return false;
    const bounds = target.getBoundingClientRect();
    state.baseWidth = bounds.width; state.baseHeight = bounds.height; state.opening = true;
    setTimeout(activate, 40); return true;
  }

  function finishClose(synced = false) {
    if (!state.open && !state.opening) return false;
    state.requestedLabId=null;
    state.opening = false; state.open = false; state.pendingClose = false; state.closes += 1;
    document.getElementById("blocknight-research-shell")?.remove();
    document.getElementById("blocknight-research-style")?.remove(); restoreCanvasStyle();
    window.parent?.WarzoneHost?.setResearchOpen(false);
    if (synced) showQueueStatus("RESEARCH QUEUES SYNCED", "done", 4000);
    try { canvas()?.focus({ preventScroll: true }); } catch (_) { canvas()?.focus(); }
    vibrate(8); return true;
  }

  function close() {
    if (!state.open && !state.opening) return false;
    if (state.runner) {
      state.runner.background = true;
      finishClose(false);
      showQueueStatus("RESEARCH QUEUES SYNCING…", "working");
      return true;
    }
    if (Object.keys(state.dirtyLabs).length) {
      state.syncBlocked = false;
      if (!startQueueSync()) return true;
      state.runner.background = true;
      const labCount = state.runner.labIds.length;
      finishClose(false);
      showQueueStatus(`SYNCING ${labCount} LAB QUEUE${labCount === 1 ? "" : "S"}…`, "working");
      return true;
    }
    return finishClose(false);
  }

  function selectLab(index, count = true) {
    const labCount = state.engineLabs.length || 5;
    if (!state.open || index < 0 || index >= labCount) return false;
    state.activeLab = index; if (count) state.labSelections += 1;
    state.assignmentError = "";
    renderAll();
    const shell = document.getElementById("blocknight-research-shell");
    if (isTowersResearchShell(shell)) shell.querySelector(`[data-lab="${index}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    vibrate(8); return true;
  }

  function setCategory(category) {
    state.activeCategory = CATEGORIES.includes(category) ? category : "ALL";
    const visible = state.activeCategory === "ALL" ? state.catalog : state.catalog.filter(topic => topic.category === state.activeCategory);
    if (!visible.some(topic => topic.nativeIndex === state.selectedTopicIndex)) {
      state.selectedTopicIndex = visible[0]?.nativeIndex ?? null;
    }
    state.categoryChanges += 1; renderCatalog(); renderSummary(); vibrate(5); return true;
  }

  function selectTopic(nativeIndex) {
    if (!state.open) return false;
    const topic = state.catalog.find(value => value.nativeIndex === nativeIndex);
    if (!topic) return false;
    state.selectedTopicIndex = nativeIndex;
    if (isTowersResearchShell(document.getElementById("blocknight-research-shell"))) {
      selectedResearchTopics();
      const index = state.selectedTopicIds.indexOf(topic.id);
      if (index >= 0) state.selectedTopicIds.splice(index, 1);
      else if (!topic.done && !topic.started && !activeLabForTopic(topic.id) && queuedLocation(topic.id) === null) state.selectedTopicIds.push(topic.id);
    }
    state.assignmentError = "";
    renderCatalog(); renderSummary(); vibrate(7); return true;
  }

  function selectedResearchTopics() {
    // Store native IDs in tap order, not volatile catalogue indexes. Polling,
    // category changes and another lab starting work must not redirect a batch.
    const selected = state.selectedTopicIds.map(id => state.catalog.find(topic => topic.id === id))
      .filter(topic => topic && !topic.done && !topic.started && !activeLabForTopic(topic.id) && queuedLocation(topic.id) === null);
    state.selectedTopicIds = selected.map(topic => topic.id);
    return selected;
  }

  function assignSelectedTopic(button = null) {
    if (isTowersResearchShell(document.getElementById("blocknight-research-shell"))) {
      if (!state.open || state.pendingClose || window.__towersHtml?.isEnded?.()) return false;
      const topics = selectedResearchTopics(), lab = state.engineLabs[state.activeLab];
      if (!topics.length || !lab) {
        state.assignmentError = lab ? "Select one or more technologies first." : "That laboratory is no longer available.";
        renderAll(); return false;
      }
      if (queueForLab(lab.id).length + topics.length > 64) {
        state.assignmentError = `Lab ${lab.nativeIndex + 1} can queue 64 technologies. Deselect some topics or remove waiting items first.`;
        renderSummary(); return false;
      }
      // Append the whole ordered selection before invoking the existing atomic
      // queue transport once. One selected topic follows the same path.
      queueForLab(lab.id).push(...topics.map(topic => ({ ...topic })));
      updateDirtyLab(lab.id);
      state.selectedTopicIds = [];
      state.syncBlocked = false;
      state.queueAdds += topics.length;
      state.assignmentError = `${topics.length === 1 ? topics[0].name : `${topics.length} technologies`} added to Lab ${lab.nativeIndex + 1}.`;
      renderAll(); processQueues(); vibrate(12); return true;
    }
    if (!Number.isFinite(Number(state.selectedTopicIndex))) {
      state.assignmentError = "Select a technology before assigning it.";
      renderSummary(); return false;
    }
    return assignTopic(Number(state.selectedTopicIndex), button);
  }

  function afterFrames(count, callback) {
    let remaining = Math.max(1, count);
    const advance = () => {
      remaining -= 1;
      if (remaining <= 0) callback();
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  }

  function hideQueueStatus() {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
    document.getElementById("bn-tech-queue-status")?.remove();
  }

  function showQueueStatus(message, tone = "working", duration = 0) {
    if (state.open) return;
    hideQueueStatus();
    const status = document.createElement("div");
    status.id = "bn-tech-queue-status";
    status.textContent = message;
    Object.assign(status.style, {
      position: "fixed", left: "7px", top: "44px", width: "320px", height: "25px",
      zIndex: "2147483646", display: "grid", placeItems: "center", overflow: "hidden",
      padding: "0 10px", border: `1px solid ${tone === "error" ? "#b84b50" : tone === "done" ? "#2f9b5c" : "#2b7f91"}`,
      borderRadius: "6px", color: tone === "error" ? "#ffd0d2" : tone === "done" ? "#a9f5bf" : "#a9eaf4",
      background: "rgba(3,13,17,.96)", font: "900 9px system-ui", letterSpacing: ".45px",
      textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none"
    });
    document.body.appendChild(status);
    if (duration > 0) state.statusTimer = setTimeout(hideQueueStatus, duration);
  }

  function queueModule() {
    if (window.LaunchedModule?.FS) return window.LaunchedModule;
    if (window.Module?.FS) return window.Module;
    return null;
  }

  function writeQueueCommand(command) {
    if (window.__towersHtml?.isEnded?.()) return false;
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

  function clearRunnerTimers(runner) {
    clearTimeout(runner?.timeoutId);
  }

  function finishRunnerFailure(runner, message = "The research queues could not sync.", timedOut = true) {
    if (state.runner !== runner) return;
    const background = runner.background || !state.open;
    clearRunnerTimers(runner);
    runner.labIds.forEach(labId => { if(state.engineLabs.some(l=>l.id===labId))state.dirtyLabs[String(labId)] = true; });
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
    if (window.__towersHtml?.isEnded?.()) return false;
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
    const nonce = `${Date.now().toString(36)}-${(++state.queueSerial).toString(36)}`;
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
    if (window.__towersHtml?.isEnded?.()) return false;
    if (state.runner || state.syncBlocked || !state.engineLabs.length) return false;
    return startQueueSync();
  }

  function assignTopic(nativeIndex) {
    if (window.__towersHtml?.isEnded?.()) return false;
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

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function renderAll() { renderLabs(); renderCategories(); renderCatalog(); renderSummary(); }

  function renderLabs() {
    const shell = document.getElementById("blocknight-research-shell"); if (!shell) return;
    ensureLabButtons(shell);
    shell.querySelectorAll("[data-lab]").forEach(button => {
      const index = Number(button.dataset.lab);
      const lab = state.engineLabs[index];
      button.classList.toggle("active", index === state.activeLab);
      button.classList.toggle("running", Boolean(lab && !lab.idle));
      if (!lab) {
        button.disabled = true;
        button.innerHTML = `<b>LAB ${index + 1}</b><small>WAITING FOR ENGINE</small>`;
        return;
      }
      button.disabled = false;
      if (isTowersResearchShell(shell)) {
        button.dataset.labId = String(lab.id);
        button.setAttribute("aria-pressed", String(index === state.activeLab));
        button.title = `Lab ${index + 1}${lab.topicName ? ` · ${lab.topicName}` : " · Ready"}`;
      }
      const queued = queueForLab(lab.id).length;
      const suffix = queued ? ` · +${queued} QUEUED` : "";
      const syncing = Boolean(state.runner?.labIds.includes(lab.id));
      const status = lab.idle ? `${syncing ? "SYNCING" : "READY"}${queued ? ` · ${queued} QUEUED` : ""}` : lab.topicName ? `RUNNING · ${escapeHtml(lab.topicName)}${suffix}` : `ACTIVE${suffix}`;
      if (isTowersResearchShell(shell)) {
        button.innerHTML = `<img src="build-icons/A0ResearchFacility.png" alt=""><b>Lab${index + 1}</b><i aria-hidden="true"></i><small>${status}</small>`;
        button.setAttribute('aria-label', `Lab ${index + 1} · ${lab.idle ? syncing ? 'Syncing' : 'Ready' : lab.topicName || 'Researching'}${queued ? ` · ${queued} queued` : ''}`);
      } else button.innerHTML = `<b>LAB ${index + 1}</b><small>${status}</small>`;
    });
  }

  function renderCategories() {
    const shell = document.getElementById("blocknight-research-shell"); if (!shell) return;
    shell.querySelectorAll("[data-category]").forEach(button => button.classList.toggle("active", button.dataset.category === state.activeCategory));
  }

  function renderCatalog() {
    const shell = document.getElementById("blocknight-research-shell"); if (!shell) return;
    renderCategories();
    shell.querySelector(".bn-tech-count").textContent = state.bridgeSyncs ? `${state.catalog.length} TOPICS` : "LOADING";
    shell.querySelector(".bn-tech-power").textContent = state.playerPower.toLocaleString();
    shell.querySelector(".bn-tech-browser-title").textContent = state.activeCategory === "ALL" ? "ALL TECHNOLOGIES" : state.activeCategory;
    const list = shell.querySelector(".bn-tech-list");
    const topics = state.activeCategory === "ALL" ? state.catalog : state.catalog.filter(topic => topic.category === state.activeCategory);
    shell.querySelector(".bn-tech-available-count").textContent = String(topics.length);
    if (!state.bridgeSyncs) { list.innerHTML = `<div class="bn-tech-empty"><div><b>Syncing the live Warzone tree…</b><small>Preparing real names, costs and availability.</small></div></div>`; return; }
    if (!topics.length) { list.innerHTML = `<div class="bn-tech-empty"><div><b>No ${escapeHtml(state.activeCategory.toLowerCase())} research is ready.</b><small>Complete another technology to unlock more.</small></div></div>`; return; }
    if (!topics.some(topic => topic.nativeIndex === state.selectedTopicIndex)) state.selectedTopicIndex = topics[0].nativeIndex;
    const towers = isTowersResearchShell(shell), selected = towers ? selectedResearchTopics() : [];
    list.innerHTML = topics.map(topic => {
      const active = activeLabForTopic(topic.id);
      const queuedLabId = queuedLocation(topic.id);
      const queuedLab = state.engineLabs.find(lab => lab.id === queuedLabId);
      const status = active ? `LAB ${active.nativeIndex + 1} ACTIVE` : queuedLab ? `LAB ${queuedLab.nativeIndex + 1} QUEUED` : "READY";
      const order = selected.findIndex(value => value.id === topic.id), chosen = towers ? order >= 0 : topic.nativeIndex === state.selectedTopicIndex;
      return `<button class="bn-tech-card${chosen ? " selected" : ""}" type="button" role="listitem" data-topic-id="${escapeHtml(topic.id)}" data-topic-index="${topic.nativeIndex}"${towers ? ` aria-pressed="${chosen}" data-selection-order="${chosen ? order + 1 : ''}"` : ''}><span class="bn-tech-icon"><img src="${topicImage(topic)}" alt=""></span><span class="bn-tech-copy"><strong>${escapeHtml(topic.name)}</strong><small>${topic.category} · ${topic.points.toLocaleString()} RESEARCH PTS</small></span><span class="bn-tech-ready"><b>${status}</b><small>POWER ${topic.power.toLocaleString()}</small></span></button>`;
    }).join("");
    list.querySelectorAll("img").forEach(image => image.addEventListener("error", () => {
      if (image.dataset.fallback) return;
      image.dataset.fallback = "true";
      image.src = "research-icons/Research%20Module.gif";
    }, { once: true }));
  }

  function renderSummary() {
    const shell = document.getElementById("blocknight-research-shell"); if (!shell) return;
    const lab = state.engineLabs[state.activeLab];
    const topic = state.catalog.find(value => value.nativeIndex === state.selectedTopicIndex) || null;
    shell.querySelector(".bn-tech-selected-lab").textContent = `LAB ${state.activeLab + 1}`;
    const labQueue = lab ? queueForLab(lab.id) : [];
    const researching = Boolean(lab && !lab.idle);
    const current = researching ? { ...knownTopic(lab.topicId), id: lab.topicId,
      name: lab.topicName || knownTopic(lab.topicId)?.name || 'Starting research…' } : null;
    const total = labQueue.length + (researching ? 1 : 0);
    shell.querySelector('.bn-tech-lab-total').textContent = `${total} ITEM${total === 1 ? '' : 'S'}`;
    shell.querySelector('.bn-tech-active').classList.toggle('idle', !researching);
    shell.querySelector('.bn-tech-current-status').textContent = isTowersResearchShell(shell)
      ? !lab ? 'SYNCING LABORATORIES' : `LAB${state.activeLab + 1} · ${lab.waitingPower && researching ? 'WAITING FOR POWER' : researching ? 'RESEARCHING' : labQueue.length ? 'WAITING TO START' : 'READY'}`
      : researching ? 'NOW RESEARCHING' : !lab ? 'SYNCING LABORATORIES' : labQueue.length ? 'WAITING TO START' : 'LAB READY';
    shell.querySelector('.bn-tech-active-name').textContent = current?.name || 'No active research';
    const currentImage = shell.querySelector('.bn-tech-current-image');
    const currentSource = current ? topicImage(current) : 'research-icons/Research%20Module.gif';
    if (currentImage.getAttribute('src') !== currentSource) currentImage.src = currentSource;
    currentImage.alt = current?.name || 'Laboratory ready';
    currentImage.onerror = () => { currentImage.onerror = null; currentImage.src = 'research-icons/Research%20Module.gif'; };
    const remaining = lab?.remainingSeconds;
    const time = lab?.waitingPower ? 'Waiting for power · timer paused' : remaining === null || remaining === undefined ? 'Linking live research status…' : remaining > 0 ? `~${Math.floor(remaining / 60)}:${String(Math.ceil(remaining % 60)).padStart(2, '0')} left · estimated` : 'Finishing · waiting for engine confirmation';
    shell.querySelector('.bn-tech-time').textContent = lab && !lab.idle ? time : 'Add a technology to start immediately.';
    const progress = shell.querySelector('.bn-tech-progress');
    if (isTowersResearchShell(shell)) {
      const value = lab?.estimatedProgress;
      const known = researching && typeof value === 'number' && Number.isFinite(value);
      progress.hidden = !known;
      progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', `Lab ${state.activeLab + 1} research progress, estimated`);
      progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
      if (known) progress.setAttribute('aria-valuenow', String(Math.floor(Math.min(99, Math.max(0, value * 100)))));
      else progress.removeAttribute('aria-valuenow');
      progress.querySelector('i').style.width = `${known ? Math.min(99, Math.max(0, value * 100)) : 0}%`;
    } else shell.querySelector('.bn-tech-progress i').style.width = `${lab && !lab.idle ? Math.min(99, Math.max(0, lab.estimatedProgress * 100)) : 0}%`;
    shell.querySelector(".bn-tech-error").textContent = state.assignmentError;
    const towers = isTowersResearchShell(shell), selected = towers ? selectedResearchTopics() : [];
    shell.querySelector(".bn-tech-detail-name").textContent = towers ? selected.length ? selected.map(value => value.name).join(" → ") : "None — tap technologies" : topic?.name || "SELECT A TECHNOLOGY";
    shell.querySelector(".bn-tech-detail-category").textContent = topic?.category || "";
    const active = topic ? activeLabForTopic(topic.id) : null;
    const queuedLabId = topic ? queuedLocation(topic.id) : null;
    const queuedLab = state.engineLabs.find(value => value.id === queuedLabId);
    shell.querySelector(".bn-tech-detail-status").textContent = active ? `LAB ${active.nativeIndex + 1} ACTIVE` : queuedLab ? `LAB ${queuedLab.nativeIndex + 1} QUEUED` : topic ? "READY" : "WAITING";
    shell.querySelector(".bn-tech-detail-points").textContent = topic ? topic.points.toLocaleString() : "—";
    shell.querySelector(".bn-tech-detail-cost").textContent = topic ? topic.power.toLocaleString() : "—";
    const detailImage = shell.querySelector(".bn-tech-detail-image");
    const expectedSource = topic ? topicImage(topic) : "research-icons/Research%20Module.gif";
    if (detailImage.getAttribute('src') !== expectedSource) detailImage.src = expectedSource;
    detailImage.onerror = () => { detailImage.onerror = null; detailImage.src = "research-icons/Research%20Module.gif"; };
    shell.querySelector(".bn-tech-queue-title").textContent = `UP NEXT · LAB ${state.activeLab + 1}`;
    shell.querySelector(".bn-tech-queue-count").textContent = labQueue.length ? `${labQueue.length} WAITING` : "EMPTY";
    const queueList = shell.querySelector('.bn-tech-queue-list');
    const queueSignature = JSON.stringify([lab?.id, labQueue.map(value => value.id), state.pendingClose, Boolean(state.runner?.labIds.includes(lab?.id))]);
    if (queueList.dataset.signature !== queueSignature) {
    queueList.dataset.signature = queueSignature;
    queueList.innerHTML = labQueue.length ? labQueue.map((queued, index) => {
      const picture = isTowersResearchShell(shell) ? `<img class="bn-tech-queue-image" src="${topicImage(queued)}" alt="">` : "";
      return `<li class="bn-tech-queue-item"><b>${index + 1}</b>${picture}<span>${escapeHtml(queued.name)}</span><button class="bn-tech-queue-remove" type="button" data-queue-lab="${lab.id}" data-queue-index="${index}" aria-label="Remove ${escapeHtml(queued.name)}" ${state.pendingClose || state.runner?.labIds.includes(lab.id) ? "disabled" : ""}>×</button></li>`;
    }).join("") : `<li class="bn-tech-queue-empty">No waiting technologies.</li>`;
    if (isTowersResearchShell(shell)) queueList.querySelectorAll(".bn-tech-queue-image").forEach(image => {
      image.onerror = () => { image.onerror = null; image.src = "research-icons/Research%20Module.gif"; };
    });
    }
    const assign = shell.querySelector(".bn-tech-assign");
    assign.textContent = towers ? selected.length ? `${selected.length > 1 ? `ADD ${selected.length}` : 'ADD'} TO LAB ${state.activeLab + 1} QUEUE` : 'SELECT RESEARCH' : queuedLab ? `ALREADY QUEUED · LAB ${queuedLab.nativeIndex + 1}` : active ? `RESEARCHING · LAB ${active.nativeIndex + 1}` : `ADD TO LAB ${state.activeLab + 1} QUEUE`;
    assign.disabled = towers ? state.pendingClose || !selected.length || !lab : state.pendingClose || !topic || !lab || Boolean(queuedLab || active);
    const done = shell.querySelector(".bn-tech-done");
    done.textContent = state.pendingClose ? "SYNCING QUEUES…" : "BACK TO BATTLE";
    done.disabled = state.pendingClose;
  }

  const chooseTopic = index => assignTopic(index);
  const afterNativeTap = () => false;

  function runSyntheticSuite() {
    if (!open()) return false;
    setTimeout(() => selectLab(1), 520);
    setTimeout(() => setCategory("WEAPONS"), 700);
    setTimeout(() => setCategory("ALL"), 840);
    setTimeout(() => selectTopic(state.catalog[0]?.nativeIndex ?? -1), 1040);
    return true;
  }

  function report() {
    return {
      active: true, version: VERSION, open: state.open, opening: state.opening,
      opens: state.opens, closes: state.closes, topicSelections: state.topicSelections,
      labSelections: state.labSelections, categoryChanges: state.categoryChanges,
      activeLab: state.activeLab, activeCategory: state.activeCategory,
      ...(window.__warzoneDuelConfig?.mode !== 'duel' ? { selectedTopicIds: state.selectedTopicIds.slice() } : {}),
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

  window.addEventListener('warzone-battle-ended', () => {
    clearRunnerTimers(state.runner);
    state.runner = null; state.pendingCommand = null;
    state.assigning = false; state.pendingClose = false; state.syncBlocked = true;
    state.dirtyLabs = {}; state.engineLabs = [];
    hideQueueStatus(); finishClose(false);
  });
  window.addEventListener("pagehide", () => { if (state.open || state.opening) finishClose(false); });
  window.__blockNightResearch = { version: VERSION, open, openForLabId, close, selectLab, setCategory, selectTopic, assignSelectedTopic, chooseTopic, removeQueuedTopic, processQueues, afterNativeTap, runSyntheticSuite, report, pollOutput: pollResearchLogs, acceptQueues };
  return "blocknight-warzone-mobile-research-v32-atomic-queues-ready";
})();
