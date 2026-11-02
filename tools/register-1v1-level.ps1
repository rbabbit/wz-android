param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $ProjectRoot 'app\src\main\assets\warzone'
$dataPath = Join-Path $assetRoot 'warzone2100.data'
$javaScriptPath = Join-Path $assetRoot 'warzone2100.js'
$levelPath = Join-Path $ProjectRoot 'map\blocknight20\2c-blocknight20.addon.lev'
$marker = 'level   BlockNight20-T1'

$javaScript = [IO.File]::ReadAllText($javaScriptPath)
$entryPattern = '\{filename:"/data/mp/addon\.lev",start:(?<start>\d+),end:(?<end>\d+)\}'
$entryMatch = [regex]::Match($javaScript, $entryPattern)
if (-not $entryMatch.Success) { throw 'Could not locate the official /data/mp/addon.lev package entry.' }

$start = [long]$entryMatch.Groups['start'].Value
$end = [long]$entryMatch.Groups['end'].Value
$length = [int]($end - $start)
$bytes = New-Object byte[] $length
$stream = [IO.File]::OpenRead($dataPath)
try {
	$stream.Position = $start
	$read = $stream.Read($bytes, 0, $length)
	if ($read -ne $length) { throw 'Could not read the complete official addon.lev payload.' }
} finally {
	$stream.Dispose()
}

$officialLevels = [Text.Encoding]::UTF8.GetString($bytes)
if ($officialLevels.Contains($marker)) {
	$blockStart = $officialLevels.LastIndexOf('// Block Night 20-oil variant')
	if ($blockStart -lt 0) { throw 'Found the custom level marker without its generated block header.' }
	$officialLevels = $officialLevels.Substring(0, $blockStart).TrimEnd()
}

$customLevel = [IO.File]::ReadAllText($levelPath)
$combined = $officialLevels.TrimEnd() + "`n`n" + $customLevel.Trim() + "`n"
$combinedBytes = [Text.Encoding]::UTF8.GetBytes($combined)
$newStart = (Get-Item -LiteralPath $dataPath).Length
$append = [IO.File]::Open($dataPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
try { $append.Write($combinedBytes, 0, $combinedBytes.Length) } finally { $append.Dispose() }
$newEnd = $newStart + $combinedBytes.Length

$replacement = '{filename:"/data/mp/addon.lev",start:' + $newStart + ',end:' + $newEnd + '}'
$javaScript = [regex]::Replace($javaScript, $entryPattern, $replacement, 1)
$oldPackageSize = $newStart
$javaScript = $javaScript.Replace('remote_package_size:' + $oldPackageSize,
	'remote_package_size:' + $newEnd)
$javaScript = [regex]::Replace($javaScript, 'package_uuid:"[^"]+"',
	'package_uuid:"blocknight-warzone-4.7.0-1v1-v2"', 1)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))

Write-Output "Registered BlockNight20-T1 in addon.lev: $newStart -> $newEnd"
