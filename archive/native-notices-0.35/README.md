# Towers camera and scenario notices

This cumulative `keybind.cpp` overlay keeps the v0.34 QuickSave success-message
guard and replaces only four camera-alignment success messages. North, South,
East and West retain their original heading changes and camera tracking actions.
When the existing transient `/tmp/warzone-towers-ui-v34` marker contains `1`, the
completed native action writes a `BNNOTICE` camera packet to stderr instead of
adding the green console text. Other modes retain the original console message.
All other native console calls, failures and errors remain unchanged.

`source-overlay.json` and `native-camera-notices.patch` bind these changes to the
exact archived v0.34 `keybind.cpp`. The full original native source archive stays
unchanged. A fresh build applies the v0.31 `display3d.cpp`, v0.34 `research.cpp`
and cumulative v0.35 `keybind.cpp` overlays with the original pinned build recipe:

```sh
python3 tools/build-native-notices-035.py --workspace /absolute/empty/workspace
```

The recorded shipping build used the verified, prepared v0.34 WSL cache:

```sh
python3 tools/build-native-notices-035.py \
  --incremental-cache /home/punkech/wz-blueprint-20261107 \
  --raw-out /mnt/c/timerApp/_release-records/native-notices035/raw
```

Only `keybind.cpp.o` compiled before one native link. The target's ordinary stock
data tasks do not replace any authored app data. The source-built JS/WASM pair is
integrated against the frozen v0.34 APK by `tools/integrate-native-notices-035.py`.
It retains the complete authored package/index and extends the private worker
filter with exactly one additional `text.includes("BNNOTICE")` term. The exact
before/after hook bytes and replacement recipe are recorded here; native errors
still reach the original console and existing BNTECH/BNQUEUE routes are intact.

`tools/embed-notices-035.py` then appends only two full script overrides:

- `scenario/warzone-towers-config-reader.js` replaces the three round banner
  console calls with an actual authored-round packet; rank, detection sound,
  continuation, wait logic, template selections and RNG calls are retained.
- `scenario/warzone-towers-printsettings.js` removes the generic startup banner
  now owned by the native map briefing. The existing IS_HACK warnings remain.

The append/reindex proof is `archive/notices-0.35-native-payload.json`. Native
build and integration records are under `qa/0.35-notices`. Source/VM checks are
separate from exact-APK emulator observations and do not establish gameplay or
visual acceptance. No global console clearing or message suppression is used.
