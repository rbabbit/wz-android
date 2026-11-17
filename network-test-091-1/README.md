# EXPERIMENTAL LOCAL NETWORK TEST: FAILED OR INCOMPLETE

Read the exact sealed outcome in AUDIT.md and RUNTIME.json. No cellular success or publication is implied.

# Complete Warzone Towers0.91-network.1 LOCAL TEST source

This retains every member and original compressed source record of the complete
0.91 test archive (SHA25695260d19...). Extract the ENTIRE archive and keep every
retained profile. The archive root is historical; apply this network-test profile
before building the current test APK:

    python network-test-091-1/prepare-and-build.py --apply-only
    python network-test-091-1/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK --online

The wrapper applies retained test-release-091, then exact network overrides.
Full/repeated and interrupted known-state application is guarded by SHA256.
Unknown local edits, changed profile inputs and path escapes are refused before
source copies. Copies are not an atomic transaction; preserve other work first.
VersionCode91 is intentional: original0.91 can be restored in-place without data
clearing. VersionName0.91-network.1 distinguishes this reversible experiment.
The normal builder prompts privately for the existing normal signing key; no
key or password is supplied here. --online permits first-time pinned Maven
resolution. Output: app/build/outputs/apk/release/app-release.apk. Never build an
AAB or publish this test. Original0.91 APK/source and all game data remain intact.

Only direct lobby HTTP networking changes: self-contained Cronet500.1.0, official
HTTPS logical URLs, original signed request bodies/custom headers and stock
native join authorization. HTTP/3 capability does not establish ECH negotiation
or successful cellular access. All native engines, maps, media, gameplay and
Players/ALL COMBAT assets remain unchanged. Dependency coordinates, official
source/license URLs and API/AAR hashes are in overrides/release-records/cronet-dependency-source.json.

Read VALIDATION.json, RUNTIME.json, APK-INTEGRITY.json and AUDIT.md for the EXACT
APK outcome. Failed/incomplete cellular results stay failed/incomplete; source
restoration or a successful build is not a phone-networking pass. Historical
0.91/0.90 validation remains historical. Only explicitly selected sanitized
JSON/PNG evidence is appended. Phone dumps, full logcat, private host configs,
credentials, tokens, signing keys and local.properties are excluded.

No VPS, proxy/domain rewrite, feed/site, GitHub or Google Play publication occurs.
Any future publication requires the user's approval of the exact tested build.
