# Public Hub data and rating method (0.75)

The Hub reads public Warzone results from [Retropaganda's Game Hub](https://warzone2100.retropaganda.info/hub). It does not sign in, submit results, modify a player account, join a game, or contact the app's VPS. Searching and rating calculations happen locally in a dedicated worker.

## Sources and attribution

The public source was inspected on 14 November 2026:

- [Results subscription](https://warzone2100.retropaganda.info/results.json?id=), requested with `Accept: text/event-stream`.
- [Public-key aliases](https://warzone2100.retropaganda.info/player-public-keys.json).
- [Shared/spoiled public-key policy](https://warzone2100.retropaganda.info/player-spoiled-public-keys.json).
- [Subscription/cache behavior](https://warzone2100.retropaganda.info/results.js?v=6).
- [Rating method and defaults](https://warzone2100.retropaganda.info/calculate.js?v=6).
- [Leaderboard membership filters](https://warzone2100.retropaganda.info/leaderboards.js?v=6).

No license for redistribution of the website's JavaScript was established from those responses. Its JavaScript is **not** bundled or executed by the app. `hub-data.js` and `hub-worker.js` are independently written implementations of the observed public format and numerical method. The mathematical reference was executed only in a temporary external audit directory to compare results. The source release retains a bounded public JSON data fixture and numerical expected outputs, with attribution; it does not include the downloaded website scripts or the full public history.

Exact observed response sizes and SHA-256 hashes are in `qa/hub-075/public-sources.json`. A full SSE subscription reached `synced` after 7,701 records / 11,051,877 decoded bytes and was closed immediately. A request without the SSE Accept header selects a much larger raw JSON export; that audit request was stopped at the 64 MiB limit. The app always requests SSE and does not download that raw export.

## Numerical behavior

The implemented defaults are Elo 1500, K 40, a newcomer multiplier of 2 decreasing over 50 rated games, eligibility after 10 games in the selected leaderboard, and display names chosen from the last 30 games. Alias and shared-key policies follow the two public identity feeds. Global, 1v1 and FFA use the site's corresponding filters; no invented general-purpose Teams board is exposed.

The method preserves team membership, outcome reconciliation, the three-minute grace period, cheated/unequal-team exclusions, early and mid-game quit handling, team power contributions, and the transition from contribution-weighted to time-weighted Elo shares. Research ratios use the site's legacy-field fallbacks. A separate `researchRecorded` flag prevents the method's fallback value of 1 from being displayed as measured 100% activity when no research values were reported.

`qa/hub-075/live-parity.json` records comparison against the complete observed public snapshot: all eligible ratings and all account game/win/loss/draw/research-method values matched for Global (1,496 accounts), 1v1 (776), and FFA (183). This is source/host evidence, not Android gameplay evidence. The 48-record retained fixture in `tools/fixtures/hub-075/` is deliberately a subset for repeatable parsing/method tests; it is not presented as a complete Global leaderboard.

## Completeness, caching and failures

The worker recognizes `reset`, result messages with event IDs, and `synced`. A clean first subscription or a valid cached prefix must reach `synced` before a leaderboard is published. Partial records can be browsed as results, but partial-history ranks and ratings remain unavailable. A completed older snapshot can remain available during refresh/offline operation and carries its cached timestamp.

IndexedDB stores complete snapshots atomically, separately from incomplete resumable checkpoints. Incremental subscriptions use the server's cursor in `results.json?id=…`; malformed cursors/data, interrupted streams, oversized downloads and identity-feed failures cannot promote a partial snapshot to complete. Native pause/leave disposes the worker through the local Hub UI. The worker also supports explicit cancellation and generation guards so an old request cannot replace a newer session's data.

The app loads no remote website scripts, styles or images. Its three remote GET paths are narrowly allowed by the native wrapper. Replays remain optional metadata; 0.75 does not fetch them or add an in-app replay player.
