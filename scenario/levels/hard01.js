// Three Crowns: isolated native Towers wave profile.
// Authored difficulty; not gameplay/balance verified.
people = [
    "*BaBa MG* *BaBa Body* BaBaLegs",
]
scavs = [
    "*BusCannon* *School Bus Body* BaBaProp",
    "*Flamer* *School Bus Body* BaBaProp",
    "*BusCannon* *Fire Engine Body* BaBaProp",
    "*Flamer* *Fire Engine Body* BaBaProp",
    "*Jeep MG* *Jeep Body* BaBaProp",
    "*BabaRocket* *Rocket Jeep Body* BaBaProp",
    "*Buggy MG* *Buggy Body* BaBaProp",
    "*BabaRocket* *Rocket Buggy Body* BaBaProp",
    "*Trike MG* *Trike Body* BaBaProp",
]
wheels = [
    "Machinegun Viper Wheels",
    "Flamer Viper Wheels",
    "Light Cannon Viper Wheels",
]
vipers = [
    "Flamer Viper Half-tracks",
    "Twin Machinegun Viper Half-tracks",
    "Light Cannon Viper Half-tracks",
    "Mini-Rocket Pod Viper Half-tracks",
]
cobras = [
    "Heavy Machinegun Cobra Half-tracks",
    "Light Cannon Cobra Half-tracks",
    "Mini-Rocket Pod Cobra Half-tracks",
    "Medium Cannon Cobra Wheels",
]
mra = [
    "Mini-Rocket Array Scorpion Wheels",
    "Mini-Rocket Array Cobra Wheels",
]
bugs = [
    "Flamer Bug Hover",
    "Light Cannon Bug Hover",
]
scorps = [
    "Inferno Scorpion Hover",
    "Medium Cannon Scorpion Hover",
]
mantis = [
    "Plasmite Flamer Mantis Hover",
    "Heavy Cannon Mantis Hover",
]
pythons = [
    "Mini-Rocket Pod Python Half-tracks",
    "Medium Cannon Python Half-tracks",
    "Lancer Python Half-tracks",
    "Assault Gun Python Half-tracks",
    "Inferno Python Half-tracks",
]
panthers = [
    "Lancer Panther Half-tracks",
    "Assault Gun Panther Half-tracks",
    "Inferno Panther Half-tracks",
    "Assault Cannon Panther Half-tracks",
    "Tank Killer Panther Half-tracks",
]
hra = [
    "Heavy Rocket Array Panther Wheels",
]
tigers = [
    "Needle Gun Tiger Half-tracks",
    "Flashlight Tiger Half-tracks",
    "Scourge Missile Tiger Half-tracks",
]
nexus = [
    "Pulse Laser Retribution Half-tracks",
    "Rail Gun Retribution Half-tracks",
    "Scourge Missile Retribution Half-tracks",
]
seraph = [
    "Seraph Missile Array Retaliation Wheels",
    "Seraph Missile Array Retribution Wheels",
]
cybsT0 = [
    "Machinegunner Cyborg Light Body Cyborg Propulsion",
    "Cyborg Flamer Cyborg Light Body Cyborg Propulsion",
    "Heavy Gunner Cyborg Light Body Cyborg Propulsion",
]
cybsT1 = [
    "Cyborg Lancer Cyborg Light Body Cyborg Propulsion",
    "*Cyborg Thermite Weapon* Cyborg Light Body Cyborg Propulsion",
    "*CyborgRotMG* Cyborg Light Body Cyborg Propulsion",
]
cybsT2 = [
    "Super Heavy-Gunner Cyborg Heavy Body Cyborg Propulsion",
    "Super HVC Cyborg Cyborg Heavy Body Cyborg Propulsion",
    "Super Auto-Cannon Cyborg Cyborg Heavy Body Cyborg Propulsion",
    "Super Tank-Killer Cyborg Cyborg Heavy Body Cyborg Propulsion",
]
cybsT3 = [
    "*Cyb-Wpn-Rail1* Cyborg Light Body Cyborg Propulsion",
    "*Cyb-Wpn-Laser* Cyborg Light Body Cyborg Propulsion",
    "*Cyb-Wpn-Atmiss* Cyborg Light Body Cyborg Propulsion",
]
cybsT4 = [
    "Super Scourge Cyborg Cyborg Heavy Body Cyborg Propulsion",
    "Super Pulse Laser Cyborg Cyborg Heavy Body Cyborg Propulsion",
    "Super Rail-Gunner Cyborg Heavy Body Cyborg Propulsion",
]
vengeanceH = [
    "Hyper Velocity Cannon Vengeance Hover",
]
vengeanceT = [
    "Hyper Velocity Cannon Vengeance Tracks",
]
wyvernH = [
    "Twin Assault Cannon Wyvern Hover",
]
wyvernT = [
    "Twin Assault Cannon Wyvern Tracks",
]
dragonH = [
    "Seraph Missile Array Seraph Missile Array Dragon Hover",
    "Gauss Cannon Gauss Cannon Dragon Hover",
]
dragonT = [
    "Seraph Missile Array Seraph Missile Array Dragon Tracks",
    "Gauss Cannon Gauss Cannon Dragon Tracks",
]


