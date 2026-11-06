# Towers compact native layout — verification plan

The approved visual targets are reference/battle.png, research.png and factory.png,
rendered with actual Android controls at 1080x600/density 240/font 1. The previous
v6.0 APK and full source are frozen in C:/timerApp/_backups/towers-v6.0-before-compact-native-20261106.
The old source ZIP CRC and both SHA-256 values were verified before editing.

## Reproduction and issue/check list before code changes

The installed baseline hash is be349d592e4ee77f706b7630c2e4c3b27a9017aab1be62085432e27f746bb923.
Current field screenshots and native code confirm bordered buttons, outer margins,
large padding and a header taller than the target 48dp. Exact-v6.0 Research,
Factory and Design captures from the prior delivery are copied into baseline/;
they retain their original wide/enlarged profile, not the narrow reference profile.
The current fresh native fixture was started and observed paused at gameTime 6002.

- Replace the pill header with a flat 48dp rail, selected tab accent, separate power/wave labels.
- Remove duplicate Research/Factory page headings; keep selector/filter/search/Battle in one 48dp toolbar.
- Use 32dp art, 14/11sp catalogue text and 60dp rows with stable action widths; target five full rows at Standard.
- Keep actual selected-lab current/waiting queue and other-lab status in a narrow scrollable column.
- Add compact quantity minus/presets/plus, and preserve selected factory, active production and waiting queues.
- Apply consistent typography/spacing to Design/library/Build/Orders/Help while preserving 48dp input.
- Preserve manual research, blueprint IDs/storage, stable list touch deferral, session/navigation guards and input restoration.
- Exercise related selection, queue, movement, production, construction, camera, navigation and keyboard paths.
- Compare real installed screens against the approved mocks at the same geometry, using real live state.
- Verify native orders and completion on both authored maps and actual combat, beyond screenshots/builds.
- Recheck compact, enlarged-text and density changes; use complete ordinary native checkpoints.
- Preserve official engine/WASM/assets/mod/map; document any app adapter additions accurately.
- Clean-build final APK; run complete relevant exact-APK journey after stabilization; package only passing current-hash evidence.

## Baseline fixture incident

Before any runtime edits, the software emulator showed an Android ANR while loading
v6.0. Android's trace has main waiting on DrawFrameTask; RenderThread is in
libEGL_emulation qemu_pipe_read / glGenTextures_enc. Screenshot and trace are
retained in baseline/. The native engine later reached ready and paused, but the
ANR dialog recurred during capture. This is recorded as an emulator-rendering
incident, not attributed to the proposed layout. Recovery is bounded: reset the
owned session, then require clean cold starts and gameplay on the candidate.
No device data is wiped and no units, power or research are granted.

## Honest boundary

Android controls remain native. The real battlefield/radar/blueprints and stock
engine menus remain WebView/WASM/WebGL. The approved mock used sample values;
production progress will display only state available from the real engine,
not a fabricated percentage. Physical GPU/audio/FPS and full native 30-round
endurance remain separate, explicit limits unless actually exercised.
