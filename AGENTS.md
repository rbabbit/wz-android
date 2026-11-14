# Warzone Towers maintenance rules

- 2026-11-14: v0.78 separates main Research into newly available technologies
  on the left and the selected lab's actual current topic plus ordered queue
  on the right, across Towers, Campaign, FFA and Multiplayer. Keep numeric lab
  tabs, batch assignment and native acknowledgement semantics; distinguish
  pending sync from confirmed work. Replace the bottom Design name input with
  a compact name editor above the keyboard, preserving drafts and input returns.
  Preserve v0.77 APK/full source first. Scope shared Research and command JS/CSS,
  version, documentation and focused host/browser checks. Native engines,
  gameplay, VFS, maps, saves and all unrelated features remain frozen. User
  requests NO emulator tests; disclose real Android keyboard/touch unverified.
  Preserve older fallbacks; no GitHub or VPS changes are requested.

- 2026-11-14: v0.77 implements the approved header-free Manufacturing/Queue
  mocks across Towers, FFA, Campaign and Multiplayer. Preserve v0.76 APK/full
  source first. Remove inner titles/power totals, Units and FACTORIES labels,
  quantity presets and redundant factory status/footer readouts. Use one
  compact family/factory/Design/Blueprints/options toolbar, inline real current
  unit status/progress, a repeat toggle and MANUFACTURE. Queue has one atomic
  STOP per factory: cancel native current, clear waiting and disable repeat.
  Repeat is authoritative per factory, saveable and bounded to one future job;
  respect native ownership, research, factory and power/unit limits. Preserve
  finite FIFO, other factories, construction, designs and all other interfaces.
  Scope is shared command UI/CSS, three command scripts, composed MP runtime and
  command-only VFS appends to existing data. No compiled client/WASM rebuild or
  map/research/Java changes. User explicitly requests NO emulator testing;
  focused actual-function/browser/payload/build/package checks only, with native
  gameplay and Android touch/rendering limits disclosed. No GitHub/VPS edits.

- 2026-11-14: v0.76 applies the approved compact main Research layout across
  Towers, FFA, Campaign and Multiplayer. Preserve delivered v0.75 APK/full source
  first. Remove the duplicate inner heading/power total, category controls and
  bottom current-lab/detail block; use lab icons with numeric faces. Keep all
  topics reachable when filters are hidden, preserve batch assignment, actual
  native queues and v0.73 active/queued status/progress. Scope is the shared
  Research JS/CSS plus version, documentation and focused host/browser checks.
  Footer Analysis, Manufacturing, Intelligence, Hub, Java, native engines and
  all unrelated content remain frozen. User explicitly requests NO emulator
  testing. Disclose host/browser checks do not verify Android gameplay/touch.
  Preserve historical source/proofs; no GitHub or VPS changes.

- 2026-11-14: v0.75 adds the approved Home HUB button and a separate compact
  monochrome results/rankings/player reader for Retropaganda's public data.
  Preserve v0.74 APK/full source first. Fetch/cache in a worker, calculate ratings
  only from a complete synced history, keep player identities and source method
  accurate, and display attribution. The Hub has no game bridge or Join action.
  Keep all working lobby, simulation, maps, music, ads, saves and other UI frozen.
  Scope: Home/Hub navigation, local Hub assets and focused offline/live-data checks.
  Continue the user's no-emulator preference; explicitly disclose host/browser
  checks do not establish Android rendering/touch or gameplay. No VPS/GitHub edits.

- 2026-11-14: v0.74 implements approved Home 3 and FFA 1 launcher layouts,
  with smaller FFA button faces and normal touch targets. Keep the Home mode
  buttons on one row where space permits; FFA preview stays uncropped and Start
  remains visible beside compact settings. Preserve v0.73 APK/full source first.
  Scope is the two native launcher views and their pure geometry helpers only,
  plus version, documentation and focused host checks. User explicitly requests
  NO emulator tests. Disclose host geometry/build checks cannot establish Android
  rendering or gameplay. Freeze gameplay, all assets, saves, ads and other UI.

- 2026-11-14: v0.73 applies the selected shaded Research rows across Towers,
  FFA, Campaign and Multiplayer. Keep researching and queued topics visible,
  show clear status/lab labels separately from batch selection, and preserve
  actual queue commands and game rules. Retain v0.72 APK/full source first.
  Scope is shared Research JS/CSS plus version and focused checks. User asks
  for NO emulator tests; use offline state/DOM/layout, build and package checks
  and disclose that Android gameplay was not tested. Freeze all native clients,
  maps, music, saves, ads and other UI. Preserve every earlier source/fallback.

- 2026-11-14: v0.72 fixes Multiplayer oil placement and adds its compact Music
  on/off menu. Preserve v0.71 APK/full source first. Exempt oil extractors from
  the app's extra spacing buffer while retaining overlap, deposit, native
  placement and reachability checks. Reuse bundled music with MP-only settings
  and lifecycle; freeze other modes and the compiled PC-compatible native client.
  User explicitly requests NO emulator testing for this release. Run focused
  offline code, media, build and package checks; state that Android gameplay and
  Android audio playback were not tested. Keep all earlier fallbacks/source.

- 2026-11-13: v0.69 adds Multiplayer to the main Home, importing the working
  separate test's original PC-compatible 4.7.0 engine (netcode 16384/104) and
  corrected official /lobby API. Keep its assets/activity/storage isolated from
  Towers/Campaign/FFA. Reuse mobile movement, selection and camera controls via
  stock native input; never use the modified protocol-1 engine for public play.
  Preserve delivered v0.68 APK/full source first. Test actual "1 vs Al Bots Battle"
  Ready/errors, gameplay input and Leave -> app lobby on the exact delivery APK,
  plus Home and existing-mode navigation. No public chat, GitHub or VPS changes.
  Keep native simulation unchanged and disclose any remaining limits.

- 2026-11-13: v0.68 edits terrain on the existing 45 authored FFA maps only.
  User rejected replacement compact mock layouts: preserve names/IDs, sizes,
  base locations, objects, economy and each map's existing identity. Add clear
  connected paths, rock banks and defined approaches to reduce excessive open
  combat ground. Protect base construction yards, real footprint foundations,
  factory exits, all oil access and useful flank links. Preserve the six original
  FFA maps, Towers/Campaign/Duel, compiled engines, AI, controls, music, saves,
  UI and rewards. Verify delivered v0.67 APK/full source as fallback first.
  User explicitly requests no emulator testing: offline binary/geometry,
  preservation, native-package/preload and build checks only, with limits stated.
  Keep all historical release proofs and source entries; create new 0.68 edit
  inputs/proofs and overview sheets. No GitHub, VPS or device operations.

- 2026-11-13: v0.67 adds 45 authored NTW-style FFA maps: fifteen each for two,
  three and four players, alongside the six existing maps. Preserve delivered
  v0.66 APK/full source through fallback-0.67.json first. Vary terrain topology,
  base positions and approaches; use spacious equal starting economies and
  reachable ground routes. Native two/three/four-player starts use one human
  and the remaining independent stock Cobra bots, Easy/Medium/Hard, VTOL off.
  Add compact player-count browsing and preserve map-aware/legacy saves.
  User explicitly requested NO emulator testing for this release; this overrides
  the usual exact-APK emulator workflow. Run offline geometry/binary/package,
  Java/runtime/save and UI checks, build and package APK/full source, and state
  that native gameplay/pathfinding/balance were not verified in the emulator.
  Preserve original maps, compiled engines, stock AI, music, gestures, other
  modes and older versions. No GitHub/VPS changes or device operations.

- 2026-11-12: v0.66 adds five user-supplied FFA maps beside EMAG, real swipe
  previews and map-aware starts/saves. Preserve delivered v0.65 APK/full source
  through fallback-0.66.json first. Keep every original .wz byte and its licence;
  preserve authored bases, units, terrain and oil. One human and independent
  stock Cobra occupy all remaining slots (three opponents on four-player maps,
  five on EMAJ-6P), with existing Easy/Medium/Hard and no VTOL. Keep legacy EMAG
  Cobra/NullBot saves readable; validate actual map, level, slots and native AI
  contexts. Add MUSIC to FFA and Campaign: FFA shuffles all 39 bundled songs;
  Campaign follows the native three-track in-game playlist, mission-start
  randomisation, ordered advance and video/results suspension. Preserve Towers
  assigned-track behavior, audio bytes, gestures, other gameplay and v6.4.
  Verify all six native map starts, legacy and six-player save/load, real media
  decoding/lifecycle, compact setup/music controls and input restoration on the
  exact APK. Reuse one prepared emulator; bound fixture recovery and disclose
  synthetic identity fixtures and absent physical-speaker verification. Package
  the checked APK and complete retained source; no GitHub or VPS changes.

