/* Block Night scenario injected into the official Warzone 2100 virtual filesystem. */
(() => {
  "use strict";

  const scenario = {
    challenge: {
      name: "Block Night: Five vs Ten",
      map: "Sk-Startup",
      maxPlayers: 2,
      scavengers: 0,
      alliances: 0,
      powerLevel: 0,
      bases: 1,
      techLevel: 1
    },
    locked: {
      power: true,
      alliances: true,
      teams: true,
      difficulty: true,
      ai: true,
      scavengers: true,
      position: true,
      bases: true
    },
    scripts: { rules: "blocknight-rules.js" },
    player_0: {
      name: "Cobra Five",
      ai: "multiplay/skirmish/semperfi.js",
      difficulty: "Medium",
      team: 0,
      position: 0
    },
    player_1: {
      name: "Flamer Ten",
      ai: "multiplay/skirmish/semperfi.js",
      difficulty: "Medium",
      team: 1,
      position: 1
    }
  };

  const rules = String.raw`
receiveAllEvents(true);

var blockNightStarted = false;
var blockNightFinished = false;

function eventGameInit()
{
  hackNetOff();
  setAlliance(0, 1, false);
  setPower(0, 0);
  setPower(0, 1);
  setScrollLimits(8, 82, 56, 122);
  centreView(32, 103);
  queue("blockNightPrepare", 400);
}

function blockNightClearPlayer(player)
{
  for (const droid of enumDroid(player)) removeObject(droid, false);
  for (const structure of enumStruct(player)) removeObject(structure, false);
}

function blockNightPrepare()
{
  blockNightClearPlayer(0);
  blockNightClearPlayer(1);
  queue("blockNightSpawn", 700);
}

function blockNightSpawn()
{
  const components = ["Body5REC", "tracked01", "Cannon2A-TMk1",
                      "CyborgLightBody", "CyborgLegs", "CyborgFlamer01"];
  for (let player = 0; player < 2; ++player)
  {
    for (const component of components) makeComponentAvailable(component, player);
  }

  for (let i = 0; i < 5; ++i)
  {
    const tank = addDroid(0, 24, 99 + i * 2, "Cobra Medium Cannon",
                          "Body5REC", "tracked01", "", "", "Cannon2A-TMk1");
    if (tank) setDroidExperience(tank, 0);
  }

  for (let i = 0; i < 10; ++i)
  {
    const row = Math.floor(i / 2);
    const column = i % 2;
    const cyborg = addDroid(1, 40 + column * 2, 97 + row * 2,
                            "Flamer Cyborg", "CyborgLightBody", "CyborgLegs",
                            "", "", "CyborgFlamer01");
    if (cyborg) setDroidExperience(cyborg, 0);
  }

  blockNightStarted = true;
  console("BLOCK NIGHT — 5 Cobra Medium Cannon tanks vs 10 Flamer Cyborgs");
  setTimer("blockNightIssueOrders", 800);
  setTimer("blockNightCheckResult", 500);
  blockNightIssueOrders();
}

function blockNightNearest(source, targets)
{
  let nearest = null;
  let best = 999999999;
  for (const target of targets)
  {
    const dx = source.x - target.x;
    const dy = source.y - target.y;
    const distance = dx * dx + dy * dy;
    if (distance < best) { best = distance; nearest = target; }
  }
  return nearest;
}

function blockNightIssueOrders()
{
  if (!blockNightStarted || blockNightFinished) return;
  const tanks = enumDroid(0);
  const cyborgs = enumDroid(1);
  for (const tank of tanks)
  {
    const target = blockNightNearest(tank, cyborgs);
    if (target) orderDroidObj(tank, DORDER_ATTACK, target);
  }
  for (const cyborg of cyborgs)
  {
    const target = blockNightNearest(cyborg, tanks);
    if (target) orderDroidObj(cyborg, DORDER_ATTACK, target);
  }
}

function blockNightCheckResult()
{
  if (!blockNightStarted || blockNightFinished) return;
  const tanks = enumDroid(0).length;
  const cyborgs = enumDroid(1).length;
  if (tanks > 0 && cyborgs > 0) return;
  blockNightFinished = true;
  removeTimer("blockNightIssueOrders");
  removeTimer("blockNightCheckResult");
  if (tanks > 0)
  {
    console("COBRA FIVE WIN — " + tanks + " tank(s) survived");
    gameOverMessage(true, false, false);
  }
  else if (cyborgs > 0)
  {
    console("FLAMER TEN WIN — " + cyborgs + " cyborg(s) survived");
    gameOverMessage(false, false, false);
  }
  else
  {
    console("MUTUAL DESTRUCTION");
    gameOverMessage(false, false, false);
  }
}
`;

  window.BlockNightScenario = {
    arguments: ["--skirmish=blocknight.json", "--autogame"],
    install(Module) {
      const encoder = new TextEncoder();
      Module.FS_createDataFile("/data/mp/tests", "blocknight.json",
        encoder.encode(JSON.stringify(scenario)), true, true, true);
      Module.FS_createDataFile("/data/mp/tests", "blocknight-rules.js",
        encoder.encode(rules), true, true, true);
      console.log("Block Night scenario installed into official Warzone filesystem");
    }
  };
})();
