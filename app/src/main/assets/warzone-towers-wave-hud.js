/* Warzone Towers numbered-wave indicator. */
(() => {
  "use strict";

  const VERSION = 8;
  if (window.__warzoneTowersWaves?.version >= VERSION) return;

  const state = {
    snapshot: null,
    offsets: {},
    partialLines: {},
    decoders: {},
    polls: 0,
    errors: 0,
    pendingCommand: "",
    commandSentAt: 0,
    commandWrites: 0,
    failureShown: false,
    preparationShown: false,
    incomingExpanded: false,
    incomingWave: 0,
    incomingRowsSignature: ""
  };

  function hudDocument() {
    return window.parent?.WarzoneHost ? window.parent.document : document;
  }

  function ensureHud() {
    const owner = hudDocument();
    let hud = owner.getElementById("warzone-towers-wave-hud");
    if (hud) return hud;

    hud = owner.createElement("aside");
    hud.id = "warzone-towers-wave-hud";
    hud.setAttribute("aria-live", "polite");
    hud.innerHTML = `
      <div><strong>BUILD PHASE</strong>
      <span class="wt-wave-detail">Preparing the battlefield</span></div>
      <button id="warzone-towers-next-wave" type="button" title="Call the next wave now. Surviving enemies remain.">SKIP WAVE</button>`;
    (owner.getElementById("warzone-command-strip") || owner.body).appendChild(hud);
    const button = hud.querySelector("button");
    let press = null, lastTouch = -Infinity;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (event.pointerType === 'touch') press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    button.addEventListener('pointercancel', () => { press = null; });
    button.addEventListener('pointerup', event => {
      const start = press; press = null;
      if (!start || start.id !== event.pointerId || button.disabled) return;
      event.preventDefault();
      const r = button.getBoundingClientRect();
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
          || event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) return;
      lastTouch = performance.now(); nextWave();
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      if (performance.now() - lastTouch < 700 && (event.detail > 0 || event.pointerType === 'touch')) return;
      if (!button.disabled) nextWave();
    });
    return hud;
  }

  function ensureIncoming() {
    const owner = hudDocument();
    let box = owner.getElementById("wt-wave-incoming");
    if (box) return box;
    const style = owner.createElement("style");
    style.id = "wt-wave-incoming-style";
    style.textContent = `
      #wt-wave-incoming{position:fixed;right:8px;z-index:2147483643;max-width:calc(100vw - 16px);color:#fff;font:11px/1.35 system-ui,sans-serif;text-align:left;pointer-events:auto}
      #wt-wave-incoming[hidden],#wt-wave-incoming [hidden]{display:none!important}
      #wt-wave-incoming>button{display:flex;align-items:center;gap:10px;min-height:28px;margin-left:auto;padding:6px 10px;border:0;border-radius:5px;background:#000;color:#fff;box-shadow:0 2px 8px #0006;font:500 11px/1.2 Towers,system-ui,sans-serif;letter-spacing:.25px;touch-action:manipulation;cursor:pointer}
      #wt-wave-incoming>button:disabled{opacity:1;cursor:default}
      #wt-wave-incoming>button:focus-visible{outline:2px solid #fff;outline-offset:2px}
      #wt-wave-incoming .wt-incoming-arrow{font:14px/1 system-ui,sans-serif;transform:rotate(0deg)}
      #wt-wave-incoming>button[aria-expanded=true] .wt-incoming-arrow{transform:rotate(180deg)}
      #wt-wave-incoming .wt-incoming-panel{width:264px;max-width:calc(100vw - 16px);box-sizing:border-box;margin-top:4px;padding:8px 10px;border-radius:5px;background:#000;box-shadow:0 3px 12px #0008;max-height:min(240px,calc(100dvh - 132px));overflow:auto;overscroll-behavior:contain;touch-action:pan-y}
      #wt-wave-incoming .wt-incoming-note{margin:0 0 6px;color:#ccc;font-size:10px}
      #wt-wave-incoming ul{display:grid;gap:7px;margin:0;padding:0;list-style:none}
      #wt-wave-incoming li{display:flex;align-items:flex-start;gap:12px;margin:0;padding:0}
      #wt-wave-incoming li span{flex:1;min-width:0;overflow-wrap:anywhere}
      #wt-wave-incoming li b{font-weight:600;font-variant-numeric:tabular-nums}
      @media(max-width:620px){#wt-wave-incoming{right:6px}#wt-wave-incoming .wt-incoming-panel{width:234px;max-height:min(190px,calc(100dvh - 120px))}}
    `;
    (owner.head || owner.body).appendChild(style);
    box = owner.createElement("aside");
    box.id = "wt-wave-incoming";
    box.hidden = true;
    box.setAttribute("aria-label", "Wave enemy units");
    box.innerHTML = `<button type="button" aria-expanded="false" aria-controls="wt-wave-incoming-list"><span class="wt-incoming-title"></span><span class="wt-incoming-arrow" aria-hidden="true">⌄</span></button>
      <div id="wt-wave-incoming-list" class="wt-incoming-panel" hidden><p class="wt-incoming-note"></p><ul></ul></div>`;
    box.querySelector("button").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.snapshot?.incoming?.units?.length) return;
      state.incomingExpanded = !state.incomingExpanded;
      renderIncoming(state.snapshot);
    });
    owner.body.appendChild(box);
    const view = owner.defaultView || window.parent || window;
    view.addEventListener("resize", () => { if (state.snapshot) renderIncoming(state.snapshot); });
    return box;
  }

  function incomingName(name) {
    const aliases = {
      "*BaBa MG* *BaBa Body* BaBaLegs": "Machinegun scavenger",
      "*BusCannon* *School Bus Body* BaBaProp": "Cannon bus",
      "*Flamer* *School Bus Body* BaBaProp": "Flamer bus",
      "*BusCannon* *Fire Engine Body* BaBaProp": "Cannon fire engine",
      "*Flamer* *Fire Engine Body* BaBaProp": "Flamer fire engine",
      "*Jeep MG* *Jeep Body* BaBaProp": "Machinegun jeep",
      "*BabaRocket* *Rocket Jeep Body* BaBaProp": "Rocket jeep",
      "*Buggy MG* *Buggy Body* BaBaProp": "Machinegun buggy",
      "*BabaRocket* *Rocket Buggy Body* BaBaProp": "Rocket buggy",
      "*Trike MG* *Trike Body* BaBaProp": "Machinegun trike",
      "*Cyborg Thermite Weapon* Cyborg Light Body Cyborg Propulsion": "Thermite cyborg",
      "*CyborgRotMG* Cyborg Light Body Cyborg Propulsion": "Assault gun cyborg",
      "*Cyb-Wpn-Rail1* Cyborg Light Body Cyborg Propulsion": "Needle gun cyborg",
      "*Cyb-Wpn-Laser* Cyborg Light Body Cyborg Propulsion": "Flashlight cyborg",
      "*Cyb-Wpn-Atmiss* Cyborg Light Body Cyborg Propulsion": "Scourge missile cyborg"
    };
    return aliases[name] || String(name).replace(/\*/g, "").replace(/ Cyborg (?:Light|Heavy) Body Cyborg Propulsion$/, "");
  }

  function renderIncoming(wave) {
    const box = ensureIncoming();
    if (window.__towersHtml?.isEnded?.() || !wave || ["defeated", "victory"].includes(wave.phase)) { box.hidden = true; return; }
    const incoming = wave.incoming;
    const units = Array.isArray(incoming?.units) ? incoming.units.filter(unit => unit.count > 0 && unit.name) : [];
    const actual = units.length > 0;
    const upcoming = wave.upcoming;
    if (!actual && !(upcoming?.total > 0)) { box.hidden = true; return; }
    const number = Number(actual ? incoming.wave : upcoming.wave) || 0;
    if (state.incomingWave !== number) { state.incomingExpanded = false; state.incomingWave = number; }
    const count = Number(actual ? incoming.total : upcoming.total) || 0;
    const header = hudDocument().getElementById("warzone-command-strip");
    box.style.top = `${Math.max(0, header?.getBoundingClientRect().bottom || 44) + 6}px`;
    box.hidden = false;
    const button = box.querySelector("button");
    button.disabled = !actual;
    button.setAttribute("aria-expanded", String(actual && state.incomingExpanded));
    button.setAttribute("aria-label", actual ? `Wave ${number}: ${count} enemy units. ${state.incomingExpanded ? "Hide" : "Show"} unit types` : `Wave ${number}: ${count} incoming enemy units`);
    box.querySelector(".wt-incoming-title").textContent = `WAVE ${number} · ${count} ${actual ? "UNITS" : "INCOMING"}`;
    box.querySelector(".wt-incoming-arrow").hidden = !actual;
    const panel = box.querySelector(".wt-incoming-panel");
    panel.hidden = !actual || !state.incomingExpanded;
    if (!panel.hidden) {
      const note = box.querySelector(".wt-incoming-note");
      note.textContent = incoming.complete ? "Selected enemy units" : "Enemy units selected so far";
      if (upcoming?.total > 0 && upcoming.wave !== number) note.textContent += ` · Next: ${upcoming.total}`;
      const signature = JSON.stringify(units);
      if (signature !== state.incomingRowsSignature) {
        const list = box.querySelector("ul"), scrollTop = panel.scrollTop;
        list.replaceChildren(...units.map(unit => {
          const row = hudDocument().createElement("li");
          const name = hudDocument().createElement("span"), count = hudDocument().createElement("b");
          name.textContent = incomingName(unit.name); count.textContent = String(unit.count);
          row.append(name, count); return row;
        }));
        state.incomingRowsSignature = signature;
        panel.scrollTop = scrollTop;
      }
    }
  }

  function showPreparation() {
    // The live wave HUD and Help carry preparation instructions. Keep the
    // battlefield available immediately instead of opening a routine modal.
    state.preparationShown = true;
  }

  function nextWave() {
    if (window.__towersHtml?.isEnded?.()) return false;
    if (state.pendingCommand || !state.snapshot || state.snapshot.canSkip === false || !["countdown", "active"].includes(state.snapshot.phase)) return false;
    const module = window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
    const fs = module?.FS;
    if (!fs?.writeFile || !fs?.rename) return false;
    const path = "/data/mp/multiplay/script/rules/warzone-towers-wave-command.json";
    const nonce = `wave-${Date.now()}-${state.commandWrites + 1}`;
    try {
      fs.writeFile(`${path}.tmp`, JSON.stringify({ nonce, action: "next" }), { encoding: "utf8" });
      fs.rename(`${path}.tmp`, path);
      state.pendingCommand = nonce;
      state.commandSentAt = Date.now();
      state.commandWrites += 1;
      render();
      return true;
    } catch (_) { state.errors += 1; return false; }
  }

  function render() {
    const hud = ensureHud();
    if (window.__towersHtml?.isEnded?.()) { hud.classList.remove('visible'); ensureIncoming().hidden = true; return; }
    const wave = state.snapshot;
    if (!wave) return;
    window.__towersHtml?.activate?.(wave);
    showPreparation();
    window.__towersHtml?.consume("warzone-towers-wave-command.json", wave.lastCommand);
    if (wave.wave > 0 || wave.phase === "defeated") {
      const preparation = hudDocument().getElementById("warzone-towers-preparation");
      if (preparation?.open) preparation.close();
    }
    if (["defeated","victory"].includes(wave.phase) && !state.failureShown) {
      state.failureShown = true;
      window.__kalaWarzoneTouch?.releaseAll?.();
      window.__towersHtml?.finish(wave.phase === "victory");
      hud.classList.remove('visible');
      ensureIncoming().hidden = true;
      return;
    }
    if (state.pendingCommand && (wave.lastCommand === state.pendingCommand
        || Date.now() - state.commandSentAt > 5000)) state.pendingCommand = "";

    hud.classList.add("visible");
    hud.dataset.phase = wave.phase || "build";
    let title = "BUILD PHASE";
    let detail = "Build a defence to start";
    if (wave.phase === "countdown") {
      const seconds = Math.max(0, Number(wave.nextWaveIn) || 0);
      const remaining = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      title = `WAVE ${wave.nextWave} IN ${remaining}`;
      detail = wave.enemyDroids > 0 ? `${wave.enemyDroids} hostiles remaining` : wave.wave > 0 ? "Rebuild your defences" : "Prepare your defences";
    } else if (wave.phase === "victory") {
      title = "VICTORY";
      detail = `All ${wave.totalRounds || 30} rounds cleared`;
    } else if (wave.phase === "defeated") {
      title = "YOU HAVE FAILED";
      detail = "Command centre destroyed";
    } else if (wave.phase === "active") {
      const hostileLabel = Number(wave.enemyDroids) === 1 ? "hostile" : "hostiles";
      title = `WAVE ${wave.wave}${wave.totalRounds ? '/' + wave.totalRounds : ''}`;
      detail = `${wave.enemyDroids} ${hostileLabel} remaining`;
    }
    hud.querySelector("strong").textContent = title;
    hud.querySelector(".wt-wave-detail").textContent = detail;
    const button = hud.querySelector("button");
    button.disabled = Boolean(state.pendingCommand) || wave.canSkip === false || !["countdown", "active"].includes(wave.phase);
    button.textContent = state.pendingCommand ? "CALLING…" : "SKIP WAVE";
    renderIncoming(wave);
  }

  function consumeLine(line) {
    const marker = "BNWAVE:";
    const index = line.indexOf(marker);
    if (index < 0) return;
    try {
      const packet = JSON.parse(line.slice(index + marker.length));
      const config = window.__warzoneSurvivalConfig;
      const survival = config?.mode === 'survival' && Object.isFrozen(config);
      if (packet.mode !== (survival ? 'survival' : 'tower-defense')) return;
      if (survival && (packet.profile !== 'survival' || packet.map !== config.map || packet.nativeLevel !== config.level || packet.totalRounds !== 60)) return;
      state.snapshot = packet;
      render();
    } catch (_) {
      state.errors += 1;
    }
  }

  function pollLogs() {
    const module = window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
    const fs = module?.FS;
    if (!fs?.readdir || !fs?.stat || !fs?.open || !fs?.read || !fs?.close) return;
    const configDir = module.WZVAL_configDirPath || window.Module?.WZVAL_configDirPath || "/warzone2100";
    const logDir = `${configDir}/logs`;
    try {
      fs.readdir(logDir).filter(name => name.endsWith(".log")).forEach(name => {
        const path = `${logDir}/${name}`;
        const size = fs.stat(path).size;
        if (!Object.prototype.hasOwnProperty.call(state.offsets, path)) {
          // Old sessions live in IndexedDB. Start at the current end so a stale
          // wave never flashes during the next launch; this session appends later.
          state.offsets[path] = size;
          state.partialLines[path] = "";
          state.decoders[path] = new TextDecoder();
          return;
        }
        let offset = Number(state.offsets[path] || 0);
        if (offset > size) {
          offset = 0;
          state.partialLines[path] = "";
          state.decoders[path] = new TextDecoder();
        }
        if (offset === size) return;
        // Read only appended bytes. Copying the entire persistent log every
        // half-second made longer sessions allocate tens of MB per poll.
        const buffer = new Uint8Array(Math.min(size - offset, 128 * 1024));
        const stream = fs.open(path, "r");
        let count;
        try { count = fs.read(stream, buffer, 0, buffer.length, offset); }
        finally { fs.close(stream); }
        const text = state.partialLines[path] + state.decoders[path].decode(buffer.subarray(0, count), { stream: true });
        const lines = text.split(/\r?\n/);
        state.partialLines[path] = lines.pop();
        lines.forEach(consumeLine);
        state.offsets[path] = offset + count;
      });
      state.polls += 1;
    } catch (_) {
      state.errors += 1;
    }
  }

  ensureHud();
  // The wave panel now lives above the native message lane, so research
  // notifications never move it back over the battlefield.
  window.parent?.addEventListener("warzone-battle-ready", showPreparation);
  window.addEventListener('warzone-battle-ended', () => {
    state.snapshot = null;
    state.pendingCommand = '';
    state.incomingExpanded = false;
    ensureHud().classList.remove('visible');
    ensureIncoming().hidden = true;
  });
  setTimeout(pollLogs, 250);
  setInterval(pollLogs, 500);
  window.__warzoneTowersWaves = {
    version: VERSION,
    nextWave,
    engineExited: () => {
      if (window.__towersHtml?.isEnded?.()) return;
      pollLogs();
      if (window.__towersHtml?.isEnded?.()) return;
      const phase = state.snapshot?.phase;
      if (['victory','defeated'].includes(phase)) window.__towersHtml?.finish(phase === 'victory');
      else window.__towersHtml?.exit('engine-exit');
    },
    report: () => ({
      active: !window.__towersHtml?.isEnded?.(),
      version: VERSION,
      polls: state.polls,
      errors: state.errors,
      commandWrites: state.commandWrites,
      pendingCommand: state.pendingCommand,
      snapshot: state.snapshot
    })
  };
})();
