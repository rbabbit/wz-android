# Warzone app updates

Home has a compact **Check for updates** action beside the installed version.
It runs only when requested. It does not display a startup update popup, open
a web page, uninstall the existing app, or change game storage.

## VPS contract

- Feed: `https://wz2100.uk/downloads/warzone/latest.json`
- APK: `https://wz2100.uk/downloads/warzone/warzone2100-andriod.apk`
- The APK filename deliberately retains the user's requested `andriod` spelling.
- Publish only the signed APK and JSON feed in this public download directory.
  Complete source archives, signing files and secrets remain private.
- Do not change the existing website or Caddy configuration to publish updates.

The feed contains these fields:

```json
{
  "schemaVersion": 1,
  "applicationId": "com.rbabbit.warzonetowers.lab",
  "versionCode": 86,
  "versionName": "0.86",
  "apkUrl": "https://wz2100.uk/downloads/warzone/warzone2100-andriod.apk",
  "sizeBytes": 123,
  "sha256": "REPLACE_WITH_THE_EXACT_DELIVERY_APK_SHA256",
  "notes": "Short release notes, optional."
}
```

The sample size/hash above are documentation placeholders, not a deployable
feed. Generate both from the exact checked delivery APK. Version code/name must
also match that APK. Replace the APK atomically first, verify its public bytes,
then replace the feed atomically. A feed/APK race fails safely on size/hash or
version mismatch and the user can retry. Preserve prior local delivery artifacts.

## Acceptance and installation

`AppUpdatePolicy` accepts only schema 1, the existing application ID, a positive
bounded version code, bounded version name/notes, a 64-digit SHA256 and a size of
1 byte through 2 GiB. The URL must match the exact HTTPS address above. Redirects
are disabled. Feed reads are bounded to 32 KiB; connect/read waits are bounded.
Equal or older releases do not offer a download.

The app streams a full replacement APK into app-private storage. It displays
progress and checks the exact byte count and SHA256 before exposing a completed
file. It also asks Android's PackageManager for the APK's application ID, version,
minimum SDK and current signing certificates, and requires the same signer set
as the installed app. This intentionally does not enable signing-key rotation.
The system installer performs final APK signature/integrity verification.

The read-only, unexported `AppUpdateProvider` serves exactly one completed APK
URI. No external-storage permission or broad file-provider path is used. Only
the installer receives a temporary URI read grant. Android's unknown-source
setting and its normal installation approval remain user-controlled. The app
never installs silently. Cancelling, offline/errors and retry remain in the
manual update dialog. Closing it cancels work and discards the partial download.
Verified APK bytes can be reused on a subsequent check/download of the same feed.

Keep `applicationId = com.rbabbit.warzonetowers.lab` and the existing signing key
for every delivery. A normal accepted package update retains the app's existing
saves, designs, wallet and preferences. Never uninstall to work around a signer
or package mismatch.

## Smaller downloads

The current app embeds its Java shell, WebView scripts, native WASM and large
game-data files in one APK. This implementation downloads the full APK even for
a small Java or script change. Existing optional media downloads have their own
content contract; they cannot safely replace arbitrary app/native code.

Delta delivery could be a separate future project: it requires exact known base
APK hashes, a verified patch/reconstruction format, enough staging storage and
the same final APK/hash/signature/Android approval checks. It is not implemented
or promised here. No remote script/native-code hot patching was added.

## Verification

`tools/test-app-updates-086.py` executes the production policy and transfer
helpers, real file checksums and the Home layout helper. It covers strict URL
and metadata rejection, signer-set comparisons, byte/progress integrity,
truncation, oversize/cancellation and compact/enlarged-text Home geometry.
It is host evidence, not proof of an Android install or preserved runtime saves.

Relevant exact-APK device checks are Home visibility/tap/back, manual current
feed check, offline retry, bounded cancel, download/progress/hash failure and
the unknown-source/Android installer return path. An actual newer APK and a
preserved pre-update data fixture are required to establish replacement-install
data survival. Record any device-test limits honestly in the release report.

Primary Android references checked during implementation:

- [How Android handles app updates](https://developer.android.com/google/play/app-updates)
- [PackageManager installation permission](https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls())
- [Sharing files using temporary content URI grants](https://developer.android.com/training/secure-file-sharing/share-file)
- [ContentProvider API](https://developer.android.com/reference/android/content/ContentProvider)
