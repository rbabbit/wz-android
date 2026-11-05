# Selected splash implementation checklist

- Preserve verified v5.11 APK/source/checksums before edits (verified).
- Reproduce current startup: right-hand panel, generic numbered map labels,
  previous green illustration. Selected target is the official heavy-armour
  mock with the footer and simple rounded rectangular Play button.
- Use original jorzi backdrop6 and bundled official logo, not generated art.
  Preserve proportions and the vehicle silhouette when adapting square artwork.
- Display Dustfall for td1 and Iron Valley for td2 only; keep actual map IDs,
  original map bytes, engine and Towers mod unchanged.
- Test direct map tabs and dynamic Play text, graphics popup, uncached HQ
  blocking/Normal recovery, progress/Cancel/error and cached HQ states.
- Test music chooser/default-zero behavior, explicit choice, Back and restart
  persistence. Keep startup, music and loading artwork consistent.
- Inspect native 1080x600, 1280x576 and 1600x720 screens, plus a narrow landscape
  layout and enlarged text. Check safe margins, clipping and 48dp touch targets.
- On the delivery APK, launch both actual map cards, confirm native dimensions,
  starts and live Towers state; check build/item and related menu/input returns.
- Compare selected visual target and native screenshots together, including
  footer details. Resolve substantive visual/input failures before packaging.
