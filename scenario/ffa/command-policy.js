/* Guard phone designs and old queued entries only inside the FFA VFS. */
var ffaOriginalPartAvailable = wtcmd_partAvailable;
wtcmd_partAvailable = function (id) { return ffaPartAllowed(id) && ffaOriginalPartAvailable(id); };
var ffaOriginalValidateDesign = wtcmd_validateDesign;
wtcmd_validateDesign = function (request, requireHQ) {
    if (!ffaDesignAllowed(request)) return {error:"components-unavailable"};
    return ffaOriginalValidateDesign(request, requireHQ);
};
var ffaOriginalTemplateAvailable = wtcmd_templateAvailable;
wtcmd_templateAvailable = function (template) {
    return ffaDesignAllowed(wtcmd_templateParts(template)) && ffaOriginalTemplateAvailable(template);
};
var ffaOriginalTickProduction = wtcmd_tickProduction;
wtcmd_tickProduction = function () {
    Object.keys(wtcmd_production).forEach(function (key) {
        wtcmd_production[key].forEach(function (job) {
            if (!ffaDesignAllowed(job.design)) { job.status = "blocked"; job.reason = "components-unavailable"; }
        });
    });
    if (ffaOutcome) return;
    ffaOriginalTickProduction();
};
var ffaOriginalFactoryAllows = wtcmd_factoryAllows;
wtcmd_factoryAllows = function (design, factory) {
    return ffaDesignAllowed(design) && factory.stattype !== VTOL_FACTORY && ffaOriginalFactoryAllows(design, factory);
};
