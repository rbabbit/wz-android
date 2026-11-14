# Complete current-unit subject metadata

This revision preserves the v0.40 observer and adds only three native source
lines: convert the actual factory subject with the existing `convTemplate`,
attach its numeric template ID, and expose that complete `subjectDesign` on
the already Towers-gated production observation. Global `convDroid`, all
production work/state fields and all gameplay functions remain unchanged.

The script binds the complete template to the current observer ID, name,
body and propulsion before normalizing it. Constructor, repair, brain, ECM,
sensor and weapon equipment are retained from native data, not inferred from
display names or the last selected recipe. Unknown native future orders still
prevent asserting a complete remaining total; the UI now omits unsupported
summaries instead of showing internal fallback wording.

`native-production.patch` is the exact v0.40-to-v0.41 delta.
`native-production-cumulative.patch` and the complete `quickjs_backend.cpp`
retain the lineage to the original full source archive. All v0.40 proofs and
the earlier display/research/keybind/Intelligence overlays stay frozen.

Use the matching incremental WSL/Emscripten cache established by the preserved
v0.36 and v0.40 recipes. The full original native source, earlier changed
sources and patches remain in the complete source ZIP.

```sh
python3 tools/build-native-production-041.py --incremental-cache /absolute/matching/cache --raw-out /absolute/outside/repository/raw
python3 tools/build-native-production-041.py --incremental-cache /absolute/matching/cache --raw-out /absolute/outside/repository/raw --verify-only
python3 tools/integrate-native-production-041.py --raw /absolute/outside/repository/raw --out /absolute/outside/repository/integrated --install
```

The guard accepts only the pinned matching baseline or recorded candidate;
already-built identical outputs are reused. One QuickJS source object is
compiled and the engine is linked. Large raw outputs stay outside the source
tree; the installed matched JS/WASM pair is in app assets. The existing worker
hook/index lineage is retained and only the commands VFS script is appended
and reindexed. No compiled program or WASM bytes are manually edited.

Build/runtime/payload proofs here and five source/VM groups in
`archive/production-current-0.41-checks.json` bind the exact inputs. Six
focused desktop thumbnail/count groups are in
`archive/production-thumbnail-0.41-checks.json`. No native runtime, emulator,
actual factory queue, physical-phone or gameplay acceptance is claimed.
