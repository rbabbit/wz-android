# Saved terrain and the FFA pathway edits

Existing saves are retained without rewriting their terrain. Genuine EMAG and
EMAJ native save archives include their own `game.map` and `ttypes.ttp`, covered
by the archive manifest. The app requires the map record and hydrates the saved
files into the private save folder before passing `--loadskirmish` to the engine.

The matching upstream 4.7 source loads a user save's map from its save directory,
and writes the map into that directory when saving:
[save and load implementation](https://github.com/Warzone2100/warzone2100/blob/7d3d8e51a61ceee89e6bf672a41337e1a9cd7392/src/game.cpp#L2407).

New matches use the edited pathways. Existing saved matches are expected to
retain the terrain they saved with. This conclusion comes from archive and
source inspection; this release does not claim an emulator/native reload test.
