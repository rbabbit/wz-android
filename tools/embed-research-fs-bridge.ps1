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
$research = Read-PackageText $researchPath
$gameInit = Read-PackageText $gameInitPath

$snapshot = @'
var blockNightLastResearchSnapshot = "";
function blockNightEmitResearchSnapshot()
{
	const topics = enumResearch().map(function (research) {
		return {
			id: research.id,
			name: research.fullname,
			power: research.power,
			points: research.points,
			started: research.started
		};
	});
	const topicPayload = JSON.stringify(topics);
	if (topicPayload !== blockNightLastResearchSnapshot)
	{
		blockNightLastResearchSnapshot = topicPayload;
		dump("BNTECH:" + JSON.stringify({ gameTime: gameTime, topics: topics }));
	}
}
'@

if ($research.Contains('queue("blockNightEmitResearchSnapshot", 50);') -and
	$gameInit.Contains('setTimer("blockNightEmitResearchSnapshot", 1500);') -and
	$gameInit.Contains('const topicPayload = JSON.stringify(topics);')) {
	$currentSize = (Get-Item -LiteralPath $dataPath).Length
	$cacheId = 'package_uuid:"blocknight-warzone-4.7.0-mobile-tech-fs-v22-' + $currentSize + '"'
	$javaScript = [regex]::Replace($javaScript, 'package_uuid:"[^"]+"', $cacheId, 1)
	[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
	Write-Output "Block Night filesystem research bridge is already embedded; cache id refreshed for $currentSize bytes."
	exit 0
}

$research = @'
/* BLOCK NIGHT MOBILE TECH BRIDGE */
function eventResearched(research, structure, player)
{
	// Initial base/tech setup fires this event many times at gameTime 2.
	if (gameTime > 1000 && player === selectedPlayer)
	{
		dump("BNTECHDONE:" + JSON.stringify({
			id: research.id,
			name: research.fullname,
			player: player,
			gameTime: gameTime
		}));
		queue("blockNightEmitResearchSnapshot", 50);
	}
}
'@
$research += "`n" + $snapshot

$gameInitMarker = $gameInit.IndexOf("`n`t// BLOCK NIGHT MOBILE TECH BRIDGE")
if ($gameInitMarker -lt 0) { throw 'Could not locate game-init bridge marker.' }
$gameInit = $gameInit.Substring(0, $gameInitMarker) + @'

	// BLOCK NIGHT MOBILE TECH BRIDGE
	queue("blockNightEmitResearchSnapshot", 1200);
	setTimer("blockNightEmitResearchSnapshot", 1500);
}
'@
$gameInit += "`n/* BLOCK NIGHT MOBILE TECH SNAPSHOT */`n" + $snapshot

Redirect-PackageText $researchPath $research
Redirect-PackageText $gameInitPath $gameInit

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
	('package_uuid:"blocknight-warzone-4.7.0-mobile-tech-fs-v22-' + $newSize + '"'),
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
Write-Output "Embedded deduplicated filesystem research bridge: $originalSize -> $newSize bytes"
