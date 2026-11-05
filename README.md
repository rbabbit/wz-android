# Warzone Towers — Android

Full Android project for Warzone Towers, using the supplied
WZmodTowerDefense-v4.7.0-a mod with two selectable maps. The editable project is
at the repository root; open this folder in Android Studio.
Current Android version: **5.11-two-maps (61)**.

The start screen offers two included offline maps: **Tower Defense 1**
(NoQ's td1_v3, 64×80) and **Tower Defense 2** (arc's TowerDefense2_m, 64×64).
Both use the same supplied Tower Defense mod and 30-round schedule. TD1 keeps
its authored raised building platforms and four starting trucks; TD2 keeps its
existing starts and six trucks. Use the minimap to choose a building platform
on TD1; the trucks cannot build on its disconnected HQ route.

The original splash artwork remains visible behind a compact launch console.
Graphics and music downloads are separate controls; HQ download completion
stays on the start screen. Normal graphics work offline without either pack.
Music starts with no tracks selected. Choose tracks explicitly; saved choices
are retained, and enabling an empty playlist asks for a selection. Downloading
music does not switch playback on automatically.

See [v5.11 emulator evidence and limits](qa/v5.11/REPORT.md) for both maps,
offline launch, downloads, music selection and the three tested screen sizes.

The original mod owns all 30 timed rounds, enemy templates, ranks, research
delay, per-kill power rewards and HQ objective. Preparation lasts three minutes.
Rounds advance on the authored clock even while enemies survive. Skip Wave
advances the current wait once and keeps survivors. Defend the command centre;
clear all 30 rounds to win. Player research remains manual.

The previous Survival rules are no longer active. Their original archive and
the frozen v5.6 fallback remain preserved. Start a new battle when upgrading;
old Survival saves are not compatible with this scenario.

See [v5.7 verification and limits](qa/v5.7/REPORT.md). The exact APK passed the
mobile gameplay journey and native combat through round 5; all 30 rounds are
covered by the rules harness, with no claim of a complete native playthrough.

## Construction sidebar

BUILD opens the field sidebar immediately. Scroll its structure cards;
categories, construction activity and Exit stay visible. One structure tap
selects the closest construction group and activates placement. With no trucks,
it clears selection and activates no tool. Tap clear terrain to append native
build orders. Exit
keeps the orders. The queue shows live progress and approximate remaining build
time from actual truck work; completion remains controlled by Warzone.

v5.10 removes duplicate state requests, redundant selection and fixed input
waits. Every item tap, including a repeated item, still gets a fresh native
placement acknowledgement. Native world clicks keep their picking/input frame
barriers. Exit during setup cancels late activation; a brief native FIFO idle
gap no longer discards a queued site's progress display. See
[the response and gameplay evidence](qa/v5.10/REPORT.md).

The cards use existing Warzone research art and original engine-rendered build
thumbnails. On compact screens, the bottom-left units icon expands the field
commands; the collapsed console gives the catalogue the full left height.
Structure selection uses a small card spinner, without routine narration or a
central instruction panel. Selection updates existing cards, preserving their
images and scroll position. Item changes and Map retain the sidebar; queued
construction uses a fixed area so progress does not resize the catalogue.
Build exits cover native menu/viewport changes and blend back to the battlefield.
The native truck window and minimap stay outside the
placement view; MAP restores the minimap and keeps accepted orders. Research
retains the v5.4 layout. See [v5.6 verification](qa/v5.6/REPORT.md).

See [v5.8 transition and native-order verification](qa/v5.8/REPORT.md) for the
current build-selection/exit checks and their limits.

[v5.9 rapid Build/item verification](qa/v5.9/REPORT.md) covers actual MG-bunker
orders/completion, nearest constructors, an empty roster and a replacement truck.

## Downloads and saved versions

