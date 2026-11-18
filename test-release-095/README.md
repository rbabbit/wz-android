# Normal test 0.95 complete source

The complete archive preserves every member from the 0.94 source, including the 0.92/0.93/0.94 source profiles. After extraction, run `python test-release-095/prepare-and-build.py --apply-only`. This restores the exact 0.95 source through the retained 0.94 recipe, then applies the guarded 0.95 overrides. Running it again on exact 0.95 is idempotent. Partial or future source edits are refused.

To build, omit `--apply-only` and supply `--keystore`, `--alias`, `--java-home` and `--android-sdk`; signing passwords come from private environment variables or an interactive prompt. No private signing inputs are included. The recipe builds a normal APK only and performs no upload.

Repair/ALL COMBAT, Survival/More Fortress, and Hub replay work are included. See AUDIT.md, DELIVERY.json and SOURCE-COVERAGE.json for exact verification and limits. GitHub backup was authorized separately; no VPS/update-feed or Google Play publication is performed.
