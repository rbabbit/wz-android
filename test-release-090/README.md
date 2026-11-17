# INCOMPLETE LOCAL TEST CHECKPOINT

Runtime validation remains incomplete. Read AUDIT.md and RUNTIME.json before testing. No publication is authorized.

# Complete Warzone Towers0.90 TEST source

This archive retains EVERY member of the complete0.89 source ZIP, its original
compressed local-record bytes and historical engine/source/media inputs. The
test-release-090 profile adds the exact current test sources and native builds.
Extract the ENTIRE ZIP and keep google-play-release, normal-release-089 and
test-release-090. The archive root initially represents historical source;
apply the test profile before building the current APK.

    python test-release-090/prepare-and-build.py --apply-only
    python test-release-090/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK

The wrapper prepares retained normal0.89 first, then0.90 with SHA256 guards.
Full repeated application and interrupted mixtures of exact root/Play/normal89/
test90 bytes are supported. Unrelated local edits and changed override/profile
sources are refused before mutation. Copies are not an atomic transaction;
preserve unrelated work separately. Private signing keys/passwords, local SDK
settings, SSH keys and emulator userdata are excluded. Use the existing normal
publisher key (certificate4499efe0...), not the Google Play upload key. Builder
password prompts do not echo. --online permits dependency downloads; otherwise
cached Gradle dependencies are used. Output: app/build/outputs/apk/release/app-release.apk.

Version0.90/code90 is a LOCAL TEST APK. No AAB, VPS/feed/website, GitHub or Google
Play publication is performed or authorized by this profile. User testing and
explicit approval of this exact build are required before later publication.
Historical publication records/tools remain historical and are not test gates.

ALL COMBAT is a requested persistent mode: white on black#000 while OFF, green
on black#000 while ON. Native selection covers all owned eligible combat units
across the map and new production; explicit OFF deselects combat units safely.
Builder/menu/input suspension preserves requested ON. Selected horizontal health
bars and white brackets are removed. Unselected hover/status and structure/build
progress remain unchanged. No camera pilot, data/map/media or protocol change.

After application, vendor/native-090/BUILD.md and CONTRACT.md document the exact
three native lineages, shared policy, source deltas, warm-cache commands and
header-safe cold bootstrap. Six full JS loaders and three WASM files are paired;
all aliases are regenerated from their matching raw programs. Cold wrappers were
syntax checked, not rebuilt from fresh dependencies. Objects, redundant generated
data/HTML and host executables are excluded from the overlay.

VALIDATION.json, APK-INTEGRITY.json, RUNTIME.json and AUDIT.md contain exact test
APK/runtime identity and explicit fixture/environment limits. JSON/PNG runtime
evidence is exported only from the report's explicit hash-bound list; raw native
saves, full userdata and private host keys are not bundled as evidence. Restore
checks are source-only and do not replace actual Android gameplay verification.
