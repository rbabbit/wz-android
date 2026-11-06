# Compact native Towers v6.1 verification

All 29 required reports passed on the exact clean candidate. [The machine-readable summary](final/summary.json) lists their names and hashes. This is finite emulator gameplay and screen verification, with the limits below.

Clean candidate: `d9a56ac548d479dce04dbddf8ad56ede2500754ddf7441265bff1d22475e4624` (version64 /6.1-compact-native).

The approved targets are the three actual Android mock screenshots in reference/. Changes implement the flat48dp header, compact Research/Factory toolbars, five full Standard catalogue rows, manual lab status/queues, compact production quantity and grouped waiting batches. Individual batch removal addresses exact waiting IDs and preserves active production, separate orders and other factories. Production shows elapsed simulation time and an indeterminate bar because the adapter exposes no trustworthy build-point percentage.

App-owned controls use Android Views. The official battlefield, radar, engine messages, green construction blueprints and stock pause/save/load/statistics/commander menus remain WebView/WASM/WebGL.

## Preserved fallback

Before runtime edits, the current v6.0 APK and complete source ZIP were copied to `C:/timerApp/_backups/towers-v6.0-before-compact-native-20261106/`. APK SHA256 `be349d592e4ee77f706b7630c2e4c3b27a9017aab1be62085432e27f746bb923`; source SHA256 `3c2ee82152793339c1f985679e01e6615447fb4f5206929952d7982ce81286fb`. Original root delivery files and the older v5.12 fallback remain unchanged. The candidate and both fallback APKs have the same verified signing certificate. Install as an update to retain private blueprint storage.

## Compact UI and persistence observations

- Compact native geometry, five complete catalogue actions, no selector ellipsis at Standard, direct lab/factory selection and quantity1..20/presets passed.
- Ordinary quantity-five tank production, two separate waiting batches, scoped removal, active-job preservation, other-factory protection, Clear waiting and actual normal tank completion passed.
- Native manual Cobra/Fuel/Composite queues, removal/re-add without changing active research, real Cobra completion and automatic advancement of only its manually queued Fuel topic passed.
- Real Android IME input, save, rename keeping the ID, Save new creating a different ID, confirmation cancel/delete, persistence across process restart and independent search state passed.
- Result/replay/session rejection passed using an explicit UI result callback fixture. It does not establish an engine victory.
- Seven active-module tests and exact engine/WASM/3273 resolved stock assets,35 resources,455 editable assets and embedded-source checks passed. The rules-only30-round harness is not native endurance.

## Environment and diagnosis

Owned emulator5556 /Warzone_Help_QA_220604 only, Android API36.1, headless SwiftShader and audio disabled. Ordinary complete native saves are reused without units, power or research grants. Fresh authored starts are also exercised. Observations use real Android touches, native diagnostics, actual simulation clocks and F7 native saves.

The preserved v6.0 baseline initially hit an emulator graphics ANR (RenderThread/EGL emulation pipe). Its trace remains in baseline/. Restarting the owned emulator with SwiftShader restored baseline and candidate testing without clearing user data. This is fixture diagnosis, not a claim of fixing the renderer.

A wide-profile fixture initially stayed portrait/letterboxed under Android16 despite its requested landscape Activity. Actual screen and header bounds exposed the mismatch. The fixture now sets physical2400x1080 landscape directly; affected wide phases are rerun at observed geometry. This is test setup recovery, not a product code change.

The first final editor run stopped on a corrupted separator in its test selector (`Viper` label); the actual picker label was correct. The tool was repaired and only that failed phase and subsequent dependent phases resumed. Historical failure evidence remains; the required current-hash passing reports determine delivery status.

## Additional observed gameplay

Native save/load rewound the actual simulation clock and restored the exact
saved lab queues after a different post-save queue edit. Fresh commands and
field input worked afterward. Repeated Research/Factory/Design/System Back
and engine statistics/commander returns passed. Skip Wave created real native
enemies and consumed its request file.

