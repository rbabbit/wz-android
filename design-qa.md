# Current v6.4 HTML/CSS construction display

The exact delivery APK and current runtime source are covered by
[the v6.4 report](qa/v6.4-build-display/REPORT.md) and its hashed evidence.
Actual emulator screens were checked on both maps, wide and phone viewports,
enlarged text, catalogue scrolling and keyboard/menu returns. Native saves
confirmed actual structure positions and completion. The preceding
[v6.3 report](qa/v6.3-building/REPORT.md) covers smooth building interaction.
The native-layout comparisons below remain historical. No physical-device
performance or complete 30-round verification is claimed.

# Historical v6.2 HTML/CSS release

No emulator or visual gameplay testing was performed, as explicitly requested.
This release restores the original HTML/CSS layout and implements the scoped
logic fixes and phone template saving. See qa/v6.2-html/REPORT.md for code/build
checks. All visual acceptance reports below are historical and do not certify
v6.2 screenshots or gameplay.

# Compact native Towers v6.1 design QA

final result: passed

Installed clean APK SHA256: `d9a56ac548d479dce04dbddf8ad56ede2500754ddf7441265bff1d22475e4624`.

The source visual truth is `qa/v6.1-compact/reference/battle.png`,
`research.png` and `factory.png`: the three approved actual Android mocks.
Implementation captures are `final/reference-match-battle.png`,
`final/reference-match-research.png` and
`final/compact-factory-two-waiting-groups.png` under the same QA directory.
All six images are 1080x600 pixels at density 240 (1.5 pixels/dp), 720x400dp,
system font scale 1 and Standard app interface size. No CSS scaling is involved.
Both sides use real Android controls and the retained game artwork.

## Comparison evidence and state

The source and implementation were opened together in each combined input:

- `qa/v6.1-compact/comparisons/final-battle.png`: three selected trucks,
  collapsed Orders control and the native header. The native engine camera and
  live power differ; the actual field is rendered by the unchanged engine.
- `qa/v6.1-compact/comparisons/final-research.png`: same-visit active Cobra,
  queued Fuel, Composite on lab2 and idle labs3/4. The actual progress/time is
  live native state, so it differs from the mock's sample62%.
- `qa/v6.1-compact/comparisons/final-factory.png`: active normal production,
  two distinct waiting batches, Qty3 and the idle other factory. Actual saved
  design names/counts replace the illustrative mock models; no mock data is
  injected into gameplay.

Focused header, research queue and factory queue comparisons were also opened:
`final-header-focus.png`, `final-research-queue-focus.png` and
`final-factory-queue-focus.png` in the comparisons directory. These expose
small type, status colors, cancellation controls and row spacing. All were
inspected directly, not judged from paths or code alone.

## Required fidelity surfaces

**Fonts and typography.** Android's Roboto/system sans family, bold 14sp names,
11sp secondary text, header hierarchy and title-case actions preserve the mock.
Full native font metrics avoid clipped captions. The enlarged selected topic
can occupy two lines; the collapsed picker may say Lab 1 while the complete
current topic remains in its summary. All enlarged header/Battle/Qty20 labels
fit in the actual inspected screenshots. Engine-provided names retain their
original hyphen/copy; they are not rewritten to match mock punctuation.

**Spacing and layout.** The real header and page toolbar are 48dp, with the
same two-to-one catalogue/summary split, 32dp images, approximately 60dp rows,
five fully visible Standard catalogue actions and thin separators. The field
Orders control collapses back to the compact state. Measured quantity/header
widths retain full 48dp targets. The actual summary reserves several extra
pixels for full font lines; native scrollbars and other-lab separators remain.
These do not hide persistent controls or change the core density/hierarchy.

**Colors and tokens.** Sampled header RGB 22/33/39, catalogue 16/25/30,
divider 44/60/67, selected accent 237/186/87 and search 26/40/46 match the mock.
Cyan progress/actions and muted queue/status text preserve its hierarchy.
The native action surface and transient pressed/ripple tint vary slightly
from the mock. This is minor native control polish, not a semantic mismatch.

**Image quality and assets.** The original game catalogue images are used at
32dp with their original aspect ratio and pixel-art character. The APK checks
preserve 35 original resources, the official engine/WASM and resolved stock
assets. No generated mock image, fake battlefield or replacement artwork is
shipped. Different factory thumbnails reflect the actual saved designs.