- 2026-11-12: v0.65 adds a compact Home Guide and an offline reader shared by
  in-game Help. Preserve delivered v0.64 APK/full source first. Use actual app
  controls, real unmodified screenshots with runtime numbered annotations, and
  exact bundled research graphs (390 MP/Towers, 390 FFA with 24 air topics
  explicitly unavailable, separate 413 Campaign). All prerequisites are AND;
  mission artefacts remain conditional. Cover the ten requested practical
  chapters, research branches, source attribution and mode differences. Freeze
  gameplay, native payloads, gestures, maps, saves, rewards, music and ads.
  Check the guide offline, search/links/back, screenshot enlargement, compact
  screens and Home/Help return input on the exact delivery APK. Reuse prepared
  states; do not repeat combat/AI/long gesture suites for this reading feature.
  Preserve source/image provenance and package exact APK + complete source.

- 2026-11-12: v0.64 switches all NEW FFA matches to the exact bundled stock
  Cobra AI at native Easy/Medium/Hard, retaining three independent enemies,
  the original EMAG map and VTOL restrictions. Preserve delivered v0.63 APK
  and complete source through fallback-0.64.json first. Reuse the matched
  generic engine/WASM and isolated FFA payload; no native compilation. Keep
  stock Cobra and dependencies unchanged, including native timer hydration.
  Preserve the exact legacy NullBot files/AI name for existing saved matches.
  Add botType from actual native script identities, not launch labels; verify
  save metadata, native AI names/contexts/difficulty and restore proof agree.
  Missing legacy botType means NullBot; new starts explicitly Cobra, with no
  new bot picker. Label setup and saved/live matches accurately. Freeze the
  touch controls, other modes, maps, music, ads and rewards. Check real Cobra
  progress at all difficulties, hostility/no-air, save/load with continuing AI,
  legacy NullBot compatibility, compact labels and relevant existing routes
  on the exact APK. Reuse ordinary prepared states, bound fixtures and restore
  wallet/profile afterward. Package exact APK/full source; no GitHub or VPS.

- 2026-11-12: v0.63 improves inconsistent rotation recognition. Preserve
  delivered v0.62 APK/full source through fallback-0.63.json first. Actual
  native repros: a 40px-span 20-degree pivot does nothing, and a small initial
  spacing change permanently locks zoom without emitting any zoom, ignoring
  the subsequent full turn. Use realistic short, mixed and uneven strokes;
  reduce excessive close-finger slop and allow clear, sustained angular intent
  to take over from provisional/earlier gestures with hysteresis. Filter signed
  angular noise and asynchronous pointer updates. Rebase on handoff rather
  than replay old motion; wait for native mouse release/rearm before pan-to-yaw
  and guard delayed work against changed fingers, menu or session. Preserve
  pure pinch/tilt/pan, full turns, one-finger lifecycle and release cleanup.
  Product scope is shared touch controls plus version only; all native data,
  gameplay, construction, saves and other UI stay frozen to v0.62. Focused host
  and exact-APK native natural-stroke checks across modes and compact screens,
  then package APK/full source. Do not repeat long full-circle staged fixtures.

- 2026-11-12: v0.62 corrects two-finger gesture classification for full-circle
  rotation in Towers, Campaign and FFA. Preserve delivered v0.61 APK/full
  source through fallback-0.62.json first. Reproduce anchored/adjacent-finger
  arcs on native camera state: v0.61 misclassified these as pitch tilt despite
  native yaw already allowing unlimited turns. Recognize angular movement with
  one finger stationary or unequal/opposed movement; reserve pan/tilt for
  coherent parallel travel. Preserve pinch, accepted one-finger pan, input
  fences, lift/cancel/menu cleanup and rotation selection-cache invalidation.
  Keep the pending-pulse budget bounded without imposing a yaw angle limit.
  Product changes are shared touch controls and version only. Freeze all
  native payloads, construction, saves, other UI and gameplay. Focused host
  transitions and exact-delivery native quarter-turn/full-circle observations
  in all three modes, then package APK/full source. No unrelated changes.

- 2026-11-12: v0.61 fixes crowded construction queues and adds two-finger
  twist rotation in Towers, Campaign and FFA. Preserve delivered v0.60 APK
  and complete source through fallback-0.61.json first. Validate queued
  footprint spacing against native placement, include both app jobs and
  observer journals, and revalidate before dispatch. Keep invalid accepted
  plans visible with a reason and explicit selected-truck retry/cancel;
  never borrow remote trucks or silently discard/reorder construction.
  Preserve modules, cancellation, per-worker queues and saved orders.
  Add twist yaw including 180-degree reversal while preserving parallel
  two-finger tilt, pinch zoom and accepted one-finger pan lifecycle. Honor
  input fences and release on lift/cancel/menu; invalidate visible-truck
  selection when the camera rotates. Reuse prepared emulator native states,
  run focused checks and relevant exact-delivery APK journeys in all modes,
  then package APK and full source. No unrelated UI, maps, ads, GitHub or VPS.

- 2026-11-12: v0.60 adds a separate FFA (Free for All) section alongside
  Campaign/Towers, using the user's exact four-start EMAG_FFA archive. Preserve
  delivered v0.59 APK/full source through fallback-0.60.json first. Human0 plus
  three independent native NullBots, native Easy/Medium/Hard, no alliances and
  no VTOL aircraft/factories/pads. Keep the authored map/base objects; factories
  are built during play. Reuse the matched generic native program with isolated
  FFA data/config and stock ground AI/endconditions; do not rebuild or overwrite
  Campaign/Towers/hidden Duel runtimes. Apply narrow FFA-only air policy while
  preserving reachable ground tech, costs and effects. Separate FFA phone saves
  and native identities; never enter Towers crystal/reward accounting. Reuse
  the existing mobile command menus, footer, touch controls and monochrome theme.
  Test actual four-player state, bot progress, air restrictions, real construction,
  research/manufacturing/cancel, saves/load and repeated menu/input returns on
  the exact delivery APK. Review compact screens and smoke-test existing modes.
  Disclose ordinary versus prepared fixtures and full-match/balance limits.
  Keep every old release/source entry; no GitHub, VPS, live ads or GIF changes.

- 2026-11-12: v0.59 changes only the Android launcher icon to the authentic
  bundled WZ2100 steel shield. Preserve delivered v0.58 APK/full source through
  fallback-0.59.json first. Copy android-chrome-192x192.png unchanged into a
  dedicated drawable; update standard/round legacy wrappers and adaptive
  foreground with mask-safe padding. Preserve the splash, shared branding art,
  all Java/gameplay/assets, music, saves and rewards. Version bump only beyond
  launcher resources. User explicitly requested NO emulator testing; perform
  build/resource/package checks and deliver APK/full source without claiming
  runtime launcher verification. No GIF work, GitHub or VPS changes.

- 2026-11-11: v0.58 authorized Back utility face matching and small per-map
  star/Complete markers for native Towers victories. Reuse existing completed
  map history; persist one-time +1000 crystals per all actual catalogue maps
  won in each Easy16/Medium15/Hard15 group. Credit balance, completion and claim
  flags together in the existing atomic phone wallet; preserve wave/map/ad and
  saved-run anti-duplication accounting, legacy saves and previous win history.
  Reconcile already-completed legacy groups once on Home. No new splash design.
  Preserve v0.57 APK/full source first via fallback-0.58.json; freeze all game
  web/native runtimes, maps, scenarios, Campaign, music and ad code. Focused
  host wallet failure/migration/replay/category tests and exact-APK real emulator
  UI/native-terminal checks; disclose any seeded boundary fixture and restore
  original emulator wallet afterward. Package APK/full source after relevant
  checks pass. No GitHub/VPS changes or live-ad testing.

