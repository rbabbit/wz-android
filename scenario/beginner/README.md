# Greenhaven Beginner schedule

This is a new, map-specific Tower Defense configuration. It does not replace
the supplied `vendor/tower-defense/mod/config.js`, Dustfall, or Iron Valley.
The original mod remains the source of native spawning, experience ranks,
research progression, rewards, saving, round execution, and unit templates.

The schedule contains 15 rounds and 421 units. Round totals are
10, 15, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 39, 42, and 45. The first
round follows a 240-second preparation period; subsequent waits are 140–180
native game seconds. The first round is basic scavenger infantry. Machinegun
scouts join in round 2, wheeled Vipers in round 4, half-track Vipers in round 8,
and the first medium Cobra bodies in round 11. There are no hovercraft, heavy
bodies, heavy artillery, advanced cyborgs, lasers, railguns, or missile units.
The Mini-Rocket Pod is the only rocket weapon in the schedule.

The existing config API sets this map's enemy research delay to 900 seconds
(the supplied schedule uses 360), and rewards each kill at 125% of the ordinary
native reward for the selected power level, rounded up. `setResearchDelay`
subtracts from the existing research clock, including its native starting
base/tech allowance; it does not introduce a separate timer or a fixed
15-minute research lock. Human research remains manual. Experience rank
progression and native spawning are unchanged. Counts, timing, and difficulty
are authored source values; no balance or gameplay verification is claimed.

## Packaging contract

| Virtual package path | Source |
| --- | --- |
| `/data/mp/config.js` | `scenario/beginner/config-router.js` |
| `/data/mp/tests/towers-beginner-config.js` | `scenario/beginner/config.js` |
| `/data/mp/tests/towers-original-config.js` | `vendor/tower-defense/mod/config.js`, byte-identical |

The router matches only `typeof mapName === "string" && mapName ===
"Greenhaven-T1"`. Unknown maps and a missing native `mapName` use the
original config. Do not match a display label, substring, browser storage
setting, selected UI map ID, or challenge filename. The Beginner challenge's
`challenge.map` and native map registration must both name
`Greenhaven-T1`.

## Native API and load provenance

The read-only Warzone 2100 4.7.0 reference at
`C:/timerApp/.reference-warzone2100-4.7.0` establishes the following:

- `doc/js-globals.md:17` documents `mapName` as the current map name.
- `src/qtscript.cpp:582–583` assigns `globalVars["mapName"] = game.map`.
  The following `setSpecifiedGlobalVariables` call marks it read-only and
  recreated from the application rather than persisted script state, before
  `readyInstanceForExecution()` evaluates the script.
- `src/multiint.cpp:4873` reads the native `challenge.map`; line 4892 copies
  that exact value into `game.map`. The challenge display name is separate.
- `src/game.cpp:495` serializes the native map as `multiMapName`; line 542
  restores it into `sGame.map`, and line 2860 restores `game` from `sGame`.
  Line 4937 also writes `game.map` as the save's `mapName`. Script globals
  are recreated from this native game state. This is source evidence only;
  fresh start and save/load behavior still require runtime verification when
  authorized.
- Preserved `mods/init.js` includes the supplied `configAPI.js` and
  `configReader.js` before `include("config.js")`, so this router runs in the
  normal global mod context. Canonical `rules/init.js` stays unchanged.
- `towerDefense.js` recreates `actions`, `totalRounds`, the research delay,
  and the reward function during script loading. Its persisted round index
  and the existing SaveLoad mechanism are unchanged. No new timer, event
  handler, global persisted selector, or save namespace is added.
- Existing `warzone-towers-waves.js` emits `totalRounds` from the selected
  configuration. Its HUD and skip limits therefore use 15 for Beginner,
  while the original config still supplies 30 for the existing maps.

Unit template strings are exact selections from the preserved supplied
`WZmodTowerDefense-v4.7.0-a` config. This schedule/router is new project source;
the supplied original mod, map archives, and engine are not edited.
