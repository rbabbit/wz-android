"""Create only the offline Guide's catalogue from retained native stock data.

Never regenerates a game loader, native data package, map, scenario or engine.
The accompanying check compares every catalogue node to the actual source graph.
"""
from pathlib import Path
from hashlib import sha256
from copy import deepcopy
from urllib.parse import quote, unquote
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "guide"
OUTPUT = ROOT / "app/src/main/assets/guide/research-data.js"
PROOF = ROOT / "archive/guide-0.65-research.json"
STOCK_BYTES = 64424618
STOCK_SHA = "9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424"
CATALOGUE_TYPES = {"weapons":"weapon", "body":"body", "propulsion":"propulsion", "structure":"structure",
    "sensor":"sensor", "brain":"command", "repair":"repair", "construction":"constructor", "ecm":"ECM"}
SECTION_BY_SUBCLASS = {"MACHINE GUN":"machineguns", "CANNON":"cannons", "ROCKET":"rockets-missiles", "SLOW ROCKET":"rockets-missiles",
    "MISSILE":"rockets-missiles", "FLAME":"flamers", "MORTARS":"artillery", "HOWITZERS":"artillery", "ENERGY":"lasers",
    "GAUSS":"railguns", "EMP":"emp", "ELECTRONIC":"emp", "LAS_SAT":"lasers", "A-A GUN":"aircraft", "BOMB":"aircraft"}
PARAMETERS = {"Armour":"kinetic armour", "Thermal":"thermal armour", "HitPointPct":"body hit points", "HitPoints":"hit points",
    "ProductionPoints":"factory production rate", "PowerPoints":"power generation rate", "ResearchPoints":"research rate", "RepairPoints":"repair rate",
    "ConstructorPoints":"construction rate", "Range":"sensor range", "Power":"engine power", "HitChance":"long-range hit chance",
    "ShortHitChance":"short-range hit chance", "Damage":"damage", "RadiusDamage":"splash damage", "MaxRange":"maximum weapon range",
    "RepeatDamage":"burn damage", "FirePause":"time between shots", "ReloadTime":"reload time", "RearmPoints":"rearm rate",
    "Resistance":"electronic resistance", "BaseCommandLimit":"base command limit", "CommandLimitByLevel":"command limit per level", "RankThresholds":"rank thresholds"}
SOURCES = [
    {"id":"official-research","title":"Warzone 2100 Guide: Research","url":"https://betaguide.wz2100.net/research.html","note":"Official-hosted explanations; numeric paths in this app come from the bundled version."},
    {"id":"official-weapons","title":"Warzone 2100 Guide: Weapons","url":"https://betaguide.wz2100.net/weapons.html","note":"Weapon roles, target types and kinetic/thermal distinction. Exact bundled stats take precedence."},
    {"id":"official-early","title":"Warzone 2100 Guide: Early-game strategy","url":"https://betaguide.wz2100.net/earlygamestrategy.html","note":"Older multiplayer strategy context. Historical costs, upgrade percentages, starting bases and timing are not copied as current facts."},
    {"id":"official-quickstart","title":"Official Warzone 2100 quick-start guide","url":"https://github.com/Warzone2100/warzone2100/blob/master/doc/quickstartguide.asciidoc","note":"General systems and roles; desktop input instructions are replaced by this app's practical chapters."},
    {"id":"bundled-stats","title":"Bundled Warzone 4.7.0 stock research and component data","note":"Exact retained stock VFS prefix, with separate multiplayer and Campaign graphs. Numbers are base values before upgrades."},
    {"id":"mode-rules","title":"Bundled FFA policy, Campaign scripts and Towers reward rules","note":"FFA air restrictions, Campaign artifact availability and Towers-specific grants are described separately from ordinary prerequisites."}
]


def digest(value):
    return sha256(value).hexdigest()


def file_digest(path):
    result = sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


class Stock:
    def __init__(self):
        with (ROOT / "app/src/main/assets/warzone/warzone2100.data").open("rb") as stream:
            self.data = stream.read(STOCK_BYTES)
        assert digest(self.data) == STOCK_SHA
        self.rows = {row["filename"]: row for row in json.loads((ROOT / "vendor/duel-stock/package-index.json").read_text())}
        assert all(0 <= row["start"] <= row["end"] <= STOCK_BYTES for row in self.rows.values())
        self.used = {}

    def read(self, name):
        row = self.rows[name]
        value = self.data[row["start"]:row["end"]]
        self.used[name] = digest(value)
        return value

    def json(self, name):
        return json.loads(self.read(name))