**Copy and content.** Build/Tech/Factory/Design/Skip/More/Battle and Clear waiting
match the compact flow. Active/Queued/Lab ownership comes from live queues.
The factory uses a real elapsed simulation timer and an indeterminate work bar
because the adapter has no reliable native build-point percentage. The mock's
sample percentage/count-of-total is deliberately not fabricated. Saved design
restrictions and body/propulsion labels show actual game data.

## Comparison history and fixes

Initial combined research comparison `comparisons/iteration1-research.png`
found P2 selector truncation, oversized queue padding, missing catalogue
separators and header width drift. Native picker padding, measured widths,
row dividers and queue layout were corrected. The final combined captures
above show the corrected states on the clean installed APK.

An intermediate real enlarged phone capture exposed P2 clipping in Skip,
More, Battle, Qty and caption heights despite the older coarse bounds test
passing. Text width/height and parent-clip checks were added; measured native
widths and full font line heights fixed those failures. Final
`compact-enlarged-research.png` and `compact-enlarged-factory.png` were opened
and passed the stronger checks on the clean candidate.

The first matched battle capture had the Orders panel open due to an extra
test toggle. The fixture was corrected to observe collapsed Orders before
capture; the final combined battle input above was reopened and inspected.
This changed the capture state, not the product.

## Interaction and responsive evidence

Real emulator checks cover manual labs/queues, direct lab/factory changes,
quantity bounds/presets, grouped waiting removal, active production retention,
normal unit completion, Android typing/save/search/rename/copy/delete,
persistent library after restart, repeated page/menu/System Back returns,
save/load, native selection/movement/Stop/Patrol, mixed construction and
Dustfall vehicle/cyborg production. The lifecycle result callback is an
explicit UI fixture, not native victory. No Runtime exceptions were reported
by the passing interaction checks.

Actual 1080x600/d240/font1.3 and 2400x1080/d420/font1.3 screens were inspected.
Standard and Extra large app sizes retain 48dp controls and scrolling instead
of hiding options. `final/actual-profiles.json` records observed geometry;
nominal wm settings are not accepted as viewport proof.

## Findings and remaining polish

No actionable P0/P1/P2 discrepancy remains in the compared app-owned screens.
P3: native picker arrows, small queue/divider/line-metric differences and
pressed-state tint can be refined later. Live data, camera framing and honest
elapsed production progress are expected differences, not visual defects.

Implementation checklist: corrected compact dimensions, real images, readable
labels, stable row actions, functional queues, responsive/native interaction
checks and final combined comparisons are complete. Physical-device GPU,
audio/FPS and full native 30-round endurance remain outside this design review;
software-emulator black terrain is unchanged. Live combat and cold-start
release checks are tracked separately in the delivery summary.

---

# Historical design reviews

# Warzone Towers design QA

final result: passed

## v5.12 selected official-art footer — historical

final result: passed

Installed delivery APK SHA-256:
`102316bdb80435971a2fd6561e4b269671774048d751d7d49663325d198f9313`.

Source visual truth: [selected heavy-armour mock](qa/v5.12/selected-target.png),
with the user's approved Dustfall/Iron Valley display names and rectangular Play.
Implementation: [native capture](qa/v5.12/startup/compact-finished.png).
Both are normalized to 1080x600 for [full comparison](qa/v5.12/comparison-full.png)
and [footer detail](qa/v5.12/comparison-footer.png). Source is 1681x936; native is
1620x900 at density 1.5, 1080x600 logical. The native state has cached HQ and Music
off; the mock depicts uncached HQ/Music choice. Those copy differences are state.

Fonts/typography: live Oswald labels match the condensed treatment; body copy
remains readable. Spacing/layout: centred rectangular Play, direct underlined
map tabs and a shallow footer match the selected hierarchy; native 48dp targets
are retained. Colours: cream, cyan and dark teal match the target. Image quality:
original logo and upstream backdrop PNG are used, not the generated screenshot.
The original square composition is proportionally fitted, with softened source
edge colours filling the sides. Copy: approved map names and dynamic Play text.

Iteration history: the first native crop produced sharp repeated ground stripes
(P2). A flat surround exposed a rectangular ground patch (P2). Averaging the
outer source pixels and blending the edges removed those harsh transitions;
the post-fix comparison above was inspected. Narrow utility labels wrap to two
lines; enlarged-text/very narrow footers use two rows. Six native viewport/text
settings passed bounds, no control overlap and 48dp touch-height checks.

