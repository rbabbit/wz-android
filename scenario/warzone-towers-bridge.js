/* Warzone Towers mobile research and camera bridge. Base rules are loaded by the wrapper. */

var blockNightV28Queues = {};
var blockNightV28ContinueAttempts = {};
var blockNightV28Responses = {};
var blockNightV28OriginalEventChat = eventChat;
var blockNightV28OriginalEventResearched = eventResearched;
var blockNightV31LastZoomNonce = "";
var blockNightV31ZoomDistances = { close: 1600, battle: 2600, map: 3600 };
var blockNightV32LastQueueNonce = "";
var warzoneTowersLastControlNonce = "";
var warzoneTowersLabResearch = {};

// The public scripting API exposes total research points and upgraded lab
// rates, but not currentPoints. Report a labelled estimate in simulation time;
// native topic/idle/completion state remains authoritative.
function warzoneTowersResearchProgress(lab, topic, assignment)
{
	if (!topic || topic.done || !assignment) return {};
	// Stats and Upgrades are keyed by display name, not the structure ID.
	const statName = Object.keys(Stats.Building).find(function (name) { return Stats.Building[name].Id === "A0ResearchFacility"; });
	const upgrade = Upgrades[selectedPlayer].Building[statName];
	if (!upgrade) return {};
	const rate = Number(upgrade.ResearchPoints || 0) + Number(upgrade.ModuleResearchPoints || 0) * Number(lab.modules || 0);
	if (!(rate > 0)) return {};
	if (typeof assignment.estimatePoints !== "number") assignment.estimatePoints = 0;
	if (typeof assignment.estimateTick !== "number") assignment.estimateTick = assignment.assignedAt;
	if (!assignment.estimatePaid && (playerPower(selectedPlayer) >= topic.power || queuedPower(selectedPlayer) === 0)) assignment.estimatePaid = true;
	if (assignment.estimatePaid) assignment.estimatePoints += Math.max(0, gameTime - assignment.estimateTick) * rate / 1000;
	assignment.estimateTick = gameTime;
	return {
		remainingSeconds: Math.max(0, Math.ceil((topic.points - assignment.estimatePoints) / rate)),
		estimatedProgress: Math.min(0.99, assignment.estimatePoints / Math.max(1, topic.points)),
		waitingPower: !assignment.estimatePaid,
		researchRate: rate
	};
}

// Override the original snapshot in the custom scenario, preserving the
// packaged engine and its research completion/queue events.
function blockNightEmitResearchSnapshotV23()
{
	const topics = blockNightV28AvailableResearch().map(function (topic, nativeIndex) {
		return { id: topic.id, name: topic.fullname, power: topic.power, points: topic.points,
			started: topic.started, done: topic.done, category: blockNightResearchCategory(topic), nativeIndex: nativeIndex };
	});
	const live = {};
	const labs = enumStruct(selectedPlayer, RESEARCH_LAB).filter(function (lab) { return lab.status === BUILT; }).reverse().map(function (lab, nativeIndex) {
		const key = String(lab.id);
		live[key] = true;
		let assignment = warzoneTowersLabResearch[key] || blockNightLabTopics[key] || null;
		const topic = assignment ? getResearch(assignment.topicId, selectedPlayer) : null;
		// An accepted network research order can temporarily report idle. Keep
		// its assignment until the topic completes; do not erase it after 2.5s.
		const active = Boolean(topic && !topic.done && assignment);
		const idle = !active && structureIdle(lab);
		if (topic && topic.done) { delete warzoneTowersLabResearch[key]; delete blockNightLabTopics[key]; assignment = null; }
		const result = { id: lab.id, nativeIndex: nativeIndex, idle: idle, modules: lab.modules, health: lab.health,
			topicId: topic && !topic.done ? topic.id : "", topicName: topic && !topic.done ? topic.fullname : "" };
		const progress = idle ? {} : warzoneTowersResearchProgress(lab, topic, assignment);
		Object.keys(progress).forEach(function (name) { result[name] = progress[name]; });
		return result;
	});
	Object.keys(warzoneTowersLabResearch).forEach(function (key) { if (!live[key]) delete warzoneTowersLabResearch[key]; });
	const payload = { version: 53, gameTime: gameTime, power: playerPower(selectedPlayer), topics: topics, labs: labs };
	// A one-second game clock keeps the countdown live even at constant power.
	const stable = JSON.stringify({ topics: topics, labs: labs, power: payload.power, tick: Math.floor(gameTime / 1000) });
	if (stable !== blockNightLastResearchSnapshot) { blockNightLastResearchSnapshot = stable; dump("BNTECH:" + JSON.stringify(payload)); }
}

