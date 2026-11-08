/* Wrapper-only setup, called while constructing the official Module config. */
function prepareDuelModule(module, config) {
    module.preRun.push(function (m) {
        m.FS.mkdirTree("/data/mp/multiplay/maps/duel-ro-half");
        m.FS.mkdirTree("/data/mp/multiplay/script");
    });
    const originalMonitor = module.monitorRunDependencies;
    let installed = false;
    module.monitorRunDependencies = function (left) {
        // The frozen runtime does not call onRuntimeInitialized. Its monitor
        // executes synchronously before dependenciesFulfilled invokes main.
        if (!installed && left === 0 && module.FS
            && module.FS.analyzePath("/data/mp/multiplay/script/duel-config.json").exists) {
            if (module.calledRun) throw new Error("Duel config arrived after native startup");
            ["/data/mp/multiplay/script/duel-config.json",
             "/data/mp/multiplay/script/rules/duel-config.json",
             "/data/mp/multiplay/skirmish/duel-config.json"].forEach(function (path) {
                module.FS.writeFile(path, JSON.stringify(config), {encoding:"utf8"});
            });
            installed = true;
            module.duelConfigInstalled = true;
        }
        if (originalMonitor) originalMonitor.call(module, left);
    };
}
