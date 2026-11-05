param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$scenarioRoot = Join-Path $ProjectRoot 'scenario'
$mapRoot = Join-Path $ProjectRoot 'vendor\survival\map'
$modRoot = Join-Path $ProjectRoot 'vendor\tower-defense\mod'

$files = [Collections.Generic.List[object]]::new()
function Add-PackageFile([string]$VirtualPath, [string]$SourcePath) {
	if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
		throw "Missing Warzone Towers source asset: $SourcePath"
	}
	$files.Add(@($VirtualPath, $SourcePath))
}

Add-PackageFile '/data/mp/tests/warzonetowers.json' (Join-Path $scenarioRoot 'warzonetowers.json')
Add-PackageFile '/data/mp/tests/warzonetowers-td1.json' (Join-Path $scenarioRoot 'warzonetowers-td1.json')
Add-PackageFile '/data/mp/tests/warzone-towers-rules.js' (Join-Path $scenarioRoot 'warzone-towers-rules.js')
Add-PackageFile '/data/mp/multiplay/script/rules/init.js' (Join-Path $scenarioRoot 'warzone-towers-rules.js')
Add-PackageFile '/data/mp/tests/warzone-towers-waves.js' (Join-Path $scenarioRoot 'warzone-towers-waves.js')
Add-PackageFile '/data/mp/tests/warzone-towers-objective.js' (Join-Path $scenarioRoot 'warzone-towers-objective.js')
Add-PackageFile '/data/mp/tests/warzone-towers-wave-command.json' (Join-Path $scenarioRoot 'warzone-towers-wave-command.json')
Add-PackageFile '/data/mp/tests/warzone-towers-bridge.js' (Join-Path $scenarioRoot 'warzone-towers-bridge.js')
Add-PackageFile '/data/mp/tests/warzone-towers-control-command.json' (Join-Path $scenarioRoot 'warzone-towers-control-command.json')
Add-PackageFile '/data/mp/tests/warzone-towers-commands.js' (Join-Path $scenarioRoot 'warzone-towers-commands.js')
Add-PackageFile '/data/mp/tests/warzone-towers-command.json' (Join-Path $scenarioRoot 'warzone-towers-command.json')
Add-PackageFile '/data/mp/tests/warzone-towers-catalog.json' (Join-Path $scenarioRoot 'warzone-towers-catalog.json')
foreach ($name in @('warzone-towers-command.json', 'warzone-towers-wave-command.json', 'warzone-towers-control-command.json', 'warzone-towers-catalog.json', 'blocknight-queue-command.json', 'blocknight-zoom-command.json')) {
    Add-PackageFile ('/data/mp/multiplay/script/rules/' + $name) (Join-Path $scenarioRoot $name)
}

Get-ChildItem -LiteralPath $mapRoot -Recurse -File |
	Where-Object { $_.Name -notlike '*.addon.lev' } |
	Sort-Object FullName | ForEach-Object {
	$relative = $_.FullName.Substring($mapRoot.Length).TrimStart('\').Replace('\', '/')
	Add-PackageFile ('/data/mp/' + $relative) $_.FullName
}

Get-ChildItem -LiteralPath $modRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
	$relative = $_.FullName.Substring($modRoot.Length).TrimStart('\').Replace('\', '/')
	if ($relative -eq 'multiplay/script/rules/init.js') {
		return
	}
	Add-PackageFile ('/data/mp/' + $relative) $_.FullName
}

Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'vendor\maps\td1-v3\map') -File | Sort-Object Name | ForEach-Object {
    Add-PackageFile ('/data/mp/multiplay/maps/td1_v3/' + $_.Name) $_.FullName
}



