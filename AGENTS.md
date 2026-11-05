# Warzone Towers maintenance rules

- Preserve the official engine and stock assets. Do not hand-edit compiled
  engine JS/WASM or the original data prefix. Custom scenario changes belong in
  `scenario/`, then use `tools/embed-warzone-towers.ps1` to append and reindex.
- Preserve `vendor/survival/original/survival_mod.zip` and the supplied original
  map/mod. Add explicit custom overrides rather than silently replacing them.
- v5.7 explicitly replaces the active Survival rules with the user's supplied
  `vendor/tower-defense/original/WZmodTowerDefense-v4.7.0-a.zip`. Keep its extracted
  files byte-identical. Mobile adapters observe the authored schedule and rewards.
  Use `tools/verify-tower-defense-package.py` for this authorized migration.
- Before gameplay/input/layout work, save the current tested APK plus a source
  snapshot and SHA-256 manifest as a fallback. Existing release assets are frozen.
- Run the relevant regression scripts and build. For input/startup changes,
  exercise the real Android WebView, including repeated actions and returning
  from overlays. Start test emulators with `-no-audio`. Do not disturb another
  running emulator session.
- Do not claim gameplay, tablet compatibility or HQ visual quality based only on
  build success, a config label or mock tests. Preserve the explicit limitations
  in `docs/KNOWN-ISSUES.md` until a genuine device test resolves them.
- The user controls research topics and queues. Do not add automatic research or
  change the supplied enemy roster without a new explicit request.
- Keep original icon/splash artwork unless a change is requested. Downloadable
  official HQ terrain is optional; Normal must stay usable without the download.
- Keep credentials, signing keys, local SDK settings and temporary CDP endpoints
  out of Git and release archives. Public VPS paths/manifests are documented.
- After scenario data grows, make the delivery APK with a clean Gradle build.
  Incremental packaging can retain a large unused ZIP gap. Compare payloads and
  rerun the relevant installed-APK verification before packaging the source.
- In emulator audits, wait for the Android keyboard to be visibly open before
  sending Back. Otherwise Back can exit the Activity. Wait for images and the
  actual viewport/camera before asserting layout or sending world taps.
- Confirm pause with the frequently updated native wave clock, not a cached
  command snapshot. Exit the build tool normally before synthetic Escape;
  Escape may close a native picker instead of pausing. Preserve accepted orders.
- Legacy custom-path rules failed native QuickLoad context matching. v5.7 uses
  the canonical rules/init.js entry and mirrored command JSON paths. Validate
  fresh native command replies and restored round state after any load; do not
  mistake a stale cached snapshot for a working bridge or repeat a failed load.
- Archive upload checksums are in `archive/`; after intentional edits regenerate
  the repository file manifest with `python tools/verify-project.py --refresh`.
