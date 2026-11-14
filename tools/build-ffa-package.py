"""Build an isolated native multi-map FFA VFS from the retained stock data.

The matching generic JS/WASM program is reused. Only this new loader's literal
package metadata, data filename and private stdout filter are adapted. Existing
Towers, Campaign and deferred Duel outputs are never regenerated or overwritten.
"""
from pathlib import Path
from hashlib import sha256
from copy import deepcopy
from zipfile import ZipFile
import argparse
import json
import re
import runpy
import struct

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
SOURCE = ROOT / "scenario/ffa"
MAP = ROOT / "map/ffa-emag"
ORIGINAL = ROOT / "vendor/ffa-map/original/EMAG_FFA.wz"
SUPPLIED_HASH = "b3181ca918ecac7ab4ceb38565b6e3c425f96bea735e550ea6cbb53c150a9c87"
STOCK_SIZE = 64424618
STOCK_HASH = "9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424"
helpers = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"), run_name="ffa_package_helpers")
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


class Stock:
    def __init__(self, data):
        self.data = data
        self.files = json.loads((ROOT / "vendor/duel-stock/package-index.json").read_text(encoding="utf-8"))
        self.index = {e["filename"]: e for e in self.files}
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


def import_map(supplied):
    if supplied:
        raw = supplied.read_bytes()
        require(digest(raw) == SUPPLIED_HASH, "Supplied FFA map SHA-256 differs")
        if ORIGINAL.exists():
            require(ORIGINAL.read_bytes() == raw, "Refusing to replace retained original map")
        else:
            write(ORIGINAL, raw)
    require(ORIGINAL.is_file(), "Import the supplied map with --import-map before a clean build")
    require(digest(ORIGINAL.read_bytes()) == SUPPLIED_HASH, "Retained original FFA map changed")
    with ZipFile(ORIGINAL) as archive:
        expected = {"level.json", "droid.json", "feature.json", "gam.json", "game.map", "struct.json", "ttypes.ttp"}
        require(set(archive.namelist()) == expected, "Unexpected supplied FFA archive contents")
        for name in sorted(expected):
            write(MAP / name, archive.read(name))
    level = json.loads((MAP / "level.json").read_text())
    require(level["name"] == "EMAG_FFA" and level["players"] == 4 and level["spdx-license-id"] == "CC0-1.0", "Unexpected authored FFA metadata")
    raw = (MAP / "game.map").read_bytes()
    require(struct.unpack_from("<II", raw, 8) == (128, 128), "Unexpected authored FFA dimensions")
    structures = json.loads((MAP / "struct.json").read_text())["structures"]
    droids = json.loads((MAP / "droid.json").read_text())["droids"]
    counts, starts = {}, {}
    for player in range(4):
        own = [s for s in structures if s["startpos"] == player]
        counts[player] = {name: sum(s["name"] == name for s in own) for name in sorted({s["name"] for s in own})}
        require(counts[player] == {"A0CommandCentre": 1, "A0PowMod1": 10, "A0PowerGenerator": 10,
            "A0ResearchFacility": 5, "A0ResearchModule1": 5, "A0ResourceExtractor": 40, "A0Sat-linkCentre": 1}, "Authored FFA base changed")
        own_droids = [d for d in droids if d["startpos"] == player]
        require(len(own_droids) == 4 and all(d["template"] == "ConstructionDroid" for d in own_droids), "Authored FFA constructors changed")
        starts[player] = [{"id": d["id"], "x": d["position"][0] / 128, "y": d["position"][1] / 128} for d in own_droids]
    # The original JSON files and terrain are copied byte-for-byte. This legacy
    # level descriptor merely registers them with the already-bundled engine.
    write(MAP / "level.lev", '// Exact EMAG_FFA by arc; CC0-1.0. No map modifications.\nlevel FFA-EMAG-T1\nplayers 4\ntype 14\ndataset MULTI_CAM_1\ngame "multiplay/maps/ffa-emag.gam"\n')
    provenance = {"source": "vendor/ffa-map/original/EMAG_FFA.wz", "sha256": SUPPLIED_HASH,
        "license": "CC0-1.0", "author": level["author"], "dimensions": [128, 128], "players": 4,
        "mapFilesByteIdentical": True, "addedFactories": 0, "counts": counts, "constructorStarts": starts,
        "files": [{"path": name, "sha256": digest((MAP / name).read_bytes())} for name in sorted(expected)]}
    dump(MAP / "PROVENANCE.json", provenance)
    return provenance


