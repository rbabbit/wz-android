# v5.4: selected-lab research sidebar

Tested APK SHA-256:
`07b81acec83421999770912e304abcbffe058bdfcafdb685865281f3a26b3057`.

The reported mismatch was caused by two independent selections being rendered
inside one sidebar. The upper card displayed the catalogue technology, while
the progress and waiting list displayed the selected lab.

The right sidebar now belongs entirely to the selected lab: its heading,
current research image/name, time/progress, total item count and waiting list
update together. Idle labs clear their previous image and name. The catalogue
preview, costs and Add-to-Lab action sit beneath the centre list, with the
destination lab explicit. Browsing Hover no longer replaces another lab's
research details on the right.

## Real emulator verification

The installed APK was checked at the user's 1280×576 WebView viewport and at
1080×600, using real Android taps and native research targets.

- Four ordinary labs ran different technologies with one waiting topic each.
  Hover remained selected in the catalogue and queued in Lab 4 while Labs
  1–4 were repeatedly selected. Each lab's current image/name and waiting
  technology appeared together on the right, with `2 ITEMS` total.
- Native QuickSave structure targets were compared with all four lab topics.
- Category filtering and Build/Factory/Tech returns retained the lab context.
- Hover was removed from Lab 4's waiting list and added back through the new
  catalogue action; its destination was checked after acknowledgement.
- Lab 2 completed HEAT Cannon Shells Mk2 and advanced to High Temperature
  Flamer Gel Mk3. The right sidebar followed the new name/image, showed an
  empty waiting list and changed the total to `1 ITEM`. Native completion and
  the next research target were captured.
- The compact pass checked all four labs, filters, visible catalogue actions,
  Standard/Extra large wrapper controls and battle returns.

Evidence: [Lab 1](short/lab-1.png), [Lab 2](short/lab-2.png),
[Lab 4 with Hover waiting](short/lab-4.png),
[automatic advancement](short/lab-2-advanced.png),
[native initial targets](short/labs-native-started.json),
[native advancement](short/labs-native-advanced.json),
[delivery gate](delivery-gate.json).

The setup initially rejected an incorrect fixture topic spelling. A subsequent
physical tap landed on a catalogue row that had moved as research started;
the setup was corrected to verify the previewed name and destination, and
wait for the started topic's catalogue update before its next tap. These
attempts are not counted as passing runs. The recorded passing run validates
all eight topics before assigning work.

## Preservation and limits

The original engine/WASM, complete data package and custom scenario rules
are unchanged from frozen v5.3. No free research, cloned units or debug game
state was used. The v5.3 APK/source fallback remains frozen.

Research times remain labelled estimates. Existing emulator black-terrain,
physical-device, HQ appearance, audio and general Save/Load limits remain;
see [KNOWN-ISSUES](../../docs/KNOWN-ISSUES.md). This release audits the affected
research journey and related returns; it does not claim a new full-game audit.
