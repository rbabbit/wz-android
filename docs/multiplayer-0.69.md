# Multiplayer in the main app — v0.69

The main home screen now has a compact **Multiplayer** button. It opens the
official PC lobby room list and joins compatible Warzone 2100 4.7.0 TCP/IPv4
games. The existing Towers, Campaign and FFA engines and assets are unchanged.

The PC-compatible engine is isolated in its own activity, asset directory and
`/warzone2100-online` configuration directory. The official lobby requests are
signed by that engine and forwarded unchanged through Android HTTPS. Android
also provides its raw TCP transport. No server or VPS deployment is required.

During a match, use the mobile toolbar for Research, Manufacturing, Build,
Base and All combat, and the lower buttons for All units, Trucks and Stop.
Tap units and the ground to select and issue orders; drag to pan; use two
fingers to rotate, zoom or tilt. These issue stock engine input rather than
changing multiplayer simulation rules. Research/manufacturing/build menus
currently remain the original PC menus.

The public bot autohost has two Ready stages: check Ready in its waiting room,
then check Ready again after it transfers you into the actual game room and
downloads its selected map. That transfer must not be mistaken for leaving.
Native Quit, disconnects and Android Back return to our live lobby list.
Android Back first offers Stay or Return. Home goes back to the main app.

The exact delivery APK was installed and checked on the existing Android
emulator. An actual public bot game started, four real trucks were selected
and moved, and camera panning/rotation/zoom/tilt were observed. A finalized
native replay confirms the synchronized human move order. Research,
Manufacturing and Build shortcuts, native Quit, Android Back, repeated entry,
and other mode launch/navigation screens were checked. The original emulator
userdata was restored afterwards. Evidence and explicit limits are in
`qa/lab/mp069/delivery-verification.json`.

This is not a certification of every public server or a full match victory.
The retained Web engine supports PC 4.7.0 TCP/IPv4 joining; it does not provide
GNS/UDP transport or hosting. No advertisements or public chat were used in QA.

The v0.68 APK and complete source archive remain the immutable fallback.
`archive/fallback-0.69.json` records their hashes. The delivery source preserves
all 12,176 prior source entries and includes the original multiplayer engine
inputs, upstream source reference and licenses. See
`vendor/multiplayer/README.md` for engine provenance and reproduction.

Build the Android app with the existing JDK/Android SDK and
`gradlew.bat :app:assembleDebug`. The final app assets are included; the sibling
multiplayer experiment is not needed. `tools/import-multiplayer-069.py --check`
verifies the vendored engine inputs without overwriting app files.