$javaScript = [IO.File]::ReadAllText($javaScriptPath)
if ($javaScript.Contains('/data/mp/tests/warzonetowers.json')) {
	function Redirect-PackageFile([string]$VirtualPath, [string]$SourcePath) {
		$bytes = [IO.File]::ReadAllBytes($SourcePath)
		$start = (Get-Item -LiteralPath $dataPath).Length
		$stream = [IO.File]::Open($dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
		try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
		$end = $start + $bytes.Length
		$pattern = '\{filename:"' + [regex]::Escape($VirtualPath) + '",start:\d+,end:\d+\}'
		$replacement = '{filename:"' + $VirtualPath + '",start:' + $start + ',end:' + $end + '}'
		if ([regex]::IsMatch($script:javaScript, $pattern)) {
			$script:javaScript = [regex]::Replace($script:javaScript, $pattern, $replacement, 1)
		} else {
			$listEnd = '}],remote_package_size:'
			$listEndIndex = $script:javaScript.LastIndexOf($listEnd)
			if ($listEndIndex -lt 0) { throw 'Could not find the Emscripten package metadata terminator.' }
			$script:javaScript = $script:javaScript.Insert($listEndIndex + 1, ',' + $replacement)
		}
	}

    # Stop exposing the superseded Survival mod. Its archived bytes remain in
    # the frozen data prefix, but are no longer resolved or loaded by the engine.
    $previousModRoot = Join-Path $ProjectRoot 'vendor\survival\mod'
    Get-ChildItem -LiteralPath $previousModRoot -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($previousModRoot.Length).TrimStart('\').Replace('\', '/')
        if ($relative -eq 'multiplay/script/rules/init.js' -or (Test-Path -LiteralPath (Join-Path $modRoot $relative))) { return }
        # Entries are never first here. Keep the following separator if present.
        $script:javaScript = [regex]::Replace($script:javaScript, ',\{filename:"' + [regex]::Escape('/data/mp/' + $relative) + '",start:\d+,end:\d+\}', '')
    }
    foreach ($retired in @('/data/mp/tests/minimumResearchTime.json', '/data/mp/multiplay/skirmish/warzone-towers-ai.js', '/data/mp/multiplay/skirmish/warzone-towers-ai.json')) {
        $script:javaScript = [regex]::Replace($script:javaScript, ',\{filename:"' + [regex]::Escape($retired) + '",start:\d+,end:\d+\}', '')
    }
    foreach ($entry in $files) { Redirect-PackageFile $entry[0] $entry[1] }
	$newSize = (Get-Item -LiteralPath $dataPath).Length
	$javaScript = [regex]::Replace($javaScript, 'remote_package_size:\d+', ('remote_package_size:' + $newSize), 1)
	$javaScript = [regex]::Replace(
		$javaScript,
		'package_uuid:"[^"]+"',
		('package_uuid:"warzone-towers-4.7.0-v1-' + $newSize + '"'),
		1)
	[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
	Write-Output "Refreshed Warzone Towers scenario files: package size is now $newSize bytes"
	& (Join-Path $PSScriptRoot 'register-warzone-towers-map.ps1') -ProjectRoot $ProjectRoot
	exit 0
}

$originalSize = (Get-Item -LiteralPath $dataPath).Length
$cursor = $originalSize
$metadata = [Text.StringBuilder]::new()
$stream = [IO.File]::Open($dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
try {
	foreach ($entry in $files) {
		$virtualPath = $entry[0]
		$sourcePath = $entry[1]
		if ($javaScript.Contains('{filename:"' + $virtualPath + '"')) {
			throw "The package already contains a conflicting path: $virtualPath"
		}
		$bytes = [IO.File]::ReadAllBytes($sourcePath)
		$start = $cursor
		$stream.Write($bytes, 0, $bytes.Length)
		$cursor += $bytes.Length
		[void]$metadata.Append(',{filename:"' + $virtualPath + '",start:' + $start + ',end:' + $cursor + '}')
	}
} finally {
	$stream.Dispose()
}

$listEnd = '}],remote_package_size:'
$listEndIndex = $javaScript.LastIndexOf($listEnd)
if ($listEndIndex -lt 0) {
	throw 'Could not find the Emscripten package metadata terminator.'
}
$javaScript = $javaScript.Insert($listEndIndex + 1, $metadata.ToString())
$javaScript = [regex]::Replace($javaScript, 'remote_package_size:\d+', ('remote_package_size:' + $cursor), 1)
$javaScript = [regex]::Replace(
	$javaScript,
	'package_uuid:"[^"]+"',
	('package_uuid:"warzone-towers-4.7.0-v1-' + $cursor + '"'),
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))

Write-Output "Embedded $($files.Count) Warzone Towers files: $originalSize -> $cursor bytes"
& (Join-Path $PSScriptRoot 'register-warzone-towers-map.ps1') -ProjectRoot $ProjectRoot
