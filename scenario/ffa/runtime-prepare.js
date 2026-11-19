/* FFA-only wrapper setup, before the unchanged native program starts. */
function prepareFfaModule(module, config) {
    module.preRun.push(function (m) {
        // The unchanged compiled preloader knows only the original stock
        // directory tree. Build this list from every actual VFS file parent
        // before it installs any data slices, including all legacy map files.
        const directories = FFA_NATIVE_PACKAGE_DIRECTORIES;
        directories.forEach(function (path) { m.FS.mkdirTree(path); });
    });
    const originalMonitor = module.monitorRunDependencies;
    let installed = false;
    module.monitorRunDependencies = function (left) {
        if (!installed && left === 0 && module.FS
            && module.FS.analyzePath("/data/mp/multiplay/script/ffa-config.json").exists) {
            if (module.calledRun) throw new Error("FFA config arrived after native startup");
            if (window.WarzoneDownloadedMaps) window.WarzoneDownloadedMaps.install(module, config);
            const limits = config.structureLimits || {};
            if (Object.keys(limits).length) {
                // Initial map structures are parsed before eventGameInit.
                // Raise only limits required by this exact authored map now,
                // before native stats loading and the original object parser.
                const path = "/data/mp/stats/structure.json";
                const structures = JSON.parse(module.FS.readFile(path, {encoding:"utf8"}));
                Object.keys(limits).forEach(function (id) {
                    const stat = structures[id], limit = limits[id];
                    if (!stat || !Array.isArray(stat.userLimits) || !Number.isInteger(limit) || limit < stat.userLimits[1])
                        throw new Error("Invalid authored FFA structure limit.");
                    stat.userLimits = [stat.userLimits[0], limit, Math.max(stat.userLimits[2], limit)];
                });
                module.FS.writeFile(path, JSON.stringify(structures), {encoding:"utf8"});
            }
            ["/data/mp/multiplay/script/ffa-config.json",
             "/data/mp/multiplay/script/rules/ffa-config.json",
             "/data/mp/multiplay/skirmish/ffa-config.json"].forEach(function (path) {
                module.FS.writeFile(path, JSON.stringify(config), {encoding:"utf8"});
            });
            installed = true;
            module.ffaConfigInstalled = true;
        }
        if (originalMonitor) originalMonitor.call(module, left);
    };
}
