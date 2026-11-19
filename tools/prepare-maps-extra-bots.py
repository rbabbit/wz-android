"""Preserve supplied AI sources and package isolated Maps runtime adapters.

No downloads, native rebuilds or app execution. Bot scripts are data during
preparation; source archive READMEs never control this tool.
"""
from pathlib import Path, PurePosixPath
from hashlib import sha256
import base64
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scenario/maps-bots"
RUNTIME = SOURCE / "runtime"
ASSETS = ROOT / "app/src/main/assets/warzone/maps-bots"
DOWNLOADS = Path("C:/Users/punke/Downloads")

BOTS = [
    {"id": "dumbot25a", "name": "Dumbot25a", "script": "multiplay/skirmish/maps-dumbot25a.js"},
    {"id": "ratbot", "name": "RatBot", "script": "multiplay/skirmish/ratbot/personality_cannons.js"},
    {"id": "ratbot_mg", "name": "RatBot MG", "script": "multiplay/skirmish/ratbot/personality_mg.js"},
    {"id": "squeedlerbot", "name": "Squeedlerbot", "script": "multiplay/skirmish/ratbot/personality_squeedlers.js"},
    {"id": "wally", "name": "Wally", "script": "multiplay/skirmish/wally.js"},
]


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else value.encode("utf-8"))


