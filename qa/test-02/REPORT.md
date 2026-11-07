# Warzone Towers Test 02 verification

Status: **all ten integrated native phases passed on the exact installed APK**,
including genuine native save/load, real Quit with nonempty construction ghosts,
fresh-battle recovery and Dustfall. Bounded QA retries are documented below;
this is not a claim that every attempt was uninterrupted. The final delivery gate
passed all 18 required reports and 12 scoped checks for this source snapshot.

The installed candidate is **Warzone Towers Test**, version **0.2-test (2)**,
package `com.rbabbit.warzonetowers.lab`.

APK SHA-256:
`64324e568fd21ac449958d3f0d6e0f289e1ef9a06befd1d05de550fee272822f`

The test app updates the previous test installation and keeps its private
designs and saves. Stable v6.4 remains a separate app and project.

## Changes

- BUILD and TRUCKS use the current camera view and real native truck selection.
  The hidden stock picker and captured battlefield transition are removed.
  Internal selection replies are fresh, so an older background snapshot cannot
  overwrite selection after the first truck is clicked.
- Returning from native STATS or a requested COMMANDERS state closes the native
  panel before field selection. Paused returns stay bounded and explain when
  Resume is required. The notification remains compact.
- Battle retirement clears cached controls, research work and construction
  markers; normal exits have a neutral result rather than a false HQ defeat.
  Real Quit with nonempty construction ghosts and fresh-battle recovery has
  passed on this candidate.
- The original icon, official artwork and normal **Warzone Towers Test** wording
  are restored. The compact HTML/CSS battle interface and official WASM engine
  remain in use.
- Dustfall requests a real north-facing engine camera and a position-only
  starting offset toward the battlefield. Native rotation, footer HQ,
  minimap/world taps and two completed raised-platform structures passed on
  this candidate.

## Observed checks on this APK

| Evidence | Observed result |
| --- | --- |
| [Source checks](code-checks.json) | All 18 named source regressions passed, including the causal fresh-selection-state test and its negative control. |
| [Package check](package-verification.json) | 486 runtime sources hashed; all 463 source assets match the APK. Compiled engine JS outside the generated package index, WASM, the complete frozen v6.4 data prefix, original artwork/icon, maps and mod are preserved. |
| [Startup](startup-delivery/lab-startup-qa.json) | Phone, wide and enlarged-text layouts, map selection, settings/Music returns and real Play passed. The installed APK hash matches the candidate. |
| [Visual review](visual-review.json) | 32 actual screenshots reviewed. Normal branding/punctuation and inspected controls are readable. Native truck highlights are visible; the corrected notification measures 33.83 pixels high. Dustfall and real Quit/recovery screens are included. |
| [Native navigation](navigation/native-build-navigation.json) | STATS and HELP to requested COMMANDERS state followed by immediate BUILD/item selection restore the three real native selected trucks. A paused STATS to TRUCKS request returns without resuming the game, then reselects after ordinary Resume. |
| [Paused returns](paused-returns/test-02-paused-returns.json) | Two rounds through Factory, Design, Queue, Research, Help and Stats: all 12 returns restore visible, interactive battlefield state; actual native clocks advance after Resume. |
| [Gameplay journey](gameplay-delivery/lab-journey-all.json) | Research assignment/queue, native research completion, ordinary production, design/template saving, overlay returns and layout phases all passed. |
| [Keyboard returns](gameplay-delivery/lab-journey-keyboard.json) | Repeated real keyboard open/dismiss/return passed while preserving the phone library. |
| [STOP, movement and building](building/wide-controls/audit-building-wide.json) | Four world checks passed: STOP cancels the group's work, placement/completion after STOP, movement replaces queued construction without restarting it, and a later tower completes. Explicit TRUCKS uses no captured field cover. |
| [Mixed FIFO](building/fifo-delivery/audit-smooth-fifo.json) | Three real sites complete in requested order: two `PillBox1` bunkers, then `GuardTower1`. Native structures reach 400/400/300 build points. The viewport and zoom remain constant and the live field stays uncovered. |
| [Compact layouts](layout-delivery/layout-journey.json) | Wide, enlarged-phone and compact extra-large-control profiles passed their actual viewport, column, catalogue and selected-template geometry checks. |
| [Genuine native save/load](save-roundtrip/save-roundtrip.json) | F7/F8 rewinds native time from 160002 to 149702. Ten structures and six stationary units retain their IDs, ownership and positions; waiting research and the phone library are preserved. Factory Back restores input while the native clock advances from 155002 to 156002. |
| [Real Quit and recovery](quit-delivery/test-02-quit-journey.json) | Real Quit/Confirm clears three previously accepted construction ghost sites to zero, reports neutral `exited`/`quit`, and hides the battle HUD/frame/input. The app's own start screen returns, followed by a new battle with Queue Back and native Pause/Resume working. |
| [Dustfall](dustfall/audit-build-display-td1.json) | Native yaw is 0 (north); the HQ projects to about (538,442) in a 1077x542 battlefield, 81.6% down toward the footer. Cold/repeated selection decisions agree; after radar navigation, real workers 160001/160003 build a guard tower at (8,71) and cyborg factory at (7,69). Both native foundation heights are 510 and match the raised previews; completion clears the ghosts. |
| [Scoped integrity](final-integrity.json) | All 4916 stable source files, stable APK/source ZIP, frozen test fallbacks and 17 saved stable designs match their checked baselines. Both apps remain installed. Whole-preference equality is not asserted; the baseline limitation is recorded separately. |

