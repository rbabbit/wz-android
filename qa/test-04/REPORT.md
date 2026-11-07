# Warzone Towers 0.4 verification

Status: **all seven scoped integrated emulator phases, source/package checks,
visual review and preservation checks passed on the exact 0.4 APK**. Two QA
readiness corrections are recorded below; this was not an uninterrupted run.

The app is **Warzone Towers**, version **0.4 (4)**, application ID
`com.rbabbit.warzonetowers.lab`. Installed APK SHA-256:

`6f143ed3ca0f0678cd805e59fda00d97e8e859373e73b438f725e301f7201734`

Delivery names are `Warzone-Towers-0.4.apk`, `warzone-towers-0.4-source.zip`
and `Warzone-Towers-0.4-SHA256.txt`.

## Scope and preservation

This version improves module placement and feedback: guidance about the
matching building, actual parent outlines and roof/body hit testing, eligible,
queued, upgrading and full capacity, parent-based accepted-preview cleanup,
and keeping the module tool open after completion. Factories can queue their
second level while the first is underway. Native parent IDs, status, capacity
and real workers remain authoritative. Ordinary construction retains its
normal site flow and auto-exit. Module feedback stays beside the sidebar;
reselecting the same module restores actual counts.

The 0.3 APK, complete source ZIP and checksum file are preserved with a verified
manifest in `C:/timerApp/fallbacks/towers-before-module-ui-fix-20261107`.
Stable v6.4 remains a separate app/project. The read-only
[final preservation comparison](final-integrity.json) passed: all 4,916 stable
project files, its installed APK and raw preferences, and 16 older original or
fallback artifacts match their baselines. Both app IDs remain installed.

## Source and package checks

All 23 [source regressions](code-checks.json) passed on the frozen source.
They cover module parent validation, queued capacity, frontend placement,
original mesh geometry, guidance reselection, preview cleanup and the existing
construction, selection, research, production and navigation paths. These are
code checks, distinct from the native gameplay evidence below.

[Package verification](package-verification.json) passed: all 463 source assets
match the APK and all 486 runtime sources are hashed. Compiled engine JS/WASM,
the frozen 0.3 data prefix, supplied maps/mod, original resources and icon are
preserved. The intentionally modified virtual file is
`/data/mp/tests/warzone-towers-commands.js`; the package index exposes the
appended custom command adapter. The report lists seven changed runtime files
and one changed scenario source. Signature verification passed.

## Native gameplay and screen verification

The [integrated journey](integrated-journey.json) passed all seven phases on the
hash above. The [emulator verification](emulator-verification.json) passes its
13 scoped checks. The [visual review](visual-review.json) records 72 directly
inspected final-candidate PNGs, each with its own hash, without a remaining new
material visual finding. No older preflight pass certifies this candidate.

| Final phase | Observed result |
| --- | --- |
| [Dustfall modules and native save/load](module-journey/module-journey-dustfall.json) | Real roof/body taps accepted two Research Modules; a Power Module and ordinary Guard Tower completed in the requested FIFO. Queued/upgrading/full feedback, retained module tool, ordinary auto-exit, radar and Factory return were inspected. |
| [Factory levels and normal production](factory-journey/module-journey-factory.json) | Factory 0→1→2 completed in FIFO order; one working/one queued, third-repeat rejection and full 2/2 were visible. Normal Produce 1 created a native Truck from that factory. |
| [Module layouts and same-item reselection](module-layout/module-layout.json) | All three cards, guidance, targets, feedback, Exit and minimap fit phone 1080×600 and compact 854×480 with enlarged text/controls. Exit cleared targets; cancel/reopen/reselect restored live counts. |
| [Mixed selection and ordinary construction](mixed-regression/mixed-selection.json) | BUILD excluded a visible combat unit and selected the exact native constructors without changing eight recorded orders/positions. Two ordinary Guard Towers completed FIFO; TRUCKS during work preserved jobs. Noncentral movement/STOP, Stats→BUILD and Factory/Help/Research Back restored input. |
| [Twelve paused returns](paused-returns/test-02-paused-returns.json) | Two rounds through Factory, Design, Queue, Tech, Help and Stats cleared menu/placement state, restored frame input, then real Resume touches advanced native clocks. Opened panels and settled Pause/resumed screens were inspected. |
| [Two Android keyboard returns](keyboard-returns/lab-journey-keyboard.json) | The keyboard visibly opened and was dismissed twice. The same Scout design and save/library controls returned; the phone library remained unchanged. |
| [Real Quit and fresh-battle recovery](quit-return/test-02-quit-journey.json) | Actual Pause→Quit→Confirm produced neutral BATTLE ENDED with hidden/inert battle UI. A distinct fresh native battle accepted Queue/Back and Pause/Resume. Repeating real Quit/Confirm returned to the settled own map-selection screen with original artwork. |

