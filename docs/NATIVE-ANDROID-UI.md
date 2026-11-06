# Android interface in v6.1

The app-owned gameplay interface uses Android Views. This is a UI migration,
not a port of the Warzone engine to native Android graphics.

| Surface | Implementation |
| --- | --- |
| Header, wave/power display and Skip | Android LinearLayout, Button, TextView |
| Field commands, Build catalogue and Orders | Android layouts, ListView and Button |
| Research catalogue, laboratory selection, progress and waiting queue | Android ListView, Spinner, ProgressBar and TextView |
| Factory selection, quantities, designs and production queue | Android Spinner, ListView and Button |
| Design editor and persistent blueprint library | Android EditText, Spinner, ListView and AlertDialog |
| Help, interface size, confirmations and component choices | Android ScrollView, Button and AlertDialog |
| Touch feedback and temporary transition cover | Android Canvas View and PixelCopy/ImageView |
| Startup, graphics/music setup, downloads, loading and results | Existing Android Views |
| Battlefield, radar, messages and green construction blueprints | Official Warzone WebGL/WASM inside WebView |
| Original pause/save/load, statistics and commander menus | Official Warzone engine UI inside WebView |

`TowersNativeUi.java` owns presentation. Android dp/sp sizes are independent of
the renderer's minimum viewport. The engine surface is clipped and uniformly
scaled when needed; Android controls are not scaled as part of that surface.
The header stays one row, with secondary commands in More and the four main
actions in a horizontal scroller when space is limited. Buttons retain a
minimum 48dp height. Pages and lists provide the necessary scrolling.

Research and Factory each have one scrollable summary/queue pane beside the
catalogue. Design pins Save and Save New above the scrolling validation and
statistics; the component form scrolls separately. The blueprint library uses
the available width. Build occupies at most 45% of the stage width, leaving
the remaining battlefield interactive. List updates wait until touch/fling
ends, and use stable identities rather than whichever row index is visible.

Research remains manual. The selected lab owns its exact waiting queue.
Changing laboratories does not assign topics automatically. Factory choices
and quantities address the selected native factory. Original Warzone power,
availability, compatibility, limits and production time remain authoritative.

Saved blueprints use the existing `saved_designs_v1` Android private preference
and version-1 JSON format. They survive battles and process restarts. Editing
preserves the blueprint ID; Save as New creates another ID. Components must
still be researched in the current battle before production is allowed.
The original engine validates component combinations before saving. Android
app-data removal/uninstallation also removes this private library.

## Compact Towers layout

The approved compact layout uses a flat 48dp header and a single 48dp toolbar
on Research and Factory. At Standard size on the 1080x600/density240 profile,
the two-to-one catalogue/summary split shows five complete catalogue actions.
Rows use existing 32dp game art, 14sp names, 11sp secondary text and thin dividers.
Header widths reserve the measured text; enlarged labels and captions retain
full native line height. On constrained widths, secondary status combines and
the main action rail can scroll while preserving 48dp touch heights.

Research shows the selected laboratory's actual current/waiting work and the
other labs. Selecting another lab does not assign research. Its catalogue
keeps stable rows during a visit, including rapid start/queue taps.

Factory provides minus, quantity presets and plus, bounded 1..20. Waiting units
from the same production command appear as one counted batch. Removing that
row sends its exact waiting job IDs for the selected factory; a job promoted
to active production continues, separate orders and other factories remain.
Clear waiting also preserves the active job. The current adapter exposes no
reliable build-point percentage, so the UI uses an indeterminate bar and real
elapsed simulation time with a waiting count. It never invents a percentage.

Routine successful actions on Research, Factory and Build use their visible
queue/blueprint state instead of a Toast covering choices. Errors and explicit
save confirmations remain. Factory subtitles show actual body/propulsion names;
locked or incompatible saved models retain their production restriction.

## Transport and lifecycle

The five `warzone-*-core.js`, `warzone-engine-input.js` and
`warzone-native-bridge.js` runtime assets transport data, queues and engine
input. They do not create HTML interface controls. The former HTML/CSS UI is
retained under `archive/legacy-html-ui/` and is absent from the APK. The small
`warzone/mobile.html` document hosts the official engine frame. In
`warzone/index.html`, only the Android app-exit callback changes: it reads the
final native result and carries the battle session. The package verifier
compares the rest of that HTML byte for byte with v5.12.

Android sends typed, bounded requests with a battle session ID. Replies, model
updates, navigation and feedback must match that session. Page changes use
generation guards. A new battle clears old page/selection/pending state while
retaining the device blueprint library. Old callbacks cannot open a page in a
new match. Native pages block touches in their own bounds; Build leaves the
rest of the battlefield interactive.

Lab numbering follows sorted native IDs, including after QuickLoad. A fresh
battle clears page filters and resets production quantity to one. Those resets
do not remove saved blueprints. Android confirmations and component pickers
use their actual window bounds and preserve the selected identity when live
labels change.

Research keeps topic order for the current visit: starting or completing a
topic disables its existing row, and new unlocks append. Action columns keep
the same measured width as their status changes. This prevents a rapid second
tap from choosing the topic that moved into the previous row's position.
Opening Research again refreshes the available catalogue.

Consumed research, command, Skip Wave, camera and Stop requests are replaced
atomically with inert payloads after acknowledgement, so a loaded save cannot
replay them. The files remain present for the native poller. Matching the nonce preserves newer requests when an older
acknowledgement arrives. The native command
snapshot now includes a read-only copy of each lab's waiting queue. The Android
data adapter reconciles that state after loading, while preserving in-flight
manual edits. The compact version also adds the exact scoped waiting-production removal handler
to the app's custom command script;
the supplied game rules, mod, maps and official engine program are unchanged.

Button minimum sizes update in both Android's View and TextView layers after
a density change. Header actions therefore do not retain the previous display
density's pixel width. Text scales independently from the 48dp touch height.

The native engine owns accepted orders. Build retains real builder-card
selection, fresh placement acknowledgement for repeated choices, native FIFO
and original queued blueprint rendering. Exit drains accepted input and keeps
orders. STOP uses the existing acknowledged selected-unit command. Pause and
save/load remain original engine screens; the Android return controls follow
observed simulation progress, including a save that rewinds the clock.

## Verification

Native diagnostics inspect actual Java view instances and screen rectangles,
including dialog origins and list bounds. They do not infer Android UI from
WebView accessibility labels. Installed-APK journeys combine real Android
touches/screenshots with fresh native command replies and complete native
saves. `tools/native-checkpoint.cjs` can preserve and restore an entire ordinary
QuickSave without editing units, research, power or rules.

`tools/verify-native-interface-package.py` compares the candidate to frozen
v5.12: retired browser UI absent, Android classes packaged, all source assets
matching, unchanged official engine code/WASM/resources, and the complete
original data prefix preserved. The data index redirects the app's custom
command script to an appended copy with the read-only queue field and exact
waiting-group removal handler added.
The preservation verifier checks that exact difference and every other
resolved original asset; it does not claim the entire data bundle is identical.
Historical HTML UI tests are provenance/regression aids, not evidence that the
current Android interface works. See `qa/v6.1-compact/` for current scoped evidence and `qa/native-ui/` for v6.0 history.

Physical-device rendering, audio/performance and a complete native 30-round
playthrough remain separate verification limits. The existing black terrain
on the software emulator is not fixed by replacing the app interface.