- 2026-11-11: user selected FIRST mock from the final minimal two-mode set.
  v0.57 Home is only official logo, compact CAMPAIGN/TOWERS controls, grey tank,
  and rbabbit version. Campaign opens its existing setup (New/Continue inside);
  Towers opens its existing map browser (Rewards/Saves inside). No descriptions,
  preview, utility tiles, huge headings, cards or scrolling on the splash.
  Preserve delivered v0.56 APK/full source via fallback-0.57.json first.
  Product changes are HomeModesView.java and version only; MainActivity,
  GraphicsSetupView, all assets/native runtimes/gameplay/save/media stay frozen.
  Size from width AND height, with 48dp touch bounds and slimmer visible faces.
  Reproduce/test exact 800x360dp user landscape (density480,2400x1080), compact
  640x360dp, normal1280x576dp and larger text. Check actual native controls,
  Campaign/Towers entry/Back/save/return on exact APK, compare approved visual
  against real screenshots, then package APK/full source. No GitHub/VPS/ads.

- 2026-11-11: user selected home mock option2 and authorized v0.56 native
  launcher implementation. Remove CHOOSE YOUR MODE and WARZONE TOWERS text;
  retain official logo, black/white rounded controls, real grey tank and map
  thumbnail. Two cards expose Campaign Continue/New and Towers Choose Map, with
  compact existing Saves/Rewards. Preserve v0.55 APK/fullsource first via
  fallback-0.56.json; all game JS/WASM/data, Campaign/scenarios, assets, maps,
  music, rewards and save formats remain frozen. Keep native video readiness
  gates, separate Campaign/Towers saves, map selection/default and return-map
  behavior. No new chapters/progress/rewards features or dormant 1v1 exposure.
  Reuse emulator5558 for normal/compact home, real card navigation and Back,
  save/load/game return and exact-APK route verification. Compare selected image
  against actual screenshots; fix visual/layout/interaction failures before
  packaging APK/fullsource. No GitHub/VPS writes or live ad tests.

- 2026-11-11: user authorized v0.55 Campaign cancellation journal cleanup.
  Exact delivered v0.54 APK/full source are pinned first in fallback-0.55.json.
  Reproduce with the prepared raw native checkpoint in emulator5558; remove
  only the matching cancelled app-job preview record immediately on confirmed
  cancellation. Preserve physical foundations, other jobs/worker FIFO and native
  Stop/current-order behavior. Freeze all Towers/Duel gameplay, UI, input, maps,
  rewards, ads and music. Append only the assembled Campaign mobile bridge to
  the frozen Campaign VFS; no WASM/native compilation or mission logic changes.
  Verify immediate ghost cleanup while builders remain busy, retained work,
  active cancellation/foundation, save/load and a focused Towers regression on
  the exact delivery APK; package APK/full source after checks pass. No GitHub
  or VPS actions.

- 2026-11-11: user authorized all three audited v0.54 issues: Campaign-only
  accepted/queued construction ghosts must remain visible when switching builds;
  remove the small minus/collapse control from both Campaign and Towers while
  retaining Analysis/Manufacturing/Build and their actions; Campaign Intelligence
  must open the existing research reader over the battlefield. Preserve exact
  delivered v0.53 APK/full source in fallback-0.54.json first. Retain explicit
  access to mission briefings/replayable videos, original automatic story flow,
  Guide suppression, ALL COMBAT suspension, Back and toolbar/input restoration.
  Existing native Campaign research preview is already enabled; no native build
  or broader Towers marker is needed. Preserve all native pairs, scenario rules,
  Campaign mission bodies/grants and earlier fallbacks. Reuse emulator5558 and
  native checkpoints; inspect actual canvas CSS/paint plus screenshots rather
  than trusting drawn counters. Check first/changed/queued ghosts, completion
  cleanup, both footer modes/old collapsed preferences, research models/reader
  lifecycle, briefings and save/continue on exact APK. No GitHub/VPS/ad actions.

- 2026-11-11: user authorized Campaign v0.53 fixes from two screenshots:
  align Campaign header/footer with accepted Towers controls, prevent BUILD
  clipping, repair Campaign Design validation across Command Centre changes,
  and suppress unsolicited stock Guide popups that pause gameplay. Preserve
  exact delivered v0.52 APK/full source in fallback-0.53.json before edits.
  Keep ALL COMBAT, original HQ/technology rules, native unit creation/costs,
  mission bodies/objectives/videos/briefings/Intelligence/transports and saves.
  Scope shared changes to Campaign; preserve Towers native pair/data/scenario,
  maps/rewards/ads/music/input and earlier fallbacks. Reuse emulator5558 and
  prepared Campaign saves, validate real header/footer bounds, pre/post-HQ
  Design plus actual unit manufacture, new/load Guide suppression, menu/input
  returns and phone saves on the exact delivery APK. No GitHub or VPS writes.

- 2026-11-11: user authorized v0.52 Towers fixes while testing Campaign:
  route actual truck/unit-loss notices away from the clipped stock right-edge
  strip; reconcile construction after assigned builders die; show waiting jobs
  clearly and resume only with an explicitly selected replacement group.
  Preserve delivered v0.51 APK/full source first via fallback-0.52.json. Keep
  Campaign entry/data/scripts, original mission logic and v0.51 behavior intact.
  Native loss routing must be Towers-only and preserve death, score and audio.
  Never borrow unrelated/remote trucks as a retry fallback. Preserve foundations,
  progress, costs, per-worker FIFO, module ordering, Stop/manual overrides and
  cancel/save/load paths. Reuse emulator5558/prepared states, disclose any seeded
  casualty fixture, and verify actual loss notices, surviving/lost builders,
  explicit replacement orders/completion and navigation on the exact APK.
  Keep prior releases, GitHub and VPS unchanged; no ad controls during checks.

- 2026-11-11: user authorized Campaign alongside accepted v0.50 after a
  read-only feasibility audit. Work on codex/campaign-0.51. Immutable delivered
  v0.50 APK/full-source hashes are pinned in archive/fallback-0.51.json. Reuse
  original Alpha/Beta/Gamma missions with additive namespaced mobile hooks;
  retain Towers rules/maps/saves/rewards and the accepted pan lifecycle.
  Campaign has separate launch/continue/save/Intel/objective paths, a persistent
  ALL COMBAT header toggle excluding constructors, and original mission outcomes.
  Download the existing owner VPS pack, verify its SHA, extract only sequences/
  to private storage and serve offline. Never install its older engine files.
  Narrow source-built native Campaign marker gates may share input/observer APIs
  without enabling Towers' forced-autosave suppression. Keep original mission
  bodies and native progression intact; verify actual cinematics, opening mission,
  control/menu returns and saves on the exact APK before delivery. Disclose
  untested later missions/off-world paths. No live ad tests or VPS/GitHub writes.

- 2026-11-11: user reports v0.49 regressed normal finger panning and requests
  a thorough audit/fix, not a quick patch. Preserve delivered v0.49 APK/source
  using fallback-0.50.json; retain v0.48 too. Follow the persistent workflow:
  reproduce on the installed APK, validate the real touch fixture and inspect
  native SDL/camera states before edits. The old boolean-mouse VM oracle was
  inaccurate: KEY_RELEASED still pans for one native frame, so immediate cursor
  centring caused a real release jump. Repair release/rearm and repeat-touch
  lifecycle, restore synchronous initial drag, preserve bounded coordinates and
  native camera interpolation. Narrow Towers/Emscripten MMB double-click down
  normalization in main_sdl.cpp is authorized, with matching one-object native
  compilation and frozen earlier overlays/data/VFS. Keep all other input, game
  rules, menus and v6.4 intact. Verify both battlefield and minimap separately,
  rapid/short/reversing/edge drags, touch transitions, placement/selection and
  menu returns on the exact delivery APK in the real emulator. Fix fixture
  failures separately; do not claim smoothness from counters/VM tests alone.
  Keep GitHub/VPS/older artifacts untouched; package APK/full source only after
  focused checks and the integrated device journey.

- 2026-11-11: user authorized auditing and fixing jittery finger map panning
  as v0.49. Complete delivered v0.48 APK/source/checksums are pinned first by
  archive/fallback-0.49.json. Audit reproduced raw input bursts and loss of the
  last held drag position before a native frame. Bound only Towers one-finger
  pan coordinates to the canvas, coalesce to the latest absolute position per
  frame, and let the final held point render before release. Cancel pending
  work on cancellation, navigation or new input; park the synthetic cursor to
  avoid desktop edge scrolling. Preserve camera gain away from extreme bounds,
  native camera interpolation, two-finger/pinch/tilt, minimap, Duel, selection,
  construction and other menus. No native engine/data changes or extra easing.
  Continue source/VM, compilation and package checks without emulator/browser
  testing. Phone smoothness/gameplay remain unverified. Preserve older versions,
  v6.4, GitHub benchmarks, privacy site and VPS.

