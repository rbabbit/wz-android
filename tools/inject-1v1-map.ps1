param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$mapRoot = Join-Path $ProjectRoot 'map\blocknight20'
$challengePath = Join-Path $ProjectRoot 'scenario\blocknight1v1.json'
$mapName = '2c-blocknight20'

$files = @(
	@('/data/mp/tests/blocknight1v1.json', $challengePath),
	@("/data/mp/$mapName.addon.lev", (Join-Path $mapRoot "$mapName.addon.lev")),
	@("/data/mp/multiplay/maps/$mapName.gam", (Join-Path $mapRoot "multiplay\maps\$mapName.gam")),
	@("/data/mp/multiplay/maps/$mapName/game.map", (Join-Path $mapRoot "multiplay\maps\$mapName\game.map")),
	@("/data/mp/multiplay/maps/$mapName/ttypes.ttp", (Join-Path $mapRoot "multiplay\maps\$mapName\ttypes.ttp")),
	@("/data/mp/multiplay/maps/$mapName/droid.json", (Join-Path $mapRoot "multiplay\maps\$mapName\droid.json")),
	@("/data/mp/multiplay/maps/$mapName/feature.json", (Join-Path $mapRoot "multiplay\maps\$mapName\feature.json")),
	@("/data/mp/multiplay/maps/$mapName/struct.json", (Join-Path $mapRoot "multiplay\maps\$mapName\struct.json"))
)

$javaScript = [IO.File]::ReadAllText($javaScriptPath)
if ($javaScript.Contains('/data/mp/tests/blocknight1v1.json')) {
	Write-Output 'Block Night 1v1 map is already embedded.'
	exit 0
}

foreach ($entry in $files) {
	if (-not (Test-Path -LiteralPath $entry[1] -PathType Leaf)) {
		throw "Missing generated 1v1 asset: $($entry[1])"
	}
}

$originalSize = (Get-Item -LiteralPath $dataPath).Length
$cursor = $originalSize
$metadata = [Text.StringBuilder]::new()
$stream = [IO.File]::Open($dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
try {
	foreach ($entry in $files) {
		$bytes = [IO.File]::ReadAllBytes($entry[1])
		$start = $cursor
		$stream.Write($bytes, 0, $bytes.Length)
		$cursor += $bytes.Length
		[void]$metadata.Append(',{filename:"' + $entry[0] + '",start:' + $start + ',end:' + $cursor + '}')
	}
} finally {
	$stream.Dispose()
}

$listEnd = '}],remote_package_size:' + $originalSize
$listEndIndex = $javaScript.LastIndexOf($listEnd)
if ($listEndIndex -lt 0) { throw 'Could not find the Emscripten package metadata terminator.' }
$javaScript = $javaScript.Insert($listEndIndex + 1, $metadata.ToString())
$javaScript = $javaScript.Replace('remote_package_size:' + $originalSize, 'remote_package_size:' + $cursor)
$javaScript = [regex]::Replace(
	$javaScript,
	'package_uuid:"[^"]+"',
	'package_uuid:"blocknight-warzone-4.7.0-1v1-v1"',
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))

Write-Output "Embedded Block Night 1v1 map: $originalSize -> $cursor bytes"
Write-Output 'The Android index pre-creates /data/mp/multiplay/maps/2c-blocknight20 before Emscripten unpacks these files.'
