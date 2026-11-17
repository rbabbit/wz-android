# Complete Warzone Towers normal0.89 source

This archive preserves all14,008 members of the immutable complete Google Play
0.87 source, including all historical source/assets and the full native source
snapshot. The normal-release-089 profile adds the exact new normal0.89 source.
Extract the ENTIRE archive into a new directory; retain both profile folders.

Prepare the current source without building:

    python normal-release-089/prepare-and-build.py --apply-only

Build only the signed normal/updater APK with explicitly supplied private inputs:

    python normal-release-089/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK

No key, alias secret/password, local SDK settings, SSH keys or runtime userdata
is provided. Use the existing normal publisher key (certificate4499efe0...),
not the Google Play upload key. Passwords are prompted without echo or read from
the builder's documented private environment. --online allows Gradle downloads;
the default uses cached dependencies. Output: app/build/outputs/apk/release/
app-release.apk. This wrapper never requests an AAB or publishes any artifact.

The wrapper applies the original guarded google-play-release --apply-only first
when needed, then normal0.89 overrides. It preflights every managed destination
and retained profile source before changes. Repeated full application and
interrupted mixtures containing only exact baseline/Play/normal bytes are
supported; unrelated local edits are refused before mutation. Copying is not an
atomic filesystem transaction; a disk/process failure can leave a recognized
partial state, which can be reapplied. Preserve unrelated local work separately.
Running Gradle at an untouched extracted root builds the historical baseline;
apply this normal profile first. The retained Play profile remains available
for historical reproduction and is not the default normal build wrapper.

Version0.89/code89 retains notification consent and enables normal signed APK
updates. Horizontal selected-unit health/background rectangles are removed in
all four modes; selection corners and unrelated status remain. ALL COMBAT uses
actual owned native combat/selected IDs. The abandoned0.88 camera pilot is not
included. All data/maps/media and the network protocol remain unchanged.

Compiled JS/WASM are supplied as three exact source-built pairs: shared0.51 for
Campaign/FFA, Towers0.52 with its retained loss notice, and Multiplayer082.
Campaign, FFA and deferred Duel each also have their own full generated loader,
rebuilt from the new shared raw JS with their frozen per-mode package adapters.
These six full JS loaders and three WASM files are nine compiled assets total.
See vendor/native-089/BOOTSTRAP.md AFTER application for complete retained native
source bootstrap, pinned toolchains, source patches, isolated warm-cache build
commands, raw/output hashes, integration proofs and focused C++ source checks.
Native object caches/test executables and redundant generated data/HTML are
excluded. A full fresh dependency rebuild was documented, not executed; exact
delivery binaries were built using the recorded unchanged warm dependencies.

VALIDATION.json, APK-INTEGRITY.json, RUNTIME.json, PUBLICATION.json and AUDIT.md
describe the exact checked APK, observed gameplay and publication checks/limits.
UPDATE-JOURNEY.json and validation/update-journey/ retain the actual in-app update
report and explicitly hashed PNG/JSON evidence. ATTACHMENTS.json binds their
packaged names, sizes and hashes. These are audit attachments, not app sources.
RESTORE-CHECK.json records source restoration only; scripts/build checks do not
establish Android gameplay. Fixture userdata, host keys and live runtime files
are intentionally excluded. Existing historical archive members are preserved.
