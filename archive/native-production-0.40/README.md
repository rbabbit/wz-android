# Read-only native factory observation

This revision adds `towersProduction` to conversion of the selected player's
factory structures only while `/tmp/warzone-towers-ui-v34` contains `1`.
The property is absent outside that Towers gate. It observes the existing
subject, total/remaining build points, current native production rate,
start identity, hold/power/capacity state and whether native future orders
exist. It issues no orders or power requests and changes no production timers,
gameplay state, queues, random state or save format.

`production-helper.inc` is the additive observer; `quickjs_backend.cpp` is the
complete changed source; `native-production.patch` and `source-overlay.json`
bind that delta to the original file in the complete native archive. The prior
display/research/keybind/Intelligence overlays remain byte-identical. Getter
calls that would emit notices or mutate production are deliberately avoided.

`scenario/warzone-towers-commands.js` validates a fresh subject and native
counters before publishing `factory.progress`. The identity includes the
factory, template and native start time. A held/power/capacity sample keeps
its work value but has no countdown. Remaining simulation time is an estimate
from the sampled native rate; it is not extrapolated with the phone clock.
Missing/inconsistent observations remain unavailable. A complete unit total
is reported only when the app knows its waiting jobs and confirms there are
no additional native future orders; otherwise the UI identifies app-only
waiting counts and leaves the total unknown.

## Rebuild and integration

Use the matching WSL/Emscripten source cache prepared by the preserved v0.36
recipe (`tools/build-native-intelligence-036.py`). That recipe and the full
original native source, earlier patches and complete changed sources remain
included in this source archive. Do not substitute an unrelated engine cache.

```sh
python3 tools/build-native-production-040.py --incremental-cache /absolute/matching/cache --raw-out /absolute/outside/repository/raw
python3 tools/build-native-production-040.py --incremental-cache /absolute/matching/cache --raw-out /absolute/outside/repository/raw --verify-only
python3 tools/integrate-native-production-040.py --raw /absolute/outside/repository/raw --out /absolute/outside/repository/integrated --install
```

The guard verifies the exact baseline or already-recorded candidate before
compiling/linking. An already-built identical observer is reused instead of
unnecessarily rebuilt. Raw outputs stay outside the source tree; the installed
matched JS/WASM pair is included in app assets. Integration reconstructs the
frozen package index and existing worker hook from the v0.39 fallback, then
performs the supported single-command-file append/reindex. Other virtual files
and the frozen authored data prefix retain their bytes. No compiled WASM or
program code is hand-edited.

`native-build.json` records the one observer-object compile and matched link.
It also discloses the focused source-review gate tightening and relink.
`native-runtime-integration.json` and `native-payload.json` bind the raw and
installed payloads. Nine focused source/VM normalization cases are in
`archive/production-progress-0.40-checks.json`.

These proofs establish source/build/package correspondence, not actual native
production, save/load, GPU, phone or emulator behavior. No emulator was used.
