include("tests/duel-policy.js");

/*
 * This file defines a standard AI personality for the base game.
 *
 * It relies on ruleset definition in /rulesets/ to provide
 * standard strategy descriptions and necessary game stat information.
 *
 * Then it passes control to the main code.
 */

// You can redefine these paths when you make a customized AI
// for a map or a challenge.
NB_PATH = "/multiplay/skirmish/";
NB_INCLUDES = NB_PATH + "nb_includes/";
NB_RULESETS = NB_PATH + "nb_rulesets/";
NB_COMMON = NB_PATH + "nb_common/";

// please don't touch this line
include(NB_INCLUDES + "_head.js");

////////////////////////////////////////////////////////////////////////////////////////////
// Start the actual personality definition

// the rules in which this personality plays
include(NB_RULESETS + "standard.js");
include(NB_COMMON + "standard_build_order.js");

// variables defining the personality
const subpersonalities = {DUEL:{
 chatalias:duelBranch(me)==="cannon"?"mc":"mr",
 weaponPaths:duelBranch(me)==="cannon"?[weaponStats.cannons]:[weaponStats.rockets_AT,weaponStats.rockets_AS,weaponStats.rockets_Arty],
 earlyResearch:duelResearchPlan(me),minTanks:1,becomeHarder:3,maxTanks:16,minTrucks:3,minHoverTrucks:4,maxSensors:1,
 minMiscTanks:1,maxMiscTanks:2,vtolness:0,defensiveness:65,maxPower:700,repairAt:50
}};
// this function describes the early build order
// you can rely on personality.chatalias for choosing different build orders for
// different subpersonalities
function buildOrder() {
	// Only use this build order in early game, on standard difficulty, in T1 no bases.
	// Otherwise, fall back to the safe build order.
	if (gameTime > 300000 ||
		difficulty === INSANE ||
		isStructureAvailable("A0ComDroidControl") ||
		baseType !== CAMP_CLEAN)
	{
		return buildOrder_StandardFallback();
	}

	if (personality.chatalias === "fc" || personality.chatalias === "fr")
	{
		if (buildMinimum(structures.labs, 1))
		{
			return true;
		}
		if (buildMinimum(structures.factories, 1))
		{
			return true;
		}
		if (buildMinimum(structures.labs, 2))
		{
			return true;
		}
		if (buildMinimum(structures.factories, 2))
		{
			return true;
		}
		if (buildMinimumDerricks(2))
		{
			return true;
		}
		if (buildMinimum(structures.hqs, 1))
		{
			return true;
		}
		if (buildMinimum(structures.gens, 2))
		{
			return true;
		}
	}
	else
	{
		if (buildMinimum(structures.factories, 2))
		{
			return true;
		}
		if (buildMinimumDerricks(1))
		{
			return true;
		}
		if (buildMinimum(structures.labs, 1))
		{
			return true;
		}
		if (buildMinimum(structures.hqs, 1))
		{
			return true;
		}
		if (buildMinimum(structures.factories, 3))
		{
			return true;
		}
		if (buildMinimum(structures.gens, 2))
		{
			return true;
		}
	}

	return captureSomeOil();
}



////////////////////////////////////////////////////////////////////////////////////////////
// Proceed with the main code

include(NB_INCLUDES + "_main.js");