def generate_no_air_policy(stock):
    research = stock.json("/data/mp/stats/research.json")
    original_prerequisites = {k: list(v.get("requiredResearch", [])) for k, v in research.items()}
    propulsion = stock.json("/data/mp/stats/propulsion.json")
    bodies = stock.json("/data/mp/stats/body.json")
    weapons = stock.json("/data/mp/stats/weapons.json")
    structures = stock.json("/data/mp/stats/structure.json")
    air_parts = {k for k, v in propulsion.items() if v.get("type") == "Lift"}
    air_parts.update(k for k, v in bodies.items() if v.get("class") == "Transports" or v.get("droidType") in ("TRANSPORTER", "SUPERTRANSPORTER"))
    air_parts.update(k for k in weapons if "VTOL" in k.upper())
    air_structures = {k for k, v in structures.items() if v.get("type") in ("VTOL FACTORY", "REARM PAD") or "VTOL" in k.upper()}
    blocked = set()
    removed_results = []
    def ground_prerequisites(topic, seen=None):
        seen = set() if seen is None else seen
        require(topic not in seen, "Cycle in air research prerequisites")
        if topic not in blocked:
            return [topic]
        return [ground for previous in original_prerequisites[topic]
            for ground in ground_prerequisites(previous, seen | {topic})]

    prerequisite_replacements = []
    for key, topic in research.items():
        if key.startswith("_"):
            continue
        direct_air = "VTOL" in key.upper() or key.startswith(("R-Wpn-Bomb", "R-Cyborg-Transport", "R-SuperTransport"))
        if direct_air:
            blocked.add(key)
            air_parts.update(topic.get("resultComponents", []))
            air_structures.update(topic.get("resultStructures", []))
    for key, topic in research.items():
        if key.startswith("_"):
            continue
        if key in blocked:
            topic["requiredResearch"] = ["R-FFA-Air-Locked"]
            topic.pop("category", None)
        elif any(previous in blocked for previous in original_prerequisites[key]):
            previous = original_prerequisites[key]
            replacement = list(dict.fromkeys(ground for item in previous for ground in ground_prerequisites(item)))
            topic["requiredResearch"] = replacement
            prerequisite_replacements.append({"topic": key, "original": previous, "replacement": replacement})
        # Shared ground weapon topics sometimes also unlock a VTOL variant.
        # Keep the topic and all ground effects, removing only its air result.
        for field, forbidden in (("resultComponents", air_parts), ("resultStructures", air_structures)):
            if field in topic:
                before = topic[field]
                after = [x for x in before if x not in forbidden]
                if before != after:
                    removed_results.append({"topic": key, "field": field, "removed": [x for x in before if x in forbidden]})
                    topic[field] = after
    research["R-FFA-Air-Locked"] = {"id": "R-FFA-Air-Locked", "name": "Air units disabled", "iconID": "IMAGE_RES_SYSTEMTECH", "researchPoints": 1, "researchPower": 0}
    templates = stock.json("/data/mp/stats/templates.json")
    removed_templates = []
    for key in list(templates):
        item = templates[key]
        if item.get("body") in air_parts or item.get("propulsion") in air_parts or any(x in air_parts for x in item.get("weapons", [])):
            removed_templates.append(key)
            del templates[key]
    policy = {"version": 1, "mode": "ffa", "vtol": False, "airComponents": sorted(air_parts),
        "airStructures": sorted(air_structures), "blockedResearch": sorted(blocked),
        "researchCategory": {k: v.get("category", "") for k, v in research.items() if not k.startswith("_")},
        "removedAirResults": removed_results, "removedAirTemplates": removed_templates,
        "groundPrerequisiteReplacements": prerequisite_replacements}
    dump(SOURCE / "research.json", research)
    dump(SOURCE / "templates.json", templates)
    dump(SOURCE / "policy.json", policy)
    return policy


