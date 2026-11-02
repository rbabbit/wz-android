/* Numbered tower-defence rounds built from the supplied Survival Mod. */
namespace("warzoneTowersWaves_");

// spawn.js is loaded immediately before this wrapper. Replace only its start
// event so the supplied continuous timer is never installed. The original
// spawn_tick() and every calculation it uses remain untouched and are called
// below as the four pulses that make up each numbered wave.
function spawn_eventStartLevel()
{
}

const warzoneTowersWaves_FIRST_PREP_MS = 4 * 60 * 1000;
const warzoneTowersWaves_INTERMISSION_MS = 20 * 1000;
// Survival Mod intentionally fills one quarter of the missing power per tick.
// Four compressed ticks form one discrete wave without inventing a new roster
// or a second balance model.
const warzoneTowersWaves_PULSES = 4;
const warzoneTowersWaves_PULSE_MS = 1000;

var warzoneTowersWaves_phase = "build";
var warzoneTowersWaves_wave = 0;
var warzoneTowersWaves_deadline = 0;
var warzoneTowersWaves_pulsesRemaining = 0;
var warzoneTowersWaves_nextPulse = 0;
var warzoneTowersWaves_lastSignature = "";
var warzoneTowersWaves_lastCommand = "";
var warzoneTowersWaves_carriedIds = {};
var warzoneTowersWaves_frontierTime = 0;

function warzoneTowersWaves_eventStartLevel()
{
	// The wave controller replaces the continuous Survival timer. The supplied
	// roster, entrances and power calculations still produce each wave.
	queue("warzoneTowersWaves_start", 200);
}

function warzoneTowersWaves_start()
{
	setTimer("warzoneTowersWaves_tick", 1000);
	// Preparation runs from the start of the match, never from the first
	// completed defence or vehicle. Doing nothing must not stop the waves.
	warzoneTowersWaves_beginCountdown(warzoneTowersWaves_FIRST_PREP_MS);
}

function warzoneTowersWaves_beginCountdown(delay)
{
	warzoneTowersWaves_phase = "countdown";
	warzoneTowersWaves_deadline = gameTime + delay;
	warzoneTowersWaves_pulsesRemaining = 0;
	warzoneTowersWaves_nextPulse = 0;
	warzoneTowersWaves_emit(true);
}

function warzoneTowersWaves_beginWave()
{
	warzoneTowersWaves_carriedIds = {};
	enumDroid(ENEMY, DROID_ANY).forEach(function (d) { warzoneTowersWaves_carriedIds[String(d.id)] = true; });
	warzoneTowersWaves_wave += 1;
	// Supplied templates are indexed by research-minutes. Each numbered round
	// advances that existing roster one minute; completed player research can
	// still lead it. Do not grant research to the player or replace the roster.
	const baseline = typeof research_offset === "number" ? research_offset : 0;
	warzoneTowersWaves_frontierTime = Math.max(Number(LATEST_RESEARCH.minimumResearchTime) || 0,
		baseline + (warzoneTowersWaves_wave - 1) * 60);
	if (typeof research_completeOnTime === "function") research_completeOnTime(warzoneTowersWaves_frontierTime, ENEMY);
	warzoneTowersWaves_phase = "active";
	warzoneTowersWaves_deadline = 0;
	warzoneTowersWaves_pulsesRemaining += warzoneTowersWaves_PULSES;
	warzoneTowersWaves_nextPulse = gameTime;
	warzoneTowersWaves_spawnPulse();
}

