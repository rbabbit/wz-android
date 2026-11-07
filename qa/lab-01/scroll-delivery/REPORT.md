# C5 — genuine Factory catalogue scroll proof

Passed on exact installed APK SHA-256
`6dafb70bff1dfec5614de3403b5e169f8d720c9507c6f612d0000de9ecf5118c`.
Actual profile: 1080x600, density240, system font1, Standard controls (scale1).
No app source or APK changes were made.

The original two-model catalogue did not overflow. This focused check used
the existing valid Lab Scout design and four real **SAVE AS NEW** UI actions,
each with native validation and normal phone persistence. The bounded library
therefore held six models. No DOM geometry was injected; no units, research
or power were granted, and no production/research orders were issued. The
complete ordinary early native checkpoint was restored before the check.

Observed results:

- Genuine Factory catalogue overflow: `scrollHeight - clientHeight = 198`.
- A real Android swipe moved it to `scrollTop = 198.6667`.
- Tapping the same actual factory rerendered the page and retained exactly
  that inner catalogue offset.
- Leaving through the Design/Blueprint Library UI and choosing **USE TEMPLATE**
  revealed Design 2 in Factory. Its Produce button was visible inside the
  catalogue panel and passed the actual screen hit test.
- The unrelated factory rail and queue-detail columns stayed at offset0;
  those columns did not themselves overflow in this profile. This does not
  claim a nonzero-offset test for them.
- The four new copy IDs were deleted through the actual Library confirmation
  UI. The original two-model private library was then byte-for-byte identical
  to its pre-test value. No other model was deleted.
- Native finished-unit records remained only the ordinary fixture's
  160191/160193; both factories remained idle with empty queues. Uncaught
  WebView runtime exceptions: zero.

Created and cleaned IDs:

```
design-1794009568274-1177
design-1794009570640-1184
design-1794009572941-1191
design-1794009575438-1198
```

The actual [scrolled catalogue](lab-factory-scrolled-before-selection.png),
[retained position after factory selection](lab-factory-scroll-retained-after-selection.png),
[visible selected template after returning](lab-scroll-blueprint-reveals-selected-factory-card.png),
[original two-model library after cleanup](lab-scroll-cleanup-preserves-original-two-models.png)
and [paused handoff](lab-scroll-handoff-paused.png) were visually inspected.
The native/geometry record is [audit-lab-scroll.json](audit-lab-scroll.json);
the final profile/native observation is
[handoff-profile-native.json](handoff-profile-native.json).

The emulator was handed back visibly paused on Iron Valley at native time
70502 in the same phone/Standard profile. Stable app data was never targeted.
