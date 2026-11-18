# Place this script and both .zip.001/.zip.002 files in one folder.
$ErrorActionPreference = 'Stop'
$taskSourceName = 'warzone-towers-0.95-test-source.zip'
$taskExpectedHash = 'bc0be80125d5d3a1da9c54abef96098fe12acb65f4f8f2e971671e647d104abf'
$taskParts = @(
    @{Name='warzone-towers-0.95-test-source.zip.001'; Bytes=1879048192; Hash='3cafe0a554346f52ed8fa461dd7da73ad736dd00bdc5f7443c365751d75b298b'},
    @{Name='warzone-towers-0.95-test-source.zip.002'; Bytes=1763344838; Hash='79a6176230a3bb4934b519965087d75fc4462077c10655e2bc55eade525c1c88'}
)
$taskTarget = Join-Path $PSScriptRoot $taskSourceName
$taskPartial = Join-Path $PSScriptRoot ($taskSourceName + '.partial')
if ((Test-Path -LiteralPath $taskTarget) -or (Test-Path -LiteralPath $taskPartial)) { throw 'Output already exists; no file was replaced.' }
foreach ($taskPart in $taskParts) {
    $taskInput = Join-Path $PSScriptRoot $taskPart.Name
    if (!(Test-Path -LiteralPath $taskInput -PathType Leaf)) { throw ('Missing source part: ' + $taskPart.Name) }
    if ((Get-Item -LiteralPath $taskInput).Length -ne $taskPart.Bytes) { throw ('Length mismatch: ' + $taskPart.Name) }
    if ((Get-FileHash -LiteralPath $taskInput -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPart.Hash) { throw ('Checksum mismatch: ' + $taskPart.Name) }
}
$taskOutput = [System.IO.File]::Open($taskPartial, [System.IO.FileMode]::CreateNew)
try {
    foreach ($taskPart in $taskParts) {
        $taskInput = [System.IO.File]::OpenRead((Join-Path $PSScriptRoot $taskPart.Name))
        try { $taskInput.CopyTo($taskOutput, 8388608) } finally { $taskInput.Dispose() }
    }
} finally { $taskOutput.Dispose() }
if ((Get-FileHash -LiteralPath $taskPartial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpectedHash) { throw 'Joined checksum mismatch; partial file retained.' }
[System.IO.File]::Move($taskPartial, $taskTarget)
Write-Output ('Verified complete source ZIP: ' + $taskTarget)
