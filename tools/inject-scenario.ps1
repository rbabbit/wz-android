param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$scenarioRoot = Join-Path $ProjectRoot 'scenario'
$files = @(
	@('/data/mp/tests/blocknight.json', (Join-Path $scenarioRoot 'blocknight.json')),
	@('/data/mp/tests/blocknight-rules.js', (Join-Path $scenarioRoot 'blocknight-rules.js')),
	@('/data/mp/multiplay/skirmish/blocknight-passive.json', (Join-Path $scenarioRoot 'blocknight-passive.json')),
	@('/data/mp/multiplay/skirmish/blocknight-passive.js', (Join-Path $scenarioRoot 'blocknight-passive.js'))
)

$javaScript = [IO.File]::ReadAllText($javaScriptPath)
if ($javaScript.Contains('/data/mp/tests/blocknight.json')) {
	Write-Output 'Block Night scenario is already embedded.'
	exit 0
}

$originalSize = (Get-Item -LiteralPath $dataPath).Length
$cursor = $originalSize
$metadata = New-Object Text.StringBuilder
$stream = [IO.File]::Open($dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
try {
	foreach ($entry in $files) {
		$bytes = [IO.File]::ReadAllBytes($entry[1])
		$start = $cursor
		$stream.Write($bytes, 0, $bytes.Length)
		$cursor += $bytes.Length
		[void]$metadata.Append(',{filename:"' + $entry[0] + '",start:' + $start + ',end:' + $cursor + '}')
	}
}
finally {
	$stream.Dispose()
}

$listEnd = '}],remote_package_size:' + $originalSize
$listEndIndex = $javaScript.LastIndexOf($listEnd)
if ($listEndIndex -lt 0) {
	throw "Could not find the Emscripten package metadata terminator."
}
$javaScript = $javaScript.Insert($listEndIndex + 1, $metadata.ToString())
$javaScript = $javaScript.Replace(
	'remote_package_size:' + $originalSize,
	'remote_package_size:' + $cursor)
$javaScript = [Text.RegularExpressions.Regex]::Replace(
	$javaScript,
	'package_uuid:"sha256-[a-f0-9]+"',
	'package_uuid:"blocknight-warzone-4.7.0-v1"',
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))

Write-Output "Embedded Block Night scenario: $originalSize -> $cursor bytes"
