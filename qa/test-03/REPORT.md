# Warzone Towers 0.3 verification

Status: **scoped exact-APK verification passed**. All eight integrated emulator
phases, 20 source checks, source/package checks and preservation checks passed.
Delivery packaging is gated separately from these observed gameplay results.

The candidate is **Warzone Towers**, version **0.3 (3)**, application ID
`com.rbabbit.warzonetowers.lab`. APK SHA-256:

`a623655e457bb8e397267b711a019b3787a22402b29cd182444f3a21bdae8ef4`

Delivery names: `Warzone-Towers-0.3.apk`, `warzone-towers-0.3-source.zip` and
`Warzone-Towers-0.3-SHA256.txt`. The visible app name and filenames omit TEST.
The separate internal ID is retained to update the existing experimental app.

## Changes and observed package checks

The original audit reproduced BUILD selecting no workers after they had moved.
Script snapshots expose truncated tile coordinates; projecting those tile centres
missed the actual native truck models by roughly 16–22 pixels in the audited
view. The replacement uses real native BOX selection, reads actual selected IDs
and retains constructor IDs only. The unchanged original 24-file save is the
final reproduction fixture, rather than a newly centred stand-in.

- BUILD/TRUCKS selection retains engine focus while native selection gestures
  are consumed. This addresses a WebView focus transition cancelling selection.
- Native box presses are separated by at least 300 milliseconds and observed
  native frames. The original engine treats presses within its 250-millisecond
  double-click interval specially; repeated rapid boxes could therefore issue
  movement instead of selection. The engine itself is unchanged.
- Selection geometry still accommodates small regions and nearby combat units.
  Ordinary construction and module placement use the selected real workers.
- While selection replies are pending, the wrapper checks for them every 45
  milliseconds. It retains at most four verified rectangles; each selection
  still begins with a fresh coarse scan and checks actual native IDs, with a
  fresh fallback when a retained rectangle no longer matches.
- Launcher/start/splash wording is **Warzone Towers**, version **0.3**. The
  original icon, compact layout and existing private data remain in use.

[Package verification](package-verification.json) passed: all 463 source assets
match the APK and all 486 runtime sources are hashed. Only six runtime files
differ from the preserved prior version: four name/version files and the
command/input adapters. Compiled engine JS/WASM, data, scenario rules, maps,
mod and original resources are unchanged. All 20 [source regressions](code-checks.json)
passed. These checks do not establish gameplay success by themselves.

## Observed emulator results on this candidate

- [Original-save reproduction](repro-delivery/repro-check.json) passed using the
  unchanged complete 24-file Dustfall save. Immediate BUILD/item choice and
  TRUCKS select the original two off-centre constructors. All four native unit
  positions and orders are identical before and after the selection actions.
- [Branding](branding/branding.json) passed with the actual normal
  **WARZONE TOWERS** start screen and no visible TEST wording.
- [Modules and save/load](module-journey/module-journey.json) passed on fresh
  authored Dustfall: two Research Modules and one Power Module completed at
  native 500 points each; both moved workers were genuinely reselected;
  duplicate Power Module placement returned the native module limit. An
  ordinary Guard Tower completed at 300 points. Genuine F8 rewound the native
  clock from 171002 to 167002 with all three upgrades and the tower preserved;
  Factory Back restored actual input, with the clock advancing to 170502.
