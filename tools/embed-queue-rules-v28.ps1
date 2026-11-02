param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$challengePath = Join-Path $ProjectRoot 'scenario\blocknight1v1.json'
$rulesPath = Join-Path $ProjectRoot 'scenario\blocknight-queue-rules.js'
$zoomCommandPath = Join-Path $ProjectRoot 'scenario\blocknight-zoom-command.json'
$queueCommandPath = Join-Path $ProjectRoot 'scenario\blocknight-queue-command.json'
$javaScript = [IO.File]::ReadAllText($javaScriptPath)
$originalSize = (Get-Item -LiteralPath $dataPath).Length

function Redirect-PackageFile([string]$VirtualPath, [string]$SourcePath) {
	$bytes = [IO.File]::ReadAllBytes($SourcePath)
	$start = (Get-Item -LiteralPath $script:dataPath).Length
	$stream = [IO.File]::Open($script:dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
	try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
	$end = $start + $bytes.Length
	$entry = '{filename:"' + $VirtualPath + '",start:' + $start + ',end:' + $end + '}'
	$pattern = '\{filename:"' + [regex]::Escape($VirtualPath) + '",start:\d+,end:\d+\}'
	if ([regex]::IsMatch($script:javaScript, $pattern)) {
		$script:javaScript = [regex]::Replace($script:javaScript, $pattern, $entry, 1)
	} else {
		$listEnd = '}],remote_package_size:'
		$listEndIndex = $script:javaScript.LastIndexOf($listEnd)
		if ($listEndIndex -lt 0) { throw 'Could not find the Emscripten package metadata terminator.' }
		$script:javaScript = $script:javaScript.Insert($listEndIndex + 1, ',' + $entry)
	}
}

Redirect-PackageFile '/data/mp/tests/blocknight1v1.json' $challengePath
Redirect-PackageFile '/data/mp/tests/blocknight-queue-rules.js' $rulesPath
Redirect-PackageFile '/data/mp/tests/blocknight-zoom-command.json' $zoomCommandPath
Redirect-PackageFile '/data/mp/tests/blocknight-queue-command.json' $queueCommandPath

$newSize = (Get-Item -LiteralPath $dataPath).Length
$sizePattern = 'remote_package_size:\d+'
$javaScript = [regex]::Replace($javaScript, $sizePattern, ('remote_package_size:' + $newSize), 1)
$javaScript = [regex]::Replace(
	$javaScript,
	'package_uuid:"[^"]+"',
	('package_uuid:"blocknight-warzone-4.7.0-v32-atomic-lab-queues-' + $newSize + '"'),
	1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
Write-Output "Embedded Block Night v3.2 atomic lab queues and absolute-camera bridge: $originalSize -> $newSize bytes"
