# Normal0.89 verification conditions

The delivery retains the normal publisher signing chain, updater and version
0.89/code89. Its app sources and compiled native pairs are bound by the source
override manifest and exact APK integrity/runtime records.

Fixture disclosure: Towers checks use a disclosed private native saved-state
fixture with two seeded MG tanks. Campaign uses an existing native campaign
checkpoint. FFA and Multiplayer production checks require ordinary native
Manufacturing; a pass is claimed only where the final runtime report confirms
it. Seeded/checkpoint states are test infrastructure and are
not bundled into the APK or substituted for ordinary production checks.

The baseline emulator renders black terrain. Screens, native IDs/selection,
orders/production and input returns can be checked there; this evidence does
not establish physical-device terrain quality. Read AUDIT.md and the actual
runtime/update reports for exact observations and any remaining limits.

The failed first0.89 candidate (858a1000...) had an old dedicated Campaign
loader paired with the new shared WASM. The corrected B2 candidate is bound
by its full SHA256 in VALIDATION.json. All six full generated JS loaders and
three WASM files pass the recorded static native-pair proof; runtime claims
come only from the exact B2 APK reports, not that static check alone.