def generate_native_scripts(stock, maps):
    for name, virtual in {"nullbot.js": "/data/mp/multiplay/skirmish/nb_generic.js",
            "endconditions.js": "/data/mp/multiplay/script/rules/endconditions.js",
            "structurelimits.js": "/data/mp/multiplay/script/rules/setup/structurelimits.js",
            "camTechEnabler.js": "/data/mp/multiplay/script/functions/camTechEnabler.js"}.items():
        write(SOURCE / "stock" / name, stock.read(virtual))
    ai = stock.text("/data/mp/multiplay/skirmish/nb_generic.js")
    require(ai.count("vtolness: 65") == 4, "Stock NullBot VTOL personality anchors changed")
    ai = ai.replace("vtolness: 65", "vtolness: 0")
    write(SOURCE / "ai.js", ai)
    dump(SOURCE / "ai.json", {"AI": {"js": "ffa-nullbot.js", "name": "NullBot (ground)", "tip": "Stock adaptive NullBot with air units disabled"}})
    # Native saves resolve AI by the saved display name and script context.
    # Retain that exact legacy NullBot pair while new matches use stock Cobra.
    # Cobra and all of its includes stay byte-identical in the stock VFS prefix.
    cobra_paths = sorted(path for path in stock.index if path in (
        "/data/mp/multiplay/skirmish/Cobra.js", "/data/mp/multiplay/skirmish/Cobra.json")
        or path.startswith(("/data/mp/multiplay/skirmish/cobra_includes/", "/data/mp/multiplay/skirmish/cobra_rulesets/")))
    require(len(cobra_paths) == 13, "Unexpected stock Cobra dependency inventory")
    for virtual in cobra_paths:
        relative = virtual.removeprefix("/data/mp/multiplay/skirmish/")
        write(SOURCE / "stock/cobra" / relative, stock.read(virtual))
    dump(SOURCE / "COBRA.json", {"botType": "cobra", "nativeAIName": "Cobra", "nativeScript": "Cobra.js",
        "stockFilesByteIdentical": True, "source": "Retained official Warzone 4.7.0 stock VFS prefix",
        "files": [{"path": virtual, "sha256": digest(stock.read(virtual)), "bytes": len(stock.read(virtual))} for virtual in cobra_paths],
        "legacyAI": {"nativeAIName": "NullBot (ground)", "nativeScript": "ffa-nullbot.js",
            "scriptSHA256": digest((SOURCE / "ai.js").read_bytes()), "metadataSHA256": digest((SOURCE / "ai.json").read_bytes())}})
    endconditions = stock.text("/data/mp/multiplay/script/rules/endconditions.js")
    marker = "\tfinalizeGame(state)\n\t{"
    require(endconditions.count(marker) == 1, "Stock endcondition observer anchor changed")
    endconditions = endconditions.replace(marker, marker + '\n\t\t// Observe the native result before the stock game-over call.\n\t\tif (typeof ffaNativePlayerResult === "function") ffaNativePlayerResult(this.playNum, state);', 1)
    write(SOURCE / "endconditions.js", endconditions)
    tech = stock.text("/data/mp/multiplay/script/functions/camTechEnabler.js")
    require(tech.count("if (allRes[tech] <= time)") == 1, "Stock starting research anchor changed")
    tech = tech.replace("if (allRes[tech] <= time)", 'if (allRes[tech] <= time && (typeof ffaResearchAllowed !== "function" || ffaResearchAllowed(tech)))', 1)
    write(SOURCE / "camTechEnabler.js", tech)
    bridge = (ROOT / "scenario/warzone-towers-bridge.js").read_text(encoding="utf-8")
    start, end = bridge.index("function warzoneTowersDiagnosticSnapshot()"), bridge.index("function blockNightV31PollZoomCommand()")
    bridge = bridge[:start] + bridge[end:]
    bridge = bridge.replace('setTimer("warzoneTowersDiagnosticSnapshot", 5000);', "")
    # No native timers may be created while this script is being included.
    # During load, script evaluation precedes restoration of globals/timer IDs.
    # ffaStart owns registration after eventStartLevel/eventGameLoaded instead.
    bridge = replace_once(bridge, 'setTimer("blockNightV32PollBridgeCommands", 120);', "")
    require(bridge.count("return enumResearch().sort(function") == 1, "Research bridge catalogue anchor changed")
    bridge = bridge.replace("return enumResearch().sort(function", "return enumResearch().filter(function (topic) { return ffaResearchAllowed(topic.id); }).sort(function", 1)
    require("Spawner" not in bridge and "scavAI" not in bridge, "Towers scenario diagnostics leaked into FFA")
    write(SOURCE / "research-bridge.js", bridge)
    commands = (ROOT / "scenario/warzone-towers-commands.js").read_text(encoding="utf-8")
    commands = replace_once(commands, 'setTimer("wtcmd_tick", 250);', 'ffaSetTimer("wtcmd_tick", 250);')
    write(SOURCE / "commands.js", commands + "\n" + (SOURCE / "command-policy.js").read_text(encoding="utf-8"))
    for map in maps:
      for difficulty in ("easy", "medium", "hard"):
        challenge = {"challenge": {"bases": 3, "description": "Every player is independent. Be the last commander standing. Air units disabled.",
            "difficulty": difficulty.title(), "map": map["level"], "maxPlayers": map["players"], "name": "Free For All - " + map["name"],
            "alliances": 0, "powerLevel": 1, "scavengers": 0, "techLevel": 1, "version": 2},
            "locked": {k: True for k in ("ai", "alliances", "bases", "difficulty", "position", "power", "scavengers", "teams")},
            "player_0": {"name": "Commander", "position": 0, "team": 0}}
        for player in range(1, map["players"]):
            challenge["player_" + str(player)] = {"ai": "multiplay/skirmish/Cobra.js", "difficulty": difficulty.title(),
                "name": "Cobra " + str(player), "position": player, "team": player}
        if map["id"] == "emag":
            challenge["challenge"]["name"] = "Free For All - EMAG"
            challenge["challenge"]["description"] = "Four independent players. Be the last commander standing. Air units disabled."
        target = SOURCE / ("challenge-" + difficulty + ".json") if map["id"] == "emag" else SOURCE / "challenges" / (map["id"] + "-" + difficulty + ".json")
        dump(target, challenge)


