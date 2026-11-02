receiveAllEvents(true);

var blockNightStarted = false;
var blockNightFinished = false;

function eventGameInit()
{
	hackNetOff();
	setAlliance(0, 1, false);
	setPower(0, 0);
	setPower(0, 1);
	setScrollLimits(8, 82, 56, 122);
	centreView(32, 103);
	queue("blockNightPrepare", 400);
}

function blockNightClearPlayer(player)
{
	for (const droid of enumDroid(player)) removeObject(droid, false);
	for (const structure of enumStruct(player)) removeObject(structure, false);
}

function blockNightPrepare()
{
	blockNightClearPlayer(0);
	blockNightClearPlayer(1);
	queue("blockNightSpawn", 700);
}

function blockNightSpawn()
{
	const components = ["Body5REC", "tracked01", "Cannon2A-TMk1",
	                    "CyborgLightBody", "CyborgLegs", "CyborgFlamer01"];
	for (let player = 0; player < 2; ++player)
	{
		for (const component of components) makeComponentAvailable(component, player);
	}

	for (let i = 0; i < 5; ++i)
	{
		const tank = addDroid(0, 25, 97 + i * 2, "Cobra Medium Cannon",
		                      "Body5REC", "tracked01", "", "", "Cannon2A-TMk1");
		if (tank) setDroidExperience(tank, 0);
	}

	for (let i = 0; i < 10; ++i)
	{
		const row = Math.floor(i / 2);
		const column = i % 2;
		const cyborg = addDroid(1, 28 + column, 97 + row * 2,
		                        "Flamer Cyborg", "CyborgLightBody", "CyborgLegs",
		                        "", "", "CyborgFlamer01");
		if (cyborg) setDroidExperience(cyborg, 0);
	}

	hackNetOn();
	blockNightStarted = true;
	console("BLOCK NIGHT - 5 Cobra Medium Cannon tanks vs 10 Flamer Cyborgs");
	setTimer("blockNightCheckResult", 500);
}

function blockNightNearest(source, targets)
{
	let nearest = null;
	let best = 999999999;
	for (const target of targets)
	{
		const dx = source.x - target.x;
		const dy = source.y - target.y;
		const distance = dx * dx + dy * dy;
		if (distance < best)
		{
			best = distance;
			nearest = target;
		}
	}
	return nearest;
}

function blockNightIssueOrders()
{
	if (!blockNightStarted || blockNightFinished) return;
	const tanks = enumDroid(0);
	const cyborgs = enumDroid(1);
	for (const tank of tanks)
	{
		const target = blockNightNearest(tank, cyborgs);
		if (target) orderDroidObj(tank, DORDER_ATTACK, target);
	}
	for (const cyborg of cyborgs)
	{
		const target = blockNightNearest(cyborg, tanks);
		if (target) orderDroidObj(cyborg, DORDER_ATTACK, target);
	}
}

function blockNightCheckResult()
{
	if (!blockNightStarted || blockNightFinished) return;
	const tanks = enumDroid(0).length;
	const cyborgs = enumDroid(1).length;
	if (tanks > 0 && cyborgs > 0) return;
	blockNightFinished = true;
	removeTimer("blockNightCheckResult");
	if (tanks > 0)
	{
		console("COBRA FIVE WIN - " + tanks + " tank(s) survived");
		gameOverMessage(true, false, false);
	}
	else if (cyborgs > 0)
	{
		console("FLAMER TEN WIN - " + cyborgs + " cyborg(s) survived");
		gameOverMessage(false, false, false);
	}
	else
	{
		console("MUTUAL DESTRUCTION");
		gameOverMessage(false, false, false);
	}
}
