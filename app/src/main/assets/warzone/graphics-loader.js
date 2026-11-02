/* Optional official HQ terrain. Adds files/config only; engine payload is untouched. */
(() => {
  const parameters = new URLSearchParams(location.search);
  const high = parameters.get("graphics") === "high";
  const probe = parameters.get("graphics_probe") === "1";
  const state = { requested: high ? "high" : "normal", archiveLoaded: false, bytes: 0,
    nativeArchiveOpens: 0, nativeArchiveReadBytes: 0, error: null };
  let activeModule;
  window.WarzoneGraphics = {
    high,
    prepare(module) {
      activeModule = module;
      if (!high) return;
      const dependency = "warzone-towers-hq-terrain";
      module.addRunDependency(dependency);
      fetch("/warzone/optional/high-v3.wz", { cache: "no-store" })
        .then(response => { if (!response.ok) throw new Error("The downloaded graphics pack is unavailable."); return response.arrayBuffer(); })
        .then(buffer => {
          if (buffer.byteLength !== 99639408) throw new Error("The graphics pack is incomplete.");
          module.FS_createPath("/data", "terrain_overrides", true, true);
          module.FS_createDataFile("/data/terrain_overrides", "high.wz", new Uint8Array(buffer), true, true, true);
          state.archiveLoaded = true; state.bytes = buffer.byteLength;
          if (probe) {
            const fs = module.FS, open = fs.open, read = fs.read;
            fs.open = function(...args) {
              const stream = open.apply(this, args);
              if (String(stream.path).endsWith("/terrain_overrides/high.wz")) state.nativeArchiveOpens++;
              return stream;
            };
            fs.read = function(stream, ...args) {
              const count = read.call(this, stream, ...args);
              if (String(stream.path).endsWith("/terrain_overrides/high.wz")) state.nativeArchiveReadBytes += count;
              return count;
            };
          }
          module.removeRunDependency(dependency);
        })
        .catch(error => {
          state.error = String(error.message || error);
          // Keep main() suspended so a failed HQ request is not silently
          // presented as successful High Quality while rendering Normal.
          window.BlockNightAndroid?.graphicsFailed(state.error);
        });
    },
    report() {
      let config = "";
      try { config = activeModule?.FS.readFile((activeModule.WZVAL_configDirPath || "/warzone2100") + "/config", { encoding: "utf8" }) || ""; } catch (_) {}
      return { ...state, terrainMode: config.match(/^terrainMode=(\d+)/m)?.[1] || null };
    }
  };
})();
