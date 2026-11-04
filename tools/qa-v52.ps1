param([ValidateSet('build-install','install','restart','compact','wide','screenshot-aspect','refresh','restore')][string]$Action)
$ErrorActionPreference='Stop'
$Project=Split-Path -Parent $PSScriptRoot
if($Project -ne 'C:\timerApp\wz-android'){throw 'Unexpected project root'}
Set-Location -LiteralPath $Project
$ADB='C:\Users\punke\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$Python='C:\Users\punke\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:WZ_QA_DEVICE='emulator-5554'
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME='C:\Users\punke\AppData\Local\Android\Sdk'
function Refresh-Debugger {
  $wzPid=(& $ADB -s emulator-5554 shell pidof com.rbabbit.warzonetowers).Trim()
  & $ADB -s emulator-5554 forward tcp:9226 "localabstract:webview_devtools_remote_$wzPid" | Out-Null
  $targets=Invoke-RestMethod http://localhost:9226/json
  $page=$targets | Where-Object {$_.type -eq 'page' -and $_.url -match '/mobile.html'} | Select-Object -First 1
  if(!$page.webSocketDebuggerUrl){throw 'Game WebView is not available yet'}
  $page.webSocketDebuggerUrl | Set-Content tools/live-cdp-url.txt
}
if($Action -eq 'build-install'){
  & tools/embed-warzone-towers.ps1
  & .\gradlew.bat assembleDebug
  if($LASTEXITCODE -ne 0){throw 'Build failed'}
}
if($Action -in @('build-install','install')){
  & $ADB -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
  if($LASTEXITCODE -ne 0){throw 'Install failed'}
}
if($Action -in @('build-install','install','restart')){
  & $ADB -s emulator-5554 shell am force-stop com.rbabbit.warzonetowers
  & $ADB -s emulator-5554 shell am start -n com.rbabbit.warzonetowers/com.rbabbit.blocknight.warzone.MainActivity
  Start-Sleep -Seconds 2
  & $Python tools/startup-music-audit.py start
  if($LASTEXITCODE -ne 0){throw 'Startup fixture did not reach the enabled Start game button'}
  Start-Sleep -Seconds 2
  Refresh-Debugger
}
if($Action -in @('wide','compact','screenshot-aspect')){
  if($Action -eq 'wide'){& $ADB -s emulator-5554 shell wm size 1200x1920}
  elseif($Action -eq 'screenshot-aspect'){& $ADB -s emulator-5554 shell wm size 1080x2400}
  else{& $ADB -s emulator-5554 shell wm size 900x1620}
  & $ADB -s emulator-5554 shell wm density 240
  & $ADB -s emulator-5554 shell settings put system accelerometer_rotation 0
  & $ADB -s emulator-5554 shell settings put system user_rotation 1
}
if($Action -eq 'refresh'){Refresh-Debugger}
if($Action -eq 'restore'){
  & $ADB -s emulator-5554 shell settings put secure show_ime_with_hard_keyboard 0
  & $ADB -s emulator-5554 shell wm size 1600x2560
  & $ADB -s emulator-5554 shell wm density 320
  & $ADB -s emulator-5554 shell settings put system accelerometer_rotation 1
  & $ADB -s emulator-5554 emu kill
}