Dustfall's Research parents 160127/160125 and Power parent 160119 each completed
native 500-point module work; ordinary Guard Tower 160145 completed at 300 points.
Genuine F8 rewound native time 180002→176502, retaining those parents and tower.
The saved clock was 175202; this is a genuine rewind/restored-state/input check,
not a claim that the first observed loaded clock exactly equals the save time.
Loading took about 26 seconds under the scoped 90-second readiness allowance.

The factory case used authored worker 160005 on parent 160121 for both levels,
with native completion at 74902 and 125302. Genuine F7 records modules 2 and
complete 500-point work. Normal Produce 1 created Truck 160143 from F160121,
born 151002, with native production and unit records. Different-worker
arbitration on the same parent is source-tested; no additional native
multiworker fixture is claimed.

The compact profile used font scale 1.3 and control scale 1.4. Actual selected
local constructors included the ordinarily produced truck. Both profiles
restored the same Factory Module counts: 1 ready, 0 upgrading, 1 full. Phone
size/text/control scale were restored afterward.

Quit cases began with zero accepted ghost sites. They establish neutral exit,
cleared UI/input state, fresh-battle input and the own start-screen return;
they do not provide new native proof of clearing nonempty ghosts. The emulator
was left at the own start screen.

## QA readiness corrections on the frozen APK

The first mixed-selection attempt stopped before its gameplay cases: its
1.5-second fresh terrain-draw bound immediately after QuickSave expired. The
actual native world and later Pause screen remained healthy. Controlled resume
and a fresh observation showed advancing clock/frames and new projection.
The QA helper now allows a bounded eight-second fresh draw after QuickSave.
The same eight stationary prepared native units were reused without restores,
grants or rebuilding; the first three valid phases were retained.

The [initial report](diagnostics/mixed-projection-first-attempt.json),
[screen](diagnostics/mixed-projection-first-attempt.png) and
[interrupted master](diagnostics/integrated-before-projection-correction.json)
are preserved.

The first Quit recovery observation hit a 20-second Runtime.evaluate timeout
during new-battle startup. The actual new Iron Valley battle was running with
its own distinct session, HQ, HUD and advancing native clock. QA continued
that actual battle for Queue/Back/Pause/Resume, then repeated real Quit/Confirm
and inspected the settled own start screen. The
[initial report](diagnostics/quit-startup-first-attempt.json) and
[interrupted master](diagnostics/integrated-before-startup-correction.json)
remain preserved. No game/runtime source or APK changed for either correction.

Some immediate accepted-placement/return captures precede compositor redraw.
Native orders/completion and later settled frames establish results. The
immediate Queue-return capture and first return-to-start capture were not used
alone to certify visible returns.

## Supporting preflight evidence

`preflight-1786/` and `preflight-785e/` are archived development evidence. Their
[separate visual review](visual-review-preflight.json) records the initial
sidebar-toast overlap and the subsequently observed field-side correction.
The later preflight completed factory 0→1→2 and normal production, and its
compact probe showed three module cards. None of those passes is reused as a
required final-candidate pass.

The first preflight reached research/power completion, ordinary mixed FIFO and
Factory return before its 20-second F8 observer expired while native Loading
was visible. Later observation showed the restored upgraded world and ordinary
Pause. Its report remains failed as QA load readiness, rather than being
relabelled passed or described as a fatal game/save failure.

## Limits

Software-emulator black terrain remains visible. Native IDs, orders, save
records and completion are checked separately from terrain appearance.
Physical-device GPU/audio/FPS performance and a complete 30-wave victory remain
unverified. Optional downloads retain their historical verification scope.
The 0.3, Test 02 and Lab 01 reports remain unchanged historical evidence.
