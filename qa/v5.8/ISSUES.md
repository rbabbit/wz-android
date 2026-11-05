# Build transition smoothing

Fallback v5.7 APK/source/checksums verified before changes. Branch starts at c0e4c29.

Baseline on emulator-5556, real Android taps and compositor frames:
- Seven UI actions rebuilt the entire catalogue 15 times.
- Changing the selected structure hides then reopens the sidebar.
- Busy spinner insertion moves the truck counter and dims every card.
- Placement resets the engine viewport from 664 to 896 CSS pixels and back;
  exit reveals that resize without a matching visual transition.
- Trucks selection closes placement then opens/closes the native builder UI.

Check: Build open; first item; change item/category after scrolling; Trucks;
explicit Exit/Select-Move/Map; queued orders preserved; automatic exit; native
completion and movement; compact and larger screens; related menu returns.
Record stable card identity, sidebar visibility and composited transition frames
on the exact delivery APK. Keep native widget processing active during placement.
