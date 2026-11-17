# Players0.91 coordinated audit and acceptance

Status: combined feasibility audit passed; implementation authorized in isolated0.91.
The user has authorized implementation and one normal test APK after this audit.
No questions, AAB or publication. Local phone testing and explicit approval are
required before VPS/feed, website, GitHub or Play changes.

## Verified source and screenshot issues

1. No Players header entry exists in Towers, FFA, Campaign or Multiplayer.
   PC screenshots3409/3410 expose only a small hover-labelled player-stats icon.
2. Screenshots3412/3413 show the normal native blue player menu, including
   alliance/mute actions and deliberately restricted player counts. Screenshot3411
   shows the separate detailed observer table and is explicitly a Replay. Replay
   screenshots do not establish live spectator behaviour.
3. The observer statistics table enumerates competitors, including former humans,
   not a complete watcher roster. Connected spectators need a separate section.
4. The current rich Multiplayer roster is a waiting-room interface and is cleared
   outside that phase. The native in-game state does not expose a full live roster.
5. Multiplayer rejects ordinary spectator commands and hides command pages for
   spectators. Players needs an explicit read-only exception, without enabling
   research, production, construction, combat selection or other ownership actions.
6. The shared page renderer currently depends on an owned catalogue/snapshot.
   A spectator-readable Players renderer must use its independent native snapshot.
7. Native player identity, blind-name handling, allocation, actual spectator slots,
   local versus viewed player, allies, stats visibility and native capability guards
   must remain authoritative. Missing/hidden statistics are null, never invented0.
8. Native alliance/gift/mute functionality must remain accessible through the
   original native menu where eligible. This scope introduces no new mutation API.
9. Compact headers gain an additional entry. Repeated menus, Build auto-close,
   keyboard returns and requested ALL COMBAT must survive Players open/close.
10. Current INTEL/F5 is the app's intelligence/research/briefing flow, not native
    player controls. The actual legacy multi-menu is a separate native path.
    Its alliance callbacks assume a playing slot: it must not be forwarded to
    high-slot spectators. Only safe owned players get that navigation capability;
    eligible spectators can access the separate native observer table.
11. Towers and FFA both use native SKIRMISH. The distinct Towers0.52 source build
    needs a readout-only profile define to label scenario participants conservatively
    and omit default/fabricated teams. It changes no gameplay or data definition.
12. All rich stock observer fields have source helpers: Power/Rate, PowerLost/Won,
    LabUse, Kills/Units and armour/weapon grades. They stay behind the exact native
    real/viewed-spectator guard; native colours and blind display names are retained.

## Agreed implementation direction

- One Players entry across the four existing game modes. Reuse the app's opaque
  black/white command-page style with responsive readable rows, not the translucent
  blue native presentation. No new replay loader or replay game mode.
- Native read-only, atomic, context-scoped roster snapshot. Names, native army
  colours, teams, Human/AI, You/Host, connection/current/former state as supported.
- Separate allocated live spectators from playing participants. Do not expose
  empty, disabled or unallocated phantom slots as people.
- Basic player-visible fields by default. Observer-only details follow the native
  real/viewed spectator eligibility. Campaign/Towers use conservative scenario
  participant discovery, not fabricated online identities or hidden enemy counts.
- Poll while open, bound native publication to a sensible real-time cadence, clear
  old context/role/world data and render loading/unavailable rather than stale data.
- Close/Back/session reset release input and restore prior gameplay without orders
  being changed, production interrupted or requested ALL COMBAT silently cleared.

## Exact test APK acceptance journey

1. Preserve0.90 APK/source, complete stopped userdata fallback and prepared saves.
   Reuse owned headless5562 and private native fixtures; never5558/5560.
2. Reproduce baseline in each mode and as a real live MP spectator before edits.
   Validate actual viewport, roles, selected native IDs, positions and ready state.
3. Verify basic roster identities/teams/colours/type and separate actual spectators
   against native connected/configured state. Test current/former/empty slots and
   live changes; enforce blind aliases and player/observer visibility boundaries.
