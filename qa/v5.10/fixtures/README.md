# Prepared native fixture

early-save-files.json contains every QuickSave file, including the .gam file
and native directory data, from the live v5.10 early battle before constructor
removal. Each entry stores its relative path and byte array. No power, research
or units were granted. early.json records the ordinary native snapshot.

Restore these bytes beneath LaunchedModule.WZVAL_configDirPath/savegames/skirmish
in an initialized native engine, then use ordinary F8. Validate a fresh command
reply, native clock, HQ, roster and input readiness before testing. The original
fixture has six constructors; delete them from the saved droid.json only when
explicitly testing an empty roster, then produce a replacement normally.

Use early simulation time for isolated production/construction checks. The
previous extended journey reached HQ defeat in round 4; do not reuse that ended
match or interpret its stale command snapshot as a healthy test environment.
