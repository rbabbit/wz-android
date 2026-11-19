# About & Licences normal test 0.96

The normal APK adds a small top-right Home About button and a native document-style About & Licences page. It uses system fonts, a restrained light background, readable links, offline full-text readers and native Back navigation. This is a local test delivery, not a Google Play compliance certification or a public source release.

Exact APK: `Warzone-Towers-0.96-Test.apk`, 731,578,179 bytes.
SHA256: `1f45fbd418ba24db6cdf0a07dffa32c19efac2680622881e592ed7646d765a92`.
Normal signer SHA256: `4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`.

## Audit and changes

- Actual 0.95 Home was inspected before edits; it had no About entry. The original APK/source remain preserved. The new candidate is isolated on `codex/about-licences-0.96-test`.
- Original Warzone GPL-2.0-or-later statement, linking exception and non-GPL notices are retained in full. Native library, music, map, font, icon and replay notices are inventoried separately. The component audit includes the retained native source archives and exact Android runtime dependency artifacts; it does not claim every optional source component is linked at runtime.
- There are 125 audited notice files, plus the generated project notice and catalogue. Original notice SHA256 values and sizes match their audited copies. All text files decode as UTF-8. All 46 catalogue document paths exist in the APK, within the reader's bound; all licence contents are retained without text truncation.
- Official Warzone site, upstream GitHub, Android repository, GPL and associated licence/source links are included. Of 36 links, 34 public references returned HTTP 200, the private Android repository is accurately labelled and was not tested anonymously as public source, and GNU's canonical GPL page reset/timed out from this host. The full original GPL is available offline.
- The dependency audit resolved 69 runtime coordinates and preserves exact aggregate Cronet/Google notices and relevant Apache/MIT/Kotlin BSD/Boost texts. Google SDK terms are distinguished from GPL rather than assigning one licence to the entire APK.
- All 2,046 previous APK game/replay assets remain byte-identical. Only legal assets were added. The 2,249 exact app/build input hashes remain pinned to the successful build.

## Observed exact-APK journey

The exact signed delivery bytes were installed over 0.95 in owned emulator-5562. Gradle assembleRelease and lintVitalRelease passed; the on-device complete base.apk SHA256 equals the delivered APK.

- Home About entry opened the serious native page. Native view bounds and screenshots supplied touch coordinates; no guessed in-game coordinates or seeded game objects were used.
- Opened the official Warzone site in actual Chrome, observed the loaded site, and returned to the same About overview scroll position. Chrome's first-run setup on the owned fixture was completed without adding an account. Long press on the Android repository link produced the actual OS clipboard preview with the exact repository URL.
- With both owned emulator network toggles disabled, opened and read GPL, original Warzone exception statement, content credits, Oswald OFL, the 416 KB native collection, 445 KB Cronet notice and largest 815 KB Google SDK notice. Scroll motion and retained text were observed. The hardware Back key and page Back button returned to the retained overview.
- Screens inspected at 2400×1080 and 1280×720. A fresh compact launch with font scale 1.3 verified the Home entry, document page and wrapped long reader title; controls and readable text remained available.
- Repeated page close/reopen and Towers map/Hub return paths restored working navigation. No unrelated gameplay suite was rerun for this document-only change.
- All seven original prepared save ZIPs match their initial SHA256 values before and after recovery. Network toggles, display size/density and font scale were restored, the external helper was removed, and ordinary non-instrumented Home/About/Back were observed after recovery.

## Unresolved points and limits

1. More Fortress 0.6's actual supplied archives do not declare a redistribution licence or author. Its provenance is recorded without inventing a licence grant. This needs resolution before a public distribution decision.
2. The Android repository remains private. This test includes matching complete source separately; an accessible versioned source distribution for the exact public binary must be arranged before relying on the repository link for public recipients.
3. External GNU page availability was not established from this host. Offline full GPL content was observed and independently hash-checked.
4. The optional Recents check did not pass. An instrumented launch did not retain a normal recent task; a later ordinary-launch Recents check stalled and the owned emulator host process exited. The cause was not established, and this is not counted as a successful app background test. Repetition was stopped; the same owned userdata was restarted without wiping, all seven save hashes were rechecked, and clean ordinary Home/About/Back plus installed identity were verified. No APK code was changed to work around the fixture.
5. Seven representative offline readers were exercised visually; every other listed document was verified by package/path/UTF-8/hash checks, not individually opened. No physical phone test, Google Play review or exhaustive legal clearance is claimed.

No VPS/update feed, GitHub, Google Play or website was modified, and no AAB was built. Emulator-5558 and retained 5560 data were not operated. Detailed records are in DELIVERY096.json and the component/dependency audits.
