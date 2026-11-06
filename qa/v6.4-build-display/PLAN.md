# Building display only

Frozen fallback: v6.3 APK and complete source, copied and hash-checked in C:/timerApp/_backups/towers-v6.3-before-build-display-20261106.

Four reproduced display issues: accepted queued sites lack map blueprints; current preview lacks a structure model; queue rows do not identify sites or distinguish pending/completed counts; the catalogue viewport cuts card names.

Do not change construction commands, worker assignment, queues, movement, camera/input behavior, research, production, templates, maps, engine or Android code. Use the original building meshes for a lightweight translucent preview overlay aligned to the observed terrain projection. Display actual accepted native sites and stable site IDs, hide finished/cancelled blueprints, refresh with camera movement, preserve touch/minimap input. Give catalogue complete visible rows with scroll and enough text height.

Test on the existing emulator: reproduce current display with ordinary authored trucks and multiple same-type queued sites; inspect placement meshes, accepted sites, live camera projection, site identity across completion, clear count labels, full names at different viewport sizes and at catalogue bottom. Verify actual native IDs/orders/positions and construction completion; no seeded units/power/research. Recheck repeat/mixed item orders, minimap, input/menu returns and no viewport/frozen-frame regressions on the exact delivery APK. Keep infrastructure bounded and wait for observable state. Package APK plus complete source only after relevant checks pass.
