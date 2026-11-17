# Complete Warzone Towers0.92 LOCAL TEST source

This archive retains every original member and compressed source record from the
accepted complete0.91-network.1 source ZIP (SHA25666feb66e...). Extract the ENTIRE
archive and retain every historical profile. The root is historical; apply:

    python test-release-092/prepare-and-build.py --apply-only
    python test-release-092/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK --online

The guarded wrapper applies the retained network-test-091-1 chain, then exact0.92
overrides. Full, repeated and interrupted known-state application are guarded by
SHA256. Unknown local edits, modified profile files and path escapes are refused
before source copies. Copies are not atomic; preserve other work first.

Only the shared Players presentation changes in two UI assets, with one official
Phosphor eye icon and its MIT license/provenance. Native engines, data, maps, media,
Java, Cronet and direct networking remain the accepted baseline.
VersionCode92/versionName0.92 identify this normal APK test. The unchanged normal
builder prompts privately for the existing signing key; keys/passwords are not
included. --online permits pinned dependency resolution when needed. APK output:
app/build/outputs/apk/release/app-release.apk. No AAB or publication is authorized.

Read VALIDATION.json, RUNTIME.json, APK-INTEGRITY.json and AUDIT.md for the exact
APK checks and limits. Source restoration/build checks do not establish real
emulator behaviour. Historical0.91/network-test results remain historical; they
are not a new0.92 UI pass. Only selected sanitized JSON/PNG evidence is included.
No private hosts, phone exports, credentials, tokens or signing files are added.

Existing APKs, full source archives, saves and prepared test states are preserved.
No VPS, update feed, website, GitHub or Google Play publication occurs. Any later
publication requires the user's approval of the exact tested APK.
