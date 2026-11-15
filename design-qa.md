# v0.84 Native landscape landing menus — design QA

**Findings**

No actionable P0/P1/P2 visual differences remain in the five final native
landing screens. This is a scoped menu/design pass; gameplay terrain rendering
quality remains outside it. Every landing uses the retained monochrome native
controls, real artwork/data and the approved compact hierarchy.

**Visual truth and rendered evidence**

The five selected generated images were opened together with their actual APK
screenshots in paired comparison inputs. A second agent independently compared
the same pairs and compact captures. Source filenames, exact pixel dimensions,
copies and screenshot hashes are in `qa/native-landings-084/visual-comparisons.json`.

| Screen | Selected visual | Exact installed APK |
| --- | --- | --- |
| Home | `qa/native-landings-084/reference-home.png` | `qa/native-landings-084/final-normal-home.png` |
| Campaign | `qa/native-landings-084/reference-campaign.png` | `qa/native-landings-084/final-normal-campaign.png` |
| Towers | `qa/native-landings-084/reference-towers.png` | `qa/native-landings-084/final-normal-towers.png` |
| FFA | `qa/native-landings-084/reference-ffa.png` | `qa/native-landings-084/final-normal-ffa.png` |
| Multiplayer | `qa/native-landings-084/reference-multiplayer.png` | `qa/native-landings-084/final-normal-multiplayer.png` |

Actual native screenshots are 1688x780 pixels at 320dpi, or 844x390dp.
References have approximately the same landscape aspect ratio and are compared
at that logical size. Native display-cutout clearance is retained; the bezel-free
references have none. There is no CSS viewport, browser frame or simulated phone
chrome in these Android View captures. Compact evidence is 1280x640 pixels,
640x320dp, with both 100% and 130% text (`final-compact-*`, `final-large-*`).

State differences are explicit: live wallet/counts/room names change, real map
names retain the directory's capitalization, and catalog descriptions retain
their actual content. Unknown occupancy remains “Up to N”; it is never invented
as a measured count. The current version label is rbabbit v0.84.

**Required fidelity surfaces**

- Fonts/typography: retained Oswald supplies the compact game labels, with native
  body text for descriptions. All six Home destinations, map settings, player
  name/suffix, counts and Join actions are readable. The generated mock's heavier
  letter strokes differ from native Oswald antialiasing; this is P3, not a new
  font or a web-style heading. Native compact text sizing is intentional.
- Spacing/layout rhythm: Home restores the original logo/grey-tank composition
  and a single compact six-button row. Campaign keeps a Back/header and left
  actions with art fading into black. Towers/FFA use preview-left/settings-right
  with separate fixed Play/Start and bounded paging. Multiplayer uses flat rows
  and wraps the native header on a narrower phone. No persistent control is
  outside the viewport. Campaign's compact body intentionally scrolls, and the
  captured scroll reaches Continue and its real saved-games list.
- Colors/tokens: black surfaces, charcoal controls, light primary actions and
  white/grey text follow the existing Towers theme. The native checkbox has
  visible checked/unchecked states; blocked/full room actions are disabled.
  There are no blue engine panels or web-page headers in these landing screens.
- Images/assets: the official logo, original grey tank, existing Campaign
  illustration and actual uncropped map previews remain sharp and correctly
  placed. No rasterized controls, replacement icons or drawn approximations
  were used. The Home logo is slightly smaller than the generated example in
  order to retain the original Home geometry; this is acceptable P3 drift.
- Copy/content: no direct-IP form, duplicate version labels or Players heading
  remains in the visible public list. The fixed mobile suffix and compact counts
  are present. Actual map/Cobra/difficulty/save/download semantics are preserved;
  generated illustrative descriptions and live data are not hardcoded.

Full-size inputs made the important header/control/name/count/image regions
clearly readable. Those regions were specifically inspected in both paired
images; additional cropped/resized images were unnecessary.

**Iteration history**

1. First APK: all five visual compositions were inspected against the selected
   references. No P0/P1/P2 composition issue was found. Actual keyboard state
   exposed the new name field's Android fullscreen/extract editor. Independent
   source review also found that invalid-name Done discarded error focus.
2. The field now requests NO_EXTRACT_UI/NO_FULLSCREEN and consumes a failed Done
   without dismissing focus. The actual Java listener branches were executed in
   focused host checks; the rebuilt APK's real keyboard stayed inline with the
   suffix visible (`final-mp-inline-keyboard.png`, `final-mp-ime-state.txt`).
