# Native progress event contract

`PlayGamesProgressStore` accepts trusted native events through `recordEvent(owner, event)` and returns account-scoped submission facts. `facts(owner)` returns retained facts. Empty owner stores unclaimed local history; `hasUnowned()` and explicit `claimUnowned(owner)` support assigning it once to the selected account. Account partitions use hashed Play Games player IDs in private preferences. Claiming unions stable run/wave/mission identities in one committed record; it does not replay increments.

Required event fields are `eventId`, stable `runId`, `kind`, `mode`, `map` and a valid native player count. Supported kinds are `wave_cleared`, `match_finished`, `mission_completed` and `campaign_completed`. Modes are `campaign`, `towers`, `survival`, `ffa`, `challenge`, `maps` and `multiplayer`. Downloaded-map events use `maps`, including Teams games.

Spectators never count. Multiplayer requires both `verifiedResult:true` and `nativeCompleted:true`. Other completion events require `nativeCompleted:true`; Towers/Survival wave events require `verifiedResult:true` or `nativeCompleted:true`. Wave evidence is `completedWaves:[...]` or one `wave`. A normal local Multiplayer terminal proof can earn an achievement; Multiplayer leaderboard facts additionally require `serverVerified:true`.

Provide consistent `difficulty`, `botType`, `gameType`, `players`, ordered `teams`, and any applicable `strategy`/`weapon` and `classification` for every event belonging to a run. Team assignments are required for Teams games. Run context is immutable. Campaign runs are additionally partitioned by `missionId` (falling back to `map`), permitting one campaign session ID across missions. Native mission completion also supplies a Campaign fastest-victory candidate when its measured `elapsedMs` is positive.

Waves deduplicate by mode, run and wave number; terminal states by run; Campaign goals count distinct mission IDs; Maps bot goals count distinct compatible bot types won against. Saving/reloading must retain the logical run ID. The catalog contains exactly 18 achievement definitions in `app/src/main/assets/warzone/play-games-definitions.json`, with stable `key` fields and no invented Google IDs.

Facts contain `owner`, `kind` (`achievement` or `leaderboard`), `key`, `mode`, `map`, `difficulty`, `classification` and a long `value`. Achievement values are absolute, capped progress, suitable for idempotent step updates rather than repeated increments. Board facts are restricted to one exact mode/map/difficulty and the full classifier `bot=...;players=...;type=...;teams=[...];strategy=...;rules=...`.

`waves_reached` uses `wave * 1000000000 + (999999999 - elapsedMs)` with higher scores preferred; time breaks ties at the same cleared wave. `fastest_victory_ms` uses measured milliseconds with smaller scores preferred. Unknown elapsed time produces no time-dependent board candidate. Limits are 10,000 waves per run, seven days of elapsed milliseconds, 4,096 retained runs per account, eight account partitions and 8 MiB of private history. Capacity failures preserve the existing committed history.

This local history is separate from the current manual save/Crystals cloud snapshot; it has not been added to that archive. No tests or emulator runs accompany this implementation.