No actionable P0/P1/P2 findings remain in these checked screens. The square
source's softer outer ground and slightly different hero framing from the
generated concept are intentional asset-preservation differences (P3). Physical
device rendering/audio/performance limits remain. See [v5.12 evidence](qa/v5.12/REPORT.md).

## v5.11 two maps and compact startup — historical

Clean installed APK SHA-256:
`08e9d1610d55c927b000026331f25013a608d0d05764bc05ff725ab90916a36a`.

The supplied NoQ td1_v3 map was integrated and tested before the start-screen
redesign. Both named maps use the unchanged supplied Towers mod and are bundled
offline. The compact console preserves the splash artwork; downloads remain
separate from Play. Music defaults to zero tracks and preserves explicit choices.

The exact delivery APK passed native TD1 construction/completion, ordinary unit
production/movement, both labs, menu returns and first-wave attack orders; TD2
passed related FIFO/completion/movement and repeated menu/keyboard returns at
three viewports. Offline TD1 startup, native music preference reads and actual
optional-pack download/error/cancel/resume cases passed. The cancellation test
used a disclosed verified-prefix fixture. See [v5.11 evidence](qa/v5.11/REPORT.md).

Engine logic/WASM, the prior data prefix, original mod and Research are preserved.
The existing emulator black-terrain limitation, physical-device rendering/audio/
performance and a full native 30-round playthrough remain outside this result.

## v5.10 construction response — historical

Clean installed APK SHA-256:
`5b9d515e7c7e5e24008c4c82b5f46ef109952a1939112a9ada10308ffd0a2f65`.

Single-run selection samples fell from 2.9–3.3 seconds to 1.0–1.5 seconds on the
emulator. Every item, including a repeated choice, still requires genuine native
placement acknowledgement. The rejected cached-ready shortcut is not shipped.
Native repeat/item-switch/Exit FIFO and completion, movement, manual/automatic
exits, zero/one/three constructors, keyboard and repeated screen returns, and
three viewports passed on this exact APK. Sixty compositor frames were inspected.
The last solo check was recovered in an early saved match after the original
fixture reached HQ defeat; that limitation and the rejected candidate checks
are explicit in [v5.10 evidence](qa/v5.10/REPORT.md).

Engine logic/WASM, original mod, Research and CSS are preserved. The appended
queue observer now tolerates brief native FIFO idle gaps. Physical performance,
existing emulator rendering limits and full native endurance remain unverified.

## v5.9 single item tap — historical

Clean installed APK SHA-256:
`5d88d0866cfac08bd9eef2ed346b174f4555d908cecd4d642f080917098a87f2`.

BUILD opens immediately; one item tap selects the closest constructor group and
activates the requested structure. The exact APK passed rapid MG-bunker selection,
actual native orders/completion at three sizes, distant-selection override,
zero-constructor/no-selection behavior and recovery with a normally produced
single constructor. The empty-roster fixture and limits are explicit in
[v5.9 evidence](qa/v5.9/REPORT.md). Engine, mod, Research and v5.8 CSS are preserved.

## v5.8 build transition smoothing — historical

Clean installed APK SHA-256:
`8e885733bcc4b905791a1db7c6973702814ec016b7401e7bb7c562aef6090455`.

The real-emulator transition recording retained the catalogue nodes and sidebar
through item changes, reducing full catalogue renders from 15 to one. The exact
APK passed related native FIFO/completion/movement and explicit/automatic exit
checks, Map/Trucks and menu returns, three-site queue visibility, and compact/
standard/large screen checks. Engine, mod/scenario and Research assets are
identical to v5.7. Physical performance and existing rendering limits remain.

See [v5.8 evidence and limits](qa/v5.8/REPORT.md).

## v5.7 supplied Tower Defense mod — historical

Clean installed APK SHA-256:
`f8e9e93fe8d4332247c54f861986e670329f443b83159ca665470d001324ebbb`.

The supplied mod is active unchanged, with the mobile UI preserved. The exact
APK passed the three-viewport construction/production/design/navigation and
unit-command journey. Native combat through round 5 verified kill power;
manual lab queues, Skip survivors and native Save/Load restoration were checked.
All 30 rounds and victory were exercised in the rules harness. This is not a
claim of a 30-round native playthrough or physical-device certification.

See [v5.7 evidence and limits](qa/v5.7/REPORT.md).

## v5.6 compact field controls — historical