3. The exact rebuilt APK completed all six routes, compact and enlarged-text
   captures, Campaign scrolling/saves, native filter/Refresh and name persistence.
   Final paired review found no actionable P0/P1/P2 visual issue. Native Join
   reached the real private host, Ready started its match, and Return restored
   the public list. A normal Towers game retained Research, touch pan and its
   engine through background/resume.

**Fixture diagnosis and verification limits**

An early Home predicate incorrectly treated the retained blank background
WebView as a visible page. It was corrected after inspecting the real screen and
fresh hierarchy. Transient null-root/not-idle automation responses during
navigation/rendering were handled by observed-state waits or direct engine
state/screenshots. They are not reported as app defects. An early shell-quoted
test expression was replaced with the checked-in test helper. No product code
was changed for these fixture errors.

The private directory entry and game-ID resolution were temporary transport
fixtures, with synthetic advertised occupancy. Its TCP/room/Ready/match were
real. No public chat or gameplay seed was used. Existing black emulator terrain,
physical phones, full public matches, every mission and every map's gameplay are
not covered by this menu QA. Exact scope/pins: `qa/native-landings-084/verification.json`.

**Implementation checklist**

- All five approved landscape native landings implemented.
- Real data/navigation/profile/filter/Join paths retained and observed.
- Small screen, enlarged text, keyboard, scrolling and return paths checked.
- Initial v0.83 APK/source fallback preserved; exact APK/source packaging gated
  on these observations and asset/signature/source checks.

final result: passed

---

# v0.83 Portrait Home design QA

**Findings**

No actionable P0, P1 or P2 visual findings remain in the latest default Home
capture. The navy surface, metal logo, readable tagline, tank/base hero, four
image cards, cyan Towers edge, Guide/Hub and version are visible without overlap
or truncation. This is a scoped visual pass, not a claim that every runtime
state or game was tested.

**Comparison Target and Evidence**

- Source visual truth: `qa/portrait-home-083/reference.png`, copied from the
  selected second generated image
  `C:/Users/punke/.codex/generated_images/01a1adef-d5f1-7a72-8d73-6a3c8a03cf57/exec-4c3ccad3-ab27-45e6-bde4-48b7de73f9be.png`.
- Rendered implementation: `qa/portrait-home-083/delivery-home-reference.png`;
  native Android production APK Home, default portrait state and font scale1.0.
- Source pixels:852x1846. Actual screenshot:780x1688, density320dpi,
  native logical viewport390x844dp. CSS/device-template sizing does not apply
  to this native View/ScrollView/Canvas implementation.
- Density normalization: actual pixels are2x native dp. For comparison the
  source is understood at the same390dp width (approximately845dp high); the
  approximately1dp aspect difference is not treated as design drift. Both
  original images were opened together in the same comparison input. No browser
  canvas, prototype phone frame or bitmap device chrome was substituted.
- Real display-cutout clearance reserves92physical pixels (46dp) at the top.
  The reference is bezel-free and has no such physical safe area. The resulting
  lower logo/header position is expected; placing it underneath the cutout
  would reduce fidelity to the actual device's usable screen.
- Initial implementation evidence is retained in
  `qa/portrait-home-083/delivery-home-default.png`.

**Required Fidelity Surfaces**

- **Fonts/typography:** retained Oswald matches the condensed game hierarchy.
  All four uppercase mode titles and their smaller descriptions are readable.
  MULTIPLAYER fits; the exact tagline is legible on one line in the final
  default capture; Guide/Hub and version are clear. Native antialiasing and a
  somewhat heavier title weight are acceptable platform-level/P3 differences.
- **Spacing/layout rhythm:** the metal logo/tagline/hero/2x2 cards/auxiliary row
  follow the selected hierarchy. Card columns, gutters, caption alignment,
  bounded radii and safe edges are consistent. All six destinations and the
  version fit the observed viewport. The real cutout accounts for the top
  displacement; it is not an extra application heading or wasted content row.
- **Colors/tokens:** the deep navy/slate background is opaque again, rather than
  near black after repaint. White text has clear contrast and Towers uses the
  selected cyan outline. The top/bottom hero fade now blends into the page;
  no hard horizontal image/header seam remains.