setResearchDelay(360);
const wtBaseReward=defaultPowerRewardFunction();
setPowerRewardFunction(power => wtBaseReward(power)*1);
wait(150), round(1), spawn(11, wheels), spawn(11, vipers), spawn(10, scavs);
wait(129), round(2), spawn(12, wheels), spawn(11, vipers), spawn(11, scavs);
wait(128), round(3), spawn(13, wheels), spawn(13, vipers), spawn(12, scavs);
wait(126), round(4), spawn(14, wheels), spawn(14, vipers), spawn(13, scavs);
wait(125), round(5), spawn(16, wheels), spawn(15, vipers), spawn(15, scavs);
wait(124), round(6), spawn(17, cobras), spawn(17, cybsT1), spawn(16, vipers);
wait(122), round(7), spawn(18, cobras), spawn(18, cybsT1), spawn(18, vipers);
wait(121), round(8), spawn(20, cobras), spawn(19, cybsT1), spawn(19, vipers);
wait(120), round(9), spawn(21, cobras), spawn(21, cybsT1), spawn(21, vipers);
wait(119), round(10), spawn(23, cobras), spawn(23, cybsT1), spawn(22, vipers);
wait(118), round(11), spawn(19, pythons), spawn(18, scorps), spawn(18, cybsT2), spawn(18, cobras);
wait(116), round(12), spawn(20, pythons), spawn(19, scorps), spawn(19, cybsT2), spawn(19, cobras);
wait(115), round(13), spawn(21, pythons), spawn(21, scorps), spawn(20, cybsT2), spawn(20, cobras);
wait(114), round(14), spawn(22, pythons), spawn(22, scorps), spawn(22, cybsT2), spawn(21, cobras);
wait(112), round(15), spawn(23, pythons), spawn(23, scorps), spawn(23, cybsT2), spawn(23, cobras);
wait(111), round(16), spawn(25, panthers), spawn(24, tigers), spawn(24, cybsT3), spawn(24, pythons);
wait(110), round(17), spawn(26, panthers), spawn(26, tigers), spawn(25, cybsT3), spawn(25, pythons);
wait(109), round(18), spawn(27, panthers), spawn(27, tigers), spawn(27, cybsT3), spawn(26, pythons);
wait(108), round(19), spawn(28, panthers), spawn(28, tigers), spawn(28, cybsT3), spawn(28, pythons);
wait(106), round(20), spawn(30, panthers), spawn(30, tigers), spawn(29, cybsT3), spawn(29, pythons);
wait(105), round(21), spawn(25, seraph), spawn(25, wyvernH), spawn(24, dragonT), spawn(24, cybsT4), spawn(24, nexus);
wait(104), round(22), spawn(26, seraph), spawn(26, wyvernH), spawn(26, dragonT), spawn(25, cybsT4), spawn(25, nexus);
wait(102), round(23), spawn(27, seraph), spawn(27, wyvernH), spawn(27, dragonT), spawn(26, cybsT4), spawn(26, nexus);
wait(101), round(24), spawn(28, seraph), spawn(28, wyvernH), spawn(28, dragonT), spawn(28, cybsT4), spawn(27, nexus);
wait(100), round(25), spawn(29, seraph), spawn(29, wyvernH), spawn(29, dragonT), spawn(29, cybsT4), spawn(28, nexus);