APK SHA-256: `3cfb98b4cd12f1236ded54387edc4694f4ac62bd21991573eef8f3d67b86f147`.

The exact installed APK passed the fresh native Towers journey at 1280x576,
1080x600 and 1600x720: construction FIFO/completion and ETA, ordinary production,
design/save/keyboard returns, repeated navigation, selection/movement, Patrol,
STOP, BOX, compact controls, minimap return and automatic placement cleanup.
Screenshots were inspected, including the large native scale prompt discovered
and removed during iteration. Engine/WASM/data and Research layout are preserved.
Physical-device, black-terrain, Save/Load, audio and performance limits remain.

See [v5.6 evidence and scope](qa/v5.6/REPORT.md).

## v5.5 construction sidebar — historical

APK SHA-256: `37b9ac288ade3477fb9b8357e85c6a5ab10f846dbf6f27d5bfbf8fcd6addd5e5`.

The exact installed APK passed the fresh-match construction/UI journey at
1280×576 and 1080×600: scrolling/fixed controls, native multi-truck mixed queues,
2×2 foundation matching, tower/facility/module completion, live timing,
pause/resume, normal production, produced-unit movement, design save, visible
Android keyboard return and repeated menu/navigation returns. Research is
unchanged. Remaining construction time is an estimate; physical-device, HQ,
audio and Save/Load limitations remain.

See [v5.5 evidence and scope](qa/v5.5/REPORT.md).

## v5.4 selected-lab sidebar — historical

APK SHA-256: `07b81acec83421999770912e304abcbffe058bdfcafdb685865281f3a26b3057`.

The exact APK passed the four-lab research journey on the real emulator at
1280×576 and the compact screen checks at 1080×600. Current names/images,
waiting lists and counts follow the selected lab, while the catalogue preview
and queue action are in the centre. Native targets, automatic advancement,
queue editing, filters and menu returns were verified; Standard/Extra large
controls were visually checked. Engine, WASM and scenario data are unchanged.

See [the v5.4 report](qa/v5.4/REPORT.md) for screenshots, the native evidence,
delivery hash gate and retained limitations. This is a focused research audit.

## v5.3 header and live queues — historical

APK SHA-256: `f9c9d4ad98d000eb933ff93b4f5018cb80c89face9c527b26ea6ea823ceb78b8`.

The installed APK passed real research progress/completion and ordered queue
advancement, native construction completion/preview exit, ordinary truck
production and movement, and keyboard/menu returns. Screen and hit-target
checks covered 1280×576, 1080×600 and 1600×720 with Standard and Extra large
controls. The redundant truck window is covered by the construction panel;
native queued blueprints are retained. Research times are labelled estimates.

See [the v5.3 report](qa/v5.3/REPORT.md) and its delivery gate for exact evidence
and the retained black-terrain, physical-device, HQ, audio and Save/Load limits.

## v5.2 tactical interface — historical

APK SHA-256: `2bc1fee640277eacacfd21f8c9d4b72fc19a23c304461f5c026efb0b71f20441`.

The exact installed APK passed the redesigned command screens and native
construction, production, selection/movement and keyboard/page returns at 1280×800 and 1080×600. The wide pass also verified native wave weapon firing and facility/module
completion. Fifteen constructors received native queued work; the large-group preparation uses an explicitly recorded debug
fixture, with ordinary production checked separately. All Research assets,
official engine/WASM and previous stock/mod assets are preserved.

See [the v5.2 report](qa/v5.2/REPORT.md) for the issue list, screenshots, exact
fixtures and remaining physical/HQ/audio/Save-Load verification limits.

## v5.1 functional screens — historical

APK SHA-256: `c1ed550f9024c1a5a2e80d771a4c31b40de7c504a56137be628ea6cbda1dbc0d`.

Affected functional screen flows passed on the delivery APK at 1280x800 and
1080x600: retained design selection, real production, deduplication, live queues,
error reporting, deletion/draft protection, repeated returns and Research.
All 408 research-named files are identical. The redesign remains deferred.
See [the scoped v5.1 report](qa/v5.1-fixes/REPORT.md) for evidence and limits.

## v5.0 gameplay audit — historical

Tested APK SHA-256:
`1b99ef69e369a75c86ee42e1c545874b57293083cc476ccc6357aa2421e30006`.

The reported controls and related emulator flows passed: native build queues,
15-truck grouping/work/completion, normal unit movement, production and repeated
page returns, rapid input/pan, pause/resume, compact layout, density retention
and actual wave combat. All 16 regressions, build/signature and engine/asset
preservation checks passed. This is finite emulator coverage; black terrain,
physical Samsung behavior and audio-output limits remain.

