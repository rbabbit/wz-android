/* FFA-only wrapper setup, before the unchanged native program starts. */
function prepareFfaModule(module, config) {
    module.preRun.push(function (m) {
        m.FS.mkdirTree("/data/mp/multiplay/maps/ffa-emag");
        m.FS.mkdirTree("/data/mp/multiplay/script");
    });
    const originalMonitor = module.monitorRunDependencies;
    let installed = false;
    module.monitorRunDependencies = function (left) {
        if (!installed && left === 0 && module.FS
            && module.FS.analyzePath("/data/mp/multiplay/script/ffa-config.json").exists) {
            if (module.calledRun) throw new Error("FFA config arrived after native startup");
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
