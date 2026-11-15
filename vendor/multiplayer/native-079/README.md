# Official 4.7 client: Android waiting-room presentation (0.79)

This overlay starts with the retained `native-071` source, upstream commit
`7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`, netcode **16384 / 104**.
Only `multiint.cpp` and the private bridge suffix in `quickjs_backend.cpp`
change. The four remaining translation-unit overlays, combat selection policy,
private rules/bootstrap, ordinary game request handlers, simulation, and official
`.data` package stay unchanged. No binary-offset editing is used.

`mobile-room-native.cpp.inc` is included by `multiint.cpp`, giving this private
presentation bridge access to the same static handlers as the stock room UI:
`sendReadyRequest`, `SendTeamRequest`, `SendPlayerSlotTypeRequest`, and
`sendRoomChatMessage`. Requests address only the client's current native slot.
They preserve native host checks and do not mutate readiness, teams, or slot
types optimistically. An accepted local request is distinct from a later
host-confirmed snapshot. The chat hook observes `displayRoomMessage` once,
including native player/system messages, with a bounded 100-message sequence.
Host-only chat remains a private client-to-host message, using the stock prefix
and byte limit. Blind-simple rooms expose only the local player row and the
aggregate counts already visible in the official blind waiting room.

The bridge writes `/tmp/mp-mobile-room.json` only when content changes. An
actual hosted-room lifecycle generates a unique room generation; a real native
room draw and received options are required before `ready:true`. The ordinary
native state exports the same `roomGeneration`. Leaving, loading, and starting
gameplay invalidate the room. Local slot moves into spectator-only slots retain
the generation. The room action mailbox is
`/tmp/mp-mobile-room-input.json`, and its nonce/generation result is
`/tmp/mp-mobile-room-input-result.json`. Bounded deduplication prevents normal
poll/retry duplicates. Malformed, stale, oversized, invalid UTF-8, downloading,
locked, and non-room requests are rejected before entering native handlers.

## Rebuild from the prepared native source

The complete matching upstream source and 071 preparation/cache instructions
remain with the existing full-source release. With that source and Emscripten
environment prepared, these new scripts use the existing WSL cache:

```powershell
wsl -d Ubuntu-24.04 -- python3 /mnt/c/timerApp/wz-towers-lab/tools/prepare-multiplayer-native-079.py
wsl -d Ubuntu-24.04 -- python3 /mnt/c/timerApp/wz-towers-lab/tools/build-multiplayer-native-079.py src/multiint.cpp src/quickjs_backend.cpp
python tools/integrate-multiplayer-native-079.py
python tools/test-multiplayer-room-native-079.py
```

`prepare` refuses unknown edits, checks the upstream commit, copies the reviewed
six overlays and new include into `/home/punkech/wz-mp-070/source`, and records
their hashes in `source-overlays.json`. `native-ui.patch` includes the new helper
and can also be applied to a clean matching upstream tree. The warm compile
recipe intentionally rebuilds just the two changed translation units and relinks
their existing official dependencies. A fresh source checkout must first follow
the retained full dependency/CMake recipe; the two-object command is a warm-cache
recipe, not a replacement for an initial build.

The paired raw JS/WASM outputs and `qa/multiplayer-room-079/native-build.json`
record the actual compiler commands and native protocol header. Integration
reattaches the frozen official package index and existing Android transport/DNS
adapters, preserving data SHA-256
`9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424`.
`runtime-integration.json` pins the delivery pair and data hash.

The focused test compiles and executes the actual room helper in host C++ with
recording substitutes for the official network handlers. It tests permissions,
UTF-8 boundaries, requests, actual-state snapshots, generation fences, duplicate
requests, blind-room filtering, and lifecycle cleanup. It does **not** establish
Android rendering, a live host acknowledgement, or native gameplay. Exact-APK
emulator verification is recorded separately by the integration owner.
