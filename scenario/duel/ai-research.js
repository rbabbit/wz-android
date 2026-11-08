
/*
 * This file controls the AI's research choices.
 *
 */

(function(_global) {
////////////////////////////////////////////////////////////////////////////////////////////

var forcedResearch;

_global.setForcedResearch = function(list) {
	forcedResearch = list;
};

_global.needFastestResearch = function() {
	const ret = scopeRatings();

	if (ret.land === 0 && ret.sea === 0 && !iHaveVtol())
	{
		return PROPULSIONUSAGE.VTOL;
	}

	if (ret.land === 0 && ret.sea !== 0 && !iHaveHover() && !iHaveVtol())
	{
		return PROPULSIONUSAGE.HOVER;
	}

	return PROPULSIONUSAGE.GROUND;
};

function doResearch(lab)
{
    return pursueResearch(lab, duelResearchPlan(me));
}

_global.checkResearch = function() {
	enumIdleStructList(structures.labs).forEach(doResearch);
};

////////////////////////////////////////////////////////////////////////////////////////////
})(this);
