# v5.5 construction sidebar checks

Baseline: frozen v5.4 / e0c8250. The existing BUILD page covers the battlefield;
its catalogue scrolls together with surrounding content and has no live site
timing. Native placement retains an obsolete purple builder-card window, masked
by the existing opaque command panel. Research and the engine remain unchanged.

- Replace BUILD with the selected left sidebar, using actual Warzone artwork.
- Scroll only the structure catalogue; keep category, queue and exit accessible.
- Keep the field controls, top bar, minimap and placement area unobstructed.
- Show observed construction activity and simulation-time remaining estimates;
  freeze estimates during travel, power waits, idle workers and native pause.
- Preserve native multi-truck selection, Ctrl queue, green blueprints, modules,
  invalid-site rejection, STOP and exit-with-orders.
- Check structure switching, dynamic availability and repeated Build / Design /
  Factory / Queue / Research / battle returns including keyboard restoration.
- Inspect wide and compact emulator screenshots and native saves on the exact
  delivery APK. Validate actual progress/completion, orders and unit movement.

Limits: public native scripts expose health/status/action, not currentBuildPts.
Remaining time must be labelled approximate. Emulator black terrain is the
existing recorded baseline; no physical-device or HQ-terrain claim is implied.

Delivery verification passed on the exact APK; see REPORT.md and delivery-gate.json.
The mixed-size journal matching failure was fixed and retested. Explicit timing,
physical-device, rendering and Save/Load limitations remain in REPORT.md.