- **Image quality/assets:** the real metal logo and five source-directed raster
  assets are sharp at their displayed sizes. The hero preserves the tank,
  satellite base and mountain setting. Each mode has a distinct relevant image;
  caption panels mask cleanly and image corners follow the card outline.
  Regenerated asset camera angles are not pixel-identical to the reference,
  but retain its subject, palette and role without placeholders or copied UI.
- **Copy/content:** the requested research/build/upgrade tagline is exact.
  Campaign/The original story, Towers/Defend your base, FFA/Cobra bot battles,
  Multiplayer/Online battles, Guide and Hub match the chosen target. The
  reference's rbabbitv0.82 becoming rbabbitv0.83 is an intentional release
  update, not a content defect.

**Focused Comparison**

Both full-resolution inputs were inspected specifically at the logo/tagline,
all four image/caption bands and Guide/Hub/version. These regions were readable
in the original full-size inputs, so additional cropped/resized evidence was
unnecessary. Mode subjects remain recognizable, subtitles do not run into the
next card, and text has no raster halo or clipping. This detailed pass is
separate from judging the overall composition.

**Comparison History**

1. **Initial P2 header/image break:** the earlier Home capture showed excess
   reserved hidden-system-bar space and a sharp hero boundary. CENTER_CROP
   artwork could paint outside its box behind the tagline. Fix: use visible
   system-bar plus cutout bounds, clip the hero, and alpha-blend its edges into
   the backdrop. Post-fix evidence is the latest delivery Home capture; the
   remaining physical cutout clearance is expected.
2. **Post-fix P2 background repaint:** reusing the grid Paint left alpha10 on
   the next gradient fill, making the surface nearly black. Fix: restore an
   opaque paint color before each background fill. The current screenshot
   shows the navy surface restored. An actual-method host regression also
   checks successive fills remain opaque; that stub check is not an Android
   screenshot substitute.
3. **Configuration P2 typography consistency:** tagline/version/Guide/Hub
   retained old SP-converted sizes after a font change, unlike the card paints.
   Fix: refresh all five native SP sizes at measure start. The final default
   capture has coherent text proportions. The actual-method regression checks
   the refresh calls; this visual report does not independently certify the
   entire font-scale/compact runtime journey before root's final status.

**Open Questions**

No blocking visual ambiguity remains for the observed default Home state.
Runtime routes, compact/enlarged-font scrolling, orientation restoration,
busy/error states and gameplay are separate verification scopes. Root reports
all six existing destinations and their Back paths checked; this comparison did
not operate the emulator or independently repeat those routes.

**Implementation Checklist**

- [x] Compare the selected source and latest native APK screenshot together.
- [x] Inspect full composition and readable text/tile-art regions.
- [x] Check typography, layout, palette, imagery and exact copy.
- [x] Revisit earlier header/seam, background-alpha and font-refresh findings.
- [x] Keep physical safe-area differences and runtime verification limits clear.
- [x] Preserve the initial capture and historical QA below.

**Follow-up Polish**

- [P3] A more detailed source-directed cartographic background texture and
  slightly lighter mode-title weight could narrow the remaining decorative
  differences. They do not change the current hierarchy, readability or use.
- [P3] Individual regenerated scenes have different camera framing from the
  reference; further art-direction refinement can be a later asset iteration.

final result: passed

---

# v0.82 Home tagline and Multiplayer spectator verification

The native Home mode screen adds only the exact requested small top line.
Actual production layout and retained Oswald font metrics passed 1,104 host
geometry assertions across 48 compact/normal size, density, font and inset cases.
Art, existing six button actions and version placement remain unchanged.

The isolated official 4.7 two-Cobra observer fixture uses the ordinary native
pre-start spectator slot and private host/admin controls. The v0.81 baseline
started at slot 14; after an initial CDP wait timeout it rendered a world while
repeatedly logging invalid owner reads for player 14 (enumDroid, enumStruct,
enumResearch and playerPower). This is an ownership-boundary finding; a CDP
wait timeout alone does not prove that the native simulation froze.

The new native client gates only player-private UI ownership using the real
selected identity. Observer rendering/camera readiness is separate, and parent
UI, adapter and controls reject owned commands. Native host C++ checks passed
21 capability/preservation assertions; those remain distinct from the actual
Android observations below. The installed delivery APK was verified by Android
shell SHA-256 as `fecd9bfb968cf0a96f0e8bf978c8616dfdbe5057bf2c83ee3b5971aff82bf702`.

