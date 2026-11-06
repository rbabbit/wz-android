> Historical development notes. See CURRENT.md and REPORT.md for the current candidate and scoped delivery evidence.

# Native interface work checkpoint

Towers is the only active task. 1v1 is abandoned and unchanged. User authorized
proper Towers native UI replacement even if it takes days. Do not stop at this
checkpoint or claim a delivery. Branch `codex/towers-native-interface`, base
453d034914d5ca6e570eb077e1308efb7878d77f. Read PLAN.md and root AGENTS.md.

## Preserved

Frozen v5.12 APK/source/manifest are in
`C:/timerApp/_backups/towers-v5.12-before-native-ui-20261106`.
Original release APK SHA256
102316bdb80435971a2fd6561e4b269671774048d751d7d49663325d198f9313.
Engine JS/WASM/data, supplied maps/mod, original art and gameplay source remain
unchanged. Intermediate package verifier proved this and absent retired HTML
UI assets. No remote publication or push is authorized.

## Implemented, still under verification

- TowersNativeUi.java: Android header/waves, field controls, Research, Factory,
  Design, blueprint library, Build, Orders, Help/size, Android modal pickers,
  native feedback Canvas and PixelCopy freeze. No app widgets rendered in JS.
- MainActivity owns native shell with renderer-only scaling to 642x482 minimum.
  Sensor landscape; fontScale configuration handled. Native setup/music/art
  retained. Version is 6.0-native-ui (63), same Towers application ID.
- Headless JS transport files: warzone-native-bridge.js, warzone-command-core.js,
  warzone-engine-input.js, warzone-research-core.js, warzone-wave-core.js. Atomic
  manual queues and proven engine builder selection/readiness/FIFO retained.
- Typed bounded requests, generation guards, per-battle session IDs on requests,
  models/results/freeze/feedback/navigation, replay reset and visible-game gate.
  Startup waits for actual command/research/camera model before revealing.
- Stable native lists defer changed rows while touching/flinging. Diagnostics
  read real Java view instances, actual dialog screen origins, scroll state and
  frame readiness. Modal singleton avoids parent/confirmation window overlap.
  Frame commit + next native frame gates inspection after dialog show/dismiss.
- Native keyboard Back checks actual IME insets, saved-design format/prefs v1
  retained, engine validation and write rollback. Save completion preserves edits
  made while saving; prevents duplicate concurrent saves.
- Retired four UI JS files/two CSS files moved to archive/legacy-html-ui and are
  absent from APK. Historical test paths updated to archive, not used as proof
  of native UI. One-time derive-native-cores.cjs records original extraction but
  MUST NOT be rerun over maintained runtime cores (it would overwrite changes).
- mobile.html has only official engine iframe/viewport host, no app toolbar.

The battlefield, radar, engine messages/blueprints and stock engine menus
(statistics, commanders, pause/save/load) still use Warzone in WebView/WASM.
Never claim the game or those engine menus are Android-native.

## Environment and tools

- Owned emulator-5556, Warzone_Help_QA_220604, started -no-audio. Only this emulator.
  Current physical landscape 2400x1080, density240 (1600x720dp). Normal, Music off.
- Workdir C:/timerApp/wz-tower-defense. PowerShell login:false. SDK
  C:/Users/punke/AppData/Local/Android/Sdk. JDK Android Studio/jbr (25.0.3).
  Set BOTH JAVA_HOME and ANDROID_HOME for every Gradle invocation. Check exit
  codes before installation. `./gradlew.bat assembleDebug --console=plain`.
- Bundled real Python:
  C:/Users/punke/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe.
- Java formatter outside project: C:/timerApp/.native-ui-tools/google-java-format-current.jar
  (official Maven version2.0.0, supports installed JDK). Run java -jar --replace.
  Old formatter1.24 failed on JDK25; do not use it. Acorn for one-time migration
  is outside project too; no build dependency or binaries to package.