def replace_once(text, before, after):
    require(text.count(before) == 1, "FFA wrapper anchor changed: " + before[:90])
    return text.replace(before, after, 1)


def generate_html(maps, package_directories):
    config = '''\n  <script>
    const ffaRequestedDifficulty = new URLSearchParams(location.search).get('bnFfaDifficulty');
    const ffaDifficulty = ['easy','medium','hard'].includes(ffaRequestedDifficulty) ? ffaRequestedDifficulty : 'easy';
    const ffaLaunchQuery = new URLSearchParams(location.search);
    const ffaMapCatalogue = FFA_MAP_CATALOGUE;
    const ffaRequestedMap = ffaLaunchQuery.has('bnFfaMap') ? ffaLaunchQuery.get('bnFfaMap') : 'emag';
    const ffaMap = ffaMapCatalogue.find(map => map.id === ffaRequestedMap);
    if (!ffaMap) throw new Error('Unknown FFA map.');
    const ffaExpectedBotType = ffaLaunchQuery.get('bnFfaRestore') === '1' && ffaLaunchQuery.get('bnFfaBotType') === 'nullbot' ? 'nullbot' : 'cobra';
    window.__warzoneFfa = true;
    window.__warzoneFfaMaps = ffaMapCatalogue;
    window.__warzoneFfaConfig = Object.freeze({mode:'ffa',map:ffaMap.id,mapName:ffaMap.name,level:ffaMap.level,players:ffaMap.players,bots:ffaMap.bots,structureLimits:Object.freeze({...ffaMap.structureLimits}),difficulty:ffaDifficulty,player:0,botType:ffaExpectedBotType});
  </script>\n'''
    config = config.replace("FFA_MAP_CATALOGUE", json.dumps(maps,separators=(",",":"),ensure_ascii=False))
    index = (ASSETS / "index.html").read_text(encoding="utf-8")
    index = replace_once(index, "  <head>", "  <head>" + config)
    index = replace_once(index, "return '/warzone2100' + WZ_CONFIG_DIR_SUFFIX;", "return '/warzone2100-ffa-' + (ffaMap.id === 'emag' ? '' : ffaMap.id + '-') + ffaDifficulty + WZ_CONFIG_DIR_SUFFIX;")
    index = replace_once(index, "module.FS.writeFile('/tmp/warzone-towers-ui-v34', '1')", "module.FS.writeFile('/tmp/warzone-campaign-mobile-v51', '1')")
    # This VFS owns the demolition seed. Creating it in a host preRun before
    # Emscripten installs the corresponding data slice raises FS EEXIST.
    index, removed = re.subn(r"      function blockNightPrepareDemolitionIntent\(module\) \{.*?      Module\['preRun'\]\.push\(blockNightPrepareDemolitionIntent\);\n", "", index, flags=re.S)
    require(removed == 1, "FFA demolition seed preRun anchor changed")
    start = index.index("      const towerMap = new URLSearchParams(location.search).get('map');")
    end = index.index("      // END TOWERS 0.19 LEVEL ARGUMENT", start) + len("      // END TOWERS 0.19 LEVEL ARGUMENT")
    index = index[:start] + "      Module.arguments.push('--skirmish=ffa-' + ffaMap.id + '-' + ffaDifficulty + '.json');" + index[end:]
    index = replace_once(index, "if (path === 'warzone2100.wasm') return prefix + 'warzone2100-towers-052.wasm';", "if (path === 'warzone2100.wasm') return prefix + 'warzone2100.wasm';")
    index = replace_once(index, 'if (path.endsWith(".data")) {', 'if (path === "warzone2100.data") return "warzone2100-ffa.data";\n        if (path.endsWith(".data")) {')
    prepare = (SOURCE / "runtime-prepare.js").read_text(encoding="utf-8")
    prepare = replace_once(prepare,"FFA_NATIVE_PACKAGE_DIRECTORIES",json.dumps(package_directories,separators=(",",":")))
    index = replace_once(index, "    function constructWZModuleConfig(additional_command_line_args) {", prepare + "\n    function constructWZModuleConfig(additional_command_line_args) {")
    index = replace_once(index, "      return Module;", "      prepareFfaModule(Module, window.__warzoneFfaConfig);\n      return Module;")
    index = replace_once(index, 'src="warzone2100-towers-052.js"', 'src="warzone2100-ffa.js"')
    require("warzone-towers-ui-v34" not in index and "--skirmish=warzonetowers" not in index, "Towers startup policy leaked into FFA")
    write(ASSETS / "index-ffa.html", index)
    mobile = (ASSETS / "mobile.html").read_text(encoding="utf-8")
    mobile = replace_once(mobile, "<head>", "<head>" + config)
    mobile = replace_once(mobile, '"index.html" + location.search', '"index-ffa.html" + location.search')
    write(ASSETS / "mobile-ffa.html", mobile)


