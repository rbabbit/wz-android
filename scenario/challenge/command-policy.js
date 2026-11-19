/* Challenge keeps stock component/factory rules, including VTOL. */
var ffaOriginalTickProduction = wtcmd_tickProduction;
wtcmd_tickProduction = function () {
    if (ffaOutcome) return;
    ffaOriginalTickProduction();
};
