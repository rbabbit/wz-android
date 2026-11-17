# GitHub0.92 test-backup tooling

These scripts were used only after the user explicitly requested the GitHub backup. They never update the VPS/feed or Google Play. Preparation is local. Publisher import/--help are inert; create/upload/publish are explicit network actions against the pinned private rbabbit/wz-android repository and v0.92-test tag.

Local delivery paths in the scripts and asset inventory are part of the original operator environment. The source ZIP parts remain release attachments rather than Git blobs. Signing keys and GitHub credentials are not included; the publisher obtains the configured Git credential in memory, suppresses prompts and requires exact13-asset hashes. It publishes only as a prerelease with stable/latest unchanged.

Retain the immutable published assets and checksums. Do not recreate or replace a release merely by running this backup tooling again.
