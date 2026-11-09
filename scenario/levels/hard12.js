// Ridge Network: isolated native Towers wave profile.
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
wait(150), round(1), spawn(13, scavs), spawn(12, wheels), spawn(12, vipers);
wait(124), round(2), spawn(14, scavs), spawn(13, wheels), spawn(13, vipers);
wait(123), round(3), spawn(15, scavs), spawn(15, wheels), spawn(14, vipers);
wait(121), round(4), spawn(17, scavs), spawn(16, wheels), spawn(16, vipers);
wait(120), round(5), spawn(18, scavs), spawn(18, wheels), spawn(18, vipers);
wait(119), round(6), spawn(20, vipers), spawn(20, cobras), spawn(19, cybsT1);
wait(117), round(7), spawn(21, vipers), spawn(21, cobras), spawn(21, cybsT1);
wait(116), round(8), spawn(23, vipers), spawn(23, cobras), spawn(23, cybsT1);
wait(115), round(9), spawn(25, vipers), spawn(25, cobras), spawn(24, cybsT1);
wait(114), round(10), spawn(27, vipers), spawn(26, cobras), spawn(26, cybsT1);
wait(113), round(11), spawn(22, cobras), spawn(22, pythons), spawn(21, scorps), spawn(21, cybsT2);
wait(111), round(12), spawn(23, cobras), spawn(23, pythons), spawn(23, scorps), spawn(22, cybsT2);
wait(110), round(13), spawn(24, cobras), spawn(24, pythons), spawn(24, scorps), spawn(24, cybsT2);
wait(109), round(14), spawn(26, cobras), spawn(26, pythons), spawn(26, scorps), spawn(25, cybsT2);
wait(107), round(15), spawn(27, cobras), spawn(27, pythons), spawn(27, scorps), spawn(27, cybsT2);
wait(106), round(16), spawn(29, pythons), spawn(29, panthers), spawn(28, tigers), spawn(28, cybsT3);
wait(105), round(17), spawn(30, pythons), spawn(30, panthers), spawn(30, tigers), spawn(29, cybsT3);
wait(104), round(18), spawn(32, pythons), spawn(32, panthers), spawn(31, tigers), spawn(31, cybsT3);
wait(103), round(19), spawn(33, pythons), spawn(33, panthers), spawn(33, tigers), spawn(33, cybsT3);
wait(101), round(20), spawn(35, pythons), spawn(35, panthers), spawn(34, tigers), spawn(34, cybsT3);
wait(100), round(21), spawn(29, wyvernH), spawn(29, dragonT), spawn(29, cybsT4), spawn(29, nexus), spawn(28, seraph);
wait(99), round(22), spawn(30, wyvernH), spawn(30, dragonT), spawn(30, cybsT4), spawn(30, nexus), spawn(30, seraph);
wait(97), round(23), spawn(32, wyvernH), spawn(31, dragonT), spawn(31, cybsT4), spawn(31, nexus), spawn(31, seraph);
wait(96), round(24), spawn(33, wyvernH), spawn(33, dragonT), spawn(33, cybsT4), spawn(32, nexus), spawn(32, seraph);
wait(95), round(25), spawn(34, wyvernH), spawn(34, dragonT), spawn(34, cybsT4), spawn(34, nexus), spawn(33, seraph);
