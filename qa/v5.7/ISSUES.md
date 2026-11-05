# Tower Defense replacement checklist

Frozen fallback: v5.6 APK/source/checksums, commit eabdebb.

- Load supplied Tower Defense rules/config once; stop loading Survival modules.
- Preserve the supplied ZIP and source; retain the original map and mobile controls.
- Connect HUD/Skip to the original timed schedule, including surviving enemies.
- Verify exact cost-based rewards, recipient, no friendly/feature payout and no double credit.
- Preserve authored roster/counts/ranks, enemy research delay, HQ defeat and round-30 victory.
- Verify manual research, native construction/queues, design/production, movement, menu returns.
- Check Save/Load once with native state and a bounded recovery path.
- Test the exact delivery APK on the owned no-audio emulator; inspect screenshots and engine state.
- Disclose native combat coverage versus scheduler/fixture checks; package only after relevant checks.
