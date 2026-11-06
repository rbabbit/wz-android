# Building interaction audit — 6 November 2026

Audit only. No application source, assets, engine files or APK were changed or rebuilt.

## Environment and checks

The existing owned emulator was updated from v6.1 to the delivered v6.2 HTML/CSS APK, preserving app data. Installed APK SHA-256 matches the delivery exactly: a5f66ed5b9af0b3240b33a0d3841e88f47c07f6a86ca49d042d7f77a425976cb.

Iron Valley, fresh ordinary game, six authored constructors. No granted units, power, research or edited world state. Emulator: 2400 × 1080 pixels, density 240, SwiftShader software graphics. Timing observations apply to this emulator.

Checked: BUILD followed by an item tap without waiting for native setup; first bunker activation; real terrain tap and accepted native order; repeat selection of the same bunker; change to guard tower; bunker completion; MAP return; normal EXIT. Android ADB touches drove UI actions. CDP read state and sampled the viewport/frozen overlay; it did not replace game handlers. Simulation was left paused and the sampling timer stopped.

## Observed issues

1. **Placement changes the size of the battlefield.** The iframe changes from 1600 × 664 to 1600 × 896 CSS pixels; the actual engine canvas changes from 2400 × 996 to 2400 × 1344 pixels. Existing buildings visibly enlarge and shift. MAP return restores the smaller viewport. No zoom-wheel events or zoom commands were recorded during this cycle. The direct cause is setNativeHudHidden in warzone-command-pages.js, which adds 232 CSS pixels to iframe height to put the stock controls below the clipped surface. This is a rendering viewport resize, producing the reported zoom effect.
2. **Structure selection visibly freezes gameplay presentation.** The first activation held the copied battlefield frame for approximately 4.0 seconds. Trusted real button clicks on the already selected bunker and then the guard tower each took approximately 2.0 seconds until the freeze overlay was gone and selection was ready. During both freezes the native frame count and simulation clock continued advancing. beginPlacement covers the canvas with a captured frame while native picker selection, command replies and frame barriers complete. Even selecting the same item repeats this process.
3. **Looking at the minimap interrupts placement.** The native minimap is below the clipped viewport during placement. MAP exits placement, clears the chosen native item, restores the smaller viewport, and leaves the catalogue open. Choosing a structure again repeats the selection handoff and viewport enlargement. This adds steps and another view change to the building flow.

## Actual building result and limits

The bunker at tile (12,48) was accepted, travelled to and built by the ordinary western truck group (IDs 160011, 160005, 160003). The native save confirms PillBox1 structure ID 160191, position [1600,6208,128], currentBuildPts 400, health 1120. The two selection changes did not stop that construction.

Guard-tower selection was tested; a second tower was not placed/completed. A read-only preview rejected (13,48) as an invalid site. Other sites passed preview but were outside the visible view; a manual pan changed the camera and was not counted as automatic camera movement. The audit stopped trying that fixture. Automatic exit immediately after a completed order was not established because the selected item had changed; the observed return was the real MAP action.

Known software-emulator black terrain was present and is outside this audit. No physical-phone timing claim or wider gameplay regression claim is made.

## Evidence

- [Before building](01-ready.png)
- [Placement ready — visibly larger buildings](03-pillbox-ready.png)
- [Bunker building while guard tower is selected](06-change-tower.png)
- [MAP return](09-map-return.png)
- [Native engine save after construction](native-after-build.json)
- [Sampled viewport, freeze, state and trusted input timeline](timeline.json)
- [Installed APK identity](installed-apk.json)
