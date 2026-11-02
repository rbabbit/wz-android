/* The command centre is the tower-defence objective. */
namespace("warzoneTowersObjective_");
var warzoneTowersObjective_armed = false;
var warzoneTowersObjective_failed = false;

function warzoneTowersObjective_eventStartLevel()
{
	warzoneTowersObjective_armed = enumStruct(selectedPlayer, HQ).length > 0;
	setTimer("warzoneTowersObjective_tick", 500);
}

function warzoneTowersObjective_tick()
{
	const hqs = enumStruct(selectedPlayer, HQ);
	if (hqs.length) warzoneTowersObjective_armed = true;
	if (warzoneTowersObjective_armed && !hqs.length) warzoneTowersObjective_fail();
}

function warzoneTowersObjective_eventDestroyed(object)
{
	if (object.player === selectedPlayer && object.stattype === HQ
		&& warzoneTowersObjective_armed && !enumStruct(selectedPlayer, HQ).length)
	{
		warzoneTowersObjective_fail();
	}
}

function warzoneTowersObjective_fail()
{
	if (warzoneTowersObjective_failed) return;
	warzoneTowersObjective_failed = true;
	warzoneTowersWaves_phase = "defeated";
	warzoneTowersWaves_deadline = 0;
	warzoneTowersWaves_pulsesRemaining = 0;
	removeTimer("warzoneTowersWaves_tick");
	removeTimer("warzoneTowersObjective_tick");
	warzoneTowersWaves_emit(true);
	gameOverMessage(false);
}
