param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$marker = 'BLOCK NIGHT MOBILE TECH BRIDGE'

$javaScript = [IO.File]::ReadAllText($javaScriptPath)
$originalPackageSize = (Get-Item -LiteralPath $dataPath).Length

function Read-PackageText([string]$virtualPath) {
	$pattern = '\{filename:"' + [regex]::Escape($virtualPath) + '",start:(?<start>\d+),end:(?<end>\d+)\}'
	$match = [regex]::Match($script:javaScript, $pattern)
	if (-not $match.Success) { throw "Could not locate package entry: $virtualPath" }
	$start = [long]$match.Groups['start'].Value
	$end = [long]$match.Groups['end'].Value
	$length = [int]($end - $start)
	$bytes = New-Object byte[] $length
	$stream = [IO.File]::OpenRead($script:dataPath)
	try {
		$stream.Position = $start
		$read = $stream.Read($bytes, 0, $length)
		if ($read -ne $length) { throw "Could not read complete package entry: $virtualPath" }
	} finally {
		$stream.Dispose()
	}
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
$snapshotFunction = @'

/* BLOCK NIGHT MOBILE TECH SNAPSHOT */
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
	debug("BNTECH:" + JSON.stringify({ gameTime: gameTime, topics: topics }));
}
'@
$researchScript = Read-PackageText $researchPath
if ($researchScript.Contains($marker)) {
	if ($researchScript.Contains('debug("BNTECH:') -and
		$researchScript.Contains('gameTime > 1000')) {
		$gameInitScript = Read-PackageText $gameInitPath
		if ($gameInitScript.Contains('function blockNightEmitResearchSnapshot')) {
			Write-Output 'Block Night mobile research bridge is already embedded.'
			exit 0
		}
		$gameInitScript += $snapshotFunction
		Redirect-PackageText $gameInitPath $gameInitScript
		$newPackageSize = (Get-Item -LiteralPath $dataPath).Length
		$javaScript = $javaScript.Replace(
			'remote_package_size:' + $originalPackageSize,
			'remote_package_size:' + $newPackageSize)
		[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
		Write-Output "Moved mobile research snapshot into game-init scope: $originalPackageSize -> $newPackageSize bytes"
		exit 0
	}
	$researchScript = $researchScript.Replace('console("BNTECH:', 'debug("BNTECH:')
	$eventUpgrade = @'
function eventResearched(research, structure, player)
{
	// Initial base/tech setup fires this event many times at gameTime 2.
	if (gameTime > 1000 && player === selectedPlayer)
	{
		debug("BNTECHDONE:" + JSON.stringify({
			id: research.id,
			name: research.fullname,
			player: player,
			gameTime: gameTime
		}));
		queue("blockNightEmitResearchSnapshot", 50);
	}
}

'@
	$eventPattern = 'function eventResearched\(research, structure, player\)\s*\{.*?\}\s*(?=/\* BLOCK NIGHT MOBILE TECH BRIDGE)'
	$researchScript = [regex]::Replace(
		$researchScript,
		$eventPattern,
		$eventUpgrade,
		[Text.RegularExpressions.RegexOptions]::Singleline)
	Redirect-PackageText $researchPath $researchScript
	$newPackageSize = (Get-Item -LiteralPath $dataPath).Length
	$javaScript = $javaScript.Replace(
		'remote_package_size:' + $originalPackageSize,
		'remote_package_size:' + $newPackageSize)
	[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
	Write-Output "Upgraded mobile research bridge: $originalPackageSize -> $newPackageSize bytes"
	exit 0
}

$researchScript += @'

/* BLOCK NIGHT MOBILE TECH BRIDGE
 * Publishes the human player's live, immediately available research list.
 * This is presentation-only: Warzone remains authoritative for all actions.
 */
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
	debug("BNTECH:" + JSON.stringify({ gameTime: gameTime, topics: topics }));
}

'@
$eventBody = @'
	// NOTE: Research upgrades are handled by the C++ core game engine since 4.1.0
	// Initial base/tech setup fires this event many times at gameTime 2.
	if (gameTime > 1000 && player === selectedPlayer)
	{
		debug("BNTECHDONE:" + JSON.stringify({
			id: research.id,
			name: research.fullname,
			player: player,
			gameTime: gameTime
		}));
		queue("blockNightEmitResearchSnapshot", 50);
	}
'@
$researchScript = $researchScript.Replace(
	'// NOTE: Research upgrades are handled by the C++ core game engine since 4.1.0',
	$eventBody.TrimEnd())

$gameInitScript = Read-PackageText $gameInitPath
$gameInitNeedle = "`tsetTimer(`"autoSave`", 10*60*1000);"
$gameInitReplacement = "`tsetTimer(`"autoSave`", 10*60*1000);`n`n`t// BLOCK NIGHT MOBILE TECH BRIDGE`n`tqueue(`"blockNightEmitResearchSnapshot`", 1200);`n`tsetTimer(`"blockNightEmitResearchSnapshot`", 1500);"
$gameInitScript = $gameInitScript.Replace(
	$gameInitNeedle,
	$gameInitReplacement)
if (-not $gameInitScript.Contains('function blockNightEmitResearchSnapshot')) {
	$gameInitScript += $snapshotFunction
}

Redirect-PackageText $researchPath $researchScript
Redirect-PackageText $gameInitPath $gameInitScript

$newPackageSize = (Get-Item -LiteralPath $dataPath).Length
$sizeToken = 'remote_package_size:' + $originalPackageSize
if (-not $javaScript.Contains($sizeToken)) {
	throw "Could not find package size token: $sizeToken"
}
$javaScript = $javaScript.Replace($sizeToken, 'remote_package_size:' + $newPackageSize)
$javaScript = [regex]::Replace(
	$javaScript,
	'package_uuid:"[^"]+"',
	'package_uuid:"blocknight-warzone-4.7.0-mobile-tech-v22"',
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))

Write-Output "Embedded mobile research bridge: $originalPackageSize -> $newPackageSize bytes"