See [the v5.0 report](qa/v5.0/REPORT.md) and its artifact-bound final-tests.json.

## v4.9 construction and design fixes — historical

Tested APK SHA-256:
`c9d717c5e390224b15529f0afc39637df90389cf727af156d3b6e9ffb42a7d71`.

Actual Android native pickers created two distinct designs. Editing one preserved
the other; Save as New retained the original. Two factories delivered native
tanks whose saved parts match Body1REC, wheeled01 and Cannon1Mk1. Quantity 5
survived switching factories. Three automatic queued cannon defences completed;
native records show currentBuildPts=400 at all three sites. A real touch also
placed and completed a 2x2 research facility. Manual six-truck assignment, STOP,
occupied-site retention and a 25-command burst passed. Trusted mouse, pen and an
11px drifting touch each queued exactly one native job.

Native camera pan/pinch/tilt, stable heading, minimap/cancel/overlay retention,
held footprint preview, six HELP/TECH returns, native Stats/Factory/Commanders
returns, four command-page cycles, continuous search typing/focus, stock images
and Extra large layout passed at 1280x800 WebView extent. Fifteen regression
scripts and the negative optimizer regression passed. APK signature verification
passed. The official engine/WASM, complete 65,434,780-byte v4.8 data prefix and
all 3,284 resolved assets are identical. No scenario, research, roster or artwork
changes were needed.

Normal-mode restart preserved all four design identities/components and an
existing design reopened/validated. Normal-mode FIFO construction passed again;
a direct battlefield selection used one truck to complete a defence, and a
selected real combat unit fell back to an automatic truck and completed another.

See [the detailed v4.9 report](qa/v4.9/REPORT.md) for evidence and test limits.
Emulator black terrain, physical Samsung startup/compatibility, HQ appearance,
compact-phone coverage and audible quality remain unverified limitations.

## v4.8 command pages — frozen fallback

The final installed/tested APK has SHA-256
`efff0474e805c99be92c23ed77fc6a33d3658bbb0b7689ebe6fa1b4b0d77d4c0`.
BUILD, DESIGN/Saved Designs, FACTORY and STATS replace the small native hex menu.
The minimap stays visible; TECH is the only research entry. MORE contains the
secondary controls and interface size. Original stock icons are reused.

Real Android touches queued three cannon hardpoints with no selected truck;
fresh native QuickSave files confirmed all three completed at the requested
sites, in order. A six-truck manually selected group accepted a build, STOP
cleared its queues, invalid taps kept placement active with red feedback, and
BASE/zoom changes kept the selected structure. A 25-command burst exceeded the
eight-command transport batch and all replies arrived. A separate 100-job test
verifies bounded native enumeration and no overwriting of busy workers.

Saved blueprints survived process/APK restart, reopened and edited without
duplicating the entry. Two real factories queued the same design and delivered
native tanks without cancelling each other. Native droid records confirm
Body1REC, wheeled01 and Cannon1Mk1, using ordinary production.

Native pan, pinch and tilt changed camera state; tilt preserved heading. Minimap,
cancelled touches and HELP/TECH returns did not accidentally place a building.
Held-touch footprint rendering passed. Six scrolled HELP/repeated BACK TO BATTLE
and TECH cycles preserved header visibility/input. Extra large BUILD buttons,
loaded stock art, no header/wave overlap and the engine's minimum viewport passed
at the tested 1280×800 landscape WebView extent. An earlier 800×600 extent was
also exercised during implementation; it is not physical-device certification.

Fourteen regression suites, Android build and APK signature verification passed.
The official engine program/WASM, the previous complete data prefix and all
3,281 prior resolved assets are unchanged. Only custom rule/bridge records are
overridden and new command files appended. The v4.7 fallback was saved first.

Testing uses Pixel_10_Pro, Android 16, WebView 158 and SwiftShader with `-no-audio`.
The emulator's black terrain remains. Physical Samsung tablet startup, HQ visual
quality and audible output still require a real-device retest. Evidence and
exact result logs are under `qa/v4.8/`.

## v4.7 startup Music

