param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$towerLevelPath = Join-Path $ProjectRoot 'vendor\survival\map\2c-TowerDefense2_m.addon.lev'
$javaScript = [IO.File]::ReadAllText($javaScriptPath)

$virtualPath = '/data/mp/addon.lev'
$pattern = '\{filename:"' + [regex]::Escape($virtualPath) + '",start:(\d+),end:(\d+)\}'
$match = [regex]::Match($javaScript, $pattern)
if (-not $match.Success) {
	throw 'Could not find the multiplayer level index in the Emscripten package metadata.'
}

$start = [long]$match.Groups[1].Value
$end = [long]$match.Groups[2].Value
$length = [int]($end - $start)
$existingBytes = [byte[]]::new($length)
$stream = [IO.File]::OpenRead($dataPath)
try {
	$stream.Position = $start
	$offset = 0
	while ($offset -lt $length) {
		$read = $stream.Read($existingBytes, $offset, $length - $offset)
		if ($read -le 0) { throw 'Unexpected end of Warzone data while reading addon.lev.' }
		$offset += $read
	}
} finally {
	$stream.Dispose()
}

$existingText = [Text.Encoding]::UTF8.GetString($existingBytes)
$legacyResourcePattern = '(?m)^data\s+"wrf/multi/(?:t2-)?skirmish2\.wrf"\r?\n|^data\s+"wrf/multi/fog2\.wrf"\r?\n'
$towerText = [IO.File]::ReadAllText($towerLevelPath)
$towerText = [regex]::Replace($towerText, $legacyResourcePattern, '')
$encoding = [Text.UTF8Encoding]::new($false)

# The modern map keeps its original gam.json and object JSON in its own folder;
# native game loading resolves the virtual .gam path to that gam.json.
$secondLevel = @'

level td1_v3-T1
players 4
type 14
dataset MULTI_CAM_1
game "multiplay/maps/td1_v3.gam"
'@

if ($existingText.Contains('TowerDefense2_m-T1')) {
	$combinedBytes = $encoding.GetBytes([regex]::Replace($existingText, $legacyResourcePattern, ''))
	if ($combinedBytes.Length -eq $existingBytes.Length) {
		if (-not $existingText.Contains('level td1_v3-T1')) {
			$combinedBytes = $encoding.GetBytes($existingText + "`n" + $secondLevel + "`n")
		} else {
		Write-Output 'Warzone Towers map is already registered in /data/mp/addon.lev.'
		exit 0
		}
	}
} else {
	$towerBytes = $encoding.GetBytes($towerText)
	$separator = $encoding.GetBytes("`n`n")
	$combinedBytes = [byte[]]::new($existingBytes.Length + $separator.Length + $towerBytes.Length)
	[Array]::Copy($existingBytes, 0, $combinedBytes, 0, $existingBytes.Length)
	[Array]::Copy($separator, 0, $combinedBytes, $existingBytes.Length, $separator.Length)
	[Array]::Copy($towerBytes, 0, $combinedBytes, $existingBytes.Length + $separator.Length, $towerBytes.Length)
}

if (-not $encoding.GetString($combinedBytes).Contains('level td1_v3-T1')) {
    $combinedBytes = $encoding.GetBytes($encoding.GetString($combinedBytes) + "`n" + $secondLevel + "`n")
}

$newStart = (Get-Item -LiteralPath $dataPath).Length
$output = [IO.File]::Open($dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
try {
	$output.Write($combinedBytes, 0, $combinedBytes.Length)
} finally {
	$output.Dispose()
}
$newEnd = (Get-Item -LiteralPath $dataPath).Length

$replacement = '{filename:"' + $virtualPath + '",start:' + $newStart + ',end:' + $newEnd + '}'
$javaScript = [regex]::Replace($javaScript, $pattern, $replacement, 1)
$javaScript = [regex]::Replace($javaScript, 'remote_package_size:\d+', ('remote_package_size:' + $newEnd), 1)
$javaScript = [regex]::Replace(
	$javaScript,
	'package_uuid:"[^"]+"',
	('package_uuid:"warzone-towers-4.7.0-v1-' + $newEnd + '"'),
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))

Write-Output "Registered TowerDefense2_m in /data/mp/addon.lev: $newStart -> $newEnd bytes"
