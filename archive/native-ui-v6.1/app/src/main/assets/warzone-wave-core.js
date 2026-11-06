/* Warzone Towers numbered-wave indicator. */
(() => {
  "use strict";

  const VERSION = 7;
  const session = String(window.__towersNative?.session || window.__towersNativeSession || '');
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


function nextWave() {
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
function render(){
 const wave=state.snapshot;if(!wave)return;
 window.__towersNative?.consume?.('warzone-towers-wave-command.json',wave.lastCommand);
 if(['defeated','victory'].includes(wave.phase)&&!state.failureShown){state.failureShown=true;window.__kalaWarzoneTouch?.releaseAll();if(wave.phase==='victory')window.BlockNightAndroid?.battleWon(session);else window.BlockNightAndroid?.battleFinished(session);}
 if(state.pendingCommand&&(wave.lastCommand===state.pendingCommand||Date.now()-state.commandSentAt>5000))state.pendingCommand='';
 window.__towersNative?.publish();
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
function engineExited(){
 // Read the final native wave lines before the generic app-exit fallback.
 pollLogs();
 if(!state.failureShown){state.failureShown=true;window.BlockNightAndroid?.battleFinished(session);}
}
setTimeout(pollLogs,250);setInterval(pollLogs,500);
window.__warzoneTowersWaves={version:VERSION,nativeUI:true,nextWave,engineExited,report:()=>({...state,active:true})};
})();