The tested installed APK has SHA-256
`4911ed72f21809327076cc4881dd6139781cba614a9e686150d21bf63fdca87b`.
The user's screenshots show the old battle Music route stuck during pause/menu
navigation with the command bar hidden. That route, injected Music touches,
Music pointer interception and header-hiding CSS are removed. Startup now has
original track checkboxes, saved choices, ALL/CLEAR and fixed top-right START
GAME. Choices are applied as native playlist user preferences before main().

Native Android tests passed selecting tracks, Music off allowing Start, blocking
an empty enabled playlist, ALL/CLEAR, Back and process-restart persistence, and
scrolling to the last album with Start still visible. The engine then opened
and streamed the sole selected battle track, plus its original menu theme, with
all eleven battle commands visible and active. One- and six-truck native queue
tests passed, including mixed defences, rapid/invalid/cancelled taps, zoom,
pan/tilt, ten minimap taps, TECH and three scrolled HELP returns with live wave
enemies. STOP cleared all original selected trucks. Header geometry passed.

Twelve regression suites, Android build and APK signature checks passed. All
three compiled engine payloads are byte-identical to v4.6; the original optional
Music pack is unchanged. The v4.6 APK/source fallback remains intact.

The emulator uses SwiftShader and `-no-audio`. Audible output quality and exact
physical-device behavior require a device retest. Its existing black terrain
remains. Exact evidence and the supplied screenshots are under `qa/v4.7/`.

## v4.6 Music and input

The tested APK has SHA-256
`baad27be8ac2271f8f4dc3560981309beee864a00a591fff366b34d97389a94c`.
The previous tested APK and a verified complete source snapshot were saved
before edits. Twelve regression suites, the Android build and APK signature
verification passed. Official compiled engine code/WASM, the original data
prefix, 3,281 resolved assets and the supplied mod/map are preserved.

Actual Android 16/WebView 158 tests ran silently on Pixel_10_Pro using software
rendering after the host renderer hung and then failed during restart. One- and
six-truck tests read fresh native QuickSave orders, including mixed machine-gun
tower/cannon-hardpoint queues. Six trucks each accepted six initial build
intents; changing defence once added cannon hardpoints to every truck's queue.
Occupied, edge and held taps, rapid touches, cancellation, pan, pinch, tilt,
three zoom presets, header gaps, minimap, HELP and TECH returns passed. Ten
minimap taps and three scrolled HELP returns passed with native wave enemies
present. Skip Wave started a real wave; STOP cleared all six original trucks.
All twelve commands and the wave panel fit the 800px header without overlap.

Native Music tests passed original track selection, scrolling to another album,
and returning through both the header and Android Back. The original four-album
pack passed native download cancellation/resume and SHA-256 verification. Cached
Music started with Android reporting no active network. Runtime downloads use
the owner's VPS. The manager's actual Opus opens/reads were checked; audible
output was not assessed because the emulator uses `-no-audio`.

The emulator's pre-existing black terrain remains. HQ visual improvement and
physical Samsung tablet startup are unconfirmed. Exact native snapshots,
conditions, failed prototypes and final pass logs are under `qa/v4.6/`.

## v4.5 graphics choice

Startup/download flow passed. Native launch artwork fills the screen, with
aligned Normal/High Quality cards, a saved selection and a fixed bottom action.
Actual Android screenshots at 1280x532 and 1280x800 were inspected. Download
progress, cancel, paused progress, friendly network failure and cached/offline
states were exercised. A premature resize capture was discarded; additional
emulator size changes were blocked by automatic approval review, with no more
specific reason supplied. No stable 800x360 check is claimed.

High Quality loaded the original 95 MiB official archive, selected native
terrainMode=2 and read over 40 MiB of its data during actual battlefield startup.
Cached High Quality and included Normal both started offline. Ten regression
scripts passed. The complete engine JS/WASM/data and 439 existing assets remain
byte-identical to v4.4; only the wrapper index changed and one loader was added.

Visual quality comparison remains unverified: the emulator has a pre-existing
black-terrain problem in both modes, including with software rendering. This
release verifies pack loading and the startup flow, not that rendering issue or
physical Samsung compatibility. See `qa/v4.5/graphics-qa.md` for evidence.

## v4.4 HELP return

A verified v4.3 APK/source fallback was saved before edits. HELP now uses an
explicit overlay return path to restore the command header, viewport, interaction
state and engine focus. The host is fixed to the screen; closing HELP cannot
rely on browser-native dialog focus restoration. No engine or wave change.