Selection toggles, actual box selection, normal tank movement, native queued
moves, Patrol-to-normal transition, targeted Stop and queued destinations
completed against native positions/orders. Camera presets changed real terrain
projection; ADB pan/radar and WebView pinch/tilt changed native camera state
and released held input.

Mixed construction survived More/Cancel, category Cancel, map/radar returns and
fresh repeat-item acknowledgements. F7 native saves confirmed all three exact
requested bunker/guard-tower types completed at the tapped sites.

Dustfall's fresh authored start, raised native truck heights, 63x79 bounds and
reachable platform sites passed. Native saves confirmed the exact tower and
cyborg-factory completion, plus normal MG-tank and Heavy Gunner Cyborg production.
The 2400x1080/density420/font1.3 views and 1080x600/density240/font1.3 placement
passed. Narrow feedback aligned with the physical tap and the exact tower
completed with input released. Actual geometry is recorded in final/actual-profiles.json.

The first narrow script retained an uppercase category comparison after labels
changed to title case. The real Structures menu was visible. Correcting that
test selector allowed the same prepared units to complete the narrow check;
no runtime code or world state was altered for this recovery.

## Live combat and researched model

The same ordinary battle completed five GuardTower1 structures at (14,46),
(12,46), (12,44), (13,44), (7,39). Manual Cobra research unlocked Body5REC;
a real Android-edited Cobra/Wheels/Machinegun blueprint was saved, normally
produced by factory 160167 as native tank 164593 and moved to (8,41).

The final native save records eight rewarded enemy kills and 68 cumulative
reward power, wave index 3 and a live HQ 160163 with 1900 health. Fifty-one
existing enemy IDs survived the tested Skip Wave advance. These are actual
engine droids/structures, orders, positions and reward globals. This finite
combat journey does not establish completion of all 30 rounds or native victory.

Combat fixture recovery reused the same accepted defenses and produced tank.
One planned build tap projected to physical y1103 outside the 1080-pixel screen
after native build viewport changes. The fixture now validates projected bounds
and uses visible reachable sites. The tank's move destination was outside the
camera view centred on its factory spawn; centring the camera on the destination
allowed that same tank to arrive. No units, power, research or world files were
edited. final/audit-native-combat.json retains continuation details and native
proof; the ordinary complete 24-file five-tower checkpoint is also preserved.

Matched-state native design QA passed after opening the approved reference and
installed screenshots together. See [design QA](../../design-qa.md) and the
combined images in comparisons/. Enlarged header/Battle/Qty20 text width,
height and parent bounds passed and the actual screenshots were inspected.

## Cold starts and delivery

Both maps cold-started in different app processes with fresh authored units,
working input and no new Android ANR. All 17 full saved blueprint objects
survived both starts unchanged. The researched Cobra model persisted while
production was disabled in each fresh battle until its components are
researched again. All five native transport files remained readable valid
JSON with actionable requests inert.

The emulator was returned to normal Iron Valley startup, Standard interface,
2400x1080/density240/font1, with no running battle. The clean candidate and
runtime source hashes still match. Signature/fallback hashes, all 29 required
current-hash reports, full repository manifest and source ZIP CRC are checked
by the delivery packager before its output is accepted.

Delivery artifact names:

- `Warzone-Towers-v6.1-Compact-Native.apk`
- `warzone-towers-v6.1-compact-native-source.zip`
- `Warzone-Towers-v6.1-Compact-Native-SHA256.txt`

[Design QA](../../design-qa.md), [implementation boundary](../../docs/NATIVE-ANDROID-UI.md)
and [fallback/update instructions](../../docs/NATIVE-UI-RESTORE.md) accompany the
complete editable source. No online/VPS/1v1 work or publishing is included.

## Limits

Software-emulator black terrain persists. Physical-device GPU rendering, audio, FPS and a complete native 30-round playthrough remain unverified. Multitouch is dispatched into the real WebView via CDP; this does not certify a physical touchscreen. Saved designs are private app data and are removed by uninstalling or clearing data.
