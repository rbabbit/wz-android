# Warzone 2100 Android website

The completed website at https://wz2100.uk contains Home, Campaign, Towers,
Free for All, Multiplayer, Guide, Hub and Download pages. It uses real Android
screenshots and adapts to phone, tablet and desktop viewports.

## Build and preview

Python 3.8 or newer is sufficient. The build and preview tools use only the
Python standard library; no package installation is required.

```sh
python tools/build.py --offline
python tools/preview.py
```

Open http://127.0.0.1:8796. Use `--port 8800` to choose another local port.
Serve the site over HTTP; opening the HTML directly does not resolve its
root-relative asset links.

`--offline` builds with the bundled `release.json` snapshot. Run
`python tools/build.py` to refresh that snapshot from the official public
release feed before generating the pages. The browser also refreshes the
same-origin release metadata when a page opens.

The HTML generator is `tools/build.py`. Edit `dist/site.css` and `dist/site.js`
directly; the build preserves them and the bundled assets. Screenshot captions
and dimensions come from the portable `asset-manifest.json`. Change
`CSS_VERSION` in the build script when releasing a stylesheet update.

## Publish

Only the contents of `dist/` are public website files. The package includes all
38 files from the completed publication. The hosting root must also provide the
existing `/downloads/warzone/latest.json` feed and
`/downloads/warzone/warzone2100-andriod.apk` download. The filename spelling is
retained for compatibility. The APK is hosted separately and is not bundled.
The local preview redirects APK requests to the live public download.

The included release snapshot is version 0.86, 616662059 bytes. Live metadata
and the existing download endpoint remain the authority for later releases.
See `verification.json` for the recorded desktop checks and package validation.

## Attribution

Android edition by rbabbit, based on the Warzone 2100 project. Real screenshot
appearance may vary by release and device. Third-party notices and inherited
licence texts are in `THIRD-PARTY-NOTICES.md`, `licenses/` and
`dist/assets/Oswald-OFL.txt`.
