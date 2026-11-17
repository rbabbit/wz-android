# Warzone Towers 0.92 Players polish — scoped runtime audit

This is a normal local test APK. The scoped Players, layout, navigation/input
and related native gameplay groups described below have been observed on the
exact current build across Towers, Campaign, FFA, owned multiplayer and live
spectator roles. This is not a claim of testing every device or game feature.
Renderer limits, input paths, prepared fixtures and incomplete original helper
artifacts are retained explicitly. The accompanying integrity, runtime and
source-package records define artifact identity and verification scope. No
publication is part of this test delivery.

## Exact current build

- APK: `app/build/outputs/apk/release/app-release.apk`
- Delivery copy: `C:/timerApp/Warzone-Towers-0.92-Test.apk`
- SHA256: `134246af423c0ea04b375409f41d179813a739968d260855e73784a9109b6b66`
- Bytes: `640638187`
- Application: `com.rbabbit.warzonetowers.lab`
- Version: code `92`, name `0.92`; release, not debuggable.
- Signing certificate SHA256:
  `4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`
- Accepted baseline APK SHA256:
  `a19848c0ecfac6a4b20b1510f5889b771fd739de340da7e842916d59cfe020d3`

The current APK was installed with the same exact hash, recorded in
`71-final-build-installed.json`. The owned headless emulator is the only test
device in this journey; the user's 5558 session, retained 5560 pilot data and
physical phone are not controlled here.

## Verified source and artifact scope

All 659 packaged assets match current source. Compared with the accepted
baseline, only `warzone-command-pages.js` and
`warzone/ui/towers-game-controls.css` change; the official Phosphor
`warzone/ui/icons/eye.svg` is the only added asset. The icon's MIT license and
provenance accompany the source. Gradle changes only version metadata. Android
sources/resources, Cronet libraries and networking, native engines, game data,
maps, media and the normal APK builder are unchanged. No AAB was built.

The focused UI proof passes 14 JavaScript VM/event/VFS and source-scope groups:
native freshness and role/capability invalidation, escaped names and hidden
values, tab/detail navigation, per-view scroll/focus through updates, held input,
pending production ACK delivery, global Players/Back return and teardown. These
checks do not substitute for actual Android pixels or gameplay observations.

- UI proof SHA256:
  `9c3f936cc8d40c785d1ba4d2710eca7ba75b13c488b1fb89299ff875070d2235`
- Current CSS SHA256:
  `943dbede482bef78780e28d4cf52f436e73790f238a2ccbfba435220739b2b8e`

The preserved first 0.92 APK is
`d0d3f16f8f3c0ee7f36fc78dc57c7ae8f2e91d788fcf085ad5e318b56acf67ad`.
The sole subsequent app-source correction explicitly enables
`touch-action: pan-x pan-y` on the Players content ancestor. JavaScript, native
code, networking and other app source do not change between these iterations.

## Completed current-build observations

### Live multiplayer spectator

Exact current APK `134246af…` completes the live spectator journey with actual
spectator ID `13` and no owned-game commands. Participants, separate real
watchers, Details, Economy and Upgrades are physically captured. Complete
formatted DOM cells match actual recent native packets, and native Host power
advances during the live check. Unallocated slots are not counted as watchers.

`75a-final-real-finger-observation.json` and its physical PNG verify horizontal
Upgrades scrolling. Android Instrumentation delivers 12 `MotionEvent` frames
using `SOURCE_TOUCHSCREEN` and a finger tool. The browser receives trusted touch
pointer events on the table, `defaultPrevented: false`, and takes over the pan
through the normal pointer-cancel path. Horizontal scroll reaches approximately
`52.6667` CSS pixels; the rightmost A-A column becomes visible while the identity
column remains fixed. Scroll persists across more than 1500 ms of advancing
native real time and Economy ↔ Upgrades returns.

Initial spectator native DATA_CHECK is verified. Stock native source excludes
spectators from DATA_CHECK stage 2; no stage-2 success is claimed for this
spectator. This is distinct from an owned player's protocol checks.

Global PLAYERS close/reopen/close and normal native Return are observed. After
return, the Activity reports the session inactive and its session Service off;
the physical native public lobby is visible. The owned Spec2 host is stopped and
cleaned up at 17:27:07, before its fixed 600-second deadline.

Primary outcome: `79-final-spec-journey-outcome.json`. Supporting evidence:
73–78 role/data-check, participant/watcher/details captures, live-cell history,
real-finger input, scroll retention, navigation and physical return screenshots.
This uses the disclosed synthetic private directory and owned native host,
not public-directory, official signed-join or cellular transport verification.

### Towers

The current APK completes Towers at standard size and physical 1280 × 720.
Actual screenshots verify the compact layout. Global Players toggle and Android
Back return work. The prepared save uses seeded combat IDs `1900001` and
`1900003`; these are not ordinary-production evidence.