def frozen_native():
    assets = ROOT / "app/src/main/assets/warzone"
    paths = [p for p in assets.iterdir() if p.is_file() and p.name.startswith(("warzone2100", "index", "mobile"))]
    paths.append(ROOT / "app/src/main/assets/warzone-touch-controls.js")
    return {p.relative_to(ROOT).as_posix(): file_digest(p) for p in paths}


def icon_for(topic, icons):
    name = topic.get("name", "") + ".gif"
    if name in icons:
        return "../warzone/research-icons/" + quote(name, safe="")
    return "../warzone/ui/icons/question.svg"


def read_artifact_sources(stock, topics):
    # Record literal references only. Do not execute Campaign scripts or infer
    # a universal mission order from their classic/modern/difficulty branches.
    result = {}
    for name in sorted(stock.rows):
        if not re.match(r"/data/base/script/campaign/cam[^/]+\.js$", name):
            continue
        text = stock.read(name).decode("utf-8")
        for call in re.finditer(r"camSetArtifacts\s*\(\s*\{", text):
            start = call.end() - 1
            depth, quote_char, escaped, end = 0, None, False, None
            for i in range(start, len(text)):
                char = text[i]
                if quote_char:
                    if escaped: escaped = False
                    elif char == "\\": escaped = True
                    elif char == quote_char: quote_char = None
                elif char in "\"'": quote_char = char
                elif char == "{": depth += 1
                elif char == "}":
                    depth -= 1
                    if not depth:
                        end = i + 1
                        break
            assert end is not None, "Unbalanced artifact registration: " + name
            block = text[start:end]
            pattern = r'''["']?([A-Za-z0-9_-]+)["']?\s*:\s*\{[^{}]*?\btech\s*:\s*(\[[^\]]*\]|["'][^"']+["'])'''
            for label, value in re.findall(pattern, block):
                for topic in re.findall(r'''["'](R-[^"']+)["']''', value):
                    if topic not in topics:
                        continue
                    reference = {"mission":Path(name).stem, "label":label, "source":name,
                        "variantNote":"Literal mission-script reference; classic/modern balance and mission conditions may select a different artifact set."}
                    result.setdefault(topic, [])
                    if reference not in result[topic]: result[topic].append(reference)
    return result


def component_tables(stock, folder):
    result = {}
    keys = ["damage","radiusDamage","weaponClass","weaponSubClass","weaponEffect","movement","weight","buildPower",
        "hitpoints","armourKinetic","armourHeat","powerOutput","weaponSlots","size","speed","type","surfaceToAir",
        "numRounds","firePause","reloadTime","researchPoints","moduleResearchPoints","productionPoints","powerPoints","width","breadth"]
    for filename, kind in CATALOGUE_TYPES.items():
        name = "/data/" + folder + "/stats/" + filename + ".json"
        if name not in stock.rows: continue
        for id, item in stock.json(name).items():
            stats = {key:item[key] for key in keys if key in item}
            for key, label in (("longRange","rangeTiles"),("minRange","minimumRangeTiles")):
                if key in item: stats[label] = item[key] / 128
            result[id] = {"id":id, "name":item.get("name",id), "type":kind, "baseStats":stats}
    return result


def section_for(id, topic, components):
    if id.startswith("R-Defense"): return "defences"
    if id.startswith(("R-Cyborg-Transport","R-SuperTransport")): return "aircraft"
    if id.startswith("R-Cyborg"): return "cyborgs"
    if "VTOL" in id or "-Bomb" in id or re.search(r"R-Wpn-(AA|Missile-(?:Lt|Hv)SAM|Sunburst)", id): return "aircraft"
    if id.startswith("R-Vehicle"): return "vehicles"
    if id.startswith("R-Struc"): return "economy"
    if re.search(r"EMP|NEXUS|Resistance|Electronic", id, re.I): return "emp"
    if id.startswith(("R-Sys","R-Comp")): return "sensors"
    if id.startswith(("R-Wpn-MG","R-Wpn-Machine")): return "machineguns"
    if id.startswith("R-Wpn-Cannon"): return "cannons"
    if id.startswith(("R-Wpn-Rocket","R-Wpn-Missile")): return "rockets-missiles"
    if re.search(r"R-Wpn-(Flam|Plasmite)", id): return "flamers"
    if re.search(r"R-Wpn-(Mortar|Howitzer)", id): return "artillery"
    if re.search(r"R-Wpn-(Rail|Gauss)", id): return "railguns"
    if re.search(r"R-Wpn-(Laser|HeavyLaser|Plasma|LasSat)", id): return "lasers"
    for component in topic.get("resultComponents",[]):
        sub = components.get(component,{}).get("baseStats",{}).get("weaponSubClass")
        if sub in SECTION_BY_SUBCLASS: return SECTION_BY_SUBCLASS[sub]
    return "research-overview"


