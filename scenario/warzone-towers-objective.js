/* Observe the supplied HQ/final-round result; its endconditions.js owns victory. */
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
    }
    return warzoneTowersOriginalFinalizePlayer(player, win);
};
