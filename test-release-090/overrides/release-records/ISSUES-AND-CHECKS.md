# 0.90 requested behavior and checks

The user's three phone screenshots show selected white brackets and ALL COMBAT
turning white while units remain selected. Exact0.89 source/evidence confirms:

- Colour follows exact selected IDs instead of the user's persistent ON/OFF
  choice. Newly produced units can make it white; manual complete selection
  can make it green while the requested mode is OFF.
- Towers/FFA reselect only on enable or before an order. Ordinary menu, build,
  save and manual-selection paths can clear or cancel the requested latch.
  Campaign and Multiplayer use separate policies with additional OFF paths.
- Second press disables maintenance without deselecting combat units.
- The selected health rectangles are suppressed, but four white corner
  rectangles remain. The header background is grey rather than black.

Confirmed by the user: ON covers all owned eligible combat units across the
entire map; newly produced units join automatically. Second press turns OFF
and deselects combat units. Green persists until that explicit press.

Acceptance checks, on the exact normal test APK in all four modes:

1. OFF is white on black#000. Manual selection alone never turns the mode ON.
2. First press turns ON/green on black and selects all owned combat IDs,
   excluding constructors/transports/unselectable or other-player units.
3. Green remains ON with no army, partial/manual selection, ordinary movement,
   menus and returns; new production joins without another button press.
4. Second press turns OFF/white and deselects combat units. No delayed callback
   may reselect them afterward. Repeat ON/OFF and produce another unit while OFF.
5. Selected units have neither horizontal health/background bars nor white
   brackets. Keep structure/build progress and unrelated stock status intact.
6. Requested ON can temporarily yield to constructor/build/menu/IME workflows
   without stealing builders, cancelling orders or turning the mode OFF.
   Resume combat selection on normal build/combat return. Inspect actual native
   IDs, accepted movement/build orders, positions and completion.
7. Reuse prepared saves/units. Test normal production separately; disclose any
   seeded fixture. Use an idle human private host instead of an attacking bot.
8. Inspect actual header pixels and compact layout, repeated menu/keyboard
   returns and released input. Builds or VM/source checks alone are insufficient.
9. Preserve the distinct three native cores, all six full loader pairs, frozen
   package indexes/data/maps/protocol, saves and prior artifacts. Native changes
   come from C++ source with complete provenance and matching generated glue.
10. Deliver APK and complete source locally. No AAB or VPS/feed/site/GitHub/Play
    changes. The user must test and explicitly approve before any publication.
