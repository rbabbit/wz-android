# Towers touch-camera input, v0.50

This additive native delta changes only `lib/sdl/main_sdl.cpp`. Under
Emscripten, when the existing transient Towers UI marker contains `1`, a
middle-button press enters the normal `KEY_PRESSED` path even if the prior
press was less than 250ms earlier. The stock double-click path otherwise
turns the second press into `KEY_DOUBLECLICK`, which the drag recognizer does
not accept and `inputNewFrame()` clears while the finger remains down.

Other mouse buttons, runtimes without the marker, native release states,
drag threshold, camera coordinates and native `ValueTracker` smoothing keep
their existing implementation. The frontend release lifecycle is a separate
change owned by the v0.50 touch adapter.

The build recipe is `tools/build-native-touch-050.py`. It verifies the original
source archive, native commit, all eight previous source overlays, the v0.46
raw outputs and their unchanged payload in the preserved v0.49 APK. It then
executes exactly the prepared cache's existing object-compile, SDL static-
archive and executable-link commands. Only one of 344 engine objects changed.

`original-main_sdl.cpp`, `main_sdl.cpp` and `native-touch.patch` preserve the
exact source delta. `source-overlay.json` records the guards, commands and
pre-build object hashes. `native-build.json` and `native-build.log` record the
single-object build and paired raw-output hashes. Raw outputs stay outside
the repository at `C:/timerApp/_release-records/native-touch050/raw`; the
delivery integration must preserve v0.49's authored VFS and data package.

This native build step did not launch the game, an emulator or a browser.
Its compilation and hash checks do not establish gameplay or touch feel.
