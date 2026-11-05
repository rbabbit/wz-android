# v5.8 build transition smoothing

Clean delivery and installed APK SHA-256:
`8e885733bcc4b905791a1db7c6973702814ec016b7401e7bb7c562aef6090455`.
Tested on emulator-5556, with no audio. v5.7 APK/source/checksums remain frozen.

## Reproduction and changes

Real Android taps reproduced BUILD → item → different item → Trucks → BUILD →
item → Exit. The baseline compositor recording and per-frame DOM measurements
showed 15 complete catalogue replacements, a hidden/reopened sidebar during an
item change, and a shrink/expand cycle of the native viewport between items.

The cards/images now remain alive while selection, busy state and cost labels
update. Busy spinners reserve their space and cards no longer flash dim. The
queue has fixed geometry, including reserved progress rows and a fully visible
View All action. Changing an item retains both the sidebar and native viewport.
Map exit also retains the sidebar. Trucks reuses an already-correct local group
instead of reopening its native picker. Explicit and automatic exits cover
native menu/viewport changes with a fresh battlefield frame, then use a short
120 ms blend; reduced-motion settings skip the blend. Nested operations retain
the cover until their last owner releases it.

The equivalent delivery recording contains 214 compositor frames and one initial
catalogue render. The item change contains no sidebar-hidden frame or viewport
change. See transition-results.json and delivery/results.json; JPEG sequences
and contact sheets are retained for visual inspection.

## Exact-APK gameplay and screen checks

journey/results.json records the integrated checks from an ordinary fresh match,
using real Android taps and native saves, without debug units, research, power
or structures:

- Actual card/image node identity remains stable through item changes. The
  sidebar stays visible through selection and Map exit.
- Three native trucks received two tower FIFO orders. Both orders survived
  changing the chosen item and Exit; both completed as actual native structures.
- Completed/current queue content retains the same catalogue height. A further
  three-site native queue kept View All entirely inside its panel and tappable.
- Trucks retained the real local construction group after placement. Field
  MOVE orders and changed native positions verified input restoration.
- Exit/Keep Orders, Map, Trucks and Select/Move return to the battlefield.
  Ordinary tank-trap construction also completed and automatically closed the
  placement tool, restored the minimap and removed the frame cover.
- Research and Factory returns restored field input. Placement and exit screens
  passed geometry/hit-target checks at 1080x600, 1280x576 and 1600x720.
- Screenshots, including the three-site queue, were inspected. No captured
  runtime errors or Preparing/central construction narration occurred in the
  delivery journey. Installed and built APK hashes match.

The final gameplay assertions passed before a trailing pause-fixture comparison
received one last 500 ms log update. verify-build-journey.cjs verified the settled
native clock and the same completed evidence without replaying gameplay. The
test state is paused. Earlier fixture corrections (a blocked movement tile and
a compact-only layout assertion applied to a large screen) and the queue-spacing
iteration are retained separately; the final journey uses validated sites and
the corrected screen checks.

## Preservation and limits

verify-ui-only-package.py confirms that only warzone-command-pages.js and
command-pages.css changed among the APK assets/resources. Engine JS, WASM, data,
the exact Tower Defense mod/scenario and Research assets are byte-identical to
v5.7. All active regression scripts pass, including nested frame ownership,
accepted-input draining, Map retention and later-navigation precedence.

This verifies the reported transition flow and its related orders/returns. It
does not certify physical-device frame rate or every possible input timing.
The native viewport still changes when entering/leaving placement to keep the
stock truck window outside the visible play area; item changes no longer repeat
that change. Existing emulator black terrain and physical rendering/audio/
performance limits remain. No new 30-round endurance run was performed for this
UI-only release; v5.7's mod verification remains applicable.
