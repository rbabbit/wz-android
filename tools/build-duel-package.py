"""Build the offline Duel VFS/HTML from stock data and the frozen native program.

Only a separate runtime copy's literal loadPackage metadata changes. The current
Towers JS/WASM/data/index/mobile and scenario files are inputs, never outputs.
"""
from pathlib import Path
from hashlib import sha256
from copy import deepcopy
import argparse
import json
import re
import runpy
import shutil
import struct

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
SOURCE = ROOT / "scenario/duel"
VENDOR = ROOT / "vendor/duel-stock"
MAP = ROOT / "map/duel-ro-half"
STOCK_SIZE = 64424618
STOCK_HASH = "9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424"
helpers = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"), run_name="duel_package_helpers")
package_call = helpers["package_call"]


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(value):
    return sha256(value).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else value.encode("utf-8"))


def dump(path, value):
    write(path, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def import_source(old):
    """One-time import; subsequent clean builds use only retained project inputs."""
    require((old / "README-1V1.md").is_file(), "Expected the retained offline prototype")
    copy = {
        old / "vendor/1v1/stock/package-index.json": VENDOR / "package-index.json",
        old / "vendor/1v1/original/RO_1v1Full.wz": ROOT / "vendor/duel-map/original/RO_1v1Full.wz",
    }
    copy.update({p: ROOT / "vendor/duel-map/map" / p.name for p in (old / "vendor/1v1/map").iterdir() if p.is_file()})
    for src, dst in copy.items():
        if dst.exists():
            require(dst.read_bytes() == src.read_bytes(), "Refusing to replace imported input: " + str(dst))
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    dump(VENDOR / "IMPORT.json", {"source":"Retained offline prototype stock package metadata; official Warzone 4.7.0",
        "stockPrefixBytes":STOCK_SIZE, "stockPrefixSHA256":STOCK_HASH,
        "inputs":[{"path":p.relative_to(ROOT).as_posix(), "sha256":digest(p.read_bytes())} for p in copy.values()]})


class Stock:
    def __init__(self, data):
        self.data = data
        self.files = json.loads((VENDOR / "package-index.json").read_text(encoding="utf-8"))
        self.index = {e["filename"]:e for e in self.files}
        require(len(self.index) == len(self.files), "Duplicate stock package paths")
        require(digest(data[:STOCK_SIZE]) == STOCK_HASH, "Stock data prefix identity changed")
        require(all(0 <= e["start"] <= e["end"] <= STOCK_SIZE for e in self.files), "Invalid stock offsets")

    def read(self, name):
        e = self.index[name]
        return self.data[e["start"]:e["end"]]

    def text(self, name):
        return self.read(name).decode("utf-8")

    def json(self, name):
        return json.loads(self.read(name))


def map_variant():
    src = ROOT / "vendor/duel-map/map"
    raw = (src / "game.map").read_bytes()
    w, h = struct.unpack_from("<II", raw, 8)
    require((w, h) == (37, 150), "Unexpected authored map dimensions")
    cut_start, cut_end, height = 37, 112, 75
    def tile_y(y):
        return y if y < cut_start else y - 75 if y >= cut_end else None
    def move(records):
        answer = []
        for original in records:
            item = deepcopy(original)
            y = tile_y(item["position"][1] / 128)
            require(y is not None, "Authored object lies in the removed corridor")
            item["position"][1] = round(y * 128)
            answer.append(item)
        return answer
    structs = json.loads((src / "struct.json").read_text())["structures"]
    generators, oil = set(), set()
    for player in (0, 1):
        for kind, chosen in (("A0PowerGenerator", generators), ("A0ResourceExtractor", oil)):
            candidates = sorted((s for s in structs if s["startpos"] == player and s["name"] == kind), key=lambda s:s["position"])
            chosen.update(tuple(s["position"]) for s in candidates[::2])
    structs = [s for s in structs if (s["name"] not in ("A0PowerGenerator", "A0PowMod1") or tuple(s["position"]) in generators)
               and (s["name"] != "A0ResourceExtractor" or tuple(s["position"]) in oil)]
    features = json.loads((src / "feature.json").read_text())["features"]
    features = [s for s in features if s["name"] != "OilResource" or tuple(s["position"]) in oil]
    droids = json.loads((src / "droid.json").read_text())["droids"]
    header = bytearray(raw[:16]); struct.pack_into("<I", header, 12, height)
    tiles = raw[16:16 + w * cut_start * 4] + raw[16 + w * cut_end * 4:16 + w * h * 4]
    offset, gateways = 16 + w * h * 4, []
    require(struct.unpack_from("<I", raw, offset)[0] == 1, "Unsupported gateway format")
    for i in range(struct.unpack_from("<I", raw, offset + 4)[0]):
        g = bytearray(raw[offset + 8 + i * 4:offset + 12 + i * 4])
        if tile_y(g[1]) is not None and tile_y(g[3]) is not None:
            g[1], g[3] = tile_y(g[1]), tile_y(g[3]); gateways.append(g)
    write(MAP / "game.map", bytes(header) + tiles + struct.pack("<II", 1, len(gateways)) + b"".join(gateways))
    for name, key, records in (("struct", "structures", structs), ("feature", "features", features), ("droid", "droids", droids)):
        dump(MAP / (name + ".json"), {"version":2, key:move(records)})
    write(MAP / "ttypes.ttp", (src / "ttypes.ttp").read_bytes())
    gam = json.loads((src / "gam.json").read_text()); gam["ScrollMaxY"] = height
    dump(MAP / "gam.json", gam)
    write(MAP / "level.lev", '// RO_1v1Full CC0-1.0; reproducible half-area Duel variant\nlevel Duel-RO-Half-T1\nplayers 2\ntype 14\ndataset MULTI_CAM_1\ngame "multiplay/maps/duel-ro-half.gam"\n')
    counts = {}
    for p in (0, 1):
        own = [s for s in structs if s["startpos"] == p]
        counts[p] = {n:sum(s["name"] == n for s in own) for n in sorted({s["name"] for s in own})}
        for kind in ("A0PowerGenerator", "A0ResearchFacility", "A0LightFactory", "A0CyborgFactory"):
            require(counts[p][kind] == 5, "Authored facility count changed")
        require(counts[p]["A0ResourceExtractor"] == 20 and counts[p]["A0CommandCentre"] == 1, "Authored economy/HQ changed")
        require(sum(d["startpos"] == p for d in droids) == 4, "Authored constructor count changed")
    dump(MAP / "PROVENANCE.json", {"source":"vendor/duel-map/original/RO_1v1Full.wz", "license":"CC0-1.0", "original":[w,h],
        "variant":[w,height], "removedRows":[cut_start,cut_end-1], "gateways":len(gateways), "counts":counts})


def generate_policy(stock):
    research = stock.json("/data/mp/stats/research.json")
    weapons = stock.json("/data/mp/stats/weapons.json")
    structures = stock.json("/data/mp/stats/structure.json")
    propulsion = stock.json("/data/mp/stats/propulsion.json")
    bodies = stock.json("/data/mp/stats/body.json")
    air_components = sorted({k for k,v in propulsion.items() if v.get("type") in ("Lift", "Propellor")}
        | {k for k,v in bodies.items() if v.get("class") == "Transports" or v.get("droidType") in ("TRANSPORTER", "SUPERTRANSPORTER")})
    weapon_class = {}
    for key, value in weapons.items():
        subclass = value.get("weaponSubClass")
        air = "VTOL" in key.upper() or value.get("flags") == "AirOnly"
        # Missile/rocket AA launchers are not ground weapons. Native surfaceToAir
        # flags vary across stock entries, so require an actual ground effect.
        aa = "SAM" in key.upper() or "A-A" in str(value.get("weaponEffect", "")) or "AA" in key.upper()
        weapon_class[key] = "cannon" if subclass == "CANNON" and not air and not aa else "rockets" if subclass in ("ROCKET", "MISSILE") and not air and not aa else "blocked"
    classes = {}
    def kinds(ids):
        return {weapon_class[x] for x in ids if x in weapon_class}
    for key, value in research.items():
        if key.startswith("_"): continue
        effects = kinds(value.get("resultComponents", []))
        for structure in value.get("resultStructures", []): effects.update(kinds(structures.get(structure, {}).get("weapons", [])))
        impacts = {r.get("filterValue") for r in value.get("results", []) if r.get("class") == "Weapon"}
        non_ground = any(x in air_components for x in value.get("resultComponents", []))
        if non_ground: kind = "blocked"
        elif effects - {"blocked"} == {"cannon"}: kind = "cannon"
        elif effects - {"blocked"} == {"rockets"}: kind = "rockets"
        elif key.startswith("R-Wpn-Cannon-") or impacts and impacts <= {"CANNON"}: kind = "cannon"
        elif key.startswith(("R-Wpn-Rocket-", "R-Wpn-Missile-")) or impacts and impacts <= {"ROCKET", "MISSILE"}: kind = "rockets"
        elif effects or key.startswith("R-Wpn-") or "VTOL" in key.upper() or key.startswith("R-Sys-NEXUS"): kind = "blocked"
        else: kind = "core"
        classes[key] = kind
    # Preserve each family's internal progression. Replace only foreign-family
    # prerequisites with the neutral shared Engineering bootstrap, explicitly.
    replacements = []
    for key, value in research.items():
        if key not in classes: continue
        kind = classes[key]
        if kind == "blocked":
            value["requiredResearch"] = ["R-Duel-Locked"]
            # Disabled branches share one unreachable gate instead of their old
            # upgrade chain; remove only their now-invalid native grouping.
            value.pop("category", None)
        else:
            allowed = {"core", kind} if kind != "core" else {"core"}
            prerequisites = []
            for previous in value.get("requiredResearch", []):
                if classes.get(previous) not in allowed:
                    replacements.append({"topic":key, "old":previous, "replacement":"R-Sys-Engineering01"})
                    previous = "R-Sys-Engineering01"
                if previous != key and previous not in prerequisites: prerequisites.append(previous)
            if kind != "core": prerequisites.append("R-Duel-License-" + kind)
            value["requiredResearch"] = prerequisites
        # A mixed stock unlock must not silently make an unrelated weapon usable.
        value["resultComponents"] = [x for x in value.get("resultComponents", []) if x not in weapon_class or weapon_class[x] == kind]
    for name in ("cannon", "rockets"):
        research["R-Duel-License-" + name] = {"id":"R-Duel-License-" + name, "name":name.title() + " doctrine", "iconID":"IMAGE_RES_SYSTEMTECH", "researchPoints":1, "researchPower":0}
    research["R-Duel-Locked"] = {"id":"R-Duel-Locked", "name":"Unavailable doctrine", "iconID":"IMAGE_RES_SYSTEMTECH", "researchPoints":1, "researchPower":0}
    # The stock basic templates are local engine data, not phone library writes.
    templates = stock.json("/data/mp/stats/templates.json")
    starters = {"cannon":{"research":"R-Wpn-Cannon1Mk1", "weapon":"Cannon1Mk1", "name":"Light Cannon Viper Wheels"},
                "rockets":{"research":"R-Wpn-Rocket05-MiniPod", "weapon":"Rocket-Pod", "name":"Mini-Rocket Viper Wheels"}}
    for branch, starter in starters.items():
        require(weapon_class[starter["weapon"]] == branch and classes[starter["research"]] == branch, "Starter policy mismatch")
        key = "Duel-Starter-" + branch
        templates[key] = {"available":True, "body":"Body1REC", "id":key, "name":starter["name"], "propulsion":"wheeled01", "type":"WEAPON", "weapons":[starter["weapon"]]}
    plans = {}
    for branch in starters:
        plans[branch] = sorted((k for k,c in classes.items() if c in ("core",branch)), key=lambda k:(research[k].get("researchPower",0),research[k].get("researchPoints",0),k))
    policy = {"version":1, "researchClass":classes, "weaponClass":weapon_class, "airComponents":air_components,
        "researchCategory":{k:r.get("category", "") for k,r in research.items()}, "starters":starters, "researchPlan":plans,
        "prerequisiteReplacements":replacements}
    dump(SOURCE / "research.json", research); dump(SOURCE / "templates.json", templates); dump(SOURCE / "policy.json", policy)
    return policy


def replace_function(source, name, body):
    match = re.search(r"function " + re.escape(name) + r"\([^)]*\)\s*\{", source)
    require(match is not None, "Missing stock function: " + name)
    opening = source.index("{", match.start()); depth = 1; pos = opening + 1
    # These stock functions have no braces embedded in strings/comments.
    while depth:
        depth += (source[pos] == "{") - (source[pos] == "}"); pos += 1
    return source[:opening+1] + "\n" + body + "\n}" + source[pos:]


def generate_native_scripts(stock):
    for name, virtual in {
        "nb-generic.js":"/data/mp/multiplay/skirmish/nb_generic.js",
        "nb-produce.js":"/data/mp/multiplay/skirmish/nb_includes/produce.js",
        "nb-research.js":"/data/mp/multiplay/skirmish/nb_includes/research.js",
        "camTechEnabler.js":"/data/mp/multiplay/script/functions/camTechEnabler.js",
    }.items():
        write(SOURCE / "stock" / name, stock.read(virtual))
    bridge = (ROOT / "scenario/warzone-towers-bridge.js").read_text(encoding="utf-8")
    start = bridge.index("function warzoneTowersDiagnosticSnapshot()")
    end = bridge.index("function blockNightV31PollZoomCommand()", start)
    bridge = bridge[:start] + bridge[end:]
    bridge = bridge.replace('setTimer("warzoneTowersDiagnosticSnapshot", 5000);', '')
    bridge = bridge.replace("return enumResearch().sort(function", "return enumResearch().filter(function (topic) { return duelResearchAllowed(topic.id, selectedPlayer); }).sort(function")
    require("Spawner" not in bridge and "scavAI" not in bridge, "Towers diagnostics leaked into Duel")
    write(SOURCE / "research-bridge.js", bridge)
    commands = (ROOT / "scenario/warzone-towers-commands.js").read_text(encoding="utf-8")
    commands += "\n" + (SOURCE / "command-policy.js").read_text(encoding="utf-8")
    write(SOURCE / "commands.js", commands)
    generic = stock.text("/data/mp/multiplay/skirmish/nb_generic.js")
    lo, hi = generic.index("const subpersonalities ="), generic.index("// this function describes the early build order")
    personality = '''const subpersonalities = {DUEL:{
 chatalias:duelBranch(me)==="cannon"?"mc":"mr",
 weaponPaths:duelBranch(me)==="cannon"?[weaponStats.cannons]:[weaponStats.rockets_AT,weaponStats.rockets_AS,weaponStats.rockets_Arty],
 earlyResearch:duelResearchPlan(me),minTanks:1,becomeHarder:3,maxTanks:16,minTrucks:3,minHoverTrucks:4,maxSensors:1,
 minMiscTanks:1,maxMiscTanks:2,vtolness:0,defensiveness:65,maxPower:700,repairAt:50
}};
'''
    generic = 'include("tests/duel-policy.js");\n' + generic[:lo] + personality + generic[hi:]
    write(SOURCE / "ai.js", generic)
    dump(SOURCE / "ai.json", {"AI":{"js":"duel-ai.js", "name":"Opponent", "tip":"Offline opponent using the opposite weapon doctrine"}})
    production = stock.text("/data/mp/multiplay/skirmish/nb_includes/produce.js")
    marker = "function ourBuildDroid(factory, name, bodies, propulsions, weapons1, weapons2, weapons3)\n{"
    require(marker in production, "Stock NullBot production signature changed")
    production = production.replace(marker, marker + '''
 bodies=duelFilterWeapons(bodies,me);propulsions=duelFilterWeapons(propulsions,me);
 if(Array.isArray(bodies)&&!bodies.length||Array.isArray(propulsions)&&!propulsions.length)return false;
 const choices=[weapons1,weapons2,weapons3];
 const checked=choices.map(function(value){return duelFilterWeapons(value,me);});
 for(let i=0;i<choices.length;i++)if(choices[i]&&Array.isArray(checked[i])&&!checked[i].length)return false;
 weapons1=checked[0];weapons2=checked[1];weapons3=checked[2];
''', 1)
    write(SOURCE / "ai-production.js", production)
    ai_research = stock.text("/data/mp/multiplay/skirmish/nb_includes/research.js")
    ai_research = replace_function(ai_research, "doResearch", "    return pursueResearch(lab, duelResearchPlan(me));")
    write(SOURCE / "ai-research.js", ai_research)
    challenge = {"challenge":{"bases":3, "description":"Destroy the enemy Command Centre.", "difficulty":"Medium", "map":"Duel-RO-Half-T1", "maxPlayers":2,
        "name":"Offline Duel", "powerLevel":1, "scavengers":0, "techLevel":1, "version":2},
        "locked":{k:True for k in ("ai","alliances","bases","difficulty","position","power","scavengers","teams")},
        "player_0":{"name":"Commander", "position":0,"team":0},
        "player_1":{"ai":"multiplay/skirmish/duel-ai.js", "difficulty":"Medium", "name":"Opponent", "position":1,"team":1}}
    dump(SOURCE / "challenge.json", challenge)


def generate_html(runtime):
    index = (ASSETS / "index.html").read_text(encoding="utf-8")
    config = '''
    const duelHumanBranch = new URLSearchParams(location.search).get('weapon') === 'rockets' ? 'rockets' : 'cannon';
    window.__warzoneDuelConfig = Object.freeze({mode:'duel',humanBranch:duelHumanBranch,botBranch:duelHumanBranch === 'cannon' ? 'rockets' : 'cannon'});
'''
    index = index.replace("    var WZ_CONFIG_DIR_SUFFIX = null;", config + "    var WZ_CONFIG_DIR_SUFFIX = null;", 1)
    require("duelHumanBranch" in index, "Missing Duel early config insertion")
    index = index.replace("return '/warzone2100' + WZ_CONFIG_DIR_SUFFIX;", "return '/warzone2100-duel-' + duelHumanBranch + WZ_CONFIG_DIR_SUFFIX;", 1)
    old = "Module.arguments.push(towerMap === 'td1' ? '--skirmish=warzonetowers-td1.json' : '--skirmish=warzonetowers.json');"
    require(old in index, "Towers launcher argument changed")
    index = index.replace(old, "Module.arguments.push('--skirmish=duel.json');", 1)
    index = index.replace('if (path.endsWith(".data")) {', 'if (path === "warzone2100.data") return "warzone2100-duel.data";\n        if (path.endsWith(".data")) {', 1)
    prepare = (SOURCE / "runtime-prepare.js").read_text(encoding="utf-8")
    index = index.replace("    function constructWZModuleConfig(additional_command_line_args) {", prepare + "\n    function constructWZModuleConfig(additional_command_line_args) {", 1)
    index = index.replace("      return Module;", "      prepareDuelModule(Module, window.__warzoneDuelConfig);\n      return Module;", 1)
    index = index.replace('src="warzone2100.js"', 'src="warzone2100-duel.js"')
    write(ASSETS / "index-duel.html", index)
    mobile = (ASSETS / "mobile.html").read_text(encoding="utf-8")
    host_config = "<script>const branch=new URLSearchParams(location.search).get('weapon')==='rockets'?'rockets':'cannon';window.__warzoneDuelConfig=Object.freeze({mode:'duel',humanBranch:branch,botBranch:branch==='cannon'?'rockets':'cannon'});</script>"
    mobile = mobile.replace("<head>", "<head>\n  " + host_config, 1)
    mobile = mobile.replace('"index.html" + location.search', '"index-duel.html" + location.search', 1)
    write(ASSETS / "mobile-duel.html", mobile)
    require('return \"cannon\"' not in index, "Unexpected branch override")


def build():
    baseline_js = (ASSETS / "warzone2100.js").read_bytes()
    baseline_data = (ASSETS / "warzone2100.data").read_bytes()
    stock = Stock(baseline_data)
    map_variant(); policy = generate_policy(stock); generate_native_scripts(stock)
    script = baseline_js.decode("utf-8")
    begin, end, original_call, metadata = package_call(script)
    entries = {e["filename"]:deepcopy(e) for e in stock.files}
    data = bytearray(baseline_data[:STOCK_SIZE])
    appended = []
    def add(virtual, content):
        content = content.encode("utf-8") if isinstance(content, str) else content
        start = len(data); data.extend(content)
        entries[virtual] = {"filename":virtual,"start":start,"end":len(data)}
        appended.append({"path":virtual,"sha256":digest(content),"bytes":len(content)})
    def file(virtual, path): add(virtual, path.read_bytes())
    add("/data/mp/addon.lev", stock.read("/data/mp/addon.lev") + b"\n" + (MAP / "level.lev").read_bytes())
    for name in ("game.map", "ttypes.ttp", "droid.json", "feature.json", "struct.json", "gam.json"):
        file("/data/mp/multiplay/maps/duel-ro-half/" + name, MAP / name)
    file("/data/mp/multiplay/maps/duel-ro-half.gam", MAP / "gam.json")
    for name, src in (("duel.json", "challenge.json"), ("duel-policy.js", "policy.js"), ("duel-rules.js", "rules.js"),
                      ("duel-commands.js", "commands.js"), ("duel-research-bridge.js", "research-bridge.js")):
        file("/data/mp/tests/" + name, SOURCE / src)
    file("/data/mp/multiplay/script/rules/init.js", SOURCE / "rules.js")
    file("/data/mp/multiplay/script/duel-policy.json", SOURCE / "policy.json")
    for folder in ("multiplay/script", "multiplay/script/rules", "multiplay/skirmish"):
        add("/data/mp/" + folder + "/duel-config.json", json.dumps({"mode":"duel","humanBranch":"cannon","botBranch":"rockets"}))
        if folder != "multiplay/script": file("/data/mp/" + folder + "/duel-policy.json", SOURCE / "policy.json")
    file("/data/mp/multiplay/skirmish/duel-ai.js", SOURCE / "ai.js")
    file("/data/mp/multiplay/skirmish/duel-ai.json", SOURCE / "ai.json")
    file("/data/mp/multiplay/skirmish/nb_includes/produce.js", SOURCE / "ai-production.js")
    file("/data/mp/multiplay/skirmish/nb_includes/research.js", SOURCE / "ai-research.js")
    file("/data/mp/stats/research.json", SOURCE / "research.json")
    file("/data/mp/stats/templates.json", SOURCE / "templates.json")
    for name in ("warzone-towers-catalog.json", "warzone-towers-command.json", "warzone-towers-control-command.json", "blocknight-queue-command.json", "blocknight-zoom-command.json"):
        file("/data/mp/tests/" + name, ROOT / "scenario" / name)
        file("/data/mp/multiplay/script/rules/" + name, ROOT / "scenario" / name)
    new_metadata = dict(metadata, files=list(entries.values()), remote_package_size=len(data), package_uuid="duel-" + digest(data))
    text = json.dumps(new_metadata, separators=(",", ":"), ensure_ascii=False)
    call = "loadPackage(" + text + ")"
    generated = script[:begin] + call + script[end:]
    b, e, _, parsed = package_call(generated)
    require(generated[:b] + "PACKAGE" + generated[e:] == script[:begin] + "PACKAGE" + script[end:], "Compiled runtime changed outside literal package metadata")
    require(parsed["remote_package_size"] == len(data), "Duel package length mismatch")
    require(len(entries) == len({e["filename"] for e in parsed["files"]}), "Duplicate Duel VFS file")
    write(ASSETS / "warzone2100-duel.js", generated)
    write(ASSETS / "warzone2100-duel.data", bytes(data))
    generate_html(generated)
    proof = {"passed":True, "version":1, "method":"Separate stock-data Duel VFS, latest native runtime copy with metadata-only replacement; shared unmodified WASM",
        "towersInputs":[{"path":p.relative_to(ROOT).as_posix(),"sha256":digest(p.read_bytes())} for p in
            [ASSETS / n for n in ("warzone2100.js","warzone2100.wasm","warzone2100.data","index.html","mobile.html")]],
        "stockPrefixBytes":STOCK_SIZE,"stockPrefixSHA256":STOCK_HASH,"stockRecords":len(stock.files),"duelRecords":len(entries),
        "compiledProgramUnchangedOutsidePackageMetadata":True,"sharedWASM":True,
        "runtimeHook":"monitorRunDependencies zero before dependenciesFulfilled/callMain; onRuntimeInitialized is absent in frozen runtime",
        "directoryHook":"constructWZModuleConfig preRun FIFO mkdir before generated runWithFS/DataRequest, including synchronous cache hits",
        "outputs":[{"path":p.relative_to(ROOT).as_posix(),"sha256":digest(p.read_bytes()),"bytes":p.stat().st_size} for p in
            [ASSETS / n for n in ("warzone2100-duel.js","warzone2100-duel.data","index-duel.html","mobile-duel.html")]],
        "virtualOverrides":appended,"researchCounts":{kind:sum(c==kind for c in policy["researchClass"].values()) for kind in ("core","cannon","rockets","blocked")}}
    dump(SOURCE / "PACKAGE.json", proof)
    print(json.dumps({k:v for k,v in proof.items() if k not in ("towersInputs","outputs","virtualOverrides")}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-source", type=Path, help="One-time retained RO map and official stock index import")
    args = parser.parse_args()
    if args.import_source: import_source(args.import_source)
    build()