def describe_effect(effect):
    target = {"Droids":"vehicle bodies","Cyborgs":"cyborg bodies","CANNON":"cannon weapons","FLAME":"flamers","MACHINE GUN":"machineguns",
        "ROCKET":"rockets","MISSILE":"missiles","GAUSS":"rail/Gauss weapons","HOWITZERS":"howitzers","MORTARS":"mortars","ENERGY":"energy weapons",
        "Wall":"walls","Structure":"structures"}.get(str(effect.get("filterValue")), effect.get("filterValue") or effect.get("class","equipment"))
    value = effect.get("value")
    # Native research results are percentages of base stats. Keep raw fields
    # alongside readable text, including the sign of reload-time reductions.
    return str(target) + ": " + PARAMETERS.get(effect.get("parameter"),effect.get("parameter","effect")) + " " + ("+" if isinstance(value,(int,float)) and value>0 else "") + str(value) + "% of base."


def make_catalogue(raw, components, icons, mode, policy=None, artifacts=None):
    topics = []
    for id, native in raw.items():
        if id.startswith("_") or id == "R-FFA-Air-Locked": continue
        disabled = mode == "ffa" and id in policy["blockedResearch"]
        required = native.get("requiredResearch",[])
        if disabled:
            # The native FFA sentinel is an implementation detail rather than
            # a researchable guide topic. Show original dependencies with an
            # explicit mode lock; never present a path through the sentinel.
            required = policy["originalTopics"][id].get("requiredResearch",[])
        lookup = lambda component,kind: deepcopy(components.get(component,{"id":component,"name":component,"type":kind}))
        unlocks = [lookup(component,"component") for component in native.get("resultComponents",[])]
        unlocks += [lookup(component,"structure") for component in native.get("resultStructures",[])]
        effects = [dict(deepcopy(effect),description=describe_effect(effect)) for effect in native.get("results",[])]
        kinds = []
        if unlocks: kinds.append("unlock")
        if effects: kinds.append("upgrade")
        if native.get("resultStructures") or id.startswith("R-Defense"): kinds.append("defence" if id.startswith("R-Defense") else "support")
        if not kinds: kinds.append("support")
        section = section_for(id,native,components)
        sections = [section]
        for unlock in unlocks:
            if unlock["id"].startswith(("Cyborg","Cyb-Wpn")) and "cyborgs" not in sections: sections.append("cyborgs")
            if unlock["type"] == "weapon":
                family = SECTION_BY_SUBCLASS.get(unlock.get("baseStats",{}).get("weaponSubClass"))
                if family and family not in sections: sections.append(family)
        topic = {"id":id,"name":native.get("name",id),"section":section,"sections":sections,"kinds":kinds,
            "requiresAll":required,"requiredStructures":[lookup(id,"structure") for id in native.get("requiredStructures",[])],
            "cost":{"power":native.get("researchPower"),"points":native.get("researchPoints")},"unlocks":unlocks,"effects":effects,
            "requiredBy":[],"icon":icon_for(native,icons),"nativeCategory":native.get("category",""),
            "obsoletes":[lookup(id,"component") for id in native.get("redComponents",[])] + [lookup(id,"structure") for id in native.get("redStructures",[])]}
        if native.get("replacedComponents"): topic["nativeReplacements"] = native["replacedComponents"]
        if native.get("disabledWhen"): topic["nativeLimitMask"] = native["disabledWhen"]
        if disabled: topic.update(disabled=True,available=False,disabledReason="VTOL and air technology are disabled in FFA. This topic cannot be researched in this mode.")
        if mode == "campaign":
            topic["campaignGate"] = "Campaign missions, recovered artifacts and starting grants can enable topics. Listed prerequisites do not specify when this mission makes a topic available."
            if artifacts and id in artifacts: topic["artifactSources"] = artifacts[id]
            if native.get("keyTopic"): topic["missionKeyTopic"] = True
            if "researchPoints" not in native or native.get("excludeFromCheats"):
                topic["referenceOnly"] = True
                topic["campaignGate"] += " This is a native scripted/special reference, not a promise of a normal player lab choice."
        topics.append(topic)
    by = {topic["id"]:topic for topic in topics}
    for topic in topics:
        for previous in topic["requiresAll"]:
            assert previous in by, (mode,topic["id"],previous)
            by[previous]["requiredBy"].append(topic["id"])
    for topic in topics: topic["requiredBy"].sort()
    return sorted(topics,key=lambda topic:(topic["name"].casefold(),topic["id"]))