- 2026-11-11: user authorized v0.48 to fix Intelligence immediately closing.
  Complete v0.47 APK/source/checksums are preserved first in fallback-0.48.json.
  Audit reproduced the mixed-clock regression: a fresh native open timestamp
  was compared with an older wave-HUD snapshot on the first 600ms heartbeat.
  Compare only valid nonnegative numeric native-response timestamps; ignore
  absent/malformed values and preserve genuine native rewind/load/not-open
  protection. Guard both late heartbeat success and failure by the open-session
  generation. Keep report eligibility, icons, refresh, models/audio, Build,
  Home arrow, native engine/data, all other layouts and policies unchanged.
  Extend the focused fixture with independent native/HUD clocks and realistic
  native timestamps; preserve historical v0.47 tests/proofs. No emulator/browser/
  ad request: source/VM checks, compilation and exact APK/full-source checks
  only. Do not claim device/gameplay verification. Keep old versions, v6.4,
  GitHub benchmarks, privacy site and VPS untouched.

- 2026-11-11: user authorized all audited Intelligence, compact Build-summary
  and Home arrow issues as v0.47. Preserve complete delivered v0.46 APK/source
  first via archive/fallback-0.47.json. Intelligence must expose only completed
  research with a real engine-issued report, excluding initial grants. Remove
  its All completed tab and completion-notice bypass, reconcile stale details,
  and refresh without relying on one event. Do not invent reports for minor
  upgrades. Use stable research-ID mappings to existing correct artwork; replace
  misleading lab-image fallbacks, including the idle lab icon. Build shows one
  compact current unfinished site, advances on completion, hides when idle,
  and drops EXIT KEEP ORDERS and its expanded history controls from the compact
  sidebar. Keep footer Build close/keep-orders, jobs, selections and construction
  rules intact. Home map arrow ink follows its actual normal/selected/pressed/
  disabled face. Keep the selected rounded monochrome theme, current other
  layouts, engine JS/WASM/data/VFS, real art/maps/music, wallet/saves/ads and Duel
  unchanged. No emulator/browser/ad requests; use focused VM/source, compiler
  and exact APK/full-source integrity checks. Runtime visuals/gameplay remain
  unverified. Preserve all older versions, v6.4, GitHub and VPS.

- 2026-11-11: user selected the second isolated button sample (gently rounded
  rectangle), and authorized that control style throughout the existing app,
  together with the return to a black-and-white UI. The exact selected reference
  is exec-2f619526-416c-49ad-aed3-f2ddb7b0ac7a.png, not either earlier full-page
  mock set or the clipped-corner plates from v0.45. Preserve v0.45 first using
  archive/fallback-0.46.json; the complete delivered source/APK are immutable.
  Keep current layouts, IDs, callbacks, controls, sounds and real game artwork.
  Use black panels, charcoal normal buttons/white text, white selected buttons/
  black text, darker pressed buttons, and readable disabled/busy/focus states.
  Remove redundant shared header/footer backing around individual controls;
  keep content panels readable. Cover web and Android menus and sub-pages,
  loading/briefings/notices and a Towers-only colour rollback in console.cpp/
  intdisplay.cpp. The native gauge formula and autosave guards, all prior native
  overlays, JS/data/VFS, maps/music, wallet/save/ads policies and dormant Duel
  remain frozen. Use the matching incremental native cache and preserve source,
  patch/build/integration proofs. No emulator/browser/device/ad requests; only
  focused source checks, compilation and exact package/source validation. Do
  not claim screen, game-feel, sound or gameplay verification. Keep v6.4, older
  versions, GitHub benchmarks, privacy website and VPS untouched.

- 2026-11-10: user authorized option 1's game-control artwork/interaction pass
  as v0.45 and explicitly requested fallback FIRST. Complete delivered v0.44
  APK/source/checksums are pinned in archive/fallback-0.45.json. Keep the existing
  HTML/engine architecture and existing native Home/Rewards views; no Android
  UI port, new screens or gameplay rewrite. Add actual raster normal/selected
  control faces, immediate press/release feedback, disabled/busy/focus states
  and restrained original Warzone click audio respecting native mute settings.
  Preserve Intelligence's own sounds and avoid duplicate compatibility-click,
  drag or synthetic-event feedback. Move Build entirely out of Towers' top nav
  into footer Analysis -> Manufacturing -> Build, retaining the existing ID,
  guarded toggle, current truck selection, placement and keep-orders paths.
  Footer stays reachable in Build, and neighbouring status tabs exit Build via
  its normal keep-orders transition. Artwork moves under a press, not the real
  button bounds. Apply matching raster faces to existing native action/tab
  button factories without changing layout, labels, callbacks, services or Duel.
  Preserve current sage/black palette, grey Home tank, version prefix, Easy-first
  cold launch, manual saves, disabled autosave, power display, production Cancel,
  live rewarded ads and emulator sample fallback. No emulator/browser/ad requests;
  only focused source/VM checks, Java compilation and package/source integrity.
  Native engine JS/WASM/data, scenarios, maps/music and original artwork stay
  frozen. No subjective game-feel, sound playback, visual or gameplay pass is
  claimed without a device check. Preserve older versions, v6.4, GitHub and VPS.

- 2026-11-10: user authorized all accumulated v0.44 changes and real rewarded
  ads. Preserve complete delivered v0.43 through archive/fallback-0.44.json.
  Group top actions Research -> Manufacturing -> Build; rename visible Towers
  Production to Manufacturing and only footer Research to Analysis. Keep the
  Research emphasis, highlight Music only while its menu is open, and align
  footer tabs with readable intrinsic widths and keyboard focus retained.
  User explicitly clarified Wave/Skip moves LEFT/inward for curved-edge safety.
  Fix the native power-gauge display saturation without changing actual power,
  costs or the economy. Disable the native automatic-save feature (config plus
  Towers-only trigger/write guards), keeping manual Save/Saved Games and all
  wallet/blueprint persistence. Hide/restore Home tank around result receipts,
  keep Home version visible and modal focus isolated. Default normal cold launch
  to the first Easy map, but retain the played map on defeat/manual Home returns
  and existing saved-game routing. The supplied publisher ad unit is authorized
  for real phones; retain consent, opt-in flow, atomic ten-crystal grants and
  emulator sample fallback. Use -PadmobLiveAds=false for development/ad testing.
  No emulator/browser/live-ad requests for this revision. Native changes are
  bounded to intdisplay.cpp/loadsave.cpp with matching source/patch/build proofs;
  preserve every earlier overlay and all authored VFS/data/maps/music/art.
  Package source/APK after compilation and focused source/package checks;
  actual screens, gameplay, manual-save operation and live ad serving remain
  unverified. Keep v6.4, older artifacts, GitHub benchmarks, privacy site and VPS.

- 2026-11-10: user selected Home mock 2's grey cannon tank and authorized it
  as v0.43, plus a bottom-right Home/splash-only `rbabbit v<current version>`
  label and real production cancellation in Queue. Preserve complete delivered
  v0.42 APK/source/checksums through archive/fallback-0.43.json. Retain current
  controls/layout, original logo, prior artwork and dormant Duel. Fit the new
  transparent tank beside the map card, below the logo and above the version.
  Production cancellation must target exact waiting IDs or the observed current
  native subject, preserve other factories/queues and reject stale active-unit
  identities. Use ordinary native cancellation/refunds; never just remove the
  displayed active row. A bounded Towers-only QuickJS cancellation entry point,
  one-object matching native build/link and commands-only VFS update are
  authorized. Archive exact source, patch, recipe and provenance; preserve all
  v0.42 renderer and earlier native fixes. No emulator testing, consistent with
  the requested phone-check workflow; compiler/package and focused source checks
  are not runtime/gameplay verification. Leave maps/music/rewards/saves/ad policy,
  v6.4, GitHub benchmarks, privacy site, VPS and older artifacts untouched.

