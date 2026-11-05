# Single item tap

Fallback v5.8 APK/source hashes checked; branch starts at dc3792e.

Reproduced in v5.8: immediately after BUILD, buildingOpening=true and the
PillBox1 (MG bunker) button is disabled. The user's first item tap is ignored
while the hidden native truck picker is running. Prior tests waited for that
setup before tapping, so did not cover the reported rapid sequence.

Check BUILD then one MG-bunker tap without waiting; exact native PillBox1 order
and completion; nearest group despite a distant prior selection; item changes;
one-constructor and zero-constructor native rosters; accepted orders and exits;
compact/standard/large screens. Native readiness alone is not proof of the
chosen building: inspect actual saved native orders.
