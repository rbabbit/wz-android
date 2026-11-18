# Players0.92 QA source and evidence

The exact normal test APK, runtime/audit/validation records and62 selected JSON/PNG captures are preserved in `../../test-release-092/`. The approved final mockups are in `../../docs/mockups/players-clean-v2/`.

These are operator tools retained as development/provenance source, not an automatic passing suite. Some historical helpers deliberately retain failed assumptions or early timing limits; the sealed runtime and combined completion records identify the observed result. In particular, MP finishedUnits is not a valid birth oracle and native selectedUnits has no name field. Use persistent native queue ACK/job progress, new owned combat IDs and native positions instead.

The external helper is separate from the delivery app. Async touch sends real SOURCE_TOUCHSCREEN/FINGER events without per-frame idle waits. A queued event is not proof of delivery: the current tests also capture trusted browser click receipts and native state.

The recorded fixtures used only the owned headless emulator5562 and prepared saves/private native hosts. Private host configurations, raw logs, phone exports, signing keys, live tokens and SDK settings are intentionally not copied here. Local paths and ports require deliberate operator setup; do not run these tools against a user's device or public match. Earlier host wrappers and fixed-bound helpers are retained as historical source only.

The actual app code in this Git checkout is already restored to0.92. No emulator/gameplay/build needs to run to inspect this backup. GitHub publication was requested after the sealed local-test records were created, so their original published:false fields remain historical facts.
