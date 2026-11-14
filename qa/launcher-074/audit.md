# Launcher fit review before v0.74 edits

User approved Home mock 3 and FFA mock 1 with smaller buttons; explicitly no emulator tests.

- FFA's native full-page stack reserves 56dp for its header. At 800x360dp,
  its three 48dp rows, gaps, map minimum and padding exceed the remaining height,
  putting Start below the viewport. Reserve Start separately in the split layout.
- FFA map card height follows the longest unbounded description in its group.
  Keep the preview independent of text; constrain/scroll only supplementary facts.
- Preserve real map previews, swipe selection, group changes, map count/arrows,
  Cobra difficulty, Start, Back and existing FFA saved games.
- Home currently positions three modes and a separate utility row manually.
  The approved design places all five destinations on a single compact row beneath
  the existing logo and tank, with the version at bottom right.
- Use inset-safe bounds and content-sized FFA button faces with normal touch targets.
  Retain fallback layouts for compact windows and enlarged fonts.
- The cyan volume control in the supplied FFA screenshot is Android system UI.

Validation: actual pure Java geometry/helpers, retained font metrics, code review,
successful Android build and exact package/source checks. No emulator, Android
view execution or gameplay verification is authorized for this release.
