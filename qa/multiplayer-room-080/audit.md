# Multiplayer waiting-room polish 0.80

User supplied six actual phone screenshots in drive-download-20261115T025301Z-1-001.zip. Inspected all six before edits. v0.79 APK/source hashes verified and preserved in fallback-0.80.json.

1. Chat focus explicitly hides the roster/footer and reorders the composer, creating the separate-screen feeling. Fixed-height keyboard state can leave blank lower space. Keep one room layout and follow actual available viewport/IME bounds.
2. Chat rows are entirely replaced when messages change; numeric scrolling does not preserve a reading anchor. Room pointer focus handling also disrupts drag scrolling. Verify actual finger drags, old-message reading during new arrivals, tail following and keyboard returns.
3. No map-preview action exists. Export the original engine's generated map pixels, including downloaded maps, instead of guessing from map names. Guard map identity, download state and blind rooms.
4. The existing click asset is not available through the Multiplayer asset allowlist and room controls have no sound scope. Reuse that exact clip and native UI/effects volume/mute settings; verify actual decoded audio output in the installed APK.

Installed v0.79 reproduction on emulator-5558 confirmed chat-focus page replacement and 314px inline room height while the keyboard reduced the visual viewport. Native room protocol/data remain unchanged. Only scoped waiting-room layout/input/audio and real preview export are authorized; no unrelated renderer, gameplay, other-mode or server changes.

Final checks must type real text, send/receive in an unlisted private bot room, scroll chat with real touch events, restore the full room after IME/Back, show the real map preview and start/control a bot match. Test the exact new APK and preserve all older source/proofs.
