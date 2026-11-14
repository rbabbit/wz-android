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
