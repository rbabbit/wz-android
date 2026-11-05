# Compact controls and quiet construction UI

Frozen fallback: v5.5 APK/source/checksums in C:/timerApp, commit 1b1fc9f.
Baseline reproduced on the owned no-audio emulator-5556: full-field Preparing
overlay, oversized BUILD heading, central instruction panel and permanently
expanded field controls. The native truck form is underneath the central panel.

Approved: hide Warzone's native interface during placement, with a Map control
restoring the minimap; keep the original engine and native queues/blueprints.

- Remove centre narration, instruction panels and routine success pop-ups.
- Use quiet card-level busy feedback; prevent native UI flashes during setup.
- Compact power/truck row; no repeated BUILD heading.
- Collapsed unit-controls icon on compact screens; all commands remain usable.
- Give the build list the full left height when compact controls are collapsed.
- Current construction first, then the next site/count; visible scroll affordance.
- Selected card matches the active native placement tool and clears on exit.
- Real emulator: former panel area accepts terrain taps, native FIFO/completion,
  Map/placement returns, expand/collapse, movement/STOP/BOX/PATROL, repeated menus,
  keyboard and two viewports. Inspect the exact clean delivery APK and screenshots.

Findings during iteration:
- Warzone's Tab switch also skips the native construction-menu processing that
  commits build orders. Rejected that approach after actual orders failed.
  Placement instead extends the real iframe viewport below the clipped host;
  native truck/radar widgets remain outside the visible field while processing
  continues. SDL and terrain picking use that same unscaled viewport.
- Compact commands initially became inert in a capture-phase microtask before
  their release handlers ran. Collapse now waits until after the event dispatch.
- Completed activity rows must not retain a stale remaining-time estimate.
- Visual review caught Warzone's native display-scale recommendation on the large
  viewport. Initialize only those scale-tip preferences before native startup;
  preserve unrelated notification preferences and critical game messages.