function warzoneTowersDiagnosticSnapshot()
{
    dump("BNTOWERS:" + JSON.stringify({ version:2, mode:"tower-defense", gameTime:gameTime,
        enemyPlayer:scavAI, enemyDroids:enumDroid(scavAI, DROID_ANY).length,
        humanPower:playerPower(selectedPlayer), enemyPower:playerPower(scavAI),
        entrances:Spawner.locations.length, queuedEnemies:Spawner.queue.length,
        totalRounds:totalRounds, wave:warzoneTowersWaves_state.wave,
        rewardCount:warzoneTowersWaves_state.rewardCount, rewardPower:warzoneTowersWaves_state.rewardPower,
        configCheck:warzoneTowersWaves_configCheck }));
}

function blockNightV31PollZoomCommand()
{
	let command = null;
	try
	{
		command = includeJSON("blocknight-zoom-command.json");
	}
	catch (error)
	{
		return;
	}
	if (!command || typeof command.nonce !== "string" || !command.nonce || command.nonce === blockNightV31LastZoomNonce) return;

	blockNightV31LastZoomNonce = command.nonce;
	const preset = String(command.preset || "");
	const distance = Number(blockNightV31ZoomDistances[preset] || 0);
	if (distance > 0) cameraZoom(distance, 0);
	if (preset === "base")
	{
		const hqs = enumStruct(selectedPlayer, HQ);
		if (hqs.length) centreView(hqs[0].x, hqs[0].y);
	}
	dump("BNZOOM:" + JSON.stringify({
		version: 31,
		nonce: command.nonce,
		preset: preset,
		distance: distance,
		gameTime: gameTime
	}));
}

function warzoneTowersPollControlCommand()
{
	let command;
	try { command = includeJSON("warzone-towers-control-command.json"); }
	catch (error) { return; }
	if (!command || !command.nonce || typeof command.nonce !== "string"
		|| command.nonce === warzoneTowersLastControlNonce) return;
	warzoneTowersLastControlNonce = command.nonce;
	if (command.action !== "stop-selected") return;
	const stopped = [];
	// Only the user's explicit STOP command acts on their currently selected
	// units. Run before the wrapper releases the native quick-build modifier.
	let units = enumSelected().filter(function (object) {
		return object.type === DROID && object.player === selectedPlayer;
	});
	if (!units.length && typeof wtcmd_activeAutoWorkers === "function") units = wtcmd_activeAutoWorkers();
	if (typeof wtcmd_stopWorkers === "function") wtcmd_stopWorkers(units.map(function (unit) { return unit.id; }));
	for (let index = 0; index < units.length; ++index)
	{
		if (orderDroid(units[index], DORDER_STOP)) stopped.push(units[index].id);
	}
	dump("BNCONTROL:" + JSON.stringify({ version: 1, nonce: command.nonce,
		action: command.action, stopped: stopped, gameTime: gameTime }));
}

