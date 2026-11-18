/* Native level IDs, rather than requests or browser URL data, scope purchases. */
const wtRewardNativeProfiles = includeJSON("reward-context-094.json");
function wt_rewardContext()
{
    if (selectedPlayer !== 0 || !playerData[0] || !playerData[0].isHuman) return null;
    const nativeLevel = typeof mapName === "string" ? mapName : "";
    const context = wtRewardNativeProfiles[nativeLevel];
    if (!context || !["towers", "survival"].includes(context.profile)) return null;
    return {profile:context.profile, map:context.map};
}
