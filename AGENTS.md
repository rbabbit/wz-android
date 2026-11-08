# Warzone Towers maintenance rules

- 2026-11-08: user corrected the full Factory selection to OPTION 3, then resumed
  work with go. Implement on `codex/towers-factory-0.13`: slim family/factory
  roster, one deduplicated recipe list, quantities and row Produce, compact
  current/waiting strip with expandable ordered queue and secondary phone menu.
  Preserve every saved phone alias, native factory ID, FIFO job, cost and timing.
  Remove NEAR/BATTLE/MAP buttons from Towers, retain BASE. Add locally grounded
  HOW TO PLAY in Help using only this project's actual game, without web lookup.
  Keep 1v1 and both footer sidebars unchanged. Preserve complete 0.12 fallback in
  `C:/timerApp/fallbacks/towers-before-factory-0.13-20261108/` and older versions.

- 2026-11-08: implement approved footer Research option 1 and Production option 1
  as 0.12 on `codex/towers-status-0.12`. Preserve complete 0.11 APK/source in
  `C:/timerApp/fallbacks/towers-before-status-0.12-20261108/` and all older versions.
  Footer Research is a live lab/current-topic sidebar with estimated bars only;
  footer Production is a current-unit sidebar with vehicle/cyborg family tabs,
  original component art and live activity, without queues or invented progress.
  Top TECH/FACTORY remain full pages. Owned completed world labs/factories open
  the corresponding full Towers page for that native ID before stock input.
  Keep 1v1 unchanged. Native/scenario additions are read-only observations only.

- 2026-11-08: the user approved all three compact Towers mock screens and their
  shared visual language for Build, Research, Factory, Design, Saved and Queue.
  Develop this as 0.11 on `codex/towers-ui-0.11`, preserving the complete 0.10
  APK/source fallback. Support dynamic five labs plus five vehicle and five
  cyborg factories with reachable selectors and stable selected native IDs.
  Preserve the 1v1 feature and its current UI/rules for later; scope new markup
  and styles to Towers. Keep the engine, scenarios, maps, saves and phone design
  library intact. Never invent production ETA/progress or a 3D design preview.

- The user saved Towers 0.9 as the immutable benchmark before adding an offline
  human-versus-bot mode. GitHub `main` and `v0.9-benchmark` point to
  `28fe51dc5725d5262b0302de10776ae1a37eb994`; preserve its APK, complete source,
  checksums and older fallbacks. Combined-mode development belongs on
  `codex/offline-duel-0.10` until separately accepted.
- The new Duel mode is offline: human chooses Cannon or Rockets; the bot uses
  the opposite branch, with shared core upgrades and a Command Centre objective.
  Keep Towers rules, map/mod, original runtime/index/mobile/data paths unchanged.
  Duel gets its own generated package/index/entrypoint and config/save directory,
  sharing the frozen native program/WASM. Replacing package metadata in a copy
  through the reviewed builder is allowed; assert normalized program identity.
  Do not manually edit compiled program code or apply Duel policy to Towers.
- Duel's bot may research, build and attack autonomously as requested. Human
  research stays manual. Enforce its weapon policy in native research, design,
  production and queued execution, retaining ordinary costs/times and keeping
  stored phone designs intact. Do not add mid-match bot grants or online play.

- User accepted 0.6 as the current/main version on 2026-11-07. Continue from
  this project; the directory and Android app ID retain their historical lab
  names to preserve installed saves/designs. Do not rebuild or rename the APK
  merely to promote it. Keep the frozen 0.6 APK/source hashes, previous releases
  and the separate v6.4 fallback project intact.
- The complete native source tar is stored with a narrow Git LFS rule. Run
  `git lfs pull` after cloning before checking the full source manifest. The
  release's attached source ZIP contains the full bytes without requiring LFS.
- Preserve the official engine and stock assets. Do not hand-edit compiled
  engine JS/WASM or the original data prefix. Custom scenario changes belong in
  `scenario/`, then use `tools/embed-warzone-towers.ps1` to append and reindex.
- Scoped 0.5 exception, authorized by the user's structure-preview fix: rebuild
  the matching 4.7.0 engine from source with only the queued-blueprint visual
  centre correction. Preserve original source/patch/build recipe and paired
  generated JS/WASM provenance. Reapply existing package/output adapters through
  a reproducible tool; keep stock data, real orders and foundation rules intact.
  This does not authorize manual edits to compiled code or changes to v6.4.
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
- Exercise BUILD followed immediately by one item tap; waiting for hidden
  setup first masks dropped taps. Confirm the requested structure ID in actual
  native orders/completion, not merely a generic build-ready callback.
- Repeating an active item must also reconfirm native placement. Focus/native
  QuickSave can close the engine tool while the cached ready flag remains true.
  Test repeat-item placement and mixed-item FIFO orders. Do not insert a native
  save between activation and a world tap without reselecting the item afterward.
- Native FIFO handoff can briefly look idle before the next foundation appears.
  Verify the final requested structure/completion, not one idle sample. Queue
  display interruption also requires sustained idle in simulation time.
- Legacy custom-path rules failed native QuickLoad context matching. v5.7 uses
  the canonical rules/init.js entry and mirrored command JSON paths. Validate
  fresh native command replies and restored round state after any load; do not
  mistake a stale cached snapshot for a working bridge or repeat a failed load.
- Archive upload checksums are in `archive/`; after intentional edits regenerate
  the repository file manifest with `python tools/verify-project.py --refresh`.
- Both selectable maps use the unchanged supplied Towers mod. TD1 is the exact
  NoQ td1_v3 archive (four starts; human position 0, native Ready y=30). Existing
  TD2 uses human position 1 (Ready y=70). Do not assume one lobby row for both.
- TD1's construction trucks live on raised platforms disconnected from the HQ
  route. Validate reachability and native height before field taps; use the
  authored 63x79 scroll bounds to fit its rectangular radar, not a square hitbox.
- Startup download tests must distinguish on-device music.data from the WebView
  music-v1.data route. If transfer is too fast to cancel after a hierarchy read,
  use a disclosed verified-prefix fixture and prepared native Cancel coordinates.
- Dustfall and Iron Valley are UI names for td1 and td2. Keep map IDs, native
  authored names and data unchanged. Preserve the original official splash PNG
  and logo; the generated concept screenshot is a reference, not a UI asset.
- Native footer controls keep at least 48dp touch height. Inspect compact and
  narrow/enlarged-text layouts, graphics popup dismissal and Music/Back returns.
