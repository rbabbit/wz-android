# Android dependency licence audit — 0.96 About test

Read-only audit completed 18 November 2026 against the exact 0.95 release model. No project, device, dependency or publication changes were made by this audit. The parent is implementing 0.96 without dependency version changes.

## Evidence and scope

- Frozen source: `C:/timerApp/candidates/hub-replay-test-0.95-20261118`.
- Actual release package/runtime classpath: `app/build/intermediates/lint_vital_report_lint_model/release/generateReleaseLintVitalReportModel/release-artifact-dependencies.xml`, `<package>` section. The union of compile/runtime libraries contains 70 coordinates; **69 are actual runtime coordinates**. The obsolete compile-only `listenablefuture:1.0` was excluded from the final inventory.
- All 69 original AAR/JAR artifacts found and hashed. Only exact runtime artifact filenames were inspected, excluding source/Javadoc JARs and compiler/build/test tooling.
- All 69 Maven POM licence declarations resolved. Missing cached POMs were read from Google's official Maven endpoint or Maven Central and stored only in this audit directory. Guava/failureaccess licence declarations were resolved through the exact parent POM.
- 24 distinct licence/notice source entries were extracted from runtime archives (some are JSON offsets). The deliverable bundle uses the readable text documents, with exact SHA256 and origin recorded.
- `dependency-licence-inventory.json`: complete coordinates, versions, artifact/POM paths, SHA256, archive-member evidence and declared licences.
- `dependency-notice-bundle.json`: final offline document names, bytes, SHA256, provenance and official links.
- `dependency-licence-texts/`: **24 documents, 4,531,410 bytes**, ready for copying into About assets. Every full text is copied byte-for-byte from the matching distributed artifact or the component's tagged official source; only `ANDROID-DEPENDENCIES.txt` is a generated explanatory inventory.

## Findings and page wording

1. **Do not label the complete APK or all SDKs as GPL.** Warzone's engine/content notices belong in their own sections. Google Mobile Ads, Google Play services and UMP POMs use the Android Software Development Kit License declaration. Their open-source components retain separate notices. The official Mobile Ads terms page points to AdMob terms. This audit does not establish legal compatibility of all combined software or certify release compliance.
2. AndroidX WebKit 1.18.0, the other AndroidX runtime components, Kotlin standard library 2.2.10, Kotlin Coroutines 1.8.0, Guava 31.1-android and related annotations use Apache-2.0 declarations. Checker Framework qualifiers 3.12.0 use MIT.
3. **Kotlin has additional applicable JVM standard-library notices.** Its tagged licensing inventory identifies ThreeTen-derived `kotlin/time` code (BSD-3-Clause), Boost-derived JVM math functions (Boost Software License 1.0), and GWT/Guava-derived code (Apache-2.0). Full relevant texts are included. Compiler-only ASM/Rhino and Kotlin test-data licences are not classified as Android runtime dependencies.
4. Cronet 500.1.0 supplies its own 445,003-byte aggregate notice. The vendored `vendor/cronet-500.1.0/LICENSES.txt` matches that exact distributed notice (SHA256 `df9654cc9b0879e04fbe5ad8e0e12fc8c1932384bab15c89af6080a86c48a5c3`). Keep the full notice available offline; a Chromium hyperlink alone omits bundled component terms.
5. Google AARs include substantial aggregate third-party notice texts. The bundle preserves them verbatim, including Google Mobile Ads, Ads API, UMP, Advertising ID, App Set, base/tasks/measurement/basement and HSDP. Identical measurement-base and measurement-sdk-api text is stored once with both origins. JSON offset/index metadata is retained in the audit inventory but does not need to be shown as a licence page.
6. Use a short landing section plus readable document links. Suggested groups: **Android open-source components**, **Cronet and Chromium**, **Google SDK terms and third-party notices**. A generated version inventory can remain a separate full-text document so 69 dependency rows do not dominate About.

## Declared runtime licence counts

These counts describe POM declarations, not a relicensing decision:

- 49 coordinates declare Apache-2.0 (normalizing spelling variants).
- 17 coordinates declare Android SDK licence terms. This includes auxiliary Cronet modules; their umbrella distribution's component-specific notices remain authoritative as supplied.
- 2 Cronet umbrella coordinates declare Chromium and built-in dependency licences.
- 1 coordinate declares MIT (Checker Framework qualifiers).

## Verified primary references

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
- [AndroidX source](https://android.googlesource.com/platform/frameworks/support/) and [WebKit release documentation](https://developer.android.com/jetpack/androidx/releases/webkit). Exact WebKit POM: `https://dl.google.com/dl/android/maven2/androidx/webkit/webkit/1.18.0/webkit-1.18.0.pom`.
- [Chromium licence](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/LICENSE). Exact bundled-version notice copied from the actual AAR instead of today's main branch.
- [Kotlin 2.2.10 licensing inventory](https://github.com/JetBrains/kotlin/blob/v2.2.10/license/README.md), including its JVM ThreeTen, Boost, GWT and Guava references.
- [Coroutines 1.8.0 licence](https://github.com/Kotlin/kotlinx.coroutines/blob/1.8.0/LICENSE.txt).
- [Guava v31.1 COPYING](https://github.com/google/guava/blob/v31.1/COPYING).
- [JSpecify v1.0.0 licence](https://github.com/jspecify/jspecify/blob/v1.0.0/LICENSE).
- [Checker qualifiers 3.12.0 licence](https://github.com/typetools/checker-framework/blob/checker-framework-3.12.0/checker-qual/LICENSE.txt).
- [Mobile Ads SDK terms](https://developers.google.com/admob/android/terms), [Android SDK terms](https://developer.android.com/studio/terms) and [UMP documentation](https://developers.google.com/admob/android/privacy).

This is a technical provenance/notice inventory. No dependency was removed or replaced, and no claim of complete legal clearance is made. Native engine/WASM and game-content auditing is handled separately by the content audit.
