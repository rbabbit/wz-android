# Research lab sidebar correction

User screenshots (223106, 223117, 223127) show the issue: Labs 1, 2 and 3
are selected in turn; NOW RESEARCHING and UP NEXT change, but the top right
card remains Hover Propulsion, queued in Lab 4.

Code cause: the upper right card reads the independently selected catalogue
topic; the rest of that sidebar reads activeLab. Both contexts occupy the same
panel. Active research may also be absent from the available-topic catalogue.

Fix/check list, before implementation:

- Dedicate the right sidebar to the selected lab: current topic/image,
  progress/time and ordered waiting topics, including clear empty/idle states.
- Keep catalogue browsing and its Add-to-Lab action together in the centre,
  with the destination lab explicit. Browsing Hover must not replace another
  lab's current job on the right.
- Test four labs with distinct active and waiting topics, repeatedly switch
  labs, retain Hover in the catalogue preview, change filters and reopen Tech.
- Confirm the right sidebar follows native completion/queue advancement and
  compare visible names with actual native research targets.
- Inspect the real emulator screenshots at the user's short viewport and a
  compact viewport; verify queue controls and battle returns remain usable.

Frozen v5.3 APK/source fallback hashes were reverified before changes.
No engine, stock assets or scenario research rules need changing.
