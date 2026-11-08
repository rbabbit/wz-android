# Warzone Towers 0.7 — Android Back and TRUCKS

Status: required source, package, actual navigation/gameplay and manual visual checks passed for the exact candidate below. Delivery packaging is gated on these reports and performs complete source-archive CRC/SHA readback.

- Version: 0.7, version code 7; package remains `com.rbabbit.warzonetowers.lab`.
- Candidate: `C:/timerApp/candidates/Warzone-Towers-0.7-r2.apk`.
- Candidate SHA-256: `ba46094e485677985842c202d931c5109a29903c75c376389928676d3a918a40`.

## Reported problems and scope

The supplied phone recording shows Android navigation Back opening the original purple pause menu instead of the app's “Return to main menu?” confirmation. The recording does not identify its installed APK version. TRUCKS selection also produced a visible flash. These two input paths are the scope of this release.

## Changes

Android Back and hardware Escape are intercepted before the focused game WebView can pass their legacy key events to Chromium. Paired key handling guards repeats, cancelled events and orphan releases. Modern Android Back uses an overlay-priority callback with an IME-first guard. The existing Cancel/Return confirmation remains the destination during gameplay; keyboard, panel and non-game handling retain their existing roles.

TRUCKS discovery uses localized native selection rectangles projected from constructor tile volumes. Nearby volumes can be clustered within bounded dimensions; mixed-unit splitting stays local and actual native constructor IDs are verified. A verified, stationary group selected again in the same view requires no native drag gesture. Moving trucks or camera changes trigger fresh verification. Camera observation for this path does not read GPU terrain meshes. Native input cadence and existing order preservation remain in place.

These changes do not rebuild the engine or change game data, maps, scenarios, artwork, icons or CSS. Runtime changes are confined to `MainActivity.java`, `warzone-command-pages.js` and `warzone-terrain-picker.js`, plus the version bump and focused checks.

## Source verification — passed

All 18 focused checks passed against the candidate's source. The recorded result and candidate identity are in `code-checks.json`.

The checks cover extracted Java Back routing, truck-selection flicker regressions, worker groups, visible and fresh selection, cached selection, modules, native box input, HTML input modes, smooth building, the command bridge, lifecycle, menu returns, touch zoom and terrain projection. Source checks do not establish actual Android navigation behaviour or visual gameplay quality.

## Exact APK emulator verification

Four gameplay reports passed on the installed r2 APK in the API 36 emulator:

- [TRUCKS selection](trucks/trucks.json): native constructor IDs and orders preserved, selection reverified across views, and stationary repeats used zero native selection boxes.
- [Cross-area construction](two-groups/two-groups.json): fresh authored Dustfall, ordinary catalogue/radar/ground touches and separate worker groups; construction orders remained assigned to their own trucks. No units were granted or world positions edited.
- [Mixed-unit and construction journey](mixed/mixed-selection.json): combat units excluded from constructor selection, exact native IDs verified, two construction jobs completed in FIFO order, movement/STOP worked, and STATS, Factory, Help and Research returns restored input.

The mixed-unit journey loaded a complete, genuine Iron Valley native save from ordinary gameplay: six trucks and two normally produced tanks. It did not grant units or edit the world. This distinguishes the reused save fixture from the fresh Dustfall run.

The [Back journey](back/back-menu.json) passed actual SystemUI Back taps with live screenshot readiness checks, Factory/Help/Research/Build and keyboard dismissal, three confirmation cancellations, dialog cancellation using Android Back, actual Escape111 intercepted before WebView, modern-dispatched Back4, Queue input restoration, direct Return to the custom main menu and a fresh battle with a new session. Saved phone designs and native QuickSave bytes remained unchanged across Return and the fresh battle.

## Visual review and limits

The old reproduction recording showed the broad field flash. Review of the r2 recording/contact sheet found that broad flash absent; repeated selection generated zero native boxes. Small localized native selection feedback remains during fresh verification.

Testing is on an API 36 emulator; no physical handset has been tested. Black terrain is a pre-existing emulator rendering limitation observed with both APKs, whose native engine is unchanged. Truck feedback and overlays were reviewed within that limit. Accepted screenshots and recording observations are recorded in visual-review.json. The original gestural emulator navigation setting was restored after the three-button journey, then the app was left at its custom main menu.

## Preservation and delivery

The initial 0.6 APK, complete source archive and checksum were preserved under `C:/timerApp/fallbacks/towers-before-back-flicker-fix-20261107`. Earlier releases and v6.4 remain fallbacks. The r2 [package verifier](package-verification.json) passed: same app ID and signing certificate, all 463 APK assets match source, engine/resources/maps/layout preserved, all 26 fallback artifact records intact, and v6.4 clean with 4,916 manifest files verified.

DELIVERY.json records the exact installed candidate and all required passing reports. tools/package-test-07.py validates that evidence, the source manifest, preserved fallbacks and every archive entry before exposing Warzone-Towers-0.7.apk and warzone-towers-0.7-source.zip. The separate delivery SHA256 file records the resulting APK and complete source archive hashes.

The initial r1 test found a stationary-repeat cache miss caused by transient HTML rectangle subdivision; r2 fixes canonical coverage and passed repeated selection. Separate fixture failures were diagnosed without runtime changes: UIAutomator exposed only the app window rather than SystemUI, a transient navigation tap occurred before the bar was ready, and a recording completion listener was attached too late. Their original reports are retained under diagnostics and the r1 cache diagnostic directory. Final navigation taps observe the actual Back triangle and Home circle before input. No engine rebuild or repeated army production was used.
