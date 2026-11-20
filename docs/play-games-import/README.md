# Play Games achievement import

This local preparation tool packages the 18 approved achievements from the app's `play-games-definitions.json`. It does not create Google service IDs or contact Play Console. Titles, descriptions, types, targets and points come from that single catalogue.

Prepare the import files from the repository root:

```powershell
python tools/prepare-play-games-import.py --output C:\timerApp\play-games-09914-20261119
```

An optional `--icon C:\path\existing-512.png` copies an existing 512 × 512 PNG unchanged and uses it for each achievement. Without that argument the import contains metadata only. No compliant existing source icon was identified: the launcher icon is 192 × 192, the logo is 483 × 228 and the branding image is 1254 × 1254. The tool does not create or resize artwork.

Google's [official bulk-import guide](https://developer.android.com/games/pgs/integrate-achievements#zip-file-guidelines) specifies a flat ZIP with required `AchievementsMetadata.csv` and optional icon mappings/images. CSV files have no header. Each metadata row has seven columns:

```text
Name,Description,Incremental value,Steps Needed,Initial State,Points,List Order
```

The tool emits `True` or `False`; incremental targets are integers up to 10000; standard targets are blank. Entries start `Revealed`. Points are multiples of five from 5 to 200. Names/descriptions contain no commas. Files stay below 1 MB. Optional icons must be 512 × 512 PNG. `AchievementsIconsMappings.csv` rows contain the achievement name and icon filename.

Upload only `Warzone-Play-Games-Achievements.zip` through this game's Play Games Services → Achievements → Import achievements, then choose **Save as draft**. Avoid importing duplicate entries. The separate `achievement-key-mapping.csv` connects app keys to Console names; `achievement-resource-mapping.json` records resource-name aliases without service IDs. Neither belongs in the ZIP. Leaderboards need separate Console configuration; the generated CSV is manual reference only, and each app mapping must identify its exact mode/map/difficulty classification.

After import, export Google's Android resources XML and run the explicit local mapping command below. This creates a separate configuration file for review; it does not edit the app asset or contact Google:

```powershell
python tools/import-play-games-resources.py --xml C:\path\google-export.xml --mapping C:\timerApp\play-games-09914-20261119\achievement-resource-mapping.json --output C:\timerApp\play-games-09914-20261119\play-games-with-real-ids.json
```

If an exported resource uses a different name, supply `--names C:\path\names.json` with exact entries such as `{"campaign_first_mission":"achievement_first_mission"}`. The tool requires a unique real exported ID for every achievement and retains existing leaderboard mappings. Applying the result to the app asset is a separate explicit action. No Google IDs have been imported yet.

No browser control, Console changes, publishing, application launches or tests are part of this task. Import acceptance and runtime behavior remain unverified.
