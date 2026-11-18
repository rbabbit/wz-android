# External asynchronous touch QA variation

Copied helper-readonly092 source/manifest/builder; its folder/APK and target app are
unchanged. Existing `touch`, geometry and ui-tree commands are unchanged. Root alone
may install/run this same-package normal4499-signed helper on owned emulator5562.
No installation, launch, ADB or device call occurred during preparation.

New command: `{"command":"touch-async","frames":[...]}` uses the same frame fields,
2-80 frames, one/two real FINGER pointers, finite0-7680 coordinates, supported actions
and0-250ms requested delays as the existing touch fixture. It queues MotionEvents
using `getUiAutomation().injectInputEvent(event,false)`, without sendPointerSync,
waitForIdle or MainThread synchronization. The first event's actual uptime becomes
the shared downTime; later eventTime values are actual uptime after requested delay.

Response `touch` records framesQueued/allQueued and per-frame actual event/down/
injection-start/return uptime, call duration and actual down-up duration. Queued is
NOT proof of app delivery, click or expected state; root still observes trusted DOM
receipts and actual native state. A failure attempts asynchronous ACTION_CANCEL with
the last exact pointer IDs/coordinates/properties, shared downTime and current time;
the RPC error includes queued count/cancel result/timings. Never automatically retry.

Build/signature validation is not runtime verification. No game/input handler, app
source/APK, preferences, permissions, layers, network or saved state was modified.