- tools/native-live.cjs: CDP + ADB, engine eval, actual native view tree, tap,
  screenshot, fresh F7 native save. CLI `eval '...'`, `screen name`, `native-tap label`,
  `wait 'expression'`, `save name`. Port9246 discovered runtime, no endpoint file.
- tools/audit-native-ui.cjs phases build/research/pickers/production/editor/
  editor-finish/screens. --resume requires and checks an observed paused clock
  before raw Escape. Each phase ends paused and records exact installed SHA.
- tools/prepare-native-fixture.cjs saves/flushes an observed paused fixture after
  resuming; tools/restore-native-fixture.cjs native F8 + actual fresh state/save,
  canonical init context, units/labs/counts and pause. --resume can rewind an
  existing paused scene. Current persisted QuickSave is the ordinarily prepared
  TD2 fixture around264k time with 6 stock trucks and one normal MG tank, labs.
  Its evidence is native-prepared-picker-change.json / native-fixture-restored.json.
  Do not load that TD2 save when testing fresh TD1 geometry.
- All world taps need native stage offset/scaling, not full-screen CSS ratio.
  audit helper handles it. Maps use inverted radar; validate actual centre.
- Use PowerShell literal here-strings for multiline Node, not quoted node -e
  containing nested quotes; PowerShell does not treat backslash as quote escape.

## Evidence already observed (INTERMEDIATE APKs, not final integrated delivery)

- Baseline v5.12 actual gameplay/screens captured in baseline* PNG/JSON.
- Actual Java native classes and absent old DOM roots, native research page.
- Research: real Cobra in Lab1, Fuel Injection queued there; Composite Alloys
  in Lab2; exact queue retained. audit-research.json.
- Build: real three left-cluster trucks selected; one bunker, reselected bunker,
  then guard tower queued, exit kept orders. Native save orders and all exact
  completed structures at (8,40),(9,40),(9,42): IDs160191/160193/160195, points
  400/400/300. audit-build-recovered.json and completed-recovery.json. Initial
  fixture incorrectly waited for three transient done rows simultaneously;
  durable save proved completion. Corrected wait is idle/queued0 + actual save.
- Ordinary production produced one MG tank in several earlier attempts. Full
  two-factory quantity/clear/completion check has NOT passed yet. Repeated
  fixture misses were diagnosed: stale accessibility dumps, missing dialog
  window origin, dismissal/first-frame input readiness. Replaced with tracked
  real native dialogs, singleton, committed-frame and scroll gates. Do not
  repeat an unchanged failing fixture. Inspect screenshots/state on failure.
- Picker-only real factory2 ID160167 + quantity5 and reset passed earlier.
- Editor: actual native EditText and three visibly open IME/Back returns; real
  engine-validated save Alpha, rename Edited with same ID, SaveAsNew Copy newID.
  Saved acknowledgements in editor-save-evidence.json. Names/IDs in live prefs.
  The copied blueprint delete Cancel/Confirm and process-restart persistence
  PASSED in audit-editor-finish.json after modal frame fix. Copy is deleted,
  Native-QA-Edited remains; preserve original Design1...8 entries.
- IME inspection originally used mIsInputViewShown, which stays true after the
  keyboard is hidden. Correct fixture uses mInputShown AND actual visible IME
  window flags, polls closure. Actual screenshot proved Back preserved form.
- Inspector formerly waited on a detached generic list in Design/Help; fixed
  to consider only attached lists. That fixture stall expired a match; an
  underlying tap hit real Replay and exposed stale page on new match. Added
  reset/session protection. New replay path still needs explicit verification.
- Pure production bridge/research/terrain/engine tests and new
  test-native-data-bridge.cjs passed. New test covers manual exact queues,
  in-flight edits, duplicates, removal, persistence rollback, stale navigation,
  wrong session rejection and whitelisted actions. Do not count retired HTML
  tests as native verification.

## Current next step

