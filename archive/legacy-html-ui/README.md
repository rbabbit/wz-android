# Frozen original HTML/CSS reference

These files remain the unchanged v5.12 reference. v6.2 restored copies under
app/src/main/assets and applies the scoped bug fixes there; this frozen
reference is not edited. Current evidence: qa/v6.2-html/REPORT.md. Native6.1
source is preserved separately under archive/native-ui-v6.1 and its frozen
APK/source ZIP. Historical tests reading this folder are baseline tests;
current HTML regressions read the active assets.

# Retired browser interface

These v5.12 source files and styles are retained for migration provenance and
historical regression tests. They are outside Android's assets directory and
are **not packaged or injected** in v6.

The runtime uses `TowersNativeUi.java` for Android presentation and the
`warzone-*-core.js`, `warzone-engine-input.js`, and `warzone-native-bridge.js`
assets for data, original engine input, queues and transport.

`tools/derive-native-cores.cjs` records the one-time extraction from this source.
The checked-in native core files are the maintained runtime sources. Normal
builds require no Acorn and never run that extraction script.

The historical browser UI tests still refer to these retired files. They do
not establish that the native UI works; use the native bridge tests and the
installed APK Android journeys for current verification.
