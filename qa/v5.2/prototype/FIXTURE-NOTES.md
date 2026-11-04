# Test setup corrections

These were diagnosed separately from delivery game bugs:

- The copied native QuickSave restore experiment failed to recreate the custom scenario script context. It was abandoned; final flow tests use fresh sessions. This pass does not certify native Save/Load.
- Rebuilding a fifteen-truck group through one factory was too slow and could mix in late production from another factory. The final group test reuses three original local constructors, adds ten real native constructors with the stock debug clone command, disables debug mode, and normally produces two more. Ordinary design/constructor production is tested independently. Remote constructors were removed during setup before the recorded reused fixture started.
- The first facility test incorrectly treated the original 3x3 Factory as a 2x2 footprint. The revised test validates a known native 2x2 Research Facility site and tests Factory Module placement on a real existing Factory.
- The old BOX rectangle used stale projections and fractional tile assumptions. Final tests reactivate terrain observation, project current native positions, and check actual native selection and movement.

The dropped edge constructors were a genuine game UI bug, not a fixture problem: a single radius around an edge truck selected twelve of fifteen in one local area. Connected local grouping was implemented and the final native test expands from one edge truck to all fifteen, assigns every truck real queued work, completes all three chosen structures and clears placement.

The camera-following constructor selection was also a real bug: the sleeping terrain observer retained the previous view. Waiting for a fresh render fixes it; the final compact camera-switch test selects both distinct local groups after changing views.

A further genuine completion bug was caught on the C11 compact integrated pass (APK 0918895d17f29e007d06c7bc0851eca091799851df7a3dec9858ae499a8047c9): all three native orders existed, but placement closed during an inter-order idle snapshot. The native save showed two towers at 400 points and the last at 10, with constructors still building. C12 requires 1.2 seconds of continuously idle native simulation time, resets that barrier when input/work/travel resumes, and is rebuilt and retested as the delivery artifact. The new deterministic regression covers the transient gap, resumed work, pending input and paused simulation; the native compact retest completed all three before placement closed.

The first C13 edge fixture sampled truck movement too early with a fixed 3.5-second delay. Actual native movement later reached tile 8,47 with a 13-tile span; the product selection code was unchanged. The corrected fixture validates the destination and polls native positions until the old radius is exceeded. A subsequent manual debug-input recovery opened native options and paused the reused session; that setup was abandoned after defeat. The final native group pass starts fresh, validates QuickSave and all six initial constructors before preparing units, and runs the remaining checks automatically without further manual debug input.
