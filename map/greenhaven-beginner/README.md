# Greenhaven — Beginner

Original 64×80 Towers layout with one broad northern entrance, a winding
approach and a connected southern base. Four trucks, two labs, two vehicle
factories, one cyborg factory, four operating oil extractors and two guard
towers start together. The separate Beginner schedule has 15 rounds.

The map uses the existing Arizona artwork. Its unchanged terrain-type table
comes from NoQ's CC0-1.0 td1_v3 map retained under vendor/maps/td1-v3; the new
layout and object placements are authored in tools/build-greenhaven.py.

Regenerate with the frozen 0.17 APK, never by editing compiled engine code:

    python tools/build-greenhaven.py --baseline-apk <Warzone-Towers-0.17.apk>

AUTHORING.json records static connectivity, footprint and entrance constraints.
These are data-generation checks, not native pathfinding or gameplay evidence.
Appearance, playability and difficulty have not been emulator-tested.