At writing, production phase is running on current rebuilt APK after
editor-finish passed. It started from fresh TD2 at6502 paused, 6 stock trucks,
no newly produced tanks; native library persists. Poll its exec session shown
in current conversation before mutating the emulator. It should pause at end.
Do not leave a failed fixture running while analyzing. Failure handler attempts
normal close + observable pause, but independently verify native wave clock.

## Still required before delivery

1. Finish real two-factory production, clear keeps active unit, exact native
   completions. Investigate any failure instead of repeating setup.
2. Complete native editor fresh journey on final APK with unique QA names (the
   current editor phase hardcodes Native-QA names; make per-run names to avoid
   matching the persistent Edited entry). Data race save/edit guard in source
   should also be exercised meaningfully.
3. Reproduce/inspect compact and enlarged text screens first. Current header
   wraps at width<850 OR scale>1.35 and hit height grows48*scale; predicted
   cramped phone layout at density420 + UI1.4 + font1.3. Must inspect, then fix
   responsive native geometry. Do not assume native alone looks/works well.
   Potential approach: one compact header, pinned More, short wave/Skip, compact
   minimum48dp, and scroll/adaptive page layouts. NOT implemented yet.
4. Related review ideas not yet implemented: inline native Build category tabs
   avoid dialog focus loss during active blueprint; More can exit build safely
   before modal. Test real focus/placement before asserting a bug. Research ETA
   should be marked approximate. Picker stable IDs preferable to current strict
   adapter-identity rejection for lab label updates. Native pause auto-resume
   checks `gameTime > pauseClock`; test backward native load while app-paused
   and fix if necessary. Do not add speculative changes without checks.
5. Actual rapid navigation/late focus, repeated IME returns, search separation,
   header/menu/Help/size, stats/commanders return, pause/resume/system+hardware
   Escape, F7/F8 fresh command replies, visibility/clipping/input restoration.
6. Field controls: real selection, nearby/all trucks, multiple selections, BOX,
   queue/move/STOP, camera base/zoom, pan/radar/pinch/tilt. Reuse normally produced
   units, not a 15-truck rebuild. Native orders/positions as evidence.
7. Fresh Dustfall/TD1: authored 4 trucks and raised platforms, real footprint/
   reachability and63x79 scroll bounds, rectangle radar, normal build+production.
   Both maps, native lab queues and exact engine effects. Include cyborg factory
   normal build/production if within relevant factory coverage; preserve rules.
8. A finite full exact-delivery APK journey only after stable. Clean Gradle build,
   compare installed SHA, screenshots and durable native engine saves. Old
   preliminary passes alone do not certify new sessions/geometry.
9. Explicit result/replay new-battle reset/session test. Can use a disclosed UI
   result-callback fixture for that Android lifecycle test; do not claim native
   victory/endurance or debug-seeded native gameplay. A real accidental defeat
   was observed earlier but no final replay verification yet.
10. Run actual production-source checks, Python
    verify-native-interface-package.py and verify-engine-preservation.py against
    v5.12. New package checker checks all assets exact, removed old UI, new native
    classes, art and original engine bytes. Full30 native rounds, physical GPU/
    audio/performance remain unverified; keep existing black-terrain limitation.
11. Update README/version/architecture/KNOWN-ISSUES and honest QA REPORT; current
    README still says v5.12. Refresh repository manifest via bundled Python
    tools/verify-project.py --refresh AFTER final source/evidence changes.
12. Package new Towers APK (do not overwrite frozen releases), COMPLETE source
    ZIP without builds/.gradle/keys/local SDK/ephemeral endpoints, SHA256 manifest
    and restoration info. No publishing or push. Source + delivery exact checked.

Keep commentary brief, factual, no premature completion claim. No redundant
questions. Do not spawn agents (not authorized). No CUA used; ADB/CDP purpose
built automation. Explicitly explain Android UI vs remaining engine WebView.