Four actual constructors receive a normal move ACK and complete movement,
verified from native positions. Build → Players → battlefield preserves movement
and restores requested combat selection; explicit OFF deselects combat units.
Original save archive hashes remain unchanged.

`final-towers-r2-result.json` retains its incomplete tool status because an
accessibility snapshot was briefly unavailable after normal native Return had
already reached the picker. The actual picker is visible in
`final-towers-live-operator.png`; a fresh normal BACK reaches six-item Home with
no Back overlay. `final-towers-r2-completion.json` binds the original result SHA
and those completed observations. The original report is not rewritten as an
uninterrupted tool pass. External helper snapshot/input changes do not alter the
target APK.

### Campaign

The current-build Campaign outcome is observed through
`final-campaign-combined-completion.json`: initial Players panel/side/privacy and
toggle evidence in `final-campaign-result.json` is combined with
`final-campaign-keyboard-completion.json`, whose exact SHA256 is bound by the
combined record. The two earlier partial report statuses are preserved; the
combined completion supplies their subsequent input/return observations.

Two actual hardware Enter/Tab cycles open the native Android keyboard, hide it
with Back and cancel the rename without saving. Actual focus is checked before
each hardware key; no DOM focus or click mutation is used to make these cycles
pass. IME-open/Back and post-movement PNGs were reviewed. After the keyboard
returns, all five actual combat units receive a normal MOVE ACK and change
native positions. Explicit OFF is then applied through a measured Android
`SOURCE_MOUSE` tap, with native selection empty. Normal native Return reaches
Home without a Back overlay, and the original save archive hashes remain
unchanged. The game was not reloaded and movement was not requeued to obtain
this completion.

Two earlier touch-receipt attempts are retained as fixture observations: they
showed trusted pointer down/up without the expected click. A later full-event
receipt in `final-campaign-cancel-full-events-adb.json` records a trusted click
and successful Cancel. No applicable global suppressor was found and protected
navigation is unchanged; those earlier input-delivery attempts do not establish
a source bug. The actual input paths above are disclosed rather than claiming
that every step used finger touch.

### FFA

The current-build standard and physical 1280 × 720 Players layouts, all four
native participant rows and privacy fields have been visually reviewed. The
standard Players toggle and actual Android Back return pass. An earlier
additional compact reopen could not be receipted and is preserved separately;
the subsequent actual asynchronous finger compact toggle and Android Back now
pass on this same current APK. The earlier attempt is not classified as an app
defect or retroactively rewritten as successful input delivery.

Ordinary factory ACK/job evidence exists in
`final-ffa-production-on-production-ack.json`. The first subsequent Players
handoff was unreceipted and is not counted. After the bounded external-helper
asynchronous native-input correction, `final-ffa-async-resume-result.json`
records trusted touch receipts including Factory → Players. The same native
production job then completes without reload or requeue. Its actual birth is
visible while Players is open in `final-ffa-async-born-panel.json` and its PNG,
with owned unit count increasing from five to six. New unit `166599`, Design 1,
is produced by native factory `160969`. It joins requested combat selection after
Players closes; explicit OFF then leaves native selection empty. These are
current-build ordinary-production observations.

The earlier asynchronous report keeps its incomplete temporal-bound status;
continuing the same job to observable completion does not rewrite that artifact
or label the slow emulator game clock as a product failure. The scoped
`final-ffa-async-completion.json` retains its incomplete status because the normal
native Return transition exceeded the helper's three-second bound. Actual picker
BACK then reaches Home without a Back overlay. The observed
`final-ffa-final-combined-completion.json` binds the scoped report's SHA256 and
records that completed native return and unchanged original save hashes, without
rerunning gameplay. The helper correction changes no target APK/source.
Historical first-build births below are not substituted for current-build
observations.

### Owned-player multiplayer — combined observed checks

Owned-player MP5 and targeted MP6 use bounded owned-host deadlines and
asynchronous real-finger input receipts. The MP5 Ready click is actually
receipted, but the original helper's eight-second phase check still sees
connecting. The same host/session is continued after reaching the actual game,
without a second Ready action. `run5-ready-transition-completion.json` binds that
transition and both owned-player native DATA_CHECK stages 1 and 2; the earlier
bounded artifact remains a fixture transition limit, not an app defect.

The current native real/viewed player is `1/1` with ownership. A trusted actual
finger click opens the Players surface. The physical
`run5-resumed-async-04-initial-panel` PNG is reviewed: two actual participants,
zero watchers, Host/You labels, no restricted Details tab and hidden private
fields rendered as em dashes.

The first ordinary native production job completes as combat unit `160691`,
with history ACK and subsequent native factory idle. A fixture oracle initially
misses that completion because ephemeral feedback is gone and the multiplayer
private UI VM does not populate `finishedUnits`. One independent second ordinary
job is queued only after the first factory is actually idle. Its native ACK/job
is observed, Players opens through a receipted input, and new combat ID `160693`
appears while the panel is open. Closing Players restores requested ON selection
of both `160691` and `160693`. These observations are retained in
`run5-final-flow-result.json` and the physical `run5-final-born-panel` capture.

