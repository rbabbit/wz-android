# INCOMPLETE local test checkpoint

This complete source archive matches normal test APK0.90/code90, SHA256 ee65c0cd433f5959ff9b2cbc40de6f3e98c79f4c080996e87b3eeaa983403de2. Runtime validation is INCOMPLETE (passed:false). This is not a fully verified release.

Observed checks:

- Exact corrected APK installed in place on owned emulator5562; full installed base.apk SHA256 and size match delivery APK. No userdata reset.
- Towers: ON selects the two prepared combat units, native constructor request matches current context/activation/intent and selects exactly four owned constructors with zero boxes, ordinary MOVE completed, Build group is four, normal Build exit restores the two combat units, OFF applies native deselection.
- Campaign: five combat units selected ON; explicit OFF applies empty selection; ordinary longpress box selects all five while the latch remains OFF and white. Physical ON/OFF label and pure-black pixels observed.
- FFA: unmodified original EASY save MG161319 is visibly selected without selected HP bars or white brackets. Ordinary factory birth166619 automatically joins the ON group without another press. OFF applies empty native selection. Physical white/green-on-black pixels observed.
- MP: ordinary births160691 while ON automatically selected and160693 while OFF unselected; OFF nonce applied empty; ON again selects both owned combat units.
- MP: ordinary native movement completed for both combat units, including after two IME returns. Native MOVE order2, actual changed positions and completion order25 observed.
- MP: guarded existing native constructor action selects exactly160005/160007, zero boxes; Build exit resumes combat.
- MP: ordinary GuardTower1 placement at validated reachable clear tile13,10 completed native structure160695 at gameTime489602 with both constructors. ON stayed suspended through work; Build auto-close then resumed both combat units.
- MP: six Research/Manufacturing/Queue open/close cycles retain requested ON. Two native IME open/Back/Cancel cycles observed; physical name dialog and keyboard are visible in103 captures, no name change saved, viewport restored, subsequent native MOVE completed.
- MP: physical96 frame shows selected constructors and green label on pure black; physical107 frame shows OFF white on pure black and native empty selection. These are partial visual observations, not a stable completed visual journey.

Remaining verification / emulator limits:

- Stable MP physical compositor rendering throughout the complete selected-combat, menu and post-keyboard battlefield journey at2400x1080; many ADB frames remain entirely black despite advancing native state.
- Reliable physical MP selected COMBAT-model HP-bar/bracket removal and full post-IME battlefield restoration. A selected-constructor frame is observed, but isolated successful frames do not establish a stable visual pass.
- Physical compact1920 MP presentation control also returned black. No further graphics modes, new AVDs or helper infrastructure were attempted.

Only these modes have a complete observed journey: towers, campaign, ffa. Native-state checks in an unpainted view do not establish screen usability. Prepared/seeded fixtures and any physical-device limitations remain as recorded in RUNTIME.json.

Build/signature/658-source-asset integrity and source restoration passed their separate checks. The complete0.89 archive and all original compressed local records are retained; the exact0.90 profile overlays them. No AAB, VPS/feed/website, GitHub or Google Play publication is performed or authorized. User testing and explicit approval of this exact build are required before later publication.

Runtime report SHA256: 7f83c608cad652e1e570d84954ad888f55f53dd8876c3b47516166d45baf7bf9
Source profile SHA256: 440dec652c3262ec6059f61ac8edf6670c143970c6c0bf829656197f4f76ca42