- 2026-11-10: user selected sage mock 1 and authorized its light green / black
  theme throughout the whole app as v0.42. Preserve the complete delivered
  v0.41 APK/source/checksums through archive/fallback-0.42.json. Keep current
  layouts, actions, item artwork and all previous gameplay fixes. Theme native
  Home/Rewards/saves/dialogs/briefings/loading/notices and all Towers web menus,
  sub-pages, footer sidebars, selections and progress consistently. Separate
  primary/selected fills from text tokens to retain dark text on green controls.
  Towers-gated native console and power-meter rendering may change colour only;
  retain their calculations, geometry, lifetimes and all previous source overlays.
  Use the prepared matching cache for the two rendering objects and one link,
  preserve complete source/patch/provenance, and leave data/scenario/art/music
  and all orders/save/wallet/ads policies untouched. User requests NO emulator
  testing and wants to check the APK personally. Build/source/package integrity
  is not gameplay or screen verification. Keep older artifacts, v6.4, GitHub
  benchmarks, privacy website and VPS unchanged.

- 2026-11-10: user authorized v0.41 to replace Production footer component
  placeholders with the real current-unit thumbnail used by the main recipe
  list, correct missing constructor/system equipment in live unit metadata,
  and remove App waiting/Total unknown wording from both Production views.
  Preserve complete v0.40 through archive/fallback-0.41.json. NO emulator testing;
  use focused source/desktop checks and compile/package verification. Extend
  only the existing Towers-gated read-only native factory observer to expose
  the authoritative subject template, validate its identity in the snapshot,
  and retain actual progress/remaining-time semantics. Do not guess missing
  parts from names or fabricate total counts for unverified native queues;
  omit unsupported summaries instead of presenting implementation diagnostics.
  Preserve all native gameplay/order/cost/timer/save behavior and prior fixes.
  Freeze v0.40 source proofs; archive the exact additive native delta, matching
  source build/loader/VFS lineage and recipe separately. Java/resources, actual
  artwork, maps/music, ads/wallet/save policy, dormant Duel, older versions,
  v6.4, GitHub benchmarks, privacy site and VPS stay unchanged.

- 2026-11-10: user authorized v0.40 to fix the audited footer/Build/header
  contrast defects and add real production progress, especially in the footer
  status sidebar, with clearer current/waiting/remaining unit counts. Preserve
  complete v0.39 via archive/fallback-0.40.json. Minimal focused checks only;
  continue without emulator testing. An additive read-only Towers-gated native
  structure observation and matching incremental JS/WASM rebuild are permitted
  to expose actual factory build work and blocked states. Preserve all prior
  native fixes, production rules/orders/timing and save identity; never create
  a guessed countdown from wall time or queue-start bookkeeping. Record the
  matching source patch, guarded build recipe and provenance. Only the commands
  VFS override may change for the observed snapshot. All maps/music, artwork,
  Java/resources, wallet/save/ads services, dormant Duel and other VFS files
  remain frozen. Package APK/full source after focused source/desktop and build
  checks; do not imply emulator/gameplay verification. Older versions, v6.4,
  GitHub benchmarks, public privacy site and VPS remain untouched.

- 2026-11-10: user authorized v0.39's whole-app monochrome theme and selected
  Production mock 2: Units/Design/Blueprints first, then category and numbered
  native factory chips on one row, with quantity beside each Produce action.
  Preserve complete v0.38 via archive/fallback-0.39.json. Apply matching neutral
  presentation across native Home/Rewards/Saved Games/receipts/briefings/dialogs
  and Towers web pages, sub-pages, field controls and notices. Keep actual item
  artwork, battlefield/minimap and player/placement colours, native engine/data,
  maps/music, actions/IDs/queues, wallet/save/ad policy and dormant Duel intact.
  NO emulator testing: focused source/desktop-fixture rendering, compilation and
  exact package/source checks only. Do not claim Android gameplay/screens tested.
  Preserve older artifacts, v6.4, GitHub benchmarks, privacy site and VPS.

- 2026-11-10: user authorized v0.38 to fix construction overlays leaking into
  Intelligence. Explicitly NO emulator testing for this task; use focused
  source/Canvas regressions and a build, then deliver the APK for phone checking.
  Preserve complete v0.37 via archive/fallback-0.38.json. Conceal battlefield
  overlays throughout Intelligence open/close transitions, preserving their
  orders/state and restoring their display afterward. Keep native engine,
  weather, controls, maps/music, saves/rewards/ads and unrelated UI unchanged.

- 2026-11-10: user selected square-controls mock 3 for v0.37. Change only the
  Towers field panel styling: three columns, two rows, square touch targets,
  original panel widths, and the unchanged Research/Production footer below.
  Preserve original icons/actions and all native/gameplay code. Keep v0.36 APK,
  complete source and checksums frozen by archive/fallback-0.37.json. Check six
  real actions, footer returns, small/enlarged-text and relevant layout spacing
  on the exact APK, restore emulator data/settings, then package full source.

- 2026-11-10: user authorized v0.36 after the supplied Intelligence recording.
  Preserve v0.35 using archive/fallback-0.36.json. Replace Select/Move with compact
  Demolish and Intelligence controls. Demolish uses the exact selected builders,
  protects the Command Centre, retains native refunds and cancels stale targeting
  on navigation/load. Intelligence uses real completed topics, authored reports,
  rotating native models and original report/UI audio. Completion notices open
  their matching report. Preserve gameplay rules, existing saves/rewards/ads,
  maps/music and older versions. Check the exact delivery APK in the existing
  emulator, restore original data, then package complete source and APK.

- 2026-11-10: user authorized v0.35 with selected start mock1 and defeat mock3.
  Preserve complete v0.34 by fallback-0.35.json. Add a brief native healthy-HQ
  Protect Your Command Centre opening and destroyed-HQ defeat cover on same-map
  Home, retaining reward receipts. Start only after real battlefield readiness,
  own/acknowledge a bounded native pause and restore input before uncovering.
  Replace remaining stock round/start/camera messages with the approved compact
  black/white presentation; native camera actions, sounds, callbacks and warnings
  remain intact. Keep maps/music/rewards/saves/ads and dormant Duel unchanged.
  Root owns focused exact-APK transition, menu, small-phone and save checks,
  restores the emulator and packages full source/APK. GitHub/VPS and fallbacks
  stay untouched.

- 2026-11-10: user authorized v0.34: suppress the stock Towers terminal screen,
  present research and successful saves as compact black/white notices (save
  says only Game saved), show actual incoming wave units at top right, and remove
  the Research/Production activity sidebar X controls. Preserve complete v0.33
  by fallback-0.34.json. Keep same-map Home return, rewards, research/production
  queues and save identity. Scoped native overlay suppresses exactly research
  completion and QuickSave success console messages only when the Towers-only
  transient MEMFS marker is present; failures and Duel remain unchanged. Root
  owns focused exact-APK emulator checks, then complete source/APK packaging.
  Preserve all maps/music/ads, v6.4, older fallbacks, GitHub benchmarks and VPS.

- 2026-11-09: user authorized 0.33 from revised Rewards mock 1: whole item rows
  buy one, with no purchase steppers, BUY footer, large Rewards title or tap hint.
  Put compact Gain 10 Crystals in the top row, retain conditional privacy access
  there, and leave no Rewards footer. Preserve stored/selected quantities and
  native acknowledgement, prices, caps and wallet rules. Fix the reproduced
  SAVE feedback issue with immediate Saving/busy and acknowledged Saved/Retry;
  keep real native save, persistence and identity barriers unchanged. Preserve
  complete v0.32 artifacts by hash in archive/fallback-0.33.json. Root owns the
  existing emulator and backed-up prepared saves, with focused actual Home/game,
  single-tap transaction, large-text, Save/load and return checks on the exact
  delivery APK. Freeze all engine/maps/music/ad SDKs and unrelated gameplay;
  keep GitHub v0.31 benchmark, earlier fallbacks, v6.4 and VPS untouched.

