# Map and startup checklist

Frozen v5.10 APK/source/checksums verified before edits; branch starts at 810a221.

- Supplied td1_v3 archive SHA256 matches its filename. It is a flat modern map,
  64x80, Arizona, four starts, NoQ, CC0. Keep all seven source members exact.
- Existing map is 64x64 TowerDefense2_m. Keep its scenario, mod and gameplay UI.
- Add a second challenge with human start 0 and dummy enemy starts 1-3. Original
  Towers mod removes dummy AI bases and controls waves/spawns/rewards unchanged.
- Native test new map first: correct dimensions/HQ/units, accessible entrances,
  selection/move, build completion, production, manual labs, spawn/attack/reward.
- Then simplify splash: preserve artwork, two named map choices, compact graphics,
  download and music controls; no large full-screen graphics cards.
- Music currently defaults missing preference to all 39 tracks. Default to none,
  keep explicit saved selections, ask for tracks when enabling/starting music.
- Delivery APK: both maps start, choices survive Music/Back/restart, native queues
  and menu returns work, compact/standard/large startup screens and downloads,
  cancellation/retry, offline Normal, empty/saved playlist behavior and final
  installed APK hashes. Do not treat build/scripts as native gameplay proof.
