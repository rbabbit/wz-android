# Local combat latch contract

Offline request: /tmp/warzone-combat-lock-v90.json. MP request retains
/tmp/mp-mobile-combat.json. Atomic request JSON contains nonce, enabled,
suspended, activation, context and deselect. Strings are bounded and each
request must match the current owned-world context.

Only explicit user OFF sets deselect=true. Native ON selects all owned native
eligible combat units across the map and includes new production on a later
safe frame. Eligibility is asWeaps[0].nStat>0, not a transporter, and native
isSelectable. Constructor/build/research/input suspension retains requested
ON while making no selection changes. The UI owner must maintain the explicit
constructor override beyond the short TRUCKS query until the known exit path.

Explicit OFF disables the latch immediately and queues one COMBAT-only deselect
until safe and unsuspended. Later OFF suspension writes do not drop that pending
action; a newer user ON cancels it. Cleanup sends deselect=false with the current
activation. Context/module/session reset cancels old pending actions without
deselecting a new world. The context changes on owned-world/owner changes or
native gameTime rewind. UI module/session guards also cancel stale asynchronous work.

Offline keeps /tmp/warzone-combat-selection-v89.json schema89 and its existing
combatSelection arrays, adding combatLock. MP keeps state.combatLock. ACK has
enabled, suspended, requestedSuspended, reason, requestNonce, activation, context,
pendingDeselect, deselectNonce, deselectAppliedNonce, combatIds, selectedIds and
revision. Arrays are observed after native selection changes. An OFF transport
write is not itself proof of delivery; the UI retains it until native ACK and
must allow later unsuspended writes to complete deferred deselection.

Selected horizontal health/background rectangles and four white corner
rectangles are suppressed. Nonselected hover/status, shields/reload/rank,
structures and construction-progress rendering remain outside this change.

Offline TRUCKS uses the separate one-shot mailbox
/tmp/warzone-constructor-selection-v90.json, containing nonce,
action="select-visible-trucks", context, activation and combatIntentNonce.
It is processed after the current combat-intent mailbox and before combat
reconciliation. A safe owned world, exact context/activation/current intent
nonce and requestedSuspended=true are required. Each nonce is consumed once;
unsafe or stale requests return a failure ACK without changing selection.
This action uses normal SelectDroid/DeSelectDroid on owned, isSelectable,
objectOnScreen(droid,0) constructors/cyborg constructors only. No orders,
production or simulation state are changed.

The existing generic frame snapshot adds constructorSelection with the request
fields plus ok, reason and sorted actual selectedIds. ok means the selected set
equals the visible eligible constructor set; an empty visible set can succeed.
The UI verifies its fresh normal selectionState before committing builder IDs.
MP retains its existing normal select-visible-trucks command. This replaces
offline recursive tile-volume drag recovery, which could include adjacent
combat units and exhaust its query budget without committing a builder group.
