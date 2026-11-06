param([string]$Evidence = 'qa/native-ui/final')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:WZ_NATIVE_QA = [IO.Path]::GetFullPath($Evidence)
$qaAdb = Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
function Invoke-Check([string[]]$QaArgs) {
    & node @QaArgs
    if ($LASTEXITCODE -ne 0) { throw ('Native delivery check failed: ' + ($QaArgs -join ' ')) }
}
function Set-Profile([string]$Size, [string]$Density, [string]$Font) {
    & $qaAdb -s emulator-5556 shell wm size $Size
    & $qaAdb -s emulator-5556 shell wm density $Density
    & $qaAdb -s emulator-5556 shell settings put system font_scale $Font
    if ($LASTEXITCODE -ne 0) { throw 'Owned emulator profile failed' }
}
# Every fixture is an ordinary complete native save. No units, power or research are granted.
Set-Profile -Size '600x1080' -Density '240' -Font '1.3'
Invoke-Check -QaArgs @('tools/start-native-qa.cjs', '--pause')
Invoke-Check -QaArgs @('tools/check-native-profile.cjs', '1080', '600', '240', '1.3')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-ui.cjs', 'phone-layout', '--resume')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-ui.cjs', 'remove-research', '--resume')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-ui.cjs', 'editor', '--resume')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-ui.cjs', 'production', '--resume')
Invoke-Check -QaArgs @('tools/start-native-qa.cjs', '--load', '--pause')
Invoke-Check -QaArgs @('tools/audit-native-lifecycle.cjs')
Set-Profile -Size '2400x1080' -Density '240' -Font '1.0'
Invoke-Check -QaArgs @('tools/check-native-profile.cjs', '2400', '1080', '240', '1')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-manual-labs', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-research-completion.cjs')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-ui.cjs', 'research', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-menus.cjs', 'pause-load', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-returns.cjs')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-field.cjs', '--resume', '--toggles')
Invoke-Check -QaArgs @('tools/audit-native-field.cjs', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-gestures.cjs')
Invoke-Check -QaArgs @('tools/native-checkpoint.cjs', 'restore', 'td2-normal-early', '--resume')
Invoke-Check -QaArgs @('tools/audit-native-build-returns.cjs')
Invoke-Check -QaArgs @('tools/start-native-qa.cjs', '--td1', '--pause')
Invoke-Check -QaArgs @('tools/audit-native-td1.cjs')
Set-Profile -Size '2400x1080' -Density '420' -Font '1.3'
Invoke-Check -QaArgs @('tools/check-native-profile.cjs', '2400', '1080', '420', '1.3')
Invoke-Check -QaArgs @('tools/audit-native-ui.cjs', 'screens', '--resume')
Set-Profile -Size '600x1080' -Density '240' -Font '1.3'
Invoke-Check -QaArgs @('tools/audit-native-narrow-build.cjs')
Invoke-Check -QaArgs @('tools/check-native-profile.cjs', '1080', '600', '240', '1.3')
Write-Output 'Native delivery journey passed; inspect the recorded screens and native saves before packaging.'