Six physical adb touch/scroll/return cycles passed on the new APK. The last
three checked panning plus native CLOSE/MAP/BATTLE zoom acknowledgements after
every return, followed by opening the native Build menu. No stuck key or runtime
exception remained. See `qa/v4.4/help-return-qa.md` for evidence and the explicit
limit: the reported device-specific disappearance did not reproduce on this
emulator, so the user's tablet still needs to confirm the mitigation.

## v4.3 wave header, camera and preparation

Before any project edit, the v4.2 APK and a fresh 621-file source archive were
saved, hashed and verified under
`C:/timerApp/_backups/warzone-towers-v4.2-before-wave-camera-20261102-212219`.
The previous delivered APK and ZIP were preserved as well.

Wave status/Skip Wave now sit at the header's top-right. Compact layouts use
two rows with no overlap. Up/down panning was measured against native saved
camera coordinates, and the minimap hit area was corrected for this square
map. Two-finger vertical dragging adds native camera tilt, preserving heading
and map position, with restrained sensitivity and release/cancel handling.

A dialog announces four minutes to prepare. The first wave starts at the
deadline even without a defence or combat unit; Skip Wave can start sooner.
The natural four-minute emulator test produced four enemies at Wave 1, and an
early Wave 2 preserved those survivors and increased the total to eight.

Camera, initial orientation, phone/tablet/compact header dimensions, HELP and
research return passed on the final build. See `qa/v4.3/camera-waves-qa.md`.
The official engine code/WASM/data prefix, supplied map/mod and branding are
preserved. Physical Samsung S8 verification remains pending.

## v4.2 fullscreen correction

The old v4.0/v4.1 canvas-fit layout exposed grey side gutters. Calling those
gutters an intentional adaptation in the earlier report was a poor decision.
It has been replaced by a true full-width engine viewport below a separate
command row. No finished-frame CSS transform remains. TECH opens full-height
and restores the battlefield when closed. The native loading image now fills
the display with CENTER_CROP and panoramic scenery, rather than a fitted square
over a blurred backdrop. The launcher illustration is unchanged.

Live Android viewport and interaction checks passed; see
`qa/v4.2/fullscreen-qa.md`, `viewport-results.json`, and `gameplay-results.json`.
The sections below are historical evidence for earlier releases, including the
superseded canvas-fit implementation.

## v4.1 branding update

The first selected green-field image is now the actual launcher icon, Android 12+ system splash icon and full engine-loading artwork. Native launcher, cold-start splash, fitted image and transition into gameplay were checked on the audio-disabled emulator. See `qa/v4.1/branding-qa.md` and its screenshots/results. All 439 packaged gameplay/engine assets remain byte-identical to the delivered v4.0 APK. Physical Samsung S8 testing is still pending.

The remaining report records the historical v4.0 controls and gameplay verification.

**Evidence and normalization**

- Selected source: `qa/v4/selected-reference.png`, copied from the third displayed Minimal Tactical mockup at `C:/Users/punke/.codex/generated_images/01a1988c-2332-7013-9716-b021281aa5a7/exec-78cc9124-3277-4ae5-a1bc-ba9861b49a97.png`.
- Live Android captures: `qa/v4/wide.png`, `compact.png`, `tablet-final.png`, and their HELP captures. Captured using adb, including the real WebGL canvas.
- Same comparison viewport: 1280 × 576 CSS pixels. Source 1870 × 841 resampled to 1280 × 576. Implementation DPR 2, captured within the 2560 × 1600 Android surface; the visible 2560 × 1152 region was cropped and downsampled without stretching.
- Opened together and inspected: `comparison-full.png`, `comparison-controls.png`, `comparison-wave.png`. Also opened `compact-help-bottom-normalized.png` to check scroll and return control.
- State: Wave 6, +Q enabled, BATTLE selected. Enemy counts and camera location differ because this is a running match; the map is not a static image.

**Findings**

No remaining actionable P0/P1/P2 findings in the implemented command rail, wave panel, or HELP flow.

