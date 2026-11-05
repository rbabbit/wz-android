# Build response time

Frozen v5.9 APK/source/checksums verified; branch starts at 2dfdbda.

Measured v5.9 on the owned, ready emulator with its existing single constructor:
first item 3268 ms; same item again 3225 ms; different item 3302 ms; back 2865 ms.
The trace contains 9–10 state requests per selection, full picker setup for an
unchanged item, fixed post-click waits, and almost a second from engine-ready to
the final interactive view. Screens and request/input/frame events were captured.

Fix/check: coalesced state reads, reuse of valid existing truck selection, no
redundant builder-page taps, menu-specific input completion (terrain input keeps
its original frame barriers), actual build-ready callback, repeated/item changes,
native queues/orders/completion, exits, moved/destroyed builders and empty roster,
page returns and three screen sizes. Compare measurements on the delivery APK.
Preserve the native engine, mod, Research and existing smooth sidebar behavior.

The first candidate exposed two related failures during actual native checks:
the queue observer permanently interrupted a job on one idle handoff sample,
and the repeated-item shortcut trusted cached readiness after the native tool
had closed. The observer now requires sustained simulation idle; the shortcut
was removed. Repeated items must be acknowledged again by the native picker.
Exit during asynchronous selection also invalidates late activation. Earlier
candidate traces and failed checks are retained separately from final evidence.
