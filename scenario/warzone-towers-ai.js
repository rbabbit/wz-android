/* Survival army orders for Towers. Roster and spawn budgets come from the supplied mod. */
var towersAi_units = {};
var towersAi_orders = 0;
var towersAi_recoveries = 0;

function eventStartLevel()
{
	setTimer("towersAi_tick", 1000);
}

function towersAi_distance(a, b)
{
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function towersAi_targets()
{
	const targets = [];
	for (let player = 0; player < maxPlayers; player++)
	{
		if (player === me || allianceExistsBetween(me, player)) continue;
		enumStruct(player).forEach(function (s) { targets.push(s); });
	}
	return targets;
}

function towersAi_tick()
{
	const targets = towersAi_targets();
	const targetsById = {};
	targets.forEach(function (s) { targetsById[String(s.id)] = s; });
	const live = {};
	const units = enumDroid(me, DROID_ANY);
	for (const droid of units)
	{
		// Keep the supplied mod's empty-VTOL exit lane; vtol.js removes aircraft
		// at (1,1), so an exhausted plane cannot hold a wave open forever.
		if (droid.isVTOL && droid.weapons && droid.weapons[0] && droid.weapons[0].armed === 0)
		{
			if (droid.order !== DORDER_MOVE) orderDroidLoc(droid, DORDER_MOVE, 1, 1);
			continue;
		}
		const key = String(droid.id);
		const old = towersAi_units[key];
		const progress = !old || towersAi_distance(droid, old) >= 0.5;
		const record = old || { x: droid.x, y: droid.y, movedAt: gameTime, orderedAt: -10000, target: -1 };
		if (progress) { record.x = droid.x; record.y = droid.y; record.movedAt = gameTime; }
		live[key] = record;
		const firing = droid.action === 6 || droid.action === 36;
		const stuck = gameTime - record.movedAt >= 8000 && !firing;
		// Leave a valid moving/firing order alone. Avoid repeated reachability
		// scans and path resets when many waves and hundreds of towers are live.
		if (old && targetsById[String(record.target)] && (firing || (!stuck
			&& (droid.order === DORDER_ATTACK || droid.order === DORDER_OBSERVE)))) continue;

		// Prefer the command centre. Reachability excludes entrances disconnected
		// from a target by terrain; blocked roads are handled by attacking blockers.
		const reachable = targets.filter(function (s) { return droidCanReach(droid, s.x, s.y); });
		reachable.sort(function (a, b) {
			return (a.stattype === HQ ? 0 : 1) - (b.stattype === HQ ? 0 : 1)
				|| towersAi_distance(droid, a) - towersAi_distance(droid, b) || a.id - b.id;
		});
		let target = reachable[0];
		if (!target) continue;

		// An attack may legitimately be stationary while firing. Never restart
		// that action every tick. MOVE/SCOUT with no displacement must be retried.
		if (stuck)
		{
			const blockers = reachable.filter(function (s) { return towersAi_distance(droid, s) <= 12; });
			blockers.sort(function (a, b) { return towersAi_distance(droid, a) - towersAi_distance(droid, b) || a.id - b.id; });
			if (blockers.length) target = blockers[0];
		}
		if (!old || record.target !== target.id || (stuck && gameTime - record.orderedAt >= 4000)
			|| (droid.order !== DORDER_ATTACK && droid.order !== DORDER_OBSERVE))
		{
			const order = droid.droidType === DROID_SENSOR ? DORDER_OBSERVE : DORDER_ATTACK;
			if (orderDroidObj(droid, order, target))
			{
				record.target = target.id;
				record.orderedAt = gameTime;
				towersAi_orders++;
				if (stuck) towersAi_recoveries++;
			}
		}
	}
	towersAi_units = live;
	if (gameTime % 5000 < 1000)
	{
		dump("BNTOWERSAI:" + JSON.stringify({ gameTime: gameTime, units: units.length,
			orders: towersAi_orders, recoveries: towersAi_recoveries,
			hqs: targets.filter(function (s) { return s.stattype === HQ; }).map(function (s) {
				return { id: s.id, health: s.health, x: s.x, y: s.y };
			}), sample: units.slice(0, 8).map(function (d) {
				return { id: d.id, x: d.x, y: d.y, body: d.body, propulsion: d.propulsion, order: d.order, action: d.action,
					target: live[String(d.id)] ? live[String(d.id)].target : -1 };
			}) }));
	}
}
