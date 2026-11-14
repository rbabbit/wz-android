# Native Intelligence bridge and real rotating preview

The full `hci.cpp` overlay preserves the original native code and the earlier
display/research/camera fixes. It adds a Towers-marker-gated helper at the end of
`intDisplayWidgets()`, plus reset calls at native interface initialization and
shutdown. The UI hook runs during native pause/menu frames as well as gameplay.
The full original native archive is unchanged. `source-overlay.json` and
`native-intelligence.patch` bind the exact source delta to its original entry.

The custom HTML panel owns layout and input. This bridge never opens the stock
Intelligence screen or sends camera/unit/research commands. It reads actual
completed-player research flags, native report/message state, localized authored
`VIEWDATA.textMsg`, upgrade `results`, component/structure unlocks and replacement
records. Selecting a report marks only its native message read, just as the stock
report UI does. No research progress, upgrade, gameplay, queue or save format is
changed. Minor topics with no report return an empty description; no text or
effects are invented. Initial-grant labels are known only when captured during
the first native frame at game time <=1000; load/init resets this inference.

## Transient request contract

Write `/tmp/warzone-towers-intelligence-command.json.tmp`, then atomically rename
it to `/tmp/warzone-towers-intelligence-command.json`. Read the response from
`/tmp/warzone-towers-intelligence-state.json` and match `nonce`. These files are
outside persistent saves/configuration.

```json
{"nonce":"unique-request","action":"select","topicId":"R-Vehicle-Body05","rect":{"x":400,"y":180,"width":390,"height":270},"playAudio":true}
```

Actions:

- `open` / `list`: return completed history; `open` resets the previous report.
- `select`: return selected details and enable the preview when a valid `rect`
  is supplied. Omitting `rect` allows details-first layout.
- `layout`: update the selected completed topic/rectangle silently.
- `heartbeat`: keep an open panel alive; send about every 600ms. The 2500ms lease
  closes the preview and owned stream after a lost/backgrounded UI.
- `replay`: replay the selected category report when `playAudio` is true.
- `highlight`: optional original native hover cue when `playAudio` is true.
- `close`: retire preview/audio, optionally playing the original window-close cue.

The response always includes `nonce`, `ok`, `gameTime`, native `viewport` width and
height, and `preview` status. Errors use `error` such as `not-open`, `native-menu`,
`topic-not-completed`, or `invalid-rect`. History entries contain actual ID/name,
icon, category/audio path, major/report/message/read flags, model availability
and nullable `initialGrant`. Details add `description`, raw native `results`,
`unlocks` and `replacements`. The `preview` records active topic/rectangle, frame
count, native real time, close reason and the original 2000ms rotation period.
Close/lease/menu retirement also publishes inactive state without a fresh request.

Map CSS coordinates to native UI units using response viewport dimensions and
the actual game canvas DOM rectangle. Validate/recalculate after resizing. Await
close acknowledgement and a paint before removing the HTML cover/hole.

## Native rendering and sound

The preview calls the unchanged `mapdisplay.cpp::renderResearchToBuffer()` with
the actual completed `RESEARCH`. Its native component/structure/PIE models, scale
rules, faction/team appearance and two-second rotation are reused. A fitted
238x168 virtual UI projection renders into the requested native GL viewport; it
does not replace the model with a bitmap or enlarge its geometry. The wrapper
uses scissor clipping and an opaque black underlay, restoring GL viewport,
scissor enable/box, depth range, UI video-buffer dimensions and geometric origin
before returning. Retired rectangles are cleared before a paused scene is exposed.

User-requested playback uses the existing `sequenceaudio/res_droid.ogg`,
`res_weapons.ogg`, `res_com.ogg`, `res_pow.ogg`, `res_systech.ogg` or
`res_strutech.ogg` according to the original Intelligence icon mapping. It stops
only the report stream it owns, including an AL-paused stream. Existing native
research-completion voices remain in `researchResult()` and are not replayed by
this helper. Original native open/select/highlight/close cues are optional.
No model, soundtrack or audio pack is duplicated.

## Rebuilding and evidence

```sh
python3 tools/build-native-intelligence-036.py --workspace /absolute/empty/workspace
```

The shipping candidate was built incrementally from the verified v0.35 cache;
only `hci.cpp.o` compiled before the native link. The first source compile needed
the renderer-state header added; it did not install a runtime. Build/integration
records in `qa/0.36-intelligence` disclose that correction separately. The matched
JS/WASM pair is integrated with `tools/integrate-native-intelligence-036.py`,
retaining every v0.35 authored VFS byte/index and exact existing worker hook.
Intelligence adds no VFS entry. Demolish integration is audited independently.

Compilation and source/protocol fixtures do not establish native rendering,
gameplay or visual acceptance. Those require the exact-APK emulator observations.
