# v5.3: header, research status and construction window

Delivery candidate SHA-256:
`f9c9d4ad98d000eb933ff93b4f5018cb80c89face9c527b26ea6ea823ceb78b8`.

The three reported changes are implemented:

| Report | Change | Emulator evidence |
|---|---|---|
| Top commands and wave status clipped | Keep the native WebView at scroll origin while allowing HTML lists to scroll; retain the measured command-row height. | Startup, keyboard and repeated page returns; full header bounds and screenshots at 1280×576, 1080×600 and 1600×720; Standard and Extra large controls. |
| Active research, remaining time and waiting order unclear | Send queue edits immediately; show NOW RESEARCHING, estimated remaining time/progress, and an ordered UP NEXT list per lab. Preserve the selected technology by ID as availability changes. | Two real labs, visible countdown, two waiting topics, removal, native research points and completion, ordered next-job start, and selection retained through an unlock. |
| Custom build status overlaps purple truck window | Replace the full visible native builder-card footprint with one opaque construction panel. Keep the native tool alive underneath for real orders and blueprints. | Native three-site queue, all three completed, preview/tool exit, truck movement, and visible replacement at all three sizes. |

The final installed APK also produced one ordinary truck, selected it with the
nearby group and moved it after returning from Factory. No cloned/seeded units
or fifteen-truck production fixture were used in this audit.

## Current evidence

Only `verified-short`, `verified-compact`, `verified-wide`, `preservation.json`,
`console-check.json` and `delivery-gate.json` establish delivery verification.
Other v5.3 folders retain earlier attempts and diagnostics.

- [Research with active topic and ordered waiting list](verified-short/research-active-and-ordered-queue.png)
- [Native research points](verified-short/research-native-progress.json) and
  [native completion / next assignment](verified-short/research-native-advanced.json)
- [Native queued blueprints](verified-short/04-native-blueprints.png),
  [completed structures](verified-short/05-builds-complete.json) and
  [subsequent movement](verified-short/06-truck-moved.json)
- [Ordinary production and movement](verified-short/v53-production-results.json)
- [Compact ready construction screen](verified-compact/build-window-replacement-ready.png)
- [Wide ready construction screen](verified-wide/build-window-replacement-ready.png)
- [Delivery gate](delivery-gate.json) checks the installed APK hashes and native
  state, rather than treating script/build success as gameplay proof.

The official compiled engine and WASM are identical to frozen v5.2. Its entire
66,906,755-byte data prefix is retained; custom scenario files are appended and
reindexed. All 3,283 unchanged resolved assets are preserved. The original
Research artwork and palette remain in use.

## Iteration and fixture notes

The first research candidate failed the real emulator check because Upgrades
uses display-name keys. That candidate was rejected; the lookup and native
assignment tracking were corrected and retested. A remaining strip of purple
builder cards was caught in screenshot review; the replacement was extended
and the construction journey rerun on the delivery APK.

Fixture failures were separated from product changes: fractional CSS geometry
required a 0.05px assertion tolerance; early screenshots of the preparing overlay
were rejected in favour of waiting for the ready placement screen; one long
screen-check session reached normal defeat and was repeated in a fresh game.
The stock display-scale prompt and its follow-up tip were exercised while
retaining 100% native scale; those stock prompts can reappear after viewport
changes and are visible in some captures. These are not recorded as passed
gameplay failures. Native 125% scale was not certified by this audit.

## Limits

Research progress/time are explicitly labelled estimates: the public script
API exposes totals and upgraded lab rates, not native currentPoints. Native
completion remains authoritative. The counter uses game time, including lab
modules, rather than advancing on a wall-clock interval during a pause.

The emulator already has black terrain in frozen v5.2, in both Normal and HQ;
that rendering limitation remains. These tests do not certify physical Samsung
tablets, HQ appearance, audible output, or general native Save/Load. See
[the retained limits](../../docs/KNOWN-ISSUES.md).
