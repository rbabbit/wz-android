# v4.7 startup Music audit

Final native run: passed on the installed APK identified in `test-environment.json`.

The user's four supplied screenshots show v4.6 stuck between the pause menu and
Music: the wrapper replaced the battle header before confirming navigation.
The v4.6 APK/source and matching SHA-256 values were saved before changes under
`C:/timerApp/_backups/warzone-towers-v4.6-before-startup-music-20261103`.

v4.7 removes the in-game Music command, menu traversal, injected Android Music
touches, pointer interception and header-hiding CSS. Native startup UI lists the
39 original album tracks, saves selections, and keeps START GAME at the top
right while scrolling. Music remains an optional verified VPS download.
Selections are applied as the engine's user `music.json` preferences after
IDBFS restores saved storage and before the original playlist is read. No
official album, audio or compiled engine content is changed.

`startup-music-run.log` covers real Android checkboxes, ALL/CLEAR, blocking an
empty enabled playlist, allowing Music off, saved choices across Back and process
restart, the last album and the fixed Start button. Native screenshots and UI
trees are retained. A System UI ANR after emulator boot was dismissed with Wait;
it was separate from the app. A transient null UI hierarchy was retried using a
fresh dump, never stale coordinates.

`final-music-battle-run.log` checks actual original Opus opens/reads, the exact
chosen track and native preference contents, and eleven visible/active battle
commands with no Music button or hidden-header mode. The matrix and extended
logs read fresh native QuickSave orders for one/six trucks, mixed defences,
invalid/rapid/cancelled taps, camera gestures, minimap, HELP/TECH return and STOP.
The extended run includes live enemies after Skip Wave.

Tests run on Pixel_10_Pro, Android 16, WebView 158, with SwiftShader and
`-no-audio`. The pre-existing emulator black-terrain issue, physical Samsung
startup and audible output quality remain outside the proven results.
