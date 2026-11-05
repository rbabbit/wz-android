# Warzone Campaign Test

Separate test application, based on the saved Towers v5.4 source.

- Android package: `com.rbabbit.warzonecampaign`; installs alongside Towers.
- Keep the original splash artwork, Normal/HQ choices and Music selector.
- START GAME launches original Alpha campaign mission 1 (`CAM_1A`).
- Original campaign missions, objectives, enemies and research unlocks are retained.
- Mobile Build, Design, Factory, Queue and Tech pages are reused. INTEL opens
  original intelligence; MENU opens the native pause/save/load controls.
- Original tutorial popups still work. Mobile pages yield to native pauses.
- Saves, downloaded preferences and blueprint storage belong to this separate app.
- Each app launch starts mission 1; use MENU / Load Game to resume a saved campaign.

Build with JDK 17+ and Android SDK 36: `gradlew.bat assembleDebug`.
After intentional mobile mission bridge changes, run `python tools/embed-campaign.py`
before building. It appends assets and indexes them without changing the official
engine/WASM or original package prefix. Do not use the Towers embedder for this branch.

See `qa/campaign-v1/REPORT.md` for observed test coverage and remaining limitations.
The historical Towers documentation and evidence below this branch are retained.
