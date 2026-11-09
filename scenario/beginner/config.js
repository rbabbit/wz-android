/*
 * Greenhaven Beginner: an isolated schedule for Greenhaven-Beginner-T1.
 * Template strings and the round/wait/spawn API come from the preserved
 * WZmodTowerDefense-v4.7.0-a config. Human research remains player-controlled.
 */
const beginnerPeople = [
    "*BaBa MG* *BaBa Body* BaBaLegs",
];
const beginnerScouts = [
    "*Jeep MG* *Jeep Body* BaBaProp",
    "*Buggy MG* *Buggy Body* BaBaProp",
    "*Trike MG* *Trike Body* BaBaProp",
];
const beginnerWheels = [
    "Machinegun Viper Wheels",
    "Flamer Viper Wheels",
    "Light Cannon Viper Wheels",
];
const beginnerVipers = [
    "Twin Machinegun Viper Half-tracks",
    "Light Cannon Viper Half-tracks",
    "Mini-Rocket Pod Viper Half-tracks",
];
const beginnerCobras = [
    "Heavy Machinegun Cobra Half-tracks",
    "Light Cannon Cobra Half-tracks",
    "Medium Cannon Cobra Wheels",
];

// The supplied schedule subtracts 360 seconds from the enemy research clock.
// Beginner subtracts 900, retaining the native starting base/tech allowance.
setResearchDelay(900);

// Fewer enemies also mean fewer rewards. Add 25% to the ordinary per-kill
// reward at the selected native power level; the API rounds the result up.
const beginnerBasePowerReward = defaultPowerRewardFunction();
setPowerRewardFunction(power => beginnerBasePowerReward(power) * 1.25);

// Totals: 10, 15, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 39, 42, 45.
// All waits use native game seconds. No additional clock or spawn loop.
wait(240), round(1), spawn(10, beginnerPeople);
wait(180), round(2), spawn(12, beginnerPeople), spawn(3, beginnerScouts);
wait(180), round(3), spawn(12, beginnerPeople), spawn(6, beginnerScouts);
wait(175), round(4), spawn(10, beginnerPeople), spawn(6, beginnerScouts), spawn(4, beginnerWheels);
wait(170), round(5), spawn(10, beginnerPeople), spawn(6, beginnerScouts), spawn(6, beginnerWheels);
wait(165), round(6), spawn(10, beginnerPeople), spawn(6, beginnerScouts), spawn(8, beginnerWheels);
wait(160), round(7), spawn(8, beginnerPeople), spawn(6, beginnerScouts), spawn(12, beginnerWheels);
wait(155), round(8), spawn(8, beginnerPeople), spawn(6, beginnerScouts), spawn(10, beginnerWheels), spawn(4, beginnerVipers);
wait(150), round(9), spawn(8, beginnerPeople), spawn(6, beginnerScouts), spawn(10, beginnerWheels), spawn(6, beginnerVipers);
wait(150), round(10), spawn(6, beginnerPeople), spawn(6, beginnerScouts), spawn(12, beginnerWheels), spawn(8, beginnerVipers);
wait(145), round(11), spawn(6, beginnerPeople), spawn(6, beginnerScouts), spawn(10, beginnerWheels), spawn(8, beginnerVipers), spawn(4, beginnerCobras);
wait(145), round(12), spawn(6, beginnerPeople), spawn(6, beginnerScouts), spawn(12, beginnerWheels), spawn(8, beginnerVipers), spawn(4, beginnerCobras);
wait(140), round(13), spawn(6, beginnerPeople), spawn(6, beginnerScouts), spawn(12, beginnerWheels), spawn(10, beginnerVipers), spawn(5, beginnerCobras);
wait(140), round(14), spawn(6, beginnerPeople), spawn(6, beginnerScouts), spawn(14, beginnerWheels), spawn(10, beginnerVipers), spawn(6, beginnerCobras);
wait(180), round(15), spawn(6, beginnerPeople), spawn(6, beginnerScouts), spawn(15, beginnerWheels), spawn(10, beginnerVipers), spawn(8, beginnerCobras);