That report retains an incomplete status because its final strict name assertion
uses a field absent by design: native multiplayer `selectedUnits` publishes ID,
position, order and constructor information, not a unit name. No name assertion
is promoted into a pass, and this schema mismatch is not an app defect. The
ordinary production and restored-selection facts are established by actual
native ACK/job, combat-ID difference and selected-ID state. The observed
`run5-production-corrected-oracle-completion.json` binds the original report SHA,
the source-oracle audit, actual second job and native selected-unit payload
without inventing a name field. Physical birth-panel captures were reviewed.

The fixed 600-second host limit then expires before explicit OFF and user Return.
`run5-final-bounded-cleanup.json` verifies host cleanup, session inactive, Service
off and unchanged save hashes. Automatic bounded cleanup does not substitute
for a user-initiated normal Return.

The single targeted MP6 fixture, bounded to 240 seconds, completes real-finger
ON/OFF, Players open/close and actual native user Return, with no production
repeat. Its initial combat count is zero and OFF leaves native selection empty.
This is an explicit OFF/empty-state check, not a claim that MP6 cleared a
nonempty army; nonempty OFF deselection is observed in the current Towers,
Campaign and FFA journeys. MP5 separately establishes nonempty restored ON
selection including its newly produced unit.

The normal native Return dialog is captured and Return is actually pressed.
The helper loses its JavaScript evaluation callback while the context unloads,
so `run6-targeted-result.json` retains its original incomplete status. Direct
post-Return observations establish session inactive, session Service off and
lobby phase; the physical native lobby is reviewed, then actual BACK reaches
Home without a Back overlay. Original archive hashes remain unchanged. The
owned host exits normally before its 240-second cap after the peer returns.
`run6-final-combined-completion.json` binds the original report SHA, ON/OFF proof,
native dialog and those completed return observations. No second Ready or
Return input is used to make this result pass.

## Prior iteration and fixture disclosures

The first `d0d3…` iteration's Towers/Campaign/FFA and private player observations
remain preserved. In particular, ordinary FFA production recorded actual factory
ACKs/jobs and births while Players was open: ON unit `166703` was selected after
return, and OFF unit `166809` remained unselected. These are historical
first-iteration checks, not a current `134246af…` ordinary-production pass. The
unmodified Campaign save and FFA checkpoint are distinct from seeded Towers.

The first private-host wrapper incorrectly required a listening socket to stay
open after match start. That fixture was stopped and cleaned up; it is not an
app defect. Subsequent owned fixtures remain bounded and separate from public
network tests. Private host scripts, credentials, tokens and raw device exports
are excluded from the source package.

The initial `adb input swipe` path produced zero table motion/focus behaviour.
The later real-finger path succeeds on the corrected APK. The old APK was not
tested with that real-finger input path, so no old-APK finger failure is claimed.

Swiftshader produced an inherited all-black multiplayer physical composition.
One bounded host-GPU comparison with the same APK/user data restores foreground
models, the native header, minimap and Players pixels. Terrain remains black as
in the accepted baseline and is not claimed fixed. Earlier DOM-only screenshots
are not retroactively treated as physical visual passes. This renderer limit
must remain in the final result and delivery notes.

## Source restoration and packaging status

Source-only preparation/restoration for the current frozen source passes first
apply, repeated apply, interrupted known-state normalization, local-edit refusal
before mutation and corrupt-override refusal before mutation. Current manifest:
`baf5ec9b1fd5284a5e450421efec32c0cd646e31aace9a3cfeecd5876a761cf7`.
The previous source profile, proof and earlier audit are preserved. Restoration
built no APK, created no ZIP and establishes no runtime pass.

All scoped runtime groups above are observed. Sealing records the exact APK
identity, evidence and limitations in `focused-runtime.json` and binds the
integrity, runtime, audit and source-manifest hashes in `final-validation.json`.
Complete-source packaging appends the current `test-release-092` profile and
curated JSON/PNG evidence to the immutable accepted complete baseline, retaining
all 14,705 original members and their compressed source records.
`source-package-validation.json` records the archive identity and preservation
checks. Private host files, credentials, signing material and raw device exports
are outside that packaging scope.

`final-exact-delivery-and-cleanup-preflight.json` verifies the delivered APK copy
against the unchanged source APK, both SHA256 `134246af…` and `640638187` bytes.
All eight owned test hosts are stopped, only the external test helper is
uninstalled, and the temporary forwarding entry is removed. Existing APKs and
save archive hashes are preserved.

Existing APKs, complete source archives, saves and prepared states are preserved.
No VPS, update feed, website, GitHub or Google Play changes occur. Publication
requires the user's approval of the exact tested APK.
