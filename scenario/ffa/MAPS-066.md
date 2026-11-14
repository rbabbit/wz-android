# FFA map catalogue and native identity

`maps-source.json` is the small authored build manifest. The shared generated
asset is `app/src/main/assets/ffa-maps.json`; IDs are immutable and are not
derived from display names. Existing `emag` and `FFA-EMAG-T1` identities remain.
An absent `bnFfaMap` query means the legacy EMAG choice; an explicit unknown ID
fails before the engine starts. All new challenges use unchanged stock Cobra.

`tools/build-ffa-maps-066.py` retains each supplied WZ archive with its exact
SHA-256 and copies native map records byte-for-byte. It accepts only the audited
map-file inventory, never executes content inside an archive and preserves the
legacy Templar INI/BJO/v10 format. New level descriptors register safe paths;
Contact and Templar use the urban dataset, the remaining maps use Arizona.
Original author/licence details and every file mapping are retained in
`vendor/ffa-maps/PROVENANCE.json` and per-map `PROVENANCE-066.json` files.

Previews are terrain overviews. Their pixels derive from
the map's texture terrain types and heights. Starts mark authored HQ locations;
gold marks deduplicated oil positions. These images are not game screenshots
and do not invent buildings, terrain or a balanced/symmetric opening. Contact's
sixteen starting trucks and uneven oil holdings are retained. No factories,
laboratories or extra constructors are added to any map.

The isolated FFA package contains eighteen locked challenges: six maps times
Easy/Medium/Hard. Every slot after human0 is a separate stock Cobra context,
with native difficulty1/2/3, distinct team/position and no alliances. Rules apply
air limits to every active player, observe the full alliance matrix and retain
research state for all four or six slots. No native engine is rebuilt.
The FFA wrapper creates every actual package-file parent before the unchanged
compiled preloader installs data slices. This includes all five added map
directories, including legacy Templar records; the directory list is derived
from the full generated VFS metadata rather than an assumed map count.
Contact's original thirteen/thirteen/thirteen/fourteen generators exceed the
stock initial cap of ten. Its private FFA launch policy raises only the power
generator userLimits tuple to [0,14,14] before native stats/map loading, and
retains that floor after stock setup/lobby limit application. The other five
maps retain their original structure-stat defaults. Authored map objects and
the public map catalogue/previews remain unchanged.

Map-aware save metadata includes mapId, mapName, nativeLevel, players and bots.
Restore validates these against native GAM `multiMaxPlayers`/`levelName` and
main `maxPlayers`/`levelName`, human0 ownership, per-player teams/positions and
native AI names plus all active script contexts. Old EMAG archives may omit
players/bots (four/three) and botType (NullBot). Their original bytes and names
are preserved. Missing metadata on another map is rejected rather than guessed.

Focused checks:

```
python tools/check-ffa-maps-066.py
node tools/check-ffa-maps-js-066.cjs
python tools/check-ffa-package-060.py
node tools/check-cobra-native-064.cjs
node tools/check-ffa-preload-066.cjs
python tools/check-ffa-structure-limits-066.py
```

These validate source/data/protocol properties. Actual native map startup,
rendering, pathfinding, bot progress, controls and save/load require the exact
delivery APK in the prepared emulator; host fixtures do not claim that evidence.
