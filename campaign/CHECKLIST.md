# Separate campaign test APK

Towers v5.4 was verified clean and pushed to GitHub at
e0c8250e644e3bf74140450c597110904415e65a before this worktree was created.

Audit findings before changes:

- Original Alpha/Beta/Gamma missions, scripts and maps are packaged already.
- The Android launcher forces the Towers skirmish/lobby and waits for waves.
- The command/research/camera bridge is loaded only by the Towers scenario.
- The wave/defeat UI and fixed starting camera are specific to Towers.
- Campaign events have their own namespace; original mission hooks, objectives,
  research availability and enemies must remain intact.

Implementation and emulator checks:

- Different application ID/name and save directory; coexist with Towers.
- Campaign frontend supports original New Campaign and Load Game controls.
- Include the mobile bridges in campaign contexts without replacing the stock
  event handlers or changing original objectives, enemy rules or research.
- Campaign status/Intel replaces wave controls; retain the mobile commands,
  factory, design and corrected selected-lab Research screen where available.
- Exercise Alpha startup, actual unit selection/movement, construction,
  production/research when unlocked, menu returns and native save/load.
- Inspect actual screens and native state on the exact delivered APK. Report
  any unverified chapters/features explicitly; do not certify the entire story
  from one opening mission.

Preserve official engine/WASM and the complete Towers data prefix; campaign
overrides are append-only source assets. Frozen Towers deliverables stay intact.

Observed results, fixture corrections and explicit unverified scope: `qa/campaign-v1/REPORT.md`.
