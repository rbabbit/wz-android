# Complete Warzone Towers 0.87 Google Play source

The ZIP retains every one of the 13,991 files from the complete 0.86 source
snapshot, including game engines, assets, build tools and retained history.
The baseline files at the archive root are intentionally unchanged. This
google-play-release directory adds the exact 0.87 Play source changes.

Extract the entire ZIP into a NEW directory. To prepare and build version
0.87 (version code 87), run from the extracted archive root:

    python google-play-release/prepare-and-build.py --keystore PATH_TO_PRIVATE_KEY --alias KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK

The wrapper checks baseline and override hashes before changing any file. It
refuses to overwrite unrelated edits. Add --apply-only to prepare the source
without building. Running Gradle directly before applying this overlay builds
the retained baseline, rather than this 0.87 Play release.

The build uses the existing publisher/upload key, a 4 GB Java heap and cached
dependencies. Keep the keystore outside the extracted project. Passwords are
prompted without echo, or may be supplied through private process environment
variables WZ_RELEASE_STORE_PASSWORD and WZ_RELEASE_KEY_PASSWORD. No signing key
or password is included in this archive. Add --online only if dependencies
are missing. Normal outputs are app/build/outputs/apk/release/app-release.apk
and app/build/outputs/bundle/release/app-release.aab.

The default Play build retains publisher ad configuration. Use --test-ads only
for a separately marked development build, not to reproduce delivery hashes.
The APK is for direct installation/testing; the AAB is for Play Console upload.

0.87 adds Android 13+ notification consent for the live multiplayer foreground
service. Consent is requested once on first Multiplayer entry, denial does not
block joining or cause repeated prompts, and granting refreshes any active
session notification. Existing session start/background/leave logic remains.
The Play profile excludes the external APK updater and installer permission,
shows the installed version without Check for updates, and disables release
application/WebView debugging. All bundled game assets remain unchanged.

Read RELEASE-NOTES.md and VALIDATION.json for the exact delivery verification
and its limits. SOURCE-PROVENANCE.json records the preserved baseline and source
overlay. The source archive checksum is recorded externally to avoid embedding
the checksum of a ZIP inside itself. No website/VPS/Git changes or Play upload
are performed by this source archive.