The actual observer joined before start at native slot 14. Render frame count
advanced from 2 to 1614; pan, rotation, zoom, tilt and minimap navigation changed
native camera coordinates. Owner requests were denied, selection stayed empty
and the game chrome showed only Music/Lobby. Repeated Music menu returns and
Lobby Cancel/Stay/Return reached the app lobby correctly.

A normal native player 0 retained `canIssueOrders:true`; Research (two labs),
Manufacturing (two factories) and Queue opened/closed, two trucks were selected,
and an actual ADB swipe changed camera X from 10624 to 8932. Return reached the
app lobby. Normal and 640x320dp Home screenshots, then the restored layout,
showed the tagline and all six buttons without overlap. Evidence remains under
`qa/multiplayer-spectator-082/`. No physical-phone or full-public-match run is
claimed. Black terrain persisted in normal and spectator emulator captures
before/after this change; no GL error identified its cause.

# v0.80 Multiplayer room polish verification

The room retains the approved roster/chat/Ready structure during focus, typing
and keyboard dismissal. Only available height changes; the interface does not
switch to a separate chat page. Both lists retain native overflow scrolling and
reading anchors across incremental room updates and resize. A map button opens
a native terrain preview, with preparing/unavailable states rather than fake art.

Actual-method host checks cover Java room/IME bounds and generation events,
unchanged game scaling/Back policy and exact click-audio routing. DOM/browser
checks cover inline typing, scrolling, Send, preview rendering, click playback
and mute policy. Native/helper and adapter checks cover bounded preview bytes,
map identity, privacy and cache lifecycle. These are distinct from the exact
installed-APK observations in `qa/multiplayer-room-080/`; they do not establish
Android keyboard, physical audio or full-match behavior.

The separately installed exact candidate `5837d90552d9ab2a675b4a7fd645fff89d8ee014f8eba6cbb86d02384cae7a1e`
passed actual private-host room checks: natural text entry and Send with the
roster/footer retained; real `/help` host replies; finger chat scrolling with a
new inbound reply preserving the reading position; and an overflowing compact
roster scrolled by touch. Normal room bounds were 1210x576 CSS pixels, compact
807x480, and compact IME bounds 807x219, followed by full-height restoration.

The existing click clip produced nonzero decoded PCM in the actual WebView
(peak 0.03634, RMS 0.01106); native config mute blocked new playback and was
restored. This is an analyser observation, not a physical speaker audition.
Actual built-in SkMountain 96x96 and downloaded EMAG_FFA 128x128 previews
matched native RGB/canvas bytes with zero mismatches. The custom map was absent
before joining and transferred by the private host; its digest is retained in
`qa/multiplayer-room-080/delivery-custom-download.json`. Ready started the real
private Cobra match. In the real SkMountain match, selected units 160003/160001
received native move order 2/action 1 and moved from 87,80 and 88,80 to 87,81 and
88,81. Stop returned order 0, Deselect cleared the selected IDs, and a real
two-finger gesture moved camera 10624 to 11488, ending with zero pointers and
no runtime errors. Android Back/Stay retained phase game; Back/Return reached
the custom lobby, and the next Back restored Home. Evidence is retained in
`delivery-gameplay-input.json/png`, `delivery-game-return-lobby.json/png` and
`delivery-home-restored.png` under the 080 QA directory. Physical speaker
audition, a physical phone and a full public match were not verified.

# v0.79 Multiplayer waiting-room verification

The approved first mock is implemented with the existing monochrome font and
soft rectangle controls: scrolling player list, room chat/composer and compact
team/spectator/Ready controls. Readiness and player changes are confirmed by
later native room snapshots; pending commands do not fabricate their effects.

Focused host checks execute the actual DOM/CSS, session/adapter, native room
helper and Java Back methods. They cover compact layouts, keyboard viewport
simulations, permissions, literal chat, pending actions and generation fences.
These fixtures do not establish Android behavior. The exact installed APK
`a1c425fe98063b144eae2b83165e449279e559b6acfee4e5a2c50672b5e766c0`
separately passed the scoped private-host emulator journey. Actual observations
include room layout, `/help` server round trip, team C, player-to-spectator-and-back,
IME/Send touch and Back/options, Stay/Return/rejoin covers, Ready and match entry.
The Send pointer-down/blur issue was fixed and retested with actual touch.

