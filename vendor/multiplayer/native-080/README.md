# Official4.7 room map-preview export (0.80)

This additive overlay preserves the complete079 waiting-room bridge and its
matched official4.7 client. Only `multiint.cpp` and its two private room includes
change; `quickjs_backend.cpp`, all game/render/input translation units, native
protocol16384/104, private gameplay runtime and the official data package remain
unchanged.

The official `loadMapPreview()` already resolves the exact map name/hash and
loads either the built-in dataset or the downloaded custom map package. Its
`WzMap::generate2DMapPreview()` output contains actual terrain, oil, structures
and player-colour/position remapping. A new observation hook copies only that
successfully generated RGB output. The app does not guess a thumbnail by name,
execute a second generator, change random seeds, or export the official
empty/question-mark fallback. Images are bounded to256×256 RGB (196608bytes).

`room.mapHash` and `room.mapPreview` are additive fields in room schema79.
`mapPreview` reports status, reason, room generation, exact map name/hash,
revision, dimensions, three channels and the fixed native filesystem path
`/tmp/mp-mobile-room-preview.rgb`. The file is written only when actual pixels
or their context change. A map/hash/colour/position change, active download,
blind-simple room, invalid preview or room exit invalidates previous bytes.
Blind-simple rooms retain the native privacy restriction. Downloads and genuine
native preview failures produce explanatory states rather than a fake image.

The MP-only adapter's `PcMultiplayerNative.roomMapPreview()` getter reads the
bounded file once per matching room-generation/hash/revision and returns an
independent `Uint8Array`. It validates metadata, dimensions, byte count and the
fixed path before exposing pixels. Leaving the room or hiding the page clears
that cache. The getter issues no native command and cannot change gameplay.

## Reproduction

Use the retained exact upstream source
`7d3d8e51a61ceee89e6bf672a41337e1a9cd7392` and dependency/CMake setup described by
the existing071/079 source instructions. For the already prepared WSL cache:

```powershell
wsl -d Ubuntu-24.04 -- python3 /mnt/c/timerApp/wz-towers-lab/tools/prepare-multiplayer-native-080.py
wsl -d Ubuntu-24.04 -- python3 /mnt/c/timerApp/wz-towers-lab/tools/build-multiplayer-native-080.py src/multiint.cpp
python tools/integrate-multiplayer-native-080.py
python tools/test-multiplayer-room-native-080.py
node tools/test-multiplayer-room-map-adapter-080.cjs
```

The prepare script refuses unknown modified translation units and pins all six
source overlays plus both room includes. `native-ui.patch` contains the complete
overlay against clean upstream, including the two added includes. A fresh source
tree needs the retained full initial toolchain/dependency build first; the
single-object command above is deliberately a warm-cache rebuild. Build and
integration records pin the paired raw/delivery JS/WASM and frozen data hash:
`9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424`.

`qa/multiplayer-room-080/native-checks.json` records53 host C++ checks of the
actual room/export helpers. The native generator and network request seams are
stubs in that harness. `adapter-map-checks.json` records19 checks of the actual
adapter against synthetic native FS packets. These checks do not establish a
real downloaded-map transfer, Android rendering/touch, or native gameplay;
exact-APK emulator observations are recorded separately by the integration owner.
