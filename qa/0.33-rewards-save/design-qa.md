# Warzone Towers 0.33 — Rewards and Save visual QA

Candidate APK: `9988786994ef4ee9b3c426bd4af690a9e6f382a94bbeed0dfc351546c51cf0f7`.

## Visual truth and comparison method

The selected target is the first revised direct-tap mock,
`qa/0.33-rewards-save/selected-mock-source.png` (1920×819). The user's subsequent
explicit refinements override that image: remove its large REWARDS heading and
instruction line, move Gain to the top, and leave nothing in a footer. No
quantity controls or separate BUY action are permitted. The native Home
Selected-stock popup preserves the existing allocation control without a
purchase footer.

The source and actual implementation were opened together in a combined
multi-image comparison input; no generated reconstruction or synthetic app
capture was used as implementation evidence. Full-view comparison uses
`delivery-home-user-phone.png` (2400×1080, density 420 dpi, font scale 1.0), and
`delivery-game-user-phone.png` at the same 2400×1080, density 420 dpi/font scale
1.0 configuration. The
mock and phone capture have slightly different aspect ratios and different
backdrops/content states, so drawer proportions and hierarchy are compared,
without stretching either image or claiming a pixel-for-pixel backdrop match.

Additional actual captures cover the short 800×480 landscape display,
density 240 dpi/font scale 1.3 (533×320 dp logical viewport). They include
`home-rewards-first.png`, `home-owned-chooser.png`, `home-partial-owned.png`,
`home-insufficient.png`, `game-rewards-compact.png`, `save-immediate-feedback.png`,
`save-acknowledged.png` and `saved-game-reloaded.png`.

## Findings by fidelity surface

- **Typography:** the existing native Oswald family is retained for headings,
  full item names, prices and compact actions. The large standalone Rewards
  title is absent. All four fortress names and costs remain readable on the
  inspected phone Home and short Home/in-game captures. The denied purchase's
  message wraps within its row at larger text without hiding an action.
- **Spacing and layout:** the phone drawer occupies approximately 38% of screen
  width. On the short phone its 330 dp minimum intentionally uses more width to
  retain readable rows and practical touch targets; this is a responsive
  exception to the mock's percentage. Gain, conditional Privacy and balance
  share one top row, followed by categories and the item catalogue. The
  instruction, quantity controls, BUY section and footer are absent. Four
  fortress entries are visible together. The Selected popup's zero, one and
  two choices fit inside the short viewport in `home-owned-chooser.png`.
- **Colors and states:** the continuous dark navy surface, white text and teal
  accent remain consistent with the selected direction. Selection is one
  restrained row tint. Unaffordable costs are subdued; a failed tap reports the
  shortage inside its row. No new separator-line system, raised card stack or
  bright advertising banner is introduced.
- **Artwork:** the actual native GIF game thumbnails and existing crystal/play
  assets are used. Their purple framing and item identity are retained. They
  are not substituted with newly generated or approximate fortress drawings.
- **Copy and controls:** Gain 10 Crystals is visible at the top. Item rows show
  their name, crystal price and Stored/This match count. Home Selected counts
  remain distinct from purchasing. There is no Tap-an-item instruction. Privacy
  remains a small conditional top action until a later settings redesign; it
  is not in a footer or an invented Home gear.
- **Save:** the actual small-screen captures show immediate SAVING feedback and
  the disabled control, followed by SAVED only after native persistence and
  phone archive acknowledgement. The root's reports also show a successful
  second save after menu return and loading of that exact saved slot with its
  native reward allowances intact. These are focused save observations, not a
  full gameplay test.

No actionable P0/P1/P2 mismatch remains in the inspected Rewards/Save captures.
The full-size in-game capture confirms the same compact row hierarchy and
complete four-item catalogue as Home, with no heading or footer. Its companion
`delivery-phone-saving.png` and `delivery-phone-saved.png` show the Save states
on the user-phone-sized viewport. Full-view images made the affected regions
readable without a separately resampled crop; popup and Save states were also
opened at their actual capture resolution.

## Iteration history and boundaries

Root identified two implementation failures during earlier iterations: the
owned-allocation popup could clip on short screens, and periodic generic HUD
refresh could re-enable SAVE during a pending save. Both were fixed before the
current candidate. Current popup and SAVING captures show the revised behavior;
the 8 extracted-HUD VM groups and 9 save-protocol groups are supporting source
checks, not native-runtime or paint evidence. Earlier 31df/8feb/final-* captures
are excluded from the current accepted evidence set.

The emulator's black terrain was present before this task; native engine/map
assets remain frozen against v0.32. The existing native QuickSave console line
can appear during saving and is unchanged. No overall terrain, combat,
all-map, full-HUD accessibility, physical-device or live-ad acceptance is
claimed. The short game header can wrap; this report evaluates the affected
Rewards and Save controls rather than approving every unchanged HUD region.

## Implementation checklist

- [x] Match the selected direct-tap direction and explicit latest refinements.
- [x] Inspect native Home and short-screen Home/in-game Rewards.
- [x] Inspect popup, partial allocation and insufficient-funds states.
- [x] Inspect actual immediate and acknowledged Save feedback and reload report.
- [x] Inspect the real Google test-ad return and privacy form return.
- [x] Inspect final phone-size in-game capture/report on this exact APK.
- [x] Bind final original-data and environment restoration observations.
- [x] Receive root's final evidence confirmation and freeze this report/proof.

Root confirmed restoration after the final checks. All 97 original app-private
files match their initial bytes before relaunch, including wallet 195, saved
games, designs and Google consent preferences. Display size, density, font,
network state and the temporary installer setting are restored; see
`original-data-restored.json` and `environment-restored.json`. These operational
checks do not expand the limited visual/gameplay acceptance scope above.

final result: passed
