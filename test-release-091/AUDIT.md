# INCOMPLETE LOCAL TEST CHECKPOINT — Players0.91

Final R3 local test checkpoint. Overall runtime validation remains incomplete:
MP physical presentation was black/partial, and one immediate CLOSE touch after
actual rotation restore was not acknowledged. Those checks are not passed.

## Exact build and source

Normal test APK0.91/code91:22825e1ca4420659b81d228649e0564d205ccb3c832044f23da3befc3b22181e,
613128952bytes. It was installed and its full installed APK hash checked in the
owned Android emulator. Normal certificate:
4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15.
Integrity report SHA256:faad871f056acd2a5392f0ae3273155a95547ca259f3ed1df66823565471c4c6.

Complete source profile:test-release-091,85overrides,
a7e64798ed2c5e974f96a62ac7ebe6048c798abf216105138db65839dabe23c8.
It chains the complete0.90 checkpoint, SHA256
657f72b0f880d283ee4e83937cb2ba945119e0a1fb0399a26cc9b781705274a8.
All14383 predecessor members and compressed local records must be retained.
Restoration/repeated/interrupted apply and local-edit/corrupt-override refusal
passed. Source restoration is separate from Android runtime verification.

## Implemented scope

One opaque Players panel serves Towers, FFA, Campaign, live MP players and real
spectators. Names, roles, connections, colors and role-sensitive statistics come
from a1Hz native snapshot. Hidden/unavailable values remain null. Observer
details require the actual native spectator guard. Native legacy controls use a
bounded context/role/nonce navigation API; no general spectator command access
was added. Three native lineages and all six full loaders were source-built and
paired; data/maps/media/protocol and0.90 gameplay/camera behavior remain frozen.

Native helper checks:22cases in each generic/Towers profile, with native reads
and menu calls stubbed. UI checks:24Players groups,21combat/constructor groups,
35unchanged camera functions. These checks establish source behavior only.

## Available exact-APK observations

- Towers:physical Players panel is legible and opaque; current local/native
  counts and unavailable ping match the native feed. Legacy controls open/close.
  Four actual constructors accepted MOVE and reached the validated lane while
  Players navigation preserved orders. ALL COMBAT ON/OFF pixels and native state
  were observed; Build-to-Players return and compact/rotated layouts were checked.
- Campaign:Players/native identity and hidden-field checks, ON/OFF state,
  two real IME shown/Back/Cancel cycles and subsequent manual native selection
  were observed. Manual selection while requested OFF retains the white label.
- MP player:functional native/data/navigation checks include ordinary births
  160691/160693, requested ON/OFF enrollment, completed MOVE to16/17,10 and
  ordinary GuardTower1 structure160695 at13,10 completed by160005/160007 while
  Players was open. Repeated Research/Manufacturing/Queue returns retained input.
- MP spectator:actual allocated watcher13 has no owned command capability;
  connected host/AI participants and one live watcher match native metadata.
  Rich observer values, table scrolling/focus and capability-gated native
  observer navigation are represented by native/DOM/input evidence.
- FFA:the original unmodified EasyCobra save was used. Ordinary MG166687
  born ON joined combat after Players close; OFF deselect was acknowledged and
  ordinary166897 born OFF stayed unselected after Players close. Physical Players
  and visible header/selection checks were observed.

## Physical presentation and fixture limits

MP physical ADB captures remained black/partial. Android Java View.draw images
show the rendered HTML roster/statistics layout, but those offscreen readbacks
are not physical screen captures and do not establish stable MP screen usability.
MP physical/layout verification therefore remains unverified; no physical-device
or PC-renderer equivalence claim is made. Replay has source/host coverage only;
no actual replay journey is claimed.

Tests reuse owned5562, prepared native saves and private localhost matches.
Towers' two combat units are a disclosed prepared fixture; MP births/builds are
ordinary native production/construction. Host/peer startup and rendering failures
remain fixture diagnostics and must be preserved separately from product results.
Final runtime evidence must explicitly distinguish physical ADB PNGs from
Java View.draw readbacks, native state, DOM and synthetic host tests.

No AAB, VPS/feed/site, GitHub or Google Play publication. User testing and explicit
approval of this exact build are required before any later publication.

## Final R3 delivery validation

The sealed runtime report is RUNTIME.json, SHA256
4ad51f146c234265b0802b13531de55542e4b9a2511cf6bc914cfd07a6a74d0c.
It records147 measured JSON/PNG evidence files and both real MP player/spectator
roles. modesVerified covers four functional/native paths; it does not mean all
four physical presentations passed. Overall passed:false/status:incomplete,
layoutAndTouchVerified:false and gameplayAndInputPreserved:false remain intact.
Observed core gameplay checks passed their stated scope. Historical source
checklists and R1/R2 iteration records are not substitutes for this exact R3 proof.

Remaining checks, as recorded without reclassification:

- Actual physical MP Players/header/native fallback/observer table presentation remains unverified: ADB captures were black even though native/DOM function advanced. Java WebView.draw renders HTML and is explicitly diagnostic, not a physical-screen pass.
- Immediate CLOSE touch after actual landscape rotation restore was not acknowledged. Existing evidence cannot distinguish transition dispatch/mapping from a button handling failure; settled touch-after-rotation is unverified. No repeat/recovery was attempted.
- Full world graphical correctness is not established: inherited terrain blackness remains in offline worlds, and MP physical composition is black. Selected models and header colors where actually visible are limited evidence, not a complete renderer pass.
