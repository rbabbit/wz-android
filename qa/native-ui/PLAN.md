# Towers native Android interface migration

Authorized 2026-11-06: abandon 1v1 work; properly fix Towers with genuine Android
views. Work is on `codex/towers-native-interface`, based on clean
453d034914d5ca6e570eb077e1308efb7878d77f. The tested v5.12 APK, complete source,
SHA-256 manifest and restore instructions are preserved at
`C:/timerApp/_backups/towers-v5.12-before-native-ui-20261106`.

## Reproduced baseline and issue/check list

Actual installed v5.12 was inspected on owned emulator-5556. Existing native
startup was set to Normal graphics and Music off through its real controls.
Iron Valley started with six original trucks in two disconnected local groups,
four labs, two factories and the authored 180-second preparation timer. Screens
and baseline bridge state are saved here; no units/power/research were granted.
The match is observably paused between work groups.

- Header, field commands and wave/Skip Wave controls: HTML/CSS/JS.
- Research: HTML shell with lab/category/catalogue/current topic/queue areas;
  native Android accessible-node names alone do not prove native views.
- Design, persistent blueprint library, factory and orders pages: HTML/CSS.
- Build catalogue, queue summary, placement masks/freeze and messages: HTML/CSS
  or HTML canvas; engine still owns accepted construction orders/blueprints.
- Help/settings/control-size UI: HTML/CSS; startup, pack downloads, music,
  loading and results are already Android views.
- Selection, BOX, patrol, STOP, nearby truck groups, camera, radar, native
  keyboard returns and FIFO handoffs are coupled to these screens and must be
  checked together. No repeated fifteen-truck fixture is necessary.

## Architecture and truthful boundary

Use Android View/ViewGroup, ListView/GridView, Spinner, EditText, ProgressBar,
PopupMenu and dialogs for app-owned gameplay presentation. The interface is
measured in Android dp/sp and honours system font size without scaling the UI
as part of the engine viewport. Reuse original artwork and icons.

Keep the official Warzone WebAssembly/WebGL engine, maps, Towers mod, enemy
schedule, manual research and existing command/research queue logic. JavaScript
is still necessary for transport, engine input and data; it must not render the
converted app UI or require hidden HTML buttons to make native controls work.

The battlefield, radar, in-engine messages/blueprints and stock engine menus
(including pause/save/load) remain Warzone-rendered in WebView. They are not
Android-native screens and will be described explicitly as engine UI. Existing
black terrain on the software emulator is an independent renderer limitation.

## Work groups

1. Separate data/command/research logic from DOM rendering, preserving tested
   native engine build selection/readiness/FIFO handling. Add a bounded typed
   Java↔JavaScript request bridge and incremental state publication.
2. Native header/waves/field controls, responsive layout and game viewport.
   Convert app input feedback, placement/freeze presentation and native back.
3. Native research and production, lab/factory selection, manual exact queues,
   quantity, power/availability/waiting/completion and return behaviour.
4. Native design/blueprint persistence, validation, editing/save-as-new/delete,
   researched-part availability and native keyboard/focus restoration.
5. Native build/orders/help/settings, all construction return/selection paths,
   two-map fixtures and native wave/Skip Wave checks.
6. Stabilize related fixes with focused tests, then check complete journeys on
   the exact delivery APK, inspect screenshots AND actual engine state/orders,
   and package the APK and complete source with checksums.

## Verification contract

- Prove actual Android view instances with native hierarchy/diagnostics; do not
  rely only on WebView accessibility virtual-node class names.
- Assert converted HTML UI roots are absent and their styles/renderers are not
  installed. Keep JavaScript data/engine bridges explicitly documented.
- Native controls must not rebuild under a finger, erase edited text, reset
  selected lab/factory, hide queued orders, or lose focus after the IME closes.
- Validate actual viewport, footprints, reachable sites, unit IDs/positions,
  save readiness and native pause time before longer tests.
- Check multiple selections, accepted mixed FIFO, repeat-item readiness, normal
  production, saved blueprint process restart, repeated menu/keyboard returns,
  camera/radar/BOX/pan/pinch/tilt, both maps and compact/enlarged-text layouts.
- Diagnose fixture failures separately, change a repeatedly failing approach,
  and preserve prepared states. Keep idle sessions paused and bound recovery.
- Never mark complete from a build, mock or script alone. Record remaining
  failures/limits explicitly; no public upload is authorized by this task.
