# Players0.91 native/UI contract (audited, implementation pending)

The new panel is a read-only observer of native state. It never supplies roster
identities or statistics from JavaScript guesses, command catalogues or the
waiting-room cache. It does not issue orders, change selection or control a side.

## Snapshot

Atomic file: `/tmp/warzone-players-v91.json`.

Top-level keys: `schemaVersion:91`, `context` (opaque string), monotonically
advancing `frame`, `gameTime`, `realTime`, `ready`, `mode`, `viewer`,
`capabilities`, `players`, `spectators`, `nativeMenu`.

`mode` is `campaign`, `offline-scenario`, `offline-skirmish`, `multiplayer` or
`replay`. Towers0.52's isolated HCI object uses the source-build-only
MOBILE_PLAYERS_SCENARIO91 define because both Towers and FFA otherwise identify
as native SKIRMISH. No runtime/data hint is injected. Campaign and Towers report
team:null; generic FFA uses actual native team mode only.
`viewer` is `{realPlayer,viewedPlayer,role,ownsViewedPlayer,canIssueOrders}`;
`role` is `local`, `player`, `spectator`, `replay` or `view-only`.
The real identity is distinct from the viewed side. Replay is always read-only.

`capabilities` contains boolean `readOnly:true`, `teamMode`,
`fullSpectatorStats`, `legacyPlayers`, `legacySpectatorStats`.
`nativeMenu` is `{players:boolean,spectatorStats:boolean}` from actual native
menu state, not a requested UI state.

Each `players`/`spectators` row has:

```
{
 id, position, name, kind, state,
 allocated, human, ai, spectator, local, viewed, host,
 team, colorIndex, colorRGB, relationship,
 connectionState, connectionFlags,
 stats: {score,kills,units,structures,power,pingMs},
 observerDetails
}
```

`kind`: `local`, `human`, `ai`, `scenario`, `former-human`, `spectator`,
`recorded-human` or `recorded-ai`. `state`: `active`, `former`, `scenario`,
`spectating`, `inactive`, `spectator` or `recorded`. Names use `getPlayerName(id,true)`, preserving native
blind aliases. Never export raw player identities, IP addresses or keys.
Local means the real slot; viewed means the selected camera-side slot. Host is
only a live-network badge. Team is null outside actual native team modes.
Participant colors use native getPlayerColour/pal_GetTeamColour, RGB0..255;
unavailable spectator color/team data stays null, not an invented team color.
Relationship is `self`, `ally`, `opponent`, `observer` or `unknown`.

Live MP rows contain actual allocated non-spectator humans, configured enabled
AI slots, and former humans identified by native HUMAN difficulty (clearly
marked former, never connected). Exclude unused, open, closed and disabled
slots. Spectators are a separate array of actual allocated spectator slots
across MAX_CONNECTED_PLAYERS, including IDs beyond MAX_PLAYERS. An empty
spectator slot and an eliminated unallocated AI are not live viewers.
Playable-slot participants retained by the stock observer table remain in the
participant section after native spectator conversion. An allocated human has
kind:human/state:spectating, spectator:true and its actual connection status;
it is also a live watcher with the same ID in the separate spectators section.
An unallocated former human is former/disconnected; an unallocated spectator AI
is inactive and is not a live watcher. IDs are unique within each section.
Replay participants are explicitly recorded identities, not live connections.

Offline skirmish lists configured enabled native participants. Campaign and
scenario participants are local/allied or natively discovered/visible sides;
unseen enemy object lists cannot create a revealing roster entry. Discovery is
snapshot-local read-only cache, reset on context loss. Offline identities are
local/AI/scenario participants, never fabricated online humans or watchers.

All denied/unavailable statistics are null. Public native scoreboard Score
(signed recentScore) and Kills are available for listed participants; cheated
network score is null rather than an invented number. Units are self/allies
only for an active viewer. Structures are self/allies in offline modes; active
MP uses ping instead. Power is the active viewer's own side only. Ping is only
an actual remote allocated live human below native timeout; otherwise null,
with connection flags/state preserving waiting/desync/leaving/dropped facts.

Full observer details require the exact stock guard: both selectedPlayer and
realSelectedPlayer are valid native spectator slots. Merely viewing another
side, being out of playable bounds or a JavaScript spectator flag is not enough.
When denied, `observerDetails:null` and `fullSpectatorStats:false`.

Allowed observer details:

```
{
 power, powerRate, powerLost, powerWon, labUsePercent, kills, units,
 kineticArmor:{tank,cyborg}, thermalArmor:{tank,cyborg},
 weaponGrades:[{id,name,grade}]
}
```

Power uses native getPower; powerRate is the native signed display string from
getApproxPowerGeneratedPerSecForDisplay (not a sampled/guessed rate).
PowerLost/Won are exact uint64 decimal strings. Lab use uses native research
performance/potential and is null when potential is zero. Armor and weapon
grades use the public research helpers; weapon columns follow native subclass
names and only columns whose native maximum grade is positive. Actual zero
grades in an available column remain zero.

Publish expensive roster/detail scans at most once per1000 realTime ticks.
World/context/role loss immediately publishes ready:false with empty arrays.
Context changes on world/session, level, real/viewed role or time rewind.
HTML accepts only current schema/context/viewer and advancing frame/realTime;
it redacts on loss and expires data after about3500ms performance time.

## Native view navigation (no gameplay mutation API)

Request: `/tmp/warzone-players-nav-v91.json`, atomic JSON
`{nonce,context,action}`; strings bounded160bytes, whole request <=1024bytes.
Actions are only `legacy-players`, `legacy-spectator-stats`, `close`.

ACK: `/tmp/warzone-players-nav-result-v91.json`, atomic JSON
`{nonce,context,action,ok,reason,nativeMenu:{players,spectatorStats}}`.
Process each nonce once. Reject stale context, no world, video/loading/popup
unsafe state or denied role before navigation. ACK actual menu state; a VFS
write alone is never proof that a menu opened. The result path avoids rescanning
the whole roster for a fast menu ACK.

legacyPlayers requires native bMultiPlayer&&!INT_INTELMAP plus safe owned
real==viewed<MAX_PLAYERS and non-spectator. This is native NumpadEnter's Players
menu, not F5/Intel. Restrict high spectator slots because the original alliance
widget indexes alliances[selectedPlayer] without its own playable-index guard.
Eligible spectators use the actual native spectator Stats overlay instead.
legacySpectatorStats requires the exact full observer guard above. Native
normal Players/alliance/gift/mute widgets and their callbacks remain unchanged.
Close uses the existing native close functions. Add only a read-only native
specStatsViewIsOpen accessor so state/ACK reflects the actual overlay.

HTML closes its Players page before opening a native fallback, waits for the
exact ACK and offers an explicit normal close/return path. General spectator
command/selection/order permissions remain denied. No arbitrary keys, scripts,
alliance/gift/mute RPCs or ownership overrides are introduced.