def frozen_files():
    paths = [p for p in ASSETS.iterdir() if p.is_file() and (p.name.startswith("warzone2100") or p.name.startswith(("index", "mobile"))) and "-ffa" not in p.name]
    return {p.relative_to(ROOT).as_posix(): digest(p.read_bytes()) for p in paths}


def generated_maps():
    """Read the audited generated files without rewriting any supplied map."""
    manifest = json.loads((SOURCE / "generated-maps-067.json").read_text(encoding="utf-8"))
    catalogue = json.loads((ROOT / "app/src/main/assets/ffa-maps.json").read_text(encoding="utf-8"))
    original_sources = json.loads((SOURCE / "maps-source.json").read_text(encoding="utf-8"))["maps"]
    original_proofs = json.loads((ROOT / "vendor/ffa-maps/PROVENANCE.json").read_text(encoding="utf-8"))["maps"]
    expected_ids = ["ntw-" + str(players) + "p-" + str(index).zfill(2)
        for players in (2, 3, 4) for index in range(1, 16)]
    require(manifest.get("version") == catalogue.get("version") == 1, "Generated FFA manifest version differs")
    require([row["id"] for row in manifest["maps"]] == expected_ids
        and [row["id"] for row in manifest["proofs"]] == expected_ids, "Expected fifteen maps for each player count")
    require(catalogue["maps"][6:] == manifest["maps"] and len(catalogue["maps"]) == 51,
        "Public/generated FFA map catalogues differ")
    require([row["id"] for row in original_sources] == [row["id"] for row in original_proofs]
        == [row["id"] for row in catalogue["maps"][:6]], "Original map identity/order changed")
    for source, row in zip(original_sources, catalogue["maps"][:6]):
        require(all(source[key] == row[key] for key in ("id", "name", "players", "level", "mapDirectory",
            "description", "tileset", "sourceSHA256")), "Original FFA map facts changed")
        require(digest((ROOT / source["source"]).read_bytes()) == source["sourceSHA256"], "Original WZ changed")
    proofs = original_proofs + manifest["proofs"]
    for row, proof in zip(catalogue["maps"], proofs):
        require(row["id"] == proof["id"] and row["players"] in (2, 3, 4, 6)
            and row["bots"] == row["players"] - 1 and len(row["level"]) <= 19,
            "Invalid FFA map slot/level identity")
        require(proof["descriptor"] == (ROOT / "map" / row["mapDirectory"] / "level.lev").read_text(encoding="utf-8"),
            "FFA level descriptor differs from its source")
        paths = set()
        for mapping in proof["mappings"]:
            path = (ROOT / mapping["host"]).resolve()
            require(path.is_relative_to((ROOT / "map" / row["mapDirectory"]).resolve())
                and path.is_file() and digest(path.read_bytes()) == mapping["sha256"], "Native FFA map file changed")
            virtual = mapping["virtual"]
            prefix = "/data/mp/multiplay/maps/" + row["mapDirectory"]
            require((virtual == prefix + ".gam" or virtual.startswith(prefix + "/"))
                and ".." not in virtual and "\\" not in virtual and virtual not in paths, "Unsafe/duplicate map VFS record")
            paths.add(virtual)
        if row["id"] in expected_ids:
            count = int(row["id"][4])
            require(row["players"] == count and row["level"] == "FFA-NTW" + str(count) + "-" + row["id"][7:] + "-T1"
                and proof["requiredInitialStructureLimits"] == {}, "Generated map slot/limit mismatch")
            expected = {prefix + "/" + name for name in
                ("level.json", "gam.json", "game.map", "ttypes.ttp", "struct.json", "droid.json", "feature.json")} | {prefix + ".gam"}
            require(paths == expected, "Generated map native record inventory differs")
    return catalogue, proofs


