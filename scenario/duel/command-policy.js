/* Guard every route, including old phone templates and jobs restored from saves. */
var duelOriginalPartAvailable = wtcmd_partAvailable;
wtcmd_partAvailable = function (id) { return duelPartAllowed(id, selectedPlayer) && duelOriginalPartAvailable(id); };
var duelOriginalValidateDesign = wtcmd_validateDesign;
wtcmd_validateDesign = function (request, requireHQ) {
    if (!duelDesignAllowed(request, selectedPlayer)) return {error:"components-unavailable"};
    return duelOriginalValidateDesign(request, requireHQ);
};
var duelOriginalTemplateAvailable = wtcmd_templateAvailable;
wtcmd_templateAvailable = function (template) {
    return duelDesignAllowed(wtcmd_templateParts(template), selectedPlayer) && duelOriginalTemplateAvailable(template);
};
var duelOriginalTickProduction = wtcmd_tickProduction;
wtcmd_tickProduction = function () {
    Object.keys(wtcmd_production).forEach(function (key) {
        wtcmd_production[key].forEach(function (job) {
            if (!duelDesignAllowed(job.design, selectedPlayer)) { job.status = "blocked"; job.reason = "components-unavailable"; }
        });
    });
    if (duelPhase !== "active") return;
    duelOriginalTickProduction();
};
var duelOriginalFactoryAllows = wtcmd_factoryAllows;
wtcmd_factoryAllows = function (design, factory) {
    return duelDesignAllowed(design, selectedPlayer) && factory.stattype !== VTOL_FACTORY && duelOriginalFactoryAllows(design, factory);
};
