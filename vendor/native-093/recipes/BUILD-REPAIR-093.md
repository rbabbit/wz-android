# Native 0.93 repair and guarded STOP

Run from the complete project root under the retained Ubuntu-24.04 WSL build
environment. The preparation and build scripts validate the original order.cpp
and keybind.cpp against the actual retained source family. They do not edit the
warm sources, original objects/libraries or original generated outputs.

```sh
python3 tools/prepare-native-repair-093.py --refresh \
  --baseline-project /mnt/c/timerApp/github-staging/wz-android-0.92 \
  --offline-stock /home/punkech/wz-blueprint-20261107/source/src/order.cpp \
  --mp-stock /home/punkech/wz-mp-070/source/src/order.cpp \
  --offline-keybind /home/punkech/wz-blueprint-20261107/source/src/keybind.cpp \
  --mp-keybind /home/punkech/wz-mp-070/source/src/keybind.cpp
python3 tools/build-native-repair-093.py --rebuild
python3 tools/check-native-repair-policy-093.py
python3 tools/check-native-guarded-stop-093.py
python3 tools/integrate-native-repair-093.py
```

Then run `python tools/check-native-repair-loader-pairs-093.py` on the host.
`--refresh` and `--rebuild` are required only when replacing prior experimental
outputs. The scripts retain prior preparation/build records; the complete first
0.93 native candidate was additionally preserved externally before the guarded
STOP build, including all source, objects, raw outputs and evidence hashes.

Seven isolated objects produce three matched native lineages. The generated
programs and raw ASM_CONSTS remain paired across all six installed full loaders;
preload indexes and frozen data files are retained. `native-build.json`,
`runtime-integration.json`, `source-preparation.json` and `checks/` provide exact
inputs/results. Source stub tests are not Android gameplay verification.
