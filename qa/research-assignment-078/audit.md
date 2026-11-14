# v0.78 scoped issue/check list

The supplied phone screenshots show queued Research mixed into the available
catalogue and Android's keyboard covering the bottom Design name field.

Source inspection confirms the main Research catalogue deliberately merges
available topics with every lab's assigned topics, while the selected-lab detail
panel is hidden. Merely exposing that panel would also risk presenting local
pending queue intent as confirmed native work. The new layout must preserve
native IDs, selected lab, batch selection and acknowledgement handling.

Design's editable name is placed at the bottom of the component picker. The
activities use a scaled game WebView and suppress ordinary WebView scrolling,
so normal focus scrolling cannot be relied upon to reveal this field. A compact
editor near the top must remain usable with a shrinking or overlay keyboard.

Focused checks: four modes, numeric lab selection, available-only catalogue,
current real art/progress, ordered confirmed/pending queues, removals/failures,
completion, long lists, compact landscape, draft editing/save/cancel and input
restoration. No emulator or real Android keyboard checks are authorized.

The immutable v0.77 APK/full source hashes are recorded in fallback-0.78.json.
