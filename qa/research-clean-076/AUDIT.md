# Research cleanup 0.76: scope and checks

## Before changes

The user's Screenshot_20261114-135521.png and approved code-rendered mocks show
the existing Research catalogue surrounded by a duplicate heading/power total,
five wide Lab-labelled tabs, category filters and a bottom current-lab/Up Next
block. The requested cleanup recovers that space for technologies and retains
the existing selection/assignment line.

Read paths: the shared `warzone-mobile-research.js`, its polished Research
stylesheet, all four entrypoint bindings, the separate footer/status reader and
the command pages. Towers, FFA, Campaign and Multiplayer all use this renderer;
the hidden Duel uses its legacy branch. Main Queue covers construction and
manufacturing rather than supplying a second research editor. The requested
bottom Research block is hidden visually; its underlying native queue/state
handlers and DOM dependencies are retained.

Related issue found: a hidden category could still filter the catalogue through
existing state/public calls. The compact screen must normalize these requests
to ALL so no topic becomes inaccessible behind a removed control.

## Focused checklist

- Preserve the exact delivered v0.75 APK and complete source before edits.
- Remove the inner heading/total power, category row and bottom lab-detail block.
- Keep numbered lab icons, actual lab IDs and descriptive accessibility names.
- Use recovered height for the scrolling catalogue; retain reachable batch and
  assignment controls with long names, errors and enlarged text.
- Preserve actual art/costs, active and queued indicators, thin progress and
  in-place updates without replacing touch targets on progress ticks.
- Check active/queued inspection, multi-topic selection, rejection/sync state,
  category reset, native ID reorder, lab removal and save/player reset behavior.
- Cover Towers, FFA, Campaign and Multiplayer; keep Duel and other UI unchanged.
- Verify the successful versioned APK build, signing, source/asset parity,
  frozen native libraries and complete-source archive preservation.
- No emulator, ADB, live multiplayer, GitHub or VPS operations.

Host/browser fixtures are synthetic native-event inputs. They do not execute
native gameplay or establish Android rendering/touch behavior. Passed check
details and screenshots are recorded in the sibling JSON/browser evidence;
the final exact-build recorder and package record identify delivery bytes.

## Observed focused results

38 host function cases passed against the actual shared renderer/functions.
24 host-browser mode/layout cases passed, plus a legacy Duel isolation check.
Root inspected the normal Towers view, compact Multiplayer view and Campaign
batch-selection/error captures: numbered laboratory images, recovered list
space, active/queued shading and reachable assignment are visible. The browser
fixture uses a historical gameplay screenshot as an unmodified background; it
does not represent a running engine or Android UI.

The clean Gradle build succeeded. The exact v0.76 APK recorded by the build
verification has SHA256
`f721b44b4426be2b380b0082af5d4505c45cee649745e0f11232759bcb1e3210`.
No emulator or device was used. Archive/package preservation is checked by the
separate strict delivery packager rather than inferred from these UI results.
