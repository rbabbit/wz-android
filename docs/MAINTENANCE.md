# Restore and continue modding

## What is saved

The working Android source, Gradle wrapper/JAR, packaged engine JS/WASM/data,
custom rules, original supplied map/mod ZIP plus extracted copies, generated map,
toolbar icons/fonts/notices, selected icon/splash, all project tools and the full
`qa/` directory are tracked in Git. No Git LFS download is needed for a build.

`archive/releases.json` inventories every attached retained APK/source archive,
three fresh pre-change fallback ZIPs, HQ archive/manifest/notices, extra evidence
and the latest Block Night v3.2 precursor APK/source. Older Towers versions are
attached wherever files exist locally; no missing v2.1 source archive is invented.
Backup metadata and per-file manifests are under `archive/fallbacks/`. Identical
backup APKs point to the matching original release asset rather than duplicate
uploads. The supplied three-image diagnostic ZIP is in the extra-evidence ZIP.

Generated Gradle/build caches, machine-specific local.properties, temporary live
CDP addresses and private signing/SSH credentials are excluded. They are not
source dependencies. SDK/JDK/Node/Python are installed on the receiving machine.
The original project README is preserved as `docs/PROJECT-HISTORY.md`.

## Restore a frozen delivered build

Download the desired APK and source ZIP from Releases. Verify the complete-file
SHA-256 against `archive/releases.json` or `archive/SHA256SUMS.txt` before use:

```powershell
Get-FileHash .\Warzone-Towers-v4.5.apk -Algorithm SHA256
```

To restore a pre-change fallback, download its `*-current-source.zip` and the
matching APK; the original folder's metadata is in `archive/fallbacks/`.
Extract into a new directory and set the local SDK/JDK path. Do not overwrite a
newer working tree just to inspect an older version.

The original v4.5 frozen source ZIP contains the original PC-specific tool paths.
The main Git branch has portable tool paths; use Git for ongoing development.

## Build and edit boundaries

The already-packaged engine is included, so Android builds do not need to
recompile C++ or download the HQ archive. Run the root Gradle wrapper after SDK
setup. Match the exact delivered APK using its download/hash, rather than
assuming a fresh debug build is byte-identical.

Modify Android wrapper classes or wrapper assets directly. Modify custom game
rules in `scenario/`, then run `tools/embed-warzone-towers.ps1` before building.
The embedder appends changed custom records and redirects metadata; repeated
runs grow the data file. Save a fallback and review payload changes deliberately.
Do not hand-edit official engine code, stock textures or original mod files.

`vendor/engine/upstream-reference.json` pins upstream Warzone 4.7.0. The release
reference ZIP holds that upstream Git tree; submodules are not expanded. For a
full upstream development checkout use the official repository, checkout the
pinned commit and run `git submodule update --init --recursive`. This is separate
from maintaining the Android wrapper and supplied custom scenario.

## Optional HQ download and hosting

- Current pack: `https://krishna.org.uk/game/graphics/hq-v3/high.wz`
- Manifest: `https://krishna.org.uk/game/graphics/hq-v3/manifest.json`
- VPS public directory: `/srv/krishna-library/game/graphics/hq-v3/`
- Recovery copy: `high.wz` plus manifest/notices on the v4.5 GitHub release.
- Pinned size: 99,639,408 bytes. SHA-256 is in the manifest and archive catalogue.

The app uses the URL, size and SHA in `GraphicsPackStore.java`; it does not
trust the remote manifest to silently select a different pack. Android stores
verified graphics privately in `files/graphics/hq-v3/high.wz`; interrupted bytes
are `high.wz.part`. The wrapper loader exposes the unchanged archive through the
engine's existing terrain-override path. Native config selects mode 1 or 2.
Changing hosts requires a deliberate URL change; preserve checksum validation.
No VPS credential is needed to build or play. Hosting credentials remain private.

## Tests and live debugging

Run every `tools/test-*.cjs` from the repo; there are ten regression suites.
`tools/verify-project.py` checks the imported snapshot's tracked-file manifest.
After an intentional code/content edit, regenerate it with `--refresh`.

Live scripts support ADB, ANDROID_HOME / ANDROID_SDK_ROOT. Most newer helpers use
WZ_QA_DEVICE for the target serial; inspect older scripts before using them.
Start an isolated AVD with `-no-audio`. Refresh `tools/live-cdp-url.txt` from the
chosen WebView's /json debugger endpoint after navigation/process restart; do
not commit that temporary file. The debug activity also accepts graphics_probe
for native archive-read evidence. Document actual runtime limits, not just passes.

`tools/package-v4.py` packages the current version after the built APK has been
copied to the versioned filename beside the project, as described in its source.