In the started match, units 160001/160003 received move order 2 and changed
positions; Stop/Deselect, camera movement and Research/Manufacturing/Queue were
checked before returning to the lobby. Existing FFA/Campaign setup navigation
and Towers world/Research were also checked. Screenshots and native observations
are retained under `qa/multiplayer-room-079/`. Actual unready, a full public match
and physical phones were not tested.

# v0.78 Research and name-editor host checks

The actual shared renderer/styles are checked in host Chromium with controlled
native replies. Research covers four modes at normal and compact sizes, available
topics, selected-lab current artwork/progress, ordered queues, retry and scrolling.
Design name editing is checked with shrinking and overlay keyboard viewport
simulations. These are host layout checks, not observed Android keyboard or
gameplay results. No emulator tests were run at the user's request.

Proofs and screenshots: `qa/research-assignment-078/`. v0.77 remains the fallback.

# v0.60 FFA visual verification

Visual result: passed for the inspected Home, setup, match, Build and Intelligence surfaces.

Delivery candidate SHA256: `ddd4ff09b1c4e7943dfc10df49a88fca152798c3b2f1472a823d335c83cd269f`.

FFA reuses the current monochrome theme, rounded controls, logo and grey tank.
The minimal Home adds one compact FFA control beside Campaign/Towers. The native
setup shows the fixed EMAG map, three independent opponents, VTOL OFF and the
three difficulty choices. No new splash artwork, giant mode cards or decorative
web layouts were introduced. Native setup controls retain 48dp touch bounds.

Root inspected the actual corrected-candidate 800x360dp Home/setup/game:
`qa/ffa-060/ddd4ff09-user-home.png`, `ddd4ff09-user-setup.png` and
`ddd4ff09-user-ffa-game.png`. Native accepted construction and completed-research
Intelligence captures from the preceding candidate were also inspected; clean
comparison confirms the UI classes/resources/shared assets are byte-identical.
Root inspected the corrected-candidate 640x360dp, font1.3 Home/setup in
`ddd4ff09-compact-home-recovered.png` and `ddd4ff09-compact-setup-recovered.png`,
plus the actual corrected-candidate game at that size:
`qa/ffa-060/ddd4ff09-compact-ffa-game.png`. The six header commands, FFA status,
Analysis/Manufacturing/Build footer and radar fit without clipping or overlapping
one another. Normal game objects may extend behind the radar as in existing modes.
The existing emulator dark-terrain rendering limitation is not a phone-art result.

Actual control, persistence, native AI and existing-mode journey results are
recorded separately in `archive/ffa-0.60-emulator-checks.json`. No full-match
balance, audio or phone-performance claim follows from these screenshots.

# v0.58 Back and map completion verification

final result: passed

## Reported screen and implementation

User screenshot: `archive/completion-0.58/design-reported-back.png`, 2400 x 1080. It shows Back with a taller visible face than Rewards/Saved Games. The intended change is to match its neighbours, not reproduce that defect.

Exact checked APK SHA256: `0bc1d0dcf86d5f4c046edd617e2c08bdf1274c9f8377ded1c63e0f7dfe671d89`.
Actual initial capture: `qa/completion-058/initial-back-matched.png`; final focused case screenshot: `archive/completion-0.58/small-map-actions-and-uncompleted-state.png`. Both use the reported phone profile: physical2400 x 1080, native800 x 360dp, density480 (3.0), font1.0. This screen is native Android, so no CSS viewport applies.

`archive/completion-0.58/comparison-back.png` presents the reported and implemented utility controls together at the same pixel scale. Back now uses the same 32dp painted face, 13sp single-line label and vertical inset as its neighbours, inside a 48dp touch rectangle. The full reported/implemented screens are compared together in `archive/completion-0.58/comparison-map-full.png` (each normalized to1200 x 540). Wallet/version/completion differences in that fixture are intentional. The complete implementation screenshot was also inspected; the existing map browser, art and navigation retain their layout.

The completion design requirement was textual: a small star and tiny Complete on the map. The implemented `★ Complete` is a separate10sp TextView beside the existing map-position row. It adds no new row/card height. Root inspected normal screenshots for seeded Fernpass completion and Greenhaven after native victory, plus `completion-persists-without-repeat-credit-compact-font13.png` at physical1280 x 720 / logical640 x 360dp / density320 / font1.3. The badge is legible, fully inside the card and clear of the position, metadata and arrow.