- 2026-11-09: user authorized 0.32 with the essential soundtrack bundled directly
  in the APK, no Home music download/setup control, no visible Swipe maps text,
  and no NEXT MATCH tab in Rewards. Keep owned-item selection usable inline;
  buying does not automatically consume stock. Preserve complete v0.31 APK,
  source and checksums by hash in archive/fallback-0.32.json. Keep map arrows,
  swiping, all 46 levels, core engine/data, wallet/save rules, ads/consent and
  existing explicit music-Off settings; new installs default to music On.
  User explicitly requests actual small-phone emulator checks after the fixes,
  including scrolling/large text and offline first-use music with no legacy
  downloaded pack. Root owns the one resized emulator and restores its display,
  density, font/network settings afterward. A second profile is unnecessary
  unless the existing device cannot validate the requested conditions. Apply
  only concrete responsive fixes, package exact checked APK plus full source,
  and leave v0.31 GitHub benchmark, older fallbacks, privacy site and VPS intact.

- 2026-11-09: user accepted the delivered 0.31 as the new GitHub benchmark and
  authorized committing it to main, tagging v0.31-benchmark, and publishing a
  release containing the existing verified APK, complete source ZIP and checksums.
  Preserve those artifacts unchanged; promotion documentation may postdate the
  frozen source ZIP. Keep all older benchmark tags/releases and local fallbacks,
  including 0.30, 0.28 and the separate v6.4 project. This authorization supersedes
  earlier GitHub promotion restrictions for this version. No additional emulator
  testing, rebuild or source repack is requested or permitted for this promotion.

- 2026-11-09: user authorized 0.31 agreed UI fixes: remove the native blue
  map-name/time text behind the activity footer; improve actual production tap
  acknowledgement; compact filled Gain 10 Crystals button; rename header TECH
  to RESEARCH with white background/black text; make all header menu buttons
  toggle their own panels and remove the agreed duplicate close controls.
  Preserve complete 0.30 by hash in fallback-0.31.json. Keep construction orders,
  research queues, production, wallet/save rules, maps/music and deferred Duel.
  The exact cached native engine/source matched shipping; only two text render
  calls are removed by archive/native-hud-0.31 overlay, with a bounded incremental
  native build. Engine JS/data/VFS remain unchanged; package the full base source
  plus exact changed source, patch and guarded reproduction recipe. Root owns
  focused actual emulator checks on the exact delivery APK; source fixtures are
  supporting evidence. Preserve test ad serving, published consent configuration,
  all older fallbacks, v6.4, GitHub benchmarks, public privacy page and VPS.

- 2026-11-09: user authorized quieter rewarded ads as 0.30 after styling their
  AdMob consent message and disabling ad pods/interactive types in their own ad
  unit. Preserve complete 0.29 plus phone-test APK by hash in fallback-0.30.json.
  Use the publisher app ID for its own consent message, while this delivery keeps
  Google sample rewarded ads on physical phones. Quietly refresh UMP at launch;
  no visible consent or ad initialization/preload until a deliberate Watch tap.
  Keep one modest ad row at the bottom of Rewards, cancel abandoned requests,
  preserve ten-crystal atomic grants, and wait for full native restoration before
  a consent-to-ad transition. Test only sample ads on the exact new APK. Preserve
  all game assets, maps, music, wallet/saves/designs and unrelated app behavior.
  Keep private GitHub benchmarks, public privacy repository and VPS untouched.
  Dashboard format filters do not apply to Google's sample ad-unit creatives.
  The demo-to-publisher UMP identity migration is test-only and runs once using
  the public SDK reset API and a persisted marker; never reset live consent.

- 2026-11-09: user authorized optional AdMob rewarded ads as 0.29, with ten
  crystals credited once per earned native SDK event in Home/in-game Rewards.
  Preserve the complete 0.28 benchmark delivery by hash in fallback-0.29.json;
  keep v6.4, GitHub benchmark, native JS/data/WASM, all maps/music and unrelated
  gameplay unchanged. Add UMP consent/privacy choices and a scoped hidden native
  pause with same-document restoration. Default builds use Google sample IDs;
  delivery uses -PadmobLiveAds=true with supplied production IDs. Focused exact
  APK emulator checks must use Google's automatic emulator test-device traffic,
  never live ads. Report SDK/network/account-approval limitations accurately.
  No VPS or AdMob-account changes were requested for this implementation.

- 2026-11-09: user accepted the delivered 0.28 as the new GitHub benchmark and
  authorized committing it to `main`, tagging `v0.28-benchmark`, and publishing
  a release with the existing verified APK, complete source ZIP and checksums.
  Preserve those delivery files unchanged; promotion documentation may postdate
  the frozen source ZIP. Keep every older benchmark tag, release and fallback
  artifact, including 0.27 and the separate v6.4 project. This authorization
  supersedes the preceding restrictions on GitHub promotion for this version.
  No further emulator testing is authorized or needed for the promotion;
  publish the existing evidence with its original scope, without a new build
  or source-archive repack. Repository/release verification is read-only.

- 2026-11-09: user authorized 0.28 option1 Rewards for Home and in-game:
  compact native illustrated rows, direct category tabs, familiar styling and
  small controls. Preserve complete 0.27 APK/source/checksums by hash in
  archive/fallback-0.28.json before app edits. Investigate the screenshot's
  missing SAVE control and autosave error without assuming the phone's
  installed version; verify the exact new APK's visible version, saving and
  live purchasing through small real emulator checks owned by root. Keep all
  existing prices, wallet/economic identity, item/fortress limits and saved
  native state. Preserve native JS/data/WASM, all 46 maps, music, Duel and
  unrelated app paths. Source checks support rather than replace actual
  observations. Package complete source after focused delivery checks pass;
  leave old artifacts, v6.4, GitHub benchmarks and VPS untouched.

- 2026-11-09: user authorized 0.27 Save Game, a Home Saved Games list, in-game
  Rewards purchases and a tiny five-coin wave notice in the header. Preserve
  complete 0.26 APK/source/checksums in archive/fallback-0.27.json. Native save
  files must retain reward run/session identity; reloading may not regrant
  cleared-wave coins, starter gifts or consumed purchase quantities. Existing
  catalog prices/wallet and three-fortress limits remain. Native purchases
  use idempotent transactions and normal structure power costs. The latest
  user authorization permits brief actual emulator checks of these affected
  flows and supersedes the preceding no-emulator restriction for 0.27 only.
  Root owns the device. Bind observations and fixture provenance to the exact
  delivery APK; do not claim full gameplay or all-map verification. JVM/source
  fixtures are separate supporting evidence. The reproduced Greenhaven save
  failure requires shortening only its internal level alias to fit native
  MAX_LEVEL_SIZE: UTF-8 length must be below 20 bytes. Permit exact catalog,
  challenge and registration metadata overrides and source-builder updates
  for that alias, preserving displayed names, terrain, objects and waves.
  Check all 46 native names and enforce the boundary in phone save validation.
  Preserve map content, vendor, music,
  deferred Duel, compiled engine/WASM, original data prefix and unrelated VFS
  bytes. Leave VPS, GitHub benchmarks, older artifacts and v6.4 untouched.

- 2026-11-09: user authorized 0.26 portable expanded Rewards inventory, bulk
  purchases and a per-match loadout, with at most three fortresses across all
  fortress types and normal power costs for reward structures. Do not sell
  AA, repair structures or trucks. Preserve existing wallet balances; migrate
  unspent map-bound purchases into shared inventory without another starter
  gift. Credit five coins once per actually cleared wave in a run, remove the
  old ten-wave milestone payout and retain victory/first-completion bonuses.
  Track real spawned-wave enemies without changing authored wave timing or
  enemy rosters. Unused building items return to inventory; research/supply
  boosts are consumed on match start. Preserve complete 0.25 artifacts in
  archive/fallback-0.26.json. Only supported native append/reindex hooks may
  change; compiled engine/WASM, original data prefix, maps, music, deferred
  Duel and unrelated virtual files stay frozen. No emulator is authorized;
  source fixtures, Android compilation and package integrity do not establish
  actual gameplay, persistence or visual acceptance. Leave VPS, GitHub main/
  v0.17-benchmark, older artifacts and v6.4 untouched.

- 2026-11-09: user authorized 0.25 crystal rewards, a persistent local wallet,
  optional match-only boosts and a result receipt with a same-map Home return
  after defeat. Preserve the complete 0.24 APK/source/checksums by hash in
  archive/fallback-0.25.json. Native reward hooks may be appended/reindexed
  through the supported builder, preserving the compiled engine body/WASM,
  original data prefix, all maps and unrelated virtual files. Preserve the
  existing compact home, music, game controls, designs, authored waves and
  deferred Duel payloads outside the explicit reward additions. No emulator
  testing is authorized. Review source, run focused source-only fixtures,
  compile Android and verify package/source integrity; do not present synthetic
  checks as actual gameplay or visual verification. Leave VPS files, GitHub
  main/v0.17-benchmark, older artifacts and v6.4 untouched.

