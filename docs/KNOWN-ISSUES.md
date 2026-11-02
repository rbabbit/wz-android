# Known issues at the v4.5 import

1. **+Q selection:** an unrelated map tap can deselect the selected defence,
   requiring the truck/defence setup again. This was reported after the prior
   sticky-building tests; it is not resolved by those older passing tests.
2. **Physical Samsung tablet:** an earlier APK installed but reported that the
   battlefield was not ready in time. Updated physical-device startup has not
   been confirmed. Do not describe emulator testing as tablet certification.
3. **HQ appearance:** the official pack is downloaded, checksum-verified,
   mounted and read by the engine with terrainMode=2. The emulator has black
   terrain in both Normal and High Quality, including software rendering.
   Visual improvement needs confirmation on a rendering-capable device.
4. **Small startup screen:** 1280x532 and 1280x800 were inspected. The 800x360
   capture was taken during a resize and discarded; further display changes were
   blocked by automatic approval review. A stable compact-phone check is pending.
5. **HELP device-specific issue:** v4.4 hardened the return path and passed real
   repeated Android tap/scroll/return tests, but the user's exact disappearing-UI
   report was not reproduced on the emulator. A physical-device retest is needed.

See the versioned `qa/` reports for exact conditions, results and screenshots.
