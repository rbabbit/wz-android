# Towers Lab 01 — delivery verification

Exact delivery APK SHA-256:
`6dafb70bff1dfec5614de3403b5e169f8d720c9507c6f612d0000de9ecf5118c`.

**Towers Lab**, version **0.1-lab (1)**, package
`com.rbabbit.warzonetowers.lab`, installs beside stable Warzone Towers. The
original v6.4 project, APK and complete source ZIP remain unchanged. Its 17
existing saved designs match the original recorded library hash.

## What changed

The gameplay interface remains HTML/CSS over the original Warzone engine
compiled to WebAssembly. Lab adds a compact slate/teal command system,
consistent active navigation, readable fixed-height research filters, compact
Factory/Design panels, independently scrolling workspaces with retained
positions, and a collapsible live Research/Production dock. The dock observes
existing snapshots; it never schedules research or production automatically.
The distinct launcher icon, map deck, original-artwork splash and loading view
identify the experimental app. Startup actions retain 48dp touch targets.

Package checks prove all 458 other original assets, including engine JS/WASM,
data, supplied maps and mod, are byte-identical to v6.4. The construction/game
scenario is unchanged. Runtime changes are presentation in command-pages.js,
four added Lab theme/dock assets, Android startup/icon resources and app identity.
The signed APK's 463 source assets match the project; all 486 recorded runtime
source files remain tied to this exact build.

## Observed checks on this exact APK

- **Startup:** actual phone 1080x600, wide 2400x1080 and system-font 1.3 screens;
  complete map descriptions, map selection, graphics dismissal, repeated
  Music/Back, actual Play/loading and readable offline download errors. Normal
  Play remained enabled. The wide artwork edge was checked against actual
  pixels and its seam removed. Connectivity was restored to its initial state.
- **Research:** actual touches assigned Cobra to Lab 1, queued and removed Fuel
  Injection Mk3 without disturbing active research or other labs. A complete
  ordinary checkpoint then completed Cobra, unlocked Body5REC and advanced
  only that lab to queued Fuel research. Lab 2 kept Composite Alloys; labs 3/4
  stayed idle. Selected-Lab-2 screenshots and native targets were checked.
- **Production:** both ordinary factories produced real droids 164513/164515.
  Native saves confirmed their IDs and positions. Clearing five waiting jobs
  preserved active production, which completed normally.
- **Phone designs:** Factory SAVE TO PHONE and a valid UI-created Viper/Wheels/
  Machinegun blueprint survived a genuine process restart byte for byte.
  Three observed Android keyboard open/type/Back journeys recovered validation
  and input. Library USE TEMPLATE revealed a visible, reachable Produce action.
- **Activity dock:** counts matched real lab/factory activity; collapse persisted
  through restart; both buttons opened the correct page and restored afterward.
- **Scrolling:** four genuine SAVE AS NEW copies created a six-model catalogue
  with 198px overflow. A real swipe reached scrollTop 198.6667, retained across
  facility rerender. Blueprint selection revealed the selected design. The four
  test copies were removed through UI, preserving the original two Lab models.
- **Construction:** real STOP cancelled active/pending work; native movement
  replaced queued building and stayed in effect; subsequent towers completed.
  Eight preserved queued sites plus two real placement orders all completed at
  native coordinates with full build points. Stable site numbers, counts,
  original-mesh previews, minimap anchoring and completed-ghost clearing passed.
- **Dustfall:** ordinary authored platform trucks completed a guard tower and
  cyborg factory. The factory's actual 1x2 footprint and raised height matched
  its original-mesh ghost and native position `[960,8832,510]`.
- **Returns/layout:** repeated Research/Factory/Design/Queue/Help/Android Back,
  native pause/resume and subsequent building input passed. Actual wide, phone,
  enlarged and compact 854x480 captures fit without horizontal clipping. Large
  controls were selected through the real Help UI. Build titles remained
  complete at the top, after actual swipes and at the catalogue bottom.

## Evidence

- [Package/source and unchanged-engine verification](package-verification.json)
- [Code checks and signature](code-checks.json)
- [Startup journey](startup-delivery/lab-startup-qa.json)
- [Startup wide-edge pixel verification](startup-delivery/art-edge-rgb.json)
- [Gameplay report and screenshots](gameplay/REPORT.md)
- [Real catalogue scroll/return proof](scroll-delivery/REPORT.md)
- [Construction journey](building/building-journey.json)
- [Wide STOP/movement/native completion](building/wide-controls/audit-building-wide.json)
- [Ten numbered sites/native completion](building/numbered-sites/audit-build-display.json)
- [Layout profiles and actual geometry](layouts/layout-journey.json)
- [Dustfall native completion/height](dustfall/audit-build-display-td1.json)

Actual screen examples:

- [Lab start screen](startup-delivery/startup-phone.png)
- [Manual research and selected lab](gameplay/lab-research-manual-active-and-queue.png)
- [Active production and waiting jobs](gameplay/lab-factory-real-active-and-waiting.png)
- [Library after restart](gameplay/lab-phone-library-after-process-restart.png)
- [Enlarged Factory layout](layouts/lab-layout-phone-enlarged-factory.png)
- [Numbered queued original models](building/numbered-sites/01-eight-queued-models.png)
- [Raised-platform factory model](dustfall/td1-raised-models.png)

## Method and limits

One existing emulator and complete ordinary native save fixtures were reused.
Restores included all 24 map/terrain/visibility/state files and were validated
with fresh native replies, unit IDs, positions and completion records. No
units, power, research or world fields were granted or edited. Normal unit
production was tested independently. Test blueprint copies used actual UI
actions and were cleaned up through UI.

The unchanged explicit TRUCKS/native-picker transition briefly covers field
input and display while the engine continues. This is an existing limitation,
not a claim of instant selection everywhere. The focused construction check
bounded that exact trusted-click-to-selection interval and required no cover
during building selection/placement or afterward; viewport, canvas and zoom
remained constant. See [the retained diagnostic and source comparison](building/picker-cover-diagnostic.json).

Early QA readiness failures involved cold-start timing, a queued pre-pause clock
tick and waiting for a native state acknowledgement while already paused.
They were diagnosed as fixture readiness and corrected in helpers. The initial
wide probe also included the explicit stock TRUCKS transition; raw diagnostics
were preserved and its input/display hold is disclosed above. App code was not
changed to hide these results.

Software-emulator black terrain remains unchanged. These checks do not certify
physical-device performance/audio, all optional download completion/cancellation
paths, every native engine menu, or a complete 30-round playthrough. Earlier
candidate and historical QA files do not replace the exact-C5 evidence above.