function blockNightV32PollQueueCommand()
{
	let command = null;
	try
	{
		command = includeJSON("blocknight-queue-command.json");
	}
	catch (error)
	{
		return;
	}
	if (!command || typeof command.nonce !== "string" || !command.nonce || command.nonce === blockNightV32LastQueueNonce) return;
	blockNightV32LastQueueNonce = command.nonce;

	if (blockNightV28Responses[command.nonce])
	{
		dump("BNQUEUE:" + JSON.stringify(blockNightV28Responses[command.nonce]));
		return;
	}
	if (!Array.isArray(command.labs) || command.labs.length < 1 || command.labs.length > 16)
	{
		blockNightV28EmitQueueState(command.nonce, false, "invalid", []);
		return;
	}

	const available = blockNightV28AvailableResearch();
	const availableById = {};
	for (let availableIndex = 0; availableIndex < available.length; ++availableIndex)
	{
		availableById[String(available[availableIndex].id)] = available[availableIndex];
	}
	const prepared = [];
	const seenLabs = {};
	const seenTopics = {};
	for (let commandIndex = 0; commandIndex < command.labs.length; ++commandIndex)
	{
		const requested = command.labs[commandIndex];
		const labId = Number(requested && requested.labId);
		const lab = Number.isFinite(labId) ? getObject(STRUCTURE, selectedPlayer, labId) : null;
		if (!lab || lab.player !== selectedPlayer || lab.stattype !== RESEARCH_LAB || lab.status !== BUILT || seenLabs[String(labId)])
		{
			blockNightV28EmitQueueState(command.nonce, false, "lab-missing", []);
			return;
		}
		if (!Array.isArray(requested.topicIds) || requested.topicIds.length > 64)
		{
			blockNightV28EmitQueueState(command.nonce, false, "invalid", []);
			return;
		}
		seenLabs[String(labId)] = true;
		const topicIds = [];
		for (let topicIndex = 0; topicIndex < requested.topicIds.length; ++topicIndex)
		{
			const topicId = String(requested.topicIds[topicIndex]);
			if (!availableById[topicId] || seenTopics[topicId])
			{
				blockNightV28EmitQueueState(command.nonce, false, "topic-unavailable", []);
				return;
			}
			seenTopics[topicId] = true;
			topicIds.push(topicId);
		}
		prepared.push({ labId: labId, topicIds: topicIds });
	}

	const labsToStart = [];
	for (let preparedIndex = 0; preparedIndex < prepared.length; ++preparedIndex)
	{
		const entry = prepared[preparedIndex];
		blockNightV28Queues[String(entry.labId)] = entry.topicIds.slice();
		labsToStart.push(entry.labId);
	}
	const started = [];
	for (let labIndex = 0; labIndex < labsToStart.length; ++labIndex)
	{
		const assignment = blockNightV28StartNext(labsToStart[labIndex]);
		if (assignment) started.push(assignment);
	}
	if (typeof blockNightLastResearchSnapshot === "string") blockNightLastResearchSnapshot = "";
	if (typeof blockNightEmitResearchSnapshotV23 === "function") queue("blockNightEmitResearchSnapshotV23", 80);
	blockNightV28EmitQueueState(command.nonce, true, "synced", started);
}

function blockNightV32PollBridgeCommands()
{
	if (typeof wtcmd_poll === "function") wtcmd_poll();
	warzoneTowersPollControlCommand();
	blockNightV31PollZoomCommand();
	blockNightV32PollQueueCommand();
}

function blockNightV28AvailableResearch()
{
	return enumResearch().sort(function (a, b) {
		const rankA = typeof blockNightResearchRank === "function" ? blockNightResearchRank(a) : -1;
		const rankB = typeof blockNightResearchRank === "function" ? blockNightResearchRank(b) : -1;
		const rankDelta = rankA - rankB;
		return rankDelta !== 0 ? rankDelta : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
	});
}

function blockNightV28QueuePayload()
{
	const queues = [];
	Object.keys(blockNightV28Queues).forEach(function (key) {
		queues.push({ labId: Number(key), topicIds: blockNightV28Queues[key].slice() });
	});
	return queues;
}

function blockNightV28EmitQueueState(nonce, ok, reason, started)
{
	const payload = {
		version: 32,
		nonce: nonce || "",
		ok: ok !== false,
		reason: reason || "synced",
		started: started || [],
		queues: blockNightV28QueuePayload(),
		gameTime: gameTime
	};
	if (payload.nonce) blockNightV28Responses[payload.nonce] = payload;
	dump("BNQUEUE:" + JSON.stringify(payload));
}

function blockNightV28StartNext(labId)
{
	const key = String(labId);
	const queued = blockNightV28Queues[key] || [];
	const lab = getObject(STRUCTURE, selectedPlayer, Number(labId));
	if (!lab || lab.player !== selectedPlayer || lab.stattype !== RESEARCH_LAB || lab.status !== BUILT)
	{
		delete blockNightV28Queues[key];
		return null;
	}
	if (!structureIdle(lab)) return null;
	const current = warzoneTowersLabResearch[key];
	if (current && !getResearch(current.topicId, selectedPlayer).done) return null;

	while (queued.length)
	{
		const topicId = queued[0];
		const topic = getResearch(topicId, selectedPlayer);
		if (!topic || topic.done || topic.started)
		{
			queued.shift();
			continue;
		}
		if (pursueResearch(lab, topicId))
		{
			queued.shift();
			if (typeof blockNightLabTopics === "object")
			{
				blockNightLabTopics[key] = { topicId: topicId, assignedAt: gameTime, estimatePaid: playerPower(selectedPlayer) >= topic.power };
				warzoneTowersLabResearch[key] = blockNightLabTopics[key];
			}
			return { labId: lab.id, topicId: topicId };
		}
		return null;
	}
	return null;
}

