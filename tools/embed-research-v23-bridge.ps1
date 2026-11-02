param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$javaScript = [IO.File]::ReadAllText($javaScriptPath)
$originalSize = (Get-Item -LiteralPath $dataPath).Length

function Read-PackageText([string]$virtualPath) {
	$pattern = '\{filename:"' + [regex]::Escape($virtualPath) + '",start:(?<start>\d+),end:(?<end>\d+)\}'
	$match = [regex]::Match($script:javaScript, $pattern)
	if (-not $match.Success) { throw "Could not locate package entry: $virtualPath" }
	$start = [long]$match.Groups['start'].Value
	$end = [long]$match.Groups['end'].Value
	$bytes = New-Object byte[] ([int]($end - $start))
	$stream = [IO.File]::OpenRead($script:dataPath)
	try {
		$stream.Position = $start
		$read = $stream.Read($bytes, 0, $bytes.Length)
		if ($read -ne $bytes.Length) { throw "Could not read complete package entry: $virtualPath" }
	} finally { $stream.Dispose() }
	return [Text.Encoding]::UTF8.GetString($bytes)
}

function Redirect-PackageText([string]$virtualPath, [string]$content) {
	$bytes = [Text.Encoding]::UTF8.GetBytes($content)
	$start = (Get-Item -LiteralPath $script:dataPath).Length
	$stream = [IO.File]::Open($script:dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
	try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
	$end = $start + $bytes.Length
	$pattern = '\{filename:"' + [regex]::Escape($virtualPath) + '",start:\d+,end:\d+\}'
	$replacement = '{filename:"' + $virtualPath + '",start:' + $start + ',end:' + $end + '}'
	$script:javaScript = [regex]::Replace($script:javaScript, $pattern, $replacement, 1)
}

$researchPath = '/data/mp/multiplay/script/rules/events/research.js'
$gameInitPath = '/data/mp/multiplay/script/rules/events/gameinit.js'
$chatPath = '/data/mp/multiplay/script/rules/events/chat.js'
$researchJsonPath = '/data/mp/stats/research.json'
$research = Read-PackageText $researchPath
$gameInit = Read-PackageText $gameInitPath
$chat = Read-PackageText $chatPath

$v23Marker = 'BLOCK NIGHT MOBILE TECH BRIDGE V23'
if ($research.Contains($v23Marker) -and $gameInit.Contains($v23Marker) -and $chat.Contains($v23Marker)) {
    $brokenComparator = 'return rankDelta !== 0 ? rankDelta : a.id.localeCompare(b.id);'
    $fixedComparator = 'return rankDelta !== 0 ? rankDelta : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));'
    $repairedResearch = $research.Replace($brokenComparator, $fixedComparator)
    $repairedGameInit = $gameInit.Replace($brokenComparator, $fixedComparator)
    if ($repairedResearch -eq $research -and $repairedGameInit -eq $gameInit) {
        Write-Output 'Block Night v2.3 research bridge comparator is already compatible with QuickJS.'
        exit 0
    }
    Redirect-PackageText $researchPath $repairedResearch
    Redirect-PackageText $gameInitPath $repairedGameInit
    $currentSize = (Get-Item -LiteralPath $dataPath).Length
    $sizeToken = 'remote_package_size:' + $originalSize
    if (-not $javaScript.Contains($sizeToken)) { throw "Could not find package size token: $sizeToken" }
    $javaScript = $javaScript.Replace($sizeToken, 'remote_package_size:' + $currentSize)
    $cacheId = 'package_uuid:"blocknight-warzone-4.7.0-mobile-tech-engine-v25-' + $currentSize + '"'
    $javaScript = [regex]::Replace($javaScript, 'package_uuid:"[^"]+"', $cacheId, 1)
    [IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
    Write-Output "Repaired the Block Night research comparator for QuickJS: $originalSize -> $currentSize bytes."
    exit 0
}

$iconRanks = [ordered]@{
	IMAGE_ROCKET = 0; IMAGE_CANNON = 1; IMAGE_HOVERCRAFT = 2; IMAGE_ECM = 3
	IMAGE_PLASCRETE = 4; IMAGE_TRACKS = 5; IMAGE_RES_DROIDTECH = 6
	IMAGE_RES_WEAPONTECH = 7; IMAGE_RES_COMPUTERTECH = 8; IMAGE_RES_POWERTECH = 9
	IMAGE_RES_SYSTEMTECH = 10; IMAGE_RES_STRUCTURETECH = 11; IMAGE_RES_CYBORGTECH = 12
	IMAGE_RES_DEFENCE = 13; IMAGE_RES_QUESTIONMARK = 14; IMAGE_RES_GRPACC = 15
	IMAGE_RES_GRPUPG = 16; IMAGE_RES_GRPREP = 17; IMAGE_RES_GRPROF = 18
	IMAGE_RES_GRPDAM = 19
}
$rawResearch = (Read-PackageText $researchJsonPath) | ConvertFrom-Json -AsHashtable
$researchMeta = [ordered]@{}
foreach ($entry in $rawResearch.GetEnumerator()) {
	$iconName = [string]$entry.Value.iconID
	$rank = if ($iconRanks.Contains($iconName)) { [int]$iconRanks[$iconName] } else { -1 }
	$researchMeta[$entry.Key] = [ordered]@{
		r = $rank
		c = [string]$entry.Value.category
	}
}
$metaJson = $researchMeta | ConvertTo-Json -Compress -Depth 4

$snapshot = @'
/* BLOCK NIGHT MOBILE TECH BRIDGE V23 */
var blockNightResearchMeta = __BLOCKNIGHT_RESEARCH_META__;
var blockNightLastResearchSnapshot = "";

function blockNightResearchCategory(topic)
{
	const meta = blockNightResearchMeta[topic.id];
	return meta && meta.c ? meta.c : "";
}

function blockNightResearchRank(topic)
{
	const meta = blockNightResearchMeta[topic.id];
	return meta ? meta.r : -1;
}

function blockNightEmitResearchSnapshotV23()
{
	const topics = enumResearch().sort(function (a, b) {
		const rankDelta = blockNightResearchRank(a) - blockNightResearchRank(b);
		return rankDelta !== 0 ? rankDelta : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
	}).map(function (research, nativeIndex) {
		return {
			id: research.id,
			name: research.fullname,
			power: research.power,
			points: research.points,
			started: research.started,
			done: research.done,
			category: blockNightResearchCategory(research),
			nativeIndex: nativeIndex
		};
	});

	const liveLabIds = {};
	const labs = enumStruct(selectedPlayer, RESEARCH_LAB).filter(function (lab) {
		return lab.status === BUILT;
	}).reverse().map(function (lab, nativeIndex) {
		const key = String(lab.id);
		liveLabIds[key] = true;
		let assignment = blockNightLabTopics[key] || null;
		const idle = structureIdle(lab);
		if (idle && assignment && gameTime - assignment.assignedAt > 2500)
		{
			delete blockNightLabTopics[key];
			assignment = null;
		}
		const topic = assignment ? getResearch(assignment.topicId, selectedPlayer) : null;
		return {
			id: lab.id,
			nativeIndex: nativeIndex,
			idle: idle,
			modules: lab.modules,
			health: lab.health,
			topicId: topic && !topic.done ? topic.id : "",
			topicName: topic && !topic.done ? topic.fullname : ""
		};
	});

	Object.keys(blockNightLabTopics).forEach(function (key) {
		if (!liveLabIds[key]) delete blockNightLabTopics[key];
	});

	const stablePayload = JSON.stringify({ topics: topics, labs: labs, power: playerPower(selectedPlayer) });
	if (stablePayload !== blockNightLastResearchSnapshot)
	{
		blockNightLastResearchSnapshot = stablePayload;
		dump("BNTECH:" + JSON.stringify({
			version: 23,
			gameTime: gameTime,
			power: playerPower(selectedPlayer),
			topics: topics,
			labs: labs
		}));
	}
}
'@
$snapshot = $snapshot.Replace('__BLOCKNIGHT_RESEARCH_META__', $metaJson)

$research = @'
/* BLOCK NIGHT MOBILE TECH BRIDGE V23 */
function eventResearched(research, structure, player)
{
	if (gameTime > 1000 && player === selectedPlayer)
	{
		if (structure) delete blockNightLabTopics[String(structure.id)];
		dump("BNTECHDONE:" + JSON.stringify({
			version: 23,
			id: research.id,
			name: research.fullname,
			player: player,
			labId: structure ? structure.id : null,
			gameTime: gameTime
		}));
		blockNightLastResearchSnapshot = "";
		queue("blockNightEmitResearchSnapshotV23", 50);
	}
}
'@
$research += "`n" + $snapshot

$gameInitMarker = $gameInit.IndexOf("`n`t// BLOCK NIGHT MOBILE TECH BRIDGE")
if ($gameInitMarker -lt 0) { throw 'Could not locate the game-init mobile bridge marker.' }
$gameInit = $gameInit.Substring(0, $gameInitMarker) + @'

	// BLOCK NIGHT MOBILE TECH BRIDGE V23
	queue("blockNightEmitResearchSnapshotV23", 1200);
	setTimer("blockNightEmitResearchSnapshotV23", 1000);
}
'@
$gameInit += "`n" + $snapshot

$chatHandler = @'

/* BLOCK NIGHT MOBILE TECH BRIDGE V23 */
var blockNightLabTopics = {};

function blockNightResearchCommandAck(nonce, ok, reason, labId, topicId)
{
	dump("BNTECHACK:" + JSON.stringify({
		version: 23,
		nonce: nonce,
		ok: ok,
		reason: reason,
		labId: labId,
		topicId: topicId,
		gameTime: gameTime
	}));
	blockNightLastResearchSnapshot = "";
	queue("blockNightEmitResearchSnapshotV23", 120);
}

function blockNightHandleResearchCommand(from, message)
{
	if (typeof message !== "string" || message.indexOf("bnr ") !== 0) return false;
	const parts = message.trim().split(/\s+/);
	if (parts.length !== 4) return true;
	const nonce = parts[1];
	const labId = Number(parts[2]);
	const topicId = parts[3];
	let ok = false;
	let reason = "invalid";

	if (from !== selectedPlayer)
	{
		reason = "wrong-player";
	}
	else
	{
		const lab = getObject(STRUCTURE, from, labId);
		const topic = getResearch(topicId, from);
		if (!lab || lab.player !== from || lab.stattype !== RESEARCH_LAB || lab.status !== BUILT)
		{
			reason = "lab-missing";
		}
		else if (!structureIdle(lab))
		{
			reason = "lab-busy";
		}
		else if (!topic || topic.done || topic.started)
		{
			reason = "topic-unavailable";
		}
		else
		{
			ok = pursueResearch(lab, topicId);
			reason = ok ? "started" : "engine-rejected";
			if (ok)
			{
				blockNightLabTopics[String(lab.id)] = { topicId: topicId, assignedAt: gameTime };
			}
		}
	}

	blockNightResearchCommandAck(nonce, ok, reason, labId, topicId);
	return true;
}
'@

$eventChatPattern = 'function eventChat\(from, to, message\)\s*\{'
$eventChatReplacement = "function eventChat(from, to, message)`n{`n`tif (blockNightHandleResearchCommand(from, message)) return;"
$chat = [regex]::Replace($chat, $eventChatPattern, $eventChatReplacement, 1)
if (-not $chat.Contains('blockNightHandleResearchCommand(from, message)')) {
	throw 'Could not install the research command hook in eventChat.'
}
$chat += $chatHandler

Redirect-PackageText $researchPath $research
Redirect-PackageText $gameInitPath $gameInit
Redirect-PackageText $chatPath $chat

$newSize = (Get-Item -LiteralPath $dataPath).Length
$sizeToken = 'remote_package_size:' + $originalSize
if (-not $javaScript.Contains($sizeToken)) { throw "Could not find package size token: $sizeToken" }
$javaScript = $javaScript.Replace($sizeToken, 'remote_package_size:' + $newSize)

$fsExport = 'Module["FS"]=FS;Module["FS_createPreloadedFile"]=FS_createPreloadedFile;'
if (-not $javaScript.Contains($fsExport)) {
	$exportToken = 'Module["FS_createPreloadedFile"]=FS_createPreloadedFile;'
	if (-not $javaScript.Contains($exportToken)) { throw 'Could not locate the Emscripten FS export block.' }
	$javaScript = $javaScript.Replace($exportToken, $fsExport)
}

$javaScript = [regex]::Replace(
	$javaScript,
	'package_uuid:"[^"]+"',
	('package_uuid:"blocknight-warzone-4.7.0-mobile-tech-engine-v23-' + $newSize + '"'),
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
Write-Output "Embedded Block Night v2.3 engine-synced research bridge: $originalSize -> $newSize bytes"
