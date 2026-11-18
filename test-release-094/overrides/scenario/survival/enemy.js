/* The supplied EMAG enemy army attacks the surviving human command centre. */
function eventStartLevel() { setTimer("survivalEnemyTick", 1000); }
function survivalEnemyTick()
{
    const targets = enumStruct(0, HQ);
    if (!targets.length) return;
    const target = targets[0];
    enumDroid(me, DROID_ANY).forEach(function(droid) {
        if (droid.order !== DORDER_ATTACK) orderDroidObj(droid, DORDER_ATTACK, target);
    });
}
