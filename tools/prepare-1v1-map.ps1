param(
	[string]$SourceMap = (Join-Path (Split-Path -Parent $PSScriptRoot) 'vendor\legacy-map\2c-dumb25a-original.wz'),
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$mapName = '2c-blocknight20'
$levelName = 'BlockNight20-T1'
$sourceFolder = 'multiplay/maps/2c-dumb25a'
$outputRoot = Join-Path $ProjectRoot 'map\blocknight20'
$outputMapFolder = Join-Path $outputRoot "multiplay\maps\$mapName"
$outputArchive = Join-Path $ProjectRoot 'map\blocknight20-20oil.wz'

function Read-ZipText([IO.Compression.ZipArchive]$Archive, [string]$Name) {
	$entry = $Archive.GetEntry($Name)
	if ($null -eq $entry) { throw "Missing map entry: $Name" }
	$reader = [IO.StreamReader]::new($entry.Open())
	try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Read-IniObjects([string]$Text) {
	$objects = [ordered]@{}
	foreach ($match in [regex]::Matches($Text, '(?ms)^\[(?<section>[^\]]+)\]\s*(?<body>.*?)(?=^\[|\z)')) {
		$item = [ordered]@{}
		foreach ($line in ($match.Groups['body'].Value -split "`r?`n")) {
			if ($line -match '^\s*([^=]+?)\s*=\s*(.*?)\s*$') {
				$item[$matches[1].Trim()] = $matches[2].Trim()
			}
		}
		$objects[$match.Groups['section'].Value] = $item
	}
	return $objects
}

function Parse-Vector([string]$Value) {
	return @($Value -split ',' | ForEach-Object { [int]$_.Trim() })
}

function Convert-ToMapJson([Collections.IDictionary]$Objects, [string]$Kind) {
	$result = [ordered]@{}
	foreach ($section in $Objects.Keys) {
		$item = $Objects[$section]
		$record = [ordered]@{}
		if ($item.Contains('id') -and $Kind -eq 'droid') { $record.id = [int]$item.id }
		if ($item.Contains('modules')) { $record.modules = [int]$item.modules }
		if ($item.Contains('name')) { $record.name = $item.name }
		if ($item.Contains('position')) { $record.position = @(Parse-Vector $item.position) }
		if ($item.Contains('rotation')) { $record.rotation = @(Parse-Vector $item.rotation) }
		if ($item.Contains('startpos')) { $record.startpos = [int]$item.startpos }
		if ($item.Contains('template')) { $record.template = $item.template }
		$result[$section] = $record
	}
	return ($result | ConvertTo-Json -Depth 8)
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
	[IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $SourceMap -PathType Leaf)) {
	throw "Source map not found: $SourceMap"
}

[IO.Directory]::CreateDirectory($outputMapFolder) | Out-Null
$archive = [IO.Compression.ZipFile]::OpenRead($SourceMap)
try {
	$structures = Read-IniObjects (Read-ZipText $archive "$sourceFolder/struct.ini")
	$features = Read-IniObjects (Read-ZipText $archive "$sourceFolder/feature.ini")
	$droids = Read-IniObjects (Read-ZipText $archive "$sourceFolder/droid.ini")

	# Keep five evenly-spaced oil rows across the map's four oil columns.
	# Player 1 is the exact north/south mirror of player 0.
	$oilRows = @{
		0 = @(832, 1088, 1344, 1600, 1856)
		1 = @(17344, 17600, 17856, 18112, 18368)
	}
	$generatorPositions = [Collections.Generic.HashSet[string]]::new()
	foreach ($position in @(
		'1664,896', '2048,1280', '2432,896', '2816,1280', '3200,896',
		'1792,18304', '2176,17920', '2560,18304', '2944,17920', '3328,18304'
	)) { [void]$generatorPositions.Add($position) }

	$keptStructures = [ordered]@{}
	$keptOilPositions = [Collections.Generic.HashSet[string]]::new()
	foreach ($section in $structures.Keys) {
		$item = $structures[$section]
		$position = Parse-Vector $item.position
		$coordinate = "$($position[0]),$($position[1])"
		$keep = $true
		if ($item.name -eq 'A0ResourceExtractor') {
			$player = [int]$item.startpos
			$keep = $oilRows[$player] -contains $position[1]
			if ($keep) { [void]$keptOilPositions.Add($coordinate) }
		} elseif ($item.name -eq 'A0PowerGenerator') {
			$keep = $generatorPositions.Contains($coordinate)
		}
		if ($keep) { $keptStructures[$section] = $item }
	}

	$keptFeatures = [ordered]@{}
	foreach ($section in $features.Keys) {
		$item = $features[$section]
		$position = Parse-Vector $item.position
		$coordinate = "$($position[0]),$($position[1])"
		if ($item.name -ne 'OilResource' -or $keptOilPositions.Contains($coordinate)) {
			$keptFeatures[$section] = $item
		}
	}

	Write-Utf8NoBom (Join-Path $outputMapFolder 'struct.json') (Convert-ToMapJson $keptStructures 'structure')
	Write-Utf8NoBom (Join-Path $outputMapFolder 'feature.json') (Convert-ToMapJson $keptFeatures 'feature')
	Write-Utf8NoBom (Join-Path $outputMapFolder 'droid.json') (Convert-ToMapJson $droids 'droid')

	foreach ($entryName in @('game.map', 'ttypes.ttp')) {
		$entry = $archive.GetEntry("$sourceFolder/$entryName")
		if ($null -eq $entry) { throw "Missing map entry: $entryName" }
		$input = $entry.Open()
		$output = [IO.File]::Create((Join-Path $outputMapFolder $entryName))
		try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
	}
	$gameEntry = $archive.GetEntry('multiplay/maps/2c-dumb25a.gam')
	$gameInput = $gameEntry.Open()
	$gameOutput = [IO.File]::Create((Join-Path $outputRoot "multiplay\maps\$mapName.gam"))
	try { $gameInput.CopyTo($gameOutput) } finally { $gameOutput.Dispose(); $gameInput.Dispose() }
} finally {
	$archive.Dispose()
}

$levelText = @"
// Block Night 20-oil variant derived from 2c-dumb25a by arc (CC0)
level   $levelName
players 2
type    14
dataset MULTI_CAM_1
game    "multiplay/maps/$mapName.gam"
"@
Write-Utf8NoBom (Join-Path $outputRoot "$mapName.addon.lev") $levelText

if (Test-Path -LiteralPath $outputArchive) { Remove-Item -LiteralPath $outputArchive }
[IO.Compression.ZipFile]::CreateFromDirectory($outputRoot, $outputArchive, [IO.Compression.CompressionLevel]::Optimal, $false)

$structureCounts = @{}
foreach ($player in 0, 1) {
	$structureCounts[$player] = @{
		Oils = @($keptStructures.Values | Where-Object { $_.startpos -eq $player -and $_.name -eq 'A0ResourceExtractor' }).Count
		Generators = @($keptStructures.Values | Where-Object { $_.startpos -eq $player -and $_.name -eq 'A0PowerGenerator' }).Count
	}
}
Write-Output "Created $outputArchive"
Write-Output "Player 0: $($structureCounts[0].Oils) oils, $($structureCounts[0].Generators) generators"
Write-Output "Player 1: $($structureCounts[1].Oils) oils, $($structureCounts[1].Generators) generators"
