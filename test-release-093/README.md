# Warzone Towers 0.93 normal test source

This profile adds the native Medium-damage REPAIR toggle and coordinates ALL
COMBAT with units returning for repair. Medium means retreat at 75% health or
below. The policy covers owned combat units across the map and new production.
OFF stops future automatic retreats and lets active repair journeys finish.

The complete source archive retains all 14,789 members and the original compressed
local records of `warzone-towers-0.92-test-source.zip`, SHA256
`63e26582d2c97ed88f57469be8a556b205532c83b660e937bd983b2be8cf8057`.
Its root is historical. Extract the entire archive with all retained profiles,
then apply the 0.92 chain and current 0.93 overrides with:

    python test-release-093/prepare-and-build.py --apply-only

The guarded wrapper accepts only recorded raw, historical, prior 0.92 or current
0.93 hashes. It supports repeated and interrupted application of those known
states. Unknown local edits, including a later 0.94 version, are refused before
source mutation. Unrelated files are preserved. Copies are not transactional;
retain your other work before restoring a profile.

Build a normal APK using your existing private key, JDK and Android SDK:

    python test-release-093/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK --online

The existing normal builder prompts privately for signing passwords. No APK,
signing key, password, local.properties, emulator userdata or private host setup
is added by this profile. APK output is
`app/build/outputs/apk/release/app-release.apk`. No AAB is built.

The new `vendor/native-093` source, patches, native objects, raw/integrated
runtimes, recipes and source checks are retained for rebuilding. Earlier complete
native source/bootstrap archives remain available in the preserved baseline.
Pinned native build recipes describe their WSL prerequisites. Android, Cronet,
maps, data, media and earlier source profiles remain part of the complete source.

Preparation and source restoration checks do not establish gameplay behavior.
During development, `SOURCE-PACKAGE-PREPARATION.json` explicitly marks the draft.
Only a later passed exact-APK seal can be packaged with `--pack --runtime FILE`.
Read `RUNTIME.json`, `VALIDATION.json`, `APK-INTEGRITY.json`, `AUDIT.md` and the
curated JSON/PNG attachments if present for the actual scope and limitations.

Existing APKs, complete source archives, saves and prepared states are preserved.
The packaging and build scripts contain no VPS, update-feed, GitHub or Google
Play publication action. The user must test and approve the exact APK before
any future VPS/update-feed upload.