## Required visual surfaces

- Typography: Back matches existing utility typography; completion is deliberately subordinate10sp text, scales with system font and stays single-line. Existing title/body faces remain unchanged.
- Layout: utility visible heights match; original48dp touch targets remain. Completion shares the map-position row without shifting the preview, title, description or arrow. Compact font1.3 bounds/spacing checks pass.
- Colors: existing black/white/grey tokens and tactile rounded controls remain; no new theme introduced.
- Artwork: original logo, grey tank, map previews and all app assets are unchanged. The requested star is a text symbol in the completion label, not replacement artwork.
- Content: completed exact map IDs show `★ Complete`; incomplete Greenhaven before the win and incomplete Medium/Hard maps show no mark. No progress/bonus controls were added to the minimal splash.

The first visual comparison found no actionable P0/P1/P2 mismatch after implementation. No product changes were made after the checked APK was built. Native receipt scrolling remains the existing behaviour; the added difficulty bonus appears in its normal explanation and total.

## Wallet and native verification

`archive/completion-0.58-checks.json` records390 checks executing the actual RewardLedger/RewardStore on a JVM with simulated preference I/O:241 prior wallet/ad regressions plus149 completion checks. These cover all46 real catalogue IDs (Easy16, Medium15, Hard15), once-only1000 bonuses, legacy completed-history backfill, migration, restart, saved-run replay, failed-write rollback/retry, overflow and concurrent claims. These are host tests, not46 completed emulator games.

All five exact-APK emulator cases in `archive/completion-0.58/verify-completion-058.json` passed:

1. Phone-size Back/Rewards/Saves bounds, matched controls, incomplete Greenhaven unmarked.
2. Seeded15 Easy wins excluding Greenhaven: correct per-map marks across swipes, difficulty changes and restart; incomplete Medium/Hard maps remain unmarked.
3. Native terminal boundary: existing first-wave hostile160085 moved at1health into an existing guard tower's range in an emulator-only checkpoint; the current84-action config index/spawn state is set to its end, and only wave15 tracks that hostile. Actual native fire/destruction, native BNTDREWARD and the unchanged game-over poll generate victory. No Android/HTML win is fabricated. The ordinary wallet/receipt path records5 wave crystals +60 map +50 first win +1000 Easy bonus =1115; balance380 becomes1495, Easy claim is persisted and Greenhaven becomes Complete.
4. Cold restart, compact font1.3 badge inspection, Rewards open/Back and map reentry: completion/claim persist and balance stays1495 with no repeat credit.
5. An unfinished native Medium game returned normally: no completion, claim or crystal increase. Defeat and direct duplicate/saved-run callbacks are separately covered by the host checks.

The original emulator wallet backup remained untouched. After testing, its shell-transport CRLFs were normalized to LF for raw Android copying; exec-out verified the normalized bytes exactly. Restart migrated the original record to schema4 and verified original balance380, empty completed/claimed sets and unchanged inventory/loadout/ad state. No prepared progress or1115 test award remains in the restored wallet.

## Fixture history and limits

Three tool/fixture problems were diagnosed separately from the product and retained in the final history:

- The first native run already produced the correct1115 receipt and Complete mark, but an observer watched console/nativeOutput while native dump packets were consumed from log polling. Its F8 checkpoint also restored two bridge timer IDs recreated on initialization, causing duplicate-timer assertions. One bounded retry captured the genuine public activate(wave) packet synchronously before forwarding unchanged and omitted only those two duplicate saved poll timers; original game-over/other timers remained. Old assertions/screenshots are preserved rather than claimed error-free.
- A48%-width map gesture sometimes settled on the same page. An observed76%-width physical swipe selected the previous map; the fixture was corrected and only remaining cases resumed.
- Shell cat added CRLF transport endings, so restoration's original byte check compared transformed text. Raw exec-out and explicit LF normalization fixed that check without changing wallet values.

The final native attempt and remaining passed cases recorded no runtime errors. Known emulator terrain/shader limitations remain; no full15-wave or46-map playthrough, live ads, audible playback or physical-phone performance is claimed.

The delivered v0.57 APK/source remain preserved in `archive/fallback-0.58.json`. Packaging freezes every game engine/web/map/Campaign/scenario/music/ad asset and the minimal Home view; product changes are limited to the approved five Java files and version58. No GitHub/VPS action was performed.