- 2026-11-09: user selected home mock option 1 and authorized 0.24 with changes
  restricted to the home layout and removal of optional HD/HQ graphics from
  the app. Keep the existing map preview, map selection, difficulty groups,
  artwork, music, gameplay, saves and deferred Duel implementation. Remove HQ
  controls, store/download/serving paths, loader and launch configuration;
  do not alter or delete VPS files. Preserve complete 0.23 APK/source/checksums
  by hash in archive/fallback-0.24.json. The user's final instruction explicitly
  prohibits emulator testing and supersedes the earlier quick-emulator request
  for this revision. Source review, Android compilation and package integrity
  are the verification scope; do not claim runtime screens/gameplay verified.
  Leave GitHub main/v0.17-benchmark, older artifacts and v6.4 untouched.

- 2026-11-09: user reported that 0.22 music still does not play and explicitly
  authorized a focused emulator reproduction, fix and delivery as 0.23. This
  supersedes the prior no-emulator restriction for the affected music flow.
  Root owns emulator-5556 and must verify the exact delivery APK with actual
  media progress and audio output evidence, plus the relevant On/Off and
  lifecycle returns. Keep the test bounded to music; do not rerun unrelated
  gameplay suites. Preserve the complete 0.22 APK/source/checksums as fallback,
  and keep all maps, waves, controls, saved templates, native program/data/WASM
  and dormant Duel payloads unchanged. Source fixtures are supporting evidence,
  not substitutes for the requested emulator observation. Leave GitHub
  main/v0.17-benchmark, older artifacts and v6.4 untouched.

- 2026-11-09: user reported downloaded music stuck on Starting music in the
  first Easy map, authorized the audited music fixes as 0.22, and explicitly
  prohibited emulator tests. Scope is the music loader and native single-track
  response only: ordinary full-track fetch to an audio Blob URL, no double seek,
  bounded startup/buffering wait, genuine On retry, and abort/resource cleanup.
  Preserve track assignments and downloaded bytes, all other UI/gameplay/maps,
  native engine/data/WASM and dormant Duel code. Retain complete 0.21 artifacts
  by hash in archive/fallback-0.22.json. Meaningful source-only byte/control-flow
  fixtures, source review, compilation and archive integrity checks are allowed;
  never represent them as actual Android playback or gameplay observations.
  Leave GitHub main/v0.17-benchmark, older artifacts and v6.4 untouched.

- 2026-11-09: user authorized 0.21 assigned map music with a compact top-header
  MUSIC On/Off panel and saved phone preference; replace the long chooser in
  the active flow with an optional start-screen download, then Music ready.
  Hide 1v1 vs Bot only from the start screen; retain its implementation and
  old chooser code. Preserve all maps, names/IDs, waves, rules, controls,
  templates, saves, native program/data/WASM and old Duel payloads. The same
  verified optional music pack is streamed by track without replacing sound
  effects or mounting the full pack into the Towers native heap. Preserve
  complete 0.20 artifacts by hash in archive/fallback-0.21.json. Source review,
  syntax/Android compilation and packaging integrity only: no emulator,
  playback or gameplay tests. Do not claim runtime operation verified.
  Leave GitHub main/v0.17-benchmark, older artifacts and v6.4 untouched.

- 2026-11-09: user accepted the 0.19 home screen, requested a visible swipe
  chevron and authorized remaking only the 43 generated maps as distinct,
  attractive native landscapes informed by Dustfall and Iron Valley. Work is
  0.20 on `codex/towers-map-art-0.20`. Preserve names/IDs, difficulty groups,
  wave schedules, queues, saves, Duel, the three original maps and the frozen
  engine body/WASM. Native map bytes, their existing registration stanzas,
  preview/catalog art metadata and the native map-card chevron are the scope.
  Keep every human uplink safely inside the rear base, with valid footprints,
  routes and clear surroundings. The previous generated maps are frozen in
  `C:/timerApp/old_maps-0.19.zip` (528 entries, 879410 bytes, SHA256
  `b48e089c99ec5e60f2aa5ccc9896dfd38fc7dc0b030c276e4c38e95aa429ac3d`).
  Complete 0.19 delivery and map-backup hashes are in
  `archive/fallback-0.20.json`. Source/art review, static authoring constraints
  and Android build only: **no emulator testing**, including the home screen.
  Source previews are actual native-map/asset-data renders, not evidence of
  in-engine appearance or gameplay. Leave GitHub `main`, `v0.17-benchmark`,
  older tags/artifacts and v6.4 untouched.

- 2026-11-09: user authorized 0.19 with 43 new maps (15 Easy, 15 Medium,
  13 Hard), a native swipeable map browser, Greenhaven's satellite uplink and
  defence line previews capped at 64 candidate sites, subject to native
  validation. Preserve all three
  existing maps and their schedules: Greenhaven is Easy, Dustfall/Iron Valley
  are Hard, making 46 maps total with counts 16/15/15. Catalog IDs are
  `easy01`–`easy15`, `medium01`–`medium15`, `hard01`–`hard13`, plus `beginner`,
  `td1`, `td2`; preserve the default `td2` and separate Duel route/choices.
  Preserve original artwork, native IDs/orders/queues and the frozen engine
  body/WASM; custom asset append/reindex and the Greenhaven structure addition
  are authorized. Preserve the complete 0.18 APK/source/checksums by hash
  reference in archive/fallback-0.19.json. Source audit/review, Android build
  and only a brief native home-screen emulator check are authorized; root owns
  that check. No gameplay, pathfinding, balance or drag testing is authorized.
  Do not claim those behaviours verified. Leave GitHub `main`,
  `v0.17-benchmark`, older tags/artifacts and v6.4 untouched.

- 2026-11-08: user authorized Greenhaven as a third Beginner map for 0.18 on
  `codex/beginner-map-0.18`, map ID `beginner`, with 15 proposed gentle waves
  and a connected southern starting base. Preserve both existing maps, their
  wave schedule and the supplied mod. New map/scenario data and supported
  append/reindex metadata are authorized; the compiled engine program body and
  WASM remain frozen. Preserve the complete 0.17 APK/source/checksums by hash
  reference in archive/fallback-0.18.json without duplicating its 1.87 GB source.
  Source audit/review and Android build only: no tests, emulator or runtime
  checks were requested. Do not claim verified difficulty or playability.
  Leave GitHub `main`, `v0.17-benchmark`, older tags/artifacts and v6.4 untouched.

- 2026-11-08: user accepted existing 0.17 as the new current benchmark on GitHub
  `main`, tagged `v0.17-benchmark`. Promote the existing delivered APK/source
  unchanged; no rebuild, tests or emulator checks were requested for promotion.
  The 0.17 release has source audit/review and build evidence only, with no
  runtime verification. Preserve `v0.9-benchmark`, every older tag/artifact and
  the separate v6.4 fallback. See docs/benchmarks/v0.17.md for delivery hashes.

- 2026-11-08: user approved the three border-free compact game-window mocks in
  docs/ui-0.14 and requested all Towers pages/subpages be reviewed. Work on
  codex/towers-compact-0.14. The complete 0.13 APK/source/checksums are frozen in
  C:/timerApp/fallbacks/towers-before-compact-0.14-20261108; baseline85ef078.
  Rename the top Factory label to Production, move Design into its direct
  Units/Design/Blueprints navigation. Apply content-fit controls, larger real
  artwork and no decorative separators to command, research, Build, Help and
  settings surfaces. Keep existing footer/status bytes AND visibility behavior.
  Preserve Duel output, native payloads, game rules, saves, native IDs and queues.
  Native launcher/music/confirmation changes are visual-only and Towers-scoped.
  Never invent assembled unit renders or production percentages/ETAs. Audit rare
  states and legacy unexposed routes explicitly; do not present seeded or
  source-only state checks as ordinary observed gameplay. Root owns emulator5556.

