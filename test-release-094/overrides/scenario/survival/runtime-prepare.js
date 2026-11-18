/* Called before native stats/scripts run, after this package finishes loading. */
function prepareSurvivalModule(module, config) {
    const previous = module.monitorRunDependencies;
    let installed = false;
    module.monitorRunDependencies = function(left) {
        if (!installed && left === 0 && module.FS
            && module.FS.analyzePath('/data/mp/tests/survival-config.json').exists) {
            if (module.calledRun) throw Error('Survival config arrived after native startup.');
            ['/data/mp/tests/survival-config.json', '/data/mp/multiplay/script/survival-config.json',
             '/data/mp/multiplay/script/rules/survival-config.json'].forEach(path => {
                module.FS.writeFile(path, JSON.stringify(config), {encoding:'utf8'});
            });
            installed = true;
            module.survivalConfigInstalled = true;
        }
        if (previous) previous.call(module, left);
    };
}