function blockNightV28ContinueQueue(lab)
{
	if (!lab || typeof lab.id !== "number") return;
	const labId = lab.id;
	const key = String(labId);
	const started = blockNightV28StartNext(labId);
	const remaining = blockNightV28Queues[key] || [];
	const attempt = Number(blockNightV28ContinueAttempts[key] || 0);
	if (!started && remaining.length && attempt < 12)
	{
		blockNightV28ContinueAttempts[key] = attempt + 1;
		queue("blockNightV28ContinueQueue", 300, lab);
		return;
	}
	delete blockNightV28ContinueAttempts[key];
	if (typeof blockNightLastResearchSnapshot === "string") blockNightLastResearchSnapshot = "";
	if (typeof blockNightEmitResearchSnapshotV23 === "function") queue("blockNightEmitResearchSnapshotV23", 80);
	blockNightV28EmitQueueState("", true, started ? "continued" : remaining.length ? "waiting" : "idle", started ? [started] : []);
}

function blockNightV28HandleQueueCommand(from, message)
{
	if (typeof message !== "string" || !/^q[0-9]+ /.test(message)) return false;
	const parts = message.trim().split(/\s+/);
	const nonce = parts.length ? parts[0].slice(1) : "";
	if (from !== selectedPlayer || parts.length !== 2)
	{
		blockNightV28EmitQueueState(nonce, false, from !== selectedPlayer ? "wrong-player" : "invalid", []);
		return true;
	}
	if (blockNightV28Responses[nonce])
	{
		dump("BNQUEUE:" + JSON.stringify(blockNightV28Responses[nonce]));
		return true;
	}

	const available = blockNightV28AvailableResearch();
	const sections = parts[1].split(";");
	const labs = enumStruct(selectedPlayer, RESEARCH_LAB).filter(function (lab) {
		return lab.status === BUILT;
	}).reverse();
	const labsToStart = [];
	for (let sectionIndex = 0; sectionIndex < sections.length; ++sectionIndex)
	{
		const fields = sections[sectionIndex].split(",");
		if (fields.length < 2) continue;
		const lab = labs[Number(fields[0])];
		if (!lab || lab.player !== from || lab.stattype !== RESEARCH_LAB || lab.status !== BUILT) continue;
		const labId = lab.id;
		const topicIds = [];
		if (fields[1] !== "-")
		{
			for (let indexPosition = 1; indexPosition < fields.length; ++indexPosition)
			{
				const topic = available[Number(fields[indexPosition])];
				if (topic && topicIds.indexOf(topic.id) < 0) topicIds.push(topic.id);
			}
		}
		blockNightV28Queues[String(labId)] = topicIds;
		labsToStart.push(labId);
	}

	const started = [];
	for (let labIndex = 0; labIndex < labsToStart.length; ++labIndex)
	{
		const assignment = blockNightV28StartNext(labsToStart[labIndex]);
		if (assignment) started.push(assignment);
	}
	if (typeof blockNightLastResearchSnapshot === "string") blockNightLastResearchSnapshot = "";
	if (typeof blockNightEmitResearchSnapshotV23 === "function") queue("blockNightEmitResearchSnapshotV23", 80);
	blockNightV28EmitQueueState(nonce, true, "synced", started);
	return true;
}

eventChat = function (from, to, message)
{
	if (blockNightV28HandleQueueCommand(from, message)) return;
	blockNightV28OriginalEventChat(from, to, message);
};

eventResearched = function (research, structure, player)
{
	if (player === selectedPlayer && structure) delete warzoneTowersLabResearch[String(structure.id)];
	blockNightV28OriginalEventResearched(research, structure, player);
	if (gameTime > 1000 && player === selectedPlayer && structure)
	{
		blockNightV28ContinueAttempts[String(structure.id)] = 0;
		queue("blockNightV28ContinueQueue", 300, structure);
	}
};

setTimer("blockNightV32PollBridgeCommands", 120);
setTimer("warzoneTowersDiagnosticSnapshot", 5000);