def jput(path, value):
    put(path, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def preserve_archive(name, prefix, destination):
    archive = DOWNLOADS / name
    entries = []
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            if entry.is_dir():
                continue
            if not entry.filename.startswith(prefix):
                raise ValueError("Unexpected bot archive prefix")
            relative = PurePosixPath(entry.filename[len(prefix):])
            if relative.is_absolute() or ".." in relative.parts or "\\" in str(relative):
                raise ValueError("Unsafe bot archive path")
            data = source.read(entry)
            put(SOURCE / "upstream" / destination / str(relative), data)
            entries.append({"path": str(relative), "sha256": sha256(data).hexdigest()})
            if relative.parts[:2] == ("multiplay", "skirmish") and relative.suffix in (".js", ".json"):
                put(RUNTIME / str(relative), data)
    return {"file": name, "sha256": sha256(archive.read_bytes()).hexdigest(), "files": entries}


def main():
    inputs = [
        preserve_archive("ratbot-master.zip", "ratbot-master/", "ratbot"),
        preserve_archive("warzone2100AI-main.zip", "warzone2100AI-main/", "wally"),
    ]
    # RatBot's original 3.x compatibility aliases overlap modern engine
    # constants. Supply only aliases absent from the native global object.
    types = RUNTIME / "multiplay/skirmish/ratbot/wztypes.js"
    text = types.read_text(encoding="utf-8")
    for name in ("DROID_CYBORG_CONSTRUCT", "COMP_PROPULSION", "COMP_BODY", "COMP_WEAPON"):
        text, count = re.subn(r"const " + name + r" = (\d+);",
                             lambda match: 'if (typeof ' + name + ' === "undefined") globalThis.' + name + ' = ' + match[1] + ';', text)
        if count != 1:
            raise ValueError("RatBot alias adaptation no longer matches")
    put(types, text)

    # Hard retains the supplied decision cadence. Easier levels genuinely
    # delay periodic decisions, rather than changing only a menu label.
    rat = RUNTIME / "multiplay/skirmish/ratbot/main.js"
    text = rat.read_text(encoding="utf-8")
    text, count = re.subn(r'setTimer\("([A-Za-z]+)", (\d+)\);',
                         lambda match: 'setTimer("' + match[1] + '", mapsRatInterval(' + match[2] + '));', text)
    if count != 13:
        raise ValueError("RatBot timer adaptation no longer matches")
    text += '''
// Maps adapter: retain native timer ownership during save restoration.
function mapsRatInterval(milliseconds) {
    return Math.round(milliseconds * (difficulty === EASY ? 3 : difficulty === MEDIUM ? 1.8 : 1));
}
function eventGameLoaded() {
    // Native save records restore the existing timers. Only reattach methods
    // to serialized RatBot build jobs/groups; never register duplicate timers.
    if (OilTrucks) Object.setPrototypeOf(OilTrucks, RBGroup.prototype);
    BuildJobs.forEach(function (job) {
        Object.setPrototypeOf(job, BuildJob.prototype);
        if (job.Group) Object.setPrototypeOf(job.Group, RBGroup.prototype);
    });
}
'''
    put(rat, text)

    # Reuse the already-adapted Challenge lifecycle, with independent saved
    # cannon/rocket selection and no Challenge config or reward dependencies.
    dumbot = ROOT / "scenario/challenge/stock/dumbot25a"
    for file in (dumbot / "dumb25a").glob("*.js"):
        data = file.read_bytes()
        put(SOURCE / "upstream/dumbot25a/multiplay/skirmish/dumb25a" / file.name, data)
        put(RUNTIME / "multiplay/skirmish/dumb25a" / file.name, data)
    put(SOURCE / "upstream/dumbot25a/multiplay/skirmish/dumb25a.js", (dumbot / "dumb25a.js").read_bytes())
    put(SOURCE / "upstream/dumbot25a/multiplay/skirmish/dumb25a.json", (dumbot / "dumb25a.json").read_bytes())
    entry = (ROOT / "scenario/challenge/ai.js").read_text(encoding="utf-8")
    start = entry.index("// This isolated Challenge context")
    end = entry.index("\nvar dumbSchema", start)
    entry = entry[:start] + '''// Maps chooses one primary weapon plan per bot and retains it in saves.
var mapsDumbWeapon = Math.random() < 0.5 ? "cannon" : "rockets";
argv.schema = mapsDumbWeapon === "cannon" ? argEnum.schema.CANNON : argEnum.schema.ROCKET;
argv.flags = 0;
argv.reserved = 0;
''' + entry[end:]
    old = 'mainList.forEach((i,index)=>setTimer(i.name,500+index+me));'
    if old not in entry:
        raise ValueError("Dumbot timer adapter no longer matches")
    entry = entry.replace(old, 'mainList.forEach((i,index)=>setTimer(i.name,Math.round((500+index+me)*(difficulty===EASY?3:difficulty===MEDIUM?1.8:1))));')
    entry = entry.replace('function eventGameLoaded() { challengeAITimersStarted = true; }', '''function eventGameLoaded() {
    argv.schema = mapsDumbWeapon === "cannon" ? argEnum.schema.CANNON : argEnum.schema.ROCKET;
    dumbSchema = argv.schema;
    challengeAITimersStarted = true;
}''')
    put(RUNTIME / "multiplay/skirmish/maps-dumbot25a.js", entry)
    inputs.append({"source": "scenario/challenge/stock/dumbot25a", "record": "scenario/challenge/DUMBOT.json"})

    # Register each exact entry script and native display name; native saves
    # and FFA telemetry verify these independently of the visible selector.
    for bot in BOTS:
        native = {"AI": {"js": bot["script"].removeprefix("multiplay/skirmish/"), "name": bot["name"],
                         "tip": "Supplied community AI",
                         "easy_tip": "Slower decisions", "medium_tip": "Moderate decision speed", "hard_tip": "Original decision speed"}}
        if bot["id"] == "wally":
            native["AI"].update(easy_tip="15 seconds additional reaction delay", medium_tip="5 seconds additional reaction delay")
        jput(RUNTIME / ("multiplay/skirmish/maps-" + bot["id"] + ".json"), native)

    # Remove the original metadata duplicates; each AI is enumerated once.
    for name in ("ratbot.json", "ratbot_mg.json", "squeedlerbot.json", "wally.json"):
        (RUNTIME / "multiplay/skirmish" / name).unlink()
    files = []
    for file in sorted(RUNTIME.rglob("*")):
        if not file.is_file() or file.suffix not in (".js", ".json"):
            continue
        relative = file.relative_to(RUNTIME).as_posix()
        data = file.read_bytes()
        files.append({"path": "/data/mp/" + relative, "data": base64.b64encode(data).decode("ascii")})
    jput(ASSETS / "files.json", files)
    manifest = {"version": 1, "bots": BOTS, "sources": inputs,
                "runtimeFiles": [{"path": item["path"], "sha256": sha256(base64.b64decode(item["data"])).hexdigest()} for item in files],
                "adaptations": ["RatBot modern-API constant aliases; Easy3x/Medium1.8x/Hard1x periodic decision intervals; native save timer ownership and prototype restoration.",
                                "Dumbot proven Challenge timer lifecycle without Challenge dependencies; saved independent cannon/rocket choice; Easy3x/Medium1.8x/Hard1x decision intervals.",
                                "Wally unmodified, including its native15s/5s/0s difficulty reaction delays."]}
    jput(SOURCE / "manifest.json", manifest)
    jput(ASSETS / "manifest.json", {"version": 1, "bots": BOTS, "adaptations": manifest["adaptations"]})
    notices = '''Additional Maps AI notices

RatBot / RatBot MG / Squeedlerbot: Subsentient. The supplied main.js explicitly
states "RatBot, by Subsentient. Public domain." Original source files and notice
are preserved in scenario/maps-bots/upstream/ratbot. The Maps adapter adjusts
decision timing and native compatibility only; original personalities remain.

Wally: Stefano Brandi, GPL-2.0-or-later. Original AUTHOR and licence files are
preserved with the supplied source. See WALLY-LICENSE.txt and WALLY-AUTHORS.txt.

Dumbot25a: the same user-supplied bot already included in Challenge. Original
source and existing provenance are retained. The supplied archive did not state
an independent licence; do not infer or relabel its licence. See the existing
scenario/challenge/DUMBOT.json source record.

These added bot runtime scripts are installed only for downloaded Maps matches;
the bundled FFA, Challenge and other game modes keep their existing bots.
'''
    put(SOURCE / "NOTICES.txt", notices)
    put(ASSETS / "NOTICES.txt", notices)
    wally_source = SOURCE / "upstream/wally/multiplay/skirmish"
    put(ASSETS / "WALLY-LICENSE.txt", (wally_source / "LICENSE").read_bytes())
    put(ASSETS / "WALLY-AUTHORS.txt", (wally_source / "AUTHORS").read_bytes())
    legal = ROOT / "app/src/main/assets/legal"
    put(legal / "content/MAPS-BOTS-NOTICES.txt", notices)
    put(legal / "content/WALLY-LICENSE.txt", (wally_source / "LICENSE").read_bytes())
    put(legal / "content/WALLY-AUTHORS.txt", (wally_source / "AUTHORS").read_bytes())
    catalogue = json.loads((legal / "catalog.json").read_text(encoding="utf-8"))
    section = {"title": "Additional Maps opponents",
               "body": "Additional opponents retain their original source notices. Wally is by Stefano Brandi under GPL-2.0-or-later. RatBot and its personalities are by Subsentient; the supplied source explicitly dedicates RatBot to the public domain. Dumbot25a retains the existing Challenge source provenance. Original sources and the small native compatibility and difficulty adapters accompany this edition.",
               "links": [],
               "documents": [{"title": "Maps AI notices and adaptations", "path": "content/MAPS-BOTS-NOTICES.txt"},
                             {"title": "Wally — full GPL licence", "path": "content/WALLY-LICENSE.txt"},
                             {"title": "Wally — authors", "path": "content/WALLY-AUTHORS.txt"}]}
    for index, existing in enumerate(catalogue["sections"]):
        if existing["title"] == section["title"]:
            catalogue["sections"][index] = section
            break
    else:
        catalogue["sections"].append(section)
    jput(legal / "catalog.json", catalogue)
    print(json.dumps({"bots": len(BOTS), "files": len(files), "jsonBytes": (ASSETS / "files.json").stat().st_size}))


if __name__ == "__main__":
    main()