- Fonts/typography: local Oswald 600 matches the condensed command labels and wave heading; system UI supports longer guidance. Labels remain single-line at 642 × 482. The mock's labels are slightly heavier, a P3 refinement.
- Layout/rhythm: joined command zones, separated zoom group, left icons, 7px top/left spacing and compact upper-right wave panel follow the reference. HELP is the requested extra control. The whole native frame is uniformly fitted below a 50px command area to preserve the engine's message strip; small side gutters are an intentional functional adaptation, preserving aspect ratio and touch mapping.
- Colors/tokens: charcoal surfaces, warm ivory labels, moss green +Q, cyan BATTLE, amber TECH and coral wave rule match the source. Gold outlined button boxes, decorative wave dot, SURVIVAL CONTROL and pulse jargon were removed.
- Asset fidelity: the actual Warzone canvas and stock native UI are retained. No generated gameplay or research art was inserted. Local unmodified Phosphor Bold SVG icons and Oswald are accompanied by MIT/OFL licences. All toolbar images/fonts loaded.
- Copy/content: HELP explains select trucks → +Q → select defence once → repeated placement, changing defence, STOP, gestures, zoom, research, Skip Wave keeping survivors and command-centre defeat. It states the battle continues while open.
- States/accessibility: semantic buttons, titles, +Q/zoom pressed state, visible focus; labelled modal HELP with native Escape, CLOSE and BACK TO BATTLE. Internal scrolling exposes the footer on compact screens. On research completion the wave panel temporarily moves below native messages.

**Comparison history**

1. P1: native messages overlapped the command rail. Fixed with a separate wrapper command area and uniform native-frame inset. Final evidence: native frame top=50, rail bottom=45 in `layout-results.json` and the normalized screenshot.
2. P2: initial resize experiment measured an already transformed frame, causing progressive shrinkage. Fixed by removing presentation scaling before SDL measures resize, restoring full canvas CSS dimensions, then fitting afterward. Three consecutive resize events finish at 1200 × 750 within the original 1280 × 800 tablet viewport.
3. P2: compact viewport expanded to fit old launcher content. Fixed page-level scale and removed the launcher's body minimum height during play; game pinch remains available. Final 642 × 482 viewport fits every toolbar control without scrolling.
4. P2: wave heading initially centred and build copy wrapped unnecessarily. Fixed left alignment and shortened build instruction. The final focused comparison shows aligned title, status and Skip Wave.

**Runtime and interactions**

- Version 4.0-towers, code 40, installed on API 36.1 emulator, WebView 158.0.8127.2, audio disabled. Normal splash startup reached gameplay.
- `gameplay-results.json`: real adb touches selected a truck, enabled +Q, selected Heavy Machinegun Guard Tower once, and submitted three placement taps. Two armed defences completed during the interval; native queue and build ghost stayed active. No second defence selection was sent.
- Six real Skip Wave button taps reached Wave 6, adding fresh enemies. Camera facing count stayed one, including BASE, waves and repeated viewport changes. Native minimap north marker stayed at the south-facing position.
- `layout-results.json`: 1280 × 576 wide, 642 × 482 compact and 1280 × 800 tablet. Every toolbar control fits; whole native frame fits; local icons/font load; HELP opens, scrolls, returns and closes. These are WebView-only viewport checks; underlying emulator display settings were not reset.
- A real adb swipe produced one pan and six native pan updates. Synthetic two-finger pointer input in the live WebView produced seven pinch steps; BOX drag completed and released its state. No held key remained.
- CLOSE/MAP/BATTLE received engine acknowledgements at 1600/3600/2600. Medium Body - Cobra was explicitly queued through TECH and returned to battle immediately; its command was acknowledged in 192ms, with no rejection, timeout or bridge error.
- `interaction-results.json` confirms that Medium Body - Cobra subsequently completed, its lab returned to idle, and no research bridge error occurred. All four labs are ready. This test selected the topic explicitly; no automatic player research was added.
- Runtime logs checked: known streaming-WASM warning successfully falls back to ArrayBuffer instantiation. No Android fatal exception observed. Initial missing-log counters occur before engine log-directory creation.
- Physical Samsung S8 remains unverified; emulator layout tests are not physical-device certification.

**Implementation checklist**

- [x] Selected styling in the existing Android wrapper, HELP, and supported gear-hide config.
- [x] One startup orientation before reveal; no delayed wave turn.
- [x] Sticky mode arming separated from menu Ctrl; STOP releases sticky construction.
- [x] Message lane, aspect ratio, repeated resize and input mapping checked.
- [x] Wave/research polls read appended bytes, preserve partial UTF-8/JSON and handle truncation.
- [x] Build, regression suites, actual touch construction and combined visual QA passed.
- [x] Complete engine JS/WASM/data and all 32 supplied extracted mod files match v2.2 byte for byte.

**Follow-up polish**

P3: slightly heavier command-label weight on large tablets. Physical S8 startup still requires a device test.
