# Download this script and both numbered source parts into one folder.
$ErrorActionPreference = 'Stop'
$taskSourceName = 'warzone-towers-0.92-test-source.zip'
$taskExpectedHash = '63e26582d2c97ed88f57469be8a556b205532c83b660e937bd983b2be8cf8057'
$taskParts = @(
    @{Name='warzone-towers-0.92-test-source.zip.001'; Bytes=1879048192; Hash='3cafe0a554346f52ed8fa461dd7da73ad736dd00bdc5f7443c365751d75b298b'},
    @{Name='warzone-towers-0.92-test-source.zip.002'; Bytes=1449684840; Hash='e6f52616122c9bd8af64846644138f17525e162da3673bbc043470a217ef95ea'}
)
$taskTarget = Join-Path $PSScriptRoot $taskSourceName
$taskPartial = Join-Path $PSScriptRoot ($taskSourceName + '.partial')
if (Test-Path -LiteralPath $taskTarget) { throw 'The complete ZIP already exists; no file was replaced.' }
if (Test-Path -LiteralPath $taskPartial) { throw 'A partial output already exists; no file was replaced.' }
foreach ($taskPart in $taskParts) {
    $taskPartPath = Join-Path $PSScriptRoot $taskPart.Name
    if (!(Test-Path -LiteralPath $taskPartPath -PathType Leaf)) { throw ('Missing source part: ' + $taskPart.Name) }
    if ((Get-Item -LiteralPath $taskPartPath).Length -ne $taskPart.Bytes) { throw ('Source part length mismatch: ' + $taskPart.Name) }
    if ((Get-FileHash -LiteralPath $taskPartPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPart.Hash) { throw ('Source part checksum mismatch: ' + $taskPart.Name) }
}
$taskOutputStream = [System.IO.File]::Open($taskPartial, [System.IO.FileMode]::CreateNew)
try {
    foreach ($taskPart in $taskParts) {
        $taskInputStream = [System.IO.File]::OpenRead((Join-Path $PSScriptRoot $taskPart.Name))
        try { $taskInputStream.CopyTo($taskOutputStream, 8388608) } finally { $taskInputStream.Dispose() }
    }
} finally { $taskOutputStream.Dispose() }
if ((Get-FileHash -LiteralPath $taskPartial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpectedHash) { throw 'Joined source checksum mismatch; partial output retained for inspection.' }
[System.IO.File]::Move($taskPartial, $taskTarget)
Write-Output ('Verified complete source ZIP: ' + $taskTarget)
