# v6.2 HTML/CSS return and phone templates

Version65 /6.2-html-templates. The preserved v5.12 HTML/CSS layout is active
again. The current v6.1 native APK and complete source were copied and verified
before changes under C:/timerApp/_backups/towers-v6.1-before-html-return-20261106/.
Original delivery files and the older v5.12/v6.0 fallbacks remain unchanged.

## Scoped changes

1. Acknowledged research, command, Skip Wave, Stop and camera request files are
   replaced with inert payloads while preserving newer requests. Native loaded
   waiting queues reconcile into the HTML state without issuing research.
2. Patrol is armed only with a destination. Mode changes, Stop and navigation
   cancel delayed shortcuts/orders and any still-armed Patrol input.
3. In-flight research edits remain protected from unrelated/old acknowledgements
   and snapshots until their own update is acknowledged.
4. Removed labs lose their cached queues; their topics can be assigned elsewhere.
   Laboratory selection follows the stable native ID through reordered snapshots.
5. A research unlock refreshes Design component options without clearing the
   draft's existing component or replacing the focused name input.
6. Battle results carry a per-battle session. Duplicate result callbacks reuse
   one panel; a later failure cannot replace victory. Old sessions are ignored.
7. Android Back closes the current HTML Research/Design/Factory/Build/help or
   engine menu, and sends native Escape only when back at the battlefield.
8. Factory cards provide SAVE TO PHONE. Saved templates appear in BLUEPRINTS
   with USE TEMPLATE, persist across games/app restarts and share the existing
   saved_designs_v1 private phone library. Existing custom designs are retained.
   Normal tank/system templates remain editable when their components are in
   the designer catalogue; native cyborg templates retain their original parts
   and can be reused without converting or discarding those parts. Production
   requires a currently available matching engine template or ordinary design
   validation, and retains normal factory/module/cost checks. Saving grants no
   research or units. The library limit remains100 entries. Uninstalling or
   clearing app data removes this private library.

## Verification boundary

User explicitly requested NO emulator testing. No emulator/device was queried,
installed, launched or used. There are no new gameplay/screenshots/FPS claims.

Passed: six JavaScript syntax checks; focused Node code regressions for inert
transport, queue races/load/removal, input cancellation, persistent template
round-trip and failed-write rollback, research gating/native cost, preserved
design drafts, results and Back; original design save/rename/copy validation
regressions against the active HTML module; clean Gradle build; APK signature
matching the existing updates; all457 source assets matching the APK.

Package comparison preserves the compiled engine/WASM, complete frozen v6.1
data prefix,35 original resources, restored original CSS/mobile host, and all
3276 other resolved virtual files. Only the custom command script's portable
factory-template production branch changes in embedded scenario data. The
engine HTML changes only its app-exit callback. Rules, maps and mod are unchanged.

Current code/package reports and their SHA256 values are listed in summary.json.
These are code-level checks, not real gameplay verification. Physical-device
behavior and the emulator's existing black-terrain limitation are not resolved
or verified by this release.