- [Mixed selection and construction](mixed-selection/mixed-selection.json)
  passed using six authored trucks and two normally produced tanks. BUILD and
  TRUCKS selected only visible constructors 160003/160005/160011 with native
  highlights, leaving all eight native orders/positions unchanged for selection
  alone. Two ordinary towers completed FIFO at 300 points each; selection during
  construction preserved work. Movement/STOP away from centre and actual
  Stats/Factory/Help/Research returns also passed. A repeated BUILD reused a
  verified rectangle (5 boxes/2 queries versus the first mixed BUILD's 9/6);
  this records actual selection work, not a milliseconds or FPS measurement.
- [Layouts](layout-selection/layout-selection.json) passed at 2400x1080 and
  compact 854-wide landscape with font 1.3/control scale 1.4. The actual compact
  catalogue, Exit control, three native highlights and radar remain visible.
- [Preservation](final-integrity.json) passed: all 4916 stable source files,
  the stable APK and current binary preference baseline, and all 12 recorded
  frozen artifacts match. Preference bytes are checked with raw ADB exec-out
  and independently on the device; no stable app launch or writes were used.

## Integrated returns and recovery

The [integrated runner](integrated-journey.json) passed all eight phases on this
exact installed APK, finishing at 2026-11-07 11:17:38 UTC. The final phases were:

- [Twelve paused returns](paused-returns/test-02-paused-returns.json): two rounds
  each through Factory, Design, Queue, Tech, Help and Stats. Actual native pause
  and resumed clock advancement establish restored input, rather than a cached
  command snapshot.
- [Repeated keyboard returns](keyboard-returns/lab-journey-keyboard.json): the
  Android keyboard was visibly open before Back, dismissed in both rounds and
  left the Design page and phone library intact.
- [Real Quit and recovery](quit-delivery/test-02-quit-journey.json): actual
  native confirmation, neutral BATTLE ENDED screen, hidden/inert battle frame
  and HUD, own Warzone Towers start screen, then a new battle with Queue/Back
  and Pause/Resume working. This run began with zero ghost sites; it establishes
  the empty exit state, not clearing nonempty construction sites.

The [visual review](visual-review.json) records the hashes and precise scopes of
29 actually inspected current-candidate screenshots. It samples the paused
Factory/final Stats returns, keyboard and real Quit/new-battle screens alongside
selection, modules and both layouts. Script passes alone are not the visual
proof.

The mixed fixture initially treated only native orders 0/1 as stationary;
ordinary GUARD order 25 with `moveStatus=0` is also stationary. The QA oracle
was corrected while reusing the same eight ordinary units. One current mixed
startup raced WebView tab registration; the QA connector now waits for the
observable game tab and reused the already launched Iron Valley. The first
three passing phases were retained. Both corrections changed QA readiness,
without changing this APK or granting units/resources. The startup diagnostic
is preserved in `audit/mixed-startup-webview-race.json`.

The mixed fixture is a complete ordinary native save with six authored trucks
and two previously normally produced tanks; it does not grant units, power,
research or positions. Fresh authored Dustfall independently verifies modules
and ordinary construction. Earlier candidate passes are not reused as final
proof, and the integrated pass is not claimed to be uninterrupted.

## Historical candidate evidence

The [c91 preflight module run](preflight-c91/module-journey/module-journey.json)
completed two Research Modules, a Power Module, an ordinary tower and genuine
save/load. Those passes belong to c91, not the current candidate. Its one shared
queued-image filename was later overwritten by duplicate rejection; that image
was excluded as positive acceptance proof. The current module runner uses
distinct accepted/rejected filenames. Current candidate results must be read
from its own matching report after it finishes.

Earlier candidates in `preflight-22489/` and `preflight-5168/` exposed focus and
rapid-box input problems. A separately paced sequence of the same five native
boxes left all four native units unchanged, supporting the double-click cause.
That diagnostic is not a final-candidate gameplay pass.

The pre-change APK/source/checksum fallback is frozen in
`C:/timerApp/fallbacks/towers-before-module-fix-20261107`. The [Test 02 evidence](../test-02/REPORT.md)
and older artifacts remain immutable. Stable v6.4 remains separate and its
current preservation checks are recorded above. Final native verification is
recorded here; delivery gates check these reports before source packaging.

Software-emulator black terrain persists. This focused work does not certify
physical-device GPU rendering, audio/FPS performance or a complete 30-wave game.
