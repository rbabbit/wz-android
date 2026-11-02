# Warzone Towers 4.2 fullscreen verification

final result: passed

Version: 4.2-fullscreen, code 42. Tested on the Pixel_10_Pro API 36.1 emulator,
WebView 158.0.8127.2, host GPU, audio disabled. Native display 2560x1600,
WebView 1280x800 CSS pixels. This does not establish physical Samsung S8 support.

## Changes

- The Android wrapper now opens mobile.html, a same-origin host with a real
  50px command row and a full-width engine iframe. The unmodified engine renders
  at the iframe's actual dimensions. Canvas scaling/translation was removed.
- Existing Java bridge scripts run in the engine iframe. Toolbar actions retain
  engine focus; TECH collapses the command row while open; HELP covers the host.
- The Android virtual viewport allows at least 642x482 for the engine plus the
  command row, preserving support for short landscape displays.
- A native fullscreen ImageView uses CENTER_CROP. The panoramic splash extends
  the selected green-field scene to 2172x724, keeping its central tank, tower and
  title while allowing side scenery to be clipped. This is an artwork adaptation,
  not a byte-identical reuse of the square image. The launcher image is unchanged.

## Evidence

- fullscreen-splash-tablet.png: actual native engine-loading screen, full-screen
  artwork and readable bottom status, no grey sides or blurred filler.
- splash-crop-phone-20-9.png and splash-crop-tablet-4-3.png: QA previews of the
  same centre-crop calculation. These are crop previews, not physical-device tests.
- viewport-results.json: live WebView dimensions 1280x800, 1182x532, 1024x768,
  642x532. At each size the frame starts at x=0, uses the entire width, and its
  canvas fills the engine viewport. Render-buffer aspect ratio matches display.
  Toolbar controls fit, parent and child remain cross-origin isolated with SAB.
- At every temporary viewport, TECH opens with the command row collapsed and
  returns to the correct full-width battlefield. HELP fits, scrolls and closes.
  Three final resize events leave the native viewport at 1280x750 below the bar.
  The adb screenshots retain the complete emulator surface: smaller CDP test
  viewports occupy its upper-left region. Unused outside area is test-only.
- gameplay-results.json: actual adb taps selected a truck, enabled +Q, selected
  Heavy Machinegun Guard Tower once and queued three world placements. One
  completed during the initial wait (humanPower=100); a later snapshot confirmed
  two completed (humanPower=200) and Wave 1 active with four enemies.
- Toolbar zoom retained armed +Q. CLOSE/MAP/BATTLE commands were acknowledged,
  BATTLE ended at 2600, and the facing count stayed one. Real adb swipe produced
  one pan with 16 native movement updates, no held key or active gesture left.
- Medium Body - Cobra was explicitly queued in LAB 1. The queue was acknowledged
  in 142ms, with no rejection, timeout or bridge error. Back to Battle restored
  the full-width 1280x750 engine canvas at host y=50.
- Nine existing regression scripts passed, covering touch/sticky input and zoom,
  research queue validation, incremental logs, waves, AI targeting and HQ defeat.
- Native crash log was empty during the final check. The existing streaming-WASM
  warning falls back successfully to ArrayBuffer instantiation.

## Boundaries

The emulator shows dark terrain with its host GPU. The saved v4.1 native gameplay
capture shows the same behaviour before these fixes. This release corrects
viewport/splash layout; it does not claim to fix that existing rendering issue.
Phone/tablet sizes were checked through temporary WebView emulation, without
changing the emulator's display settings. Physical Samsung S8 startup is pending.

## Preservation and packaging

See preservation-results.json for the APK asset comparison with v4.1 and official
engine hashes. The supplied mod/map and scenario scripts remain unchanged.
Source backup excludes local.properties, build caches and the live debugger URL.
