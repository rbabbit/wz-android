# Multiplayer spectator capability overlay 0.82

Matched official 4.7 commit: `7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`.
This follows the immutable `native-080` client. Only the player-private mobile
UI portion of `quickjs_backend.cpp` changes; official game APIs, room handlers,
blind-room privacy, simulation, protocol 16384/104 and multiplayer data remain
unchanged.

The native snapshot adds `realPlayer`, `spectator`, `canIssueOrders` and
`cameraSafe`. An observer can render and move the camera, but cannot initialize
or tick an owned UI VM, select/lock a watched player's units, open owned facility
pages or read owned research reports. `realSelectedPlayer` is authoritative:
watching a regular player's index does not turn the observer into that player.
Changing to observer disposes any prior private UI VM and its unsent events.

`mobile-ui-native.cpp.inc` is retained as the reviewed source helper. Its exact
expansion is appended to the byte-identical 0.80 QJS API prefix. The other five
translation units and two room include files retain their 0.80 bytes.

For the prepared Ubuntu-24.04 WSL tree at `/home/punkech/wz-mp-070`, run:

```
python3 /mnt/c/timerApp/wz-towers-lab/tools/prepare-multiplayer-native-082.py
python3 /mnt/c/timerApp/wz-towers-lab/tools/build-multiplayer-native-082.py src/quickjs_backend.cpp
```

Then on the host run `python tools/integrate-multiplayer-native-082.py`.
Preparation rejects unknown warm-tree edits and records the full source patch;
the build compiles the one changed object and relinks the existing matched
client without rebuilding data. Full-source reconstruction prerequisites and
the six-overlay extraction procedure remain documented in the retained
`vendor/multiplayer/README.md` and `native-080/README.md`; these commands are a
warm-cache recipe, not a claim that the cache is included in the release.

`tools/test-multiplayer-spectator-native-082.py` executes the actual small
capability helper with host C++ fixtures and verifies owner dispatch gates and
frozen inputs. It does not execute Android or native game/network simulation.
Exact-APK emulator evidence is recorded separately by the delivery workflow.