- [v5.4 lab sidebar: APK, complete source and checksums](https://github.com/rbabbit/wz-android/releases/tag/v5.4-lab-sidebar)
- [v5.4 selected-lab emulator verification](qa/v5.4/REPORT.md)

- [v5.3 header and live queues: APK, complete source and checksums](https://github.com/rbabbit/wz-android/releases/tag/v5.3-live-queues)
- [v5.3 emulator evidence and remaining limits](qa/v5.3/REPORT.md)

- [v5.2 tactical interface: APK, complete source and checksums](https://github.com/rbabbit/wz-android/releases/tag/v5.2-tactical-interface)
- [v5.2 tactical interface: tested flows, screenshots and explicit limits](qa/v5.2/REPORT.md)

- [v5.1 functional fixes: APK, source and checksums](https://github.com/rbabbit/wz-android/releases/tag/v5.1-functional-screens)
- [v5.1 screen verification and deferred redesign](qa/v5.1-fixes/REPORT.md)

- [v5.0 APK, editable source and checksums](https://github.com/rbabbit/wz-android/releases/tag/v5.0-gameplay-audit)
- [v5.0 gameplay evidence and explicit test limits](qa/v5.0/REPORT.md)

- [v4.9 APK and complete editable source](https://github.com/rbabbit/wz-android/releases/tag/v4.9-command-fixes)
- [v4.9 fixes and emulator test evidence](qa/v4.9/REPORT.md)

- [v4.8 APK and complete editable source](https://github.com/rbabbit/wz-android/releases/tag/v4.8-command-pages)
- [v4.7 APK and complete editable source](https://github.com/rbabbit/wz-android/releases/tag/v4.7-startup-music)
- [v4.6 frozen APK/source and original Music recovery pack/notices](https://github.com/rbabbit/wz-android/releases/tag/v4.6-music-controls)
- [v4.5 APK, frozen source ZIP and optional HQ pack](https://github.com/rbabbit/wz-android/releases/tag/v4.5-graphics-choice)
- [Older Towers APKs/source ZIPs, verified fallbacks and reference material](https://github.com/rbabbit/wz-android/releases/tag/project-archive-2026-11-02)
- [Earlier archive catalogue, sizes and SHA-256 values](archive/releases.json)
- [v4.7 snapshot metadata](archive/v4.7-release.json)
- [Restore and maintenance guide](docs/MAINTENANCE.md)

Releases preserve the original delivered files. The working source includes
native queued construction graphics, nearby builder grouping, the persistent
field console, production/page-return fixes and the startup playlist. Previous
releases remain frozen fallbacks.
The BUILD/DESIGN command pages are documented in [COMMAND-PAGES.md](docs/COMMAND-PAGES.md).
The repository's original manual-release README is retained in
`archive/repository-bootstrap-README.md`. Existing release 1.1.1 is preserved.

## Build from a fresh clone

Install Android Studio/JDK 17 or newer, Android SDK platform 36 and current Node
(Node 22+ for the live WebSocket tools). Configure the Android SDK in Studio or
set ANDROID_HOME / ANDROID_SDK_ROOT. The Gradle wrapper is included.

```powershell
git clone https://github.com/rbabbit/wz-android.git
cd wz-android
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
Get-ChildItem tools/test-*.cjs | ForEach-Object { node $_.FullName; if ($LASTEXITCODE) { throw $_.Name } }
python tools/verify-project.py
```

macOS/Linux: set the SDK/JDK environment, then `./gradlew assembleDebug`.
The APK is `app/build/outputs/apk/debug/app-debug.apk`. This is a debug/test build;
the owner's private signing keys are not part of the project archive.

## Where to mod

| Area | Files |
| --- | --- |
| Android startup, downloader, splash, viewport | `app/src/main/java/com/rbabbit/blocknight/warzone/` |
| Header, touch, HELP, research and wave HUD | `app/src/main/assets/warzone-*.js`, `blocknight-*.js`, `warzone/mobile.html`, `warzone/ui/` |
| Mobile round HUD, Skip and objective adapters | `scenario/` |
| Active supplied mod and exact original ZIP | `vendor/tower-defense/` |
| Preserved original map and superseded Survival archive | `vendor/survival/` |
| Engine and packaged gameplay payload | `app/src/main/assets/warzone/warzone2100.{js,wasm,data}` |
| Selected launcher/loading art | `app/src/main/res/` |
| Embedding, map registration, regression/live QA tools | `tools/` |
| Screenshots, interaction results and QA reports | `qa/`, `design-qa.md` |
| HQ provenance/manifest/notices | `vendor/graphics/hq-v3/` |
| Optional Music, pinned files and notices | `docs/MUSIC.md`, `vendor/music/official-v1/`, `warzone/music-*.js` |

Scenario edits must be embedded before building:

```powershell
.\tools\embed-warzone-towers.ps1
.\gradlew.bat assembleDebug
```

That script appends custom scenario data and redirects package-index entries.
It does not rewrite official engine code or the original packaged data prefix.
See [AGENTS.md](AGENTS.md) and the maintenance guide before changing game logic.

## Current verification limits

The exact v5.2 APK passed the reported command-screen and related native flows
at 1280x800 and 1080x600, with additional screen checks at the screenshot's
1600x720 aspect ratio. Native saved orders, structure completion, produced units
and movement support the screenshots. The wide pass also verifies a prepared
fifteen-constructor group, a 2x2 facility/module and native wave weapon firing.
See [the scoped evidence and remaining limits](qa/v5.2/REPORT.md).

The emulator's existing black terrain remains in Normal and HQ. Physical Samsung
behavior, cutouts, HQ appearance, audible quality and native Save/Load are not
certified by this pass. [Known issues](docs/KNOWN-ISSUES.md) retains the historical
device and renderer limits; previous releases remain frozen fallbacks.

## Release history

## Version 4.8-command-pages (48)

BUILD replaces the small native construction menu with larger, searchable cards,
stock research images and BUILD THIS. Selected constructors take priority; with
none selected the nearest reachable truck is assigned. Every tower placement
queues, and the chosen structure survives invalid taps, camera movement and
overlay returns. The queue page provides blocked-job Retry/Remove. Native work
is preserved until idle; the wrapper does not hold Ctrl or repeatedly reissue
build orders. A cached structure lookup keeps large queues from repeatedly
marshalling native lists every tick.

DESIGN validates researched body/propulsion/weapon or system combinations using
the original engine. SAVE DESIGN persists an editable device library. FACTORY
queues these real designs or existing templates using normal power/build time.
STATS opens the actual player/kill table. MORE holds secondary combat controls,
commanders and interface size. The duplicate native research/hex menu is hidden;
the minimap, TECH, Music startup, waves and supplied roster remain available.

The engine program/WASM and previous data prefix remain unchanged. Custom
scenario files are appended through the existing embedder. The tested v4.7 APK
and source were saved before changes. See the versioned QA report for exact
native tests and remaining physical-device limits.

## Version 4.7-startup-music (47)

Music track selection happens before the engine starts, with the original album
and track names, saved checkboxes, ALL/CLEAR and a small top-right START GAME
button. Startup choices use Warzone's native playlist preferences. Empty enabled
playlists require a selection or turning Music off. The original VPS pack and
all official engine/audio bytes remain unchanged.

The in-battle Music button, asynchronous pause/options navigation, injected
Music touches and rules that hid the command bar have been removed. The user's
screenshots showed that route getting stuck during gameplay. The command bar
now stays in its normal battle state while the selected music plays.

## Version 4.6-music-controls (46)

Optional Music downloads the complete original four-album collection from the
owner's VPS, verifies its SHA-256 and keeps it in private offline storage. The
Music command uses the original engine's options and track manager. See
[Music setup, provenance and notices](docs/MUSIC.md).

The input adapter preserves +Q through unrelated taps, small minimap finger
drift, camera tilt and HELP/TECH returns. Native menu taps release Ctrl; the next
construction placement restores it. STOP uses an acknowledged custom scenario
command for the selected friendly units. Repeated identical Android layouts no
longer request a new layout on every frame. No research automation or enemy
roster change is included.

Two-finger pointer updates are batched before choosing pan, pinch or tilt, so
parallel horizontal motion does not accidentally choose zoom. Skip Wave also
handles touch release directly and deduplicates the later compatibility click.

Official compiled engine code, WASM and the existing packaged data prefix are
preserved. Only the custom scenario bridge is appended/reindexed for STOP.
`tools/verify-engine-preservation.py` checks the complete engine and all 3,281
previous resolved assets against the frozen v4.5 APK.

## Version 4.5-graphics-choice (45)

The native launch screen offers Normal (included, offline) or High Quality
(optional 95 MiB terrain/water download). Downloads come from the owner's VPS,
can be cancelled/resumed, are SHA-256 verified and are cached in app-private
storage. Saved High Quality works offline; Normal remains available after a
failed download. The choice is saved and can be changed on the next launch.

The complete engine JS/WASM/data, map/mod and existing branding are unchanged.
High Quality mounts the original official v3 high.wz using the engine's native
terrain override path and terrainMode=2. See `qa/v4.5/graphics-qa.md` for tests,
VPS URLs and the limitation: actual pack use was verified, but the emulator's
pre-existing dark-terrain problem prevents a reliable visual comparison.
Physical Samsung tablet testing remains pending.

Before changes, v4.4 was saved and verified in
`C:/timerApp/_backups/warzone-towers-v4.4-before-graphics-20261102-224641`.

## Version 4.4-help-return (44)

HELP now uses an app overlay with an explicit return action that restores the
command header, full-width viewport and canvas focus, releases transient input,
and removes interaction blocking. The host stays pinned to the screen when
focus changes. CLOSE, BACK TO BATTLE and Escape use the same return action.

The previous v4.3 APK and a fresh verified source snapshot were saved before
editing under `_backups/warzone-towers-v4.3-before-help-fix-20261102-220111`
beside this project. See `qa/v4.4/help-return-qa.md` for actual touch/scroll
tests and the limits of emulator verification. Engine, wave rules and mod/map
assets are unchanged.

## Version 4.3-camera-waves (43)

A verified v4.2 fallback was saved before these edits under
`C:/timerApp/_backups/warzone-towers-v4.2-before-wave-camera-20261102-212219`.
It contains the previous APK, a fresh source archive, per-file source hashes
and restore notes. The delivered v4.2 APK/source ZIP remain intact as well.

Wave status and Skip Wave now occupy the top-right command area. Compact
screens use a second command row so controls do not overlap. One-finger
swipes pan; two fingers sliding together up/down tilt; pinch still zooms.
The square minimap's touch area replaces the old tall-map approximation.

Every new battle has four minutes of preparation, announced in a dialog.
Wave 1 starts automatically even when no defences or combat units are built.
Skip Wave can start sooner and retains all surviving enemies. The original
mod roster and spawner remain in use; the custom wrapper supplies a minimum
spawn budget when player combat power is zero.

## Version 4.2-fullscreen (42)

The battlefield now uses a real full-width engine viewport below the 50px
command row. It no longer scales the finished canvas into a smaller centred
rectangle, so there are no grey page gutters or distorted touch coordinates.
TECH temporarily uses the whole viewport and restores the battle layout when
closed. Android reserves enough virtual height for the unmodified engine on
short landscape screens.

The engine-loading splash uses a panoramic adaptation of the selected green
field artwork with Android CENTER_CROP, filling the display without stretching
or side panels. The launcher icon remains the original selected illustration.

See `qa/v4.2/fullscreen-qa.md` for emulator evidence, viewport checks, real touch
construction and research verification, preservation hashes and limitations.
The official engine, supplied Survival mod and map are unchanged by this release.

## Earlier Block Night prototype history

## Version 3.0 camera presets

The battle toolbar now includes **CLOSE**, **STD**, and **WIDE** camera buttons.
Each button starts from Warzone's native standard camera command, so its result
is repeatable even after manual pinch zooming. Pinch zoom remains available and
clears the highlighted preset as soon as the player fine-tunes the view. This
is Android-wrapper input/UI only; the official Warzone engine and art assets
remain unchanged.

This Android prototype packages the official Warzone 2100 4.7.0 WebAssembly
engine as a focused human-versus-bot skirmish:

- player 0 is human and player 1 is the official NullBot AI on Medium;
- the supplied `2c-dumb25a` map is converted non-destructively to 20 oil
  derricks and five power generators per player;
- normal T1 base building, research, unit design, production, and combat;
- Warzone's own rendering, terrain, targeting, weapons, armour, damage, and
  destruction systems;
- an Android WebView shell for cross-origin isolation, WASM threads, offline
  assets, and a low-latency touch adapter.

`tools/prepare-1v1-map.ps1` creates the reduced-economy map without changing
the source `.wz`. `tools/inject-1v1-map.ps1` embeds that map and the
`scenario/blocknight1v1.json` skirmish configuration into the Emscripten data
archive. `tools/register-1v1-level.ps1` extends Warzone's built-in
`addon.lev` index so the engine discovers the embedded map.

Touch controls: a tap uses Warzone's native contextual action, so it selects a
unit when tapped and moves/attacks/repairs with the current selection when a
destination is tapped. A drag uses Warzone's native continuous mouse-pan;
long-press opens the native right-click unit menu, and pinch zooms. Tapping the
tall side radar jumps the view immediately, while dragging on it moves the view
continuously. Pointer capture, coalesced touch samples, a device-scaled movement
threshold, and immediate visual feedback make gestures responsive without
turning small finger movement into an accidental camera drag. The phone build
enables the native middle-mouse pan binding with a fast touch-tuned multiplier;
it does not translate swipes into keyboard pulses. The human camera is aligned
down-map toward the opponent when the battle begins.

The in-game Unit Groups strip starts hidden. Seven compact top-left controls add
phone-friendly army handling: `ALL` locks battlefield orders to every current
combat unit (never constructors), reselecting before each order so newly built
combat units are included; `AUTO` sends that army through Warzone's native
Patrol order; `BOX` arms one-shot drag selection; `+Q` queues contextual orders;
`STOP` stops the selected army; and `BASE` jumps back to headquarters. The
wrapper also sets the lobby's VTOL Factory limit to zero before marking the
human ready.

Version 2.3 keeps the phone-first `TECH COMMAND` browser and synchronizes it
with Warzone's authoritative research ordering, laboratory IDs/readiness,
assignment acknowledgements, completions, power and newly built labs. It shows
the real available names, categories, power and research-point costs; provides
compact controls for every live laboratory; and assigns the exact engine topic
ID to the selected facility. A correctly sorted native-input path remains as a
compatibility fallback. Prerequisites, availability and completion remain
authoritative inside the official engine; the custom screen does not invent a
progress percentage that Warzone's scripting API does not expose.

The wrapper presses Warzone's own `Start Hosting` and human `Ready` controls
after the engine loads, so it enters the match without assigning an AI to the
human slot.

Version 2.5 paces those native lobby interactions from completion callbacks so
slow screen transitions cannot collapse the Limits, VTOL, and Ready taps into
one burst on high-resolution devices. It also replaces an unsupported QuickJS
`localeCompare` call in the custom TECH bridge with deterministic lexical
ordering. The upstream engine and official content remain unchanged.

Version 2.6 replaces the TECH screen with the landscape-first Tactical Queue:
five persistent lab controls, a compact research list, a selected-technology
detail panel, and an explicit select-then-assign action. Research thumbnails are
the stock icons from the Warzone 2100 Beta Guide research tree; no generated
technology artwork is included. Engine authority and the v2.5 startup fixes are
preserved. The engine-command keyboard bridge is paced for the slower Android
WebView game loop so complete topic IDs arrive before submission.

Version 2.8 turns that screen into a player-controlled prerequisite queue. Each
of the five laboratories has its own ordered queue, and only technologies the
player explicitly taps are added. An idle lab starts its first queued item; when
that research completes, the same lab starts the next queued item. Busy labs can
be loaded in advance, duplicate topics are blocked across all labs, queued items
can be removed before they start, and Back to Battle leaves the queues running.
The wrapper never chooses a technology and never bypasses Warzone's own
availability or prerequisite rules.

The queue is implemented as a Block Night map rule that includes Warzone's
official multiplayer rules unchanged and adds only the player-selected queue.
Back to Battle sends the exact ordered lists once through Warzone's native text
input, covered by the Tactical Queue until the engine acknowledges them. Queue
commands use an idempotent nonce, an 80 ms character pace for the slow WebView
game loop, a bounded retry, and a short consecutive-update guard. The old path
that opened Warzone's research panel, paused battle, and moved the camera has
been removed.

Pixel 10 API 35 testing with audio disabled verified a 2.9-second normal
two-item queue sync, synced-item removal, automatic same-lab continuation 300 ms
after completion, all five labs researching simultaneously, and a clean return
to battle with no native chat, research, or pause panel left open. The final run
recorded zero queue timeouts or assignment failures. Official engine integrity
was checked separately: `warzone2100.wasm`, the manifest and favicon are
byte-identical to v2.7, and the complete v2.7 data archive is an identical prefix
of v2.8; v2.8 only appends the custom Block Night challenge/rule payload.

Warzone 2100 is licensed under GPL-2.0-or-later. Upstream source and license:
<https://github.com/Warzone2100/warzone2100>