def generate():
    frozen = frozen_native()
    stock = Stock()
    mp = stock.json("/data/mp/stats/research.json")
    campaign = stock.json("/data/base/stats/research.json")
    assert len(mp) == 390 and len(campaign) == 413
    policy = json.loads((ROOT / "scenario/ffa/policy.json").read_text())
    ffa = json.loads((ROOT / "scenario/ffa/research.json").read_text())
    assert len(policy["blockedResearch"]) == 24
    assert len(policy["groundPrerequisiteReplacements"]) == 2
    policy["originalTopics"] = mp
    icons = {path.name for path in (ROOT / "app/src/main/assets/warzone/research-icons").iterdir() if path.is_file()}
    components = {"towers":component_tables(stock,"mp"),"campaign":component_tables(stock,"base")}
    components["ffa"] = deepcopy(components["towers"])
    for id in policy["airComponents"] + policy["airStructures"]:
        if id in components["ffa"]:
            components["ffa"][id]["disabled"] = True
            components["ffa"][id]["disabledReason"] = "Air technology is disabled in FFA."
    artifacts = read_artifact_sources(stock,campaign)
    catalogues = {"towers":make_catalogue(mp,components["towers"],icons,"towers"),
        "ffa":make_catalogue(ffa,components["ffa"],icons,"ffa",policy),
        "campaign":make_catalogue(campaign,components["campaign"],icons,"campaign",artifacts=artifacts)}
    assert {key:len(value) for key,value in catalogues.items()} == {"towers":390,"ffa":390,"campaign":413}
    sections = json.loads((SOURCE / "sections.json").read_text())
    for section in sections:
        icon_topic = section.pop("iconTopic")
        section["icon"] = next((topic["icon"] for topic in catalogues["towers"] if topic["id"] == icon_topic),"../warzone/ui/icons/question.svg")
    data = {"version":1,"sections":sections,"modes":[
        {"id":"towers","title":"Towers","nativeTopicCount":390,"summary":"Stock multiplayer research graph. Map starting technology and Towers reward grants can alter what is already usable."},
        {"id":"ffa","title":"FFA","nativeTopicCount":390,"disabledTopics":24,"summary":"Stock ground research with VTOL disabled and two ground prerequisite repairs. Anti-air topics remain in the native graph."},
        {"id":"campaign","title":"Campaign","nativeTopicCount":413,"summary":"Separate Campaign balance and mission/artifact availability. Classic/modern script branches can differ."}],
        "catalogues":catalogues,"components":components,"sources":SOURCES,
        "sourceMetadata":{"stockVersion":"4.7.0","stockPrefixSHA256":STOCK_SHA,"numericPolicy":"Exact bundled base values, not website balance values or upgraded in-match stats.",
            "allPrerequisitesAreAND":True,"campaignArtifactReferences":"Literal references in retained mission scripts only; conditions are not evaluated and this is not a universal mission order."}}
    encoded = "/* Generated offline catalogue; guide/build-research-data.py. No gameplay hooks. */\nwindow.WarzoneGuideResearchData = " + json.dumps(data,ensure_ascii=False,separators=(",",":")) + ";\n"
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(encoded,encoding="utf-8",newline="\n")
    assert frozen_native() == frozen, "A gameplay/native asset changed during guide generation"
    report = {"version":"0.65","passed":True,"newGuideAssetsOnly":True,"noNativeBuildOrPayloadRegeneration":True,
        "source":stock.used,"nativeAssetsFrozenBeforeAndAfter":frozen,"sectionSourceSHA256":file_digest(SOURCE / "sections.json"),
        "catalogueCounts":{mode:len(topics) for mode,topics in catalogues.items()},
        "prerequisiteEdges":{mode:sum(len(topic["requiresAll"]) for topic in topics) for mode,topics in catalogues.items()},
        "multiPrerequisiteTopics":{mode:sum(len(topic["requiresAll"])>1 for topic in topics) for mode,topics in catalogues.items()},
        "ffaDisabledTopics":sorted(topic["id"] for topic in catalogues["ffa"] if topic.get("disabled")),
        "ffaGroundPrerequisiteReplacements":policy["groundPrerequisiteReplacements"],"campaignTopicsWithLiteralArtifactReferences":len(artifacts),
        "outputs":[{"path":OUTPUT.relative_to(ROOT).as_posix(),"bytes":OUTPUT.stat().st_size,"sha256":file_digest(OUTPUT)}]}
    PROOF.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps({"passed":True,"catalogueCounts":report["catalogueCounts"],"ffaDisabledTopics":len(report["ffaDisabledTopics"]),
        "artifactReferencedTopics":len(artifacts),"output":report["outputs"][0]},indent=2))


if __name__ == "__main__":
    generate()
