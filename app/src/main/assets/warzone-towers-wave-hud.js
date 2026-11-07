/* Warzone Towers numbered-wave indicator. */
(() => {
  "use strict";

  const VERSION = 7;
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
    preparationShown: false
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
    if (window.__towersHtml?.isEnded?.()) { hud.classList.remove('visible'); return; }
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
  }

  function consumeLine(line) {
    const marker = "BNWAVE:";
    const index = line.indexOf(marker);
    if (index < 0) return;
    try {
      state.snapshot = JSON.parse(line.slice(index + marker.length));
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
    ensureHud().classList.remove('visible');
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