4. Inspect real Players screens in Towers, FFA, Campaign, MP player and MP spectator.
   Verify normal and compact layout, long/escaped names, loading/stale context,
   close/reopen/Back and spectator actions staying read-only.
5. Verify native menu fallback actions remain reachable without menu overlap or
   ownership escalation. Do not send public chat or contact unrelated players.
6. While requested ALL COMBAT is ON, open/close Players, issue an ordinary MOVE
   and observe native positions/completion. Verify OFF still deselects, production
   while ON joins, production while OFF does not, and bars/brackets remain removed.
7. Use prepared constructors: verify group/Build/Players returns, one ordinary
   valid reachable structure placement, native worker orders and completion.
8. Repeat research/manufacturing/queue and two IME returns, then ordinary input.
   Confirm no held keys/mouse/pointers and no requested-mode or context leakage.
9. Rebuild from native source, preserve3 lineages/6 full loaders and every data/map/
   media/protocol/camera input. Verify exact source/APK assets, normal signer,
   version91/0.91/updater/notification fixes, alignment and APK-only output.
10. Freeze exact runtime evidence and source identity. Package complete matching
    source with exact test APK. Failed or incomplete visual checks stay explicit;
    a successful host script/build never establishes Android gameplay or UI success.

## Combined audit checkpoint

Source and UI audit is complete with a coherent native contract and no remaining
feasibility blocker; see vendor/native-091/CONTRACT.md and BUILD-PLAN.md. Actual
installed0.90 Towers, Campaign, FFA and Multiplayer-player headers reproduce the
missing control. The actual Towers Intelligence page is research/briefing content,
not the native Players menu, so relabelling it would be incorrect.

The supplied PC screenshots ground the two native presentations. Live MP spectator
role capture on frozen0.90 is still completing in the same private fixture; it is
not claimed observed yet. One legacy Intelligence-close fixture required diagnosis.
This remaining role observation must finish before the91 install and is a required
delivery verification path. It does not block source implementation of the audited
independent read-only snapshot/page. No existing candidate/APK/fixture is edited by
the isolated91 implementation.

Root implementation cue: proceed with approved native contract, shared Players UI,
normal91 APK and complete matching source. Preserve exact native role/visibility
guards and all previously working gameplay. Runtime failures require diagnosis
and correction or explicit observed verification limits; never invent a pass.

## Baseline and first-iteration observations

- Frozen0.90 baseline reproduced missing Players in all four modes. A real MP
  spectator13 was allocated separately from host0 and Easy AI1, with no orders.
  Initial game world/role was observed, but a stable spectator journey was not:
  the slow emulator was first lag-kicked at gameTime2 under the stock10s spectator
  grace. A later data-check message for that disconnected slot does not establish
  a phone checksum failure. The temporary third PC --autogame peer independently
  loaded extra Semperfi scripts and failed DATA_SCRIPT; it is not used for final
  verification. No checksum bypass or protocol/data modification is permitted.
- The final private spectator fixture uses stock normal-ready host+Easy AI,
  startplayers1 and readybeforefull=false; the phone's normal Spectate/autoReady
  triggers start. Routine lag/not-ready kick settings are disabled only in the
  private test config. Actual data integrity checks stay active.
- First91 APK b3af6f3858ef1386edbe6f90dfa2c4451b1781e40058368db8a4958f40a48188
  was installed and physically painted the black Campaign Players page, with
  Commander/Cyan-Nexus, own counts and hidden opponent fields. CLOSE/Return worked.
  It exposed a missing Players icon and10px surface gap leaking the power bar;
  both are corrected in R2. Its saved named Campaign did not reproduce the native
  empty-raw-name edge; source/helper review found and fixed the stock Commander
  fallback loss separately. First-iteration evidence is not final-APK proof.
- R2 UI:21 focused Players groups,21 combat/constructor regressions and35 unchanged
  camera functions pass. Native:22 actual-helper cases per generic/Towers profile,
  three source-built cores and six full paired loaders pass. These are host/source
  checks. Exact R2 Android role/gameplay/layout verification remains required.
