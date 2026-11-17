# 0.89 selection display and normal APK update

Baseline screenshots show41 selected tanks with repeated health backgrounds,
green health rectangles and white corners covering the vehicles. At comparable
zoom the deselected group remains readable. Camera0.88 is not part of this fix.

Confirmed source issues:

- Native barMode has no selected-bar OFF state; selected-unit bars are always
  queued. Remove only their horizontal health/background rectangles by matched
  source rebuild; keep selection corners, shields, ranks, reload and structures.
- Towers/FFA move their ALL button into the bottom drawer as ALL UNITS; restore
  one top ALL COMBAT alongside existing top controls in each of all four modes.
- Existing active display follows lock intent. Compare actual nonempty eligible
  combat IDs and selected IDs; include native selectable/transporter/weapon rules.
- Shared pressed CSS forces light background/dark text. Add combat-only dark
  surface with white normal / green confirmed-selection text.
- Existing normal APK/feed uses signer4499efe0...; Play0.87/camera0.88 uses a
  different signer. New normal0.89 must retain the normal update signing chain.

Focused checks:

1. Actual selected combat units show no horizontal bars in Towers, FFA,
   Campaign and Multiplayer. Corners and other native status remain correct.
2. ALL COMBAT exists once at top and is reachable at ordinary/compact phone
   sizes, with no wave/status collision. White at no/partial/mixed selection,
   green for confirmed exact nonempty combat selection; manual selection,
   deselect, constructors, new/dead units, save/menu returns update correctly.
3. Actual native selection, movement/orders and lock behavior remain functional.
   Use prepared units/saves; disclose seeded fixtures if any are necessary.
4. Check repeated menu/keyboard returns and restored viewport/input on exact APK.
5. All three native variants retain provenance; data/maps/protocol unchanged.
6. Normal APK89/0.89, signer matches live0.86, updater present, no AAB. Test
   live HTTPS download+Android installer update with native save/pref fingerprints.
7. VPS private rollback backup, atomic APK then matching feed, full public hashes;
   Caddy/website bytes unchanged. Package matching complete source after checks.
