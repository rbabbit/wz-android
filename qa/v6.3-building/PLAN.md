# Scoped building fixes

Fallback: C:/timerApp/_backups/towers-v6.2-before-smooth-building-20261106; APK and complete source match existing delivery checksums.

Reproduced issues: placement changes the engine viewport, captured-frame cover freezes battlefield presentation, minimap access cancels placement. Evidence: ../v6.2-build-audit/AUDIT.md.

Scope: building selection, validated placement and queued construction only. Reuse existing queue-build validation and real engine order functions, retain the live engine viewport and native minimap. No research, production, design saving, combat, maps, engine or Android UI redesign.

Focused checks before delivery: real BUILD then immediate item tap; same-item reselection and placement; rapid mixed-item placements and actual FIFO completion; minimap navigation retains selection; no viewport changes/frozen overlay or zoom commands; exit preserves orders; Build returns after help/menu and keyboard; reachable/blocked and module sites; both authored maps; actual phone-sized viewport. Use the existing emulator and native saves. Validate fixtures and wait for observed native orders/completion. Install and verify the exact delivery APK, then preserve its complete source and checksum record.