def build(supplied, with_generated=False):
    before = frozen_files()
    if with_generated:
        require(supplied is None, "Import supplied maps separately before generated-map packaging")
        provenance = json.loads((MAP / "PROVENANCE.json").read_text(encoding="utf-8"))
        catalogue, map_proofs = generated_maps()
    else:
        provenance = import_map(supplied)
        map_builder = runpy.run_path(str(ROOT / "tools/build-ffa-maps-066.py"),run_name="ffa_maps_build_helpers")
        catalogue, map_proofs = map_builder["build_maps"]()
    native_catalogue = {"version":1,"maps":[dict(map,structureLimits=proof["requiredInitialStructureLimits"]) for map,proof in zip(catalogue["maps"],map_proofs)]}
    baseline_js = (ASSETS / "warzone2100.js").read_bytes()
    baseline_data = (ASSETS / "warzone2100.data").read_bytes()
    stock = Stock(baseline_data)
    policy = generate_no_air_policy(stock)
    generate_native_scripts(stock, catalogue["maps"])
    script = baseline_js.decode("utf-8")
    begin, end, _, metadata = package_call(script)
    entries = {e["filename"]: deepcopy(e) for e in stock.files}
    data, appended = bytearray(baseline_data[:STOCK_SIZE]), []

    def add(virtual, content):
        content = content.encode("utf-8") if isinstance(content, str) else content
        start = len(data)
        data.extend(content)
        entries[virtual] = {"filename": virtual, "start": start, "end": len(data)}
        appended.append({"path": virtual, "sha256": digest(content), "bytes": len(content)})

    def file(virtual, path):
        add(virtual, path.read_bytes())

    add("/data/mp/addon.lev", stock.read("/data/mp/addon.lev") + b"\n" + "\n".join(proof["descriptor"] for proof in map_proofs).encode("utf-8"))
    for proof in map_proofs:
        for mapping in proof["mappings"]:
            file(mapping["virtual"],ROOT / mapping["host"])
    for map in catalogue["maps"]:
      for difficulty in ("easy", "medium", "hard"):
        target = SOURCE / ("challenge-" + difficulty + ".json") if map["id"]=="emag" else SOURCE / "challenges" / (map["id"]+"-"+difficulty+".json")
        file("/data/mp/tests/ffa-" + map["id"] + "-" + difficulty + ".json",target)
    for name in ("policy", "rules", "research-bridge", "commands"):
        file("/data/mp/tests/ffa-" + name + ".js", SOURCE / (name + ".js"))
    file("/data/mp/multiplay/script/rules/init.js", SOURCE / "rules.js")
    file("/data/mp/multiplay/script/rules/endconditions.js", SOURCE / "endconditions.js")
    file("/data/mp/multiplay/script/functions/camTechEnabler.js", SOURCE / "camTechEnabler.js")
    file("/data/mp/multiplay/skirmish/ffa-nullbot.js", SOURCE / "ai.js")
    file("/data/mp/multiplay/skirmish/ffa-nullbot.json", SOURCE / "ai.json")
    for name in ("research", "templates"):
        file("/data/mp/stats/" + name + ".json", SOURCE / (name + ".json"))
    file("/data/mp/multiplay/script/ffa-policy.json", SOURCE / "policy.json")
    file("/data/mp/multiplay/script/rules/ffa-policy.json", SOURCE / "policy.json")
    for folder in ("multiplay/script", "multiplay/script/rules", "multiplay/skirmish"):
        add("/data/mp/" + folder + "/ffa-config.json", json.dumps({"mode": "ffa", "map": "emag", "difficulty": "easy", "player": 0, "botType": "cobra","players":4,"bots":3,"level":"FFA-EMAG-T1","mapName":"EMAG FFA"}))
        add("/data/mp/" + folder + "/ffa-maps.json",json.dumps(native_catalogue,separators=(",",":"),ensure_ascii=False))
    for name in ("warzone-towers-catalog.json", "warzone-towers-command.json", "warzone-towers-control-command.json", "blocknight-queue-command.json", "blocknight-zoom-command.json"):
        file("/data/mp/tests/" + name, ROOT / "scenario" / name)
        file("/data/mp/multiplay/script/rules/" + name, ROOT / "scenario" / name)
    add("/data/mp/multiplay/script/rules/warzone-towers-demolition-intent.json", '{"intent":"","active":false}')
    new_metadata = dict(metadata, files=list(entries.values()), remote_package_size=len(data), package_uuid="ffa-" + digest(data))
    generated = script[:begin] + "loadPackage(" + json.dumps(new_metadata, separators=(",", ":"), ensure_ascii=False) + ")" + script[end:]
    b, e, _, parsed = package_call(generated)
    require(generated[:b] + "PACKAGE" + generated[e:] == script[:begin] + "PACKAGE" + script[end:], "Compiled runtime changed outside literal package metadata")
    # Keep package caches and worker messages isolated from existing modes.
    original_filename = 'var REMOTE_PACKAGE_BASE="warzone2100.data";'
    generated = replace_once(generated, original_filename, 'var REMOTE_PACKAGE_BASE="warzone2100-ffa.data";')
    original_filter = 'text.includes("BNNOTICE")'
    extended_filter = original_filter + '||text.includes("BNFFA")||text.includes("WTCMD")||text.includes("WTREADY")'
    generated = replace_once(generated, original_filter, extended_filter)
    b, e, _, _ = package_call(generated)
    normalized = generated[:b] + "PACKAGE" + generated[e:]
    normalized = normalized.replace('var REMOTE_PACKAGE_BASE="warzone2100-ffa.data";', original_filename, 1).replace(extended_filter, original_filter, 1)
    require(normalized == script[:begin] + "PACKAGE" + script[end:], "FFA loader changed outside reviewed package/output adapters")
    require(parsed["remote_package_size"] == len(data), "FFA package length mismatch")
    require(len(entries) == len({e["filename"] for e in parsed["files"]}), "Duplicate FFA VFS file")
    write(ASSETS / "warzone2100-ffa.js", generated)
    write(ASSETS / "warzone2100-ffa.data", bytes(data))
    package_directories = sorted({str(Path(entry["filename"]).parent).replace('\\','/') for entry in parsed["files"]})
    require(all(path.startswith("/") and "/../" not in path and "\\" not in path for path in package_directories),"Unsafe FFA package directory")
    generate_html(native_catalogue["maps"], package_directories)
    require(frozen_files() == before, "An existing runtime, payload or entrypoint changed during FFA packaging")
    proof = {"passed": True, "version": 2, "mode": "ffa", "map": "emag", "players": 4, "botType": "cobra","maps":catalogue["maps"],"nativePreloadDirectories":package_directories,
        "authoredStructureLimits":{map["id"]:proof["requiredInitialStructureLimits"] for map,proof in zip(catalogue["maps"],map_proofs)},
        "method": "Separate stock VFS; existing matching generic JS/WASM program with only literal package/data/output adapters",
        "noNativeBuild": True, "compiledProgramNormalizedIdentical": True, "sharedWASM": "warzone2100.wasm",
        "stockPrefixBytes": STOCK_SIZE, "stockPrefixSHA256": STOCK_HASH, "stockRecords": len(stock.files), "ffaRecords": len(entries),
        "launchArguments": ["--skirmish=ffa-" + m["id"] + "-" + d + ".json" for m in catalogue["maps"] for d in ("easy", "medium", "hard")],
        "configDirectoryPattern": "/warzone2100-ffa-{optionalNonEmagMapId-}{difficulty}{existingSuffix}", "nativeMobileMarker": "/tmp/warzone-campaign-mobile-v51",
        "nativeVictoryRules": "Stock multiplayer endconditions; selected-player result observer only",
        "nativeAI": "Byte-identical bundled stock Cobra; legacy ground NullBot retained only for old saved native matches",
        "cobraProof": {"path": "scenario/ffa/COBRA.json", "sha256": digest((SOURCE / "COBRA.json").read_bytes())},
        "originalMap": provenance, "preservedExistingFiles": before, "virtualOverrides": appended,
        "airPolicy": {"blockedResearch": len(policy["blockedResearch"]), "airComponents": len(policy["airComponents"]), "removedTemplates": len(policy["removedAirTemplates"])},
        "outputs": [{"path": p.relative_to(ROOT).as_posix(), "sha256": digest(p.read_bytes()), "bytes": p.stat().st_size}
            for p in [ASSETS / n for n in ("warzone2100-ffa.js", "warzone2100-ffa.data", "index-ffa.html", "mobile-ffa.html")]]}
    dump(SOURCE / "PACKAGE.json", proof)
    print(json.dumps({k: proof[k] for k in ("passed", "players", "noNativeBuild", "compiledProgramNormalizedIdentical", "launchArguments", "airPolicy", "outputs")}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-map", type=Path, help="Retain the exact supplied EMAG_FFA WZ once; subsequent builds use the retained input")
    parser.add_argument("--with-generated-maps", action="store_true", help="Include the forty-five audited NTW maps without rewriting supplied map files")
    args = parser.parse_args()
    # A routine rebuild must not silently erase the installed 45-map extension.
    build(args.import_map, args.with_generated_maps or (SOURCE / "generated-maps-067.json").is_file())
