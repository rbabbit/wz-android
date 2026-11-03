# Known issues and verification limits

1. **+Q physical retest:** v4.6 corrects the unrelated-tap input path and verifies
   actual native queues for one and six trucks, two defence types, rapid taps,
   occupied/edge/held taps, cancellation, tilt, minimap and HELP/TECH returns.
   STOP is acknowledged by the native scenario and clears the selected trucks.
   These cases passed on the emulator; the user's tablet still needs a retest.
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
6. **Music sound output:** original albums/audio are checksum-verified and the
   native engine opens and streams selected Opus tracks. Emulator testing uses
   `-no-audio`; speaker/headphone quality has not been assessed.
7. **Performance:** v4.6 removes repeated Android layout requests and avoids
   treating minimap finger drift as a camera drag. This emulator can still have
   long cold-start/render stalls. It does not establish a frame-rate guarantee
   for physical devices or resolve its pre-existing black-terrain issue.

See the versioned `qa/` reports for exact conditions, results and screenshots.