The [integrated master](integrated-journey.json) records all ten required phases
passed on the same installed APK, including documented bounded QA retries.
Existing phone designs were observed intact after the test APK update.

## Delivery packaging

Native gameplay and screen verification is complete for the scope above.
[The delivery gate](DELIVERY.json) records all 18 passing reports and 12 scoped
checks. The packaging tool verifies the source manifest, archive contents,
frozen fallbacks and exact tested APK before producing the APK and complete
source ZIP. Packaging does not replace the recorded emulator checks.

## Scope and retained limitations

The emulator uses ordinary authored units, actual Android touches and complete
ordinary native saves. Prepared saves avoid repeating long production setup;
normal production is tested separately. No units, research, power or world
positions are granted or rewritten for these journeys.

[Fixture diagnostics](fixture-diagnostics.json) distinguish setup failures from
confirmed product bugs. Interrupted eight-site fixtures were abandoned after
repeated readiness/reachability failures; they do not certify this release.
Current construction evidence comes from the passing three-site mixed FIFO and
STOP/movement journeys. The initial stale-state selection failure was a product
bug, and its causal regression is separate from fixture readiness corrections.

The genuine save/load journey passed after QA-only observation corrections.
The initial F8 observer used the wrong output channel; a later read timed out
while native Loading was visible. The final run observes the actual filesystem
log and allows a scoped readiness budget around F8. Native loading measured
19.893 seconds, close to the previous 20-second transport limit. The app binary
did not change for these corrections. Cleanup pause state is not evidence that
F8 deliberately restores Pause.

Some immediate screencaps contain the previous compositor frame. They are not
used alone as return evidence: the visual report identifies settled pause/resume
screens and actual native/DOM state. Requesting COMMANDERS with none available
retains the pre-existing native warning; requested/closed state acknowledgement
does not certify a populated COMMANDERS window.

Software-emulator black terrain remains. These checks do not certify physical
GPU rendering, audio/FPS performance, a complete 30-wave victory, or full
optional-download transfer/cancellation.

The initial test APK and complete source ZIP remain frozen with checksums in
`C:/timerApp/fallbacks/towers-test-before-fixes-20261107`. The preservation audit
confirmed all 4916 stable source files, the stable APK/source ZIP and the 17
stored stable designs unchanged, as recorded in [scoped integrity](final-integrity.json).

The saved fingerprint for all stable preferences does not match the current
file. Its current modification time predates the recorded baseline capture, so
that baseline cannot establish equality for every preference. No all-preferences
preservation claim is made; the source, APK and design comparisons above are
separate exact checks.
