// Two Rivers: isolated native Towers wave profile.
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


setResearchDelay(600);
const wtBaseReward=defaultPowerRewardFunction();
setPowerRewardFunction(power => wtBaseReward(power)*1.15);
wait(180), round(1), spawn(11, scavs), spawn(10, people);
wait(153), round(2), spawn(12, scavs), spawn(11, people);
wait(152), round(3), spawn(13, scavs), spawn(13, people);
wait(150), round(4), spawn(15, scavs), spawn(14, people);
wait(149), round(5), spawn(11, vipers), spawn(11, scavs), spawn(11, wheels);
wait(147), round(6), spawn(12, vipers), spawn(12, scavs), spawn(11, wheels);
wait(146), round(7), spawn(13, vipers), spawn(13, scavs), spawn(13, wheels);
wait(144), round(8), spawn(14, vipers), spawn(14, scavs), spawn(14, wheels);
wait(142), round(9), spawn(16, cobras), spawn(15, wheels), spawn(15, vipers);
wait(141), round(10), spawn(17, cobras), spawn(17, wheels), spawn(16, vipers);
wait(139), round(11), spawn(18, cobras), spawn(18, wheels), spawn(17, vipers);
wait(138), round(12), spawn(19, cobras), spawn(19, wheels), spawn(18, vipers);
wait(136), round(13), spawn(20, cybsT1), spawn(20, vipers), spawn(20, cobras);
wait(134), round(14), spawn(22, cybsT1), spawn(21, vipers), spawn(21, cobras);
wait(133), round(15), spawn(23, cybsT1), spawn(23, vipers), spawn(22, cobras);
wait(131), round(16), spawn(24, cybsT1), spawn(24, vipers), spawn(24, cobras);
wait(130), round(17), spawn(19, pythons), spawn(19, scorps), spawn(19, cybsT2), spawn(19, cobras);
wait(128), round(18), spawn(20, pythons), spawn(20, scorps), spawn(20, cybsT2), spawn(20, cobras);
wait(127), round(19), spawn(21, pythons), spawn(21, scorps), spawn(21, cybsT2), spawn(21, cobras);
wait(125), round(20), spawn(22, pythons), spawn(22, scorps), spawn(22, cybsT2), spawn(22, cobras);
