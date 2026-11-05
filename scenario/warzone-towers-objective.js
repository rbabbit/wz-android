/* Observe the supplied HQ/final-round result; its endconditions.js owns victory. */
const warzoneTowersOriginalFinalizePlayer = finalizePlayer;
finalizePlayer = function (player, win) {
    if (player === selectedPlayer) {
        warzoneTowersWaves_state.phase = win ? "victory" : "defeated";
        warzoneTowersWaves_state.waiting = false;
        warzoneTowersWaves_state.deadline = 0;
        warzoneTowersWaves_emit(true);
    }
    return warzoneTowersOriginalFinalizePlayer(player, win);
};
