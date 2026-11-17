# Warzone Towers 0.87 - Google Play notification permission fix

Application ID: com.rbabbit.warzonetowers.lab
Version: 0.87 / code 87; minimum SDK 26; target SDK 36.

Changes are limited to Android notification permission declaration, contextual
one-time Multiplayer consent, active-notification refresh after grant, release
version and these source/release records. The existing specialUse multiplayer
foreground service and its cleanup remain in place. Notification denial does
not block multiplayer or request permission repeatedly. This does not promise
survival after force-stop, process death or loss of network connectivity.

The Play build excludes the outside APK updater/provider/installation
permission and uses the existing publisher key. Its Home screen displays
rbabbit v0.87 without an external Check for updates action. Native compiled
engines, protocol, maps, music, gameplay assets and command logic are frozen.

The signed 0.86 Play APK, AAB and complete source ZIP are preserved as fallbacks.
Their filenames and hashes are recorded in FALLBACKS.json. Direct website
artifacts, the live VPS and Git repositories are unchanged by this release.

VALIDATION.json records artifact signatures, manifest/build checks and actual
runtime observations for the exact delivery APK. It does not establish Play
review approval. Use the new Play APK for a foreground-service demonstration
and upload the matching AAB to Google Play Console.

Every baseline source member remains intact in the complete source ZIP. Apply
the guarded overlay before building; see README.md. Private signing inputs and
temporary Android runtime data are excluded from the source additions.
