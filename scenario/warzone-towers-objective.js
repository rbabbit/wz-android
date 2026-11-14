/* The supplied endconditions.js owns the result; the mobile host owns its UI. */
const warzoneTowersOriginalFinalizePlayer = finalizePlayer;
finalizePlayer = function (player, win) {
    if (player === selectedPlayer) {
        // Reconcile actually killed, fully spawned waves before the terminal
        // packet. No post-loss clear can be inferred from a new round number.
        warzoneTowersWaves_refreshClears();
        warzoneTowersWaves_state.phase = win ? "victory" : "defeated";
        warzoneTowersWaves_state.waiting = false;
        warzoneTowersWaves_state.deadline = 0;
        warzoneTowersWaves_emit(true);
        // gameOverMessage opens the stock result screen synchronously, before
        // the host can consume this terminal packet. Keep the selected human
        // in the battlefield until the host records the result and goes Home.
        // Other players retain the supplied finalization/spectator behavior.
        if (typeof playerData !== "undefined" && playerData[player] && playerData[player].isHuman) return;
    }
    return warzoneTowersOriginalFinalizePlayer(player, win);
};