- 2026-11-08: user corrected the full Factory selection to OPTION 3, then resumed
  work with go. Implement on `codex/towers-factory-0.13`: slim family/factory
  roster, one deduplicated recipe list, quantities and row Produce, compact
  current/waiting strip with expandable ordered queue and secondary phone menu.
  Preserve every saved phone alias, native factory ID, FIFO job, cost and timing.
  Remove NEAR/BATTLE/MAP buttons from Towers, retain BASE. Add locally grounded
  HOW TO PLAY in Help using only this project's actual game, without web lookup.
  Keep 1v1 and both footer sidebars unchanged. Preserve complete 0.12 fallback in
  `C:/timerApp/fallbacks/towers-before-factory-0.13-20261108/` and older versions.

- 2026-11-08: implement approved footer Research option 1 and Production option 1
  as 0.12 on `codex/towers-status-0.12`. Preserve complete 0.11 APK/source in
  `C:/timerApp/fallbacks/towers-before-status-0.12-20261108/` and all older versions.
  Footer Research is a live lab/current-topic sidebar with estimated bars only;
  footer Production is a current-unit sidebar with vehicle/cyborg family tabs,
  original component art and live activity, without queues or invented progress.
  Top TECH/FACTORY remain full pages. Owned completed world labs/factories open
  the corresponding full Towers page for that native ID before stock input.
  Keep 1v1 unchanged. Native/scenario additions are read-only observations only.

- 2026-11-08: the user approved all three compact Towers mock screens and their
  shared visual language for Build, Research, Factory, Design, Saved and Queue.
  Develop this as 0.11 on `codex/towers-ui-0.11`, preserving the complete 0.10
  APK/source fallback. Support dynamic five labs plus five vehicle and five
  cyborg factories with reachable selectors and stable selected native IDs.
  Preserve the 1v1 feature and its current UI/rules for later; scope new markup
  and styles to Towers. Keep the engine, scenarios, maps, saves and phone design
  library intact. Never invent production ETA/progress or a 3D design preview.

- The user saved Towers 0.9 as the immutable historical benchmark before adding
  an offline human-versus-bot mode. The preserved `v0.9-benchmark` tag points to
  `28fe51dc5725d5262b0302de10776ae1a37eb994`; preserve its APK, complete source,
  checksums and older fallbacks. Its former `main` status was superseded by the
  user's 0.17 benchmark acceptance above. Combined-mode development originally
  used `codex/offline-duel-0.10`; retain the deferred Duel implementation.
- The new Duel mode is offline: human chooses Cannon or Rockets; the bot uses
  the opposite branch, with shared core upgrades and a Command Centre objective.
  Keep Towers rules, map/mod, original runtime/index/mobile/data paths unchanged.
  Duel gets its own generated package/index/entrypoint and config/save directory,
  sharing the frozen native program/WASM. Replacing package metadata in a copy
  through the reviewed builder is allowed; assert normalized program identity.
  Do not manually edit compiled program code or apply Duel policy to Towers.
- Duel's bot may research, build and attack autonomously as requested. Human
  research stays manual. Enforce its weapon policy in native research, design,
  production and queued execution, retaining ordinary costs/times and keeping
  stored phone designs intact. Do not add mid-match bot grants or online play.

- User accepted 0.6 as the current/main version on 2026-11-07. Continue from
  this project; the directory and Android app ID retain their historical lab
  names to preserve installed saves/designs. Do not rebuild or rename the APK
  merely to promote it. Keep the frozen 0.6 APK/source hashes, previous releases
  and the separate v6.4 fallback project intact.
- The complete native source tar is stored with a narrow Git LFS rule. Run
  `git lfs pull` after cloning before checking the full source manifest. The
  release's attached source ZIP contains the full bytes without requiring LFS.
- Preserve the official engine and stock assets. Do not hand-edit compiled
  engine JS/WASM or the original data prefix. Custom scenario changes belong in
  `scenario/`, then use `tools/embed-warzone-towers.ps1` to append and reindex.
- Scoped 0.5 exception, authorized by the user's structure-preview fix: rebuild
  the matching 4.7.0 engine from source with only the queued-blueprint visual
  centre correction. Preserve original source/patch/build recipe and paired
  generated JS/WASM provenance. Reapply existing package/output adapters through
  a reproducible tool; keep stock data, real orders and foundation rules intact.
  This does not authorize manual edits to compiled code or changes to v6.4.
- Preserve `vendor/survival/original/survival_mod.zip` and the supplied original
  map/mod. Add explicit custom overrides rather than silently replacing them.
- v5.7 explicitly replaces the active Survival rules with the user's supplied
  `vendor/tower-defense/original/WZmodTowerDefense-v4.7.0-a.zip`. Keep its extracted
  files byte-identical. Mobile adapters observe the authored schedule and rewards.
  Use `tools/verify-tower-defense-package.py` for this authorized migration.
- Before gameplay/input/layout work, save the current tested APK plus a source
  snapshot and SHA-256 manifest as a fallback. Existing release assets are frozen.
- Run the relevant regression scripts and build. For input/startup changes,
  exercise the real Android WebView, including repeated actions and returning
  from overlays. Start test emulators with `-no-audio`. Do not disturb another
  running emulator session.
- Do not claim gameplay, tablet compatibility or HQ visual quality based only on
  build success, a config label or mock tests. Preserve the explicit limitations
  in `docs/KNOWN-ISSUES.md` until a genuine device test resolves them.
- The user controls research topics and queues. Do not add automatic research or
  change the supplied enemy roster without a new explicit request.
- Keep original icon/splash artwork unless a change is requested. Downloadable
  official HQ terrain is optional; Normal must stay usable without the download.
- Keep credentials, signing keys, local SDK settings and temporary CDP endpoints
  out of Git and release archives. Public VPS paths/manifests are documented.
- After scenario data grows, make the delivery APK with a clean Gradle build.
  Incremental packaging can retain a large unused ZIP gap. Compare payloads and
  rerun the relevant installed-APK verification before packaging the source.
- In emulator audits, wait for the Android keyboard to be visibly open before
  sending Back. Otherwise Back can exit the Activity. Wait for images and the
  actual viewport/camera before asserting layout or sending world taps.
- Confirm pause with the frequently updated native wave clock, not a cached
  command snapshot. Exit the build tool normally before synthetic Escape;
  Escape may close a native picker instead of pausing. Preserve accepted orders.
- Exercise BUILD followed immediately by one item tap; waiting for hidden
  setup first masks dropped taps. Confirm the requested structure ID in actual
  native orders/completion, not merely a generic build-ready callback.
- Repeating an active item must also reconfirm native placement. Focus/native
  QuickSave can close the engine tool while the cached ready flag remains true.
  Test repeat-item placement and mixed-item FIFO orders. Do not insert a native
  save between activation and a world tap without reselecting the item afterward.
- Native FIFO handoff can briefly look idle before the next foundation appears.
  Verify the final requested structure/completion, not one idle sample. Queue
  display interruption also requires sustained idle in simulation time.
- Legacy custom-path rules failed native QuickLoad context matching. v5.7 uses
  the canonical rules/init.js entry and mirrored command JSON paths. Validate
  fresh native command replies and restored round state after any load; do not
  mistake a stale cached snapshot for a working bridge or repeat a failed load.
- Archive upload checksums are in `archive/`; after intentional edits regenerate
  the repository file manifest with `python tools/verify-project.py --refresh`.
- Both original maps use the unchanged supplied Towers mod. TD1 is the exact
  NoQ td1_v3 archive (four starts; human position 0, native Ready y=30). Existing
  TD2 uses human position 1 (Ready y=70). Do not assume one lobby row for both.
- TD1's construction trucks live on raised platforms disconnected from the HQ
  route. Validate reachability and native height before field taps; use the
  authored 63x79 scroll bounds to fit its rectangular radar, not a square hitbox.
- Startup download tests must distinguish on-device music.data from the WebView
  music-v1.data route. If transfer is too fast to cancel after a hierarchy read,
  use a disclosed verified-prefix fixture and prepared native Cancel coordinates.
- Dustfall and Iron Valley are UI names for td1 and td2. Keep map IDs, native
  authored names and data unchanged. Preserve the original official splash PNG
  and logo; the generated concept screenshot is a reference, not a UI asset.
- Native footer controls keep at least 48dp touch height. Inspect compact and
  narrow/enlarged-text layouts, graphics popup dismissal and Music/Back returns.
