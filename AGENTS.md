# Warzone Towers maintenance rules

- Preserve the official engine and stock assets. Do not hand-edit compiled
  engine JS/WASM or the original data prefix. Custom scenario changes belong in
  `scenario/`, then use `tools/embed-warzone-towers.ps1` to append and reindex.
- Preserve `vendor/survival/original/survival_mod.zip` and the supplied original
  map/mod. Add explicit custom overrides rather than silently replacing them.
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
- Archive upload checksums are in `archive/`; after intentional edits regenerate
  the repository file manifest with `python tools/verify-project.py --refresh`.