function warzoneTowersWaves_spawnPulse()
{
	if (warzoneTowersWaves_pulsesRemaining <= 0) return;
	// Surviving enemies stay when the player calls the next wave early. They
	// must not consume the NEW wave's spawn budget or skipping spawns nothing.
	const suppliedPowerEnemy = spawn_getPowerEnemy;
	const suppliedPowerTeam = spawn_getPowerTeam;
	const suppliedResearch = LATEST_RESEARCH;
	LATEST_RESEARCH = { id: suppliedResearch.id, minimumResearchTime: warzoneTowersWaves_frontierTime, gameTime: gameTime };
	spawn_getPowerEnemy = function () {
		let carriedPower = 0;
		enumDroid(ENEMY, DROID_ANY).forEach(function (d) {
			if (warzoneTowersWaves_carriedIds[String(d.id)]) carriedPower += Math.max(spawn_MIN_COST, d.cost);
		});
		return Math.max(0, suppliedPowerEnemy() - carriedPower);
	};
	// The original adaptive spawner divides current power by its best power.
	// An unarmed player otherwise produces 0/0 and no enemy budget. Supply a
	// small opening threat only in that case; keep the supplied roster/spawner.
	spawn_getPowerTeam = function () {
		const power = suppliedPowerTeam();
		return power > 0 ? power : spawn_MIN_COST * 4;
	};
	try { spawn_tick(); } finally {
		spawn_getPowerEnemy = suppliedPowerEnemy;
		spawn_getPowerTeam = suppliedPowerTeam;
		LATEST_RESEARCH = suppliedResearch;
	}
	warzoneTowersWaves_pulsesRemaining -= 1;
	warzoneTowersWaves_nextPulse = gameTime + warzoneTowersWaves_PULSE_MS;
	warzoneTowersWaves_emit(true);
}

function warzoneTowersWaves_tick()
{
	warzoneTowersWaves_pollCommand();
	const enemyDroids = enumDroid(ENEMY, DROID_ANY).length;

	if (warzoneTowersWaves_phase === "countdown")
	{
		if (gameTime >= warzoneTowersWaves_deadline)
		{
			warzoneTowersWaves_beginWave();
		}
	}
	else if (warzoneTowersWaves_phase === "active")
	{
		if (warzoneTowersWaves_pulsesRemaining > 0 && gameTime >= warzoneTowersWaves_nextPulse)
		{
			warzoneTowersWaves_spawnPulse();
		}
		else if (warzoneTowersWaves_pulsesRemaining === 0 && enemyDroids === 0)
		{
			warzoneTowersWaves_beginCountdown(warzoneTowersWaves_INTERMISSION_MS);
		}
	}

	warzoneTowersWaves_emit(false);
}

function warzoneTowersWaves_pollCommand()
{
	const command = includeJSON("warzone-towers-wave-command.json");
	if (!command || typeof command.nonce !== "string" || !command.nonce
		|| command.nonce === warzoneTowersWaves_lastCommand) return;
	warzoneTowersWaves_lastCommand = command.nonce;
	if (command.action === "next" && (warzoneTowersWaves_phase === "countdown" || warzoneTowersWaves_phase === "active"))
	{
		warzoneTowersWaves_beginWave();
	}
}

function warzoneTowersWaves_emit(force)
{
	const enemyDroids = enumDroid(ENEMY, DROID_ANY).length;
	const nextWaveIn = warzoneTowersWaves_phase === "countdown"
		? Math.max(0, Math.ceil((warzoneTowersWaves_deadline - gameTime) / 1000))
		: null;
	const payload = {
		version: 2,
		lastCommand: warzoneTowersWaves_lastCommand,
		mode: "numbered-waves",
		phase: warzoneTowersWaves_phase,
		wave: warzoneTowersWaves_wave,
		nextWave: warzoneTowersWaves_wave + 1,
		nextWaveIn: nextWaveIn,
		pulsesRemaining: warzoneTowersWaves_pulsesRemaining,
		pulsesPerWave: warzoneTowersWaves_PULSES,
		enemyDroids: enemyDroids,
		humanPower: spawn_getPowerTeam(),
		enemyPower: spawn_getPowerEnemy(),
		entrances: ENTRANCES.length,
		templates: TEMPLATES.length,
		rosterFrontier: Math.min(TEMPLATES.length, Math.max(1, Math.floor(warzoneTowersWaves_frontierTime / 60))),
		gameTime: gameTime
	};
	const signature = JSON.stringify(payload);
	if (force || signature !== warzoneTowersWaves_lastSignature)
	{
		warzoneTowersWaves_lastSignature = signature;
		dump("BNWAVE:" + signature);
	}
}
