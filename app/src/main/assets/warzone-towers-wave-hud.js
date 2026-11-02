/* Warzone Towers numbered-wave indicator. */
(() => {
  "use strict";

  const VERSION = 5;
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
    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", nextWave);
    return hud;
  }

  function showPreparation() {
    const owner = hudDocument();
    const touch = window.__kalaWarzoneTouch?.report();
    if (state.preparationShown || !touch?.hudVisible || touch.cameraFacingPending
        || !state.snapshot || state.snapshot.wave !== 0 || state.snapshot.phase !== "countdown") return;
    state.preparationShown = true;
    const dialog = owner.createElement("dialog");
    dialog.id = "warzone-towers-preparation";
    dialog.setAttribute("aria-labelledby", "wt-preparation-title");
    dialog.innerHTML = `<h1 id="wt-preparation-title">PREPARE YOUR DEFENCES</h1>
      <p><strong>You have 4 minutes to prepare your defences.</strong></p>
      <p>Wave 1 starts automatically when the countdown ends, even if you have not built anything.
      Use SKIP WAVE if you are ready sooner.</p>
      <button type="button">START PREPARING</button>`;
    dialog.querySelector("button").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      window.__kalaWarzoneTouch?.releaseAll?.();
      document.getElementById("canvas")?.focus({ preventScroll: true });
    });
    owner.body.appendChild(dialog);
    dialog.showModal();
  }

  function nextWave() {
    if (state.pendingCommand || !state.snapshot || !["countdown", "active"].includes(state.snapshot.phase)) return false;
    const module = window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
    const fs = module?.FS;
    if (!fs?.writeFile || !fs?.rename) return false;
    const path = "/data/mp/tests/warzone-towers-wave-command.json";
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
    const wave = state.snapshot;
    if (!wave) return;
    showPreparation();
    if (wave.wave > 0 || wave.phase === "defeated") {
      const preparation = hudDocument().getElementById("warzone-towers-preparation");
      if (preparation?.open) preparation.close();
    }
    if (wave.phase === "defeated" && !state.failureShown) {
      state.failureShown = true;
      window.__kalaWarzoneTouch?.releaseAll?.();
      window.BlockNightAndroid?.battleFinished?.();
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
      detail = wave.wave > 0 ? "Rebuild your defences" : "Prepare your defences";
    } else if (wave.phase === "defeated") {
      title = "YOU HAVE FAILED";
      detail = "Command centre destroyed";
    } else if (wave.phase === "active") {
      const hostileLabel = Number(wave.enemyDroids) === 1 ? "hostile" : "hostiles";
      title = `WAVE ${wave.wave}`;
      detail = `${wave.enemyDroids} ${hostileLabel} remaining`;
    }
    hud.querySelector("strong").textContent = title;
    hud.querySelector(".wt-wave-detail").textContent = detail;
    const button = hud.querySelector("button");
    button.disabled = Boolean(state.pendingCommand) || !["countdown", "active"].includes(wave.phase);
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
  setTimeout(pollLogs, 250);
  setInterval(pollLogs, 500);
  window.__warzoneTowersWaves = {
    version: VERSION,
    nextWave,
    report: () => ({
      active: true,
      version: VERSION,
      polls: state.polls,
      errors: state.errors,
      commandWrites: state.commandWrites,
      pendingCommand: state.pendingCommand,
      snapshot: state.snapshot
    })
  };
})();
