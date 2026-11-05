# v5.7 supplied Tower Defense mod

Tested 2026-11-05 on the owned emulator-5556, with no audio. Clean APK and
installed APK SHA-256 both:
`f8e9e93fe8d4332247c54f861986e670329f443b83159ca665470d001324ebbb`.

## Replacement

The user's WZmodTowerDefense-v4.7.0-a.zip is preserved with its SHA-256 under
vendor/tower-defense/original. All 18 supplied files resolve byte-for-byte in
the APK. The 34 retired Survival paths are absent from the active package
index; the original bytes and v5.6 fallback remain preserved. The original map,
official engine/WASM, data prefix and unrelated assets are unchanged.

The supplied mod now owns the 30 timed rounds, templates, ranks, enemy research
delay, cost-based kill rewards, HQ defeat and round-30 victory. The mobile
adapter observes its schedule and advances the current wait for Skip. It does
not introduce a second spawner, free units, player auto-research or new balance.
The HUD and Help reflect the three-minute preparation and timed rounds.

## Observed on the exact APK

An ordinary fresh match, normal production and normal construction were used.
No units, structures, research or power were seeded. Five reachable defensive
towers were built with the starting three western trucks. The match progressed
through round 5. The test defenses subsequently lost the HQ at game time
617.5 seconds; the native defeat state and Android defeat panel were observed.
That defeat is gameplay, not a claim that the test defense wins the mod.

- Native preflight resolved all 72 configured templates, with no missing parts.
- Original rounds 1–4 advanced on their own timer, retaining survivors. Skip
  advanced round 4 to 5 once while old native enemy IDs remained present.
- 207 recorded reward events, including kills replayed after loading, each
  increased player 0 power by exactly the original formula. Examples include
  cost 2 → 6, cost 44 → 29 and cost 105 → 47. These are kill rewards, with no
  separate wave-clear bonus. The rules test also checks no enemy-bank debit,
  friendly/feature payout or duplicate adapter credit.
- Manual labs ran Hover and Engine research, with Composite Alloys queued
  behind Hover. Switching labs changed the right sidebar's topic, image,
  progress, estimate and queue. Player labs stayed idle until explicit input.
- Native QuickLoad restored the canonical script context, round, deadline,
  config-reader index, enemy slot, manual lab topics and pending queues. The
  saved spawn FIFO continued from its suffix as native spawning resumed. A
  fresh command reply succeeded after loading. See the before/after full native
  JSON and mod-gameplay-results.json. Start a new battle after upgrading;
  legacy Survival saves are incompatible.
- The full mobile journey passed at 1280x576, 1080x600 and 1600x720: BUILD
  opening/group selection; two real tower FIFO orders; duplicate rejection;
  actual ETA/progress; reclaimed truck-window terrain input; 2x2 facility and
  factory-module queues/completion; normal truck and combat-unit production;
  design/save and visible Android keyboard/Back; repeated Research/Factory
  returns; produced-unit field selection and native MOVE/changed position;
  All Units, PATROL, STOP, Trucks, BOX and Select/Move; compact/large controls;
  automatic placement completion and minimap restoration. Captured screenshots
  were inspected. delivery-results.json records this journey and APK identity.
- The new victory caption was inspected through the Android callback as a UI
  fixture. It is not evidence of a native 30-round win.

## Rules and package checks

All active tools/test-*.cjs pass. test-tower-defense.cjs executes the supplied
scripts/config plus adapters through all 30 rounds (2,526 configured enemies),
checking timing, all power-setting formulas, enemy-only research, Skip
deduplication/callback cancellation, survivors, HQ loss and final victory.
Template spawning is stubbed in that scheduler test; real component resolution
is the native preflight above. Superseded Survival tests are archived explicitly.

verify-tower-defense-package.py verifies exact supplied files, inactive legacy
paths, unchanged engine/WASM/data prefix and unrelated assets, source-to-APK
identity and explicit scenario overrides. The delivery uses a clean Gradle
build; its APK is 91,184,803 bytes.

## Fixture corrections and limits

Initial defensive sites were unreachable terrain; native previews identified
clear sites on the HQ approach before construction. Camera-dependent radar
coordinates were calibrated against actual terrain. A travel-time assumption
was replaced with a longer observable-work wait, then the related checks
continued using completed native objects. Research selectors were corrected to
the iframe document. The Save/Load comparison allows the saved spawn FIFO to
drain normally between load and inspection. Iteration failures are retained as
evidence; verify-mod-session.cjs rechecks the captured native states.

The complete 30-round native combat campaign/endurance run was not played.
Research assignment/progress/queue restoration were checked in this build;
research completion after that restoration was not observed before HQ defeat.
The emulator's pre-existing black terrain persists in Normal and HQ; this
replacement does not fix that renderer problem. Physical-device startup,
cutouts, HQ appearance, audio output and performance remain uncertified.
