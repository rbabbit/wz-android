# Warzone Towers 0.93 normal test build — audit

The exact normal APK completed the scoped emulator journeys below. The full runtime seal and curated evidence are included; archive integrity is recorded separately after packaging.

The normal APK is `4f48c3e3ba80c6562ce711a4adab17704cd40737bc0362e6732bd58ecf2862b1` (640,785,707 bytes), signed with the existing normal certificate `4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`. The prepared source profile is `290f3e6d47a1dc85a3e3dc95245ac56331af66b9d940ffc0ccaf6c66f87961f6`.

## Behavior and implementation

REPAIR applies native Medium retreat at 75% health remaining or below to owned combat units across the map and to new production. ON shows green text on black after a matching native acknowledgement. OFF applies Never for future automatic retreats and lets active journeys finish. A repair facility heals; fallback HQ return does not heal. Native post-repair behavior does not promise to resume an old attack order.

ALL COMBAT selects the commandable part of the owned combat army. Damaged units pending retreat, active repair/base-return trips and rearming units remain protected; eligible repaired units rejoin. Empty or entirely protected armies keep the toggle enabled without a movement timeout. The controls remain independent.

Native client dispatch also filters protected units for grouped movement, object orders and STOP. STOP has a context/activation/nonce-bound mailbox or multiplayer input action, live protection at dispatch, cancellation, and a matching acknowledgement. Physical S has the same guard. Generic synchronized game orders and frozen game data are unchanged; ordinary manual and constructor FIFO STOP paths are retained.

## Recorded checks

The original 0.92 conflict was reproduced with genuinely damaged moving RTR14 units still selected. A preliminary healthy Guard25 observation was discarded. The first 0.93 candidate, separately identified as `7d148865…`, passed zero-ready mode, STOP, OFF during a moving return, HQ fallback and repeated object attacks. These are preserved regression evidence, not claimed as final-APK runs.

The exact final APK passed Towers threshold checks: 153/205 and 102/205 retreat, 154/205 stays eligible, and an off-screen damaged unit enrolls. All three damaged tanks reached the actual seeded repair provider, healed fully to 205 and rejoined. One physical Manufacture press produced Heavy Gunner Cyborg164481 normally at factory160049; its native repair policy became75 while Players was open and selection resumed after closing. No runtime spawn or requeue was used.

One physical STOP acknowledged only healthy selected IDs1900003/1930003; far1930005 retained moving RTR14 toward provider1930101. Research/Players/Manufacturing Back returns, 2400×1080 and1280×720 controls, two real keyboard open/Back/Cancel cycles, completed movement of all six units afterward, independent toggles and normal Home return were observed. Campaign also passed native75, five-unit guarded STOP, panel/compact checks, independent toggles and normal Home return. FFA passed the same policy, pane/compact, MOVE→guarded STOP, independent toggles and normal Home journey on its original checkpoint. Campaign and FFA each sent one physical STOP, with matching native ACKs and Guard25/action0 afterward.

Sixty focused native/header/actual-keyboard-dispatch cases,24 extracted actual-function UI cases, three JS syntax checks and six loader/WASM pairs passed. Harnesses are distinct from Android gameplay; the same-tick stale-selection race is proved in the native harness, not forced live. All660 APK assets match source, exactly17 approved assets differ from0.92, and four compiled Cronet libraries remain byte-identical. Source restoration accepts recorded prior/current states and rejects local edits, corruption and a later0.94 state.

## Fixtures, corrections and limits

Only owned emulator5562 was operated. Seeded stock tanks/provider/unarmed target were disclosed separately from ordinary production. Original APKs/source, save archives and prepared states were preserved; user5558, retained5560 and the physical phone were not operated. External same-signer QA instrumentation was separate from the APK and was removed after checks. The unchanged normal APK was then launched without instrumentation and its actual Home screen was visually confirmed.

Native FS/per-frame clocks were used because Commands snapshots can remain cached under Players. The STOP drawer handles pointerup and may close before a synthetic click; a click-only observer falsely timed out, but the matching native ACK proved the one STOP and it was not repeated. Later STOP checks use trusted pointerup. Guard auto-fire after STOP is not continued movement.

Inherited emulator terrain is black; models, controls and minimap render. Compact Research partly overlaps the minimap. Neither behavior was changed by this feature. No all-device, public-match, physical cellular, or separate VTOL/replay/commander runtime claim is made. Private MP repair-provider completion is not a fixture claim; actual repair completion is demonstrated in Towers.

No AAB, VPS/update-feed upload, GitHub push or Google Play publication is part of this delivery. The user must test and approve this exact APK before any future VPS update.

## Private multiplayer and final cleanup

Owner1 passed both native data checks. One normal Design1 factory job produced160691 with205/205HP and nativeMedium75 while Players was open; closing restored its selection. A real MOVE progressed and completed. One later physical STOP produced a matching native schema93 ACK and order0; this is not a claim of mid-motion interruption. Nonempty ALL COMBAT OFF/native deselection and Repair0→75 passed.

Spectator13 passed its initial native data check; the second stage is intentionally inapplicable to spectator slots by official source. Both real Repair APIs and both STOP routes denied commands, with native policy unchanged. Its actual Return reached native Lobby/session inactive/service stopped and Home.

The original long owner fixture reached its600-second bound after opening Return confirmation and before any Return touch. The vanished-Dialog preflight refused input. The successful production/STOP session was not restarted. A fresh, short exit-only owner session on22224 passed both data checks, native Repair/AllCombat ON and one actual Return→inactive Lobby/service stopped→Home. All three owned current MP hosts were cleaned up.

A MOVE predicate was corrected for one world-unit touch/ray rounding using the same command; a WebView-destruction HTML observer was replaced by actual native Lobby/session/service evidence. The first normal-launch screenshot after helper removal showed splash; a later image confirms real Home. These are recorded fixture/oracle corrections, not hidden application failures. Original archive hashes were checked immediately before helper removal; the target app was not uninstalled or cleared. Only emulator5562 was used.
