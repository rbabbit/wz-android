# Normal0.93 native repair policy

This source overlay adds a persistent owned-combat retreat policy through normal
`secondarySetState(...,DSO_REPAIR_LEVEL,...,ModeQueue)` orders. ON is native
Medium Damage (`DSS_REPLEV_LOW`, <=75% remaining health); OFF is Never. It never
creates repair capacity, changes factory defaults, applies policy to constructors
or replaces normal native pathing/repair/rearm behavior.

The policy starts unmanaged on a new native combat context, preserving loaded
native per-unit settings until the user first toggles REPAIR. Once managed,
existing and newly enumerated combat units receive the requested threshold.
Queued pending levels prevent duplicate network orders. Native queued secondary
orders preserve multiplayer synchronization; no game/rules JS API is added.

Requests: `{enabled:boolean,nonce:string,context:string}`. Offline mailbox
`/tmp/warzone-repair-policy-v93.json`; MP `/tmp/mp-mobile-repair-v93.json`.
Context must match the current owned `combatLock.context`. Replay and observer
roles cannot set policy. Unsafe menus delay state changes until native safe.

Both native snapshots add `repairPolicy`: schemaVersion93, enabled, managed,
applied, pending, canIssueOrders, worldSafe, context, requestNonce, reason,
thresholdHealthPercent75, scope `owned-combat-map`, combatIds, appliedIds,
pendingIds, protectedIds, failedIds and revision. `units` contains up to256
native diagnostic rows; `diagnosticUnitsTruncated` is explicit. All ID arrays
remain complete. `repairLevel`/`pendingRepairLevel` are remaining-health
thresholds0/50/75; health/body and maxHealth/originalBody are native integers.
`x/y/z` and worldPosition are engine world units; tilePosition divides by native
TILE_UNITS. order/action are native enums, with orderTargetId/orderPosition.

Existing combatLock/combatSelection retain every owned combatId and add
commandableIds plus protectedIds. The ALL COMBAT latch selects only commandable
units, remains ON if there are none and also deselects protected units during a
gesture hold. UI-only grouped location/object order dispatch has a live native
protection check, closing the gap between the UI readiness ACK and actual click.
This guard is not added to synchronized simulation update paths.

ALL COMBAT app STOP uses the same live native protection at dispatch, including
the interval after a previously ready selection ACK. Offline request mailbox
`/tmp/warzone-combat-stop-v93.json` accepts `{nonce,context,activation}`;
`cancel:true` replaces an unconsumed request as a no-op. The same nonce may be
used for cancellation: after a command was consumed, nonce deduplication keeps
its original result and cannot issue it twice. The native frame publishes
`combatStop`: schemaVersion93, action `stop-selected`, nonce, context, activation,
ok, reason, selectedIds, stoppedIds, protectedIds and skippedProtectedIds.
Selected IDs are currently selected owned eligible combat units; stopped and
protected IDs partition that set on success. No constructors or fallback workers
are recruited. Unsafe/stale/off requests are consumed without deferred orders.
MP uses existing native-input action `stop-selected` with the same context,
activation and result fields. stoppedIds acknowledge normal ModeQueue dispatch,
not eventual simulation completion. Existing manual/construction STOP retains
its worker-FIFO route when ALL COMBAT is not controlling the group.

Physical S has an additional UI-only keybind check for DORDER_STOP. A currently
protected unit is skipped even when damage/retreat began during the simulation
tick before the mobile selection reconciliation. The generic synchronized
orderDroid implementation and every frozen data package remain unchanged.

Active RTR/RTR_SPECIFIED, damaged RTB and repair/rearm actions stay protected
even after Repair OFF. ON also protects threshold-crossed units while their
native order is queued and keeps damaged HQ fallback units protected until
healed. Full healing and completion release units to ALL COMBAT. OFF stops
future auto-retreat and lets active trips finish; it does not cancel their
orders. Healthy ordinary Return-to-Base is not classified as repair.

Three source-built lineages preserve0.91 Players observations,0.90 selection
visuals and all frozen data/network transport. Build uses seven isolated objects:
shared/towers hci, MP quickjs, and both retained-family order.cpp/keybind.cpp overlays.
Inherited display/droid/spectator objects are copied and hash-verified; source
and raw/object/library/cache manifests remain intact. Loader integration and
checks verify all six full JS loaders against their three exact raw WASM pairs,
including unchanged preload indexes and raw ASM_CONSTS. The approved UI HTML may
change while its existing external script routes remain exact.
