# External read-only observation extension

Built from a copy of selection-089-helper source/manifest/builder. Original helper
and target app were not changed. Package/target/signature remain compatible with
the normal4499 QA instrumentation. Default launch remains none. Root alone installs
or runs this external helper on owned emulator5562; no physical device is authorized.

Existing commands remain unchanged. New RPCs:

- `{"command":"geometry","activity":"main"}` (or mp/auto) returns `geometry`:
  actual Java WebView/decor/root width/height, scale, pivot, screen location,
  globalVisibleRect, visibility/shown/window visibility/alpha. MainThread getters
  only. No bitmap, layout/layer/settings changes or input.
- `{"command":"ui-tree"}` returns `tree.xml`: direct
  UiAutomation.getRootInActiveWindow snapshot, without waitForIdle or shell dump.
  Standard native text/class/resource-id/content-desc/bounds/clickable/enabled/
  scrollable/focus attributes, actual display rotation when available. Maximum5000
  nodes/depth60; `tree.truncated` marks a cap. Password text/description are empty;
  XML-invalid codepoints are removed and strings bounded. No performAction/input.

Root stops the old helper before replacing it, preserves saved games, and may then
relaunch Main normally. No device, helper installation or runtime calls were made
during preparation. Build/signature checks are not a runtime result. QA device.py
was deliberately not modified; root must explicitly choose how to consume the RPCs.
