# Towers 0.20 scenic map replacements

`python tools/generate-levels-020.py` authors the 43 scenic replacement maps and
their data-based previews. Requires Python 3, NumPy and Pillow. It preserves existing
`td1`, `td2`, and `beginner` catalog entries when those are present. The native
map sources for those three existing maps are never written by this generator.

The new set contains 15 Easy, 15 Medium, and 13 Hard maps. Every map has its own
explicit route recipe and unique traversable geometry. The routes differ in
their bends, connection depths, alternate loops, staging courts, and base
approaches. Difficulty specifies the requested wave profile and one, two, or
three northern perimeter entrance groups; it is not a playtested balance claim.

The set uses the genuine Arizona, Urban and Rockies native datasets. Terrain
compositions include river horseshoes, wooded tarns, glacial valleys, ruined
city wards, canal locks, refineries, quarry scars, crater rims and broad
badland basins. Every recipe has its own geography, dimensions/aspect,
landmark districts and base clearings. Native V40 map dimensions range from
104 to 144 tiles by 104 to 144 tiles. Curved natural routes and urban avenues
retain a clear connected primary route, with wider lateral courts for defence
and construction. Each rear base is assembled from clear organic/terraced
courts rather than the universal 0.19 rectangle. Terrain/object layouts remain
original CC0-1.0 map data. The native map registration remains
`WT-E01-T1` / `wt-e01`, `WT-M01-T1` / `wt-m01`, or `WT-H01-T1` / `wt-h01`, with
the matching two-digit number. The native game folder receives the seven map
payload files and the external `<nativeFolder>.gam`; the generated `.lev`
provides the registration stanza for the normal VFS append workflow.

Every human still starts in position 0 with a Command Centre, two research labs, two
vehicle factories, one cyborg factory, four oil derricks, one or two power
generators, basic guard towers, and four/five/six trucks. A genuine human-owned
`A0Sat-linkCentre` is behind the HQ on a protected rear court. Its actual 2x2
footprint has at least three clear tiles on every side. The rear court is
connected to the same base as all starting trucks and facilities.

The original three maps, existing names/IDs and all wave schedules are preserved.
The previous 0.19 generated set is frozen in `C:/timerApp/old_maps-0.19.zip`;
the delivered 0.19 APK and complete source ZIP also remain available as fallbacks.
The historical `tools/generate-levels-019.py` is retained unchanged, and is not
the authoring tool for the current maps.

Interior high plateaus use genuine native soil, rock, rubble and snow materials.
They are intentionally enclosed behind cliff banks, separate from the main
reachable playing floor. They contain scenery rather than required starting
structures or resources. Static checks distinguish the connected primary floor
from these enclosed scenic regions, check both four- and eight-neighbour
separation and reject any extra traversable perimeter/spawn tile. Canonical
native terrain tables remain unchanged; no custom terrain-type remapping is
used. Every water tile's four native vertices share the same water-plane height.

`AUTHORING.json` records each map's route coordinates, authored object IDs,
perimeter entrances, native height/material ranges, native landmark/scenery
districts, footprint/clearance constraints, and geometry hashes.
`GENERATION.json` records the set's counts and uniqueness. Those are static
generation constraints. The engine remaps authored IDs to synchronized runtime
IDs; actual runtime IDs have not been observed. No engine, emulator, pathfinding, gameplay, or
difficulty run is performed by this tool, and those behaviors remain unverified.

Preview PNGs read back the written native terrain and starting JSON objects.
They use the actual decoded native ground material pixels, shared-corner
material blending, native asphalt decals, height shading and object footprints.
The native ground inputs and their source/license provenance are preserved in
`map/art-assets-020/`. Road decals are read from the unchanged original VFS
artwork. No invented terrain artwork or generated game screenshots are used.
These previews are map-data renderings, not engine/gameplay screenshots; native
scenery is represented by its actual footprint rather than a fabricated 3D view.
